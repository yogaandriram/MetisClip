"""Analyzer Agent: transcript -> viral segments.

1. The transcript is regrouped into numbered sentences (`tools.sentences`), so clip edges are chosen per
   sentence instead of per caption line or per whole second.
2. Scan: the LLM reads the whole video in overlapping ~10-minute parts and proposes candidate clips as
   sentence ranges, scored on a fixed rubric (hook, value, standalone, payoff, shareability, 1-10 each).
3. Rank: one more call shows the best candidates side by side, with context sentences around each. The
   LLM fixes the edges and re-scores them against each other, so scores from different parts compare.
4. Code keeps every clip inside the duration range at sentence edges (never a hard cut mid-sentence),
   applies the intro ban, drops overlaps and keeps the best `max_clips_per_video`.
The Processor then snaps both edges to the clip's own Whisper words (`tools.clip_edges`).
"""
from __future__ import annotations

import logging
import uuid
from typing import Any

from backend.agents.context import JobContext, PipelineError
from backend.agents.tools.sentences import Unit, build_units
from backend.agents.tools.transcript import cache_key, get_transcript
from backend.core import llm
from backend.core.config import config
from backend.core.db import get_db
from backend.core import i18n

M = i18n.messages({
    "analyzing_part": {
        "id": "Menganalisis '{title}' bagian {part}/{parts}…",
        "en": "Analyzing '{title}' part {part}/{parts}…",
    },
    "part_failed": {
        "id": "Bagian {part} gagal dianalisis: {error}",
        "en": "Part {part} couldn't be analyzed: {error}",
    },
    "llm_keeps_failing": {
        "id": "Analisis LLM gagal berulang kali: {error}",
        "en": "The LLM analysis failed repeatedly: {error}",
    },
    "ranking": {
        "id": "Membandingkan dan merapikan {n} kandidat klip…",
        "en": "Comparing and refining {n} clip candidates…",
    },
    "rank_skipped": {
        "id": "Penilaian ulang kandidat dilewati, memakai skor awal: {error}",
        "en": "Re-scoring the candidates was skipped, keeping the first scores: {error}",
    },
    "fetching_transcript": {
        "id": "Mengambil transkrip '{title}'…",
        "en": "Getting the transcript of '{title}'…",
    },
    "resume_hint": {
        "id": "Lalu klik Lanjutkan pada job ini.",
        "en": "Then click Resume on this job.",
    },
    "segments_found": {
        "id": "{n} segmen viral ditemukan",
        "en": "{n} viral segments found",
    },
    "segment_found": {
        "id": "{n} segmen viral ditemukan",
        "en": "{n} viral segment found",
    },
})

logger = logging.getLogger(__name__)

INTRO_BAN_SECONDS = 90.0
CHUNK_SECONDS = 10 * 60
CHUNK_OVERLAP = 60.0            # a moment on a part boundary is seen whole by one of the two parts
CANDIDATES_PER_CHUNK = 4
RANK_MAX_CANDIDATES = 10        # candidates shown side by side in the rank pass
RANK_CONTEXT = 5                # sentences shown before and after each candidate (edges may move there)
DURATION_TOLERANCE = 3.0        # a clip may run this much over the chosen range to end on a full sentence
LEAD_IN = 0.15                  # seconds kept before the first sentence (the Processor refines the edges)
TAIL = 0.25                     # seconds kept after the last sentence

# Rubric weights for viral_score (0-100) from the five 1-10 scores
WEIGHTS = {"hook": 0.25, "value": 0.25, "standalone": 0.20, "payoff": 0.15, "shareability": 0.15}


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


def format_units(units: list[Unit], marked: tuple[int, int] | None = None) -> str:
    lines = []
    for u in units:
        prefix = "" if marked is None else ("> " if marked[0] <= u.id <= marked[1] else "  ")
        lines.append(f"{prefix}[{u.id} {fmt_ts(u.start)}] {u.text}")
    return "\n".join(lines)


def chunk_units(units: list[Unit], chunk_seconds: float = CHUNK_SECONDS,
                overlap: float = CHUNK_OVERLAP) -> list[list[Unit]]:
    """Consecutive parts of about `chunk_seconds`, each starting `overlap` seconds before the previous one ends."""
    if not units:
        return []
    chunks: list[list[Unit]] = []
    begin = units[0].start
    last = units[-1].end
    while True:
        part = [u for u in units if begin <= u.start < begin + chunk_seconds]
        if part:
            chunks.append(part)
        if begin + chunk_seconds >= last:
            break
        begin += chunk_seconds - overlap
    return chunks


