"""Export render: Remotion worker (render-engine/dist/render.js) run via Electron-as-Node.

Contract: docs/desktop-contract.md §7. Output lands in
<DATA_ROOT>\\library\\<campaign slug>\\<clip_id>\\final.mp4 and is then copied to the export folder
(Pengaturan → Folder ekspor), see `services.exports`.
"""
from __future__ import annotations

import hashlib
import json
import logging
import math
import os
import subprocess
import threading
import time
from collections import deque
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any
from urllib.parse import quote

from backend.core import cache, events, procs, resources, workload
from backend.core.config import config, node_command
from backend.core.db import get_db, new_id, utcnow
from backend.core.logging_setup import redactor
from backend.core.paths import get_paths
from backend.agents.tools import ffmpeg_ops
from backend.services import layout as layout_svc
from backend.core import i18n

M = i18n.messages({
    "clip_missing": {
        "id": "Klip atau file raw tidak ditemukan",
        "en": "The clip or its raw file was not found",
    },
    "needs_source": {
        "id": "Layout {name} butuh video sumber: {error}",
        "en": "The {name} layout needs the source video: {error}",
    },
    "needs_faces": {
        "id": "Layout {name} butuh analisis wajah: {error}",
        "en": "The {name} layout needs a face analysis: {error}",
    },
    "no_worker": {
        "id": "Render worker tidak ditemukan (render-engine/dist/render.js). Jalankan build render-engine.",
        "en": "The render worker was not found (render-engine/dist/render.js). Build render-engine first.",
    },
    "loudness": {
        "id": "Menyamakan volume suara…",
        "en": "Leveling the sound volume…",
    },
    "no_message": {
        "id": "Render gagal tanpa pesan error",
        "en": "The render failed without an error message",
    },
    "failed": {
        "id": "Render gagal",
        "en": "The render failed",
    },
    "exit_code": {
        "id": "Render worker keluar dengan kode {code}",
        "en": "The render worker exited with code {code}",
    },
})

logger = logging.getLogger(__name__)
FPS = 30

_render_log: logging.Logger | None = None


def _rlog() -> logging.Logger:
    global _render_log
    if _render_log is None:
        lg = logging.getLogger("metisclip.render-worker")
        lg.propagate = False
        lg.setLevel(logging.INFO)
        h = RotatingFileHandler(get_paths().logs_dir / "render.log", maxBytes=5 * 1024 * 1024, backupCount=2, encoding="utf-8")
        h.setFormatter(logging.Formatter("%(asctime)s %(message)s"))
        h.addFilter(redactor)
        lg.addHandler(h)
        _render_log = lg
    return _render_log


def file_url(rel: str) -> str:
    rel = rel.replace("\\", "/").lstrip("/")
    return f"{config.base_url}/api/files/{quote(rel)}?token={config.token}"


def resolve_assets(value: Any) -> Any:
    """Turn every `asset://<relative path>` into an engine URL (for the render worker)."""
    if isinstance(value, dict):
        return {k: resolve_assets(v) for k, v in value.items()}
    if isinstance(value, list):
        return [resolve_assets(v) for v in value]
    if isinstance(value, str) and value.startswith("asset://"):
        return file_url(value[len("asset://"):])
    return value


def template_for(clip: dict[str, Any]) -> dict[str, Any]:
    """The clip's brand template document ({} = built-in defaults)."""
    from backend.services import brand_templates

    return brand_templates.for_clip(clip) or {}


def effective_style(clip: dict[str, Any], bt: dict[str, Any] | None = None) -> dict[str, Any]:
    bt = bt if bt is not None else template_for(clip)
    style = {**(bt.get("caption_settings") or {}), **(clip.get("subtitle_style") or {})}
    style.pop("ai", None)  # the clip's AI override lives in subtitle_style.ai (see effective_ai)
    return style


# Keep in sync with frontend/lib/presets/captions.ts DEFAULT_AI_SETTINGS.
DEFAULT_AI_SETTINGS: dict[str, bool] = {"fillerWords": True, "pauses": False, "keywords": True, "emojis": False}


def clean_ai(raw: Any) -> dict[str, bool]:
    """Only the known AI subtitle flags, as booleans."""
    if not isinstance(raw, dict):
        return {}
    return {k: bool(raw[k]) for k in DEFAULT_AI_SETTINGS if isinstance(raw.get(k), bool)}


