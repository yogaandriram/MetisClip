"""Clips: list/detail, subtitle editing, media streaming, render queue, export, delete."""
from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any, Literal, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from backend.api.dto import brand_template_dto, clip_dto, http_error, render_dto
from backend.api.routes.files import serve_relative
from backend.core import events
from backend.core.db import get_db, new_id, utcnow
from backend.core.paths import get_paths
from backend.core.queue import runner
from backend.models.documents import RenderJobDoc
from backend.services.render import effective_style

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
    agent = get_db().super_agents.find_one({"_id": clip.get("agent_id")}) if clip.get("agent_id") else None
    bt = (agent or {}).get("brand_template") or {}
    return {
        "clip": clip_dto(clip),
        "effective_style": effective_style(clip, bt),
        "brand_template": brand_template_dto(agent) if agent else None,
    }


class Word(BaseModel):
    word: str
    start: float = Field(ge=0)
    end: float = Field(ge=0)
    confidence: Optional[float] = None


class SubtitleUpdate(BaseModel):
    words: Optional[list[Word]] = None
    style: Optional[dict[str, Any]] = None
    reset_style: bool = False


@router.put("/api/clips/{clip_id}/subtitles")
def update_subtitles(clip_id: str, body: SubtitleUpdate):
    _get(clip_id)
    sets: dict[str, Any] = {"updated_at": utcnow()}
    if body.words is not None:
        words = []
        for w in body.words:
            item = {"word": w.word, "start": round(w.start, 3), "end": round(max(w.end, w.start), 3)}
            if w.confidence is not None:
                item["confidence"] = w.confidence
            words.append(item)
        if len(words) > 20000:
            raise http_error(400, "Terlalu banyak kata subtitle")
        sets["subtitle.words"] = words
    if body.reset_style:
        sets["subtitle_style"] = {}
    elif body.style is not None:
        sets["subtitle_style"] = body.style
    get_db().clips.update_one({"_id": clip_id}, {"$set": sets})
    events.publish({"type": "clip.updated", "id": clip_id})
    return {"clip": clip_dto(_get(clip_id))}


@router.get("/api/clips/{clip_id}/media/{kind}")
def clip_media(clip_id: str, kind: Literal["raw", "final", "thumbnail", "thumb"]):
    clip = _get(clip_id)
    key = "thumbnail" if kind == "thumb" else kind
    rel = (clip.get("files") or {}).get(key)
    if not rel:
        raise http_error(404, "File belum tersedia")
    return serve_relative(rel)


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


def _export_dir() -> Path:
    from backend.core.settings_store import get_settings

    return Path(get_settings()["export_dir"])


@router.post("/api/clips/export")
def export_clips(body: ExportBody):
    dest = Path(body.dest_dir).expanduser() if body.dest_dir else _export_dir()
    try:
        dest = dest.resolve()
        dest.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise http_error(400, f"Folder tujuan tidak dapat dibuat: {exc}")
    paths = get_paths()
    if dest == paths.data_root.resolve() or paths.db_dir.resolve() in [dest, *dest.parents] \
            or paths.private_dir.resolve() in [dest, *dest.parents]:
        raise http_error(400, "Folder tujuan tidak diizinkan")
    exported, skipped = [], []
    db = get_db()
    for cid in body.clip_ids:
        clip = db.clips.find_one({"_id": cid})
        if not clip:
            skipped.append({"clip_id": cid, "reason": "Klip tidak ditemukan"})
            continue
        rel = (clip.get("files") or {}).get("final")
        if not rel:
            skipped.append({"clip_id": cid, "reason": "Belum dirender"})
            continue
        src = paths.from_relative(rel)
        if not src.exists():
            skipped.append({"clip_id": cid, "reason": "File hasil render hilang"})
            continue
        base = "".join(ch for ch in (clip.get("hook_text") or "")[:50] if ch.isalnum() or ch in " -_").strip() or "metisclip"
        target = dest / f"{base} - {cid[:8]}.mp4"
        try:
            shutil.copy2(src, target)
        except OSError as exc:
            skipped.append({"clip_id": cid, "reason": f"Gagal menyalin: {exc}"})
            continue
        exported.append({"clip_id": cid, "path": str(target)})
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
