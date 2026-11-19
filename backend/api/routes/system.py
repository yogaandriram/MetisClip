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
from backend.core import acl, cache, procs, resources
from backend.core.config import config, deno_path, mongod_path, node_command
from backend.core.db import get_db
from backend.core.paths import get_paths
from backend.services import activity, backup
from backend.core import i18n

M = i18n.messages({
    "ffmpeg_missing": {
        "id": "FFmpeg tidak ditemukan",
        "en": "FFmpeg was not found",
    },
    "ytdlp_missing": {
        "id": "yt-dlp tidak ditemukan",
        "en": "yt-dlp was not found",
    },
    "deno_label": {
        "id": "Deno (JS runtime yt-dlp)",
        "en": "Deno (yt-dlp's JS runtime)",
    },
    "deno_missing": {
        "id": "Deno tidak ditemukan; sebagian video YouTube mungkin gagal diunduh",
        "en": "Deno was not found; some YouTube videos may fail to download",
    },
    "mongod_missing": {
        "id": "mongod.exe tidak ditemukan di folder bin",
        "en": "mongod.exe was not found in the bin folder",
    },
    "render_not_built": {
        "id": "render-engine/dist/render.js belum di-build",
        "en": "render-engine/dist/render.js is not built yet",
    },
    "whisper_label": {
        "id": "Whisper lokal (whisper.cpp)",
        "en": "Local Whisper (whisper.cpp)",
    },
    "whisper_missing": {
        "id": "Whisper lokal tidak ditemukan di folder bin; transkripsi hanya lewat Groq",
        "en": "Local Whisper was not found in the bin folder; transcription only works through Groq",
    },
    "and": {
        "id": " dan ",
        "en": " and ",
    },
    "models_on_first_use": {
        "id": "Model {names} diunduh saat pertama dipakai, atau dari Pengaturan",
        "en": "The {names} model is downloaded on first use, or from Settings",
    },
    "models_on_first_use_many": {
        "id": "Model {names} diunduh saat pertama dipakai, atau dari Pengaturan",
        "en": "The {names} models are downloaded on first use, or from Settings",
    },
    "library_label": {
        "id": "Folder library dapat ditulis",
        "en": "Library folder is writable",
    },
    "disk_label": {
        "id": "Ruang disk kosong",
        "en": "Free disk space",
    },
    "disk_free": {
        "id": "{gb} GB kosong",
        "en": "{gb} GB free",
    },
    "disk_low": {
        "id": "{gb} GB kosong (disarankan ≥ 5 GB)",
        "en": "{gb} GB free (≥ 5 GB recommended)",
    },
    "jobs_running": {
        "id": "Tunggu job yang sedang berjalan selesai sebelum memperbarui yt-dlp",
        "en": "Wait for the running jobs to finish before updating yt-dlp",
    },
    "backup_failed": {
        "id": "Backup gagal: {error}",
        "en": "Backup failed: {error}",
    },
    "restore_failed": {
        "id": "Pemulihan gagal: {error}. Database bisa kembali ke keadaan sebelumnya lewat backup {safety}.",
        "en": "The restore failed: {error}. The database can go back to how it was through the backup {safety}.",
    },
})

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
                  "detail": None if ff else M("ffmpeg_missing")})
    yv = ytdlp.version()
    items.append({"key": "ytdlp", "label": "yt-dlp", "ok": bool(yv), "version": yv,
                  "detail": None if yv else M("ytdlp_missing")})
    dp = deno_path()
    dv = _tool_version([dp, "--version"]) if dp else None
    items.append({"key": "deno", "label": M("deno_label"), "ok": bool(dv), "version": dv,
                  "detail": None if dv else M("deno_missing")})
    items.append({"key": "mongodb", "label": "MongoDB", "ok": dbm.ping(), "version": dbm.server_version(),
                  "detail": None if mongod_path() or config.mongodb_uri else M("mongod_missing")})
    try:
        prefix, _env = node_command()
        render_ok = (paths.render_dir / "dist" / "render.js").exists()
        items.append({"key": "render", "label": "Render engine (Remotion)", "ok": render_ok, "version": None,
                      "detail": None if render_ok else M("render_not_built")})
    except FileNotFoundError as exc:
        items.append({"key": "render", "label": "Render engine (Remotion)", "ok": False, "version": None, "detail": str(exc)})
    wv = whisper_local.version()
    needed = {whisper_local.chosen_model(words=False), whisper_local.chosen_model(words=True)}
    missing = [m for m in needed if not whisper_local.installed(m)]
    w_detail = None
    if not wv:
        w_detail = M("whisper_missing")
    elif missing:
        names = M("and").join(f"{m.label} ({m.size_bytes / 1024**2:.0f} MB)" for m in missing)
        w_detail = M("models_on_first_use_many" if len(missing) > 1 else "models_on_first_use", names=names)
    items.append({"key": "whisper", "label": M("whisper_label"), "ok": bool(wv), "version": wv, "detail": w_detail})
    try:
        import mediapipe  # noqa: F401
        import cv2

        items.append({"key": "mediapipe", "label": "MediaPipe / OpenCV", "ok": True, "version": cv2.__version__, "detail": None})
    except Exception as exc:
        items.append({"key": "mediapipe", "label": "MediaPipe / OpenCV", "ok": False, "version": None, "detail": str(exc)})
    lib_ok = os.access(paths.library_dir, os.W_OK)
    items.append({"key": "library", "label": M("library_label"), "ok": lib_ok, "version": None,
                  "detail": str(paths.library_dir)})
    try:
        free = shutil.disk_usage(paths.data_root).free
    except OSError:
        free = 0
    items.append({"key": "disk", "label": M("disk_label"), "ok": free >= 5 * 1024**3, "version": None,
                  "detail": M("disk_free" if free >= 5 * 1024**3 else "disk_low", gb=f"{free / 1024**3:.1f}")})
    from backend.core.settings_store import get_settings

    return {
        "items": items,
        # the daily yt-dlp update check: its switch and the last check (ytdlp.update_state)
        "ytdlp_update": {**ytdlp.update_state(), "auto": bool(get_settings()["ytdlp"].get("auto_update", True))},
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
    # Each campaign's library folder (an old workspace folder became the folder of the campaign made from it)
    from backend.services.campaigns import slug_of

    per_campaign = []
    for campaign in get_db().campaigns.find({}, {"name": 1, "slug": 1}).sort("created_at", 1):
        per_campaign.append({"campaign_id": campaign["_id"], "name": campaign.get("name", ""),
                             "bytes": _dir_size(paths.campaign_library(slug_of(campaign)))})
    return {
        "data_root": str(paths.data_root),
        "access": acl.status(paths.data_root),
        "drive_free_bytes": free,
        "drive_total_bytes": total,
        "db_bytes": _dir_size(paths.db_dir),
        "library_bytes": _dir_size(paths.library_dir),
        "cache_bytes": _dir_size(paths.cache_dir),
        "backups_bytes": _dir_size(paths.backups_dir),
        "models_bytes": _dir_size(paths.models_dir),
        "per_campaign": per_campaign,
    }


@router.post("/update-ytdlp")
async def update_ytdlp():
    from backend.core.queue import runner

    if runner.has_active_jobs():
        raise http_error(409, M("jobs_running"))
    return await run_in_threadpool(ytdlp.self_update)


@router.get("/storage")
async def storage():
    return await run_in_threadpool(_storage)


@router.get("/resources")
async def resource_status():
    """RAM, the reserve, and the heavy steps the RAM guard runs or holds back (core/resources.py)."""
    return await run_in_threadpool(resources.status)


@router.post("/backup")
async def make_backup():
    try:
        return {"backup": await run_in_threadpool(backup.write_backup, "manual")}
    except Exception as exc:
        raise http_error(500, M("backup_failed", error=exc))


@router.get("/backups")
def backups():
    return {"backups": backup.list_backups()}


@router.post("/backups/{name}/restore")
async def restore_backup(name: str):
    """Puts the database back as it was in that backup (after writing a backup of the current state)."""
    try:
        return await run_in_threadpool(backup.restore_backup, name)
    except backup.BackupError as exc:
        raise http_error(exc.status, str(exc))
    except Exception as exc:
        newest = (backup.list_backups() or [{}])[0].get("name", "-")
        raise http_error(500, M("restore_failed", error=exc, safety=newest))


@router.get("/activity")
async def activity_status():
    """What still runs (jobs, renders, brief readings, AI designs, model downloads), for moving the data
    folder or restoring a backup: {busy, items: [{kind, count}], message}."""
    return await run_in_threadpool(activity.status)


@router.post("/purge-cache")
def purge_cache():
    """Deletes every cache file no running step uses (jobs, renders, transcriptions keep theirs)."""
    res = cache.sweep(None)
    return {"ok": True, "freed_bytes": res["freed_bytes"]}