def effective_ai(clip: dict[str, Any] | None, bt: dict[str, Any] | None) -> dict[str, bool]:
    """AI subtitle settings: defaults ⊕ brand template ai_settings ⊕ the clip's subtitle_style.ai."""
    clip_ai = ((clip or {}).get("subtitle_style") or {}).get("ai")
    return {**DEFAULT_AI_SETTINGS, **clean_ai((bt or {}).get("ai_settings")), **clean_ai(clip_ai)}


def media_url(clip_id: str, kind: str) -> str:
    return f"{config.base_url}/api/clips/{clip_id}/media/{kind}?token={config.token}"


def source_aspect(clip: dict[str, Any]) -> float:
    w, h = clip.get("source_width"), clip.get("source_height")
    return round(w / h, 5) if isinstance(w, int) and isinstance(h, int) and w > 0 and h > 0 else round(16 / 9, 5)


def channel_name(clip: dict[str, Any]) -> str:
    if not clip.get("source_video_id"):
        return ""
    sv = get_db().source_videos.find_one({"_id": clip["source_video_id"]}, {"channel_name": 1})
    return str((sv or {}).get("channel_name") or "")


def build_props(clip: dict[str, Any]) -> dict[str, Any]:
    bt = template_for(clip)
    # The mode is already the one picked for the clip's content when the smart layout is on
    lay = layout_svc.render_layout(clip, bt)
    props: dict[str, Any] = {
        "videoUrl": media_url(clip["_id"], "raw"),
        "words": (clip.get("subtitle") or {}).get("words") or [],
        "style": effective_style(clip, bt),
        "brandSettings": resolve_assets(bt.get("brand_settings") or {}),
        "ai": effective_ai(clip, bt),
        # Source length; the composition shortens itself when pauses/filler words are cut
        "durationInFrames": max(1, int(round(float(clip.get("duration_seconds") or 1) * FPS))),
        "layout": resolve_assets(lay),
        "title": clip.get("hook_text") or "",
        "clipId": clip["_id"],  # picks where the companion loop starts (split layout)
    }
    # The chosen cover (seconds of raw.mp4): the composition reports which output frame shows it
    if clip.get("cover_time") is not None:
        props["coverTime"] = float(clip["cover_time"])
    # Podcast, card, duo and auto layouts: the original-ratio cut (same timeline as raw.mp4); without
    # one the clip stays full. Duo and auto also need the shots of the face scan.
    if layout_svc.needs_source(lay) and (clip.get("files") or {}).get("source"):
        props["sourceUrl"] = media_url(clip["_id"], "source")
        props["sourceAspect"] = source_aspect(clip)
        props["channel"] = channel_name(clip)
        if layout_svc.needs_faces(lay):
            props["scenes"] = layout_svc.scene_info(clip)
    return props


def _clip_out_dir(clip: dict[str, Any]) -> Path:
    paths = get_paths()
    raw = (clip.get("files") or {}).get("raw")
    if raw:
        return paths.from_relative(raw).parent
    from backend.services.campaigns import get as get_campaign, slug_of

    return paths.clip_dir(slug_of(get_campaign(clip.get("campaign_id"))), clip["_id"])


def _publish(render_id: str, clip_id: str, status: str, **extra: Any) -> None:
    events.publish({"type": "render.status", "id": render_id, "clip_id": clip_id, "status": status, **extra})


def loudness_on() -> bool:
    """Pengaturan → Folder ekspor → "Samakan volume suara": exported audio leveled to about -14 LUFS."""
    from backend.core.settings_store import get_settings

    return bool(get_settings()["export"].get("loudness", True))


def fingerprint(props: dict[str, Any], loudness: bool | None = None) -> str:
    """What a render's video depends on, as a hash: its props without the chosen cover (a cover can be
    taken from the video afterwards) and without this launch's port and token, whether its sound is
    leveled (`loudness`, the current setting when None), plus the app version (presets, fonts and the
    composition change with it). Equal fingerprints render the same video."""
    data = {k: v for k, v in props.items() if k != "coverTime"}
    data["_loudness"] = loudness_on() if loudness is None else bool(loudness)
    text = json.dumps(data, sort_keys=True, ensure_ascii=False, default=str)
    for volatile in (config.base_url, config.token):
        if volatile:
            text = text.replace(volatile, "")
    return hashlib.sha256(f"{config.version}\n{text}".encode("utf-8")).hexdigest()


