"""Processor Agent: per segment download (or cut) with a margin -> Whisper -> trim at sentence edges ->
smart crop -> 1080x1920 -> thumbnail -> clip.

Each segment uses its OWN source: a YouTube section download (its own youtube_id, fixes K1) or a
frame-accurate cut of the uploaded video file. Clip ids are deterministic
(uuid5 of job, video, start, end, campaign) and written with an upsert, so resuming never
duplicates clips. Files go to <DATA_ROOT>\\library\\<campaign slug>\\<clip_id>\\.

When several campaigns of a job chose the same moment, it is cut and tracked once: the other clips get
hard links to the same files (a copy where links are not possible) and their own words, template and
campaign fields.
"""
from __future__ import annotations

import logging
import os
import shutil
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Optional

from backend.agents.context import JobContext, PipelineError
from backend.agents.tools import brief_match, caption_ai, clip_edges, ffmpeg_ops, whisper, ytdlp
from backend.agents.tools.smart_crop import process_auto_tracking_video
from backend.agents.tools.transcript import cached as cached_transcript
from backend.core import disk, events, llm, resources
from backend.core.config import config
from backend.core.db import get_db, utcnow
from backend.core.paths import get_paths
from backend.core.procs import Cancelled
from backend.models.documents import ClipDoc
from backend.services import brand_templates, layout
from backend.services import campaigns as campaign_svc
from backend.core import i18n

