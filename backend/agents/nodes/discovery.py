"""Discovery Agent: a YouTube link -> one `source_videos` document (metadata from yt-dlp)."""
from __future__ import annotations

import logging
import uuid
from typing import Any

from backend.agents.context import JobContext, PipelineError
from backend.agents.tools import ytdlp
from backend.core.config import config
from backend.core.db import get_db
from backend.models.documents import SourceVideoDoc

logger = logging.getLogger(__name__)


def _metadata(ctx: JobContext, youtube_id: str) -> dict[str, Any]:
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


def run(ctx: JobContext) -> list[dict[str, Any]]:
    src = ctx.source
    if src.get("type") != "url":
        raise PipelineError("Sumber job ini tidak didukung lagi. Buat job baru dengan link YouTube.")
    youtube_id = ytdlp.extract_video_id(src.get("youtube_url") or "")
    if not youtube_id:
        raise PipelineError("URL YouTube tidak valid")
    ctx.progress(5, step="discovery", message="Mengambil info video…")
    video = _metadata(ctx, youtube_id)

    # Deterministic id: re-running discovery after a crash never duplicates rows
    vid = str(uuid.uuid5(uuid.NAMESPACE_URL, f"metisclip:{ctx.id}:{youtube_id}"))
    doc = SourceVideoDoc(_id=vid, job_id=ctx.id, agent_id=ctx.agent_id, **video).to_mongo()
    get_db().source_videos.replace_one({"_id": vid}, doc, upsert=True)
    ctx.progress(15, step="discovery", message=f"Video sumber: {doc['title']}")
    return [doc]
