"""001_init: collections, $jsonSchema validators (moderate) and indexes (CLAUDE.md §6.3)."""
from __future__ import annotations

from pymongo import ASCENDING, DESCENDING
from pymongo.database import Database
from pymongo.errors import CollectionInvalid

STR = {"bsonType": "string"}
DATE = {"bsonType": "date"}
NUM = {"bsonType": ["double", "int", "long", "decimal"]}
NULLABLE_STR = {"bsonType": ["string", "null"]}
NULLABLE_DATE = {"bsonType": ["date", "null"]}


def _schema(required: list[str], properties: dict) -> dict:
    return {"$jsonSchema": {"bsonType": "object", "required": required, "properties": properties}}


VALIDATORS: dict[str, dict] = {
    "super_agents": _schema(
        ["_id", "name", "created_at"],
        {
            "_id": STR,
            "name": {"bsonType": "string", "minLength": 1},
            "default_keywords": {"bsonType": "array"},
            "default_video_types": {"bsonType": "array"},
            "brand_template": {"bsonType": ["object", "null"]},
            "created_at": DATE,
        },
    ),
    "discovery_jobs": _schema(
        ["_id", "source", "config", "status", "created_at"],
        {
            "_id": STR,
            "agent_id": NULLABLE_STR,
            "source": {"bsonType": "object", "required": ["type"]},
            "config": {"bsonType": "object"},
            "status": {"enum": ["pending", "running", "interrupted", "cancelled", "completed", "failed"]},
            "progress_pct": NUM,
            "errors": {"bsonType": "array"},
            "checkpoint": {"bsonType": "object"},
            "created_at": DATE,
            "started_at": NULLABLE_DATE,
            "finished_at": NULLABLE_DATE,
        },
    ),
    "source_videos": _schema(
        ["_id", "job_id", "youtube_id", "created_at"],
        {"_id": STR, "job_id": STR, "youtube_id": STR, "duration_seconds": NUM, "created_at": DATE},
    ),
    "transcripts": _schema(
        ["_id", "segments", "fetched_at"],
        {"_id": STR, "segments": {"bsonType": "array"}, "fetched_at": DATE},
    ),
    "clips": _schema(
        ["_id", "start_time", "end_time", "status", "files", "created_at"],
        {
            "_id": STR,
            "agent_id": NULLABLE_STR,
            "job_id": NULLABLE_STR,
            "start_time": NUM,
            "end_time": NUM,
            "duration_seconds": NUM,
            "status": {"enum": ["processing", "ready", "rendering", "exported", "failed"]},
            "files": {"bsonType": "object"},
            "subtitle": {"bsonType": "object"},
            "subtitle_style": {"bsonType": "object"},
            "created_at": DATE,
            "updated_at": DATE,
        },
    ),
    "render_jobs": _schema(
        ["_id", "clip_id", "status", "created_at"],
        {
            "_id": STR,
            "clip_id": STR,
            "status": {"enum": ["queued", "rendering", "completed", "failed", "cancelled"]},
            "progress_pct": NUM,
            "created_at": DATE,
            "finished_at": NULLABLE_DATE,
        },
    ),
    "app_settings": _schema(["_id"], {"_id": STR}),
    "api_cache": _schema(["_id", "value", "expires_at"], {"_id": STR, "expires_at": DATE}),
    "meta": _schema(["_id"], {"_id": STR}),
}

INDEXES: dict[str, list[tuple[list, dict]]] = {
    "discovery_jobs": [([("agent_id", ASCENDING), ("created_at", DESCENDING)], {}), ([("status", ASCENDING)], {})],
    "source_videos": [([("job_id", ASCENDING)], {}), ([("youtube_id", ASCENDING)], {})],
    "clips": [
        ([("agent_id", ASCENDING), ("created_at", DESCENDING)], {}),
        ([("job_id", ASCENDING)], {}),
        ([("status", ASCENDING)], {}),
    ],
    "render_jobs": [([("clip_id", ASCENDING), ("created_at", DESCENDING)], {}), ([("status", ASCENDING)], {})],
    "api_cache": [([("expires_at", ASCENDING)], {"expireAfterSeconds": 0})],
}


def up(db: Database) -> None:
    existing = set(db.list_collection_names())
    for name, validator in VALIDATORS.items():
        if name in existing:
            db.command("collMod", name, validator=validator, validationLevel="moderate")
        else:
            try:
                db.create_collection(name, validator=validator, validationLevel="moderate")
            except CollectionInvalid:
                db.command("collMod", name, validator=validator, validationLevel="moderate")
    for name, specs in INDEXES.items():
        for keys, opts in specs:
            db[name].create_index(keys, **opts)
