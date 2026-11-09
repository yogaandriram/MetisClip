"""Persistent job queue: pipeline jobs (`discovery_jobs`) and renders (`render_jobs`).

State lives in MongoDB; this module only owns the worker threads and the cancel
tokens of work that is currently running in this process.
"""
from __future__ import annotations

import logging
import threading
from concurrent.futures import ThreadPoolExecutor

from backend.core import events
from backend.core.db import get_db, utcnow
from backend.core.procs import CancelToken

logger = logging.getLogger(__name__)


class JobRunner:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._tokens: dict[str, CancelToken] = {}
        self._render_tokens: dict[str, CancelToken] = {}
        self._pipeline: ThreadPoolExecutor | None = None
        self._render: ThreadPoolExecutor | None = None
        self._stopping = False

    # -- lifecycle -------------------------------------------------------------

    def start(self, render_concurrency: int = 1) -> None:
        self._pipeline = ThreadPoolExecutor(max_workers=1, thread_name_prefix="pipeline")
        self._render = ThreadPoolExecutor(max_workers=max(1, render_concurrency), thread_name_prefix="render")
        self._recover()

    def _recover(self) -> None:
        """After a restart/crash: running -> interrupted, re-queue pending, fail stale renders."""
        db = get_db()
        now = utcnow()
        res = db.discovery_jobs.update_many(
            {"status": "running"},
            {"$set": {"status": "interrupted", "finished_at": now},
             "$push": {"errors": {"$each": [{"step": "system", "message": "Aplikasi ditutup saat job berjalan. Klik Lanjutkan untuk melanjutkan.", "at": now}], "$slice": -50}}},
        )
        if res.modified_count:
            logger.info("Marked %s running job(s) as interrupted", res.modified_count)
        stale = list(db.render_jobs.find({"status": {"$in": ["queued", "rendering"]}}, {"clip_id": 1}))
        for r in stale:
            db.render_jobs.update_one(
                {"_id": r["_id"]},
                {"$set": {"status": "failed", "error": "Render terhenti karena aplikasi ditutup", "finished_at": now}},
            )
            _restore_clip_status(r["clip_id"])
        for job in db.discovery_jobs.find({"status": "pending"}, {"_id": 1}).sort("created_at", 1):
            self.submit_job(job["_id"])

    def shutdown(self, timeout: float = 5.0) -> None:
        self._stopping = True
        with self._lock:
            tokens = list(self._tokens.values()) + list(self._render_tokens.values())
        for t in tokens:
            t.cancel("shutdown")
        threads = []
        for ex in (self._pipeline, self._render):
            if ex is not None:
                ex.shutdown(wait=False, cancel_futures=True)
                threads.extend(getattr(ex, "_threads", ()))
        deadline = timeout
        for th in threads:
            th.join(max(0.1, deadline))

    # -- pipeline jobs -----------------------------------------------------------

    def submit_job(self, job_id: str) -> None:
        if self._stopping or self._pipeline is None:
            return
        token = CancelToken()
        with self._lock:
            if job_id in self._tokens:
                return
            self._tokens[job_id] = token
        self._pipeline.submit(self._run_job, job_id, token)

    def _run_job(self, job_id: str, token: CancelToken) -> None:
        try:
            from backend.agents.static_pipeline import run_job

            run_job(job_id, token)
        except Exception:
            logger.exception("Pipeline crashed for job %s", job_id)
        finally:
            with self._lock:
                self._tokens.pop(job_id, None)

    def cancel_job(self, job_id: str) -> None:
        db = get_db()
        res = db.discovery_jobs.update_one(
            {"_id": job_id, "status": "pending"},
            {"$set": {"status": "cancelled", "finished_at": utcnow()}},
        )
        if res.modified_count:
            job = db.discovery_jobs.find_one({"_id": job_id}, {"agent_id": 1})
            events.publish({"type": "job.status", "id": job_id, "agent_id": (job or {}).get("agent_id"), "status": "cancelled"})
        with self._lock:
            token = self._tokens.get(job_id)
        if token:
            token.cancel("cancelled")

    def is_running(self, job_id: str) -> bool:
        with self._lock:
            return job_id in self._tokens

    def has_active_jobs(self) -> bool:
        """True while a pipeline job is queued in this process or running."""
        with self._lock:
            return bool(self._tokens)

    # -- renders -------------------------------------------------------------------

    def submit_render(self, render_id: str) -> None:
        if self._stopping or self._render is None:
            return
        token = CancelToken()
        with self._lock:
            self._render_tokens[render_id] = token
        self._render.submit(self._run_render, render_id, token)

    def _run_render(self, render_id: str, token: CancelToken) -> None:
        try:
            from backend.services.render import run_render

            run_render(render_id, token)
        except Exception:
            logger.exception("Render crashed for %s", render_id)
        finally:
            with self._lock:
                self._render_tokens.pop(render_id, None)

    def cancel_render(self, render_id: str) -> None:
        db = get_db()
        doc = db.render_jobs.find_one_and_update(
            {"_id": render_id, "status": "queued"},
            {"$set": {"status": "cancelled", "finished_at": utcnow()}},
        )
        if doc:
            _restore_clip_status(doc["clip_id"])
            events.publish({"type": "render.status", "id": render_id, "clip_id": doc["clip_id"], "status": "cancelled"})
        with self._lock:
            token = self._render_tokens.get(render_id)
        if token:
            token.cancel("cancelled")


def _restore_clip_status(clip_id: str) -> None:
    """A clip stuck in 'rendering' goes back to 'exported' if it has a final file, else 'ready'."""
    db = get_db()
    clip = db.clips.find_one({"_id": clip_id}, {"files": 1, "status": 1})
    if not clip or clip.get("status") != "rendering":
        return
    status = "exported" if (clip.get("files") or {}).get("final") else "ready"
    db.clips.update_one({"_id": clip_id, "status": "rendering"}, {"$set": {"status": status, "updated_at": utcnow()}})
    events.publish({"type": "clip.updated", "id": clip_id})


runner = JobRunner()
