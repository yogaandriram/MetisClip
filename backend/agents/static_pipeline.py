"""Static pipeline: Discovery -> Analyzer (+Critic) -> Processor.

Sequential and deterministic; checkpoints after every node and every clip, so
`POST /api/jobs/{id}/resume` skips completed work. Cancel/shutdown is checked
between units of work and kills running child processes.
"""
from __future__ import annotations

import logging
import shutil

from backend.agents.context import JobContext, PipelineError
from backend.agents.nodes import analyzer, discovery, processor
from backend.core import events, llm
from backend.core.db import get_db, utcnow
from backend.core.procs import Cancelled, CancelToken
from backend.core import i18n

M = i18n.messages({
    "no_videos": {
        "id": "Tidak ada video sumber",
        "en": "No source video",
    },
    "no_segments": {
        "id": "Tidak ditemukan segmen yang cukup menarik untuk dijadikan klip",
        "en": "No segment was interesting enough to become a clip",
    },
    "partial": {
        "id": "{failed} dari {total} klip gagal diproses",
        "en": "{failed} of {total} clips failed to process",
    },
    "unexpected": {
        "id": "Terjadi kesalahan tak terduga: {error}",
        "en": "An unexpected error occurred: {error}",
    },
})

logger = logging.getLogger(__name__)


def _finish(job_id: str, campaign_ids: list[str], status: str, error: str | None = None, step: str = "system") -> None:
    db = get_db()
    update: dict = {"$set": {"status": status, "finished_at": utcnow()}}
    if status == "completed":
        update["$set"]["progress_pct"] = 100.0
    if error:
        update["$push"] = {"errors": {"$each": [{"step": step, "message": error[:1000], "at": utcnow()}], "$slice": -50}}
    db.discovery_jobs.update_one({"_id": job_id}, update)
    events.publish({"type": "job.status", "id": job_id, "campaign_ids": campaign_ids, "status": status, "error": error})


def run_job(job_id: str, cancel: CancelToken) -> None:
    db = get_db()
    job = db.discovery_jobs.find_one_and_update(
        {"_id": job_id, "status": "pending"},
        {"$set": {"status": "running", "started_at": utcnow(), "finished_at": None, "activity": None}},
        return_document=True,
    )
    if not job:
        logger.info("Job %s is no longer pending; skipping", job_id)
        return
    ctx = JobContext(job, cancel)
    events.publish({"type": "job.status", "id": job_id, "campaign_ids": ctx.campaign_ids, "status": "running"})
    logger.info("Job %s started (%s)", job_id, job["source"].get("type"))
    step = job.get("current_step") or "discovery"
    try:
        ck = job.get("checkpoint") or {}

        step = "discovery"
        if ck.get("discovery_done"):
            videos = list(db.source_videos.find({"job_id": job_id}))
        else:
            videos = discovery.run(ctx)
            ctx.checkpoint(discovery_done=True)
        if not videos:
            raise PipelineError(M("no_videos"))
        ctx.check()

        step = "analysis"
        if ck.get("analysis_done"):
            segments = ck.get("segments") or []
        else:
            segments = analyzer.run(ctx, videos)
            ctx.checkpoint(analysis_done=True, segments=segments)
        if not segments:
            raise PipelineError(M("no_segments"))
        ctx.check()

        step = "processing"
        clips = processor.run(ctx, segments)
        ctx.check()

        partial = len(clips) < len(segments)
        _finish(job_id, ctx.campaign_ids, "completed",
                M("partial", failed=len(segments) - len(clips), total=len(segments)) if partial else None, "processing")
        logger.info("Job %s completed: %s clip(s)", job_id, len(clips))
    except Cancelled:
        status = "interrupted" if cancel.reason == "shutdown" else "cancelled"
        _finish(job_id, ctx.campaign_ids, status)
        logger.info("Job %s %s", job_id, status)
    except (PipelineError, llm.LLMError) as exc:
        _finish(job_id, ctx.campaign_ids, "failed", str(exc), step)
        logger.warning("Job %s failed at %s: %s", job_id, step, exc)
    except Exception as exc:
        logger.exception("Job %s crashed at %s", job_id, step)
        _finish(job_id, ctx.campaign_ids, "failed", M("unexpected", error=exc), step)
    finally:
        shutil.rmtree(ctx.cache_dir, ignore_errors=True)
