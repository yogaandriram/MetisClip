"""Processor Agent: per segment download -> smart crop -> 1080x1920 -> thumbnail -> Whisper -> clip.

Each segment uses its OWN youtube_id (fixes K1). Clip ids are deterministic
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
from backend.agents.tools import ffmpeg_ops, whisper, ytdlp
from backend.agents.tools.smart_crop import process_auto_tracking_video
from backend.agents.tools.transcript import cached as cached_transcript
from backend.core import events
from backend.core.db import get_db, utcnow
from backend.core.paths import get_paths
from backend.core.procs import Cancelled
from backend.models.documents import ClipDoc

logger = logging.getLogger(__name__)


def words_from_transcript(youtube_id: str, start: float, end: float) -> list[dict[str, Any]]:
    """Approximate word timings from the cached transcript (used when Whisper is unavailable)."""
    segs = cached_transcript(youtube_id) or []
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


def _subtitles(ctx: JobContext, seg: dict[str, Any], raw: Path, work: Path) -> list[dict[str, Any]]:
    if whisper.available():
        try:
            audio = ffmpeg_ops.extract_audio_mp3(raw, work / "audio.mp3", ctx.cancel)
            words = whisper.words_from_payload(whisper.transcribe(audio, words=True))
            if words:
                return words
        except Cancelled:
            raise
        except Exception as exc:
            ctx.error("processing", f"Whisper gagal untuk klip {seg['start_time']:.0f}s, memakai transkrip: {exc}")
    words = words_from_transcript(seg["youtube_id"], seg["start_time"], seg["end_time"])
    return words or mock_words(seg.get("hook_text") or "", seg["duration_seconds"])


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
        src = ytdlp.download_section(seg["youtube_id"], seg["start_time"], seg["end_time"], work / "src.mp4", ctx.cancel)
        ctx.check()
        tracked = work / "tracked.mp4"
        if process_auto_tracking_video(str(src), str(tracked), ctx.cancel):
            ffmpeg_ops.finish_vertical(tracked, src, raw, ctx.cancel)
        else:
            ctx.error("processing", f"Face tracking gagal untuk klip {seg['start_time']:.0f}s, memakai center crop")
            ffmpeg_ops.center_crop_vertical(src, raw, ctx.cancel)
        ctx.check()
        duration = ffmpeg_ops.probe_duration(raw) or seg["duration_seconds"]
        ffmpeg_ops.thumbnail(raw, thumb, duration / 2, ctx.cancel)
        words = _subtitles(ctx, seg, raw, work)
    finally:
        shutil.rmtree(work, ignore_errors=True)

    now = utcnow()
    doc = ClipDoc(
        _id=clip_id,
        agent_id=ctx.agent_id,
        job_id=ctx.id,
        source_video_id=seg.get("source_video_id"),
        youtube_id=seg["youtube_id"],
        start_time=seg["start_time"],
        end_time=seg["end_time"],
        duration_seconds=round(float(duration), 2),
        viral_score=seg.get("viral_score", 0),
        hook_text=seg.get("hook_text", ""),
        tags=seg.get("tags", []),
        rationale=seg.get("rationale", ""),
        files={
            "raw": paths.to_relative(raw),
            "final": None,
            "thumbnail": paths.to_relative(thumb) if thumb.exists() else None,
        },
        subtitle={"words": words},
        subtitle_style={},
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
                 message=f"Memproses {len(todo)} klip…" if todo else None)
    if not todo:
        return results

    workers = max(1, min(len(todo), int(get_settings()["processing"]["max_workers"])))
    failures: list[str] = []

    def work(seg: dict[str, Any]) -> dict[str, Any] | None:
        nonlocal completed
        ctx.check()
        try:
            clip = process_segment(ctx, seg)
        except Cancelled:
            raise
        except Exception as exc:
            logger.exception("Clip %s failed", seg["segment_id"])
            msg = f"Klip {seg['start_time']:.0f}–{seg['end_time']:.0f}s ({seg['youtube_id']}) gagal: {exc}"
            ctx.error("processing", msg)
            with lock:
                failures.append(msg)
            return None
        ctx.mark_segment_done(seg["segment_id"])
        with lock:
            completed += 1
            pct = 40 + 55 * completed / max(1, total)
        ctx.progress(pct, inc_processed=1, message=f"Klip {completed}/{total} selesai")
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
        raise PipelineError(failures[0] if failures else "Tidak ada klip yang berhasil diproses")
    return results
