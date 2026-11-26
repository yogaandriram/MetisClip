"""Pipeline jobs: create, list, cancel, resume, delete."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from backend.agents.context import PipelineError, failed_segments
from backend.agents.nodes import manual
from backend.agents.nodes.discovery import check_local_video
from backend.agents.tools import whisper
from backend.agents.tools import ytdlp
from backend.agents.tools.ytdlp import extract_video_id, watch_url
from backend.api.dto import http_error, job_dto, job_outputs, recut_event
from backend.core import disk, events
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
    "too_many_videos": {
        "id": "Maksimal {n} video sekaligus",
        "en": "At most {n} videos at once",
    },
    "bad_url_n": {
        "id": "Link {n} bukan link video YouTube",
        "en": "Link {n} is not a YouTube video link",
    },
    "manual_one_video": {
        "id": "Momen pilihan sendiri hanya bisa untuk satu video. Hapus link lainnya, atau pilih \"AI pilih momen terbaik\".",
        "en": "Moments you choose work for one video only. Remove the other links, or choose \"AI picks the best moments\".",
    },
    "not_playlist": {
        "id": "Link ini bukan link playlist YouTube (tidak ada \"list=\")",
        "en": "This is not a YouTube playlist link (it has no \"list=\")",
    },
    "playlist_empty": {
        "id": "Playlist ini tidak berisi video yang bisa dibuka",
        "en": "This playlist has no video that can be opened",
    },
    "again_kind": {
        "id": "\"Cari klip lagi\" hanya untuk job yang momennya dipilih AI",
        "en": "\"Find more clips\" only works for jobs whose moments the AI chose",
    },
    "again_running": {
        "id": "Job ini masih berjalan. Tunggu sampai selesai.",
        "en": "This job is still running. Wait until it is done.",
    },
    "again_no_campaign": {
        "id": "Campaign job ini sudah dihapus atau diarsipkan. Mulai job baru di Cari Video.",
        "en": "This job's campaigns were deleted or archived. Start a new job on Cari Video.",
    },
    "again_no_source": {
        "id": "Sumber job ini tidak diketahui",
        "en": "This job's source is unknown",
    },
})

MAX_VIDEOS_PER_REQUEST = ytdlp.PLAYLIST_MAX

MAX_CAMPAIGNS_PER_JOB = 5

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


class RangeIn(BaseModel):
    start: float
    end: float


class JobCreate(BaseModel):
    # Exactly one source: a YouTube link, or a video file on this PC (used in place, never copied)
    youtube_url: Optional[str] = None
    local_file_path: Optional[str] = None
    # Or several YouTube links (e.g. the videos picked from a playlist): one job per video, same settings
    youtube_urls: list[str] = Field(default_factory=list, max_length=200)
    clip_duration: str = "45-60"
    max_clips: int = Field(default=3, ge=0, le=100)
    # Campaigns the clips are made for (at least one): each brief guides the choice, and every campaign
    # gets its own clips
    campaign_ids: list[str] = Field(default_factory=list)
    # Extra instructions for this video only
    note: str = Field(default="", max_length=2000)
    # The automatic layout by content for this job's clips (None: follow the brand templates)
    smart_layout: Optional[bool] = None
    # Moments the user chose (seconds of the video): the Analyzer is skipped (agents/nodes/manual.py)
    manual_ranges: list[RangeIn] = Field(default_factory=list, max_length=manual.MAX_RANGES)
    # Move those edges to the nearest sentence boundary
    snap_edges: bool = True


def insert_job(source: JobSource, cfg: JobConfig, chosen: list[dict], note: str = "") -> dict:
    """Store a pending job and queue it (also used by a clip's recut, routes/clips.py)."""
    doc = JobDoc(
        _id=new_id(),
        source=source,
        config=cfg,
        campaign_ids=[c["id"] for c in chosen],
        campaigns=chosen,
        note=note,
    ).to_mongo()
    get_db().discovery_jobs.insert_one(doc)
    events.publish({"type": "job.status", "id": doc["_id"], "campaign_ids": doc["campaign_ids"], "status": "pending",
                    **recut_event(doc)})
    runner.submit_job(doc["_id"])
    return doc


def _get(job_id: str) -> dict:
    job = get_db().discovery_jobs.find_one({"_id": job_id})
    if not job:
        raise http_error(404, M("not_found"))
    return job


def _check_disk() -> None:
    """No new job (or resume) below 2 GB free; a warning below 5 GB (core/disk.py)."""
    try:
        disk.check()
    except disk.DiskFull as exc:
        raise http_error(507, str(exc))


def _campaigns(ids: list[str]) -> list[dict]:
    """Snapshots of the chosen campaigns (1 to 5, all active)."""
    ids = list(dict.fromkeys(i for i in ids if i))
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
    return chosen


def _file_source(file_path: str) -> JobSource:
    try:
        path, _ = check_local_video(file_path)
    except PipelineError as exc:
        raise http_error(400, str(exc)) from exc
    # Uploads have no YouTube subtitles: the transcript always comes from Whisper (Groq or local)
    if not whisper.available() and not config.is_dev:
        raise http_error(400, M("upload_needs_whisper", reason=whisper.unavailable_reason()))
    return JobSource(type="local_file", local_file_path=str(path))


def _video_sources(body: JobCreate) -> list[JobSource]:
    """One source per video: the uploaded file, or every YouTube link (the same video once)."""
    links = [u.strip() for u in ([body.youtube_url or ""] + list(body.youtube_urls)) if u and u.strip()]
    file_path = (body.local_file_path or "").strip()
    if bool(links) == bool(file_path):
        raise http_error(400, M("one_source"))
    if file_path:
        return [_file_source(file_path)]
    seen: dict[str, str] = {}
    for n, link in enumerate(links, start=1):
        vid = extract_video_id(link)
        if not vid:
            raise http_error(400, M("bad_url") if len(links) == 1 else M("bad_url_n", n=n))
        seen.setdefault(vid, link)
    if len(seen) > MAX_VIDEOS_PER_REQUEST:
        raise http_error(400, M("too_many_videos", n=MAX_VIDEOS_PER_REQUEST))
    return [JobSource(type="url", youtube_url=link) for link in seen.values()]


@router.post("")
def create_job(body: JobCreate):
    """A job per video. Returns the first as `job` and all of them as `jobs`."""
    _check_disk()
    lohi = duration_range(body.clip_duration)
    if lohi is None:
        raise http_error(400, M("bad_duration"))
    chosen = _campaigns(body.campaign_ids)
    sources = _video_sources(body)
    if body.manual_ranges and len(sources) > 1:
        raise http_error(400, M("manual_one_video"))
    ranges: list[dict[str, float]] = []
    if body.manual_ranges:
        try:
            ranges = manual.clean_ranges([r.model_dump() for r in body.manual_ranges])
        except manual.RangeError as exc:
            raise http_error(400, str(exc)) from exc
    cfg = JobConfig(
        clip_duration=format_duration(*lohi),
        max_clips=body.max_clips,
        max_clips_per_video=body.max_clips,
        smart_layout=body.smart_layout,
        manual_ranges=ranges,
        snap_edges=body.snap_edges,
    )
    docs = [insert_job(source, cfg, chosen, body.note.strip()) for source in sources]
    jobs = [job_dto(d) for d in docs]
    return {"job": jobs[0], "jobs": jobs}


class PlaylistIn(BaseModel):
    url: str = Field(max_length=2000)


@router.post("/playlist")
def playlist_videos(body: PlaylistIn):
    """The videos of a YouTube playlist (at most 50), so Cari Video can start a job for each chosen one."""
    playlist_id = ytdlp.extract_playlist_id(body.url)
    if not playlist_id:
        raise http_error(400, M("not_playlist"))
    try:
        data = ytdlp.list_playlist(playlist_id)
    except ytdlp.YtDlpError as exc:
        raise http_error(400, str(exc)) from exc
    if not data["entries"]:
        raise http_error(400, M("playlist_empty"))
    for e in data["entries"]:
        e["youtube_url"] = watch_url(e["youtube_id"])
    return {"playlist_id": playlist_id, **data}


@router.post("/{job_id}/again")
def find_more_clips(job_id: str):
    """\"Cari klip lagi\": a new job for the same video, campaigns and settings. Moments the campaigns
    already have clips of are skipped (analyzer, "Already clipped"), so it finds new ones."""
    _check_disk()
    job = _get(job_id)
    cfg = job.get("config") or {}
    if cfg.get("recut") or cfg.get("manual_ranges"):
        raise http_error(400, M("again_kind"))
    if job.get("status") in ("pending", "running"):
        raise http_error(409, M("again_running"))
    ids = [cid for cid in job.get("campaign_ids") or []
           if (c := campaign_svc.get(cid)) and c.get("status") != "archived"]
    if not ids:
        raise http_error(400, M("again_no_campaign"))
    chosen = _campaigns(ids)
    src = job.get("source") or {}
    if src.get("type") == "url" and extract_video_id(src.get("youtube_url") or ""):
        source = JobSource(type="url", youtube_url=src["youtube_url"])
    elif src.get("type") == "local_file" and src.get("local_file_path"):
        source = _file_source(src["local_file_path"])
    else:
        raise http_error(400, M("again_no_source"))
    lohi = duration_range(cfg.get("clip_duration") or "45-60") or (45, 60)
    new_cfg = JobConfig(
        clip_duration=format_duration(*lohi),
        max_clips=int(cfg.get("max_clips", 3) or 0),
        max_clips_per_video=int(cfg.get("max_clips_per_video", cfg.get("max_clips", 3)) or 0),
        smart_layout=cfg.get("smart_layout"),
    )
    doc = insert_job(source, new_cfg, chosen, job.get("note") or "")
    return {"job": job_dto(doc)}


@router.get("")
def list_jobs(campaign_id: Optional[str] = None, status: Optional[str] = None, limit: int = 50):
    q: dict = {}
    if campaign_id:
        q["campaign_ids"] = campaign_id
    if status:
        q["status"] = status
    db = get_db()
    docs = list(db.discovery_jobs.find(q).sort("created_at", -1).limit(max(1, min(500, limit))))
    outputs = job_outputs(db, [d["_id"] for d in docs])
    return {"jobs": [job_dto(d, outputs[d["_id"]]) for d in docs]}


@router.get("/{job_id}")
def get_job(job_id: str):
    doc = _get(job_id)
    return {"job": job_dto(doc, job_outputs(get_db(), [job_id])[job_id])}


@router.post("/{job_id}/cancel")
def cancel_job(job_id: str):
    job = _get(job_id)
    if job["status"] not in ("pending", "running"):
        raise http_error(409, M("not_running"))
    runner.cancel_job(job_id)
    return {"job": job_dto(_get(job_id))}


@router.post("/{job_id}/resume")
def resume_job(job_id: str):
    _check_disk()
    db = get_db()
    query: dict = {"_id": job_id, "status": {"$in": ["interrupted", "failed", "cancelled"]}}
    current = db.discovery_jobs.find_one({"_id": job_id}, {"status": 1, "checkpoint": 1})
    if current and current.get("status") == "completed" and failed_segments(current):
        # A completed job with failed clips: resuming processes only those (finished ones are skipped)
        query = {"_id": job_id, "status": "completed"}
    job = db.discovery_jobs.find_one_and_update(
        query,
        {"$set": {"status": "pending", "finished_at": None, "activity": None}},
        return_document=True,
    )
    if not job:
        _get(job_id)
        raise http_error(409, M("not_resumable"))
    events.publish({"type": "job.status", "id": job_id, "campaign_ids": job.get("campaign_ids") or [], "status": "pending",
                    **recut_event(job)})
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
