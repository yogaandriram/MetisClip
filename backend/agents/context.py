"""Per-job runtime context shared by the pipeline nodes."""
from __future__ import annotations

import logging
import threading
from pathlib import Path
from typing import Any

from backend.core import events
from backend.core.db import get_db, utcnow
from backend.core.paths import get_paths
from backend.core.procs import CancelToken

logger = logging.getLogger(__name__)


class PipelineError(RuntimeError):
    """Expected, user-facing pipeline failure (message in Bahasa Indonesia)."""


class JobContext:
    def __init__(self, job: dict[str, Any], cancel: CancelToken):
        self.job = job
        self.id: str = job["_id"]
        self.agent_id: str | None = job.get("agent_id")
        self.cancel = cancel
        self.agent = get_db().super_agents.find_one({"_id": self.agent_id}) if self.agent_id else None
        self.cache_dir: Path = get_paths().job_cache(self.id)
        self._lock = threading.Lock()

    # -- helpers -----------------------------------------------------------------

    @property
    def config(self) -> dict[str, Any]:
        return self.job.get("config") or {}

    @property
    def source(self) -> dict[str, Any]:
        return self.job.get("source") or {}

    @property
    def agent_slug(self) -> str:
        return (self.agent or {}).get("slug") or "_tanpa-agent"

    @property
    def timezone(self) -> str:
        return (self.agent or {}).get("timezone") or "Asia/Jakarta"

    def check(self) -> None:
        self.cancel.check()

    def _publish_progress(self, message: str | None = None) -> None:
        doc = get_db().discovery_jobs.find_one(
            {"_id": self.id},
            {"status": 1, "current_step": 1, "progress_pct": 1, "total_scenes": 1, "processed_scenes": 1},
        )
        if not doc:
            return
        evt = {
            "type": "job.progress",
            "id": self.id,
            "agent_id": self.agent_id,
            "status": doc.get("status"),
            "current_step": doc.get("current_step"),
            "progress_pct": round(float(doc.get("progress_pct", 0)), 1),
            "total_scenes": doc.get("total_scenes", 0),
            "processed_scenes": doc.get("processed_scenes", 0),
        }
        if message:
            evt["message"] = message
        events.publish(evt)

    def progress(
        self,
        pct: float | None = None,
        *,
        step: str | None = None,
        message: str | None = None,
        inc_processed: int = 0,
        total_scenes: int | None = None,
    ) -> None:
        sets: dict[str, Any] = {}
        if pct is not None:
            sets["progress_pct"] = round(max(0.0, min(100.0, pct)), 2)
        if step:
            sets["current_step"] = step
        if total_scenes is not None:
            sets["total_scenes"] = int(total_scenes)
        update: dict[str, Any] = {}
        if sets:
            update["$set"] = sets
        if inc_processed:
            update["$inc"] = {"processed_scenes": inc_processed}
        with self._lock:
            if update:
                get_db().discovery_jobs.update_one({"_id": self.id}, update)
            self._publish_progress(message)

    def error(self, step: str, message: str) -> None:
        logger.warning("[job %s] %s: %s", self.id, step, message)
        get_db().discovery_jobs.update_one(
            {"_id": self.id},
            {"$push": {"errors": {"$each": [{"step": step, "message": message[:1000], "at": utcnow()}], "$slice": -50}}},
        )
        self._publish_progress(message)

    def checkpoint(self, **fields: Any) -> None:
        get_db().discovery_jobs.update_one(
            {"_id": self.id}, {"$set": {f"checkpoint.{k}": v for k, v in fields.items()}}
        )
        ck = self.job.setdefault("checkpoint", {})
        ck.update(fields)

    def mark_segment_done(self, segment_id: str) -> None:
        with self._lock:
            get_db().discovery_jobs.update_one({"_id": self.id}, {"$addToSet": {"checkpoint.done_segment_ids": segment_id}})
