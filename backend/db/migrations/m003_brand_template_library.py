"""003_brand_template_library: brand templates become a shared library of named templates.

Before: one template embedded in each workspace (`super_agents.brand_template`), brand assets in
library/<agent-slug>/_assets/. After: collection `brand_templates`; each agent points at its default
(`default_brand_template_id`) and each clip at its template (`clips.brand_template_id`).

Every embedded template becomes a library template named after its agent; its asset files move to
library/_brand/<template id>/ (same drive, so a rename) and the asset:// references are rewritten.
Safe to re-run after a crash: the template id is derived from the agent id, and every step checks
what is already done.
"""
from __future__ import annotations

import logging
import os
import shutil
import uuid
from datetime import datetime, timezone
from typing import Any

from pymongo import ASCENDING
from pymongo.database import Database
from pymongo.errors import CollectionInvalid

from backend.db.migrations.m001_init import DATE, STR, _schema

logger = logging.getLogger(__name__)

VALIDATOR = _schema(
    ["_id", "name", "created_at"],
    {
        "_id": STR,
        "name": {"bsonType": "string", "minLength": 1, "maxLength": 80},
        "brand_settings": {"bsonType": "object"},
        "caption_settings": {"bsonType": "object"},
        "layout_settings": {"bsonType": "object"},
        "ai_settings": {"bsonType": "object"},
        "created_at": DATE,
        "updated_at": DATE,
    },
)

_NS = uuid.UUID("6f0c1b2e-6b1d-4f3e-9a51-6d6574697363")


def _template_id(agent_id: str) -> str:
    return str(uuid.uuid5(_NS, f"brand-template:{agent_id}"))


def _move_assets(value: Any, old_prefix: str, new_dir_rel: str) -> Any:
    """Move asset files under `old_prefix` into `new_dir_rel` and return the rewritten value."""
    if isinstance(value, dict):
        return {k: _move_assets(v, old_prefix, new_dir_rel) for k, v in value.items()}
    if isinstance(value, list):
        return [_move_assets(v, old_prefix, new_dir_rel) for v in value]
    if not (isinstance(value, str) and value.startswith("asset://" + old_prefix)):
        return value
    from backend.core.paths import get_paths

    paths = get_paths()
    rel = value[len("asset://"):]
    new_rel = f"{new_dir_rel}/{rel.rsplit('/', 1)[-1]}"
    src, dst = paths.from_relative(rel), paths.from_relative(new_rel)
    try:
        if src.exists() and not dst.exists():
            dst.parent.mkdir(parents=True, exist_ok=True)
            try:
                os.replace(src, dst)
            except OSError:
                shutil.copy2(src, dst)
        if dst.exists():
            return "asset://" + new_rel
    except Exception as exc:  # keep the old reference; the file still works where it is
        logger.warning("Brand asset %s not moved: %s", rel, exc)
    return value


def _remove_if_empty(rel_dir: str) -> None:
    """Drop the old per-agent _assets folder once every file has moved (rmdir fails when not empty)."""
    from backend.core.paths import get_paths

    try:
        get_paths().from_relative(rel_dir).rmdir()
    except Exception:
        pass


def up(db: Database) -> None:
    from backend.services.brand_templates import ASSETS_DIRNAME, DEFAULT_NAME

    try:
        db.create_collection("brand_templates", validator=VALIDATOR, validationLevel="moderate")
    except CollectionInvalid:
        db.command("collMod", "brand_templates", validator=VALIDATOR, validationLevel="moderate")
    db.brand_templates.create_index([("created_at", ASCENDING)])
    db.clips.create_index([("brand_template_id", ASCENDING)])

    for agent in db.super_agents.find({"brand_template": {"$exists": True}}):
        tid = _template_id(agent["_id"])
        bt = agent.get("brand_template") or {}
        if not db.brand_templates.find_one({"_id": tid}, {"_id": 1}):
            slug = agent.get("slug") or ""
            brand = bt.get("brand_settings") or {}
            if slug:
                brand = _move_assets(brand, f"library/{slug}/_assets/", f"library/{ASSETS_DIRNAME}/{tid}")
                _remove_if_empty(f"library/{slug}/_assets")
            created = agent.get("created_at") or bt.get("updated_at") or datetime.now(timezone.utc)
            db.brand_templates.insert_one({
                "_id": tid,
                "name": (agent.get("name") or DEFAULT_NAME)[:80],
                "brand_settings": brand,
                "caption_settings": bt.get("caption_settings") or {"mode": "popshadow"},
                "layout_settings": bt.get("layout_settings") or {},
                "ai_settings": bt.get("ai_settings") or {},
                "created_at": created or bt.get("updated_at"),
                "updated_at": bt.get("updated_at") or created,
            })
        db.clips.update_many({"agent_id": agent["_id"], "brand_template_id": {"$exists": False}},
                             {"$set": {"brand_template_id": tid}})
        db.super_agents.update_one({"_id": agent["_id"]},
                                   {"$set": {"default_brand_template_id": tid}, "$unset": {"brand_template": ""}})

    if not db.brand_templates.find_one({}, {"_id": 1}):
        now = datetime.now(timezone.utc)
        db.brand_templates.insert_one({"_id": str(uuid.uuid4()), "name": DEFAULT_NAME, "brand_settings": {},
                                       "caption_settings": {"mode": "popshadow"}, "layout_settings": {},
                                       "ai_settings": {}, "created_at": now, "updated_at": now})
    first = db.brand_templates.find_one({}, {"_id": 1}, sort=[("created_at", 1)])
    db.super_agents.update_many({"default_brand_template_id": {"$in": [None]}},
                                {"$set": {"default_brand_template_id": first["_id"]}})
