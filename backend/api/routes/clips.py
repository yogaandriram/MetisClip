"""Clips: list/detail, subtitle editing, media streaming, render queue, export, delete."""
from __future__ import annotations

import shutil
from typing import Any, Literal, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from backend.api.dto import brand_template_dto, campaign_dto, clip_dto, http_error, render_dto
from backend.api.routes.files import serve_relative
from backend.agents.tools import caption_ai, post_copy_ai, speaker_ai
from backend.agents.tools.caption_ai import valid_emoji
from backend.core import disk, events, llm
from backend.core.db import get_db, new_id, utcnow
from backend.core.paths import get_paths
from backend.core.queue import runner
from backend.models.documents import RenderJobDoc
from backend.core.procs import Cancelled, CancelToken
from backend.services import brand_templates, brief_check, exports
from backend.services import campaigns as campaign_svc
from backend.services import layout as layout_svc
from backend.services.render import channel_name, clean_ai, effective_ai, effective_style
from backend.core import i18n

M = i18n.messages({
    "not_found": {
        "id": "Klip tidak ditemukan",
        "en": "Clip not found",
    },
    "template_not_found": {
        "id": "Brand template tidak ditemukan",
        "en": "Brand template not found",
    },
    "too_many_words": {
        "id": "Terlalu banyak kata subtitle",
        "en": "Too many subtitle words",
    },
    "no_subtitles": {
        "id": "Clip ini belum punya subtitle",
        "en": "This clip has no subtitles yet",
    },
    "pick_marks": {
        "id": "Pilih kata kunci atau emoji",
        "en": "Choose keywords or emojis",
    },
    "ai_failed": {
        "id": "AI subtitle gagal: {error}",
        "en": "AI subtitles failed: {error}",
    },
    "no_speaker_text": {
        "id": "Klip ini belum punya judul video atau subtitle",
        "en": "This clip has no video title or subtitles yet",
    },
    "suggest_failed": {
        "id": "Usulan nama gagal: {error}",
        "en": "Name suggestions failed: {error}",
    },
    "file_not_ready": {
        "id": "File belum tersedia",
        "en": "The file is not available yet",
    },
    "cancelled": {
        "id": "Dibatalkan",
        "en": "Cancelled",
    },
    "source_failed": {
        "id": "Video sumber gagal disiapkan: {error}",
        "en": "The source video couldn't be prepared: {error}",
    },
    "faces_failed": {
        "id": "Analisis wajah gagal: {error}",
        "en": "Face analysis failed: {error}",
    },
    "no_raw": {
        "id": "File raw klip tidak ada",
        "en": "The clip's raw file is missing",
    },
    "render_not_found": {
        "id": "Render job tidak ditemukan",
        "en": "Render job not found",
    },
    "campaign_not_found": {
        "id": "Campaign tidak ditemukan",
        "en": "Campaign not found",
    },
    "no_campaign": {
        "id": "Klip ini bukan klip campaign",
        "en": "This clip isn't a campaign clip",
    },
    "post_copy_failed": {
        "id": "Teks posting gagal dibuat: {error}",
        "en": "The post text couldn't be written: {error}",
    },
    "unknown_rule": {
        "id": "Aturan brief tidak ditemukan",
        "en": "Brief rule not found",
    },
})

router = APIRouter(tags=["clips"])


def _get(clip_id: str) -> dict:
    clip = get_db().clips.find_one({"_id": clip_id})
    if not clip:
        raise http_error(404, M("not_found"))
    return clip


class _BriefContext:
    """Campaigns, templates and channels looked up once per request (the gallery checks many clips)."""

    def __init__(self) -> None:
        self.campaigns: dict[str, dict | None] = {}
        self.templates: dict[str, dict | None] = {}

    def campaign(self, cid: str) -> dict | None:
        if cid not in self.campaigns:
            self.campaigns[cid] = campaign_svc.get(cid)
        return self.campaigns[cid]

    def check(self, clip: dict) -> dict | None:
        campaign = self.campaign(clip["campaign_id"]) if clip.get("campaign_id") else None
        if not campaign or not campaign_svc.has_brief(campaign.get("brief")):
            return None
        key = f"{clip.get('brand_template_id')}|{clip.get('campaign_id')}"
        if key not in self.templates:
            self.templates[key] = brand_templates.for_clip(clip)
        return brief_check.check(clip, campaign, self.templates[key], channel_name(clip))


@router.get("/api/clips")
def list_clips(job_id: Optional[str] = None, status: Optional[str] = None, campaign_id: Optional[str] = None):
    q: dict = {}
    if job_id:
        q["job_id"] = job_id
    if status:
        q["status"] = status
    if campaign_id:
        q["campaign_id"] = campaign_id
    docs = get_db().clips.find(q).sort("created_at", -1)
    ctx = _BriefContext()
    out = []
    for d in docs:
        dto = clip_dto(d)
        if d.get("campaign_id"):
            check = ctx.check(d)
            dto["brief_summary"] = check["summary"] if check else None
            c = ctx.campaign(d["campaign_id"])
            dto["campaign_name"] = (c or {}).get("name") or ""
        out.append(dto)
    return {"clips": out}


