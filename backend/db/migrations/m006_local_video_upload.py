"""006_local_video_upload: a source video is a YouTube video or an uploaded file (2026-11-09).

`source_videos.youtube_id` was required by the 001 validator; uploaded files have `file_path` instead.
Fresh databases get the new validator from 001_init; this applies it to databases created before.
"""
from __future__ import annotations

from pymongo.database import Database

from backend.db.migrations.m001_init import VALIDATORS


def up(db: Database) -> None:
    if "source_videos" in db.list_collection_names():
        db.command("collMod", "source_videos", validator=VALIDATORS["source_videos"], validationLevel="moderate")
