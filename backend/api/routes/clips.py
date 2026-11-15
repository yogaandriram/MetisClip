"""Clips: list/detail, subtitle editing, media streaming, render queue, export, delete."""
from __future__ import annotations

import shutil
from typing import Any, Literal, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from backend.api.dto import brand_template_dto, clip_dto, http_error, render_dto
from backend.api.routes.files import serve_relative
from backend.agents.tools import caption_ai, speaker_ai
from backend.agents.tools.caption_ai import valid_emoji
from backend.core import events, llm
from backend.core.db import get_db, new_id, utcnow
from backend.core.paths import get_paths
from backend.core.queue import runner
from backend.models.documents import RenderJobDoc
from backend.core.procs import Cancelled, CancelToken
from backend.services import brand_templates, exports
from backend.services import layout as layout_svc
from backend.services.render import channel_name, clean_ai, effective_ai, effective_style

router = APIRouter(tags=["clips"])


def _get(clip_id: str) -> dict:
    clip = get_db().clips.find_one({"_id": clip_id})
    if not clip:
        raise http_error(404, "Klip tidak ditemukan")
    return clip


@router.get("/api/clips")
def list_clips(agent_id: Optional[str] = None, job_id: Optional[str] = None, status: Optional[str] = None):
    q: dict = {}
    if agent_id:
        q["agent_id"] = agent_id
    if job_id:
        q["job_id"] = job_id
    if status:
        q["status"] = status
    docs = get_db().clips.find(q).sort("created_at", -1)
    return {"clips": [clip_dto(d) for d in docs]}


@router.get("/api/clips/{clip_id}")
def get_clip(clip_id: str):
    clip = _get(clip_id)
    tpl = brand_templates.for_clip(clip)
    bt = tpl or {}
    return {
        "clip": clip_dto(clip),
        "effective_style": effective_style(clip, bt),
        "effective_ai": effective_ai(clip, bt),
        # Template layout ⊕ the clip's layout_style (the editor fills in the defaults)
        "effective_layout": layout_svc.effective_layout(clip, bt),
        "channel": channel_name(clip),
        # The shots of the clip's face scan (duo and auto layouts); null before the scan
        "scenes": layout_svc.scene_info(clip),
        # The template in effect (the clip's own choice, else its agent's default); null = built-in
        "brand_template": brand_template_dto(tpl),
    }


class Word(BaseModel):
    word: str
    start: float = Field(ge=0)
    end: float = Field(ge=0)
    confidence: Optional[float] = None
    keyword: Optional[bool] = None
    emoji: Optional[str] = Field(default=None, max_length=16)


class SubtitleUpdate(BaseModel):
    words: Optional[list[Word]] = None
    style: Optional[dict[str, Any]] = None
    reset_style: bool = False
    # Per-clip layout override (patch of the template's layout_settings) and its reset
    layout: Optional[dict[str, Any]] = None
    reset_layout: bool = False
    # The clip's title (shown by the podcast layout's header and the card's post text)
    hook_text: Optional[str] = Field(default=None, max_length=300)
    # Switch the clip's brand template (null = follow the agent's default)
    brand_template_id: Optional[str] = None


@router.put("/api/clips/{clip_id}/subtitles")
def update_subtitles(clip_id: str, body: SubtitleUpdate):
    _get(clip_id)
    sets: dict[str, Any] = {"updated_at": utcnow()}
    unsets: dict[str, Any] = {}
    if "brand_template_id" in body.model_fields_set:
        if body.brand_template_id is None:
            unsets["brand_template_id"] = ""
        elif brand_templates.get(body.brand_template_id):
            sets["brand_template_id"] = body.brand_template_id
        else:
            raise http_error(400, "Brand template tidak ditemukan")
    if body.words is not None:
        words = []
        for w in body.words:
            item = {"word": w.word, "start": round(w.start, 3), "end": round(max(w.end, w.start), 3)}
            if w.confidence is not None:
                item["confidence"] = w.confidence
            if w.keyword:
                item["keyword"] = True
            emoji = valid_emoji(w.emoji) if w.emoji else None
            if emoji:
                item["emoji"] = emoji
            words.append(item)
        if len(words) > 20000:
            raise http_error(400, "Terlalu banyak kata subtitle")
        sets["subtitle.words"] = words
    if body.reset_style:
        sets["subtitle_style"] = {}
    elif body.style is not None:
        style = dict(body.style)
        if "ai" in style:
            ai = clean_ai(style.pop("ai"))
            if ai:
                style["ai"] = ai
        sets["subtitle_style"] = style
    if body.reset_layout:
        sets["layout_style"] = {}
    elif body.layout is not None:
        try:
            sets["layout_style"] = layout_svc.clean_layout(body.layout)
        except layout_svc.LayoutError as exc:
            raise http_error(400, str(exc))
    if body.hook_text is not None:
        sets["hook_text"] = " ".join(body.hook_text.split())
    get_db().clips.update_one({"_id": clip_id}, {"$set": sets, **({"$unset": unsets} if unsets else {})})
    events.publish({"type": "clip.updated", "id": clip_id})
    return {"clip": clip_dto(_get(clip_id))}


