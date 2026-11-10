"""Brand templates: a shared library of named templates (collection `brand_templates`).

Every workspace points at one default template (`super_agents.default_brand_template_id`); new
clips copy that id into `clips.brand_template_id`, and the clip editor can switch it. A clip whose
template is gone falls back to its agent's default, then to the built-in defaults ({}).

Brand assets (logo, overlay, sample video) are copies stored in <DATA_ROOT>/library/_brand/<id>/ and
referenced as `asset://<relative path>` inside brand_settings.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from backend.core.db import get_db, new_id, utcnow
from backend.core.paths import get_paths
from backend.models.documents import BrandTemplateDoc

logger = logging.getLogger(__name__)

DEFAULT_NAME = "Template Default"
ASSETS_DIRNAME = "_brand"


def get(template_id: str | None) -> dict[str, Any] | None:
    if not template_id:
        return None
    return get_db().brand_templates.find_one({"_id": template_id})


def create(name: str, settings: dict[str, Any] | None = None, template_id: str | None = None) -> dict[str, Any]:
    now = utcnow()
    doc = BrandTemplateDoc(_id=template_id or new_id(), name=name, created_at=now, updated_at=now, **(settings or {})).to_mongo()
    get_db().brand_templates.insert_one(doc)
    return doc


def ensure_default() -> str:
    """Id of the oldest template, creating "Template Default" when the library is empty."""
    first = get_db().brand_templates.find_one({}, {"_id": 1}, sort=[("created_at", 1)])
    return first["_id"] if first else create(DEFAULT_NAME)["_id"]


def for_agent(agent: dict[str, Any] | None) -> dict[str, Any] | None:
    return get((agent or {}).get("default_brand_template_id"))


def for_clip(clip: dict[str, Any], agent: dict[str, Any] | None = None) -> dict[str, Any] | None:
    """The template a clip uses: its own choice, else its agent's default, else None (built-in)."""
    tpl = get(clip.get("brand_template_id"))
    if tpl:
        return tpl
    if agent is None and clip.get("agent_id"):
        agent = get_db().super_agents.find_one({"_id": clip["agent_id"]}, {"default_brand_template_id": 1})
    return for_agent(agent)


def asset_dir(template_id: str) -> Path:
    return get_paths().library_dir / ASSETS_DIRNAME / template_id


def asset_refs(value: Any) -> set[str]:
    """Relative paths of every asset://… string inside a settings value."""
    out: set[str] = set()
    if isinstance(value, dict):
        for v in value.values():
            out |= asset_refs(v)
    elif isinstance(value, list):
        for v in value:
            out |= asset_refs(v)
    elif isinstance(value, str) and value.startswith("asset://"):
        out.add(value[len("asset://"):])
    return out


def delete_unused_assets(deleted: dict[str, Any]) -> int:
    """After a template is deleted: remove the imported asset copies (its own folder, plus files it
    referenced in other template folders, e.g. after a duplicate) that no remaining template uses.
    Only files under library/_brand/ are ever touched."""
    paths = get_paths()
    brand_root = (paths.library_dir / ASSETS_DIRNAME).resolve()
    candidates: set[Path] = set()
    folder = asset_dir(deleted["_id"])
    if folder.is_dir():
        candidates |= {f for f in folder.iterdir() if f.is_file()}
    for rel in asset_refs(deleted.get("brand_settings")):
        f = paths.from_relative(rel)
        if f.is_file():
            candidates.add(f)
    used: set[str] = set()
    for other in get_db().brand_templates.find({"_id": {"$ne": deleted["_id"]}}, {"brand_settings": 1}):
        used |= asset_refs(other.get("brand_settings"))
    removed = 0
    for f in candidates:
        if brand_root not in f.resolve().parents or paths.to_relative(f) in used:
            continue
        try:
            f.unlink()
            removed += 1
        except OSError as exc:
            logger.warning("Could not delete brand asset %s: %s", f, exc)
        try:
            f.parent.rmdir()  # only when empty
        except OSError:
            pass
    try:
        folder.rmdir()
    except OSError:
        pass
    return removed
