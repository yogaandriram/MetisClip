"""004_llm_providers: the LLM settings moved from presets to providers (2026-11-09).

Before: llm = {preset: "9router" | "groq" | "custom", base_url, model}, one key `llm_api_key`.
After:  llm = {provider, base_url, models: {provider: model}}, one key per provider.

Every old preset was an OpenAI-compatible endpoint, so it becomes the "openai_compatible" provider
with the same base URL and model; the stored `llm_api_key` keeps working for it unchanged.
"""
from __future__ import annotations

from pymongo.database import Database

from backend.core.llm_providers import DEFAULT_COMPATIBLE_BASE_URL

_PRESET_URLS = {"9router": DEFAULT_COMPATIBLE_BASE_URL, "groq": "https://api.groq.com/openai/v1"}


def up(db: Database) -> None:
    doc = db.app_settings.find_one({"_id": "settings"}, {"llm": 1})
    llm = (doc or {}).get("llm")
    if not isinstance(llm, dict) or "provider" in llm:
        return
    base_url = str(llm.get("base_url") or _PRESET_URLS.get(llm.get("preset"), DEFAULT_COMPATIBLE_BASE_URL)).strip()
    new = {"provider": "openai_compatible", "base_url": base_url, "models": {}}
    if str(llm.get("model") or "").strip():
        new["models"]["openai_compatible"] = str(llm["model"]).strip()
    db.app_settings.update_one({"_id": "settings"}, {"$set": {"llm": new}})
