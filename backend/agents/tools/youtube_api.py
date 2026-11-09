"""YouTube Data API v3 (search + video details) with a 24 h cache in `api_cache`."""
from __future__ import annotations

import hashlib
import json
import logging
import re
from datetime import timedelta
from typing import Any

import requests

from backend.core.config import config
from backend.core.db import get_db, utcnow
from backend.core.secrets import get_secret

logger = logging.getLogger(__name__)

API = "https://www.googleapis.com/youtube/v3"
CACHE_TTL = timedelta(hours=24)


class YouTubeApiError(RuntimeError):
    pass


def parse_iso8601_duration(duration_str: str) -> int:
    m = re.match(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", duration_str or "")
    if not m:
        return 0
    d, h, mi, s = (int(x) if x else 0 for x in m.groups())
    return d * 86400 + h * 3600 + mi * 60 + s


def quality_score(views: int, likes: int) -> float:
    return round(min(100.0, (likes / max(1, views)) * 1000 + min(20.0, views / 50000)), 2)


def _cache_key(path: str, params: dict) -> str:
    clean = {k: v for k, v in params.items() if k != "key"}
    raw = path + "?" + json.dumps(clean, sort_keys=True)
    return "yt:" + hashlib.sha256(raw.encode()).hexdigest()


def _get(path: str, params: dict, api_key: str, use_cache: bool = True) -> dict:
    key = _cache_key(path, params)
    db = get_db()
    if use_cache:
        hit = db.api_cache.find_one({"_id": key})
        if hit and hit.get("expires_at") and hit["expires_at"] > utcnow():
            return hit["value"]
    try:
        r = requests.get(f"{API}/{path}", params={**params, "key": api_key}, timeout=30)
    except requests.RequestException as exc:
        raise YouTubeApiError("Tidak dapat terhubung ke YouTube Data API. Periksa koneksi internet.") from exc
    if r.status_code != 200:
        reason = ""
        try:
            reason = r.json()["error"]["errors"][0]["reason"]
        except Exception:
            pass
        if reason in ("quotaExceeded", "dailyLimitExceeded"):
            raise YouTubeApiError("Kuota harian YouTube Data API habis. Coba lagi besok atau gunakan URL langsung.")
        if r.status_code in (400, 403) and reason in ("keyInvalid", "badRequest", "forbidden", "accessNotConfigured"):
            raise YouTubeApiError("API key YouTube tidak valid atau YouTube Data API belum diaktifkan.")
        raise YouTubeApiError(f"YouTube Data API error {r.status_code} {reason}".strip())
    data = r.json()
    if use_cache:
        db.api_cache.replace_one(
            {"_id": key}, {"_id": key, "value": data, "expires_at": utcnow() + CACHE_TTL}, upsert=True
        )
    return data


def video_details(ids: list[str], api_key: str, video_type: str = "podcast") -> list[dict[str, Any]]:
    if not ids:
        return []
    data = _get("videos", {"part": "snippet,contentDetails,statistics", "id": ",".join(ids)}, api_key)
    out = []
    for item in data.get("items", []):
        stats = item.get("statistics", {})
        views = int(stats.get("viewCount", 0) or 0)
        likes = int(stats.get("likeCount", 0) or 0)
        out.append(
            {
                "youtube_id": item["id"],
                "title": item["snippet"].get("title", ""),
                "channel_name": item["snippet"].get("channelTitle", ""),
                "duration_seconds": parse_iso8601_duration(item.get("contentDetails", {}).get("duration", "")),
                "view_count": views,
                "like_count": likes,
                "video_type": video_type,
                "quality_score": quality_score(views, likes),
            }
        )
    return out


def search_videos(query: str, video_type: str, max_results: int = 3) -> list[dict[str, Any]]:
    api_key = get_secret("youtube_api_key")
    if not api_key:
        if config.is_dev:
            logger.warning("YOUTUBE_API_KEY not set: returning dev mock search results")
            return _mock_results(video_type)
        raise YouTubeApiError("API key YouTube belum diisi di Pengaturan. Gunakan mode URL atau isi API key.")
    data = _get(
        "search",
        {"part": "snippet", "q": f"{query} {video_type}".strip(), "type": "video",
         "videoDuration": "long", "maxResults": max_results},
        api_key,
    )
    ids = [i["id"]["videoId"] for i in data.get("items", []) if i.get("id", {}).get("kind") == "youtube#video"]
    return video_details(ids, api_key, video_type)


def _mock_results(video_type: str) -> list[dict[str, Any]]:
    return [
        {"youtube_id": "jNQXAC9IVRw", "title": "[DEV MOCK] Long-form podcast", "channel_name": "Dev Mock",
         "duration_seconds": 7240, "view_count": 4829100, "like_count": 142000, "video_type": video_type,
         "quality_score": 95.5},
    ]


def test_key(api_key: str) -> tuple[bool, str]:
    try:
        _get("videos", {"part": "id", "id": "jNQXAC9IVRw"}, api_key, use_cache=False)
        return True, "API key YouTube valid"
    except YouTubeApiError as exc:
        return False, str(exc)