@router.get("/api/clips/{clip_id}")
def get_clip(clip_id: str):
    clip = _get(clip_id)
    tpl = brand_templates.for_clip(clip)
    bt = tpl or {}
    scenes = layout_svc.scene_info(clip)
    return {
        "clip": clip_dto(clip),
        "effective_style": effective_style(clip, bt),
        "effective_ai": effective_ai(clip, bt),
        # Template layout ⊕ the clip's layout_style (the editor fills in the defaults)
        "effective_layout": layout_svc.effective_layout(clip, bt),
        "channel": channel_name(clip),
        # The shots of the clip's face scan (duo and auto layouts); null before the scan
        "scenes": scenes,
        # What the clip shows, for "Layout otomatis sesuai konten" (null before the face scan)
        "content": layout_svc.content_profile(clip, scenes),
        # The template in effect (the clip's own choice, else its campaign's, else the default template)
        "brand_template": brand_template_dto(tpl),
        **_campaign_info(clip, tpl),
    }


def _campaign_info(clip: dict, tpl: dict | None) -> dict[str, Any]:
    """The clip's campaign (without the brief material) and its brief checklist (null for a plain
    campaign, whose brief is empty)."""
    campaign = campaign_svc.get(clip.get("campaign_id")) if clip.get("campaign_id") else None
    if not campaign:
        return {"campaign": None, "brief_check": None}
    dto = campaign_dto(campaign)
    dto.pop("sources", None)
    dto.pop("draft", None)
    check = brief_check.check(clip, campaign, tpl, channel_name(clip)) if campaign_svc.has_brief(campaign.get("brief")) else None
    return {"campaign": dto, "brief_check": check}


class PostCopy(BaseModel):
    title: str = Field(default="", max_length=200)
    caption: str = Field(default="", max_length=2200)
    hashtags: list[str] = Field(default_factory=list, max_length=60)
    mentions: list[str] = Field(default_factory=list, max_length=60)
    disclosure: str = Field(default="", max_length=300)


def _campaign_of(clip: dict) -> dict:
    campaign = campaign_svc.get(clip.get("campaign_id")) if clip.get("campaign_id") else None
    if not campaign:
        raise http_error(400, M("no_campaign"))
    return campaign


@router.put("/api/clips/{clip_id}/post-copy")
def save_post_copy(clip_id: str, body: PostCopy):
    """The user's edit of the post text (the brief's required hashtags and mentions are not forced back:
    the checklist shows when they are missing)."""
    clip = _get(clip_id)
    copy = post_copy_ai.enforce(body.model_dump(), {})
    copy["generated_at"] = ((clip.get("post_copy") or {}).get("generated_at"))
    copy["source"] = "edited"
    get_db().clips.update_one({"_id": clip_id}, {"$set": {"post_copy": copy, "updated_at": utcnow()}})
    events.publish({"type": "clip.updated", "id": clip_id})
    return {"clip": clip_dto(_get(clip_id))}


@router.post("/api/clips/{clip_id}/post-copy/generate")
def generate_post_copy(clip_id: str):
    """Write the post text again with the LLM, following the campaign's current brief."""
    clip = _get(clip_id)
    campaign = _campaign_of(clip)
    sv = get_db().source_videos.find_one({"_id": clip["source_video_id"]}) if clip.get("source_video_id") else None
    try:
        copy = post_copy_ai.generate(clip, campaign.get("brief") or {}, video_title=str((sv or {}).get("title") or ""),
                                     channel=str((sv or {}).get("channel_name") or ""))
    except llm.LLMNotConfigured as exc:
        raise http_error(400, str(exc))
    except llm.LLMError as exc:
        raise http_error(502, M("post_copy_failed", error=exc))
    get_db().clips.update_one({"_id": clip_id}, {"$set": {"post_copy": copy, "updated_at": utcnow()}})
    events.publish({"type": "clip.updated", "id": clip_id})
    return {"clip": clip_dto(_get(clip_id))}


class ManualCheck(BaseModel):
    rule: str = Field(min_length=1, max_length=40)
    checked: bool


@router.put("/api/clips/{clip_id}/brief-manual")
def set_brief_manual(clip_id: str, body: ManualCheck):
    """Tick (or untick) a brief rule only the user can check."""
    clip = _get(clip_id)
    campaign = _campaign_of(clip)
    if not any(r.get("id") == body.rule for r in (campaign.get("brief") or {}).get("rules") or []):
        raise http_error(400, M("unknown_rule"))
    op = {"$set": {f"brief_manual.{body.rule}": True, "updated_at": utcnow()}} if body.checked else \
        {"$unset": {f"brief_manual.{body.rule}": ""}, "$set": {"updated_at": utcnow()}}
    get_db().clips.update_one({"_id": clip_id}, op)
    events.publish({"type": "clip.updated", "id": clip_id})
    clip = _get(clip_id)
    return {"clip": clip_dto(clip), "brief_check": _campaign_info(clip, brand_templates.for_clip(clip))["brief_check"]}


