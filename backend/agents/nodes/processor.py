"""Processor Agent: per segment download (or cut) with a margin -> Whisper -> trim at sentence edges ->
smart crop -> 1080x1920 -> thumbnail -> clip.

Each segment uses its OWN source: a YouTube section download (its own youtube_id, fixes K1) or a
frame-accurate cut of the uploaded video file. Clip ids are deterministic
(uuid5 of job, video, start, end) and written with an upsert, so resuming never
duplicates clips. Files go to <DATA_ROOT>\\library\\<agent>\\<clip_id>\\.
"""
from __future__ import annotations

import logging
import shutil
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

from backend.agents.context import JobContext, PipelineError
from backend.agents.tools import caption_ai, clip_edges, ffmpeg_ops, whisper, ytdlp
from backend.agents.tools.smart_crop import process_auto_tracking_video
from backend.agents.tools.transcript import cached as cached_transcript
from backend.core import events, llm, resources
from backend.core.db import get_db, utcnow
from backend.core.paths import get_paths
from backend.core.procs import Cancelled
from backend.models.documents import ClipDoc
from backend.services import brand_templates, layout
from backend.core import i18n

M = i18n.messages({
    "whisper_failed": {
        "id": "Whisper gagal untuk klip {start}s, memakai transkrip: {error}",
        "en": "Whisper failed for the clip at {start}s, using the transcript: {error}",
    },
    "ai_marks_skipped": {
        "id": "Sorot kata kunci/emoji AI dilewati: {error}",
        "en": "AI keyword/emoji marks were skipped: {error}",
    },
    "tracking_failed": {
        "id": "Face tracking gagal untuk klip {start}s, memakai center crop",
        "en": "Face tracking failed for the clip at {start}s, using a center crop",
    },
    "processing": {
        "id": "Memproses {n} klip…",
        "en": "Processing {n} clips…",
    },
    "processing_one": {
        "id": "Memproses {n} klip…",
        "en": "Processing {n} clip…",
    },
    "file_missing": {
        "id": "File video tidak ditemukan: {path}. Kembalikan file ke lokasi itu, lalu lanjutkan job ini.",
        "en": "Video file not found: {path}. Put the file back in that place, then resume this job.",
    },
    "hold_label": {
        "id": "Klip {start}s",
        "en": "Clip {start}s",
    },
    "clip_failed": {
        "id": "Klip {start}–{end}s ({source}) gagal: {error}",
        "en": "Clip {start}–{end}s ({source}) failed: {error}",
    },
    "clip_done": {
        "id": "Klip {done}/{total} selesai",
        "en": "Clip {done}/{total} done",
    },
    "none_processed": {
        "id": "Tidak ada klip yang berhasil diproses",
        "en": "No clip could be processed",
    },
})

logger = logging.getLogger(__name__)


def _source_label(seg: dict[str, Any]) -> str:
    return Path(seg["file_path"]).name if seg.get("file_path") else str(seg.get("youtube_id"))


def _transcript_key(seg: dict[str, Any]) -> str:
    # Segments checkpointed before uploads existed carry only the YouTube id
    return seg.get("transcript_key") or f"yt:{seg['youtube_id']}"


def words_from_transcript(transcript_key: str, start: float, end: float) -> list[dict[str, Any]]:
    """Approximate word timings from the cached transcript (used when Whisper is unavailable)."""
    segs = cached_transcript(transcript_key) or []
    words: list[dict[str, Any]] = []
    for e in segs:
        s = float(e["start"])
        d = float(e.get("duration", 0) or 0)
        if s + d <= start or s >= end:
            continue
        words.extend(whisper.split_evenly(e["text"], max(0.0, s - start), max(0.0, min(end, s + d) - start)))
    return words


def mock_words(text: str, duration: float) -> list[dict[str, Any]]:
    tokens = text.split() or ["MetisClip"]
    step = min(0.5, duration / max(1, len(tokens)))
    return [{"word": t.strip(".,!?\"'"), "start": round(i * (step + 0.05), 2), "end": round(i * (step + 0.05) + step, 2)}
            for i, t in enumerate(tokens)]


def _fetch(ctx: JobContext, seg: dict[str, Any], start: float, end: float, out: Path) -> Path:
    if seg.get("file_path"):
        return ffmpeg_ops.cut_section(Path(seg["file_path"]), start, end, out, ctx.cancel)
    return ytdlp.download_section(seg["youtube_id"], start, end, out, ctx.cancel)


