"""010_campaigns_replace_workspaces: campaigns take the place of workspaces (owner request, 2026-11-16).

A campaign is now the container of everything: every job follows one or more campaigns and every clip
belongs to one. Each workspace (`super_agents`) becomes a campaign with the same name, library folder
(slug) and brand template, and an empty brief (a plain campaign); its jobs and clips that had no campaign
move into it. Clips and jobs that already belonged to a campaign keep it. Leftovers whose workspace was
gone go to one "Clip lama" campaign, made only when needed. Then `agent_id` is removed everywhere and the
`super_agents` collection is dropped (the runner writes a backup before any migration).

Every step is a single-document or update_many write, and the workspace -> campaign map is kept in
`meta` until the end, so a crash part-way is safe to run again.
"""
from __future__ import annotations

from typing import Any

from pymongo import ASCENDING, DESCENDING
from pymongo.database import Database
from pymongo.errors import OperationFailure

from backend.core import i18n
from backend.core.db import new_id, utcnow
from backend.core.paths import slugify
from backend.db.migrations.m001_init import DATE, STR, _schema
from backend.models.documents import CampaignDoc, clean_brief

M = i18n.messages({
    "older": {
        "id": "Clip lama",
        "en": "Older clips",
    },
})

MAP_ID = "m010_workspace_campaigns"

VALIDATOR = _schema(
    ["_id", "name", "status", "brief", "created_at"],
    {
        "_id": STR,
        "name": {"bsonType": "string", "minLength": 1, "maxLength": 80},
        "client": {"bsonType": "string"},
        "status": {"enum": ["active", "archived"]},
        "slug": {"bsonType": "string"},
        "brand_template_id": {"bsonType": ["string", "null"]},
        "sources": {"bsonType": "array"},
        "brief": {"bsonType": "object"},
        "draft": {"bsonType": ["object", "null"]},
        "parse": {"bsonType": "object"},
        "version": {"bsonType": ["int", "long"]},
        "created_at": DATE,
        "updated_at": DATE,
    },
)

NO_CAMPAIGN = {"$or": [{"campaign_id": {"$exists": False}}, {"campaign_id": None}]}
NO_CAMPAIGNS = {"$or": [{"campaign_ids": {"$exists": False}}, {"campaign_ids": {"$size": 0}}]}


def _unique(base: str, taken: set[str]) -> str:
    slug, n = base or "campaign", 2
    while slug in taken:
        slug = f"{base}-{n}"
        n += 1
    taken.add(slug)
    return slug


def _snapshot(doc: dict[str, Any]) -> dict[str, Any]:
    return {"id": doc["_id"], "name": doc["name"], "slug": doc["slug"], "version": doc.get("version", 1),
            "brief": doc.get("brief") or clean_brief({}), "brand_template_id": doc.get("brand_template_id")}


def _new_campaign(db: Database, name: str, slug: str, template_id: str | None, created_at: Any) -> dict[str, Any]:
    now = utcnow()
    doc = CampaignDoc(_id=new_id(), name=(name or "Campaign")[:80], slug=slug, brand_template_id=template_id,
                      created_at=created_at or now, updated_at=now).to_mongo()
    db.campaigns.insert_one(doc)
    return doc


def _adopt(db: Database, campaign: dict[str, Any], clip_query: dict, job_query: dict) -> None:
    """Move clips and jobs without a campaign into `campaign`."""
    db.clips.update_many({"$and": [clip_query, NO_CAMPAIGN]}, {"$set": {"campaign_id": campaign["_id"]}})
    db.discovery_jobs.update_many({"$and": [job_query, NO_CAMPAIGNS]},
                                  {"$set": {"campaign_ids": [campaign["_id"]], "campaigns": [_snapshot(campaign)]}})


def up(db: Database) -> None:
    try:
        db.command("collMod", "campaigns", validator=VALIDATOR, validationLevel="moderate")
    except OperationFailure:
        db.create_collection("campaigns", validator=VALIDATOR, validationLevel="moderate")

    agents = list(db.super_agents.find({}).sort("created_at", 1)) if "super_agents" in db.list_collection_names() else []
    mapping: dict[str, str] = (db.meta.find_one({"_id": MAP_ID}) or {}).get("map") or {}
    templates = {t["_id"] for t in db.brand_templates.find({}, {"_id": 1})}

    # Library folders in use: the workspaces' keep their names (their clips' files are there)
    taken = {c["slug"] for c in db.campaigns.find({"slug": {"$type": "string", "$ne": ""}}, {"slug": 1})}
    taken |= {a["slug"] for a in agents if a.get("slug") and a["_id"] not in mapping}
    for c in db.campaigns.find({"$or": [{"slug": {"$exists": False}}, {"slug": ""}]}, {"name": 1}):
        db.campaigns.update_one({"_id": c["_id"]}, {"$set": {"slug": _unique(slugify(c.get("name") or ""), taken)}})

    for agent in agents:
        cid = mapping.get(agent["_id"])
        campaign = db.campaigns.find_one({"_id": cid}) if cid else None
        if campaign is None:
            slug = agent.get("slug") or _unique(slugify(agent.get("name") or ""), taken)
            tid = agent.get("default_brand_template_id")
            campaign = _new_campaign(db, agent.get("name") or "", slug, tid if tid in templates else None,
                                     agent.get("created_at"))
            mapping[agent["_id"]] = campaign["_id"]
            db.meta.update_one({"_id": MAP_ID}, {"$set": {f"map.{agent['_id']}": campaign["_id"]}}, upsert=True)
        _adopt(db, campaign, {"agent_id": agent["_id"]}, {"agent_id": agent["_id"]})

    # Whatever is still without a campaign (its workspace was deleted, or it never had one)
    if db.clips.count_documents(NO_CAMPAIGN) or db.discovery_jobs.count_documents(NO_CAMPAIGNS):
        name = M.text("older", i18n.offline_language())
        older = db.campaigns.find_one({"name": name, "slug": {"$regex": "^clip-lama|^older-clips"}}) or \
            _new_campaign(db, name, _unique(slugify(name), taken), None, None)
        _adopt(db, older, {}, {})

    for coll in ("discovery_jobs", "clips", "source_videos"):
        db[coll].update_many({"agent_id": {"$exists": True}}, {"$unset": {"agent_id": ""}})
    for coll, name in (("discovery_jobs", "agent_id_1_created_at_-1"), ("clips", "agent_id_1_created_at_-1")):
        try:
            db[coll].drop_index(name)
        except OperationFailure:
            pass
    db.discovery_jobs.create_index([("campaign_ids", ASCENDING), ("created_at", DESCENDING)])
    db.clips.create_index([("campaign_id", ASCENDING), ("created_at", DESCENDING)])
    db.campaigns.create_index([("slug", ASCENDING)])

    if "super_agents" in db.list_collection_names():
        db.super_agents.drop()
    db.meta.delete_one({"_id": MAP_ID})
