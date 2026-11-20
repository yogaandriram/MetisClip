"""Moments the user chose, in place of the Analyzer (CLAUDE.md §5.2, "Manual clips and recuts").

- A **manual job** (`config.manual_ranges`) turns every range into one clip for each of the job's campaigns.
  The clips have no viral score (`origin: "manual"`); the Processor titles them from their first sentence.
- A **recut** (`config.recut`: {clip_id, start, end}) cuts an existing clip again at new edges. The Processor
  replaces its files and keeps its style, template, title, post text and the words the user edited
  (`processor.recut_segment`).

Both go through the rest of the pipeline as usual (download, Whisper edges, face tracking, the RAM guard,
checkpoints), so they show in Antrian, can be cancelled and resumed.
"""
from __future__ import annotations

import logging
from typing import Any

from backend.agents.context import JobContext, PipelineError
from backend.agents.nodes.analyzer import segment_id
from backend.agents.tools import whisper
from backend.agents.tools.transcript import cache_key, get_transcript
from backend.core.db import get_db
from backend.core import i18n

M = i18n.messages({
    "too_many": {
        "id": "Maksimal {n} momen per job",
        "en": "At most {n} moments per job",
    },
    "no_ranges": {
        "id": "Tambahkan minimal satu momen (waktu mulai dan selesai)",
        "en": "Add at least one moment (a start and an end time)",
    },
    "bad_range": {
        "id": "Momen {n}: waktu selesai harus setelah waktu mulai",
        "en": "Moment {n}: the end must come after the start",
    },
    "range_length": {
        "id": "Momen {n}: panjang klip harus antara {lo} dan {hi} detik",
        "en": "Moment {n}: a clip must last between {lo} and {hi} seconds",
    },
    "past_end": {
        "id": "Momen {n} dimulai setelah video berakhir ({duration})",
        "en": "Moment {n} starts after the video ends ({duration})",
    },
    "short_after_clamp": {
        "id": "Momen {n} dilewati: setelah dipotong di akhir video panjangnya kurang dari {lo} detik",
        "en": "Moment {n} was skipped: cut at the end of the video it lasts less than {lo} seconds",
    },
    "manual_progress": {
        "id": "Menyiapkan {n} momen pilihan…",
        "en": "Preparing {n} chosen moments…",
    },
    "recut_progress": {
        "id": "Menyiapkan potongan baru…",
        "en": "Preparing the new cut…",
    },
    "recut_missing": {
        "id": "Klip yang mau dipotong ulang sudah dihapus",
        "en": "The clip to cut again was deleted",
    },
    "no_moment": {
        "id": "Tidak ada momen yang bisa dijadikan klip",
        "en": "No moment could become a clip",
    },
    "transcript_skipped": {
        "id": "Transkrip YouTube tidak tersedia, jadi klip tanpa Whisper tidak punya subtitle: {error}",
        "en": "The YouTube transcript is not available, so clips without Whisper get no subtitles: {error}",
    },
})

logger = logging.getLogger(__name__)

MIN_S = 5.0
MAX_S = 180.0
MAX_RANGES = 20


class RangeError(ValueError):
    """A user-chosen range is not valid (message in the UI language)."""


def is_manual(cfg: dict[str, Any]) -> bool:
    return bool(cfg.get("recut") or cfg.get("manual_ranges"))


def clean_ranges(ranges: list[dict[str, Any]], duration: float | None = None) -> list[dict[str, float]]:
    """Validates and rounds user ranges ({start, end} in seconds), in the order given. Raises RangeError."""
    if not ranges:
        raise RangeError(M("no_ranges"))
    if len(ranges) > MAX_RANGES:
        raise RangeError(M("too_many", n=MAX_RANGES))
    out: list[dict[str, float]] = []
    for n, r in enumerate(ranges, start=1):
        try:
            start, end = round(max(0.0, float(r["start"])), 2), round(float(r["end"]), 2)
        except (KeyError, TypeError, ValueError):
            raise RangeError(M("bad_range", n=n))
        if end <= start:
            raise RangeError(M("bad_range", n=n))
        if duration and start >= duration:
            raise RangeError(M("past_end", n=n, duration=_clock(duration)))
        if not MIN_S <= end - start <= MAX_S:
            raise RangeError(M("range_length", n=n, lo=f"{MIN_S:.0f}", hi=f"{MAX_S:.0f}"))
        out.append({"start": start, "end": end})
    return out


