"""Dashboard numbers (replaces the old Next.js /api/dashboard/stats route)."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter

from backend.core.db import get_db

router = APIRouter(tags=["dashboard"])


@router.get("/api/dashboard/stats")
def dashboard_stats(agent_id: Optional[str] = None):
    db = get_db()
    q = {"agent_id": agent_id} if agent_id else {}
    videos = db.discovery_jobs.count_documents(q)
    clips = db.clips.count_documents(q)
    return {"videosProcessed": videos, "clipsGenerated": clips, "potentialViews": clips * 1250}
