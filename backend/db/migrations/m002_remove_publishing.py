"""002_remove_publishing: scheduling and social-account connections were removed (2026-11-09).

Fresh databases never had them (001_init no longer creates them); this cleans databases created
before the removal. The pre-migration EJSON backup (core/db.migrate) keeps the old documents.
"""
from __future__ import annotations

from pymongo.database import Database

from backend.db.migrations.m001_init import VALIDATORS


def up(db: Database) -> None:
    if "scheduled_posts" in db.list_collection_names():
        db.drop_collection("scheduled_posts")
    db.super_agents.update_many({"social_connections": {"$exists": True}}, {"$unset": {"social_connections": ""}})
    db.discovery_jobs.update_many({"checkpoint.scheduling_done": {"$exists": True}},
                                  {"$unset": {"checkpoint.scheduling_done": ""}})
    db.discovery_jobs.update_many({"current_step": "scheduling"}, {"$set": {"current_step": "processing"}})
    if "super_agents" in db.list_collection_names():
        db.command("collMod", "super_agents", validator=VALIDATORS["super_agents"], validationLevel="moderate")