def _clock(seconds: float) -> str:
    s = int(round(seconds))
    return f"{s // 3600}:{s % 3600 // 60:02d}:{s % 60:02d}" if s >= 3600 else f"{s // 60}:{s % 60:02d}"


def _base(video: dict[str, Any], start: float, end: float) -> dict[str, Any]:
    return {
        "source_video_id": video["_id"],
        "youtube_id": video.get("youtube_id"),
        "file_path": video.get("file_path"),
        "transcript_key": cache_key(video),
        "start_time": start,
        "end_time": end,
        "duration_seconds": round(end - start, 2),
        "manual": True,
        "origin": "manual",
        "viral_score": 0,
        "hook_text": "",
        "tags": [],
        "rationale": "",
    }


def _clamp(ctx: JobContext, n: int, start: float, end: float, duration: float | None) -> tuple[float, float] | None:
    if not duration:
        return start, end
    if start >= duration:
        ctx.error("analysis", M("past_end", n=n, duration=_clock(duration)))
        return None
    end = min(end, round(float(duration), 2))
    if end - start < MIN_S:
        ctx.error("analysis", M("short_after_clamp", n=n, lo=f"{MIN_S:.0f}"))
        return None
    return start, end


def _transcript_without_whisper(ctx: JobContext, video: dict[str, Any]) -> None:
    """Without Whisper the Processor takes the words from the transcript cache: fetch YouTube's subtitles
    (quick) so it has them. Uploads cannot get here (a job from a file needs Whisper)."""
    if whisper.available() or not video.get("youtube_id"):
        return
    try:
        get_transcript(video, ctx.cancel, on_status=lambda m: ctx.progress(message=m))
    except PipelineError as exc:
        ctx.error("analysis", M("transcript_skipped", error=exc))


def run(ctx: JobContext, videos: list[dict[str, Any]]) -> list[dict[str, Any]]:
    cfg = ctx.config
    video = videos[0]
    duration = video.get("duration_seconds")
    snap = bool(cfg.get("snap_edges", True))
    recut = cfg.get("recut")
    if recut:
        ctx.progress(30, step="analysis", message=M("recut_progress"))
        clip = get_db().clips.find_one({"_id": recut.get("clip_id")})
        if not clip:
            raise PipelineError(M("recut_missing"))
        edges = _clamp(ctx, 1, float(recut["start"]), float(recut["end"]), duration)
        if not edges:
            raise PipelineError(M("no_moment"))
        _transcript_without_whisper(ctx, video)
        seg = {
            **_base(video, *edges),
            # The clip keeps its id, source video, campaign, title and score (agents/nodes/processor.recut_segment)
            "segment_id": clip["_id"],
            "source_video_id": clip.get("source_video_id") or video["_id"],
            "campaign_id": clip.get("campaign_id"),
            "origin": clip.get("origin") or "ai",
            "viral_score": clip.get("viral_score", 0),
            "hook_text": clip.get("hook_text") or "",
            "recut": True,
            "snap": snap,
        }
        return [seg]

    ranges = cfg.get("manual_ranges") or []
    ctx.progress(30, step="analysis", message=M("manual_progress", n=len(ranges)))
    _transcript_without_whisper(ctx, video)
    source = video.get("youtube_id") or video["_id"]
    segments: list[dict[str, Any]] = []
    for n, r in enumerate(ranges, start=1):
        edges = _clamp(ctx, n, float(r["start"]), float(r["end"]), duration)
        if not edges:
            continue
        for cid in ctx.campaign_ids or [None]:
            seg = {**_base(video, *edges), "segment_id": segment_id(ctx.id, source, edges[0], edges[1], cid), "snap": snap}
            if cid:
                seg["campaign_id"] = cid
            segments.append(seg)
    logger.info("Job %s: %s manual moment(s), %s clip(s)", ctx.id, len(ranges), len(segments))
    return segments