def kept_frames(raw: Any) -> list[list[int]] | None:
    """The kept frames a render reported ([output from, start frame, end frame] per segment of raw.mp4),
    checked; None when missing or malformed."""
    if not isinstance(raw, list):
        return None
    out: list[list[int]] = []
    for item in raw:
        if not (isinstance(item, (list, tuple)) and len(item) == 3 and all(isinstance(v, (int, float)) for v in item)):
            return None
        out.append([int(v) for v in item])
    return out


def output_frame_at(frames: list[list[int]], total: int, time: float) -> int:
    """The output frame of final.mp4 that shows `time` seconds of raw.mp4: a port of outputFrameAt
    (frontend/lib/presets/captions.ts), clamped as render-engine/src/Root.tsx does. A time inside a cut
    gives the next kept frame, a time past the end the last frame."""
    f = max(0, math.floor(time * FPS + 0.5))  # JavaScript's Math.round, not Python's round-half-even
    frame = f
    if frames:
        for out_from, start, end in frames:
            if f < start:
                frame = out_from
                break
            if f < end:
                frame = out_from + (f - start)
                break
        else:
            out_from, start, end = frames[-1]
            frame = max(0, out_from + (end - start) - 1)
    return max(0, min(int(total) - 1, frame))


def final_current(clip: dict[str, Any]) -> bool:
    """True when the clip's final.mp4 exists and was rendered from what the clip and its template say
    now (the cover aside): an export can then copy it instead of rendering again (gap analysis B7)."""
    rel = (clip.get("files") or {}).get("final")
    info = clip.get("final_render") or {}
    if not rel or not info.get("fingerprint") or not get_paths().from_relative(rel).is_file():
        return False
    try:
        return fingerprint(build_props(clip)) == info["fingerprint"]
    except Exception as exc:  # a broken template or face scan: render again rather than guess
        logger.warning("Render inputs of clip %s not read: %s", clip.get("_id"), exc)
        return False


def _make_cover(clip: dict[str, Any], final: Path, cover_frame: Any) -> str | None:
    """The chosen cover as cover.jpg next to final.mp4: the output frame that shows the clip's cover_time
    (cuts of filler words and pauses move it). None without a chosen cover; a stale cover.jpg is removed
    then. Never fails the render or the export."""
    cover = final.with_name("cover.jpg")
    if clip.get("cover_time") is None or not isinstance(cover_frame, (int, float)) or cover_frame < 0:
        cover.unlink(missing_ok=True)
        return None
    tmp = final.with_name("cover.new.jpg")
    try:
        # Half a frame in, so the seek never lands on the frame before
        ffmpeg_ops.thumbnail(final, tmp, (float(cover_frame) + 0.5) / FPS, None)
        os.replace(tmp, cover)  # a new file: another campaign's hard link keeps its own cover
    except Exception as exc:
        tmp.unlink(missing_ok=True)
        logger.warning("Cover of clip %s not made: %s", clip["_id"], exc)
        return None
    return get_paths().to_relative(cover)


def cover_from_final(clip: dict[str, Any]) -> str | None:
    """Take the clip's chosen cover from its current final.mp4 now, without a render (a cover chosen
    after the render, or before final.mp4 is copied again). Saves and returns files.cover: None without
    a chosen cover, or when final.mp4 or its kept frames are missing."""
    info = clip.get("final_render") or {}
    rel = (clip.get("files") or {}).get("final")
    frames = kept_frames(info.get("frames"))
    frame = None
    if rel and frames is not None and info.get("total_frames") and clip.get("cover_time") is not None:
        frame = output_frame_at(frames, int(info["total_frames"]), float(clip["cover_time"]))
    cover_rel = _make_cover(clip, get_paths().from_relative(rel), frame) if rel else None
    changes: dict[str, Any] = {"files.cover": cover_rel}
    if clip.get("final_render"):
        changes["final_render.cover_time"] = clip.get("cover_time") if cover_rel else None
    get_db().clips.update_one({"_id": clip["_id"]}, {"$set": changes})
    return cover_rel


def _copy_to_exports(render_id: str, clip: dict[str, Any]) -> dict[str, Any]:
    """Copy the clip's final.mp4 (with its cover and post text) to the export folder. A failed copy
    (folder gone, no space, file open in a player) is returned as `export_error`, never raised."""
    from backend.services import exports

    exported_path: str | None = None
    export_error: str | None = None
    export_dir = str(exports.default_dir())
    try:
        folder = exports.check_dest(None)
        export_dir = str(folder)
        exported_path = str(exports.copy_final(clip, folder))
    except exports.ExportError as exc:
        export_error = str(exc)
        logger.warning("Render %s: copy to the export folder failed: %s", render_id, exc)
    final = get_paths().from_relative(clip["files"]["final"])
    return {"output_path": str(final), "exported_path": exported_path, "export_dir": export_dir,
            "export_error": export_error}


