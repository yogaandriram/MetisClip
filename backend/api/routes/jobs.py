"""Pipeline jobs: create, list, cancel, resume, delete."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from backend.agents.context import PipelineError
from backend.agents.nodes.discovery import check_local_video
from backend.agents.tools import whisper
from backend.agents.tools.ytdlp import extract_video_id
from backend.api.dto import http_error, job_dto
from backend.core import events
from backend.core.config import config
from backend.core.db import get_db, new_id, utcnow
from backend.core.queue import runner
from backend.models.documents import JobConfig, JobDoc, JobSource, duration_range, format_duration
from backend.services import campaigns as campaign_svc
from backend.core import i18n

M = i18n.messages({
    "not_found": {
        "id": "Job tidak ditemukan",
        "en": "Job not found",
    },
    "disk_full": {
        "id": "Ruang disk hampir habis ({gb} GB tersisa). Kosongkan ruang atau pindahkan lokasi data.",
        "en": "The disk is almost full ({gb} GB left). Free up space or move the data location.",
    },
    "disk_low": {
        "id": "Ruang disk tinggal {gb} GB",
        "en": "Only {gb} GB of disk space left",
    },
    "no_campaign": {
        "id": "Pilih minimal satu campaign untuk job ini",
        "en": "Choose at least one campaign for this job",
    },
    "bad_duration": {
        "id": "Durasi klip tidak valid",
        "en": "Invalid clip duration",
    },
    "one_source": {
        "id": "Isi link YouTube atau pilih file video (salah satu)",
        "en": "Enter a YouTube link or choose a video file (one of them)",
    },
    "bad_url": {
        "id": "URL YouTube tidak valid",
        "en": "Invalid YouTube URL",
    },
    "upload_needs_whisper": {
        "id": "Video upload ditranskripsi dengan Whisper. {reason}",
        "en": "Uploaded videos are transcribed with Whisper. {reason}",
    },
    "not_running": {
        "id": "Job ini tidak sedang berjalan",
        "en": "This job is not running",
    },
    "not_resumable": {
        "id": "Hanya job yang terhenti, gagal, atau dibatalkan yang bisa dilanjutkan",
        "en": "Only interrupted, failed or cancelled jobs can be resumed",
    },
    "cancel_first": {
        "id": "Batalkan job terlebih dahulu sebelum menghapus",
        "en": "Cancel the job before deleting it",
    },
    "campaign_missing": {
        "id": "Campaign tidak ditemukan. Muat ulang halaman lalu pilih lagi.",
        "en": "Campaign not found. Reload the page and choose it again.",
    },
    "campaign_archived": {
        "id": "Campaign '{name}' sudah diarsipkan. Aktifkan lagi dulu di halaman Campaign.",
        "en": "The '{name}' campaign is archived. Make it active again on the Campaigns page first.",
    },
    "too_many_campaigns": {
        "id": "Satu job maksimal {n} campaign",
        "en": "A job can have at most {n} campaigns",
    },
})

MAX_CAMPAIGNS_PER_JOB = 5

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


class JobCreate(BaseModel):
    # Exactly one source: a YouTube link, or a video file on this PC (used in place, never copied)
    youtube_url: Optional[str] = None
    local_file_path: Optional[str] = None
    clip_duration: str = "45-60"
    max_clips: int = Field(default=3, ge=0, le=100)
    # Campaigns the clips are made for (at least one): each brief guides the choice, and every campaign
    # gets its own clips
    campaign_ids: list[str] = Field(default_factory=list)
    # Extra instructions for this video only
    note: str = Field(default="", max_length=2000)
    # The automatic layout by content for this job's clips (None: follow the brand templates)
    smart_layout: Optional[bool] = None


def _get(job_id: str) -> dict:
    job = get_db().discovery_jobs.find_one({"_id": job_id})
    if not job:
        raise http_error(404, M("not_found"))
    return job


MIN_FREE_BYTES = 2 * 1024**3


def _check_disk() -> None:
    import shutil

    from backend.core.paths import get_paths

    try:
        free = shutil.disk_usage(get_paths().data_root).free
    except OSError:
        return
    if free < MIN_FREE_BYTES:
        raise http_error(507, M("disk_full", gb=f"{free / 1024**3:.1f}"))
    if free < 5 * 1024**3:
        events.notice(M("disk_low", gb=f"{free / 1024**3:.1f}"), "warning")


@router.post("")
def create_job(body: JobCreate):
    _check_disk()
    db = get_db()
    lohi = duration_range(body.clip_duration)
    if lohi is None:
        raise http_error(400, M("bad_duration"))
    ids = list(dict.fromkeys(i for i in body.campaign_ids if i))
    if not ids:
        raise http_error(400, M("no_campaign"))
    if len(ids) > MAX_CAMPAIGNS_PER_JOB:
        raise http_error(400, M("too_many_campaigns", n=MAX_CAMPAIGNS_PER_JOB))
    chosen = []
    for cid in ids:
        campaign = campaign_svc.get(cid)
        if not campaign:
            raise http_error(400, M("campaign_missing"))
        if campaign.get("status") == "archived":
            raise http_error(400, M("campaign_archived", name=campaign.get("name") or ""))
        chosen.append(campaign_svc.snapshot(campaign))
    url = (body.youtube_url or "").strip()
    file_path = (body.local_file_path or "").strip()
    if bool(url) == bool(file_path):
        raise http_error(400, M("one_source"))
    if url:
        if not extract_video_id(url):
            raise http_error(400, M("bad_url"))
        source = JobSource(type="url", youtube_url=url)
    else:
        try:
            path, _ = check_local_video(file_path)
        except PipelineError as exc:
            raise http_error(400, str(exc)) from exc
        # Uploads have no YouTube subtitles: the transcript always comes from Whisper (Groq or local)
        if not whisper.available() and not config.is_dev:
            raise http_error(400, M("upload_needs_whisper", reason=whisper.unavailable_reason()))
        source = JobSource(type="local_file", local_file_path=str(path))
    doc = JobDoc(
        _id=new_id(),
        source=source,
        config=JobConfig(
            clip_duration=format_duration(*lohi),
            max_clips=body.max_clips,
            max_clips_per_video=body.max_clips,
            smart_layout=body.smart_layout,
        ),
        campaign_ids=[c["id"] for c in chosen],
        campaigns=chosen,
        note=body.note.strip(),
    ).to_mongo()
    db.discovery_jobs.insert_one(doc)
    events.publish({"type": "job.status", "id": doc["_id"], "campaign_ids": doc["campaign_ids"], "status": "pending"})
    runner.submit_job(doc["_id"])
    return {"job": job_dto(doc)}


@router.get("")
def list_jobs(campaign_id: Optional[str] = None, status: Optional[str] = None, limit: int = 50):
    q: dict = {}
    if campaign_id:
        q["campaign_ids"] = campaign_id
    if status:
        q["status"] = status
    docs = get_db().discovery_jobs.find(q).sort("created_at", -1).limit(max(1, min(500, limit)))
    return {"jobs": [job_dto(d) for d in docs]}


@router.get("/{job_id}")
def get_job(job_id: str):
    return {"job": job_dto(_get(job_id))}


@router.post("/{job_id}/cancel")
def cancel_job(job_id: str):
    job = _get(job_id)
    if job["status"] not in ("pending", "running"):
        raise http_error(409, M("not_running"))
    runner.cancel_job(job_id)
    return {"job": job_dto(_get(job_id))}


@router.post("/{job_id}/resume")
def resume_job(job_id: str):
    db = get_db()
    job = db.discovery_jobs.find_one_and_update(
        {"_id": job_id, "status": {"$in": ["interrupted", "failed", "cancelled"]}},
        {"$set": {"status": "pending", "finished_at": None}},
        return_document=True,
    )
    if not job:
        _get(job_id)
        raise http_error(409, M("not_resumable"))
    events.publish({"type": "job.status", "id": job_id, "campaign_ids": job.get("campaign_ids") or [], "status": "pending"})
    runner.submit_job(job_id)
    return {"job": job_dto(job)}


@router.delete("/{job_id}")
def delete_job(job_id: str):
    job = _get(job_id)
    if job["status"] in ("pending", "running"):
        raise http_error(409, M("cancel_first"))
    db = get_db()
    db.source_videos.delete_many({"job_id": job_id})
    db.discovery_jobs.delete_one({"_id": job_id})  # clips are kept
    return {"ok": True}
