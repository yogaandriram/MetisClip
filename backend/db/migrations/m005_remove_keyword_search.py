"""005_remove_keyword_search: keyword search (YouTube Data API) was removed (2026-11-09); jobs take a link.

Fresh databases never had these (001_init no longer creates them); this cleans databases created
before the removal. The pre-migration EJSON backup (core/db.migrate) keeps the old documents.

- drops the `api_cache` collection (cached search results)
- removes the search fields: agents' default keywords and video types, the jobs' search filters and
  keywords, and the source videos' video type and search quality score
- deletes the stored YouTube Data API key, which nothing uses any more

Old keyword jobs stay in the job list. Resuming one works only when its videos were already found;
otherwise discovery fails with a message to start a new job from a link.
"""
from __future__ import annotations

from pymongo.database import Database

from backend.db.migrations.m001_init import VALIDATORS


def up(db: Database) -> None:
    if "api_cache" in db.list_collection_names():
        db.drop_collection("api_cache")
    db.super_agents.update_many({}, {"$unset": {"default_keywords": "", "default_video_types": ""}})
    db.discovery_jobs.update_many({}, {"$unset": {"source.keywords": "", "config.video_types": "",
                                                  "config.min_duration_minutes": "", "config.min_views": ""}})
    db.source_videos.update_many({}, {"$unset": {"video_type": "", "quality_score": ""}})
    if "super_agents" in db.list_collection_names():
        db.command("collMod", "super_agents", validator=VALIDATORS["super_agents"], validationLevel="moderate")

    from backend.core.secrets import delete_secret

    delete_secret("youtube_api_key")
