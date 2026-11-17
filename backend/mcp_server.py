"""Optional MCP interface (off by default on desktop).

Exposes the pipeline as MCP tools by talking to the running local engine over
HTTP, so job state always lives in MongoDB (no in-memory JOB_MEMORY).

    set METISCLIP_ENGINE_URL=http://127.0.0.1:<port>
    set METISCLIP_TOKEN=<engine token>
    python -m backend.mcp_server
"""
from __future__ import annotations

import os
from typing import Any, Optional

import requests
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("MetisClip")

BASE = os.environ.get("METISCLIP_ENGINE_URL", "http://127.0.0.1:8000").rstrip("/")
TOKEN = os.environ.get("METISCLIP_TOKEN", "dev-token")


def _call(method: str, path: str, **kw: Any) -> Any:
    r = requests.request(method, BASE + path, headers={"Authorization": f"Bearer {TOKEN}"}, timeout=60, **kw)
    if r.status_code >= 400:
        try:
            detail = r.json().get("detail")
        except Exception:
            detail = r.text
        raise RuntimeError(f"Engine error {r.status_code}: {detail}")
    return r.json()


@mcp.tool()
def list_campaigns() -> list:
    """List the campaigns (every job and clip belongs to one) with their brief summary."""
    return [{"id": c["id"], "name": c.get("name"), "client": c.get("client"), "status": c.get("status"),
             "summary": (c.get("brief") or {}).get("summary") or ""}
            for c in _call("GET", "/api/campaigns")["campaigns"]]


@mcp.tool()
def clip_youtube_video(campaign_ids: list[str], youtube_url: str, clip_duration: str = "45-60", max_clips: int = 3,
                       smart_layout: bool | None = None) -> dict:
    """Start a full pipeline job for a YouTube link (analyze -> clip) for 1-5 active campaigns. smart_layout
    turns the automatic layout by content on or off for its clips (None: follow the brand templates).
    Returns the job."""
    body = {
        "campaign_ids": campaign_ids,
        "youtube_url": youtube_url,
        "clip_duration": clip_duration,
        "max_clips": max_clips,
        "smart_layout": smart_layout,
    }
    return _call("POST", "/api/jobs", json=body)["job"]


@mcp.tool()
def clip_local_video(campaign_ids: list[str], file_path: str, clip_duration: str = "45-60", max_clips: int = 3,
                     smart_layout: bool | None = None) -> dict:
    """Start a full pipeline job for a video file on this PC (absolute path; used in place) for 1-5 active
    campaigns. smart_layout as in clip_youtube_video. Returns the job."""
    body = {"campaign_ids": campaign_ids, "local_file_path": file_path, "clip_duration": clip_duration,
            "max_clips": max_clips, "smart_layout": smart_layout}
    return _call("POST", "/api/jobs", json=body)["job"]


@mcp.tool()
def job_status(job_id: str) -> dict:
    """Progress, current step and errors of a job."""
    return _call("GET", f"/api/jobs/{job_id}")["job"]


@mcp.tool()
def list_clips(campaign_id: Optional[str] = None, job_id: Optional[str] = None) -> list:
    """Clips with hook text, viral score and status."""
    params = {k: v for k, v in {"campaign_id": campaign_id, "job_id": job_id}.items() if v}
    clips = _call("GET", "/api/clips", params=params)["clips"]
    for c in clips:
        c.pop("subtitle_data", None)
    return clips


@mcp.tool()
def render_clip(clip_id: str) -> dict:
    """Queue the final render (burned-in subtitles) of a clip."""
    return _call("POST", f"/api/clips/{clip_id}/render")["render_job"]


if __name__ == "__main__":
    mcp.run()