class EnrichBody(BaseModel):
    keywords: bool = True
    emojis: bool = True


@router.post("/api/clips/{clip_id}/subtitles/enrich")
def enrich_subtitles(clip_id: str, body: EnrichBody):
    """AI subtitle settings: one LLM call marks keywords and/or picks emojis on the saved words."""
    clip = _get(clip_id)
    words = (clip.get("subtitle") or {}).get("words") or []
    if not words:
        raise http_error(400, "Clip ini belum punya subtitle")
    if not (body.keywords or body.emojis):
        raise http_error(400, "Pilih kata kunci atau emoji")
    try:
        words, n_kw, n_emoji = caption_ai.enrich_words(words, keywords=body.keywords, emojis=body.emojis)
    except llm.LLMNotConfigured as exc:
        raise http_error(400, str(exc))
    except llm.LLMError as exc:
        raise http_error(502, f"AI subtitle gagal: {exc}")
    get_db().clips.update_one({"_id": clip_id}, {"$set": {"subtitle.words": words, "updated_at": utcnow()}})
    events.publish({"type": "clip.updated", "id": clip_id})
    return {"clip": clip_dto(_get(clip_id)), "keywords": n_kw, "emojis": n_emoji}


@router.post("/api/clips/{clip_id}/speaker/suggest")
def suggest_speaker(clip_id: str):
    """Names for the speaker tag, from the video title, the channel and the clip's words (not saved)."""
    clip = _get(clip_id)
    sv = get_db().source_videos.find_one({"_id": clip["source_video_id"]}) if clip.get("source_video_id") else None
    title = str((sv or {}).get("title") or "")
    words = (clip.get("subtitle") or {}).get("words") or []
    if not title and not words:
        raise http_error(400, "Klip ini belum punya judul video atau subtitle")
    try:
        speakers = speaker_ai.suggest_speakers(title, channel_name(clip), words, clip.get("hook_text") or "")
    except llm.LLMNotConfigured as exc:
        raise http_error(400, str(exc))
    except llm.LLMError as exc:
        raise http_error(502, f"Usulan nama gagal: {exc}")
    return {"speakers": speakers}


@router.get("/api/clips/{clip_id}/media/{kind}")
def clip_media(clip_id: str, kind: Literal["raw", "final", "thumbnail", "thumb", "source"]):
    clip = _get(clip_id)
    key = "thumbnail" if kind == "thumb" else kind
    rel = (clip.get("files") or {}).get(key)
    if not rel:
        raise http_error(404, "File belum tersedia")
    return serve_relative(rel)


@router.post("/api/clips/{clip_id}/source")
def prepare_clip_source(clip_id: str):
    """The clip in its original ratio (podcast and card layouts): fetched again for clips made before it was kept."""
    clip = _get(clip_id)
    if layout_svc.source_path(clip):
        return {"clip": clip_dto(clip)}
    try:
        clip = layout_svc.prepare_source(clip, CancelToken())
    except layout_svc.SourceError as exc:
        raise http_error(400, str(exc))
    except Cancelled:
        raise http_error(409, "Dibatalkan")
    except Exception as exc:
        raise http_error(502, f"Video sumber gagal disiapkan: {exc}")
    events.publish({"type": "clip.updated", "id": clip_id})
    return {"clip": clip_dto(clip)}


