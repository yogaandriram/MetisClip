"""UI language for the engine's own user-facing text: errors, job errors, notices and status lines.

The UI language is chosen in the app (frontend/lib/i18n). Electron passes it as METISCLIP_LANG when it
starts the engine and sends PUT /api/settings {"app": {"language": ...}} when the user switches;
`settings_store.update_settings` then calls `set_language`. Without Electron (dev) the stored setting
is used.

Messages live next to the code that raises them, one catalog per module:

    M = i18n.messages({
        "not_found": {"id": "Klip tidak ditemukan", "en": "Clip not found"},
        "too_long": {"id": "Durasi maksimal {max} detik", "en": "{max} seconds at most"},
    })
    raise HTTPException(404, M("not_found"))
    raise PipelineError(M("too_long", max=90))

Every entry must have every language and the same {placeholders} in each; this is checked when the
module is imported, so a missing translation fails the tests. Literal braces are written {{ and }}.

A message is rendered in the language that is current when it is created. Text already stored
(a job's errors) keeps the language it was written in.
"""
from __future__ import annotations

import os
import string
import threading
from typing import Any, Mapping

LANGS: tuple[str, ...] = ("id", "en")
DEFAULT_LANG = "id"

_lock = threading.Lock()
_lang: str | None = None
_catalogs: list["Catalog"] = []


def is_lang(value: Any) -> bool:
    return isinstance(value, str) and value in LANGS


def language() -> str:
    """The current UI language ("id" or "en")."""
    global _lang
    if _lang is not None:
        return _lang
    env = os.environ.get("METISCLIP_LANG", "").strip().lower()
    if is_lang(env):
        with _lock:
            _lang = env
        return env
    try:
        from backend.core import db as dbm
        from backend.core.settings_store import get_settings

        if not dbm.connected():  # never start a connection (up to 30 s) just to word a message
            return DEFAULT_LANG
        stored = get_settings().get("app", {}).get("language")
    except Exception:
        # database not reachable yet: default for now, ask again next time
        return DEFAULT_LANG
    with _lock:
        _lang = stored if is_lang(stored) else DEFAULT_LANG
    return _lang


def offline_language() -> str:
    """The UI language without asking the database: the cached one, else METISCLIP_LANG, else the
    default. For messages about the database itself and for startup errors, where a lookup could
    hang or fail again."""
    if _lang is not None:
        return _lang
    env = os.environ.get("METISCLIP_LANG", "").strip().lower()
    return env if is_lang(env) else DEFAULT_LANG


def set_language(lang: str) -> None:
    global _lang
    if not is_lang(lang):
        raise ValueError(f"unknown language: {lang!r}")
    with _lock:
        _lang = lang


def reset_language() -> None:
    """Forget the cached language (tests)."""
    global _lang
    with _lock:
        _lang = None


def _fields(text: str) -> set[str]:
    return {name for _, name, _, _ in string.Formatter().parse(text) if name is not None}


class Catalog:
    """Messages of one module, keyed by a short id. Call it to render one in the current language."""

    def __init__(self, entries: Mapping[str, Mapping[str, str]], *, origin: str = "") -> None:
        for key, texts in entries.items():
            missing = [lang for lang in LANGS if not isinstance(texts.get(lang), str) or not texts[lang]]
            if missing:
                raise ValueError(f"{origin}: message {key!r} has no text for {missing}")
            extra = set(texts) - set(LANGS)
            if extra:
                raise ValueError(f"{origin}: message {key!r} has unknown languages {sorted(extra)}")
            fields = {lang: _fields(texts[lang]) for lang in LANGS}
            if len({frozenset(f) for f in fields.values()}) != 1:
                raise ValueError(f"{origin}: message {key!r} uses different placeholders per language: {fields}")
        self.entries: dict[str, dict[str, str]] = {k: dict(v) for k, v in entries.items()}
        self.origin = origin

    def __call__(self, key: str, /, **values: Any) -> str:
        return self.text(key, language(), **values)

    def text(self, key: str, lang: str, /, **values: Any) -> str:
        texts = self.entries[key]
        template = texts.get(lang) or texts[DEFAULT_LANG]
        return template.format(**values)

    def all(self, key: str, /, **values: Any) -> dict[str, str]:
        """The message in every language ({"id": ..., "en": ...})."""
        return {lang: self.text(key, lang, **values) for lang in LANGS}


def messages(entries: Mapping[str, Mapping[str, str]]) -> Catalog:
    """Declare a module's messages (see the module docstring)."""
    import inspect

    frame = inspect.currentframe()
    caller = frame.f_back if frame else None
    origin = caller.f_globals.get("__name__", "") if caller else ""
    catalog = Catalog(entries, origin=origin)
    _catalogs.append(catalog)
    return catalog


def catalogs() -> list[Catalog]:
    """Every catalog declared so far (tests)."""
    return list(_catalogs)
