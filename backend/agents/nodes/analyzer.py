"""Analyzer Agent: transcript -> viral segments (LLM in JSON mode + Critic pass)."""
from __future__ import annotations

import logging
import uuid
from typing import Any

from backend.agents.context import JobContext, PipelineError
from backend.agents.tools.transcript import get_transcript
from backend.core import llm
from backend.core.config import config
from backend.core.db import get_db

logger = logging.getLogger(__name__)

INTRO_BAN_SECONDS = 90.0
CHUNK_SECONDS = 10 * 60
CRITIC_MAX_SHIFT = 30.0


def parse_duration_range(value: str) -> tuple[float, float]:
    try:
        lo, hi = (float(x) for x in str(value).split("-", 1))
        if 0 < lo < hi:
            return lo, hi
    except Exception:
        pass
    return 45.0, 60.0


def ts_to_seconds(value: Any) -> float | None:
    """'MM:SS', 'HH:MM:SS', '754', 754.0 -> seconds."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip()
    if not s:
        return None
    try:
        parts = [float(p) for p in s.split(":")]
    except ValueError:
        return None
    if len(parts) == 1:
        return parts[0]
    if len(parts) == 2:
        return parts[0] * 60 + parts[1]
    if len(parts) == 3:
        return parts[0] * 3600 + parts[1] * 60 + parts[2]
    return None


def fmt_ts(seconds: float) -> str:
    seconds = int(seconds)
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"


def format_transcript(entries: list[dict[str, Any]]) -> str:
    return "\n".join(f"[{fmt_ts(e['start'])}] {e['text']}" for e in entries)


def chunk_transcript(transcript: list[dict[str, Any]], chunk_seconds: float = CHUNK_SECONDS) -> list[list[dict[str, Any]]]:
    chunks: list[list[dict[str, Any]]] = []
    current: list[dict[str, Any]] = []
    elapsed = 0.0
    for e in transcript:
        current.append(e)
        elapsed += float(e.get("duration", 0) or 0)
        if elapsed >= chunk_seconds:
            chunks.append(current)
            current, elapsed = [], 0.0
    if current:
        chunks.append(current)
    return chunks


def scoring_prompt(lo: float, hi: float) -> str:
    return (
        "You are a 10-year experienced viral media growth specialist and expert editor.\n"
        "Your task is to scan the following video transcript chunk and locate the exact timestamps "
        "of segments with the highest potential to go viral as short-form vertical video.\n\n"
        "CRITICAL INSTRUCTION 1 (ABSOLUTELY NO INTROS): It is ABSOLUTELY FORBIDDEN to select any clips that start "
        "within the first 90 seconds of the video. The intro is boring and must be skipped.\n\n"
        f"CRITICAL INSTRUCTION 2 (DURATION & COMPLETE SENTENCES): The length of each segment MUST be STRICTLY between {lo:g} and {hi:g} seconds. "
        "The segment MUST start at the beginning of a sentence and end exactly at a punctuation mark (., ?, !). "
        "Do not cut off sentences mid-way. If needed, expand the segment to finish the sentence.\n\n"
        "CRITICAL INSTRUCTION 3 (VIRALITY & SKIPPING BORING CHUNKS): You must ONLY extract segments with extremely high engaging "
        "potential (arguments, high emotion, shocking facts). If the entire transcript chunk is boring, generic introduction, "
        "or sponsor reads, YOU MUST RETURN AN EMPTY ARRAY. Do not force a clip if there is none.\n\n"
        "Evaluate segments on:\n"
        "1. Hook Strength (first 3 seconds grab immediate attention)\n"
        "2. Emotional Intensity (shock, controversy, extreme value, laughter, or deep inspiration)\n"
        "3. Standalone Clarity (the clip makes full sense without context)\n"
        "4. Shareability (relatable or controversial, likely to be reposted)\n\n"
        "Write hook_text and rationale in the same language as the transcript.\n"
        "Output EXACTLY one valid JSON object, no other text:\n"
        "{\n"
        '  "segments": [\n'
        "    {\n"
        '      "start_time": "MM:SS or HH:MM:SS",\n'
        '      "end_time": "MM:SS or HH:MM:SS",\n'
        '      "viral_score": 0-100 (integer),\n'
        '      "hook_text": "short, punchy viral title for this clip (max 60 characters)",\n'
        '      "tags": ["controversial", "inspirational", "humor"],\n'
        '      "rationale": "why this clip has huge virality potential"\n'
        "    }\n"
        "  ]\n"
        "}"
    )


def critic_prompt(lo: float, hi: float, start: float, end: float) -> str:
    return (
        "You are an AI Video Editor Critic. A previous AI proposed a video clip from the transcript below.\n"
        "Fix two things:\n"
        "1. The clip must NOT start or end in the middle of a sentence. Expand timestamps to include the full sentence if needed.\n"
        f"2. The total duration must be STRICTLY between {lo:g} and {hi:g} seconds. If it is too short, expand end_time forward "
        f"until the duration reaches at least {lo:g} seconds.\n\n"
        f"Proposed Start: {fmt_ts(start)}, Proposed End: {fmt_ts(end)}\n\n"
        'Output EXACTLY one valid JSON object: {"start_time": "MM:SS", "end_time": "MM:SS"}'
    )


def apply_critic(start: float, end: float, critic: dict[str, Any]) -> tuple[float, float]:
    """Accept the critic's boundaries only when both edges move less than 30 s."""
    ns, ne = ts_to_seconds(critic.get("start_time")), ts_to_seconds(critic.get("end_time"))
    if ns is None or ne is None or ne <= ns:
        return start, end
    if abs(ns - start) < CRITIC_MAX_SHIFT and abs(ne - end) < CRITIC_MAX_SHIFT:
        return ns, ne
    return start, end


