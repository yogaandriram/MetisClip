"""Non-secret runtime settings, stored in the single `app_settings` document."""
from __future__ import annotations

import copy
import os
from typing import Any

from backend.core.llm_providers import DEFAULT_COMPATIBLE_BASE_URL, DEFAULT_PROVIDER, PROVIDERS
from backend.core.paths import get_paths
from backend.core import i18n

M = i18n.messages({
    "unknown_provider": {
        "id": "Penyedia LLM tidak dikenal",
        "en": "Unknown LLM provider",
    },
    "model_required": {
        "id": "Model LLM wajib diisi",
        "en": "An LLM model is required",
    },
    "bad_base_url": {
        "id": "Base URL LLM harus diawali http:// atau https://",
        "en": "The LLM Base URL must start with http:// or https://",
    },
    "unknown_whisper": {
        "id": "Mesin transkripsi tidak dikenal",
        "en": "Unknown transcription engine",
    },
    "unknown_local_model": {
        "id": "Model Whisper lokal tidak dikenal",
        "en": "Unknown local Whisper model",
    },
    "unknown_encoder": {
        "id": "Encoder tidak dikenal",
        "en": "Unknown encoder",
    },
    "workers_number": {
        "id": "Jumlah worker harus berupa angka",
        "en": "The number of workers must be a number",
    },
    "workers_range": {
        "id": "Jumlah worker harus antara 1 dan 8",
        "en": "The number of workers must be between 1 and 8",
    },
    "concurrency_number": {
        "id": "Konkurensi render harus berupa angka",
        "en": "Render concurrency must be a number",
    },
    "auto_bool": {
        "id": "Hemat RAM otomatis harus aktif atau nonaktif",
        "en": "Automatic RAM saving must be on or off",
    },
    "reserve_number": {
        "id": "Cadangan RAM harus berupa angka",
        "en": "The RAM reserve must be a number",
    },
    "reserve_range": {
        "id": "Cadangan RAM harus antara 0 (otomatis) dan 16 GB",
        "en": "The RAM reserve must be between 0 (automatic) and 16 GB",
    },
    "unknown_language": {
        "id": "Bahasa tampilan tidak dikenal",
        "en": "Unknown display language",
    },
    "bad_number": {
        "id": "Nilai angka tidak valid",
        "en": "Invalid number",
    },
})


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
        # post_text: a campaign clip's export gets a .txt with its post text next to the video
        "export": {"post_text": True},
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
        # RAM guard (core/resources.py): auto = heavy steps wait for free RAM and run at below-normal
        # priority; reserve_gb = RAM kept free for Windows and other apps, 0 = automatic
        "resources": {"auto": True, "reserve_gb": 0},
        "ytdlp": {"player_client": "default", "cookies_file": None},
        "db": {"wiredtiger_cache_gb": 0.25},
        # the engine's copy of the UI language (core/i18n.py); closing to the tray is the shell's own
        # setting (preferences.json, desktop/src/main/tray.ts)
        "app": {"language": "id"},
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
        raise SettingsError(M("unknown_provider"))
    models = llm.get("models") if isinstance(llm.get("models"), dict) else {}
    llm["models"] = {pid: str(models.get(pid) or "").strip()[:200] for pid in PROVIDERS}
    if not llm["models"][llm["provider"]]:
        raise SettingsError(M("model_required"))
    for pid, p in PROVIDERS.items():
        llm["models"][pid] = llm["models"][pid] or p.default_model
    llm["base_url"] = str(llm.get("base_url") or "").strip()
    if llm["provider"] == "openai_compatible" and not llm["base_url"].startswith(("http://", "https://")):
        raise SettingsError(M("bad_base_url"))
    from backend.agents.tools.whisper_local import MODELS as LOCAL_MODELS

    whisper = s["whisper"]
    if whisper.get("provider") not in ("auto", "local", "groq"):
        raise SettingsError(M("unknown_whisper"))
    if whisper.get("local_model") not in ("auto", *LOCAL_MODELS):
        raise SettingsError(M("unknown_local_model"))
    whisper["model"] = str(whisper.get("model") or "").strip()[:100] or "whisper-large-v3-turbo"
    if s["processing"]["encoder"] not in ("auto", "libx264", "h264_nvenc", "h264_qsv", "h264_amf"):
        raise SettingsError(M("unknown_encoder"))
    try:
        w = int(s["processing"]["max_workers"])
    except (TypeError, ValueError):
        raise SettingsError(M("workers_number"))
    if not 1 <= w <= 8:
        raise SettingsError(M("workers_range"))
    s["processing"]["max_workers"] = w
    try:
        c = int(s["render"]["concurrency"])
    except (TypeError, ValueError):
        raise SettingsError(M("concurrency_number"))
    s["render"]["concurrency"] = max(1, min(4, c))
    res = s["resources"]
    if not isinstance(res.get("auto"), bool):
        raise SettingsError(M("auto_bool"))
    try:
        reserve = float(res.get("reserve_gb") or 0)
    except (TypeError, ValueError):
        raise SettingsError(M("reserve_number"))
    if not 0 <= reserve <= 16:
        raise SettingsError(M("reserve_range"))
    res["reserve_gb"] = round(reserve, 2)
    if not isinstance(s["export"].get("post_text"), bool):
        raise SettingsError(M("auto_bool"))
    if not i18n.is_lang(s["app"].get("language")):
        raise SettingsError(M("unknown_language"))
    try:
        s["cache_limit_gb"] = max(1, float(s["cache_limit_gb"]))
        s["db"]["wiredtiger_cache_gb"] = min(4.0, max(0.25, float(s["db"]["wiredtiger_cache_gb"])))
    except (TypeError, ValueError):
        raise SettingsError(M("bad_number"))
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
    # Only a language change switches the engine. The stored language can be stale (the UI language
    # lives in preferences.json, and Electron starts the engine with METISCLIP_LANG), so saving any
    # other setting must not switch the engine's messages back to it.
    if "language" in (clean.get("app") or {}):
        i18n.set_language(merged["app"]["language"])
    return merged
