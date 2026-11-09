"""Discovery Agent: a YouTube link or an uploaded video file -> one `source_videos` document.

YouTube metadata comes from yt-dlp. An uploaded file is used where it is (never copied); ffmpeg
reads its duration, and the file name becomes the title.
"""
from __future__ import annotations

import hashlib
import logging
import os
import uuid
from pathlib import Path
from typing import Any

from backend.agents.context import JobContext, PipelineError
from backend.agents.tools import ffmpeg_ops, ytdlp
from backend.core.config import config
from backend.core.db import get_db
from backend.models.documents import SourceVideoDoc

logger = logging.getLogger(__name__)

# Containers the Cari Video upload accepts (frontend/lib/format.ts VIDEO_FILE_EXTENSIONS)
VIDEO_EXTENSIONS = (".mp4", ".mkv", ".mov", ".webm", ".m4v", ".avi")


def check_local_video(path_str: str) -> tuple[Path, dict[str, Any]]:
    """Validates an uploaded video file: (absolute path, media info). Raises PipelineError in Indonesian."""
    raw = (path_str or "").strip()
    path = Path(raw)
    if not raw or not path.is_absolute():
        raise PipelineError("Pilih file video dari komputer Anda")
    if not path.is_file():
        raise PipelineError(f"File video tidak ditemukan: {path}")
    if path.suffix.lower() not in VIDEO_EXTENSIONS:
        names = ", ".join(e[1:].upper() for e in VIDEO_EXTENSIONS)
        raise PipelineError(f"Format file tidak didukung. Pakai video {names}.")
    info = ffmpeg_ops.probe_media(path)
    if not info or not info["has_video"] or info["duration"] <= 0:
        raise PipelineError("File ini tidak bisa dibaca sebagai video. Coba ekspor ulang ke MP4 (H.264).")
    if not info["has_audio"]:
        raise PipelineError("Video ini tidak punya suara, jadi tidak bisa ditranskripsi untuk mencari momen viral.")
    return path.resolve(), info


def file_fingerprint(path: Path) -> str:
    st = path.stat()
    raw = f"{os.path.normcase(str(path))}|{st.st_size}|{st.st_mtime_ns}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


def _youtube_metadata(ctx: JobContext, youtube_id: str) -> dict[str, Any]:
    try:
        meta = ytdlp.dump_metadata(youtube_id, ctx.cancel)
    except ytdlp.YtDlpError as exc:
        if config.is_dev:
            logger.warning("yt-dlp metadata failed in dev, using placeholder: %s", exc)
            return {"youtube_id": youtube_id, "title": f"Video {youtube_id}", "channel_name": "",
                    "duration_seconds": 0, "view_count": 0, "like_count": 0}
        raise PipelineError(str(exc)) from exc
    return {
        "youtube_id": youtube_id,
        "title": meta.get("title") or youtube_id,
        "channel_name": meta.get("channel") or meta.get("uploader") or "",
        "duration_seconds": float(meta.get("duration") or 0),
        "view_count": int(meta.get("view_count") or 0),
        "like_count": int(meta.get("like_count") or 0),
    }


def _file_metadata(path_str: str) -> dict[str, Any]:
    path, info = check_local_video(path_str)
    return {
        "file_path": str(path),
        "file_fingerprint": file_fingerprint(path),
        "title": path.stem,
        "duration_seconds": round(float(info["duration"]), 3),
    }


def run(ctx: JobContext) -> list[dict[str, Any]]:
    src = ctx.source
    if src.get("type") == "url":
        youtube_id = ytdlp.extract_video_id(src.get("youtube_url") or "")
        if not youtube_id:
            raise PipelineError("URL YouTube tidak valid")
        ctx.progress(5, step="discovery", message="Mengambil info video…")
        video = _youtube_metadata(ctx, youtube_id)
        identity = youtube_id
    elif src.get("type") == "local_file":
        ctx.progress(5, step="discovery", message="Membaca file video…")
        video = _file_metadata(src.get("local_file_path") or "")
        identity = f"file:{video['file_path']}"
    else:
        raise PipelineError("Sumber job ini tidak didukung lagi. Buat job baru dari link YouTube atau file video.")

    # Deterministic id: re-running discovery after a crash never duplicates rows
    vid = str(uuid.uuid5(uuid.NAMESPACE_URL, f"metisclip:{ctx.id}:{identity}"))
    doc = SourceVideoDoc(_id=vid, job_id=ctx.id, agent_id=ctx.agent_id, **video).to_mongo()
    get_db().source_videos.replace_one({"_id": vid}, doc, upsert=True)
    ctx.progress(15, step="discovery", message=f"Video sumber: {doc['title']}")
    return [doc]
