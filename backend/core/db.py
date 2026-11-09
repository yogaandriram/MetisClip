"""MongoDB access (CLAUDE.md §6, rule 18): client, auth bootstrap, migrations, helpers.

Packaged builds talk to the bundled mongod started by Electron main on
127.0.0.1:<METISCLIP_MONGO_PORT> with --auth. The app user's password is kept in
<DATA_ROOT>\\.metisclip\\db-credentials.json (ACL restricted to the current Windows
user) so the data folder stays self-contained when it is moved or reused after a
reinstall. Dev may override everything with MONGODB_URI (no auth).
"""
from __future__ import annotations

import getpass
import json
import logging
import os
import secrets as pysecrets
import time
import uuid
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from pymongo import MongoClient
from pymongo.database import Database
from pymongo.errors import (
    AutoReconnect,
    ConnectionFailure,
    OperationFailure,
    ServerSelectionTimeoutError,
)

from backend.core import procs
from backend.core.config import config
from backend.core.logging_setup import redactor
from backend.core.paths import get_paths

logger = logging.getLogger(__name__)

DB_NAME = "metisclip"
APP_USER = "metisclip"

_client: MongoClient | None = None
_db: Database | None = None


class DatabaseError(RuntimeError):
    """Fatal database problem (message in Bahasa Indonesia)."""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def new_id() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: Any) -> Any:
    if isinstance(dt, datetime):
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    if isinstance(dt, date):
        return dt.isoformat()
    return dt


def to_api(doc: dict | None) -> dict | None:
    """Mongo document -> JSON-friendly dict (`_id` -> `id`, dates -> ISO strings)."""
    if doc is None:
        return None

    def conv(v: Any) -> Any:
        if isinstance(v, dict):
            return {k: conv(x) for k, x in v.items()}
        if isinstance(v, list):
            return [conv(x) for x in v]
        return iso(v)

    out = conv(dict(doc))
    if "_id" in out:
        out["id"] = out.pop("_id")
    return out


def parse_dt(value: Any) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    s = str(value).strip().replace("Z", "+00:00")
    dt = datetime.fromisoformat(s)
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


# ---------------------------------------------------------------------------
# Credentials
# ---------------------------------------------------------------------------

def _creds_path() -> Path:
    return get_paths().private_dir / "db-credentials.json"


def _restrict_acl(path: Path) -> None:
    """Allow only the current Windows user (best effort)."""
    if os.name != "nt":
        return
    user = os.environ.get("USERNAME") or getpass.getuser()
    domain = os.environ.get("USERDOMAIN")
    principal = f"{domain}\\{user}" if domain else user
    try:
        procs.run(["icacls", str(path), "/inheritance:r", "/grant:r", f"{principal}:(F)"], timeout=20)
    except Exception as exc:
        logger.warning("Could not restrict ACL on %s: %s", path, exc)


def _load_creds() -> dict | None:
    p = _creds_path()
    if not p.exists():
        return None
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        if data.get("username") and data.get("password"):
            redactor.add_secret(data["password"])
            return data
    except Exception as exc:
        logger.error("Unreadable DB credentials file: %s", exc)
    return None


def _write_creds(username: str, password: str) -> None:
    p = _creds_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps({"username": username, "password": password, "created_at": iso(utcnow())}), encoding="utf-8")
    os.replace(tmp, p)
    _restrict_acl(p)
    redactor.add_secret(password)


def _client_for(uri: str | None = None, **kw) -> MongoClient:
    opts = dict(
        tz_aware=True,
        uuidRepresentation="standard",
        serverSelectionTimeoutMS=2000,
        connectTimeoutMS=2000,
        appname=f"metisclip-engine/{config.version}",
    )
    opts.update(kw)
    if uri:
        return MongoClient(uri, **opts)
    return MongoClient(host="127.0.0.1", port=config.mongo_port, directConnection=True, **opts)


def _wait_ping(client: MongoClient, timeout_s: float = 30.0) -> None:
    deadline = time.monotonic() + timeout_s
    while True:
        try:
            client.admin.command("ping")
            return
        except (ServerSelectionTimeoutError, ConnectionFailure) as exc:
            if time.monotonic() > deadline:
                raise DatabaseError("Database MongoDB tidak dapat dihubungi") from exc
            time.sleep(0.5)


# MongoDB 8's localhost exception only lets the first user be granted roles defined
# in the admin database, so the app user gets the *AnyDatabase variants. The local
# server holds nothing but the metisclip database. hostManager = graceful shutdown,
# clusterManager = setFeatureCompatibilityVersion after a mongod major upgrade.
APP_ROLES = [
    {"role": "readWriteAnyDatabase", "db": "admin"},
    {"role": "dbAdminAnyDatabase", "db": "admin"},
    {"role": "hostManager", "db": "admin"},
    {"role": "clusterManager", "db": "admin"},
]