@router.post("/api/clips/{clip_id}/faces")
def prepare_clip_faces(clip_id: str):
    """The clip's face scan (duo and auto layouts), with its source.mp4 first when that is missing too."""
    clip = _get(clip_id)
    try:
        clip = layout_svc.prepare_faces(clip, CancelToken())
    except layout_svc.SourceError as exc:
        raise http_error(400, str(exc))
    except Cancelled:
        raise http_error(409, "Dibatalkan")
    except Exception as exc:
        raise http_error(502, f"Analisis wajah gagal: {exc}")
    events.publish({"type": "clip.updated", "id": clip_id})
    return {"clip": clip_dto(clip), "scenes": layout_svc.scene_info(clip)}


@router.post("/api/clips/{clip_id}/render")
def render_clip(clip_id: str):
    clip = _get(clip_id)
    if not (clip.get("files") or {}).get("raw"):
        raise http_error(409, "File raw klip tidak ada")
    db = get_db()
    active = db.render_jobs.find_one({"clip_id": clip_id, "status": {"$in": ["queued", "rendering"]}})
    if active:
        return {"render_job": render_dto(active)}
    doc = RenderJobDoc(_id=new_id(), clip_id=clip_id).to_mongo()
    db.render_jobs.insert_one(doc)
    events.publish({"type": "render.status", "id": doc["_id"], "clip_id": clip_id, "status": "queued"})
    runner.submit_render(doc["_id"])
    return {"render_job": render_dto(doc)}


class ExportBody(BaseModel):
    clip_ids: list[str]
    dest_dir: Optional[str] = None


@router.post("/api/clips/export")
def export_clips(body: ExportBody):
    try:
        dest = exports.check_dest(body.dest_dir)
    except exports.ExportError as exc:
        raise http_error(400, str(exc))
    exported, skipped = [], []
    db = get_db()
    for cid in body.clip_ids:
        clip = db.clips.find_one({"_id": cid})
        if not clip:
            skipped.append({"clip_id": cid, "reason": "Klip tidak ditemukan"})
            continue
        try:
            exported.append({"clip_id": cid, "path": str(exports.copy_final(clip, dest))})
        except exports.ExportError as exc:
            skipped.append({"clip_id": cid, "reason": str(exc)})
    return {"dest_dir": str(dest), "exported": exported, "skipped": skipped}


@router.delete("/api/clips/{clip_id}")
def delete_clip(clip_id: str, delete_files: bool = True):
    clip = _get(clip_id)
    db = get_db()
    for rj in db.render_jobs.find({"clip_id": clip_id, "status": {"$in": ["queued", "rendering"]}}, {"_id": 1}):
        runner.cancel_render(rj["_id"])
    db.render_jobs.delete_many({"clip_id": clip_id, "status": {"$nin": ["queued", "rendering"]}})
    db.clips.delete_one({"_id": clip_id})
    if delete_files:
        paths = get_paths()
        raw = (clip.get("files") or {}).get("raw")
        if raw:
            folder = paths.from_relative(raw).parent
            if folder.name == clip_id and paths.library_dir.resolve() in folder.resolve().parents:
                shutil.rmtree(folder, ignore_errors=True)
    events.publish({"type": "clip.deleted", "id": clip_id})
    return {"ok": True}


# -- render jobs --------------------------------------------------------------

@router.get("/api/render-jobs")
def list_render_jobs(clip_id: Optional[str] = None, status: Optional[str] = None):
    q: dict = {}
    if clip_id:
        q["clip_id"] = clip_id
    if status:
        q["status"] = status
    docs = get_db().render_jobs.find(q).sort("created_at", -1).limit(200)
    return {"render_jobs": [render_dto(d) for d in docs]}


def _render(render_id: str) -> dict:
    rj = get_db().render_jobs.find_one({"_id": render_id})
    if not rj:
        raise http_error(404, "Render job tidak ditemukan")
    return rj


@router.get("/api/render-jobs/{render_id}")
def get_render_job(render_id: str):
    return {"render_job": render_dto(_render(render_id))}


@router.post("/api/render-jobs/{render_id}/cancel")
def cancel_render_job(render_id: str):
    rj = _render(render_id)
    if rj["status"] in ("queued", "rendering"):
        runner.cancel_render(render_id)
    return {"render_job": render_dto(_render(render_id))}
