"""Non-secret settings and write-only secrets."""
from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Body
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from backend.api.dto import http_error
from backend.core import secrets as sec
from backend.core.llm_providers import PROVIDERS, provider_for_secret
from backend.core.settings_store import SettingsError, get_settings, update_settings

router = APIRouter(tags=["settings"])


@router.get("/api/settings")
def read_settings():
    return {"settings": get_settings()}


@router.put("/api/settings")
def write_settings(patch: dict[str, Any] = Body(default_factory=dict)):
    try:
        return {"settings": update_settings(patch)}
    except SettingsError as exc:
        raise http_error(400, str(exc))


def _check_name(name: str) -> None:
    if name not in sec.PUBLIC_SECRETS:
        raise http_error(404, "Nama secret tidak dikenal")


class SecretValue(BaseModel):
    value: str


class SecretTest(BaseModel):
    value: Optional[str] = None


@router.get("/api/secrets")
def secret_status():
    return {"secrets": sec.secret_status()}


@router.put("/api/secrets/{name}")
def put_secret(name: str, body: SecretValue):
    _check_name(name)
    if not body.value.strip():
        raise http_error(400, "Nilai tidak boleh kosong")
    try:
        sec.set_secret(name, body.value)
    except Exception as exc:
        raise http_error(500, f"Gagal menyimpan ke Windows Credential Manager: {exc}")
    return {"ok": True}


@router.delete("/api/secrets/{name}")
def delete_secret(name: str):
    _check_name(name)
    sec.delete_secret(name)
    return {"ok": True}


def _test(name: str, value: str | None) -> dict:
    key = (value or "").strip() or sec.get_secret(name)
    if not key:
        return {"ok": False, "message": "Belum diisi"}
    provider = provider_for_secret(name)
    if provider:
        from backend.core.llm import test_connection

        ok, msg = test_connection(provider.id, key)
    elif name == "groq_api_key":
        from backend.agents.tools.whisper import test_key

        ok, msg = test_key(key)
    else:
        from backend.agents.tools.youtube_api import test_key

        ok, msg = test_key(key)
    return {"ok": ok, "message": msg}


@router.post("/api/secrets/{name}/test")
async def test_secret(name: str, body: SecretTest = Body(default_factory=SecretTest)):
    _check_name(name)
    return await run_in_threadpool(_test, name, body.value)


class ModelListRequest(BaseModel):
    provider: str
    # Unsaved values from the form; the stored key / settings are used when omitted
    base_url: Optional[str] = None
    value: Optional[str] = None


def _list_models(body: ModelListRequest) -> dict:
    from backend.core import llm

    if body.provider not in PROVIDERS:
        raise http_error(400, "Penyedia LLM tidak dikenal")
    try:
        return {"models": llm.list_models(body.provider, key=body.value, base_url=body.base_url or None)}
    except llm.LLMError as exc:
        raise http_error(400, str(exc))


@router.post("/api/llm/models")
async def list_llm_models(body: ModelListRequest):
    """Model ids the provider offers for this key, for the model picker."""
    return await run_in_threadpool(_list_models, body)
