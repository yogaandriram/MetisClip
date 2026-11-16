"""Campaign library: client briefs from any material (typed text, documents, screenshots), read by the
LLM into a brief the user reviews, then chosen per job (services/campaigns.py)."""
from __future__ import annotations

from typing import Any, Literal, Optional

from fastapi import APIRouter, File, UploadFile
from pydantic import BaseModel, Field

from backend.api.dto import campaign_dto, http_error
from backend.core import i18n, llm
from backend.core.db import get_db
from backend.models.documents import clean_brief
from backend.services import brand_templates as bts
from backend.services import campaigns as svc

M = i18n.messages({
    "not_found": {
        "id": "Campaign tidak ditemukan",
        "en": "Campaign not found",
    },
    "name_required": {
        "id": "Nama campaign wajib diisi",
        "en": "A campaign name is required",
    },
    "template_missing": {
        "id": "Brand template tidak ditemukan",
        "en": "Brand template not found",
    },
    "source_missing": {
        "id": "Bahan brief tidak ditemukan",
        "en": "Brief piece not found",
    },
    "text_required": {
        "id": "Teks brief masih kosong",
        "en": "The brief text is empty",
    },
    "busy": {
        "id": "Brief sedang dibaca. Tunggu sampai selesai.",
        "en": "The brief is being read. Wait until it finishes.",
    },
    "no_draft": {
        "id": "Tidak ada hasil baca brief yang menunggu",
        "en": "There is no brief reading waiting for review",
    },
    "default_text_name": {
        "id": "Teks brief",
        "en": "Brief text",
    },
})

router = APIRouter(prefix="/api/campaigns", tags=["campaigns"])


def _get(campaign_id: str) -> dict[str, Any]:
    doc = svc.get(campaign_id)
    if not doc:
        raise http_error(404, M("not_found"))
    return doc


def _dto(doc: dict[str, Any]) -> dict[str, Any]:
    return campaign_dto(doc, counts=svc.counts().get(doc["_id"]))


def _name(value: Optional[str]) -> str:
    name = " ".join((value or "").split())
    if not name:
        raise http_error(400, M("name_required"))
    return name[:80]


def _template(template_id: Optional[str]) -> Optional[str]:
    if template_id and not bts.get(template_id):
        raise http_error(400, M("template_missing"))
    return template_id or None


@router.get("")
def list_campaigns(status: Optional[str] = None):
    q: dict[str, Any] = {"status": status} if status in ("active", "archived") else {}
    counts = svc.counts()
    out = []
    for d in get_db().campaigns.find(q, {"sources.text": 0, "draft": 0}).sort("updated_at", -1):
        dto = campaign_dto(d, counts=counts.get(d["_id"]))
        dto["source_count"] = len(d.get("sources") or [])
        dto.pop("sources", None)
        out.append(dto)
    return {"campaigns": out}


class CampaignCreate(BaseModel):
    name: str = Field(max_length=80)
    client: str = Field(default="", max_length=80)
    brand_template_id: Optional[str] = None
    brief: Optional[dict[str, Any]] = None


@router.post("")
def create_campaign(body: CampaignCreate):
    doc = svc.create(_name(body.name), client=" ".join(body.client.split()),
                     brief=body.brief, brand_template_id=_template(body.brand_template_id))
    return {"campaign": _dto(doc)}


@router.get("/{campaign_id}")
def get_campaign(campaign_id: str):
    return {"campaign": _dto(_get(campaign_id))}


class CampaignUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=80)
    client: Optional[str] = Field(default=None, max_length=80)
    status: Optional[Literal["active", "archived"]] = None
    brand_template_id: Optional[str] = None
    # A reviewed brief: replaces the current one (version + 1) and clears a waiting draft
    brief: Optional[dict[str, Any]] = None


@router.put("/{campaign_id}")
def update_campaign(campaign_id: str, body: CampaignUpdate):
    doc = _get(campaign_id)
    data = body.model_dump(exclude_unset=True)
    if "name" in data:
        doc["name"] = _name(data["name"])
    if "client" in data:
        doc["client"] = " ".join((data["client"] or "").split())
    if data.get("status"):
        doc["status"] = data["status"]
    if "brand_template_id" in data:
        doc["brand_template_id"] = _template(data["brand_template_id"])
    if data.get("brief") is not None:
        brief = clean_brief(data["brief"])
        if brief != clean_brief(doc.get("brief") or {}):
            doc["version"] = int(doc.get("version") or 1) + 1
        doc["brief"] = brief
        doc["draft"] = None
        if (doc.get("parse") or {}).get("status") == "done":
            doc["parse"] = {**doc["parse"], "status": "idle"}
    return {"campaign": _dto(svc.save(doc))}


@router.delete("/{campaign_id}")
def delete_campaign(campaign_id: str):
    _get(campaign_id)
    svc.delete(campaign_id)
    return {"ok": True}


class TextSource(BaseModel):
    text: str = Field(max_length=svc.TEXT_SOURCE_MAX)
    name: str = Field(default="", max_length=160)


@router.post("/{campaign_id}/sources/text")
def add_text_source(campaign_id: str, body: TextSource):
    _get(campaign_id)
    if not body.text.strip():
        raise http_error(400, M("text_required"))
    try:
        doc = svc.add_text(campaign_id, " ".join(body.name.split()) or M("default_text_name"), body.text)
    except svc.CampaignError as exc:
        raise http_error(400, str(exc))
    return {"campaign": _dto(doc)}


@router.post("/{campaign_id}/sources/file")
async def add_file_source(campaign_id: str, file: UploadFile = File(...)):
    """A document (PDF, DOCX, TXT, MD) or an image (a screenshot, also pasted from the clipboard)."""
    _get(campaign_id)
    from backend.services import brief_sources
    from starlette.concurrency import run_in_threadpool

    limit = brief_sources.MAX_FILE_MB * 1024 * 1024
    data = bytearray()
    while chunk := await file.read(1024 * 1024):
        data.extend(chunk)
        if len(data) > limit:
            raise http_error(400, str(brief_sources.SourceError(brief_sources.M("too_large", mb=brief_sources.MAX_FILE_MB))))
    try:
        doc = await run_in_threadpool(svc.add_file, campaign_id, file.filename or "brief", bytes(data), file.content_type)
    except svc.CampaignError as exc:
        raise http_error(400, str(exc))
    return {"campaign": _dto(doc)}


@router.delete("/{campaign_id}/sources/{source_id}")
def delete_source(campaign_id: str, source_id: str):
    _get(campaign_id)
    try:
        doc = svc.remove_source(campaign_id, source_id)
    except KeyError:
        raise http_error(404, M("source_missing"))
    return {"campaign": _dto(doc)}


@router.post("/{campaign_id}/parse")
def parse_brief(campaign_id: str):
    """Read every brief piece with the LLM in the background; the result arrives as `campaign.parse`
    events and lands in `draft` for review."""
    _get(campaign_id)
    try:
        llm.target()
    except llm.LLMError as exc:
        raise http_error(400, str(exc))
    if not svc.start_parse(campaign_id):
        raise http_error(409, M("busy"))
    return {"campaign": _dto(_get(campaign_id))}


@router.post("/{campaign_id}/draft/discard")
def discard_draft(campaign_id: str):
    doc = _get(campaign_id)
    if not doc.get("draft"):
        raise http_error(400, M("no_draft"))
    doc["draft"] = None
    doc["parse"] = {"status": "idle"}
    return {"campaign": _dto(svc.save(doc))}
