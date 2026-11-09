"""Mongo documents -> API DTOs (shapes defined by frontend/lib/engine.ts)."""
from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from backend.core.db import iso, to_api


def http_error(status: int, detail: str) -> HTTPException:
    return HTTPException(status_code=status, detail=detail)


def agent_dto(doc: dict[str, Any]) -> dict[str, Any]:
    kw = doc.get("default_keywords") or []
    return {
        "id": doc["_id"],
        "name": doc.get("name", ""),
        "niche": doc.get("niche"),
        "default_duration": doc.get("default_duration", "45-60"),
        "default_keywords": ", ".join(kw) if isinstance(kw, list) else (kw or None),
        "default_video_types": doc.get("default_video_types") or [],
        "timezone": doc.get("timezone", "Asia/Jakarta"),
        "created_at": iso(doc.get("created_at")),
    }


def brand_template_dto(agent: dict[str, Any]) -> dict[str, Any] | None:
    bt = agent.get("brand_template")
    if not bt:
        return None
    return {
        "agent_id": agent["_id"],
        "brand_settings": bt.get("brand_settings") or {},
        "caption_settings": bt.get("caption_settings") or {},
        "layout_settings": bt.get("layout_settings") or {},
        "ai_settings": bt.get("ai_settings") or {},
        "updated_at": iso(bt.get("updated_at")),
    }


def job_dto(doc: dict[str, Any]) -> dict[str, Any]:
    d = to_api(doc) or {}
    d.pop("checkpoint", None)
    src = d.get("source") or {}
    d["source"] = {
        "type": src.get("type", "keyword"),
        "keywords": src.get("keywords") or [],
        "youtube_url": src.get("youtube_url"),
        "local_file_path": src.get("local_file_path"),
    }
    d.setdefault("current_step", None)
    d.setdefault("errors", [])
    d.setdefault("started_at", None)
    d.setdefault("finished_at", None)
    return d


def clip_dto(doc: dict[str, Any]) -> dict[str, Any]:
    files = doc.get("files") or {}
    return {
        "id": doc["_id"],
        "agent_id": doc.get("agent_id"),
        "job_id": doc.get("job_id"),
        "source_video_id": doc.get("source_video_id"),
        "youtube_id": doc.get("youtube_id"),
        "start_time": doc.get("start_time", 0),
        "end_time": doc.get("end_time", 0),
        "duration_seconds": doc.get("duration_seconds", 0),
        "viral_score": doc.get("viral_score", 0),
        "hook_text": doc.get("hook_text", ""),
        "tags": doc.get("tags") or [],
        "rationale": doc.get("rationale", ""),
        "status": doc.get("status", "ready"),
        "files": {"raw": files.get("raw"), "final": files.get("final"), "thumbnail": files.get("thumbnail")},
        "subtitle_data": {"clip_id": doc["_id"], "words": (doc.get("subtitle") or {}).get("words") or []},
        "subtitle_style": doc.get("subtitle_style") or {},
        "created_at": iso(doc.get("created_at")),
        "updated_at": iso(doc.get("updated_at")),
    }


def render_dto(doc: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": doc["_id"],
        "clip_id": doc["clip_id"],
        "status": doc.get("status", "queued"),
        "progress_pct": doc.get("progress_pct", 0),
        "output_path": doc.get("output_path"),
        "error": doc.get("error"),
        "created_at": iso(doc.get("created_at")),
        "finished_at": iso(doc.get("finished_at")),
    }
