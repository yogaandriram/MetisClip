"""Campaigns (collection `campaigns`): the container of everything the app makes (they replaced the
workspaces on 2026-11-16). Every job follows one or more campaigns, every clip belongs to one, and a
campaign's clips live in <DATA_ROOT>/library/<slug>/. A campaign with an empty brief is a plain one.

A campaign holds the brief material as the user gave it (`sources`: typed text, documents,
screenshots; files under <DATA_ROOT>/library/_campaigns/<id>/), the brief the pipeline acts on
(`brief`, the Brief shape in models/documents.py) and, after "understand the brief", a `draft` the
user reviews before it replaces the brief. Saving a brief bumps `version`; a job keeps a snapshot of
each campaign as it was when the job was created, so a later edit never changes a running job.
"""
from __future__ import annotations

import logging
import shutil
import threading
import uuid
from pathlib import Path
from typing import Any

from backend.core import events, i18n
from backend.core.db import get_db, new_id, utcnow
from backend.core.paths import get_paths, slugify
from backend.models.documents import CampaignDoc, CampaignSourceDoc, clean_brief
from backend.services import brief_sources

M = i18n.messages({
    "interrupted": {
        "id": "Pembacaan brief terhenti karena aplikasi ditutup. Coba lagi.",
        "en": "Reading the brief stopped because the app was closed. Try again.",
    },
    "failed": {
        "id": "Brief gagal dibaca: {error}",
        "en": "The brief couldn't be read: {error}",
    },
    "too_many_sources": {
        "id": "Satu campaign maksimal {n} bahan brief",
        "en": "A campaign can have at most {n} brief pieces",
    },
})

logger = logging.getLogger(__name__)

ASSETS_DIRNAME = "_campaigns"
MAX_SOURCES = 30
TEXT_SOURCE_MAX = 60_000


class CampaignError(Exception):
    """Message for the user (in the UI language)."""


def asset_dir(campaign_id: str) -> Path:
    return get_paths().library_dir / ASSETS_DIRNAME / campaign_id


def get(campaign_id: str | None) -> dict[str, Any] | None:
    if not campaign_id:
        return None
    return get_db().campaigns.find_one({"_id": campaign_id})


# Brief fields that only inform the user; a brief with nothing else is empty
_INFO_ONLY = ("language", "payout", "submission", "questions")


def has_brief(brief: dict[str, Any] | None) -> bool:
    """Whether a brief asks for anything. Without one the campaign is plain: no brief in the prompts, no
    fit score, no checklist and no automatic post text."""
    b, empty = clean_brief(brief or {}), clean_brief({})
    return any(b.get(k) != empty.get(k) for k in b if k not in _INFO_ONLY)


def unique_slug(name: str, exclude_id: str | None = None) -> str:
    """A library folder name for a campaign that no other campaign uses."""
    base = slugify(name)
    slug, n = base, 2
    db = get_db()
    while db.campaigns.find_one({"slug": slug, **({"_id": {"$ne": exclude_id}} if exclude_id else {})}, {"_id": 1}):
        slug = f"{base}-{n}"
        n += 1
    return slug


def slug_of(doc: dict[str, Any] | None) -> str:
    """The campaign's library folder (older documents without one: from the name)."""
    doc = doc or {}
    return doc.get("slug") or slugify(doc.get("name") or "") or "campaign"


def create(name: str, *, client: str = "", brief: dict[str, Any] | None = None,
           brand_template_id: str | None = None) -> dict[str, Any]:
    now = utcnow()
    doc = CampaignDoc(_id=new_id(), name=name, client=client, slug=unique_slug(name), brief=clean_brief(brief or {}),
                      brand_template_id=brand_template_id, created_at=now, updated_at=now).to_mongo()
    get_db().campaigns.insert_one(doc)
    events.publish({"type": "campaign.updated", "id": doc["_id"]})
    return doc


def save(doc: dict[str, Any]) -> dict[str, Any]:
    doc["updated_at"] = utcnow()
    out = CampaignDoc(**doc).to_mongo()  # validated before it is written
    get_db().campaigns.replace_one({"_id": out["_id"]}, out)
    events.publish({"type": "campaign.updated", "id": out["_id"]})
    return out


def _inside_library(path: Path) -> bool:
    try:
        return get_paths().library_dir.resolve() in path.resolve().parents
    except OSError:
        return False


