"""Export render: Remotion worker (render-engine/dist/render.js) run via Electron-as-Node.

Contract: docs/desktop-contract.md §7. Output lands in
<DATA_ROOT>\\library\\<agent>\\<clip_id>\\final.mp4 and is then copied to the export folder
(Pengaturan → Folder ekspor), see `services.exports`.
"""
from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import threading
import time
from collections import deque
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any
from urllib.parse import quote

from backend.core import events, procs, resources, workload
from backend.core.config import config, node_command
from backend.core.db import get_db, utcnow
from backend.core.logging_setup import redactor
from backend.core.paths import get_paths, slugify
from backend.services import layout as layout_svc

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
    lay = layout_svc.effective_layout(clip, bt)
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
    # Podcast, card and duo layouts: the original-ratio cut (same timeline as raw.mp4); without one the
    # clip stays full. Duo also needs the shots with two speakers from the face scan.
    if layout_svc.needs_source(lay) and (clip.get("files") or {}).get("source"):
        props["sourceUrl"] = media_url(clip["_id"], "source")
        props["sourceAspect"] = source_aspect(clip)
        props["channel"] = channel_name(clip)
        if layout_svc.needs_faces(lay):
            props["duo"] = layout_svc.duo_info(clip)
    return props


def _clip_out_dir(clip: dict[str, Any]) -> Path:
    paths = get_paths()
    raw = (clip.get("files") or {}).get("raw")
    if raw:
        return paths.from_relative(raw).parent
    agent = get_db().super_agents.find_one({"_id": clip.get("agent_id")}, {"slug": 1, "name": 1}) if clip.get("agent_id") else None
    slug = (agent or {}).get("slug") or slugify((agent or {}).get("name") or "") if agent else "_tanpa-workspace"
    return paths.clip_dir(slug, clip["_id"])


def _publish(render_id: str, clip_id: str, status: str, **extra: Any) -> None:
    events.publish({"type": "render.status", "id": render_id, "clip_id": clip_id, "status": status, **extra})


def _finish(render_id: str, clip: dict[str, Any], rendered: Path) -> None:
    """Move the rendered file to the clip's final.mp4, copy it to the export folder, mark the job completed.

    A failed copy (folder gone, no space, file open in a player) does not fail the render: the job is
    completed with `export_error`, and the editor offers to copy again or to pick another folder."""
    from backend.services import exports

    db = get_db()
    paths = get_paths()
    clip_id = clip["_id"]
    out_dir = _clip_out_dir(clip)
    out_dir.mkdir(parents=True, exist_ok=True)
    final = out_dir / "final.mp4"
    os.replace(rendered, final)
    rel = paths.to_relative(final)
    db.clips.update_one({"_id": clip_id}, {"$set": {"files.final": rel, "status": "exported", "updated_at": utcnow()}})

    exported_path: str | None = None
    export_error: str | None = None
    export_dir = str(exports.default_dir())
    try:
        folder = exports.check_dest(None)
        export_dir = str(folder)
        exported_path = str(exports.copy_final({**clip, "files": {**(clip.get("files") or {}), "final": rel}}, folder))
    except exports.ExportError as exc:
        export_error = str(exc)
        logger.warning("Render %s: copy to the export folder failed: %s", render_id, exc)

    result = {"output_path": str(final), "exported_path": exported_path, "export_dir": export_dir,
              "export_error": export_error}
    db.render_jobs.update_one(
        {"_id": render_id},
        {"$set": {"status": "completed", "progress_pct": 100.0, "finished_at": utcnow(), **result}},
    )
    events.publish({"type": "clip.updated", "id": clip_id})
    _publish(render_id, clip_id, "completed", **result)


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
        db.render_jobs.update_one({"_id": render_id}, {"$set": {"status": "failed", "error": "Klip atau file raw tidak ditemukan", "finished_at": utcnow()}})
        _publish(render_id, clip_id, "failed", error="Klip atau file raw tidak ditemukan")
        return
    db.clips.update_one({"_id": clip_id}, {"$set": {"status": "rendering", "updated_at": utcnow()}})
    events.publish({"type": "clip.updated", "id": clip_id})
    _publish(render_id, clip_id, "rendering")

    paths = get_paths()
    work = paths.cache_dir / f"render-{render_id}"
    work.mkdir(parents=True, exist_ok=True)
    props_path = work / "props.json"
    tmp_out = work / "final.mp4"
    error: str | None = None
    status = "failed"
    try:
        lay = layout_svc.effective_layout(clip, template_for(clip))
        problem = layout_svc.companion_problem(lay)
        if problem:
            raise RuntimeError(problem)
        def step(message: str) -> None:
            events.publish({"type": "render.progress", "id": render_id, "clip_id": clip_id,
                            "status": "rendering", "progress_pct": 0.0, "message": message})

        # Clips made before these layouts did not keep their original-ratio video or their face scan
        name = layout_svc.MODE_NAMES.get(str(lay.get("mode")), "ini")
        if layout_svc.needs_source(lay) and not layout_svc.source_path(clip):
            try:
                clip = layout_svc.prepare_source(clip, cancel, on_step=step)
            except layout_svc.SourceError as exc:
                raise RuntimeError(f"Layout {name} butuh video sumber: {exc}") from exc
            cancel.check()
        if layout_svc.needs_faces(lay) and not layout_svc.duo_info(clip):
            try:
                clip = layout_svc.prepare_faces(clip, cancel, on_step=step)
            except layout_svc.SourceError as exc:
                raise RuntimeError(f"Layout {name} butuh analisis wajah: {exc}") from exc
            cancel.check()
        props_path.write_text(json.dumps(build_props(clip), ensure_ascii=False), encoding="utf-8")
        script = paths.render_dir / "dist" / "render.js"
        if not script.exists():
            raise RuntimeError("Render worker tidak ditemukan (render-engine/dist/render.js). Jalankan build render-engine.")
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
                error, ok = _run_worker(cmd, extra_env, render_id, clip_id, cancel, low_priority=low)
        cancel.check()
        if ok and tmp_out.exists() and tmp_out.stat().st_size > 0:
            _finish(render_id, clip, tmp_out)
            status = "completed"
            return
        error = error or "Render gagal tanpa pesan error"
    except procs.Cancelled:
        status = "cancelled"
    except Exception as exc:
        logger.exception("Render %s failed", render_id)
        error = str(exc)
    finally:
        shutil.rmtree(work, ignore_errors=True)
        if status != "completed":
            db.render_jobs.update_one(
                {"_id": render_id},
                {"$set": {"status": status, "error": None if status == "cancelled" else (error or "")[:1000], "finished_at": utcnow()}},
            )
            from backend.core.queue import _restore_clip_status

            _restore_clip_status(clip_id)
            _publish(render_id, clip_id, status, error=None if status == "cancelled" else error)


def _run_worker(cmd: list[str], extra_env: dict[str, str], render_id: str, clip_id: str,
                cancel: procs.CancelToken, low_priority: bool = False) -> tuple[str | None, bool]:
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
            elif kind == "error":
                error = str(msg.get("message") or "Render gagal")
        code = proc.wait()
        t.join(timeout=5)
    finally:
        procs.release(proc, cancel)
    rlog.info("[%s] exit code %s", render_id, code)
    if cancel.cancelled:
        raise procs.Cancelled(cancel.reason)
    if code != 0 and not error:
        error = "\n".join(list(stderr_tail)[-5:]) or f"Render worker keluar dengan kode {code}"
    return error, (code == 0 and (done or error is None))