def duration(units: list[Unit], i: int, j: int) -> float:
    return units[j].end - units[i].start


def fit_duration(units: list[Unit], i: int, j: int, lo: float, hi: float,
                 tol: float = DURATION_TOLERANCE) -> tuple[int, int]:
    """Sentence range i..j moved so it lasts lo..hi+tol and, when possible, ends on a complete sentence.

    Only whole sentences are added or dropped: a clip is never cut in the middle of one."""
    n = len(units)
    while duration(units, i, j) < lo and j + 1 < n:
        j += 1
    while duration(units, i, j) < lo and i > 0:  # the video ends: grow backwards
        i -= 1
    limit = hi + tol
    if units[j].complete and duration(units, i, j) <= limit:
        return i, j
    fits: list[int] = []
    for k in range(i, n):
        d = duration(units, i, k)
        if d > limit:
            break
        if d >= lo:
            fits.append(k)
    if not fits:  # one sentence longer than the range: the longest end under the limit, else the first
        under = [k for k in range(i, min(n, j + 1)) if duration(units, i, k) <= limit]
        return i, (under[-1] if under else i)
    pool = [k for k in fits if units[k].complete] or fits
    return i, min(pool, key=lambda k: (abs(k - j), -k))


def clip_times(units: list[Unit], i: int, j: int, video_duration: float | None) -> tuple[float, float]:
    start = max(0.0, units[i].start - LEAD_IN)
    end = units[j].end + TAIL
    if video_duration and video_duration > 0:
        end = min(end, float(video_duration))
    return round(start, 2), round(end, 2)


def score_of(raw: dict[str, Any]) -> tuple[int, dict[str, float]]:
    """viral_score 0-100 from the rubric scores (1-10 each); falls back to a bare viral_score, then 50."""
    scores: dict[str, float] = {}
    for key in WEIGHTS:
        try:
            scores[key] = max(1.0, min(10.0, float(raw.get(key))))
        except (TypeError, ValueError):
            continue
    if len(scores) >= 3:
        weight = sum(WEIGHTS[k] for k in scores)
        return round(10 * sum(WEIGHTS[k] * v for k, v in scores.items()) / weight), scores
    try:
        return max(0, min(100, int(float(raw.get("viral_score"))))), {}
    except (TypeError, ValueError):
        return 50, {}


def _int(value: Any) -> int | None:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


RUBRIC = (
    "Score with integers from 1 to 10:\n"
    "- hook: do the first ~3 seconds make a scrolling viewer stop (tension, surprise, a bold claim, a question)?\n"
    "- value: how strong is the content: insight, a practical tip, a story, humor, emotion, controversy?\n"
    "- standalone: does it make full sense to someone who has not seen the rest of the video?\n"
    "- payoff: does it end on a satisfying landing (conclusion, punchline, answer) rather than trailing off?\n"
    "- shareability: would people comment on it, save it, or send it to a friend?\n"
    "Use the whole scale: 3 = weak, 5 = decent but forgettable, 7 = strong, most viewers watch to the end, "
    "9-10 = rare, would stop almost anyone. Most clips land between 4 and 7. A high score must be earned.\n"
)


def _edge_rules(lo: float, hi: float) -> str:
    return (
        "Edges matter most: a clip that starts or ends mid-thought is useless.\n"
        "- start_id is the sentence where the thought begins. A viewer who missed what came before must "
        "understand it. Never start on a reaction (\"iya\", \"betul\", \"nah itu dia\"), on an answer to a "
        "question that is not in the clip, or on a reference to earlier talk (\"yang tadi\", \"seperti yang "
        "gua bilang\"). Start on the strongest line you can (a bold claim, a question, a story opener) and "
        "skip warm-up.\n"
        "- end_id is the sentence where the point lands: the conclusion, punchline, answer or lesson. Never "
        "stop before it, and stop before the talk moves on to something else.\n"
        f"- Length: from the start of start_id to the start of the sentence after end_id, {lo:g} to {hi:g} seconds.\n"
        "Automatic captions may lack punctuation, so judge where sentences end by their meaning as well.\n"
    )