M = i18n.messages({
    "whisper_failed": {
        "id": "Whisper gagal untuk klip {start}s, memakai transkrip: {error}",
        "en": "Whisper failed for the clip at {start}s, using the transcript: {error}",
    },
    "recut_missing": {
        "id": "Klip yang mau dipotong ulang sudah dihapus",
        "en": "The clip to cut again was deleted",
    },
    "no_words": {
        "id": "Klip {start}s tidak punya subtitle: Whisper gagal dan transkrip tidak berisi kata di bagian ini. "
              "Tambahkan katanya di editor klip.",
        "en": "The clip at {start}s has no subtitles: Whisper failed and the transcript has no words in this part. "
              "Add the words in the clip editor.",
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
    "clip_started": {
        "id": "RAM cukup, klip {start}s mulai diproses…",
        "en": "Enough RAM now, clip {start}s is being processed…",
    },
    "none_processed": {
        "id": "Tidak ada klip yang berhasil diproses",
        "en": "No clip could be processed",
    },
    "post_copy_skipped": {
        "id": "Teks posting AI dilewati, memakai teks dasar dari brief: {error}",
        "en": "The AI post text was skipped, using a basic text from the brief: {error}",
    },
})

logger = logging.getLogger(__name__)

TITLE_MAX_WORDS = 12
TITLE_MAX_CHARS = 60
REPLACE_TRIES = 40  # a file the editor streams is locked on Windows: retry the swap for up to 10 s


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


Limits = tuple[Optional[float], Optional[float]]


def length_limits(ctx: JobContext, segs: list[dict[str, Any]]) -> Limits:
    """The clip length every campaign that chose this moment accepts (the strictest of their briefs).
    A moment the user chose keeps its length: the briefs do not apply."""
    if any(seg.get("manual") for seg in segs):
        return (None, None)
    los, his = [], []
    for seg in segs:
        lo, hi = brief_match.length_range((_campaign(ctx, seg) or {}).get("brief"))
        if lo is not None:
            los.append(lo)
        if hi is not None:
            his.append(hi)
    return (max(los) if los else None, min(his) if his else None)


def _source(ctx: JobContext, seg: dict[str, Any], work: Path,
            limits: Limits = (None, None)) -> tuple[Path, list[dict[str, Any]] | None, float, float]:
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
    # A moment the user chose may keep its exact edges (`snap` off)
    snapped = clip_edges.snap(words, payload, t0, t1, total, limits, seg.get("edge_text")) if seg.get("snap", True) else None
    a, b = snapped or (t0, t1)
    ctx.check()
    if seg.get("file_path"):  # cut once more from the original file rather than re-encoding the padded cut
        src = ffmpeg_ops.cut_section(Path(seg["file_path"]), pad_start + a, pad_start + b, work / "src.mp4", ctx.cancel)
    else:
        src = ffmpeg_ops.cut_section(padded, a, b, work / "src.mp4", ctx.cancel)
    clip_words = clip_edges.shift_words(words, a, b - a) or None
    return src, clip_words, round(pad_start + a, 2), round(pad_start + b, 2)


def _campaign(ctx: JobContext, seg: dict[str, Any]) -> dict[str, Any] | None:
    """The job's snapshot of the segment's campaign (None without a campaign)."""
    cid = seg.get("campaign_id")
    if not cid:
        return None
    return next((c for c in ctx.job.get("campaigns") or [] if c.get("id") == cid), {"id": cid})


def _template_id(ctx: JobContext, seg: dict[str, Any]) -> str | None:
    """The clip's brand template: its campaign's default (as set now, else when the job started),
    repaired when it is gone (None: the campaign was deleted, the built-in settings)."""
    campaign = _campaign(ctx, seg)
    if not campaign:
        return None
    live = get_db().campaigns.find_one({"_id": campaign["id"]}, {"brand_template_id": 1})
    tid = (live or campaign).get("brand_template_id")
    tpl = brand_templates.get(tid)
    if tpl and tpl.get("campaign_id") == campaign["id"]:
        return tid
    return brand_templates.ensure_for_campaign(campaign["id"]) if live else None


def _layout_style(ctx: JobContext) -> dict[str, Any]:
    """A new clip's layout override: the job's choice of the automatic layout by content, if any."""
    smart = (ctx.job.get("config") or {}).get("smart_layout")
    return {"smart": {"enabled": smart}} if isinstance(smart, bool) else {}


def _brief_marks(words: list[dict[str, Any]], campaign: dict[str, Any] | None) -> list[dict[str, Any]]:
    """The words the brief requires are highlighted as subtitle keywords."""
    terms = ((campaign or {}).get("brief") or {}).get("must_include") or []
    hits = brief_match.term_word_indices(words, terms) if terms else set()
    return [{**w, "keyword": True} if i in hits else w for i, w in enumerate(words)]


def _ai_marks(ctx: JobContext, words: list[dict[str, Any]], template_id: str | None = None) -> list[dict[str, Any]]:
    """Brand template AI subtitle settings: keywords / emojis (one LLM call). Never fails the clip."""
    from backend.services.render import effective_ai

    tpl = brand_templates.get(template_id) if template_id else None
    ai = effective_ai(None, tpl or {})
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


def process_segment(ctx: JobContext, seg: dict[str, Any], limits: Limits = (None, None)) -> dict[str, Any]:
    if seg.get("recut"):
        return recut_segment(ctx, seg, limits)
    clip_id = seg["segment_id"]
    paths = get_paths()
    work = ctx.cache_dir / clip_id
    work.mkdir(parents=True, exist_ok=True)
    out_dir = paths.clip_dir(ctx.campaign_slug(seg.get("campaign_id")), clip_id)
    out_dir.mkdir(parents=True, exist_ok=True)
    raw = out_dir / "raw.mp4"
    thumb = out_dir / "thumb.jpg"
    try:
        return _process(ctx, seg, clip_id, work, raw, thumb, limits)
    except BaseException:
        # Never leave half-written media behind for a clip that has no document
        if not get_db().clips.find_one({"_id": clip_id}, {"_id": 1}):
            shutil.rmtree(out_dir, ignore_errors=True)
        raise


def _make_media(ctx: JobContext, seg: dict[str, Any], work: Path, raw: Path, thumb: Path,
                limits: Limits = (None, None), fill_words: bool = True) -> dict[str, Any]:
    """Cut, track and transcribe one moment into raw.mp4, thumb.jpg, source.mp4 and faces.json (the last two
    next to raw.mp4). Returns {start, end, duration, words, source_info, faces}. With `fill_words`, a clip
    Whisper gave no words gets the transcript's (and in dev, placeholder words)."""
    try:
        src, words, start, end = _source(ctx, seg, work, limits)
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
            words = words_from_transcript(_transcript_key(seg), start, end)
        if not words and fill_words:
            if config.is_dev:
                words = mock_words(seg.get("hook_text") or "", end - start)
            else:
                # Never invent captions: the clip is kept without words and the editor can add them
                words = []
                ctx.error("processing", M("no_words", start=f"{start:.0f}"))
    finally:
        shutil.rmtree(work, ignore_errors=True)
    return {"start": start, "end": end, "duration": duration, "words": words or [], "source_info": source_info,
            "faces": faces_file if faces_file.is_file() else None}


def first_sentence(words: list[dict[str, Any]]) -> str:
    """A title for a clip the user chose: its first sentence (at most 12 words, 60 characters)."""
    out: list[str] = []
    for w in words:
        text = str(w.get("word") or "").strip()
        if not text:
            continue
        out.append(text)
        if text[-1:] in ".?!…" or len(out) >= TITLE_MAX_WORDS:
            break
    title = " ".join(out).strip().rstrip(",;:")
    if len(title) > TITLE_MAX_CHARS:
        title = title[:TITLE_MAX_CHARS].rsplit(" ", 1)[0].rstrip(",;:") + "…"
    return title[:1].upper() + title[1:]


def _process(ctx: JobContext, seg: dict[str, Any], clip_id: str, work: Path, raw: Path, thumb: Path,
             limits: Limits = (None, None)) -> dict[str, Any]:
    paths = get_paths()
    media = _make_media(ctx, seg, work, raw, thumb, limits)
    start, end, duration, words = media["start"], media["end"], media["duration"], media["words"]
    source_info, faces_file = media["source_info"], media["faces"]
    ctx.check()
    template_id = _template_id(ctx, seg)
    campaign = _campaign(ctx, seg)
    words = _brief_marks(_ai_marks(ctx, words, template_id), campaign)

    now = utcnow()
    doc = ClipDoc(
        _id=clip_id,
        job_id=ctx.id,
        source_video_id=seg.get("source_video_id"),
        youtube_id=seg["youtube_id"],
        start_time=start,
        end_time=end,
        duration_seconds=round(float(duration), 2),
        viral_score=seg.get("viral_score", 0),
        hook_text=seg.get("hook_text") or (first_sentence(words) if seg.get("origin") == "manual" else ""),
        tags=seg.get("tags", []),
        rationale=seg.get("rationale", ""),
        origin=seg.get("origin") or "ai",
        files={
            "raw": paths.to_relative(raw),
            "final": None,
            "thumbnail": paths.to_relative(thumb) if thumb.exists() else None,
            "source": source_info["files.source"],
            "faces": paths.to_relative(faces_file) if faces_file else None,
        },
        source_width=source_info.get("source_width"),
        source_height=source_info.get("source_height"),
        subtitle={"words": words},
        subtitle_style={},
        layout_style=_layout_style(ctx),
        brand_template_id=template_id,
        **_campaign_fields(seg),
        status="ready",
        created_at=now,
        updated_at=now,
    ).to_mongo()
    return _save(ctx, doc, campaign)


def _campaign_fields(seg: dict[str, Any]) -> dict[str, Any]:
    """The clip's campaign, and its fit to the brief (none for a plain campaign)."""
    if not seg.get("campaign_id"):
        return {}
    return {"campaign_id": seg["campaign_id"], "brief_fit": seg.get("brief_fit"), "brief_reason": seg.get("brief_reason") or ""}


def _brief_now(campaign: dict[str, Any] | None) -> dict[str, Any]:
    """The campaign's brief as it is now (else the job's snapshot of it)."""
    if not campaign:
        return {}
    live = get_db().campaigns.find_one({"_id": campaign.get("id")}, {"brief": 1})
    return (live or campaign).get("brief") or {}


def _save(ctx: JobContext, doc: dict[str, Any], campaign: dict[str, Any] | None) -> dict[str, Any]:
    db = get_db()
    existing = db.clips.find_one({"_id": doc["_id"]}, {"created_at": 1, "post_copy": 1})
    if existing:
        doc["created_at"] = existing.get("created_at", doc["created_at"])
        doc["post_copy"] = existing.get("post_copy")
    # Post text follows a brief; a plain campaign's clips get it only when the user asks (editor)
    if campaign and not doc.get("post_copy") and campaign_svc.has_brief(_brief_now(campaign)):
        doc["post_copy"] = _post_copy(ctx, doc, campaign)
    db.clips.replace_one({"_id": doc["_id"]}, doc, upsert=True)
    return doc


def _post_copy(ctx: JobContext, doc: dict[str, Any], campaign: dict[str, Any]) -> dict[str, Any] | None:
    """Text for posting the clip, following the brief (one LLM call). Never fails the clip."""
    from backend.agents.tools import post_copy_ai

    brief = _brief_now(campaign)
    sv = get_db().source_videos.find_one({"_id": doc.get("source_video_id")}, {"title": 1, "channel_name": 1}) \
        if doc.get("source_video_id") else None
    try:
        return post_copy_ai.generate(doc, brief, video_title=(sv or {}).get("title") or "",
                                     channel=(sv or {}).get("channel_name") or "",
                                     should_stop=lambda: ctx.cancel.cancelled)
    except llm.LLMNotConfigured:  # dev without a key: the basic text, no warning per clip
        return post_copy_ai.fallback(doc, brief)
    except llm.LLMError as exc:
        ctx.error("processing", M("post_copy_skipped", error=exc))
        return post_copy_ai.fallback(doc, brief)


def _link_or_copy(src: Path, dst: Path) -> None:
    dst.unlink(missing_ok=True)
    try:
        os.link(src, dst)  # same drive (both under the data folder): no extra disk space
    except OSError:
        shutil.copy2(src, dst)


def derive_clip(ctx: JobContext, seg: dict[str, Any], base: dict[str, Any]) -> dict[str, Any]:
    """A clip for another campaign from a clip of the same moment: the same media files, its own words
    (marked for its own template and brief), template and campaign fields."""
    paths = get_paths()
    clip_id = seg["segment_id"]
    out_dir = paths.clip_dir(ctx.campaign_slug(seg.get("campaign_id")), clip_id)
    out_dir.mkdir(parents=True, exist_ok=True)
    files: dict[str, Any] = {"final": None}
    try:
        for kind in ("raw", "thumbnail", "source", "faces"):
            rel = (base.get("files") or {}).get(kind)
            src = paths.from_relative(rel) if rel else None
            if src is None or not src.is_file():
                files[kind] = None
                continue
            dst = out_dir / src.name
            _link_or_copy(src, dst)
            files[kind] = paths.to_relative(dst)
    except BaseException:
        if not get_db().clips.find_one({"_id": clip_id}, {"_id": 1}):
            shutil.rmtree(out_dir, ignore_errors=True)
        raise
    plain = [{k: v for k, v in w.items() if k not in ("keyword", "emoji")}
             for w in (base.get("subtitle") or {}).get("words") or []]
    template_id = _template_id(ctx, seg)
    campaign = _campaign(ctx, seg)
    words = _brief_marks(_ai_marks(ctx, plain, template_id), campaign)
    now = utcnow()
    doc = ClipDoc(
        _id=clip_id,
        job_id=ctx.id,
        source_video_id=base.get("source_video_id"),
        youtube_id=base.get("youtube_id"),
        start_time=base["start_time"],
        end_time=base["end_time"],
        duration_seconds=base["duration_seconds"],
        viral_score=seg.get("viral_score", base.get("viral_score", 0)),
        hook_text=seg.get("hook_text") or base.get("hook_text", ""),
        tags=seg.get("tags", base.get("tags", [])),
        rationale=seg.get("rationale", base.get("rationale", "")),
        origin=seg.get("origin") or base.get("origin") or "ai",
        files=files,
        source_width=base.get("source_width"),
        source_height=base.get("source_height"),
        subtitle={"words": words},
        subtitle_style={},
        layout_style=_layout_style(ctx),
        brand_template_id=template_id,
        **_campaign_fields(seg),
        status="ready",
        created_at=now,
        updated_at=now,
    ).to_mongo()
    return _save(ctx, doc, campaign)


def merge_recut_words(old: list[dict[str, Any]], old_start: float, old_end: float,
                      new: list[dict[str, Any]], new_start: float, new_end: float) -> tuple[list[dict[str, Any]], list[int]]:
    """The words of a clip cut again at [new_start, new_end]: the old words (as the user edited them) where
    the two cuts overlap, shifted to the new start, and the new Whisper words only outside the old cut.
    Returns the words and the indexes of the added ones."""
    shift = old_start - new_start
    length = new_end - new_start
    a, b = old_start - new_start, old_end - new_start  # the old cut on the new timeline
    out: list[tuple[dict[str, Any], bool]] = []
    for w in old:
        s, e = float(w.get("start", 0)) + shift, float(w.get("end", 0)) + shift
        if (s + e) / 2 < 0 or (s + e) / 2 > length:
            continue  # trimmed away
        out.append(({**w, "start": round(max(0.0, s), 3), "end": round(min(length, max(s, e)), 3)}, False))
    for w in new:
        mid = (float(w.get("start", 0)) + float(w.get("end", 0))) / 2
        if old and a <= mid <= b:
            continue  # the user's words cover this part
        out.append((dict(w), True))
    out.sort(key=lambda x: (float(x[0].get("start", 0)), float(x[0].get("end", 0))))
    return [w for w, _ in out], [i for i, (_, added) in enumerate(out) if added]


def _replace(src: Path, dst: Path) -> None:
    """os.replace with retries: on Windows a file the editor is streaming cannot be replaced for a moment.
    A hard link shared with another campaign's clip stays with that clip (the name gets a new file)."""
    for attempt in range(REPLACE_TRIES):
        try:
            os.replace(src, dst)
            return
        except PermissionError:
            if attempt == REPLACE_TRIES - 1:
                raise
            time.sleep(0.25)


def recut_segment(ctx: JobContext, seg: dict[str, Any], limits: Limits = (None, None)) -> dict[str, Any]:
    """Cut an existing clip again at the segment's edges (agents/nodes/manual.py). The new media is made in
    the cache first, then swapped into the clip's folder, so a failure leaves the clip as it was. The clip
    keeps its id, job, style, template, title, post text and brief ticks; its last export (final.mp4) no
    longer matches and is removed (the copy in the export folder stays)."""
    db = get_db()
    paths = get_paths()
    clip_id = seg["segment_id"]
    if not db.clips.find_one({"_id": clip_id}, {"_id": 1}):
        raise PipelineError(M("recut_missing"))
    work = ctx.cache_dir / clip_id
    out = ctx.cache_dir / f"{clip_id}-new"
    shutil.rmtree(out, ignore_errors=True)
    work.mkdir(parents=True, exist_ok=True)
    out.mkdir(parents=True, exist_ok=True)
    try:
        media = _make_media(ctx, seg, work, out / "raw.mp4", out / "thumb.jpg", limits, fill_words=False)
        ctx.check()
        clip = db.clips.find_one({"_id": clip_id})  # as it is now: the user may have saved words meanwhile
        if not clip:
            raise PipelineError(M("recut_missing"))
        sub = clip.get("subtitle") or {}
        old_words = sub.get("words") or []
        words, added = merge_recut_words(old_words, float(clip.get("start_time", 0)), float(clip.get("end_time", 0)),
                                         media["words"], media["start"], media["end"])
        if added:
            campaign = _campaign(ctx, seg) or ({"id": clip["campaign_id"]} if clip.get("campaign_id") else None)
            marked = _brief_marks(_ai_marks(ctx, [words[i] for i in added], clip.get("brand_template_id")), campaign)
            for i, w in zip(added, marked):
                words[i] = w
        # Translated subtitles: the spoken words are cut the same way; the added words are
        # in the spoken language in both lists until the editor translates again
        translation = sub.get("translation") if isinstance(sub.get("translation"), dict) else None
        tr_sets: dict[str, Any] = {}
        if translation:
            spoken, spoken_added = merge_recut_words(translation.get("original_words") or [],
                                                     float(clip.get("start_time", 0)), float(clip.get("end_time", 0)),
                                                     media["words"], media["start"], media["end"])
            for i, w in zip(spoken_added, (words[j] for j in added)):
                spoken[i] = w
            tr_sets = {"subtitle.translation.original_words": spoken}
            if added:
                tr_sets["subtitle.translation.partial"] = True
        if not words:
            ctx.error("processing", M("no_words", start=f"{media['start']:.0f}"))
        files = clip.get("files") or {}
        target = (paths.from_relative(files["raw"]).parent if files.get("raw")
                  else paths.clip_dir(ctx.campaign_slug(clip.get("campaign_id")), clip_id))
        target.mkdir(parents=True, exist_ok=True)
        new_files: dict[str, Any] = {"final": None}
        for kind, name in (("raw", "raw.mp4"), ("thumbnail", "thumb.jpg"), ("source", "source.mp4"), ("faces", "faces.json")):
            src = out / name
            dst = target / name
            if src.is_file():
                _replace(src, dst)
                new_files[kind] = paths.to_relative(dst)
            else:  # e.g. no face scan this time: the old one belongs to the old timeline
                dst.unlink(missing_ok=True)
                new_files[kind] = None
        (target / "final.mp4").unlink(missing_ok=True)
        (target / "cover.jpg").unlink(missing_ok=True)  # the chosen cover belongs to the old timeline
        info = media["source_info"]
        db.clips.update_one({"_id": clip_id}, {"$set": {
            "start_time": media["start"],
            "end_time": media["end"],
            "duration_seconds": round(float(media["duration"]), 2),
            "files": new_files,
            "source_width": info.get("source_width"),
            "source_height": info.get("source_height"),
            "subtitle.words": words,
            **tr_sets,
            "cover_time": None,
            "final_render": None,
            "status": "ready",
            "updated_at": utcnow(),
        }})
        logger.info("Clip %s cut again at %.2f-%.2f (%s word(s) kept, %s added)", clip_id, media["start"],
                    media["end"], len(words) - len(added), len(added))
        return db.clips.find_one({"_id": clip_id})
    finally:
        shutil.rmtree(work, ignore_errors=True)
        shutil.rmtree(out, ignore_errors=True)


def media_key(seg: dict[str, Any]) -> tuple[Any, ...]:
    """Segments with the same key are the same moment of the same video (chosen by several campaigns)."""
    return (seg.get("source_video_id") or seg.get("youtube_id"), round(float(seg["start_time"]), 2),
            round(float(seg["end_time"]), 2))


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
    # Segments analysed before campaigns replaced the workspaces carry no campaign: they belong to the
    # job's campaign (the clip id stays the segment id, so a resumed job still finds its clips)
    first = next(iter(ctx.campaign_ids), None)
    for seg in segments:
        if not seg.get("campaign_id") and first:
            seg["campaign_id"] = first
    done = set((ctx.job.get("checkpoint") or {}).get("done_segment_ids") or [])
    results: list[dict[str, Any]] = []
    todo = []
    bases: dict[tuple[Any, ...], dict[str, Any]] = {}  # a finished clip per moment, for the other campaigns
    for seg in segments:
        if seg["segment_id"] in done:
            # A segment is marked done only after its clip was written, so a missing clip was deleted by
            # the user: resuming (or retrying a job's failed clips) must not bring it back
            clip = db.clips.find_one({"_id": seg["segment_id"]})
            if clip:
                results.append(clip)
                bases.setdefault(media_key(seg), clip)
            continue
        todo.append(seg)
    groups: dict[tuple[Any, ...], list[dict[str, Any]]] = {}
    for seg in todo:
        groups.setdefault(media_key(seg), []).append(seg)

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
    workers = max(1, min(len(groups), int(get_settings()["processing"]["max_workers"])))
    failures: list[str] = []
    need = clip_need_mb()

    def finished(clip: dict[str, Any]) -> None:
        nonlocal completed
        ctx.mark_segment_done(clip["_id"])
        with lock:
            completed += 1
            pct = 40 + 55 * completed / max(1, total)
        ctx.progress(pct, inc_processed=1, message=M("clip_done", done=completed, total=total))
        if ctx.config.get("recut"):  # the same clip with new files
            events.publish({"type": "clip.updated", "id": clip["_id"]})
        else:
            events.publish({"type": "clip.created", "id": clip["_id"], "job_id": ctx.id, "campaign_id": clip.get("campaign_id")})

    def failed(seg: dict[str, Any], exc: Exception) -> None:
        logger.exception("Clip %s failed", seg["segment_id"])
        msg = M("clip_failed", start=f"{seg['start_time']:.0f}", end=f"{seg['end_time']:.0f}", source=_source_label(seg), error=exc)
        ctx.error("processing", msg)
        with lock:
            failures.append(msg)

    def work(key: tuple[Any, ...]) -> list[dict[str, Any]]:
        """One moment: cut and track it once, then one clip per campaign that chose it."""
        out: list[dict[str, Any]] = []
        base = bases.get(key)
        limits = length_limits(ctx, groups[key])
        for seg in groups[key]:
            ctx.check()
            try:
                if base is None:
                    # Every new cut writes several files; below 2 GB free the job stops here (resumable)
                    disk.check(warn=False)
                    start = f"{seg['start_time']:.0f}"
                    waited: list[bool] = []

                    def on_wait(info: resources.WaitInfo) -> None:
                        waited.append(True)
                        ctx.progress(message=info.message())

                    with resources.hold("clip", need, label=M("hold_label", start=start), cancel=ctx.cancel,
                                        on_wait=on_wait):
                        if waited:  # the job's activity would still say it waits for RAM
                            ctx.progress(message=M("clip_started", start=start))
                        clip = process_segment(ctx, seg, limits)
                    base = clip
                else:
                    clip = derive_clip(ctx, seg, base)
            except Cancelled:
                raise
            except disk.DiskFull as exc:
                raise PipelineError(str(exc)) from exc
            except Exception as exc:
                failed(seg, exc)
                continue
            finished(clip)
            out.append(clip)
        return out

    pool = ThreadPoolExecutor(max_workers=workers, thread_name_prefix=f"clip-{ctx.id[:8]}")
    try:
        futures = [pool.submit(work, k) for k in groups]
        for f in as_completed(futures):
            try:
                clips = f.result()
            except Cancelled:
                ctx.cancel.cancel(ctx.cancel.reason)
                raise
            results.extend(clips)
    finally:
        pool.shutdown(wait=True, cancel_futures=True)

    ctx.check()
    if not results:
        raise PipelineError(failures[0] if failures else M("none_processed"))
    return results
