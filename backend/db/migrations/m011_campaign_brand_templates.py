"""011_campaign_brand_templates: every brand template belongs to one campaign (owner request, 2026-11-16).

Until now templates were a shared library: a campaign picked one (`campaigns.brand_template_id`, null =
the default template, the oldest), and clips could pick any. From now on each campaign holds its own
templates, one of them its default, and a fresh install starts with none.

- A template used by one campaign (as its choice, as the default it fell back to, or by its clips) moves
  into that campaign. Used by several, it stays with the oldest of them and every other one gets its own
  copy (deterministic id, same settings; asset files are shared, not copied), with its clips and its
  default pointing at the copy.
- A template nobody uses joins the oldest campaign. When there is no campaign at all, the built-in
  "Template Default" that migration 003 made for an empty database is deleted (a fresh install starts
  empty); any other template waits with `campaign_id: null` and joins the first campaign created.
- Every campaign ends with an explicit default among its own templates; a campaign without any template
  gets a basic one (no AI call inside a migration).

Every write is a single-document or update_many write with deterministic ids, so a crash part-way is
safe to run again (the runner writes a backup before any migration).
"""
from __future__ import annotations

import uuid
from typing import Any

from pymongo import ASCENDING
from pymongo.database import Database
from pymongo.errors import OperationFailure

from backend.core.db import utcnow
from backend.db.migrations.m001_init import DATE, STR, _schema

VALIDATOR = _schema(
    ["_id", "name", "created_at"],
    {
        "_id": STR,
        "name": {"bsonType": "string", "minLength": 1, "maxLength": 80},
        "campaign_id": {"bsonType": ["string", "null"]},
        "brand_settings": {"bsonType": "object"},
        "caption_settings": {"bsonType": "object"},
        "layout_settings": {"bsonType": "object"},
        "ai_settings": {"bsonType": "object"},
        "design": {"bsonType": ["object", "null"]},
        "created_at": DATE,
        "updated_at": DATE,
    },
)

_NS = uuid.UUID("0b6f7d2c-1a4e-4c8b-9f3d-6d657469733b")
SECTIONS = ("brand_settings", "caption_settings", "layout_settings", "ai_settings")
BUILTIN_NAMES = ("Template Default", "Default template")


def _copy_id(template_id: str, campaign_id: str) -> str:
    return str(uuid.uuid5(_NS, f"brand-template:{template_id}:{campaign_id}"))


def _pristine(tpl: dict[str, Any]) -> bool:
    """The untouched template migration 003 made for an empty database."""
    if tpl.get("name") not in BUILTIN_NAMES:
        return False
    caption = tpl.get("caption_settings") or {}
    layout = {k: v for k, v in (tpl.get("layout_settings") or {}).items() if k != "safeZone"}
    return (not tpl.get("brand_settings") and not layout and not tpl.get("ai_settings")
            and set(caption) <= {"mode"} and caption.get("mode", "popshadow") == "popshadow")