def _finish(render_id: str, clip: dict[str, Any], rendered: Path, done: dict[str, Any] | None = None,
            props_fingerprint: str | None = None, loudness: dict[str, float] | None = None) -> None:
    """Move the rendered file to the clip's final.mp4, copy it to the export folder, mark the job completed.

    `done` is the worker's last line (the cover's output frame and the kept frames). A failed copy does
    not fail the render: the job is completed with `export_error`, and the editor offers to copy again
    or to pick another folder."""
    done = done or {}
    db = get_db()
    paths = get_paths()
    clip_id = clip["_id"]
    out_dir = _clip_out_dir(clip)
    out_dir.mkdir(parents=True, exist_ok=True)
    final = out_dir / "final.mp4"
    os.replace(rendered, final)
    rel = paths.to_relative(final)
    frames = kept_frames(done.get("frames"))
    total = done.get("total_frames") if isinstance(done.get("total_frames"), int) else None
    # The cover chosen now: the frame the composition reported when the choice did not change during the
    # render, else the same mapping over the kept frames (a cover needs no render of its own)
    current = db.clips.find_one({"_id": clip_id}, {"cover_time": 1}) or {}
    cover_time = current.get("cover_time")
    if cover_time == clip.get("cover_time"):
        frame = done.get("cover_frame")
    elif cover_time is not None and frames is not None and total:
        frame = output_frame_at(frames, total, float(cover_time))
    else:
        frame = None
    cover_rel = _make_cover({**clip, "cover_time": cover_time}, final, frame)
    final_render = {
        "fingerprint": props_fingerprint,
        "frames": frames,
        "total_frames": total,
        "cover_time": cover_time if cover_rel else None,
        "loudness": loudness,
        "at": utcnow(),
    }
    db.clips.update_one({"_id": clip_id}, {"$set": {"files.final": rel, "files.cover": cover_rel,
                                                     "final_render": final_render,
                                                     "status": "exported", "updated_at": utcnow()}})
    files = {**(clip.get("files") or {}), "final": rel, "cover": cover_rel}
    result = {**_copy_to_exports(render_id, {**clip, "cover_time": cover_time, "files": files}), "loudness": loudness}
    db.render_jobs.update_one(
        {"_id": render_id},
        {"$set": {"status": "completed", "progress_pct": 100.0, "finished_at": utcnow(), **result}},
    )
    events.publish({"type": "clip.updated", "id": clip_id})
    _publish(render_id, clip_id, "completed", **result)


def _level_loudness(render_id: str, clip_id: str, video: Path, work: Path,
                    cancel: procs.CancelToken) -> dict[str, float] | None:
    """Level the rendered video's sound to about -14 LUFS in place (gap analysis B8): measured on the
    output itself, after cut pauses and filler words. Returns {"before", "after"}, or None when the sound
    was left as it was (silence, already there) or leveling failed: that never fails the render."""
    events.publish({"type": "render.progress", "id": render_id, "clip_id": clip_id, "status": "rendering",
                    "progress_pct": 99.0, "message": M("loudness")})
    leveled = work / "final.leveled.mp4"
    try:
        result = ffmpeg_ops.normalize_loudness(video, leveled, cancel)
        if result is not None:
            os.replace(leveled, video)
        return result
    except procs.Cancelled:
        raise
    except Exception as exc:
        leveled.unlink(missing_ok=True)
        logger.warning("Render %s: loudness not leveled: %s", render_id, exc)
        return None


