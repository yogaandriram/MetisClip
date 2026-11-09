"""EJSON database backups (CLAUDE.md §6.4): <DATA_ROOT>\\backups\\metisclip-YYYYMMDD-HHMM.json.gz, keep 5."""
from __future__ import annotations

import gzip
import logging
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from bson import json_util
from bson.json_util import CANONICAL_JSON_OPTIONS

from backend.core.db import get_db, iso, schema_version
from backend.core.paths import get_paths
from backend.version import __version__

logger = logging.getLogger(__name__)

KEEP = 5
SKIP = {"api_cache"}
_lock = threading.Lock()


def _info(p: Path) -> dict[str, Any]:
    st = p.stat()
    return {
        "name": p.name,
        "path": str(p),
        "size_bytes": st.st_size,
        "created_at": iso(datetime.fromtimestamp(st.st_mtime, tz=timezone.utc)),
    }


def list_backups() -> list[dict[str, Any]]:
    d = get_paths().backups_dir
    if not d.exists():
        return []
    files = sorted(d.glob("metisclip-*.json.gz"), key=lambda p: p.stat().st_mtime, reverse=True)
    return [_info(p) for p in files]


def write_backup(reason: str = "manual") -> dict[str, Any]:
    with _lock:
        db = get_db()
        d = get_paths().backups_dir
        d.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M")
        path = d / f"metisclip-{stamp}.json.gz"
        if path.exists():
            path = d / f"metisclip-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json.gz"
        tmp = path.with_suffix(".tmp")
        names = sorted(n for n in db.list_collection_names() if n not in SKIP and not n.startswith("system."))
        with gzip.open(tmp, "wt", encoding="utf-8") as f:
            header = {"app": "metisclip", "app_version": __version__, "schema_version": schema_version(db),
                      "reason": reason, "created_at": iso(datetime.now(timezone.utc))}
            f.write('{"meta": ' + json_util.dumps(header) + ', "collections": {')
            for ci, name in enumerate(names):
                f.write(("," if ci else "") + json_util.dumps(name) + ": [")
                for di, doc in enumerate(db[name].find()):
                    f.write(("," if di else "") + json_util.dumps(doc, json_options=CANONICAL_JSON_OPTIONS))
                f.write("]")
            f.write("}}")
        tmp.replace(path)
        for old in sorted(d.glob("metisclip-*.json.gz"), key=lambda p: p.stat().st_mtime, reverse=True)[KEEP:]:
            try:
                old.unlink()
            except OSError:
                pass
        logger.info("Database backup written: %s (%s)", path.name, reason)
        return _info(path)


def maybe_daily_backup() -> None:
    """Called periodically: one backup per day while the app is idle."""
    from backend.core.db import get_db as _db

    existing = list_backups()
    if existing:
        newest = datetime.fromisoformat(existing[0]["created_at"].replace("Z", "+00:00"))
        if (datetime.now(timezone.utc) - newest).total_seconds() < 24 * 3600:
            return
    db = _db()
    if db.discovery_jobs.count_documents({"status": "running"}) or db.render_jobs.count_documents({"status": "rendering"}):
        return
    if not db.super_agents.count_documents({}) and not db.clips.count_documents({}):
        return  # nothing worth backing up yet
    write_backup(reason="daily")
