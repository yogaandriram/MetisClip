"""Mongo documents -> API DTOs (shapes defined by frontend/lib/engine.ts)."""
from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from backend.core.db import iso, to_api


def http_error(status: int, detail: str) -> HTTPException:
    return HTTPException(status_code=status, detail=detail)


def agent_dto(doc: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": doc["_id"],
        "name": doc.get("name", ""),
        "niche": doc.get("niche"),
        "default_duration": doc.get("default_duration", "45-60"),
        "timezone": doc.get("timezone", "Asia/Jakarta"),
        "default_brand_template_id": doc.get("default_brand_template_id"),
        "created_at": iso(doc.get("created_at")),
    }


def brand_template_dto(
    doc: dict[str, Any] | None,
    *,
    used_by_agents: list[dict[str, Any]] | None = None,
    clip_count: int | None = None,
) -> dict[str, Any] | None:
    if not doc:
        return None
    out = {
        "id": doc["_id"],
        "name": doc.get("name") or "",
        "brand_settings": doc.get("brand_settings") or {},
        "caption_settings": doc.get("caption_settings") or {},
        "layout_settings": doc.get("layout_settings") or {},
        "ai_settings": doc.get("ai_settings") or {},
        "created_at": iso(doc.get("created_at")),
        "updated_at": iso(doc.get("updated_at")),
    }
    if used_by_agents is not None:
        out["used_by_agents"] = [{"id": a["_id"], "name": a.get("name") or ""} for a in used_by_agents]
    if clip_count is not None:
        out["clip_count"] = clip_count
    return out


def job_dto(doc: dict[str, Any]) -> dict[str, Any]:
    d = to_api(doc) or {}
    d.pop("checkpoint", None)
    src = d.get("source") or {}
    d["source"] = {
        "type": src.get("type", "url"),
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
        "brand_template_id": doc.get("brand_template_id"),
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
