"""Discovery Agent: keyword search or direct URL -> `source_videos`."""
from __future__ import annotations

import logging
import uuid
from typing import Any

from backend.agents.context import JobContext, PipelineError
from backend.agents.tools import youtube_api, ytdlp
from backend.core.config import config
from backend.core.db import get_db
from backend.core.secrets import get_secret
from backend.models.documents import SourceVideoDoc

logger = logging.getLogger(__name__)

RESULTS_PER_QUERY = 3


def _url_metadata(ctx: JobContext, youtube_id: str, video_type: str) -> dict[str, Any]:
    api_key = get_secret("youtube_api_key")
    if api_key:
        try:
            found = youtube_api.video_details([youtube_id], api_key, video_type)
            if found:
                return found[0]
        except youtube_api.YouTubeApiError as exc:
            logger.info("videos.list failed for %s, falling back to yt-dlp: %s", youtube_id, exc)
    try:
        meta = ytdlp.dump_metadata(youtube_id, ctx.cancel)
        views = int(meta.get("view_count") or 0)
        likes = int(meta.get("like_count") or 0)
        return {
            "youtube_id": youtube_id,
            "title": meta.get("title") or youtube_id,
            "channel_name": meta.get("channel") or meta.get("uploader") or "",
            "duration_seconds": float(meta.get("duration") or 0),
            "view_count": views,
            "like_count": likes,
            "video_type": video_type,
            "quality_score": youtube_api.quality_score(views, likes),
        }
    except ytdlp.YtDlpError as exc:
        if config.is_dev:
            logger.warning("yt-dlp metadata failed in dev, using placeholder: %s", exc)
            return {"youtube_id": youtube_id, "title": f"Video {youtube_id}", "channel_name": "", "duration_seconds": 0,
                    "view_count": 0, "like_count": 0, "video_type": video_type, "quality_score": 0}
        raise PipelineError(str(exc)) from exc


def run(ctx: JobContext) -> list[dict[str, Any]]:
    src = ctx.source
    cfg = ctx.config
    video_types = cfg.get("video_types") or ["podcast"]
    found: list[dict[str, Any]] = []

    if src.get("type") == "url":
        youtube_id = ytdlp.extract_video_id(src.get("youtube_url") or "")
        if not youtube_id:
            raise PipelineError("URL YouTube tidak valid")
        ctx.progress(5, step="discovery", message="Mengambil info video…")
        found.append(_url_metadata(ctx, youtube_id, video_types[0]))
    elif src.get("type") == "keyword":
        keywords = [k.strip() for k in src.get("keywords") or [] if k and k.strip()]
        if not keywords:
            raise PipelineError("Kata kunci pencarian kosong")
        min_seconds = int(cfg.get("min_duration_minutes", 30)) * 60
        min_views = int(cfg.get("min_views", 0) or 0)
        total = len(keywords) * len(video_types)
        n = 0
        for kw in keywords:
            for vt in video_types:
                ctx.check()
                n += 1
                ctx.progress(2 + 10 * n / total, step="discovery", message=f"Mencari '{kw}' ({vt})…")
                try:
                    results = youtube_api.search_videos(kw, vt, RESULTS_PER_QUERY)
                except youtube_api.YouTubeApiError as exc:
                    raise PipelineError(str(exc)) from exc
                for v in results:
                    if v["duration_seconds"] < min_seconds and not v["title"].startswith("[DEV MOCK]"):
                        continue
                    if v["view_count"] < min_views:
                        continue
                    if any(x["youtube_id"] == v["youtube_id"] for x in found):
                        continue
                    found.append(v)
        found.sort(key=lambda v: v.get("quality_score", 0), reverse=True)
    else:
        raise PipelineError("Sumber job ini belum didukung")

    if not found:
        raise PipelineError("Tidak ada video yang cocok dengan filter pencarian")

    db = get_db()
    saved = []
    for v in found:
        # Deterministic id: re-running discovery after a crash never duplicates rows
        vid = str(uuid.uuid5(uuid.NAMESPACE_URL, f"metisclip:{ctx.id}:{v['youtube_id']}"))
        doc = SourceVideoDoc(_id=vid, job_id=ctx.id, agent_id=ctx.agent_id, **v).to_mongo()
        db.source_videos.replace_one({"_id": vid}, doc, upsert=True)
        saved.append(doc)
    ctx.progress(15, step="discovery", message=f"{len(saved)} video sumber ditemukan")
    return saved
