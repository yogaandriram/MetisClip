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
