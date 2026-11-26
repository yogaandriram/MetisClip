"""After the desktop shell moved the data folder ("Pindahkan Lokasi Data").

Media paths in the database are relative to the data folder, so they move with it. A few fields hold
absolute paths that can point inside it (a custom export folder, a cookies file, an uploaded video that
lived there, a render's output): the first engine start on the new folder gets METISCLIP_MOVED_FROM
and points those at the new folder. Running it again changes nothing.
"""
from __future__ import annotations

import logging
import ntpath
from pathlib import Path
from typing import Any

from backend.core.db import get_db

logger = logging.getLogger(__name__)

# (collection, dotted field) holding absolute paths
FIELDS: list[tuple[str, str]] = [
    ("app_settings", "export_dir"),
    ("app_settings", "ytdlp.cookies_file"),
    ("source_videos", "file_path"),
    ("discovery_jobs", "source.local_file_path"),
    ("render_jobs", "output_path"),
    ("render_jobs", "exported_path"),
    ("render_jobs", "export_dir"),
]


def moved_path(value: Any, old_root: str, new_root: str) -> str | None:
    """`value` with `old_root` swapped for `new_root` when it lies inside `old_root` (any case, either
    slash), else None."""
    if not isinstance(value, str) or not value.strip():
        return None
    v = ntpath.normpath(value.strip())
    old = ntpath.normpath(old_root).rstrip("\\")
    if v.lower() == old.lower():
        return ntpath.normpath(new_root)
    if v.lower().startswith(old.lower() + "\\"):
        return ntpath.normpath(new_root).rstrip("\\") + v[len(old):]
    return None


def _get(doc: dict[str, Any], dotted: str) -> Any:
    cur: Any = doc
    for part in dotted.split("."):
        if not isinstance(cur, dict):
            return None
        cur = cur.get(part)
    return cur


def rewrite_paths(old_root: Path | str, new_root: Path | str) -> int:
    """Points absolute paths inside `old_root` at `new_root`. Returns how many fields changed."""
    db = get_db()
    old, new = str(old_root), str(new_root)
    changed = 0
    for coll, field in FIELDS:
        for doc in db[coll].find({field: {"$type": "string"}}, {field: 1}):
            moved = moved_path(_get(doc, field), old, new)
            if moved is not None:
                db[coll].update_one({"_id": doc["_id"]}, {"$set": {field: moved}})
                changed += 1
    if changed:
        logger.info("Data folder moved from %s: %d stored path(s) now point at %s", old, changed, new)
    return changed
