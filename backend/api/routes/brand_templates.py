"""Brand template library: named templates shared by every workspace, plus their brand assets."""
from __future__ import annotations

import logging
import re
import uuid
from typing import Any, Optional

from fastapi import APIRouter, File, Form, UploadFile
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from backend.api.dto import brand_template_dto, http_error
from backend.core import events
from backend.core.db import get_db, utcnow
from backend.core.paths import get_paths
from backend.models.documents import BrandTemplateDoc
from backend.services import brand_templates as bts
from backend.services import layout as layout_svc
from backend.core import i18n

M = i18n.messages({
    "not_found": {
        "id": "Brand template tidak ditemukan",
        "en": "Brand template not found",
    },
    "name_required": {
        "id": "Nama template wajib diisi",
        "en": "A template name is required",
    },
    "name_too_long": {
        "id": "Nama template maksimal 80 karakter",
        "en": "A template name can be at most 80 characters",
    },
    "keep_one": {
        "id": "Minimal harus ada satu brand template",
        "en": "There must be at least one brand template",
    },
    "bad_type": {
        "id": "Jenis file tidak didukung",
        "en": "This file type is not supported",
    },
    "companion_type": {
        "id": "Video pendamping harus berupa MP4, MOV atau WEBM",
        "en": "The companion video must be an MP4, MOV or WEBM file",
    },
    "too_large": {
        "id": "File terlalu besar (maks. 500 MB)",
        "en": "The file is too large (max. 500 MB)",
    },
    "companion_failed": {
        "id": "Video pendamping gagal diproses: {error}",
        "en": "The companion video couldn't be processed: {error}",
    },
})

router = APIRouter(tags=["brand-templates"])
logger = logging.getLogger(__name__)

ASSET_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".mp4", ".mov", ".webm", ".mp3", ".wav", ".m4a", ".aac", ".ogg"}
VIDEO_EXT = {".mp4", ".mov", ".webm"}
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
        raise http_error(404, M("not_found"))
    return doc


def _name(value: Optional[str]) -> str:
    name = (value or "").strip()
    if not name:
        raise http_error(400, M("name_required"))
    if len(name) > 80:
        raise http_error(400, M("name_too_long"))
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
    if data.get("layout_settings") is not None:
        try:
            data["layout_settings"] = layout_svc.clean_layout(data["layout_settings"], keep_safe_zone=True)
        except layout_svc.LayoutError as exc:
            raise http_error(400, str(exc))
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
        raise http_error(400, M("keep_one"))
    db.brand_templates.delete_one({"_id": template_id})
    # Clips fall back to their agent's default; agents get the oldest remaining template
    db.clips.update_many({"brand_template_id": template_id}, {"$unset": {"brand_template_id": ""}})
    fallback = bts.ensure_default()
    db.super_agents.update_many({"default_brand_template_id": template_id}, {"$set": {"default_brand_template_id": fallback}})
    db.campaigns.update_many({"brand_template_id": template_id}, {"$set": {"brand_template_id": None}})
    bts.delete_unused_assets(doc)
    events.publish({"type": "brand_template.deleted", "id": template_id})
    return {"ok": True}


@router.post("/api/brand-templates/{template_id}/assets")
async def upload_asset(template_id: str, file: UploadFile = File(...), kind: str = Form("asset")):
    """Import a logo, overlay, sample video or layout image; store the returned `value` (asset://…) in
    the template. kind "companion" (the split layout's companion video) is converted first: silent,
    30 fps, at most 3 minutes; its `duration` comes back too."""
    _get(template_id)
    ext = "." + (file.filename or "").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else ""
    if ext not in ASSET_EXT:
        raise http_error(400, M("bad_type"))
    companion = kind == "companion"
    if companion and ext not in VIDEO_EXT:
        raise http_error(400, M("companion_type"))
    folder = bts.asset_dir(template_id)
    folder.mkdir(parents=True, exist_ok=True)
    kind_clean = _safe_name.sub("-", kind or "asset").strip("-")[:20] or "asset"
    dest = folder / f"{kind_clean}-{uuid.uuid4().hex[:8]}{ext}"
    if companion:  # the upload lands in the cache; only the converted copy is kept
        upload_path = get_paths().cache_dir / f"upload-{uuid.uuid4().hex}{ext}"
        upload_path.parent.mkdir(parents=True, exist_ok=True)
        final_path, dest = dest.with_suffix(".mp4"), upload_path
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
                raise http_error(400, M("too_large"))
            out.write(chunk)
    if companion:
        from backend.agents.tools import ffmpeg_ops

        try:
            duration = await run_in_threadpool(ffmpeg_ops.normalize_companion, upload_path, final_path)
        except ValueError as exc:
            raise http_error(400, str(exc))
        except Exception as exc:
            logger.exception("Companion video import failed")
            final_path.unlink(missing_ok=True)
            raise http_error(400, M("companion_failed", error=exc))
        finally:
            upload_path.unlink(missing_ok=True)
        rel = get_paths().to_relative(final_path)
        return {"value": f"asset://{rel}", "path": rel, "duration": duration}
    rel = get_paths().to_relative(dest)
    return {"value": f"asset://{rel}", "path": rel}
