"""UI language for the engine's messages (backend/core/i18n.py)."""
from __future__ import annotations

import importlib
import pkgutil

import pytest

import backend
from backend.core import i18n


@pytest.fixture(autouse=True)
def _restore_language(monkeypatch):
    monkeypatch.delenv("METISCLIP_LANG", raising=False)
    i18n.reset_language()
    yield
    i18n.reset_language()


def test_catalog_renders_current_language():
    m = i18n.Catalog({"hello": {"id": "Halo {name}", "en": "Hello {name}"}, "x": {"id": "{{a}}", "en": "{{b}}"}})
    i18n.set_language("id")
    assert m("hello", name="Ana") == "Halo Ana"
    i18n.set_language("en")
    assert m("hello", name="Ana") == "Hello Ana"
    assert m("x") == "{b}"
    assert m.all("hello", name="Ana") == {"id": "Halo Ana", "en": "Hello Ana"}


def test_catalog_rejects_missing_or_mismatched_translations():
    with pytest.raises(ValueError, match="no text"):
        i18n.Catalog({"a": {"id": "Satu"}})
    with pytest.raises(ValueError, match="placeholders"):
        i18n.Catalog({"a": {"id": "{n} klip", "en": "{count} clips"}})
    with pytest.raises(ValueError, match="unknown languages"):
        i18n.Catalog({"a": {"id": "a", "en": "a", "ms": "a"}})


def test_language_from_env(monkeypatch):
    monkeypatch.setenv("METISCLIP_LANG", "en")
    assert i18n.language() == "en"
    with pytest.raises(ValueError):
        i18n.set_language("fr")


def test_every_backend_module_imports_with_valid_catalogs():
    # Catalog() validates on import, so importing every module checks every translation.
    skip = {"backend.run", "backend.mcp_server"}
    for mod in pkgutil.walk_packages(backend.__path__, "backend."):
        if mod.name in skip or ".tests" in mod.name or ".migrations" in mod.name:
            continue
        importlib.import_module(mod.name)
    for catalog in i18n.catalogs():
        assert catalog.entries, catalog.origin


def test_settings_switch_the_engine_language(db):
    from backend.core.settings_store import SettingsError, get_settings, update_settings

    update_settings({"app": {"language": "en"}})
    assert i18n.language() == "en"
    assert get_settings()["app"]["language"] == "en"
    i18n.reset_language()
    assert i18n.language() == "en"  # read back from the stored setting
    with pytest.raises(SettingsError):
        update_settings({"app": {"language": "fr"}})
    update_settings({"app": {"language": "id"}})
    assert i18n.language() == "id"


def test_other_settings_never_switch_the_engine_language(db, monkeypatch):
    """QA 2026-11-19: Electron started the engine in Indonesian (METISCLIP_LANG) while the stored
    language was still English, and saving the Whisper setting switched every engine message to English."""
    from backend.core.settings_store import update_settings

    update_settings({"app": {"language": "en"}})  # a stale stored language
    i18n.reset_language()
    monkeypatch.setenv("METISCLIP_LANG", "id")
    assert i18n.language() == "id"
    update_settings({"whisper": {"provider": "local"}})
    update_settings({"processing": {"encoder": "libx264"}})
    assert i18n.language() == "id"
    update_settings({"app": {"language": "en"}})  # the user switches: that one counts
    assert i18n.language() == "en"


def _english(db):
    from backend.core.settings_store import update_settings

    update_settings({"app": {"language": "en"}})


def test_api_errors_follow_the_language(db, secrets):
    from fastapi.testclient import TestClient

    from backend.core.config import config
    from backend.main import create_app

    with TestClient(create_app()) as c:
        c.headers.update({"Authorization": f"Bearer {config.token}"})
        assert c.get("/api/clips/nope").json()["detail"] == "Klip tidak ditemukan"
        assert c.put("/api/settings", json={"app": {"language": "en"}}).status_code == 200
        assert c.get("/api/clips/nope").json()["detail"] == "Clip not found"
        assert c.get("/api/jobs/nope").json()["detail"] == "Job not found"
        r = c.put("/api/settings", json={"processing": {"max_workers": 99}})
        assert (r.status_code, r.json()["detail"]) == (400, "The number of workers must be between 1 and 8")
        assert c.get("/api/clips/nope", headers={"Authorization": "Bearer wrong"}).json()["detail"] == "Invalid token"


def test_pipeline_and_settings_errors_follow_the_language(db, tmp_path):
    from backend.agents.context import PipelineError
    from backend.agents.nodes.discovery import check_local_video
    from backend.core.settings_store import SettingsError, update_settings

    _english(db)
    with pytest.raises(PipelineError, match="^Video file not found: "):
        check_local_video(str(tmp_path / "missing.mp4"))
    with pytest.raises(SettingsError, match="^Unknown LLM provider$"):
        update_settings({"llm": {"provider": "nope"}})
    i18n.set_language("id")
    with pytest.raises(PipelineError, match="^File video tidak ditemukan: "):
        check_local_video(str(tmp_path / "missing.mp4"))


def test_waits_and_durations_follow_the_language():
    from backend.core import llm, resources

    info = resources.WaitInfo(kind="clip", need_mb=1536, available_mb=1024, reserve_mb=2048, busy=0)
    assert info.message().startswith("Menunggu RAM: tersedia 1,0 GB, butuh 1,5 GB")
    assert llm._fmt_wait(3 * 3600 + 300) == "3 jam 5 menit"
    i18n.set_language("en")
    assert info.message().startswith("Waiting for RAM: 1.0 GB free, 1.5 GB needed")
    assert llm._fmt_wait(3 * 3600 + 300) == "3 hours 5 minutes"
    assert llm._fmt_wait(60) == "1 minute"
    assert llm.LLMQuotaExhausted("Daily quota used up.").message() == (
        "Daily quota used up. To continue now, choose another model or provider in Settings.")


def test_language_lookup_never_connects_to_the_database():
    from backend.core import db as dbm

    assert not dbm.connected()
    assert i18n.language() == "id"  # the default, at once, instead of a 30 s connection attempt


def test_a_new_campaign_template_is_named_in_the_ui_language(mongo, monkeypatch, secrets):
    import os
    import time

    from backend.core import db as dbm

    monkeypatch.setenv("METISCLIP_LANG", "en")
    name = f"metisclip_test_en_{os.getpid()}_{time.time_ns()}"
    database = mongo[name]
    try:
        dbm.set_db(database, mongo)
        dbm.migrate(database)
        assert database.brand_templates.count_documents({}) == 0  # a fresh install starts empty
        from backend.services import campaigns

        campaigns.create("Podcast")
        assert [t["name"] for t in database.brand_templates.find()] == ["Podcast template"]
    finally:
        mongo.drop_database(name)
        dbm.set_db(None, None)  # type: ignore[arg-type]
