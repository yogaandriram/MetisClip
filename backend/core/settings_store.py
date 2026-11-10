"""Non-secret runtime settings, stored in the single `app_settings` document."""
from __future__ import annotations

import copy
import os
from typing import Any

from backend.core.llm_providers import DEFAULT_COMPATIBLE_BASE_URL, DEFAULT_PROVIDER, PROVIDERS
from backend.core.paths import get_paths


def _default_workers() -> int:
    try:
        import psutil

        physical = psutil.cpu_count(logical=False) or os.cpu_count() or 2
    except Exception:
        physical = os.cpu_count() or 2
    return max(1, min(3, physical // 2))


def defaults() -> dict[str, Any]:
    return {
        "export_dir": str(get_paths().exports_dir),
        "cache_limit_gb": 10,
        # provider: one of llm_providers.PROVIDERS; models: the chosen model per provider;
        # base_url: only used by the OpenAI-compatible provider
        "llm": {
            "provider": DEFAULT_PROVIDER,
            "base_url": DEFAULT_COMPATIBLE_BASE_URL,
            "models": {pid: p.default_model for pid, p in PROVIDERS.items()},
        },
        # provider: "auto" (Groq while a key is set and Groq answers, else local), "local" or "groq";
        # model: the Groq model; local_model: "auto" (chosen from RAM and CPU) or a whisper_local model id
        "whisper": {"provider": "auto", "model": "whisper-large-v3-turbo", "local_model": "auto"},
        "processing": {"max_workers": _default_workers(), "encoder": "auto"},
        "render": {"concurrency": 1},
        "ytdlp": {"player_client": "default", "cookies_file": None},
        "db": {"wiredtiger_cache_gb": 0.25},
        "app": {"close_to_tray": False, "auto_update": True, "language": "id"},
    }


def deep_merge(base: dict, patch: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in (patch or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = deep_merge(out[k], v)
        else:
            out[k] = copy.deepcopy(v)
    return out


def _only_known(patch: dict, template: dict) -> dict:
    """Drop keys that are not part of the settings schema."""
    out: dict = {}
    for k, v in (patch or {}).items():
        if k not in template:
            continue
        if isinstance(template[k], dict) and isinstance(v, dict):
            out[k] = _only_known(v, template[k])
        else:
            out[k] = v
    return out


class SettingsError(ValueError):
    pass


def _validate(s: dict) -> None:
    llm = s["llm"]
    if llm.get("provider") not in PROVIDERS:
        raise SettingsError("Penyedia LLM tidak dikenal")
    models = llm.get("models") if isinstance(llm.get("models"), dict) else {}
    llm["models"] = {pid: str(models.get(pid) or "").strip()[:200] for pid in PROVIDERS}
    if not llm["models"][llm["provider"]]:
        raise SettingsError("Model LLM wajib diisi")
    for pid, p in PROVIDERS.items():
        llm["models"][pid] = llm["models"][pid] or p.default_model
    llm["base_url"] = str(llm.get("base_url") or "").strip()
    if llm["provider"] == "openai_compatible" and not llm["base_url"].startswith(("http://", "https://")):
        raise SettingsError("Base URL LLM harus diawali http:// atau https://")
    from backend.agents.tools.whisper_local import MODELS as LOCAL_MODELS

    whisper = s["whisper"]
    if whisper.get("provider") not in ("auto", "local", "groq"):
        raise SettingsError("Mesin transkripsi tidak dikenal")
    if whisper.get("local_model") not in ("auto", *LOCAL_MODELS):
        raise SettingsError("Model Whisper lokal tidak dikenal")
    whisper["model"] = str(whisper.get("model") or "").strip()[:100] or "whisper-large-v3-turbo"
    if s["processing"]["encoder"] not in ("auto", "libx264", "h264_nvenc", "h264_qsv", "h264_amf"):
        raise SettingsError("Encoder tidak dikenal")
    try:
        w = int(s["processing"]["max_workers"])
    except (TypeError, ValueError):
        raise SettingsError("Jumlah worker harus berupa angka")
    if not 1 <= w <= 8:
        raise SettingsError("Jumlah worker harus antara 1 dan 8")
    s["processing"]["max_workers"] = w
    try:
        c = int(s["render"]["concurrency"])
    except (TypeError, ValueError):
        raise SettingsError("Konkurensi render harus berupa angka")
    s["render"]["concurrency"] = max(1, min(4, c))
    try:
        s["cache_limit_gb"] = max(1, float(s["cache_limit_gb"]))
        s["db"]["wiredtiger_cache_gb"] = min(4.0, max(0.25, float(s["db"]["wiredtiger_cache_gb"])))
    except (TypeError, ValueError):
        raise SettingsError("Nilai angka tidak valid")
    if not str(s.get("export_dir") or "").strip():
        s["export_dir"] = str(get_paths().exports_dir)


def get_settings() -> dict[str, Any]:
    from backend.core.db import get_db

    doc = get_db().app_settings.find_one({"_id": "settings"}) or {}
    doc.pop("_id", None)
    doc.pop("updated_at", None)
    merged = deep_merge(defaults(), _only_known(doc, defaults()))
    if not str(merged.get("export_dir") or "").strip():
        merged["export_dir"] = str(get_paths().exports_dir)
    return merged


def update_settings(patch: dict) -> dict[str, Any]:
    from datetime import datetime, timezone

    from backend.core.db import get_db

    current = get_settings()
    clean = _only_known(patch or {}, defaults())
    if "export_dir" in clean and clean["export_dir"] is not None:
        clean["export_dir"] = str(clean["export_dir"]).strip()
    merged = deep_merge(current, clean)
    _validate(merged)
    stored = copy.deepcopy(merged)
    # The default export folder follows the data folder when it is moved: store it as ""
    if stored["export_dir"] == str(get_paths().exports_dir):
        stored["export_dir"] = ""
    get_db().app_settings.replace_one(
        {"_id": "settings"},
        {"_id": "settings", **stored, "updated_at": datetime.now(timezone.utc)},
        upsert=True,
    )
    return merged