def enforce_duration(start: float, end: float, lo: float, hi: float, transcript: list[dict[str, Any]],
                     video_duration: float | None = None) -> tuple[float, float]:
    """Expand to sentence ends until >= lo, trim when absurdly long, clamp to the video length."""
    if end - start < lo:
        target = start + lo
        last_end = end
        for e in transcript:
            e_end = float(e["start"]) + float(e.get("duration", 2.0) or 2.0)
            if e_end <= end:
                continue
            last_end = max(last_end, e_end)
            if last_end >= target:
                break
        end = max(last_end, target) if last_end < target else last_end
    if end - start > hi + 30:
        end = start + hi
    if video_duration and video_duration > 0:
        end = min(end, video_duration)
    return round(start, 2), round(end, 2)


def segment_id(job_id: str, youtube_id: str, start: float, end: float) -> str:
    """Deterministic clip id (uuid5) so a resumed job never duplicates clips."""
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"metisclip:{job_id}:{youtube_id}:{start:.2f}:{end:.2f}"))


MOCK_SEGMENTS = [
    {"start_time": "00:13", "end_time": "00:58", "viral_score": 96, "hook_text": "[DEV] Rahasia Gelap AI yang Tidak Anda Ketahui!",
     "tags": ["controversial", "tech-future"], "rationale": "Dev mock segment"},
    {"start_time": "00:58", "end_time": "01:21", "viral_score": 85, "hook_text": "[DEV] AI Kini Makin Gila!",
     "tags": ["mind-blowing"], "rationale": "Dev mock segment"},
]


