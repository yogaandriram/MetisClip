"""Brand template library: named templates shared by every Super Agent, plus their brand assets."""
from __future__ import annotations

import re
import uuid
from typing import Any, Optional

from fastapi import APIRouter, File, Form, UploadFile
from pydantic import BaseModel, Field

from backend.api.dto import brand_template_dto, http_error
from backend.core import events
from backend.core.db import get_db, utcnow
from backend.core.paths import get_paths
from backend.models.documents import BrandTemplateDoc
from backend.services import brand_templates as bts

router = APIRouter(tags=["brand-templates"])

ASSET_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".mp4", ".mov", ".webm", ".mp3", ".wav", ".m4a", ".aac", ".ogg"}
MAX_ASSET_BYTES = 500 * 1024 * 1024
SECTIONS = ("brand_settings", "caption_settings", "layout_settings", "ai_settings")
_safe_name = re.compile(r"[^A-Za-z0-9._-]+")


def _usage() -> tuple[dict[str, list[dict]], dict[str, int]]:
    db = get_db()
    agents: dict[str, list[dict]] = {}
    for a in db.super_agents.find({}, {"name": 1, "default_brand_template_id": 1}).sort("created_at", 1):
        if a.get("default_brand_template_id"):
            agents.setdefault(a["default_brand_template_id"], []).append(a)
    counts = {row["_id"]: row["n"] for row in db.clips.aggregate([
        {"$match": {"brand_template_id": {"$type": "string"}}},
        {"$group": {"_id": "$brand_template_id", "n": {"$sum": 1}}},
    ])}
    return agents, counts


def _dto(doc: dict) -> dict:
    agents, counts = _usage()
    return brand_template_dto(doc, used_by_agents=agents.get(doc["_id"], []), clip_count=counts.get(doc["_id"], 0))  # type: ignore[return-value]


def _get(template_id: str) -> dict:
    doc = bts.get(template_id)
    if not doc:
        raise http_error(404, "Brand template tidak ditemukan")
    return doc


def _name(value: Optional[str]) -> str:
    name = (value or "").strip()
    if not name:
        raise http_error(400, "Nama template wajib diisi")
    if len(name) > 80:
        raise http_error(400, "Nama template maksimal 80 karakter")
    return name


@router.get("/api/brand-templates")
def list_templates():
    agents, counts = _usage()
    docs = get_db().brand_templates.find({}).sort("created_at", 1)
    return {"brand_templates": [
        brand_template_dto(d, used_by_agents=agents.get(d["_id"], []), clip_count=counts.get(d["_id"], 0)) for d in docs
    ]}


class TemplateCreate(BaseModel):
    name: str = Field(max_length=80)
    # Duplicate the settings of this template (asset files are shared, not copied)
    copy_from: Optional[str] = None


@router.post("/api/brand-templates")
def create_template(body: TemplateCreate):
    settings: dict[str, Any] = {}
    if body.copy_from:
        src = _get(body.copy_from)
        settings = {k: src.get(k) or {} for k in SECTIONS}
    doc = bts.create(_name(body.name), settings)
    events.publish({"type": "brand_template.updated", "id": doc["_id"]})
    return {"brand_template": _dto(doc)}


@router.get("/api/brand-templates/{template_id}")
def get_template(template_id: str):
    return {"brand_template": _dto(_get(template_id))}


class TemplateUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=80)
    brand_settings: Optional[dict[str, Any]] = None
    caption_settings: Optional[dict[str, Any]] = None
    layout_settings: Optional[dict[str, Any]] = None
    ai_settings: Optional[dict[str, Any]] = None


@router.put("/api/brand-templates/{template_id}")
def update_template(template_id: str, body: TemplateUpdate):
    current = _get(template_id)
    data = body.model_dump(exclude_unset=True)
    if "name" in data:
        current["name"] = _name(data.pop("name"))
    for key, value in data.items():
        if value is not None:
            current[key] = value  # each section replaces the stored one
    current["updated_at"] = utcnow()
    doc = BrandTemplateDoc(**current).to_mongo()  # validate before writing
    get_db().brand_templates.replace_one({"_id": template_id}, doc)
    events.publish({"type": "brand_template.updated", "id": template_id})
    return {"brand_template": _dto(doc)}


@router.delete("/api/brand-templates/{template_id}")
def delete_template(template_id: str):
    doc = _get(template_id)
    db = get_db()
    if db.brand_templates.count_documents({}) <= 1:
        raise http_error(400, "Minimal harus ada satu brand template")
    db.brand_templates.delete_one({"_id": template_id})
    # Clips fall back to their agent's default; agents get the oldest remaining template
    db.clips.update_many({"brand_template_id": template_id}, {"$unset": {"brand_template_id": ""}})
    fallback = bts.ensure_default()
    db.super_agents.update_many({"default_brand_template_id": template_id}, {"$set": {"default_brand_template_id": fallback}})
    bts.delete_unused_assets(doc)
    events.publish({"type": "brand_template.deleted", "id": template_id})
    return {"ok": True}


@router.post("/api/brand-templates/{template_id}/assets")
async def upload_asset(template_id: str, file: UploadFile = File(...), kind: str = Form("asset")):
    """Import a logo, overlay or sample video; store the returned `value` (asset://…) in brand_settings."""
    _get(template_id)
    ext = "." + (file.filename or "").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else ""
    if ext not in ASSET_EXT:
        raise http_error(400, "Jenis file tidak didukung")
    folder = bts.asset_dir(template_id)
    folder.mkdir(parents=True, exist_ok=True)
    kind_clean = _safe_name.sub("-", kind or "asset").strip("-")[:20] or "asset"
    dest = folder / f"{kind_clean}-{uuid.uuid4().hex[:8]}{ext}"
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
    rel = get_paths().to_relative(dest)
    return {"value": f"asset://{rel}", "path": rel}
