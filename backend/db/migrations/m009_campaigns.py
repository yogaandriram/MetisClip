"""009_campaigns: campaigns and their briefs (2026-11-16).

A campaign is a named brief in a shared library (collection `campaigns`), like the brand templates. A job
can follow one or more campaigns (`discovery_jobs.campaign_ids`, with a snapshot of each brief in
`discovery_jobs.campaigns`); each clip it makes belongs to one of them (`clips.campaign_id`). The brief's
own files (documents, screenshots) live in library/_campaigns/<campaign id>/.

Existing jobs and clips have no campaign and keep working as before.
"""
from __future__ import annotations

from pymongo import ASCENDING, DESCENDING
from pymongo.database import Database
from pymongo.errors import CollectionInvalid

from backend.db.migrations.m001_init import DATE, STR, _schema

VALIDATOR = _schema(
    ["_id", "name", "status", "brief", "created_at"],
    {
        "_id": STR,
        "name": {"bsonType": "string", "minLength": 1, "maxLength": 80},
        "client": {"bsonType": "string"},
        "status": {"enum": ["active", "archived"]},
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


def up(db: Database) -> None:
    try:
        db.create_collection("campaigns", validator=VALIDATOR, validationLevel="moderate")
    except CollectionInvalid:
        db.command("collMod", "campaigns", validator=VALIDATOR, validationLevel="moderate")
    db.campaigns.create_index([("status", ASCENDING), ("updated_at", DESCENDING)])
    db.clips.create_index([("campaign_id", ASCENDING), ("created_at", DESCENDING)])
    db.discovery_jobs.create_index([("campaign_ids", ASCENDING)])
