"""Dashboard numbers (replaces the old Next.js /api/dashboard/stats route)."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter

from backend.core.db import get_db

router = APIRouter(tags=["dashboard"])


@router.get("/api/dashboard/stats")
def dashboard_stats(campaign_id: Optional[str] = None):
    """Numbers for Beranda: one campaign's, or all of them."""
    db = get_db()
    videos = db.discovery_jobs.count_documents({"campaign_ids": campaign_id} if campaign_id else {})
    scope = {"campaign_id": campaign_id} if campaign_id else {}
    clips = db.clips.count_documents(scope)
    ready = db.clips.count_documents({**scope, "status": "ready"})
    return {"videosProcessed": videos, "clipsGenerated": clips, "clipsReady": ready, "potentialViews": clips * 1250,
            "firstSteps": first_steps(db)}


def first_steps(db) -> dict[str, bool]:
    """Beranda's first-steps guide (gap analysis B11), over every campaign: has a job been started, has a clip
    been made, has a clip been exported (a render finished, also of a clip deleted since)."""
    return {
        "job": db.discovery_jobs.find_one({}, {"_id": 1}) is not None,
        "clip": db.clips.find_one({}, {"_id": 1}) is not None,
        "export": db.render_jobs.find_one({"status": "completed"}, {"_id": 1}) is not None,
    }