def up(db: Database) -> None:
    try:
        db.command("collMod", "brand_templates", validator=VALIDATOR, validationLevel="moderate")
    except OperationFailure:
        db.create_collection("brand_templates", validator=VALIDATOR, validationLevel="moderate")
    db.brand_templates.create_index([("campaign_id", ASCENDING), ("created_at", ASCENDING)])

    templates = list(db.brand_templates.find({}).sort("created_at", 1))
    by_id = {t["_id"]: t for t in templates}
    campaigns = list(db.campaigns.find({}, {"_id": 1, "name": 1, "brand_template_id": 1}).sort("created_at", 1))
    order = {c["_id"]: i for i, c in enumerate(campaigns)}
    # The old default template: the oldest one (copies made by an earlier run of this migration excluded)
    originals = [t for t in templates if not (t.get("design") or {}).get("m011_copy_of")]
    default = originals[0]["_id"] if originals else None

    # template id -> campaigns using it (as their choice or fallback, or through their clips)
    owners: dict[str, list[str]] = {}
    chosen: dict[str, str] = {}
    for c in campaigns:
        tid = c.get("brand_template_id") if c.get("brand_template_id") in by_id else default
        if tid:
            chosen[c["_id"]] = tid
            owners.setdefault(tid, []).append(c["_id"])
    for row in db.clips.aggregate([
        {"$match": {"brand_template_id": {"$type": "string"}, "campaign_id": {"$type": "string"}}},
        {"$group": {"_id": {"t": "$brand_template_id", "c": "$campaign_id"}}},
    ]):
        tid, cid = row["_id"]["t"], row["_id"]["c"]
        if tid in by_id and cid in order and cid not in owners.setdefault(tid, []):
            owners[tid].append(cid)

    for tpl in templates:
        tid = tpl["_id"]
        copy_of = (tpl.get("design") or {}).get("m011_copy_of")
        if copy_of:  # made by an earlier, interrupted run: it already has its campaign
            continue
        own = sorted(owners.get(tid) or [], key=lambda cid: order[cid])
        if not own and campaigns:
            own = [campaigns[0]["_id"]]
        if not own:
            if _pristine(tpl) and not db.clips.find_one({"brand_template_id": tid}, {"_id": 1}):
                db.brand_templates.delete_one({"_id": tid})
            else:
                db.brand_templates.update_one({"_id": tid}, {"$set": {"campaign_id": None}})
            continue
        first, others = own[0], own[1:]
        db.brand_templates.update_one({"_id": tid}, {"$set": {"campaign_id": first}})
        for cid in others:
            new_id = _copy_id(tid, cid)
            if not db.brand_templates.find_one({"_id": new_id}, {"_id": 1}):
                now = utcnow()
                db.brand_templates.insert_one({
                    "_id": new_id, "name": tpl.get("name") or "Template", "campaign_id": cid,
                    **{k: tpl.get(k) or {} for k in SECTIONS},
                    "design": {"m011_copy_of": tid},
                    "created_at": tpl.get("created_at") or now, "updated_at": now,
                })
            db.clips.update_many({"campaign_id": cid, "brand_template_id": tid}, {"$set": {"brand_template_id": new_id}})
            if chosen.get(cid) == tid:
                chosen[cid] = new_id

    # Every campaign: an explicit default among its own templates
    for c in campaigns:
        cid = c["_id"]
        tid = chosen.get(cid)
        tpl = db.brand_templates.find_one({"_id": tid, "campaign_id": cid}, {"_id": 1}) if tid else None
        if not tpl:
            tpl = db.brand_templates.find_one({"campaign_id": cid}, {"_id": 1}, sort=[("created_at", 1)])
        if not tpl:
            now = utcnow()
            tpl = {"_id": str(uuid.uuid5(_NS, f"basic:{cid}")), "name": f"Template {c.get('name') or ''}".strip()[:80],
                   "campaign_id": cid, "brand_settings": {}, "caption_settings": {"mode": "popshadow"},
                   "layout_settings": {}, "ai_settings": {}, "design": {"status": "basic", "auto": False, "edited": False},
                   "created_at": now, "updated_at": now}
            if not db.brand_templates.find_one({"_id": tpl["_id"]}, {"_id": 1}):
                db.brand_templates.insert_one(tpl)
        if c.get("brand_template_id") != tpl["_id"]:
            db.campaigns.update_one({"_id": cid}, {"$set": {"brand_template_id": tpl["_id"]}})

    # A clip pointing at a template of another campaign (or a missing one) follows its campaign's default
    homes = {t["_id"]: t.get("campaign_id") for t in db.brand_templates.find({}, {"campaign_id": 1})}
    for clip in db.clips.find({"brand_template_id": {"$type": "string"}}, {"brand_template_id": 1, "campaign_id": 1}):
        if homes.get(clip["brand_template_id"]) != clip.get("campaign_id"):
            db.clips.update_one({"_id": clip["_id"]}, {"$unset": {"brand_template_id": ""}})