def scan_prompt(lo: float, hi: float, n: int = CANDIDATES_PER_CHUNK) -> str:
    return (
        "You pick moments from a long video (podcast, interview, talk) to cut into vertical short clips "
        "for TikTok, Instagram Reels and YouTube Shorts, mostly watched by an Indonesian audience.\n\n"
        "The transcript part below is split into numbered sentences: \"[id mm:ss] text\". The time is when "
        "the sentence starts; it lasts until the next sentence starts.\n\n"
        f"Pick up to {n} clips that do not overlap. A clip is a run of consecutive sentences, start_id to "
        "end_id inclusive.\n\n"
        + _edge_rules(lo, hi)
        + "- Never start before 01:30 (the intro).\n\n"
        + RUBRIC
        + "\nIf nothing in this part deserves a clip (small talk, intro, a sponsor read, logistics), return an "
        "empty list. Do not force clips.\n"
        "Write hook_text (a short, punchy title, max 60 characters) and rationale (one or two sentences on "
        "why it works) in the language of the transcript.\n\n"
        "Output exactly one JSON object and nothing else:\n"
        '{"clips": [{"start_id": 0, "end_id": 0, "hook": 0, "value": 0, "standalone": 0, "payoff": 0, '
        '"shareability": 0, "hook_text": "...", "tags": ["..."], "rationale": "..."}]}'
    )


def rank_prompt(lo: float, hi: float) -> str:
    return (
        "You are the final editor of short vertical clips (TikTok, Reels, Shorts; mostly an Indonesian "
        "audience) cut from one long video. Below are the candidate clips. Each shows its sentences marked "
        "with \">\" and a few sentences of context before and after, as \"[id mm:ss] text\" (the time is when "
        "the sentence starts).\n\n"
        "For every candidate:\n"
        "1. Fix its edges. You may move start_id and end_id to any sentence shown for that candidate.\n"
        + _edge_rules(lo, hi)
        + "2. Score it again, comparing the candidates with each other. Spread the scores: the best candidate "
        "must clearly outscore an average one.\n"
        + RUBRIC
        + "3. Improve hook_text if a better title fits (max 60 characters, language of the transcript).\n\n"
        "Return every candidate exactly once. Output exactly one JSON object and nothing else:\n"
        '{"clips": [{"candidate": 1, "start_id": 0, "end_id": 0, "hook": 0, "value": 0, "standalone": 0, '
        '"payoff": 0, "shareability": 0, "hook_text": "...", "rationale": "..."}]}'
    )


def segment_id(job_id: str, source: str, start: float, end: float) -> str:
    """Deterministic clip id (uuid5 of job, source video, start, end) so a resumed job never duplicates clips.

    `source` is the YouTube id, or the source video document id for an uploaded file."""
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"metisclip:{job_id}:{source}:{start:.2f}:{end:.2f}"))


MOCK_SEGMENTS = [
    {"start": 13.0, "end": 58.0, "hook_text": "[DEV] Rahasia Gelap AI yang Tidak Anda Ketahui!",
     "tags": ["controversial", "tech-future"], "viral_score": 96},
    {"start": 58.0, "end": 81.0, "hook_text": "[DEV] AI Kini Makin Gila!", "tags": ["mind-blowing"], "viral_score": 85},
]


def _overlaps(a: dict[str, Any], b: dict[str, Any], min_ratio: float = 0.0) -> bool:
    shared = min(a["j"], b["j"]) - max(a["i"], b["i"]) + 1
    if shared <= 0:
        return False
    shorter = min(a["j"] - a["i"], b["j"] - b["i"]) + 1
    return shared / shorter > min_ratio