def _source(ctx: JobContext, seg: dict[str, Any], work: Path) -> tuple[Path, list[dict[str, Any]] | None, float, float]:
    """The clip's source video, its Whisper words (None without them) and its final edges in the video.

    With Whisper, the clip is fetched with `clip_edges.EDGE_MARGIN` extra seconds on both sides and
    transcribed; both edges then move to the nearest sentence boundary in those words, and the clip is
    trimmed there. The same words become the subtitles, so Whisper runs once per clip."""
    start, end = float(seg["start_time"]), float(seg["end_time"])
    if not whisper.available():
        return _fetch(ctx, seg, start, end, work / "src.mp4"), None, start, end
    margin = clip_edges.EDGE_MARGIN
    pad_start = max(0.0, start - margin)
    padded = _fetch(ctx, seg, pad_start, end + margin, work / "padded.mp4")
    ctx.check()
    total = ffmpeg_ops.probe_duration(padded) or (end + margin - pad_start)
    t0, t1 = start - pad_start, min(end - pad_start, total)
    payload: dict[str, Any] | None = None
    words: list[dict[str, Any]] = []
    try:
        audio = ffmpeg_ops.extract_audio_mp3(padded, work / "audio.mp3", ctx.cancel)
        payload = whisper.transcribe(audio, words=True, cancel=ctx.cancel)
        words = whisper.words_from_payload(payload)
    except Cancelled:
        raise
    except Exception as exc:
        ctx.error("processing", M("whisper_failed", start=f"{start:.0f}", error=exc))
    a, b = clip_edges.snap(words, payload, t0, t1, total) or (t0, t1)
    ctx.check()
    if seg.get("file_path"):  # cut once more from the original file rather than re-encoding the padded cut
        src = ffmpeg_ops.cut_section(Path(seg["file_path"]), pad_start + a, pad_start + b, work / "src.mp4", ctx.cancel)
    else:
        src = ffmpeg_ops.cut_section(padded, a, b, work / "src.mp4", ctx.cancel)
    clip_words = clip_edges.shift_words(words, a, b - a) or None
    return src, clip_words, round(pad_start + a, 2), round(pad_start + b, 2)


