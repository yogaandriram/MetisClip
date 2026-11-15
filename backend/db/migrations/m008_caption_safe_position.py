"""008_caption_safe_position: the default caption position moves into the area every platform leaves free (2026-11-15).

Before: the caption's bottom edge defaulted to 80 design px above the bottom of the 300×533 preview
canvas (15 % of the video), inside the title and description area of TikTok, IG Reels and YT Shorts.
After: the default is 190 (36 %, just above the 35 % every platform covers at the bottom); the box is
also narrower and has a horizontal position (frontend/lib/presets/position.ts, DEFAULT_POSITION_Y).

A brand template that still stores the old default stops storing it, so it follows the new default.
A clip whose own style stores the old default gets the new value. Any other position was chosen by the
user and stays.
"""
from __future__ import annotations

from pymongo.database import Database

OLD_DEFAULT = 80
NEW_DEFAULT = 190  # = DEFAULT_POSITION_Y in frontend/lib/presets/position.ts


def up(db: Database) -> None:
    db.brand_templates.update_many(
        {"caption_settings.positionY": OLD_DEFAULT}, {"$unset": {"caption_settings.positionY": ""}}
    )
    db.clips.update_many({"subtitle_style.positionY": OLD_DEFAULT}, {"$set": {"subtitle_style.positionY": NEW_DEFAULT}})