def _candidate(raw: dict[str, Any], units: list[Unit], lo: float, hi: float,
               allowed: tuple[int, int]) -> dict[str, Any] | None:
    """A validated LLM proposal: sentence range inside `allowed`, fitted to the duration range."""
    i, j = _int(raw.get("start_id")), _int(raw.get("end_id"))
    if i is None or j is None:
        return None
    i, j = max(i, allowed[0]), min(j, allowed[1])
    if j < i:
        return None
    i, j = fit_duration(units, i, j, lo, hi)
    if units[i].start < INTRO_BAN_SECONDS:
        logger.info("Intro ban: rejected a clip starting at %.0fs", units[i].start)
        return None
    score, scores = score_of(raw)
    tags = raw.get("tags") if isinstance(raw.get("tags"), list) else []
    return {
        "i": i, "j": j, "viral_score": score, "scores": scores,
        "hook_text": str(raw.get("hook_text") or "")[:120],
        "tags": [str(t)[:40] for t in tags][:10],
        "rationale": str(raw.get("rationale") or "")[:1000],
    }


def _scan(ctx: JobContext, title: str, units: list[Unit], lo: float, hi: float) -> list[dict[str, Any]]:
    chunks = chunk_units(units)
    found: list[dict[str, Any]] = []
    failures = 0
    for k, chunk in enumerate(chunks):
        ctx.check()
        ctx.progress(message=M("analyzing_part", title=title[:40], part=k + 1, parts=len(chunks)))
        try:
            res = llm.chat_json(
                scan_prompt(lo, hi),
                f"Video title: {title}\n\nTranscript part {k + 1}/{len(chunks)}:\n{format_units(chunk)}",
                temperature=0.2, max_tokens=3000,  # reasoning models spend part of it thinking
                on_retry=lambda m: ctx.progress(message=m), should_stop=lambda: ctx.cancel.cancelled,
            )
        except (llm.LLMNotConfigured, llm.LLMQuotaExhausted):
            raise  # the next parts would fail the same way
        except llm.LLMError as exc:
            failures += 1
            ctx.error("analysis", M("part_failed", part=k + 1, error=exc))
            if failures >= 3 and failures == k + 1:
                raise PipelineError(M("llm_keeps_failing", error=exc)) from exc
            continue
        allowed = (chunk[0].id, min(len(units) - 1, chunk[-1].id + 3))  # the end may run a little past the part
        for raw in res.get("clips") or res.get("segments") or []:
            if isinstance(raw, dict) and (cand := _candidate(raw, units, lo, hi, allowed)):
                # Neighbouring parts overlap, so the same moment can come back twice: keep the better one
                twin = next((c for c in found if _overlaps(c, cand, 0.5)), None)
                if twin is None:
                    found.append(cand)
                elif cand["viral_score"] > twin["viral_score"]:
                    found[found.index(twin)] = cand
    return found


def _rank(ctx: JobContext, title: str, units: list[Unit], cands: list[dict[str, Any]],
          lo: float, hi: float) -> list[dict[str, Any]]:
    """One side-by-side pass: better edges and comparable scores. Keeps the scan results on any failure."""
    if len(cands) < 2:
        return cands
    ctx.check()
    ctx.progress(message=M("ranking", n=len(cands)))
    windows: list[tuple[int, int]] = []
    blocks: list[str] = []
    for n, c in enumerate(cands, 1):
        w = (max(0, c["i"] - RANK_CONTEXT), min(len(units) - 1, c["j"] + RANK_CONTEXT))
        windows.append(w)
        blocks.append(f"Candidate {n} (now {c['i']}-{c['j']}, {duration(units, c['i'], c['j']):.0f} s)\n"
                      + format_units(units[w[0]:w[1] + 1], marked=(c["i"], c["j"])))
    try:
        res = llm.chat_json(
            rank_prompt(lo, hi),
            f"Video title: {title}\n\n" + "\n\n".join(blocks),
            temperature=0.2, max_tokens=5000,
            on_retry=lambda m: ctx.progress(message=m), should_stop=lambda: ctx.cancel.cancelled,
        )
    except llm.LLMError as exc:  # quota, network, refusal: the scan results stand on their own
        ctx.error("analysis", M("rank_skipped", error=exc))
        return cands
    ranked = list(cands)
    for raw in res.get("clips") or []:
        n = _int(raw.get("candidate")) if isinstance(raw, dict) else None
        if n is None or not 1 <= n <= len(cands):
            continue
        old = cands[n - 1]
        base = {"start_id": old["i"], "end_id": old["j"], "viral_score": old["viral_score"], **old["scores"],
                "hook_text": old["hook_text"], "tags": old["tags"], "rationale": old["rationale"]}
        update = {k: v for k, v in raw.items() if v not in (None, "", [])}
        # An edit that breaks a rule (e.g. moves into the intro) leaves the candidate as the scan found it
        if cand := _candidate({**base, **update}, units, lo, hi, windows[n - 1]):
            ranked[n - 1] = cand
    return ranked


