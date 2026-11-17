"""Brand templates (collection `brand_templates`): every template belongs to one campaign.

Owner request, 2026-11-16: a fresh install starts empty; each new campaign gets its own template at
once, designed by the AI (`create_for_campaign`, agents/tools/template_ai.py), and that template is the
campaign's default (`campaigns.brand_template_id`). A campaign may hold several templates and make any of
them its default; it always keeps at least one. New clips copy the campaign's default into
`clips.brand_template_id`, and the clip editor can switch to another template of the same campaign. A
clip whose template is gone falls back to its campaign's default.

`design` records how the template was made: {status: running | done | failed | basic | skipped, auto,
edited, renamed, run, reasons, notes, message, provider, model, at}. `auto` marks the template made with
the campaign: it is designed again when the brief changes, until the user edits it (`edited`). An AI
result never overwrites a template the user changed while the AI worked.

Brand assets (logo, overlay, sample video) are copies stored in <DATA_ROOT>/library/_brand/<id>/ and
referenced as `asset://<relative path>` inside brand_settings.
"""
from __future__ import annotations

import logging
import threading
import uuid
from pathlib import Path
from typing import Any

from backend.core import events
from backend.core.db import get_db, new_id, utcnow
from backend.core.paths import get_paths
from backend.models.documents import BrandTemplateDoc
from backend.core import i18n

M = i18n.messages({
    "default_name": {
        "id": "Template Default",
        "en": "Default template",
    },
    "interrupted": {
        "id": "Desain AI terhenti karena aplikasi ditutup. Coba lagi.",
        "en": "The AI design stopped because the app was closed. Try again.",
    },
    "failed": {
        "id": "Desain AI gagal: {error}",
        "en": "The AI design failed: {error}",
    },
    "no_llm": {
        "id": "API key LLM belum diisi di Pengaturan, jadi template ini memakai gaya dasar.",
        "en": "No LLM API key is set in Settings, so this template uses the basic look.",
    },
    "edited": {
        "id": "Template diubah saat AI bekerja, jadi hasil AI tidak dipakai.",
        "en": "The template was changed while the AI worked, so the AI result was not used.",
    },
})

logger = logging.getLogger(__name__)

ASSETS_DIRNAME = "_brand"
SECTIONS = ("brand_settings", "caption_settings", "layout_settings", "ai_settings")
AI_SECTIONS = ("caption_settings", "layout_settings", "ai_settings")  # what the AI designs


def default_name() -> str:
    """Name of the first template of a database migrated from the web build (migration 003), in the UI
    language at that moment. Uses offline_language() because migrations run before the settings
    document exists."""
    return M.text("default_name", i18n.offline_language())


def get(template_id: str | None) -> dict[str, Any] | None:
    if not template_id:
        return None
    return get_db().brand_templates.find_one({"_id": template_id})


def of_campaign(campaign_id: str) -> list[dict[str, Any]]:
    return list(get_db().brand_templates.find({"campaign_id": campaign_id}).sort("created_at", 1))


def create(name: str, settings: dict[str, Any] | None = None, *, campaign_id: str | None,
           template_id: str | None = None, design: dict[str, Any] | None = None) -> dict[str, Any]:
    now = utcnow()
    extra: dict[str, Any] = {"design": design} if design else {}
    doc = BrandTemplateDoc(_id=template_id or new_id(), name=name, campaign_id=campaign_id, created_at=now,
                           updated_at=now, **extra, **(settings or {})).to_mongo()
    get_db().brand_templates.insert_one(doc)
    events.publish({"type": "brand_template.updated", "id": doc["_id"], "campaign_id": campaign_id})
    return doc


def set_default(campaign_id: str, template_id: str) -> None:
    get_db().campaigns.update_one({"_id": campaign_id}, {"$set": {"brand_template_id": template_id, "updated_at": utcnow()}})
    events.publish({"type": "campaign.updated", "id": campaign_id})


def _cid(campaign: dict[str, Any]) -> str | None:
    return campaign.get("_id") or campaign.get("id")


def for_campaign(campaign: dict[str, Any] | None) -> dict[str, Any] | None:
    """A campaign's default template: its choice, else its oldest template (None: it has none yet)."""
    if not campaign or not _cid(campaign):
        return None
    tpl = get(campaign.get("brand_template_id"))
    if tpl and tpl.get("campaign_id") == _cid(campaign):
        return tpl
    return get_db().brand_templates.find_one({"campaign_id": _cid(campaign)}, sort=[("created_at", 1)])


def ensure_for_campaign(campaign_id: str) -> str | None:
    """Id of the campaign's default template, repairing it when needed: its oldest template becomes the
    default, or a basic template is made (no AI call: this runs inside a job). None: no such campaign."""
    campaign = get_db().campaigns.find_one({"_id": campaign_id})
    if not campaign:
        return None
    tpl = for_campaign(campaign)
    if tpl is None:
        tpl = create_for_campaign(campaign, ai=False)
    if campaign.get("brand_template_id") != tpl["_id"]:
        set_default(campaign_id, tpl["_id"])
    return tpl["_id"]