def _analyze_video(ctx: JobContext, video: dict[str, Any], lo: float, hi: float, per_video: int,
                   transcript: list[dict[str, Any]], use_llm: bool) -> list[dict[str, Any]]:
    title = video.get("title") or video["youtube_id"]
    proposals: list[dict[str, Any]] = []
    if use_llm:
        chunks = chunk_transcript(transcript)
        failures = 0
        for i, chunk in enumerate(chunks):
            ctx.check()
            ctx.progress(message=f"Menganalisis '{title[:40]}' bagian {i + 1}/{len(chunks)}…")
            try:
                res = llm.chat_json(
                    scoring_prompt(lo, hi),
                    f"Video Title: {title}\n\nTranscript Chunk:\n{format_transcript(chunk)}",
                    temperature=0.2, max_tokens=2000,
                    on_retry=lambda m: ctx.progress(message=m), should_stop=lambda: ctx.cancel.cancelled,
                )
            except llm.LLMNotConfigured:
                raise
            except llm.LLMError as exc:
                failures += 1
                ctx.error("analysis", f"Bagian {i + 1} gagal dianalisis: {exc}")
                if failures >= 3 and failures == i + 1:
                    raise PipelineError(f"Analisis LLM gagal berulang kali: {exc}") from exc
                continue
            for seg in res.get("segments") or []:
                if not isinstance(seg, dict):
                    continue
                s = ts_to_seconds(seg.get("start_time"))
                e = ts_to_seconds(seg.get("end_time"))
                if s is None or e is None or e <= s:
                    continue
                if s < INTRO_BAN_SECONDS:
                    logger.info("Intro ban: rejected segment starting at %.0fs", s)
                    continue
                proposals.append({**seg, "_start": s, "_end": e})
            if per_video > 0 and len(proposals) >= per_video:
                break
    else:
        for seg in MOCK_SEGMENTS:
            proposals.append({**seg, "_start": ts_to_seconds(seg["start_time"]), "_end": ts_to_seconds(seg["end_time"])})

    out: list[dict[str, Any]] = []
    for seg in proposals:
        ctx.check()
        start, end = float(seg["_start"]), float(seg["_end"])
        if use_llm:
            context_entries = [e for e in transcript if start - 30 <= e["start"] <= end + hi + 30]
            try:
                critic = llm.chat_json(
                    critic_prompt(lo, hi, start, end),
                    f"Transcript Context:\n{format_transcript(context_entries)}",
                    temperature=0.1, max_tokens=200, retries=1,
                    should_stop=lambda: ctx.cancel.cancelled,
                )
                start, end = apply_critic(start, end, critic)
            except llm.LLMError as exc:
                logger.info("Critic pass skipped: %s", exc)
        start, end = enforce_duration(start, end, lo, hi, transcript, video.get("duration_seconds"))
        if end - start < 5:
            continue
        try:
            score = int(float(seg.get("viral_score", 70)))
        except (TypeError, ValueError):
            score = 70
        tags = seg.get("tags") if isinstance(seg.get("tags"), list) else []
        out.append({
            "segment_id": segment_id(ctx.id, video["youtube_id"], start, end),
            "source_video_id": video["_id"],
            "youtube_id": video["youtube_id"],
            "start_time": start,
            "end_time": end,
            "duration_seconds": round(end - start, 2),
            "viral_score": max(0, min(100, score)),
            "hook_text": str(seg.get("hook_text") or "")[:120],
            "tags": [str(t)[:40] for t in tags][:10],
            "rationale": str(seg.get("rationale") or "")[:1000],
        })
    # Drop overlapping duplicates, keep the higher score
    out.sort(key=lambda x: x["viral_score"], reverse=True)
    kept: list[dict[str, Any]] = []
    for seg in out:
        if any(seg["start_time"] < k["end_time"] and k["start_time"] < seg["end_time"] for k in kept):
            continue
        kept.append(seg)
    return kept


def run(ctx: JobContext, videos: list[dict[str, Any]]) -> list[dict[str, Any]]:
    cfg = ctx.config
    lo, hi = parse_duration_range(cfg.get("clip_duration", "45-60"))
    max_total = int(cfg.get("max_clips", cfg.get("max_clips_per_video", 3)) or 0)
    per_video = int(cfg.get("max_clips_per_video", max_total) or 0)

    use_llm = llm.is_configured()
    if not use_llm and not config.is_dev:
        try:
            llm.target()
        except llm.LLMError as exc:  # the actionable message (which key or setting is missing)
            raise PipelineError(str(exc)) from exc

    db = get_db()
    segments: list[dict[str, Any]] = []
    for i, video in enumerate(videos):
        ctx.check()
        base = 15 + 25 * i / max(1, len(videos))
        ctx.progress(base, step="analysis", message=f"Mengambil transkrip '{(video.get('title') or '')[:40]}'…")
        db.source_videos.update_one({"_id": video["_id"]}, {"$set": {"status": "analyzing"}})
        try:
            transcript = get_transcript(video["youtube_id"], ctx.cancel, on_status=lambda m: ctx.progress(message=m))
            found = _analyze_video(ctx, video, lo, hi, per_video, transcript, use_llm)
        except (PipelineError, llm.LLMNotConfigured) as exc:
            db.source_videos.update_one({"_id": video["_id"]}, {"$set": {"status": "failed"}})
            if isinstance(exc, llm.LLMNotConfigured) or len(videos) == 1:
                raise PipelineError(str(exc)) from exc
            ctx.error("analysis", str(exc))
            continue
        db.source_videos.update_one({"_id": video["_id"]}, {"$set": {"status": "completed"}})
        segments.extend(found)

    segments.sort(key=lambda s: s["viral_score"], reverse=True)
    if max_total > 0:
        segments = segments[:max_total]
    ctx.progress(40, step="analysis", total_scenes=len(segments), message=f"{len(segments)} segmen viral ditemukan")
    return segments
