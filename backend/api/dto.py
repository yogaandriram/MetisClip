"""Mongo documents -> API DTOs (shapes defined by frontend/lib/engine.ts)."""
from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from backend.core.db import iso, to_api


def http_error(status: int, detail: str) -> HTTPException:
    return HTTPException(status_code=status, detail=detail)


def _design_dto(design: Any) -> dict[str, Any] | None:
    """How the template was made, without the internal run token."""
    if not isinstance(design, dict) or not design.get("status"):
        return None
    out = {k: design.get(k) for k in ("status", "auto", "edited", "message", "provider", "model")}
    out["reasons"] = design.get("reasons") or []
    out["notes"] = design.get("notes") or []
    out["at"] = iso(design.get("at"))
    return out


def brand_template_dto(
    doc: dict[str, Any] | None,
    *,
    campaign_name: str | None = None,
    clip_count: int | None = None,
    is_default: bool | None = None,
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
        "campaign_id": doc.get("campaign_id"),
        "design": _design_dto(doc.get("design")),
        "created_at": iso(doc.get("created_at")),
        "updated_at": iso(doc.get("updated_at")),
    }
    if campaign_name is not None:
        out["campaign_name"] = campaign_name
    if is_default is not None:
        out["is_default"] = is_default
    if clip_count is not None:
        out["clip_count"] = clip_count
    return out


def recut_event(job: dict) -> dict:
    """The fields a recut's job.status events carry, so the clip's editor follows it (also when it started
    elsewhere): {kind: "recut", clip_id}; empty for other jobs."""
    recut = (job.get("config") or {}).get("recut")
    return {"kind": "recut", "clip_id": recut.get("clip_id")} if recut else {}


def job_dto(doc: dict[str, Any]) -> dict[str, Any]:
    from backend.agents.context import failed_segments

    d = to_api(doc) or {}
    # A completed job whose clips partly failed can retry them (POST /api/jobs/{id}/resume)
    d["failed_clips"] = failed_segments(doc) if doc.get("status") == "completed" else 0
    # "ai" (the Analyzer chose), "manual" (the user's moments) or "recut" (an existing clip cut again)
    cfg = doc.get("config") or {}
    d["kind"] = "recut" if cfg.get("recut") else "manual" if cfg.get("manual_ranges") else "ai"
    d["recut_clip_id"] = (cfg.get("recut") or {}).get("clip_id")
    d.pop("checkpoint", None)
    src = d.get("source") or {}
    d["source"] = {
        "type": src.get("type", "url"),
        "youtube_url": src.get("youtube_url"),
        "local_file_path": src.get("local_file_path"),
    }
    d.setdefault("current_step", None)
    d.setdefault("errors", [])
    # The brief snapshots stay in the job; the list only needs which campaigns
    d["campaigns"] = [{"id": c.get("id"), "name": c.get("name") or "", "version": c.get("version", 1)}
                      for c in d.get("campaigns") or [] if isinstance(c, dict)]
    d.setdefault("campaign_ids", [c["id"] for c in d["campaigns"]])
    d.setdefault("note", "")
    d.setdefault("started_at", None)
    d.setdefault("finished_at", None)
    # What a running job does or waits for now (its last job.progress message); only while it runs
    act = d.get("activity")
    d["activity"] = act if d.get("status") == "running" and isinstance(act, dict) and act.get("message") else None
    return d


def _translation(tr: Any) -> dict[str, Any] | None:
    """A clip's translated subtitles (gap analysis B10): the language and the words and title as spoken."""
    if not isinstance(tr, dict) or not tr.get("language"):
        return None
    return {"language": tr["language"], "original_words": tr.get("original_words") or [],
            "original_title": tr.get("original_title") or "", "partial": bool(tr.get("partial")),
            "at": iso(tr.get("at"))}


def clip_dto(doc: dict[str, Any]) -> dict[str, Any]:
    files = doc.get("files") or {}
    return {
        "id": doc["_id"],
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
        "origin": doc.get("origin") or "ai",
        "status": doc.get("status", "ready"),
        "files": {"raw": files.get("raw"), "final": files.get("final"), "thumbnail": files.get("thumbnail"),
                  "source": files.get("source"), "faces": files.get("faces"), "cover": files.get("cover")},
        "cover_time": doc.get("cover_time"),
        "source_width": doc.get("source_width"),
        "source_height": doc.get("source_height"),
        "subtitle_data": {"clip_id": doc["_id"], "words": (doc.get("subtitle") or {}).get("words") or [],
                          "translation": _translation((doc.get("subtitle") or {}).get("translation"))},
        "subtitle_style": doc.get("subtitle_style") or {},
        "layout_style": doc.get("layout_style") or {},
        "brand_template_id": doc.get("brand_template_id"),
        "campaign_id": doc.get("campaign_id"),
        "brief_fit": doc.get("brief_fit"),
        "brief_reason": doc.get("brief_reason") or "",
        "post_copy": to_api(doc.get("post_copy")) if doc.get("post_copy") else None,
        "brief_manual": doc.get("brief_manual") or {},
        "created_at": iso(doc.get("created_at")),
        "updated_at": iso(doc.get("updated_at")),
    }


def campaign_dto(doc: dict[str, Any], *, counts: dict[str, int] | None = None) -> dict[str, Any]:
    d = to_api(doc) or {}
    c = counts or {}
    d["clip_count"] = c.get("clips", 0)
    d["exported_count"] = c.get("exported", 0)
    d.setdefault("draft", None)
    d.setdefault("parse", {"status": "idle"})
    d.setdefault("brand_template_id", None)
    return d


def render_dto(doc: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": doc["_id"],
        "clip_id": doc["clip_id"],
        "status": doc.get("status", "queued"),
        "progress_pct": doc.get("progress_pct", 0),
        "output_path": doc.get("output_path"),
        "exported_path": doc.get("exported_path"),
        "export_dir": doc.get("export_dir"),
        "export_error": doc.get("export_error"),
        "reused": bool(doc.get("reused")),
        "loudness": doc.get("loudness"),
        "format": doc.get("format"),
        "quality": doc.get("quality"),
        "error": doc.get("error"),
        "created_at": iso(doc.get("created_at")),
        "finished_at": iso(doc.get("finished_at")),
    }