def for_clip(clip: dict[str, Any]) -> dict[str, Any] | None:
    """The template a clip uses: its own choice, else its campaign's default (None only when the
    campaign has no template: the built-in settings)."""
    tpl = get(clip.get("brand_template_id"))
    if tpl:
        return tpl
    cid = clip.get("campaign_id")
    campaign = get_db().campaigns.find_one({"_id": cid}, {"brand_template_id": 1}) if cid else None
    return for_campaign(campaign)


# ---------------------------------------------------------------- AI design

_designing: set[str] = set()
_designing_lock = threading.Lock()


def create_for_campaign(campaign: dict[str, Any], *, ai: bool = True, auto: bool = False,
                        make_default: bool = False, name: str | None = None) -> dict[str, Any]:
    """A new template in the campaign, usable at once: the basic look (with the brief's hard visual
    requirements), then designed by the AI in the background when an LLM is set up (`ai`). `auto`: the
    template made with the campaign, designed again when its brief changes."""
    from backend.agents.tools import template_ai
    from backend.core import llm

    settings, notes = template_ai.build({}, campaign)
    use_ai = ai and llm.is_configured()
    design: dict[str, Any] = {"status": "basic", "auto": auto, "edited": False, "renamed": bool(name),
                              "notes": notes, "reasons": [], "message": "", "at": utcnow()}
    if ai and not use_ai:
        design["message"] = M("no_llm")
    doc = create(name or template_ai.default_name(campaign), settings, campaign_id=campaign["_id"], design=design)
    if make_default:
        set_default(campaign["_id"], doc["_id"])
    if use_ai:
        start_design(doc["_id"], user_asked=False)
        doc = get(doc["_id"]) or doc
    return doc


def _publish(template_id: str, status: str | None) -> None:
    tpl = get_db().brand_templates.find_one({"_id": template_id}, {"campaign_id": 1}) or {}
    events.publish({"type": "brand_template.updated", "id": template_id, "campaign_id": tpl.get("campaign_id"),
                    "design": status})


def _set_design(template_id: str, fields: dict[str, Any], filt: dict[str, Any] | None = None,
                **extra: Any) -> bool:
    """$set of design.<key> fields (and any top-level `extra`), only when `filt` still matches."""
    sets = {f"design.{k}": v for k, v in fields.items()}
    res = get_db().brand_templates.update_one({"_id": template_id, **(filt or {})}, {"$set": {**sets, **extra}})
    if res.matched_count:
        _publish(template_id, fields.get("status"))
    return bool(res.matched_count)


def start_design(template_id: str, *, user_asked: bool = True) -> bool:
    """Design the template with the AI in a background thread. `user_asked`: the user pressed "Desain
    dengan AI", so their earlier edits may be replaced. False when a design is already running."""
    with _designing_lock:
        if template_id in _designing:
            return False
        _designing.add(template_id)
    tpl = get(template_id)
    if not tpl:
        with _designing_lock:
            _designing.discard(template_id)
        return False
    run = uuid.uuid4().hex
    fields: dict[str, Any] = {"status": "running", "run": run, "message": "", "at": utcnow()}
    if user_asked:
        fields["edited"] = False
    if not isinstance(tpl.get("design"), dict):  # a template from before AI designs
        get_db().brand_templates.update_one({"_id": template_id}, {"$set": {"design": {}}})
    _set_design(template_id, fields)
    _spawn(_design, template_id, run)
    return True


def _spawn(target: Any, template_id: str, run: str) -> None:
    """Run a design in the background (tests replace it to run in place)."""
    threading.Thread(target=target, args=(template_id, run), name=f"template-{template_id[:8]}", daemon=True).start()


# Layout values the user typed, uploaded or switched on, kept through an AI design like through a gallery
# preset (applyLayoutPreset in layout.ts): section -> keys (None: the whole section). The automatic
# layout by content is not one of them: the AI designs it.
USER_LAYOUT: dict[str, tuple[str, ...] | None] = {
    "speaker": None,
    "companion": ("videoUrl", "duration"),
    "card": ("name", "handle", "avatarUrl"),
    "background": ("imageUrl",),
    "header": ("source", "text"),
    "credit": ("text",),
}


def keep_user_layout(old: dict[str, Any] | None, new: dict[str, Any]) -> dict[str, Any]:
    """The AI's layout with the user's own values from the template's current one (USER_LAYOUT)."""
    out = {k: (dict(v) if isinstance(v, dict) else v) for k, v in new.items()}
    for section, keys in USER_LAYOUT.items():
        part = (old or {}).get(section)
        if not isinstance(part, dict):
            continue
        vals = dict(part) if keys is None else {k: part[k] for k in keys if k in part}
        if vals:
            out[section] = {**(out.get(section) or {}), **vals}
    return out