def delete(campaign_id: str, *, delete_files: bool = False) -> int:
    """The campaign with everything in it: its clips (and their renders), its brief files, and the jobs
    that follow only this campaign (with their source videos); other jobs just stop following it.
    Clip folders are deleted only with `delete_files`. Dependants go first, one collection at a time
    (no transactions), so a crash part-way is safe to repeat. Returns the number of deleted clips."""
    from backend.core.queue import runner

    db = get_db()
    doc = db.campaigns.find_one({"_id": campaign_id}, {"slug": 1, "name": 1}) or {}
    for job in db.discovery_jobs.find({"campaign_ids": campaign_id, "status": {"$in": ["pending", "running"]}}, {"_id": 1}):
        runner.cancel_job(job["_id"])
    clips = list(db.clips.find({"campaign_id": campaign_id}, {"_id": 1, "files": 1}))
    clip_ids = [c["_id"] for c in clips]
    for rj in db.render_jobs.find({"clip_id": {"$in": clip_ids}, "status": {"$in": ["queued", "rendering"]}}, {"_id": 1}):
        runner.cancel_render(rj["_id"])
    db.render_jobs.delete_many({"clip_id": {"$in": clip_ids}})
    db.clips.delete_many({"campaign_id": campaign_id})
    only_this = [j["_id"] for j in db.discovery_jobs.find({"campaign_ids": {"$size": 1, "$all": [campaign_id]}}, {"_id": 1})]
    db.source_videos.delete_many({"job_id": {"$in": only_this}})
    db.discovery_jobs.delete_many({"_id": {"$in": only_this}})
    db.discovery_jobs.update_many({"campaign_ids": campaign_id},
                                  {"$pull": {"campaign_ids": campaign_id, "campaigns": {"id": campaign_id}}})
    db.campaigns.delete_one({"_id": campaign_id})

    folder = asset_dir(campaign_id)
    root = (get_paths().library_dir / ASSETS_DIRNAME).resolve()
    if folder.is_dir() and root in folder.resolve().parents:
        shutil.rmtree(folder, ignore_errors=True)
    if delete_files:
        # Each clip has its own folder (a moment shared with another campaign is hard-linked, so the
        # other clip keeps its files); the campaign folder goes too once it is empty
        data_root = get_paths().data_root
        for clip in clips:
            raw = (clip.get("files") or {}).get("raw")
            target = (data_root / raw).parent if raw else None
            if target and target.is_dir() and _inside_library(target) and target.name == clip["_id"]:
                shutil.rmtree(target, ignore_errors=True)
        own = get_paths().campaign_library(slug_of(doc)) if doc else None
        if own and own.is_dir() and _inside_library(own):
            try:
                own.rmdir()  # only when empty: another campaign's clips may share an old workspace folder
            except OSError:
                pass
    for cid in clip_ids:
        events.publish({"type": "clip.deleted", "id": cid})
    events.publish({"type": "campaign.deleted", "id": campaign_id})
    return len(clip_ids)


def counts() -> dict[str, dict[str, int]]:
    """{campaign id: {clips, exported}} for the list and progress views."""
    out: dict[str, dict[str, int]] = {}
    for row in get_db().clips.aggregate([
        {"$match": {"campaign_id": {"$type": "string"}}},
        {"$group": {"_id": "$campaign_id", "clips": {"$sum": 1},
                    "exported": {"$sum": {"$cond": [{"$ne": [{"$ifNull": ["$files.final", None]}, None]}, 1, 0]}}}},
    ]):
        out[row["_id"]] = {"clips": row["clips"], "exported": row["exported"]}
    return out


def snapshot(doc: dict[str, Any]) -> dict[str, Any]:
    """What a job keeps of a campaign."""
    return {"id": doc["_id"], "name": doc.get("name") or "", "slug": slug_of(doc), "version": doc.get("version", 1),
            "brief": clean_brief(doc.get("brief") or {}), "brand_template_id": doc.get("brand_template_id")}


# ---------------------------------------------------------------- brief material

def _check_room(doc: dict[str, Any]) -> None:
    if len(doc.get("sources") or []) >= MAX_SOURCES:
        raise CampaignError(M("too_many_sources", n=MAX_SOURCES))


def add_text(campaign_id: str, name: str, text: str) -> dict[str, Any]:
    doc = get(campaign_id)
    if doc is None:
        raise KeyError(campaign_id)
    _check_room(doc)
    src = CampaignSourceDoc(id=uuid.uuid4().hex[:12], kind="text", name=name, size=len(text.encode()),
                            text=text.strip()[:TEXT_SOURCE_MAX]).model_dump()
    doc.setdefault("sources", []).append(src)
    return save(doc)


