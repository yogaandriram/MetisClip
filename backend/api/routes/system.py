"""System info, dependency check, storage usage, backups."""
from __future__ import annotations

import os
import shutil
from pathlib import Path

import psutil
from fastapi import APIRouter
from starlette.concurrency import run_in_threadpool

from backend.agents.tools import ffmpeg_ops, whisper_local, ytdlp
from backend.api.dto import http_error
from backend.core import db as dbm
from backend.core import procs
from backend.core.config import config, deno_path, mongod_path, node_command
from backend.core.db import get_db
from backend.core.paths import get_paths
from backend.services import backup

router = APIRouter(prefix="/api/system", tags=["system"])


def _dir_size(path: Path) -> int:
    total = 0
    if not path.exists():
        return 0
    for root, _dirs, files in os.walk(path):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(root, f))
            except OSError:
                pass
    return total


def _export_dir() -> str:
    try:
        from backend.core.settings_store import get_settings

        return get_settings()["export_dir"]
    except Exception:
        return str(get_paths().exports_dir)


@router.get("/info")
def info():
    paths = get_paths()
    return {
        "version": config.version,
        "env": "dev" if config.is_dev else "production",
        "data_root": str(paths.data_root),
        "library_dir": str(paths.library_dir),
        "export_dir": _export_dir(),
        "logs_dir": str(paths.logs_dir),
        "mongo": {"ok": dbm.ping(), "version": dbm.server_version()},
    }


def _tool_version(cmd: list[str]) -> str | None:
    try:
        out = procs.run(cmd, timeout=30).stdout.decode("utf-8", "replace").strip()
        return out.splitlines()[0] if out else None
    except Exception:
        return None


def _check() -> dict:
    paths = get_paths()
    items = []
    ff = ffmpeg_ops.ffmpeg_version()
    items.append({"key": "ffmpeg", "label": "FFmpeg", "ok": bool(ff), "version": ff,
                  "detail": None if ff else "FFmpeg tidak ditemukan"})
    yv = ytdlp.version()
    items.append({"key": "ytdlp", "label": "yt-dlp", "ok": bool(yv), "version": yv,
                  "detail": None if yv else "yt-dlp tidak ditemukan"})
    dp = deno_path()
    dv = _tool_version([dp, "--version"]) if dp else None
    items.append({"key": "deno", "label": "Deno (JS runtime yt-dlp)", "ok": bool(dv), "version": dv,
                  "detail": None if dv else "Deno tidak ditemukan; sebagian video YouTube mungkin gagal diunduh"})
    items.append({"key": "mongodb", "label": "MongoDB", "ok": dbm.ping(), "version": dbm.server_version(),
                  "detail": None if mongod_path() or config.mongodb_uri else "mongod.exe tidak ditemukan di folder bin"})
    try:
        prefix, _env = node_command()
        render_ok = (paths.render_dir / "dist" / "render.js").exists()
        items.append({"key": "render", "label": "Render engine (Remotion)", "ok": render_ok, "version": None,
                      "detail": None if render_ok else "render-engine/dist/render.js belum di-build"})
    except FileNotFoundError as exc:
        items.append({"key": "render", "label": "Render engine (Remotion)", "ok": False, "version": None, "detail": str(exc)})
    wv = whisper_local.version()
    needed = {whisper_local.chosen_model(words=False), whisper_local.chosen_model(words=True)}
    missing = [m for m in needed if not whisper_local.installed(m)]
    w_detail = None
    if not wv:
        w_detail = "Whisper lokal tidak ditemukan di folder bin; transkripsi hanya lewat Groq"
    elif missing:
        names = " dan ".join(f"{m.label} ({m.size_bytes / 1024**2:.0f} MB)" for m in missing)
        w_detail = f"Model {names} diunduh saat pertama dipakai, atau dari Pengaturan"
    items.append({"key": "whisper", "label": "Whisper lokal (whisper.cpp)", "ok": bool(wv), "version": wv, "detail": w_detail})
    try:
        import mediapipe  # noqa: F401
        import cv2

        items.append({"key": "mediapipe", "label": "MediaPipe / OpenCV", "ok": True, "version": cv2.__version__, "detail": None})
    except Exception as exc:
        items.append({"key": "mediapipe", "label": "MediaPipe / OpenCV", "ok": False, "version": None, "detail": str(exc)})
    lib_ok = os.access(paths.library_dir, os.W_OK)
    items.append({"key": "library", "label": "Folder library dapat ditulis", "ok": lib_ok, "version": None,
                  "detail": str(paths.library_dir)})
    try:
        free = shutil.disk_usage(paths.data_root).free
    except OSError:
        free = 0
    items.append({"key": "disk", "label": "Ruang disk kosong", "ok": free >= 5 * 1024**3, "version": None,
                  "detail": f"{free / 1024**3:.1f} GB kosong" + ("" if free >= 5 * 1024**3 else " (disarankan ≥ 5 GB)")})
    return {
        "items": items,
        "encoders": ffmpeg_ops.detect_hw_encoders() + ["libx264"],
        "cpu_count": psutil.cpu_count(logical=False) or os.cpu_count() or 1,
        "ram_gb": round(psutil.virtual_memory().total / 1024**3, 1),
    }


@router.get("/check")
async def check():
    return await run_in_threadpool(_check)


def _storage() -> dict:
    paths = get_paths()
    try:
        du = shutil.disk_usage(paths.data_root)
        free, total = du.free, du.total
    except OSError:
        free = total = 0
    per_agent = []
    for agent in get_db().super_agents.find({}, {"name": 1, "slug": 1}):
        slug = agent.get("slug")
        per_agent.append({"agent_id": agent["_id"], "name": agent.get("name", ""),
                          "bytes": _dir_size(paths.agent_library(slug)) if slug else 0})
    return {
        "data_root": str(paths.data_root),
        "drive_free_bytes": free,
        "drive_total_bytes": total,
        "db_bytes": _dir_size(paths.db_dir),
        "library_bytes": _dir_size(paths.library_dir),
        "cache_bytes": _dir_size(paths.cache_dir),
        "backups_bytes": _dir_size(paths.backups_dir),
        "models_bytes": _dir_size(paths.models_dir),
        "per_agent": per_agent,
    }


@router.post("/update-ytdlp")
async def update_ytdlp():
    from backend.core.queue import runner

    if runner.has_active_jobs():
        raise http_error(409, "Tunggu job yang sedang berjalan selesai sebelum memperbarui yt-dlp")
    return await run_in_threadpool(ytdlp.self_update)


@router.get("/storage")
async def storage():
    return await run_in_threadpool(_storage)


@router.post("/backup")
async def make_backup():
    try:
        return {"backup": await run_in_threadpool(backup.write_backup, "manual")}
    except Exception as exc:
        raise http_error(500, f"Backup gagal: {exc}")


@router.get("/backups")
def backups():
    return {"backups": backup.list_backups()}


@router.post("/purge-cache")
def purge_cache():
    """Deletes cache files of jobs/renders that are not running."""
    from backend.core.queue import runner

    paths = get_paths()
    removed = 0
    if paths.cache_dir.exists():
        for child in paths.cache_dir.iterdir():
            name = child.name
            if name.startswith("job-") and runner.is_running(name[4:]):
                continue
            if name.startswith("render-"):
                continue
            try:
                if child.is_dir():
                    removed += _dir_size(child)
                    shutil.rmtree(child, ignore_errors=True)
                else:
                    removed += child.stat().st_size
                    child.unlink()
            except OSError:
                pass
    return {"ok": True, "freed_bytes": removed}