def _design(template_id: str, run: str) -> None:
    from backend.agents.tools import template_ai
    from backend.core import llm

    try:
        tpl = get(template_id)
        campaign = get_db().campaigns.find_one({"_id": (tpl or {}).get("campaign_id")}) if tpl else None
        if not tpl or not campaign:
            _fail(template_id, run, M("failed", error="-"))
            return
        res = template_ai.design(campaign)
        try:
            t = llm.target()
            where = {"provider": t.provider.label, "model": t.model}
        except llm.LLMError:
            where = {}
        design = (tpl.get("design") or {})
        sets: dict[str, Any] = {k: res["settings"][k] for k in AI_SECTIONS}
        sets["layout_settings"] = keep_user_layout(tpl.get("layout_settings"), sets["layout_settings"])
        sets["updated_at"] = utcnow()
        if not design.get("renamed"):
            sets["name"] = res["name"]
        done = {"status": "done", "reasons": res["reasons"], "notes": res["notes"], "message": "", "at": utcnow(), **where}
        if not _set_design(template_id, done, {"design.run": run, "design.edited": {"$ne": True}}, **sets):
            _set_design(template_id, {"status": "skipped", "message": M("edited"), "at": utcnow()}, {"design.run": run})
    except llm.LLMError as exc:
        _fail(template_id, run, str(exc))
    except Exception as exc:  # never leaves the template stuck in "running"
        logger.exception("Template design failed for %s", template_id)
        _fail(template_id, run, M("failed", error=exc))
    finally:
        with _designing_lock:
            _designing.discard(template_id)


def _fail(template_id: str, run: str, message: str) -> None:
    _set_design(template_id, {"status": "failed", "message": message, "at": utcnow()}, {"design.run": run})


def is_designing(template_id: str) -> bool:
    with _designing_lock:
        return template_id in _designing


def mark_edited(template_id: str, *, renamed: bool = False) -> None:
    """The user changed the template (or only its name): no automatic AI design replaces it from now on
    (a rename only keeps the name)."""
    key = "design.renamed" if renamed else "design.edited"
    get_db().brand_templates.update_one({"_id": template_id, "design": {"$type": "object"}}, {"$set": {key: True}})


def on_brief_saved(campaign_id: str) -> bool:
    """A campaign's brief changed: its template made with the campaign is designed again, unless the
    user has edited it since. True when a design started."""
    from backend.core import llm

    tpl = for_campaign(get_db().campaigns.find_one({"_id": campaign_id}))
    design = (tpl or {}).get("design") or {}
    if not tpl or not design.get("auto") or design.get("edited") or not llm.is_configured():
        return False
    return start_design(tpl["_id"], user_asked=False)


def recover() -> None:
    """After a restart: a design that was running is gone."""
    get_db().brand_templates.update_many(
        {"design.status": "running"},
        {"$set": {"design.status": "failed", "design.message": M("interrupted")}},
    )


def delete(template_id: str) -> dict[str, Any] | None:
    """Delete one template: its clips fall back to the campaign's default; when it was the default, the
    campaign's oldest remaining template takes over. The caller checks that one is left."""
    db = get_db()
    doc = get(template_id)
    if not doc:
        return None
    db.brand_templates.delete_one({"_id": template_id})
    db.clips.update_many({"brand_template_id": template_id}, {"$unset": {"brand_template_id": ""}})
    cid = doc.get("campaign_id")
    if cid and db.campaigns.find_one({"_id": cid, "brand_template_id": template_id}, {"_id": 1}):
        nxt = db.brand_templates.find_one({"campaign_id": cid}, {"_id": 1}, sort=[("created_at", 1)])
        db.campaigns.update_one({"_id": cid}, {"$set": {"brand_template_id": nxt["_id"] if nxt else None}})
        events.publish({"type": "campaign.updated", "id": cid})
    delete_unused_assets(doc)
    events.publish({"type": "brand_template.deleted", "id": template_id, "campaign_id": cid})
    return doc


def delete_for_campaign(campaign_id: str) -> int:
    """Every template of a deleted campaign, with the asset copies no other template uses."""
    docs = of_campaign(campaign_id)
    get_db().brand_templates.delete_many({"campaign_id": campaign_id})
    for doc in docs:
        delete_unused_assets(doc)
        events.publish({"type": "brand_template.deleted", "id": doc["_id"], "campaign_id": campaign_id})
    return len(docs)


def asset_dir(template_id: str) -> Path:
    return get_paths().library_dir / ASSETS_DIRNAME / template_id


# Settings sections that may reference imported assets (logo, sample video; background image)
ASSET_SECTIONS = ("brand_settings", "layout_settings")


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
    for rel in asset_refs([deleted.get(k) for k in ASSET_SECTIONS]):
        f = paths.from_relative(rel)
        if f.is_file():
            candidates.add(f)
    used: set[str] = set()
    for other in get_db().brand_templates.find({"_id": {"$ne": deleted["_id"]}}, {k: 1 for k in ASSET_SECTIONS}):
        used |= asset_refs([other.get(k) for k in ASSET_SECTIONS])
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
