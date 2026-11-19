"""What the engine is busy with: moving the data folder or restoring a backup waits until it is idle."""
from __future__ import annotations

from typing import Any

from backend.core import i18n
from backend.core.db import get_db

M = i18n.messages({
    "jobs": {
        "id": "{n} job clip",
        "en": "{n} clip job(s)",
    },
    "renders": {
        "id": "{n} ekspor video",
        "en": "{n} video export(s)",
    },
    "parses": {
        "id": "{n} pembacaan brief",
        "en": "{n} brief reading(s)",
    },
    "designs": {
        "id": "{n} desain template oleh AI",
        "en": "{n} AI template design(s)",
    },
    "downloads": {
        "id": "{n} unduhan model Whisper",
        "en": "{n} Whisper model download(s)",
    },
    "busy": {
        "id": "Masih ada yang berjalan: {items}. Tunggu sampai selesai atau batalkan dulu, lalu coba lagi.",
        "en": "Still running: {items}. Wait for it to finish or cancel it first, then try again.",
    },
})


def busy_items() -> list[dict[str, Any]]:
    """Work that would be cut off: [{kind, count}] for jobs (running or waiting), renders, brief
    readings, AI template designs and Whisper model downloads."""
    from backend.agents.tools import whisper_local

    db = get_db()
    counts = {
        "jobs": db.discovery_jobs.count_documents({"status": {"$in": ["running", "pending"]}}),
        "renders": db.render_jobs.count_documents({"status": {"$in": ["queued", "rendering"]}}),
        "parses": db.campaigns.count_documents({"parse.status": "running"}),
        "designs": db.brand_templates.count_documents({"design.status": "running"}),
        "downloads": whisper_local.active_downloads(),
    }
    return [{"kind": k, "count": n} for k, n in counts.items() if n]


def busy_message(items: list[dict[str, Any]]) -> str | None:
    """One sentence in the UI language naming what still runs, or None when nothing does."""
    if not items:
        return None
    return M("busy", items=", ".join(M(i["kind"], n=i["count"]) for i in items))


def status() -> dict[str, Any]:
    items = busy_items()
    return {"busy": bool(items), "items": items, "message": busy_message(items)}