def _ai_marks(ctx: JobContext, words: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Brand template AI subtitle settings: keywords / emojis (one LLM call). Never fails the clip."""
    from backend.services.render import effective_ai

    ai = effective_ai(None, brand_templates.for_agent(ctx.agent) or {})
    if not words or not (ai["keywords"] or ai["emojis"]):
        return words
    try:
        marked, _, _ = caption_ai.enrich_words(
            words, keywords=ai["keywords"], emojis=ai["emojis"], should_stop=lambda: ctx.cancel.cancelled
        )
        return marked
    except llm.LLMError as exc:
        ctx.error("processing", M("ai_marks_skipped", error=exc))
        return words


def process_segment(ctx: JobContext, seg: dict[str, Any]) -> dict[str, Any]:
    clip_id = seg["segment_id"]
    paths = get_paths()
    work = ctx.cache_dir / clip_id
    work.mkdir(parents=True, exist_ok=True)
    out_dir = paths.clip_dir(ctx.agent_slug, clip_id)
    out_dir.mkdir(parents=True, exist_ok=True)
    raw = out_dir / "raw.mp4"
    thumb = out_dir / "thumb.jpg"
    try:
        return _process(ctx, seg, clip_id, work, raw, thumb)
    except BaseException:
        # Never leave half-written media behind for a clip that has no document
        if not get_db().clips.find_one({"_id": clip_id}, {"_id": 1}):
            shutil.rmtree(out_dir, ignore_errors=True)
        raise


def _process(ctx: JobContext, seg: dict[str, Any], clip_id: str, work: Path, raw: Path, thumb: Path) -> dict[str, Any]:
    paths = get_paths()
    try:
        src, words, start, end = _source(ctx, seg, work)
        ctx.check()
        tracked = work / "tracked.mp4"
        faces_tmp = work / "faces.json"
        if process_auto_tracking_video(str(src), str(tracked), ctx.cancel, faces_out=faces_tmp):
            ffmpeg_ops.finish_vertical(tracked, src, raw, ctx.cancel)
        else:
            ctx.error("processing", M("tracking_failed", start=f"{seg['start_time']:.0f}"))
            ffmpeg_ops.center_crop_vertical(src, raw, ctx.cancel)
        ctx.check()
        duration = ffmpeg_ops.probe_duration(raw) or (end - start)
        ffmpeg_ops.thumbnail(raw, thumb, duration / 2, ctx.cancel)
        # Keep the original-ratio cut next to raw.mp4 (same timeline) for the podcast layout
        source = raw.parent / "source.mp4"
        shutil.move(str(src), str(source))
        source_info = layout.source_fields(source)
        # The face scan (same timeline as source.mp4) for layouts that crop at render time
        faces_file = raw.parent / "faces.json"
        if faces_tmp.is_file():
            shutil.move(str(faces_tmp), str(faces_file))
        if words is None:
            words = (words_from_transcript(_transcript_key(seg), start, end)
                     or mock_words(seg.get("hook_text") or "", end - start))
    finally:
        shutil.rmtree(work, ignore_errors=True)
    ctx.check()
    words = _ai_marks(ctx, words)

    now = utcnow()
    doc = ClipDoc(
        _id=clip_id,
        agent_id=ctx.agent_id,
        job_id=ctx.id,
        source_video_id=seg.get("source_video_id"),
        youtube_id=seg["youtube_id"],
        start_time=start,
        end_time=end,
        duration_seconds=round(float(duration), 2),
        viral_score=seg.get("viral_score", 0),
        hook_text=seg.get("hook_text", ""),
        tags=seg.get("tags", []),
        rationale=seg.get("rationale", ""),
        files={
            "raw": paths.to_relative(raw),
            "final": None,
            "thumbnail": paths.to_relative(thumb) if thumb.exists() else None,
            "source": source_info["files.source"],
            "faces": paths.to_relative(faces_file) if faces_file.is_file() else None,
        },
        source_width=source_info.get("source_width"),
        source_height=source_info.get("source_height"),
        subtitle={"words": words},
        subtitle_style={},
        brand_template_id=(ctx.agent or {}).get("default_brand_template_id"),
        status="ready",
        created_at=now,
        updated_at=now,
    ).to_mongo()
    db = get_db()
    existing = db.clips.find_one({"_id": clip_id}, {"created_at": 1})
    if existing:
        doc["created_at"] = existing.get("created_at", now)
    db.clips.replace_one({"_id": clip_id}, doc, upsert=True)
    return doc


def clip_need_mb() -> int:
    """Peak RAM of one clip (`core/resources.py`): face tracking, the encode, and local Whisper when
    the clip's words will come from it (inside the clip, Whisper runs under the clip's hold)."""
    whisper_mb = 0
    if whisper.local_likely():
        from backend.agents.tools import whisper_local

        whisper_mb = resources.WHISPER_MB.get(whisper_local.chosen_model(True).id, 1000)
    return resources.clip_need_mb(ffmpeg_ops.pick_encoder(), whisper_mb)


def run(ctx: JobContext, segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    from backend.core.settings_store import get_settings

    db = get_db()
    done = set((ctx.job.get("checkpoint") or {}).get("done_segment_ids") or [])
    results: list[dict[str, Any]] = []
    todo = []
    for seg in segments:
        if seg["segment_id"] in done:
            clip = db.clips.find_one({"_id": seg["segment_id"]})
            if clip:
                results.append(clip)
                continue
        todo.append(seg)

    total = len(segments)
    completed = len(results)
    lock = threading.Lock()
    ctx.progress(40 + 55 * completed / max(1, total), step="processing",
                 message=M("processing_one" if len(todo) == 1 else "processing", n=len(todo)) if todo else None)
    if not todo:
        return results
    for path in {s["file_path"] for s in todo if s.get("file_path")}:
        if not Path(path).is_file():
            raise PipelineError(M("file_missing", path=path))

    # At most `max_workers` clips at once; the RAM guard starts each one only when the PC has room
    # for it, so on a busy PC fewer run in parallel
    workers = max(1, min(len(todo), int(get_settings()["processing"]["max_workers"])))
    failures: list[str] = []
    need = clip_need_mb()

    def work(seg: dict[str, Any]) -> dict[str, Any] | None:
        nonlocal completed
        ctx.check()
        try:
            with resources.hold("clip", need, label=M("hold_label", start=f"{seg['start_time']:.0f}"), cancel=ctx.cancel,
                                on_wait=lambda info: ctx.progress(message=info.message())):
                clip = process_segment(ctx, seg)
        except Cancelled:
            raise
        except Exception as exc:
            logger.exception("Clip %s failed", seg["segment_id"])
            msg = M("clip_failed", start=f"{seg['start_time']:.0f}", end=f"{seg['end_time']:.0f}", source=_source_label(seg), error=exc)
            ctx.error("processing", msg)
            with lock:
                failures.append(msg)
            return None
        ctx.mark_segment_done(seg["segment_id"])
        with lock:
            completed += 1
            pct = 40 + 55 * completed / max(1, total)
        ctx.progress(pct, inc_processed=1, message=M("clip_done", done=completed, total=total))
        events.publish({"type": "clip.created", "id": clip["_id"], "job_id": ctx.id, "agent_id": ctx.agent_id})
        return clip

    pool = ThreadPoolExecutor(max_workers=workers, thread_name_prefix=f"clip-{ctx.id[:8]}")
    try:
        futures = [pool.submit(work, s) for s in todo]
        for f in as_completed(futures):
            try:
                clip = f.result()
            except Cancelled:
                ctx.cancel.cancel(ctx.cancel.reason)
                raise
            if clip:
                results.append(clip)
    finally:
        pool.shutdown(wait=True, cancel_futures=True)

    ctx.check()
    if not results:
        raise PipelineError(failures[0] if failures else M("none_processed"))
    return results