def _mock(units: list[Unit], lo: float, hi: float) -> list[dict[str, Any]]:
    out = []
    for m in MOCK_SEGMENTS:
        inside = [u.id for u in units if m["start"] - 0.5 <= u.start <= m["end"]]
        if inside:
            i, j = fit_duration(units, inside[0], inside[-1], lo, hi)
            out.append({"i": i, "j": j, "viral_score": m["viral_score"], "scores": {}, "hook_text": m["hook_text"],
                        "tags": m["tags"], "rationale": "Dev mock segment"})
    return out


def _analyze_video(ctx: JobContext, video: dict[str, Any], lo: float, hi: float, per_video: int,
                   transcript: list[dict[str, Any]], use_llm: bool) -> list[dict[str, Any]]:
    title = video.get("title") or video.get("youtube_id") or "video"
    units = build_units(transcript)
    if not units:
        return []
    if use_llm:
        cands = _scan(ctx, title, units, lo, hi)
        cands.sort(key=lambda c: c["viral_score"], reverse=True)
        # The best candidates are compared side by side; the rest (only kept when max clips is 0) keep their scan score
        cands = _rank(ctx, title, units, cands[:RANK_MAX_CANDIDATES], lo, hi) + cands[RANK_MAX_CANDIDATES:]
    else:
        cands = _mock(units, lo, hi)

    # Best first; a clip never overlaps a better one
    cands.sort(key=lambda c: c["viral_score"], reverse=True)
    kept: list[dict[str, Any]] = []
    for c in cands:
        if not any(_overlaps(c, k) for k in kept):
            kept.append(c)
    if per_video > 0:
        kept = kept[:per_video]

    out: list[dict[str, Any]] = []
    for c in kept:
        start, end = clip_times(units, c["i"], c["j"], video.get("duration_seconds"))
        if end - start < 5:
            continue
        logger.info("Clip %s-%s score %s %s", fmt_ts(start), fmt_ts(end), c["viral_score"], c["scores"])
        out.append({
            "segment_id": segment_id(ctx.id, video.get("youtube_id") or video["_id"], start, end),
            "source_video_id": video["_id"],
            "youtube_id": video.get("youtube_id"),
            "file_path": video.get("file_path"),
            "transcript_key": cache_key(video),
            "start_time": start,
            "end_time": end,
            "duration_seconds": round(end - start, 2),
            "viral_score": c["viral_score"],
            "hook_text": c["hook_text"],
            "tags": c["tags"],
            "rationale": c["rationale"],
        })
    return out


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
        ctx.progress(base, step="analysis", message=M("fetching_transcript", title=(video.get("title") or "")[:40]))
        db.source_videos.update_one({"_id": video["_id"]}, {"$set": {"status": "analyzing"}})
        try:
            transcript = get_transcript(video, ctx.cancel, on_status=lambda m: ctx.progress(message=m))
            found = _analyze_video(ctx, video, lo, hi, per_video, transcript, use_llm)
        except (PipelineError, llm.LLMNotConfigured, llm.LLMQuotaExhausted) as exc:
            db.source_videos.update_one({"_id": video["_id"]}, {"$set": {"status": "failed"}})
            if isinstance(exc, llm.LLMQuotaExhausted):
                # Stop the job: the other videos would hit the same quota. The transcript is cached.
                raise PipelineError(exc.message(M("resume_hint"))) from exc
            if isinstance(exc, llm.LLMNotConfigured) or len(videos) == 1:
                raise PipelineError(str(exc)) from exc
            ctx.error("analysis", str(exc))
            continue
        db.source_videos.update_one({"_id": video["_id"]}, {"$set": {"status": "completed"}})
        segments.extend(found)

    segments.sort(key=lambda s: s["viral_score"], reverse=True)
    if max_total > 0:
        segments = segments[:max_total]
    ctx.progress(40, step="analysis", total_scenes=len(segments),
                 message=M("segment_found" if len(segments) == 1 else "segments_found", n=len(segments)))
    return segments
