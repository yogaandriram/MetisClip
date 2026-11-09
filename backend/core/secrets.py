"""Secret storage: Windows Credential Manager via `keyring` (the engine is the only owner).

Secrets never go to MongoDB, logs or API responses. The API only reveals whether
a secret is set. The user enters every key in Pengaturan or the Setup Wizard; keys are
never read from environment variables or the repo .env, not even in dev.
"""
from __future__ import annotations

import logging
import os
import threading

from backend.core.config import config
from backend.core.llm_providers import LLM_SECRETS
from backend.core.logging_setup import redactor

logger = logging.getLogger(__name__)

# One key per LLM provider (llm_api_key = the OpenAI-compatible endpoint), plus Groq Whisper
PUBLIC_SECRETS = (*LLM_SECRETS, "groq_api_key")


class _MemoryBackend:
    """In-process store used by tests (METISCLIP_SECRETS_BACKEND=memory)."""

    def __init__(self) -> None:
        self._data: dict[tuple[str, str], str] = {}
        self._lock = threading.Lock()

    def get_password(self, service: str, name: str) -> str | None:
        with self._lock:
            return self._data.get((service, name))

    def set_password(self, service: str, name: str, value: str) -> None:
        with self._lock:
            self._data[(service, name)] = value

    def delete_password(self, service: str, name: str) -> None:
        with self._lock:
            self._data.pop((service, name), None)


_backend = None


def _kr():
    global _backend
    if _backend is None:
        if os.environ.get("METISCLIP_SECRETS_BACKEND") == "memory":
            _backend = _MemoryBackend()
        else:
            import keyring

            _backend = keyring
    return _backend


def get_secret(name: str) -> str | None:
    value = None
    try:
        value = _kr().get_password(config.keyring_service, name)
    except Exception as exc:
        logger.warning("Credential Manager read failed for %s: %s", name, exc)
    if value:
        redactor.add_secret(value)
    return value or None


def set_secret(name: str, value: str) -> None:
    value = (value or "").strip()
    if not value:
        raise ValueError("Nilai secret kosong")
    _kr().set_password(config.keyring_service, name, value)
    redactor.add_secret(value)


def delete_secret(name: str) -> None:
    try:
        _kr().delete_password(config.keyring_service, name)
    except Exception as exc:  # PasswordDeleteError when missing
        logger.debug("delete secret %s: %s", name, exc)


def secret_status() -> dict[str, bool]:
    return {name: bool(get_secret(name)) for name in PUBLIC_SECRETS}
