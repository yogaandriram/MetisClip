"""Super Agents, their embedded brand template and brand assets."""
from __future__ import annotations

import re
import shutil
import uuid
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, File, Form, UploadFile
from pydantic import BaseModel, Field

from backend.api.dto import agent_dto, brand_template_dto, http_error
from backend.core import events
from backend.core.db import get_db, new_id, utcnow
from backend.core.paths import get_paths, slugify
from backend.core.queue import runner
from backend.models.documents import AgentDoc, BrandTemplateDoc

router = APIRouter(tags=["agents"])

ASSET_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".mp4", ".mov", ".webm", ".mp3", ".wav", ".m4a", ".aac", ".ogg"}
MAX_ASSET_BYTES = 500 * 1024 * 1024


class AgentIn(BaseModel):
    name: Optional[str] = Field(default=None, max_length=80)
    niche: Optional[str] = None
    default_duration: Optional[str] = None
    default_keywords: Optional[Any] = None  # comma-separated string (UI) or list
    default_video_types: Optional[list[str]] = None
    timezone: Optional[str] = None


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
        brand_template=BrandTemplateDoc(updated_at=utcnow()),
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


# -- brand template -----------------------------------------------------------

class BrandTemplateIn(BaseModel):
    brand_settings: Optional[dict[str, Any]] = None
    caption_settings: Optional[dict[str, Any]] = None
    layout_settings: Optional[dict[str, Any]] = None
    ai_settings: Optional[dict[str, Any]] = None


@router.get("/api/agents/{agent_id}/brand-template")
def get_brand_template(agent_id: str):
    return {"brand_template": brand_template_dto(_get_agent(agent_id))}


@router.put("/api/agents/{agent_id}/brand-template")
def put_brand_template(agent_id: str, body: BrandTemplateIn):
    agent = _get_agent(agent_id)
    current = agent.get("brand_template") or BrandTemplateDoc().model_dump()
    for key, value in body.model_dump(exclude_unset=True).items():
        if value is not None:
            current[key] = value  # each top-level key replaces the stored one
    current["updated_at"] = utcnow()
    bt = BrandTemplateDoc(**current).model_dump()
    get_db().super_agents.update_one({"_id": agent_id}, {"$set": {"brand_template": bt}})
    return {"brand_template": brand_template_dto(_get_agent(agent_id))}


_safe_name = re.compile(r"[^A-Za-z0-9._-]+")


@router.post("/api/agents/{agent_id}/brand-assets")
async def upload_brand_asset(agent_id: str, file: UploadFile = File(...), kind: str = Form("asset")):
    agent = _get_agent(agent_id)
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ASSET_EXT:
        raise http_error(400, "Jenis file tidak didukung")
    paths = get_paths()
    slug = agent.get("slug") or slugify(agent.get("name", ""))
    assets = paths.agent_library(slug) / "_assets"
    assets.mkdir(parents=True, exist_ok=True)
    kind_clean = _safe_name.sub("-", kind or "asset").strip("-")[:20] or "asset"
    dest = assets / f"{kind_clean}-{uuid.uuid4().hex[:8]}{ext}"
    size = 0
    with dest.open("wb") as out:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_ASSET_BYTES:
                out.close()
                dest.unlink(missing_ok=True)
                raise http_error(400, "File terlalu besar (maks. 500 MB)")
            out.write(chunk)
    rel = paths.to_relative(dest)
    return {"value": f"asset://{rel}", "path": rel}