def _create_app_user(password: str) -> None:
    """Uses MongoDB's localhost exception (no users exist yet)."""
    anon = _client_for()
    try:
        _wait_ping(anon)
        anon.admin.command("createUser", APP_USER, pwd=password, roles=APP_ROLES)
        logger.info("Created MongoDB app user")
    finally:
        anon.close()


def _is_auth_error(exc: OperationFailure) -> bool:
    return exc.code in (13, 18) or "auth" in str(exc).lower()


def _connect_bundled() -> MongoClient:
    creds = _load_creds()
    if creds:
        client = _client_for(username=creds["username"], password=creds["password"], authSource="admin")
        try:
            _wait_ping(client)
            client[DB_NAME].list_collection_names()
            return client
        except OperationFailure as exc:
            client.close()
            if not _is_auth_error(exc):
                raise
            # File written but createUser never ran (crash in between): try to finish it
            try:
                _create_app_user(creds["password"])
            except OperationFailure as exc2:
                raise DatabaseError(
                    "Kredensial database tidak cocok dengan folder data ini. "
                    "Pulihkan file .metisclip\\db-credentials.json atau pilih folder data lain."
                ) from exc2
            client = _client_for(username=creds["username"], password=creds["password"], authSource="admin")
            _wait_ping(client)
            return client

    # First run on this data folder: create the app user
    password = pysecrets.token_urlsafe(32)
    _write_creds(APP_USER, password)
    try:
        _create_app_user(password)
    except OperationFailure as exc:
        try:
            _creds_path().unlink()
        except OSError:
            pass
        if _is_auth_error(exc):
            raise DatabaseError(
                "Database di folder data ini sudah memiliki pengguna, tetapi file kredensial "
                "(.metisclip\\db-credentials.json) tidak ditemukan."
            ) from exc
        raise
    client = _client_for(username=APP_USER, password=password, authSource="admin")
    _wait_ping(client)
    return client


def connect() -> Database:
    global _client, _db
    if _db is not None:
        return _db
    if config.mongodb_uri:
        client = _client_for(config.mongodb_uri)
        _wait_ping(client)
    else:
        client = _connect_bundled()
    _client = client
    _db = client[DB_NAME]
    logger.info("Connected to MongoDB %s", server_version())
    return _db


def get_db() -> Database:
    if _db is None:
        return connect()
    return _db


def set_db(db: Database, client: MongoClient | None = None) -> None:
    """Used by tests."""
    global _db, _client
    _db = db
    _client = client


def ping() -> bool:
    if _client is None:
        return False
    try:
        _client.admin.command("ping")
        return True
    except Exception:
        return False


def server_version() -> str | None:
    if _client is None:
        return None
    try:
        return _client.server_info().get("version")
    except Exception:
        return None


def shutdown_server() -> None:
    """Graceful mongod stop (bundled mongod only)."""
    if _client is None or config.mongodb_uri:
        return
    try:
        _client.admin.command("shutdown", timeoutSecs=10)
    except (AutoReconnect, ConnectionFailure):
        pass  # expected: the server closes the connection
    except Exception as exc:
        logger.warning("MongoDB shutdown command failed: %s", exc)


def close() -> None:
    global _client, _db
    if _client is not None:
        try:
            _client.close()
        except Exception:
            pass
    _client = None
    _db = None


# ---------------------------------------------------------------------------
# Migrations (forward-only)
# ---------------------------------------------------------------------------

def _migrations():
    from backend.db.migrations import (
        m001_init,
        m002_remove_publishing,
        m003_brand_template_library,
        m004_llm_providers,
        m005_remove_keyword_search,
    )

    return [
        (1, "init", m001_init.up),
        (2, "remove_publishing", m002_remove_publishing.up),
        (3, "brand_template_library", m003_brand_template_library.up),
        (4, "llm_providers", m004_llm_providers.up),
        (5, "remove_keyword_search", m005_remove_keyword_search.up),
    ]


def schema_version(db: Database) -> int:
    doc = db.meta.find_one({"_id": "schema"})
    return int(doc.get("version", 0)) if doc else 0


def migrate(db: Database | None = None) -> int:
    db = db if db is not None else get_db()
    current = schema_version(db)
    pending = [m for m in _migrations() if m[0] > current]
    if not pending:
        return current
    if current > 0:
        from backend.services.backup import write_backup

        logger.info("Backing up before migrating from schema %s", current)
        write_backup(reason="pre-migration")
    for version, name, up in pending:
        logger.info("Applying migration %03d_%s", version, name)
        up(db)
        db.meta.update_one({"_id": "schema"}, {"$set": {"version": version, "migrated_at": utcnow()}}, upsert=True)
    return pending[-1][0]
