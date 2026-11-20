"""Brand templates of each campaign (every template belongs to one), plus their brand assets."""
from __future__ import annotations

import logging
import re
import uuid
from typing import Any, Optional

from fastapi import APIRouter, File, Form, UploadFile
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from backend.api.dto import brand_template_dto, http_error
from backend.core import cache, events
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
    "campaign_not_found": {
        "id": "Campaign tidak ditemukan",
        "en": "Campaign not found",
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
        "id": "Campaign harus punya minimal satu brand template",
        "en": "A campaign must keep at least one brand template",
    },
    "no_llm": {
        "id": "API key LLM belum diisi di Pengaturan",
        "en": "No LLM API key is set in Settings",
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
SECTIONS = bts.SECTIONS
_safe_name = re.compile(r"[^A-Za-z0-9._-]+")


def _clip_counts() -> dict[str, int]:
    return {row["_id"]: row["n"] for row in get_db().clips.aggregate([
        {"$match": {"brand_template_id": {"$type": "string"}}},
        {"$group": {"_id": "$brand_template_id", "n": {"$sum": 1}}},
    ])}


def _campaigns() -> dict[str, dict]:
    return {c["_id"]: c for c in get_db().campaigns.find({}, {"name": 1, "brand_template_id": 1})}


def _dto(doc: dict, campaigns: dict[str, dict] | None = None, counts: dict[str, int] | None = None) -> dict:
    campaigns = _campaigns() if campaigns is None else campaigns
    counts = _clip_counts() if counts is None else counts
    owner = campaigns.get(doc.get("campaign_id") or "") or {}
    return brand_template_dto(doc, campaign_name=owner.get("name") or "", clip_count=counts.get(doc["_id"], 0),
                              is_default=bool(owner) and owner.get("brand_template_id") == doc["_id"])  # type: ignore[return-value]


def _get(template_id: str) -> dict:
    doc = bts.get(template_id)
    if not doc:
        raise http_error(404, M("not_found"))
    return doc


def _campaign(campaign_id: Optional[str]) -> dict:
    doc = get_db().campaigns.find_one({"_id": campaign_id}) if campaign_id else None
    if not doc:
        raise http_error(400, M("campaign_not_found"))
    return doc


def _name(value: Optional[str]) -> str:
    name = (value or "").strip()
    if not name:
        raise http_error(400, M("name_required"))
    if len(name) > 80:
        raise http_error(400, M("name_too_long"))
    return name


@router.get("/api/brand-templates")
def list_templates(campaign_id: Optional[str] = None):
    """The templates of one campaign (oldest first), or of every campaign (to copy one across)."""
    campaigns, counts = _campaigns(), _clip_counts()
    q: dict[str, Any] = {"campaign_id": campaign_id} if campaign_id else {}
    docs = get_db().brand_templates.find(q).sort("created_at", 1)
    return {"brand_templates": [_dto(d, campaigns, counts) for d in docs]}


class TemplateCreate(BaseModel):
    campaign_id: str
    name: Optional[str] = Field(default=None, max_length=80)
    # Start from the settings of this template (any campaign's; asset files are shared, not copied)
    copy_from: Optional[str] = None
    # Let the AI design it from the campaign's name, client and brief (the name may then be left out)
    ai: bool = False
    make_default: bool = False


@router.post("/api/brand-templates")
def create_template(body: TemplateCreate):
    campaign = _campaign(body.campaign_id)
    if body.ai:
        from backend.core import llm

        if not llm.is_configured():
            raise http_error(400, M("no_llm"))
        doc = bts.create_for_campaign(campaign, ai=True, make_default=body.make_default,
                                      name=_name(body.name) if body.name else None)
    else:
        settings: dict[str, Any] = {}
        if body.copy_from:
            src = _get(body.copy_from)
            settings = {k: src.get(k) or {} for k in SECTIONS}
        doc = bts.create(_name(body.name), settings, campaign_id=campaign["_id"])
        if body.make_default:
            bts.set_default(campaign["_id"], doc["_id"])
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
    renamed = "name" in data
    if renamed:
        current["name"] = _name(data.pop("name"))
    if data.get("layout_settings") is not None:
        try:
            data["layout_settings"] = layout_svc.clean_layout(data["layout_settings"], keep_safe_zone=True)
        except layout_svc.LayoutError as exc:
            raise http_error(400, str(exc))
    changed = False
    for key, value in data.items():
        if value is not None:
            changed = changed or value != (current.get(key) or {})
            current[key] = value  # each section replaces the stored one
    current["updated_at"] = utcnow()
    design = current.get("design")
    if isinstance(design, dict):
        # The user's own choices from now on: no automatic AI design replaces them
        if changed:
            design["edited"] = True
        if renamed:
            design["renamed"] = True
    doc = BrandTemplateDoc(**current).to_mongo()  # validate before writing
    get_db().brand_templates.replace_one({"_id": template_id}, doc)
    events.publish({"type": "brand_template.updated", "id": template_id, "campaign_id": doc.get("campaign_id")})
    return {"brand_template": _dto(doc)}


@router.post("/api/brand-templates/{template_id}/design")
def design_template(template_id: str):
    """Design the template (again) with the AI, from its campaign's name, client and brief. Replaces its
    caption, layout and AI subtitle settings (the logo and overlay stay); runs in the background."""
    _get(template_id)
    from backend.core import llm

    if not llm.is_configured():
        raise http_error(400, M("no_llm"))
    bts.start_design(template_id, user_asked=True)
    return {"brand_template": _dto(_get(template_id))}


@router.post("/api/brand-templates/{template_id}/default")
def make_default(template_id: str):
    """Make the template its campaign's default."""
    doc = _get(template_id)
    campaign = _campaign(doc.get("campaign_id"))
    bts.set_default(campaign["_id"], template_id)
    return {"brand_template": _dto(_get(template_id))}


@router.delete("/api/brand-templates/{template_id}")
def delete_template(template_id: str):
    doc = _get(template_id)
    cid = doc.get("campaign_id")
    if cid and get_db().brand_templates.count_documents({"campaign_id": cid}) <= 1:
        raise http_error(400, M("keep_one"))
    bts.delete(template_id)
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
        upload_path = cache.claim(f"upload-{uuid.uuid4().hex}{ext}", folder=False)
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
                if companion:
                    cache.release(upload_path)
                else:
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
            cache.release(upload_path)
        rel = get_paths().to_relative(final_path)
        return {"value": f"asset://{rel}", "path": rel, "duration": duration}
    rel = get_paths().to_relative(dest)
    return {"value": f"asset://{rel}", "path": rel}
