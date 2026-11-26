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
from backend.core import i18n

M = i18n.messages({
    "closed_while_running": {
        "id": "Aplikasi ditutup saat job berjalan. Klik Lanjutkan untuk melanjutkan.",
        "en": "The app was closed while the job was running. Click Resume to continue.",
    },
    "render_closed": {
        "id": "Render terhenti karena aplikasi ditutup",
        "en": "The render stopped because the app was closed",
    },
    "restored_while_running": {
        "id": "Job ini sedang berjalan saat backup dibuat. Klik Lanjutkan untuk meneruskannya.",
        "en": "This job was running when the backup was made. Click Resume to continue it.",
    },
    "render_restored": {
        "id": "Render ini sedang berjalan saat backup dibuat",
        "en": "This render was running when the backup was made",
    },
})

logger = logging.getLogger(__name__)

MAX_RENDER_CONCURRENCY = 4  # the settings' upper bound (core/settings_store.py)
GATE_RECHECK_S = 2.0  # a waiting render re-reads render.concurrency this often


def render_limit() -> int:
    """render.concurrency as it is set now, so a change in Pengaturan applies without a restart."""
    try:
        from backend.core.settings_store import get_settings

        return max(1, min(MAX_RENDER_CONCURRENCY, int(get_settings()["render"]["concurrency"])))
    except Exception:  # noqa: BLE001 - the database being briefly unreachable must not stop renders
        return 1


class JobRunner:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._tokens: dict[str, CancelToken] = {}
        self._render_tokens: dict[str, CancelToken] = {}
        self._pipeline: ThreadPoolExecutor | None = None
        self._render: ThreadPoolExecutor | None = None
        self._stopping = False
        # Renders start in the order they were queued, at most render_limit() at once
        self._gate = threading.Condition()
        self._render_queue: list[int] = []
        self._render_active = 0
        self._next_ticket = 0

    # -- lifecycle -------------------------------------------------------------

    def start(self) -> None:
        self._pipeline = ThreadPoolExecutor(max_workers=1, thread_name_prefix="pipeline")
        # Threads for the most renders the settings allow; the gate holds them to render.concurrency
        self._render = ThreadPoolExecutor(max_workers=MAX_RENDER_CONCURRENCY, thread_name_prefix="render")
        self._recover()

    def _recover(self) -> None:
        """After a restart/crash: running -> interrupted, re-queue pending, fail stale renders."""
        settle(M("closed_while_running"), M("render_closed"))
        for job in get_db().discovery_jobs.find({"status": "pending"}, {"_id": 1}).sort("created_at", 1):
            self.submit_job(job["_id"])

    def shutdown(self, timeout: float = 5.0) -> None:
        self._stopping = True
        with self._lock:
            tokens = list(self._tokens.values()) + list(self._render_tokens.values())
        for t in tokens:
            t.cancel("shutdown")
        self._wake_renders()
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
            job = db.discovery_jobs.find_one({"_id": job_id}, {"campaign_ids": 1})
            events.publish({"type": "job.status", "id": job_id, "campaign_ids": (job or {}).get("campaign_ids") or [], "status": "cancelled"})
        with self._lock:
            token = self._tokens.get(job_id)
        if token:
            token.cancel("cancelled")

    def is_running(self, job_id: str) -> bool:
        with self._lock:
            return job_id in self._tokens

    # -- renders -------------------------------------------------------------------

    def submit_render(self, render_id: str) -> None:
        if self._stopping or self._render is None:
            return
        token = CancelToken()
        with self._lock:
            self._render_tokens[render_id] = token
        self._render.submit(self._run_render, render_id, token)

    def _wait_for_render_slot(self, token: CancelToken) -> bool:
        """Waits until this render is the oldest waiting one and fewer than render_limit() run. False when
        it was cancelled (or the engine stops) while waiting."""
        with self._gate:
            ticket = self._next_ticket
            self._next_ticket += 1
            self._render_queue.append(ticket)
            try:
                while not (token.cancelled or self._stopping):
                    if self._render_queue[0] == ticket and self._render_active < render_limit():
                        self._render_active += 1
                        return True
                    self._gate.wait(GATE_RECHECK_S)
                return False
            finally:
                self._render_queue.remove(ticket)
                self._gate.notify_all()

    def _run_render(self, render_id: str, token: CancelToken) -> None:
        try:
            if not self._wait_for_render_slot(token):
                return
            try:
                from backend.services.render import run_render

                run_render(render_id, token)
            finally:
                with self._gate:
                    self._render_active -= 1
                    self._gate.notify_all()
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
            self._wake_renders()

    def _wake_renders(self) -> None:
        """Renders waiting for a slot look again now (one was cancelled, or the engine stops)."""
        with self._gate:
            self._gate.notify_all()


def settle(job_message: str, render_message: str, pending: bool = False) -> None:
    """
    Nothing of this database runs in this process: running jobs (and pending ones with `pending`)
    become interrupted (resumable), queued or running renders fail, and a brief reading or template
    design that was running is marked as failed.
    """
    db = get_db()
    now = utcnow()
    statuses = ["running", "pending"] if pending else ["running"]
    res = db.discovery_jobs.update_many(
        {"status": {"$in": statuses}},
        {"$set": {"status": "interrupted", "finished_at": now, "activity": None},
         "$push": {"errors": {"$each": [{"step": "system", "message": job_message, "at": now}], "$slice": -50}}},
    )
    if res.modified_count:
        logger.info("Marked %s job(s) as interrupted", res.modified_count)
    stale = list(db.render_jobs.find({"status": {"$in": ["queued", "rendering"]}}, {"clip_id": 1}))
    for r in stale:
        db.render_jobs.update_one(
            {"_id": r["_id"]},
            {"$set": {"status": "failed", "error": render_message, "finished_at": now}},
        )
        _restore_clip_status(r["clip_id"])
    from backend.services import campaigns

    campaigns.recover()
    from backend.services import brand_templates

    brand_templates.recover()


def settle_restored() -> None:
    """After a backup was restored: its running and pending work did not survive."""
    settle(M("restored_while_running"), M("render_restored"), pending=True)


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
