"""Test fixtures: a throwaway mongod (the pinned bundled binary) on a random port."""
from __future__ import annotations

import os
import shutil
import socket
import subprocess
import tempfile
import time
from pathlib import Path

import pytest

os.environ.setdefault("METISCLIP_ENV", "dev")
os.environ["METISCLIP_SECRETS_BACKEND"] = "memory"
os.environ.setdefault("METISCLIP_TOKEN", "test-token")

REPO = Path(__file__).resolve().parents[2]
MONGOD = REPO / "desktop" / "resources" / "bin" / "mongod.exe"


def _free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


@pytest.fixture(scope="session")
def tmp_root():
    d = Path(tempfile.mkdtemp(prefix="metisclip test ü "))  # spaces + non-ASCII on purpose
    yield d
    shutil.rmtree(d, ignore_errors=True)


@pytest.fixture(scope="session", autouse=True)
def paths(tmp_root):
    from backend.core.paths import Paths, set_paths

    p = Paths(
        data_root=tmp_root / "data",
        appdata_dir=tmp_root / "appdata",
        bin_dir=REPO / "desktop" / "resources" / "bin",
        render_dir=REPO / "render-engine",
        tools_override=tmp_root / "tools",
    )
    p.ensure()
    set_paths(p)
    return p


@pytest.fixture(scope="session")
def mongo(tmp_root):
    if not MONGOD.exists():
        pytest.skip("mongod.exe not found; run scripts/fetch-binaries.ps1")
    from pymongo import MongoClient

    dbpath = tmp_root / "mongo"
    dbpath.mkdir()
    port = _free_port()
    proc = subprocess.Popen(
        [str(MONGOD), "--dbpath", str(dbpath), "--bind_ip", "127.0.0.1", "--port", str(port),
         "--wiredTigerCacheSizeGB", "0.25", "--logpath", str(tmp_root / "mongod.log"),
         "--setParameter", "diagnosticDataCollectionEnabled=false"],
        creationflags=0x08000000 if os.name == "nt" else 0,
    )
    client = MongoClient(host="127.0.0.1", port=port, directConnection=True, tz_aware=True,
                         uuidRepresentation="standard", serverSelectionTimeoutMS=1000)
    for _ in range(60):
        try:
            client.admin.command("ping")
            break
        except Exception:
            time.sleep(0.5)
    yield client
    try:
        client.admin.command("shutdown")
    except Exception:
        pass
    client.close()
    try:
        proc.wait(20)
    except subprocess.TimeoutExpired:
        proc.kill()


@pytest.fixture()
def db(mongo):
    """Fresh, migrated database per test."""
    from backend.core import db as dbm

    name = f"metisclip_test_{os.getpid()}_{time.time_ns()}"
    database = mongo[name]
    dbm.set_db(database, mongo)
    dbm.migrate(database)
    yield database
    mongo.drop_database(name)
    dbm.set_db(None, None)  # type: ignore[arg-type]


@pytest.fixture(autouse=True)
def _no_whisper_model_downloads(monkeypatch):
    """Tests never download real Whisper models (190-574 MB); test_whisper fakes the HTTP side."""
    from backend.agents.tools import whisper_local

    def blocked(model, cancel, on_progress):
        raise whisper_local.LocalWhisperError("Whisper model downloads are disabled in tests")

    monkeypatch.setattr(whisper_local, "_download", blocked)


@pytest.fixture()
def secrets():
    from backend.core import secrets as sec

    sec._backend = None  # fresh memory backend
    yield sec
    sec._backend = None
