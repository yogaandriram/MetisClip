"""Super Agents (niche workspaces). Brand templates live in routes/brand_templates.py."""
from __future__ import annotations

import shutil
from typing import Any, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from backend.api.dto import agent_dto, http_error
from backend.core import events
from backend.core.db import get_db, new_id
from backend.core.paths import get_paths, slugify
from backend.core.queue import runner
from backend.models.documents import AgentDoc
from backend.services import brand_templates

router = APIRouter(tags=["agents"])


class AgentIn(BaseModel):
    name: Optional[str] = Field(default=None, max_length=80)
    niche: Optional[str] = None
    default_duration: Optional[str] = None
    default_keywords: Optional[Any] = None  # comma-separated string (UI) or list
    default_video_types: Optional[list[str]] = None
    timezone: Optional[str] = None
    default_brand_template_id: Optional[str] = None


def _keywords(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        items = value
    else:
        items = str(value).split(",")
    return [s.strip() for s in items if str(s).strip()][:50]


def _unique_slug(name: str, exclude_id: str | None = None) -> str:
    base = slugify(name)
    slug, n = base, 2
    db = get_db()
    while db.super_agents.find_one({"slug": slug, **({"_id": {"$ne": exclude_id}} if exclude_id else {})}, {"_id": 1}):
        slug = f"{base}-{n}"
        n += 1
    return slug


def _template_id(value: str | None) -> str | None:
    """`value` when it names an existing brand template, else None."""
    return value if value and brand_templates.get(value) else None


def _get_agent(agent_id: str) -> dict:
    agent = get_db().super_agents.find_one({"_id": agent_id})
    if not agent:
        raise http_error(404, "Super Agent tidak ditemukan")
    return agent


@router.get("/api/agents")
def list_agents():
    docs = get_db().super_agents.find({}).sort("created_at", 1)
    return {"agents": [agent_dto(d) for d in docs]}


@router.post("/api/agents")
def create_agent(body: AgentIn):
    name = (body.name or "").strip()
    if not name:
        raise http_error(400, "Nama agent wajib diisi")
    doc = AgentDoc(
        _id=new_id(),
        name=name,
        slug=_unique_slug(name),
        niche=(body.niche or None),
        default_duration=body.default_duration or "45-60",
        default_keywords=_keywords(body.default_keywords),
        default_video_types=body.default_video_types or ["podcast"],
        timezone=body.timezone or "Asia/Jakarta",
        default_brand_template_id=_template_id(body.default_brand_template_id) or brand_templates.ensure_default(),
    ).to_mongo()
    get_db().super_agents.insert_one(doc)
    get_paths().agent_library(doc["slug"]).mkdir(parents=True, exist_ok=True)
    return {"agent": agent_dto(doc)}


@router.put("/api/agents/{agent_id}")
def update_agent(agent_id: str, body: AgentIn):
    _get_agent(agent_id)
    sets: dict[str, Any] = {}
    data = body.model_dump(exclude_unset=True)
    if "name" in data:
        name = (data["name"] or "").strip()
        if not name:
            raise http_error(400, "Nama agent wajib diisi")
        sets["name"] = name  # the slug (library folder) is kept stable
    if "niche" in data:
        sets["niche"] = data["niche"] or None
    if "default_duration" in data and data["default_duration"] in ("30-45", "45-60", "60-75", "75-90"):
        sets["default_duration"] = data["default_duration"]
    if "default_keywords" in data:
        sets["default_keywords"] = _keywords(data["default_keywords"])
    if "default_video_types" in data:
        sets["default_video_types"] = data["default_video_types"] or []
    if "timezone" in data and data["timezone"]:
        sets["timezone"] = data["timezone"]
    if data.get("default_brand_template_id"):
        tid = _template_id(data["default_brand_template_id"])
        if not tid:
            raise http_error(400, "Brand template tidak ditemukan")
        sets["default_brand_template_id"] = tid
    if sets:
        get_db().super_agents.update_one({"_id": agent_id}, {"$set": sets})
    return {"agent": agent_dto(_get_agent(agent_id))}


@router.delete("/api/agents/{agent_id}")
def delete_agent(agent_id: str, delete_files: bool = False):
    agent = _get_agent(agent_id)
    db = get_db()
    # Stop running work of this agent first
    for job in db.discovery_jobs.find({"agent_id": agent_id, "status": {"$in": ["pending", "running"]}}, {"_id": 1}):
        runner.cancel_job(job["_id"])
    clip_ids = [c["_id"] for c in db.clips.find({"agent_id": agent_id}, {"_id": 1})]
    for rj in db.render_jobs.find({"clip_id": {"$in": clip_ids}, "status": {"$in": ["queued", "rendering"]}}, {"_id": 1}):
        runner.cancel_render(rj["_id"])
    # Dependants first (no transactions; safe to re-run after a crash)
    db.render_jobs.delete_many({"clip_id": {"$in": clip_ids}})
    db.clips.delete_many({"agent_id": agent_id})
    db.source_videos.delete_many({"agent_id": agent_id})
    db.discovery_jobs.delete_many({"agent_id": agent_id})
    db.super_agents.delete_one({"_id": agent_id})
    if delete_files and agent.get("slug"):
        target = get_paths().agent_library(agent["slug"])
        if target.exists() and get_paths().library_dir.resolve() in target.resolve().parents:
            shutil.rmtree(target, ignore_errors=True)
    for cid in clip_ids:
        events.publish({"type": "clip.deleted", "id": cid})
    return {"ok": True}