def reuse_final(clip: dict[str, Any]) -> dict[str, Any]:
    """An export without a render (gap analysis B7): nothing changed since final.mp4 was rendered (see
    `final_current`), so it is copied to the export folder again, with its cover (taken from it now when
    the choice changed) and the current post text. Returns a completed render job marked `reused`, which
    the editor and the gallery show like a finished render."""
    from backend.models.documents import RenderJobDoc

    db = get_db()
    paths = get_paths()
    clip_id = clip["_id"]
    files = dict(clip.get("files") or {})
    info = clip.get("final_render") or {}
    cover_file = files.get("cover")
    cover_ok = bool(cover_file) and paths.from_relative(cover_file).is_file()
    if clip.get("cover_time") != info.get("cover_time") or (clip.get("cover_time") is not None and not cover_ok):
        files["cover"] = cover_from_final(clip)
    now = utcnow()
    doc = RenderJobDoc(_id=new_id(), clip_id=clip_id, status="completed", progress_pct=100.0, reused=True,
                       loudness=info.get("loudness"), started_at=now, finished_at=now).to_mongo()
    doc.update(_copy_to_exports(doc["_id"], {**clip, "files": files}))
    db.render_jobs.insert_one(doc)
    db.clips.update_one({"_id": clip_id}, {"$set": {"status": "exported", "updated_at": now}})
    events.publish({"type": "clip.updated", "id": clip_id})
    _publish(doc["_id"], clip_id, "completed", reused=True, loudness=doc["loudness"], output_path=doc["output_path"],
             exported_path=doc["exported_path"], export_dir=doc["export_dir"], export_error=doc["export_error"])
    return doc


def run_render(render_id: str, cancel: procs.CancelToken) -> None:
    db = get_db()
    rj = db.render_jobs.find_one_and_update(
        {"_id": render_id, "status": "queued"},
        {"$set": {"status": "rendering", "started_at": utcnow(), "progress_pct": 0.0}},
        return_document=True,
    )
    if not rj:
        return
    clip_id = rj["clip_id"]
    clip = db.clips.find_one({"_id": clip_id})
    if not clip or not (clip.get("files") or {}).get("raw"):
        missing = M("clip_missing")
        db.render_jobs.update_one({"_id": render_id}, {"$set": {"status": "failed", "error": missing, "finished_at": utcnow()}})
        _publish(render_id, clip_id, "failed", error=missing)
        return
    db.clips.update_one({"_id": clip_id}, {"$set": {"status": "rendering", "updated_at": utcnow()}})
    events.publish({"type": "clip.updated", "id": clip_id})
    _publish(render_id, clip_id, "rendering")

    paths = get_paths()
    work = cache.claim(f"render-{render_id}")
    props_path = work / "props.json"
    tmp_out = work / "final.mp4"
    error: str | None = None
    status = "failed"
    try:
        def step(message: str) -> None:
            events.publish({"type": "render.progress", "id": render_id, "clip_id": clip_id,
                            "status": "rendering", "progress_pct": 0.0, "message": message})

        lay = layout_svc.effective_layout(clip, template_for(clip))
        # Layout otomatis sesuai konten: the clip's content picks its layout, so it is read first
        # (clips made before their face scan was kept get it now)
        if layout_svc.smart_on(lay) and layout_svc.content_profile(clip) is None:
            try:
                clip = layout_svc.prepare_faces(clip, cancel, on_step=step)
            except layout_svc.SourceError as exc:
                raise RuntimeError(M("needs_faces", name=layout_svc.mode_name("smart"), error=exc)) from exc
            cancel.check()
        lay = layout_svc.apply_smart(lay, clip)
        problem = layout_svc.companion_problem(lay)
        if problem:
            raise RuntimeError(problem)

        # Clips made before these layouts did not keep their original-ratio video or their face scan
        name = layout_svc.mode_name(str(lay.get("mode")))
        if layout_svc.needs_source(lay) and not layout_svc.source_path(clip):
            try:
                clip = layout_svc.prepare_source(clip, cancel, on_step=step)
            except layout_svc.SourceError as exc:
                raise RuntimeError(M("needs_source", name=name, error=exc)) from exc
            cancel.check()
        if layout_svc.needs_faces(lay) and not layout_svc.scene_info(clip):
            try:
                clip = layout_svc.prepare_faces(clip, cancel, on_step=step)
            except layout_svc.SourceError as exc:
                raise RuntimeError(M("needs_faces", name=name, error=exc)) from exc
            cancel.check()
        props = build_props(clip)
        props_path.write_text(json.dumps(props, ensure_ascii=False), encoding="utf-8")
        # Read once: the video is leveled (or not) as the setting said when it started
        level = loudness_on()
        props_fingerprint = fingerprint(props, level)
        script = paths.render_dir / "dist" / "render.js"
        if not script.exists():
            raise RuntimeError(M("no_worker"))
        prefix, extra_env = node_command()
        cmd = prefix + [str(script), "--props", str(props_path), "--out", str(tmp_out), "--gl", "angle"]
        bundle = paths.render_dir / "build"
        if bundle.exists():
            cmd += ["--bundle", str(bundle)]
        if config.browser_path and Path(config.browser_path).exists():
            cmd += ["--browser", config.browser_path]

        def waiting(info: resources.WaitInfo) -> None:
            events.publish({"type": "render.progress", "id": render_id, "clip_id": clip_id,
                            "status": "rendering", "progress_pct": 0.0, "message": info.message()})

        # The RAM guard sizes the render: Chrome tabs that fit, the lean encoder and frame cache
        extra = resources.LAYOUT_RENDER_MB.get(str(lay.get("mode")), 0)
        with resources.render_slot(cancel=cancel, on_wait=waiting, extra_mb=extra) as tabs:
            low = tabs is not None
            if tabs is not None:
                cmd += ["--concurrency", str(tabs),
                        "--encoder-threads", str(resources.RENDER_ENCODER_THREADS),
                        "--media-cache-mb", str(resources.RENDER_MEDIA_CACHE_MB)]
            with workload.rendering():  # local Whisper waits until the export is done
                error, ok, info = _run_worker(cmd, extra_env, render_id, clip_id, cancel, low_priority=low)
        cancel.check()
        if ok and tmp_out.exists() and tmp_out.stat().st_size > 0:
            loudness = _level_loudness(render_id, clip_id, tmp_out, work, cancel) if level else None
            _finish(render_id, clip, tmp_out, info, props_fingerprint, loudness)
            status = "completed"
            return
        error = error or M("no_message")
    except procs.Cancelled:
        status = "cancelled"
    except Exception as exc:
        logger.exception("Render %s failed", render_id)
        error = str(exc)
    finally:
        cache.release(work)
        if status != "completed":
            db.render_jobs.update_one(
                {"_id": render_id},
                {"$set": {"status": status, "error": None if status == "cancelled" else (error or "")[:1000], "finished_at": utcnow()}},
            )
            from backend.core.queue import _restore_clip_status

            _restore_clip_status(clip_id)
            _publish(render_id, clip_id, status, error=None if status == "cancelled" else error)