class ClipCampaign(BaseModel):
    campaign_id: str = Field(min_length=1)


@router.put("/api/clips/{clip_id}/campaign")
def set_clip_campaign(clip_id: str, body: ClipCampaign):
    """Move a clip to another campaign (every clip belongs to one). What belonged to the old campaign goes:
    its fit score and reason, the ticked manual rules, and the post text (a basic one for the new brief
    takes its place, none for a plain campaign; "Tulis ulang dengan AI" writes a better one), and its brand
    template (it follows the new campaign's default). The media files stay where they are."""
    clip = _get(clip_id)
    if body.campaign_id == clip.get("campaign_id"):
        return {"clip": clip_dto(clip)}
    campaign = campaign_svc.get(body.campaign_id)
    if not campaign:
        raise http_error(400, M("campaign_not_found"))
    brief = campaign.get("brief") or {}
    sets: dict[str, Any] = {"campaign_id": body.campaign_id, "updated_at": utcnow()}
    # Templates belong to a campaign: the clip takes the new campaign's default
    unsets = {"brief_fit": "", "brief_reason": "", "brief_manual": "", "brand_template_id": ""}
    if campaign_svc.has_brief(brief):
        sets["post_copy"] = post_copy_ai.fallback(clip, brief)
    else:
        unsets["post_copy"] = ""
    get_db().clips.update_one({"_id": clip_id}, {"$set": sets, "$unset": unsets})
    events.publish({"type": "clip.updated", "id": clip_id})
    return {"clip": clip_dto(_get(clip_id))}


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
    # Switch the clip's brand template (null = follow its campaign's template)
    brand_template_id: Optional[str] = None


@router.put("/api/clips/{clip_id}/subtitles")
def update_subtitles(clip_id: str, body: SubtitleUpdate):
    clip = _get(clip_id)
    sets: dict[str, Any] = {"updated_at": utcnow()}
    unsets: dict[str, Any] = {}
    if "brand_template_id" in body.model_fields_set:
        tpl = brand_templates.get(body.brand_template_id)
        if body.brand_template_id is None:
            unsets["brand_template_id"] = ""
        elif tpl and tpl.get("campaign_id") == clip.get("campaign_id"):
            sets["brand_template_id"] = body.brand_template_id  # one of its campaign's templates
        else:
            raise http_error(400, M("template_not_found"))
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
            raise http_error(400, M("too_many_words"))
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
        raise http_error(400, M("no_subtitles"))
    if not (body.keywords or body.emojis):
        raise http_error(400, M("pick_marks"))
    try:
        words, n_kw, n_emoji = caption_ai.enrich_words(words, keywords=body.keywords, emojis=body.emojis)
    except llm.LLMNotConfigured as exc:
        raise http_error(400, str(exc))
    except llm.LLMError as exc:
        raise http_error(502, M("ai_failed", error=exc))
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
        raise http_error(400, M("no_speaker_text"))
    try:
        speakers = speaker_ai.suggest_speakers(title, channel_name(clip), words, clip.get("hook_text") or "")
    except llm.LLMNotConfigured as exc:
        raise http_error(400, str(exc))
    except llm.LLMError as exc:
        raise http_error(502, M("suggest_failed", error=exc))
    return {"speakers": speakers}


@router.get("/api/clips/{clip_id}/media/{kind}")
def clip_media(clip_id: str, kind: Literal["raw", "final", "thumbnail", "thumb", "source"]):
    clip = _get(clip_id)
    key = "thumbnail" if kind == "thumb" else kind
    rel = (clip.get("files") or {}).get(key)
    if not rel:
        raise http_error(404, M("file_not_ready"))
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
        raise http_error(409, M("cancelled"))
    except Exception as exc:
        raise http_error(502, M("source_failed", error=exc))
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
        raise http_error(409, M("cancelled"))
    except Exception as exc:
        raise http_error(502, M("faces_failed", error=exc))
    events.publish({"type": "clip.updated", "id": clip_id})
    scenes = layout_svc.scene_info(clip)
    return {"clip": clip_dto(clip), "scenes": scenes, "content": layout_svc.content_profile(clip, scenes)}


# final.mp4 plus its export copy and the render props: a 90 s 1080x1920 export is well under this
RENDER_NEED_BYTES = 512 * 1024**2


@router.post("/api/clips/{clip_id}/render")
def render_clip(clip_id: str):
    clip = _get(clip_id)
    if not (clip.get("files") or {}).get("raw"):
        raise http_error(409, M("no_raw"))
    db = get_db()
    active = db.render_jobs.find_one({"clip_id": clip_id, "status": {"$in": ["queued", "rendering"]}})
    if active:
        return {"render_job": render_dto(active)}
    try:
        disk.check(RENDER_NEED_BYTES)
    except disk.DiskFull as exc:
        raise http_error(507, str(exc))
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
            skipped.append({"clip_id": cid, "reason": M("not_found")})
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
        raise http_error(404, M("render_not_found"))
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
