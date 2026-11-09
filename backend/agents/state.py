"""Pipeline state shape (kept for the optional MCP interface).

The static pipeline itself keeps its state in the `discovery_jobs` document and
passes a JobContext between nodes (see agents/context.py). LangGraph is no
longer used.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, TypedDict


class PipelineState(TypedDict, total=False):
    job_id: str
    agent_id: Optional[str]
    youtube_url: Optional[str]
    clip_duration: str  # '30-45' | '45-60' | '60-75' | '75-90'
    max_clips: int
    source_videos: List[Dict[str, Any]]
    viral_segments: List[Dict[str, Any]]
    processed_clips: List[Dict[str, Any]]
    current_step: str
    errors: List[str]
    progress_pct: float
