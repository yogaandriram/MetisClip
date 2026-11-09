"""Pipeline jobs: create, list, cancel, resume, delete."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from backend.agents.tools.ytdlp import extract_video_id
from backend.api.dto import http_error, job_dto
from backend.core import events
from backend.core.db import get_db, new_id, utcnow
from backend.core.queue import runner
from backend.models.documents import DURATIONS, JobConfig, JobDoc, JobSource

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


class JobCreate(BaseModel):
    agent_id: str
    youtube_url: str
    clip_duration: str = "45-60"
    max_clips: int = Field(default=3, ge=0, le=100)


def _get(job_id: str) -> dict:
    job = get_db().discovery_jobs.find_one({"_id": job_id})
    if not job:
        raise http_error(404, "Job tidak ditemukan")
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
        raise http_error(507, f"Ruang disk hampir habis ({free / 1024**3:.1f} GB tersisa). Kosongkan ruang atau pindahkan lokasi data.")
    if free < 5 * 1024**3:
        events.notice(f"Ruang disk tinggal {free / 1024**3:.1f} GB", "warning")


@router.post("")
def create_job(body: JobCreate):
    _check_disk()
    db = get_db()
    if not db.super_agents.find_one({"_id": body.agent_id}, {"_id": 1}):
        raise http_error(400, "Super Agent tidak ditemukan. Pilih agent terlebih dahulu.")
    if body.clip_duration not in DURATIONS:
        raise http_error(400, "Durasi klip tidak valid")
    url = body.youtube_url.strip()
    if not extract_video_id(url):
        raise http_error(400, "URL YouTube tidak valid")
    doc = JobDoc(
        _id=new_id(),
        agent_id=body.agent_id,
        source=JobSource(type="url", youtube_url=url),
        config=JobConfig(
            clip_duration=body.clip_duration,
            max_clips=body.max_clips,
            max_clips_per_video=body.max_clips,
        ),
    ).to_mongo()
    db.discovery_jobs.insert_one(doc)
    events.publish({"type": "job.status", "id": doc["_id"], "agent_id": doc["agent_id"], "status": "pending"})
    runner.submit_job(doc["_id"])
    return {"job": job_dto(doc)}


@router.get("")
def list_jobs(agent_id: Optional[str] = None, status: Optional[str] = None, limit: int = 50):
    q: dict = {}
    if agent_id:
        q["agent_id"] = agent_id
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
        raise http_error(409, "Job ini tidak sedang berjalan")
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
        raise http_error(409, "Hanya job yang terhenti, gagal, atau dibatalkan yang bisa dilanjutkan")
    events.publish({"type": "job.status", "id": job_id, "agent_id": job.get("agent_id"), "status": "pending"})
    runner.submit_job(job_id)
    return {"job": job_dto(job)}


@router.delete("/{job_id}")
def delete_job(job_id: str):
    job = _get(job_id)
    if job["status"] in ("pending", "running"):
        raise http_error(409, "Batalkan job terlebih dahulu sebelum menghapus")
    db = get_db()
    db.source_videos.delete_many({"job_id": job_id})
    db.discovery_jobs.delete_one({"_id": job_id})  # clips are kept
    return {"ok": True}
