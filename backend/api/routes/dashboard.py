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
    clips = db.clips.count_documents({"campaign_id": campaign_id} if campaign_id else {})
    return {"videosProcessed": videos, "clipsGenerated": clips, "potentialViews": clips * 1250}
