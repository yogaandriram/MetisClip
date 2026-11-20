"""EJSON database backups (CLAUDE.md §6.4): <DATA_ROOT>\\backups\\metisclip-YYYYMMDD-HHMM.json.gz, keep 5.

A restore puts every collection back as it was in a backup. It first writes a backup of the current
state ("pre-restore"), so a restore can itself be undone.
"""
from __future__ import annotations

import gzip
import logging
import re
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from bson import json_util
from bson.json_util import CANONICAL_JSON_OPTIONS

from backend.core import i18n
from backend.core.db import get_db, iso, latest_schema_version, migrate, schema_version
from backend.core.paths import get_paths
from backend.version import __version__

M = i18n.messages({
    "not_found": {
        "id": "File backup tidak ditemukan: {name}",
        "en": "Backup file not found: {name}",
    },
    "unreadable": {
        "id": "File backup tidak bisa dibaca ({error}). File mungkin rusak atau terpotong.",
        "en": "The backup file can't be read ({error}). It may be damaged or incomplete.",
    },
    "not_metisclip": {
        "id": "File ini bukan backup database MetisClip.",
        "en": "This file is not a MetisClip database backup.",
    },
    "newer": {
        "id": "Backup ini dibuat oleh MetisClip yang lebih baru (database versi {backup}, aplikasi ini versi {current}). "
              "Perbarui MetisClip dulu untuk memulihkannya.",
        "en": "This backup was made by a newer MetisClip (database version {backup}, this app has version {current}). "
              "Update MetisClip first to restore it.",
    },
})

logger = logging.getLogger(__name__)

KEEP = 5
NAME = re.compile(r"^metisclip-[0-9-]+\.json\.gz$")
# A backup and a restore never run at the same time (re-entrant: a restore writes its own backup)
_lock = threading.RLock()


class BackupError(Exception):
    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.status = status


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


def write_backup(reason: str = "manual", keep: Path | None = None) -> dict[str, Any]:
    """Writes a backup and drops the oldest beyond KEEP (never `keep`, the backup being restored)."""
    with _lock:
        db = get_db()
        d = get_paths().backups_dir
        d.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M")
        path = d / f"metisclip-{stamp}.json.gz"
        if path.exists():
            path = d / f"metisclip-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json.gz"
        tmp = path.with_suffix(".tmp")
        names = sorted(n for n in db.list_collection_names() if not n.startswith("system."))
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
        olds = sorted(d.glob("metisclip-*.json.gz"), key=lambda p: p.stat().st_mtime, reverse=True)
        for old in olds[KEEP:]:
            if keep is not None and old.resolve() == keep.resolve():
                continue  # the backup being restored stays, even beyond KEEP
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
    if not db.campaigns.count_documents({}) and not db.clips.count_documents({}):
        return  # nothing worth backing up yet
    write_backup(reason="daily")


# ---------------------------------------------------------------------------
# Restore
# ---------------------------------------------------------------------------

def backup_path(name: str) -> Path:
    """A backup of this data folder by its file name (never a path from elsewhere)."""
    if not NAME.match(name or ""):
        raise BackupError(M("not_found", name=name), 404)
    path = get_paths().backups_dir / name
    if not path.is_file():
        raise BackupError(M("not_found", name=name), 404)
    return path


def read_backup(path: Path) -> tuple[dict[str, Any], dict[str, list[dict[str, Any]]]]:
    """(meta, {collection: [documents]}) of a backup file, with BSON types (dates, ids) restored."""
    try:
        with gzip.open(path, "rt", encoding="utf-8") as f:
            data = json_util.loads(f.read())
    except Exception as exc:
        raise BackupError(M("unreadable", error=exc)) from exc
    meta = data.get("meta") if isinstance(data, dict) else None
    colls = data.get("collections") if isinstance(data, dict) else None
    if not isinstance(meta, dict) or meta.get("app") != "metisclip" or not isinstance(colls, dict):
        raise BackupError(M("not_metisclip"))
    if not all(isinstance(k, str) and isinstance(v, list) for k, v in colls.items()):
        raise BackupError(M("not_metisclip"))
    return meta, colls


def restore_backup(name: str) -> dict[str, Any]:
    """
    Puts the database back as it was in the backup `name` (CLAUDE.md §6.4): writes a backup of the
    current state, empties every collection and inserts the backup's documents (validators and indexes
    stay), then runs the migrations a backup from an older version needs. Work that was running or
    waiting in the backup becomes interrupted. Media files are not touched.
    """
    from backend.core.queue import settle_restored
    from backend.services import activity

    with _lock:
        path = backup_path(name)
        meta, colls = read_backup(path)
        db = get_db()
        latest = latest_schema_version()
        version = int(meta.get("schema_version") or 0)
        if version > latest:
            raise BackupError(M("newer", backup=version, current=latest), 409)
        busy = activity.busy_message(activity.busy_items())
        if busy:
            raise BackupError(busy, 409)

        safety = write_backup(reason="pre-restore", keep=path)
        current = {n for n in db.list_collection_names() if not n.startswith("system.")}
        documents = 0
        for coll in sorted(current | set(colls)):
            docs = colls.get(coll) or []
            db[coll].delete_many({})
            for i in range(0, len(docs), 500):
                # Validators of this version may be stricter than the backup's (migrations follow below)
                db[coll].insert_many(docs[i:i + 500], ordered=True, bypass_document_validation=True)
            documents += len(docs)
        if "meta" not in colls:
            db.meta.update_one({"_id": "schema"}, {"$set": {"version": version}}, upsert=True)
        migrated_to = migrate(db, backup=False)
        settle_restored()
        from backend.core.settings_store import write_mongod_options

        write_mongod_options()  # mongod reads the restored cache size at its next start
        logger.info("Restored %s: %d collection(s), %d document(s), schema %s -> %s (safety backup %s)",
                    path.name, len(colls), documents, version, migrated_to, safety["name"])
        return {
            "restored": {
                "name": path.name,
                "created_at": meta.get("created_at"),
                "collections": len(colls),
                "documents": documents,
                "schema_version": version,
            },
            "safety_backup": safety,
        }
