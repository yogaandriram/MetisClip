"""Non-secret runtime settings, stored in the single `app_settings` document."""
from __future__ import annotations

import copy
import os
from typing import Any

from backend.core.paths import get_paths

LLM_PRESETS = {
    "9router": {"base_url": "https://9routeryoga.my.id/v1", "model": "metisclip"},
    "groq": {"base_url": "https://api.groq.com/openai/v1", "model": "llama-3.3-70b-versatile"},
}


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
        "llm": {"preset": "9router", **LLM_PRESETS["9router"]},
        "whisper": {"provider": "groq", "model": "whisper-large-v3-turbo"},
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
    if s["llm"]["preset"] not in ("9router", "groq", "custom"):
        raise SettingsError("Preset LLM tidak dikenal")
    if not str(s["llm"].get("base_url") or "").startswith(("http://", "https://")):
        raise SettingsError("Base URL LLM harus diawali http:// atau https://")
    if not str(s["llm"].get("model") or "").strip():
        raise SettingsError("Model LLM wajib diisi")
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
    # Selecting a preset fills its endpoint unless the caller sent explicit values
    llm_patch = clean.get("llm") or {}
    preset = llm_patch.get("preset")
    if preset in LLM_PRESETS:
        llm_patch.setdefault("base_url", LLM_PRESETS[preset]["base_url"])
        llm_patch.setdefault("model", LLM_PRESETS[preset]["model"])
        clean["llm"] = llm_patch
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