def add_file(campaign_id: str, filename: str, data: bytes, mime: str | None = None) -> dict[str, Any]:
    """Store an uploaded document or image and read its text (PDF scans become page images)."""
    doc = get(campaign_id)
    if doc is None:
        raise KeyError(campaign_id)
    _check_room(doc)
    try:
        kind = brief_sources.kind_for(filename)
        brief_sources.check_size(len(data))
    except brief_sources.SourceError as exc:
        raise CampaignError(str(exc)) from exc
    sid = uuid.uuid4().hex[:12]
    ext = Path(filename).suffix.lower()
    folder = asset_dir(campaign_id)
    folder.mkdir(parents=True, exist_ok=True)
    dest = folder / f"{sid}{ext}"
    dest.write_bytes(data)
    try:
        found = brief_sources.extract(dest, data)
    except brief_sources.SourceError as exc:
        dest.unlink(missing_ok=True)
        raise CampaignError(str(exc)) from exc
    paths = get_paths()
    src = CampaignSourceDoc(
        id=sid, kind=kind, name=(Path(filename).name or f"brief{ext}")[:160], path=paths.to_relative(dest),
        mime=mime, size=len(data), text=found["text"], pages=found["pages"],
        images=[paths.to_relative(p) for p in found["images"]],
    ).model_dump()
    doc.setdefault("sources", []).append(src)
    return save(doc)


def remove_source(campaign_id: str, source_id: str) -> dict[str, Any]:
    doc = get(campaign_id)
    if doc is None:
        raise KeyError(campaign_id)
    keep, gone = [], []
    for s in doc.get("sources") or []:
        (gone if s.get("id") == source_id else keep).append(s)
    if not gone:
        raise KeyError(source_id)
    doc["sources"] = keep
    paths = get_paths()
    root = asset_dir(campaign_id).resolve()
    for s in gone:
        for rel in [s.get("path"), *(s.get("images") or [])]:
            if rel:
                f = paths.from_relative(rel)
                if root in f.resolve().parents:
                    f.unlink(missing_ok=True)
    return save(doc)


def resolve_source_path(rel: str) -> Path | None:
    """A stored brief file, only inside library/_campaigns/."""
    if not rel:
        return None
    paths = get_paths()
    f = paths.from_relative(rel)
    root = (paths.library_dir / ASSETS_DIRNAME).resolve()
    return f if f.is_file() and root in f.resolve().parents else None


# ---------------------------------------------------------------- understanding the brief

_parsing: set[str] = set()
_parsing_lock = threading.Lock()


def _set_parse(campaign_id: str, parse: dict[str, Any], **extra: Any) -> None:
    get_db().campaigns.update_one({"_id": campaign_id}, {"$set": {"parse": parse, "updated_at": utcnow(), **extra}})
    events.publish({"type": "campaign.parse", "id": campaign_id, "status": parse.get("status"),
                    "message": parse.get("message") or ""})


def start_parse(campaign_id: str) -> bool:
    """Read the brief material in a background thread. False when a read is already running."""
    with _parsing_lock:
        if campaign_id in _parsing:
            return False
        _parsing.add(campaign_id)
    _set_parse(campaign_id, {"status": "running", "at": utcnow()})
    threading.Thread(target=_parse, args=(campaign_id,), name=f"brief-{campaign_id[:8]}", daemon=True).start()
    return True


def _parse(campaign_id: str) -> None:
    from backend.agents.tools import brief_ai
    from backend.core import llm

    try:
        doc = get(campaign_id)
        if doc is None:
            return
        work = get_paths().cache_dir / "brief" / campaign_id
        try:
            res = brief_ai.read_brief(doc.get("sources") or [], resolve=resolve_source_path, work_dir=work)
        finally:
            shutil.rmtree(work, ignore_errors=True)
        try:
            t = llm.target()
            where = {"provider": t.provider.label, "model": t.model}
        except llm.LLMError:
            where = {}
        draft = {"brief": res["brief"], "name": res["name"], "client": res["client"],
                 "unreadable": res["unreadable"], "at": utcnow()}
        _set_parse(campaign_id, {"status": "done", "at": utcnow(), "used_ocr": res["used_ocr"],
                                 "used_vision": res["used_vision"], **where}, draft=draft)
    except (brief_ai.BriefReadError, llm.LLMError) as exc:
        _set_parse(campaign_id, {"status": "failed", "message": str(exc), "at": utcnow()})
    except Exception as exc:  # never leaves the campaign stuck in "running"
        logger.exception("Brief parse failed for %s", campaign_id)
        _set_parse(campaign_id, {"status": "failed", "message": M("failed", error=exc), "at": utcnow()})
    finally:
        with _parsing_lock:
            _parsing.discard(campaign_id)


def recover() -> None:
    """After a restart: a read that was running is gone."""
    get_db().campaigns.update_many(
        {"parse.status": "running"},
        {"$set": {"parse": {"status": "failed", "message": M("interrupted"), "at": utcnow()}}},
    )