def _run_worker(cmd: list[str], extra_env: dict[str, str], render_id: str, clip_id: str,
                cancel: procs.CancelToken, low_priority: bool = False) -> tuple[str | None, bool, dict[str, Any]]:
    """Run the render worker. Returns its error, whether it finished, and its final `done` line."""
    rlog = _rlog()
    rlog.info("[%s] start: %s", render_id, " ".join(cmd))
    # Below-normal priority is inherited by Chrome and the encoder the worker starts
    proc = procs.popen(cmd, cancel=cancel, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                       env=extra_env, cwd=get_paths().render_dir, low_priority=low_priority)
    stderr_tail: deque[str] = deque(maxlen=40)

    def drain() -> None:
        for line in procs.iter_lines(proc.stderr):  # type: ignore[arg-type]
            stderr_tail.append(line)
            rlog.info("[%s] %s", render_id, line)

    t = threading.Thread(target=drain, daemon=True)
    t.start()
    error: str | None = None
    done = False
    info: dict[str, Any] = {}
    last_write = 0.0
    db = get_db()
    try:
        for line in procs.iter_lines(proc.stdout):  # type: ignore[arg-type]
            line = line.strip()
            if not line.startswith("{"):
                if line:
                    rlog.info("[%s] stdout: %s", render_id, line)
                continue
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                continue
            kind = msg.get("type")
            if kind == "progress":
                pct = round(max(0.0, min(1.0, float(msg.get("progress", 0)))) * 100, 1)
                now = time.monotonic()
                if now - last_write > 0.5 or pct >= 100:
                    last_write = now
                    db.render_jobs.update_one({"_id": render_id}, {"$set": {"progress_pct": pct}})
                    events.publish({"type": "render.progress", "id": render_id, "clip_id": clip_id,
                                    "status": "rendering", "progress_pct": pct})
            elif kind == "done":
                done = True
                info = msg
            elif kind == "error":
                error = str(msg.get("message") or M("failed"))
        code = proc.wait()
        t.join(timeout=5)
    finally:
        procs.release(proc, cancel)
    rlog.info("[%s] exit code %s", render_id, code)
    if cancel.cancelled:
        raise procs.Cancelled(cancel.reason)
    if code != 0 and not error:
        error = "\n".join(list(stderr_tail)[-5:]) or M("exit_code", code=code)
    return error, (code == 0 and (done or error is None)), info
