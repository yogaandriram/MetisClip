"""Pydantic document models, one per collection (CLAUDE.md rule 18).

Every insert goes through `<Model>(...).to_mongo()` so documents are validated
before they are written. Partial updates use `$set` on known fields only.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

JobStatus = Literal["pending", "running", "interrupted", "cancelled", "completed", "failed"]
JobStep = Literal["discovery", "analysis", "processing"]
ClipStatus = Literal["processing", "ready", "rendering", "exported", "failed"]
RenderStatus = Literal["queued", "rendering", "completed", "failed", "cancelled"]
DURATIONS = ("30-45", "45-60", "60-75", "75-90")


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Doc(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    id: str = Field(alias="_id")

    def to_mongo(self) -> dict[str, Any]:
        data = self.model_dump(by_alias=True)
        return data


class BrandTemplateDoc(Doc):
    """A named brand template in the shared library (collection `brand_templates`)."""

    name: str = Field(min_length=1, max_length=80)
    brand_settings: dict[str, Any] = Field(default_factory=dict)
    caption_settings: dict[str, Any] = Field(default_factory=lambda: {"mode": "popshadow"})
    layout_settings: dict[str, Any] = Field(default_factory=dict)
    ai_settings: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class AgentDoc(Doc):
    name: str = Field(min_length=1, max_length=80)
    slug: str
    niche: Optional[str] = None
    default_duration: str = "45-60"
    default_keywords: list[str] = Field(default_factory=list)
    default_video_types: list[str] = Field(default_factory=lambda: ["podcast"])
    timezone: str = "Asia/Jakarta"
    # Template used by this agent's new clips (brand_templates._id)
    default_brand_template_id: Optional[str] = None
    created_at: datetime = Field(default_factory=_now)

    @field_validator("default_duration")
    @classmethod
    def _dur(cls, v: str) -> str:
        return v if v in DURATIONS else "45-60"


class JobSource(BaseModel):
    type: Literal["keyword", "url", "local_file"]
    keywords: list[str] = Field(default_factory=list)
    youtube_url: Optional[str] = None
    local_file_path: Optional[str] = None


class JobConfig(BaseModel):
    video_types: list[str] = Field(default_factory=lambda: ["podcast"])
    min_duration_minutes: int = 30
    min_views: int = 0
    clip_duration: str = "45-60"
    # Total number of clips for the job (0 = unlimited); also the per-video early-stop limit
    max_clips: int = 3
    max_clips_per_video: int = 3


class JobCheckpoint(BaseModel):
    discovery_done: bool = False
    analysis_done: bool = False
    segments: list[dict[str, Any]] = Field(default_factory=list)
    done_segment_ids: list[str] = Field(default_factory=list)


class JobDoc(Doc):
    agent_id: Optional[str]
    source: JobSource
    config: JobConfig
    status: JobStatus = "pending"
    current_step: Optional[JobStep] = None
    progress_pct: float = 0.0
    total_scenes: int = 0
    processed_scenes: int = 0
    checkpoint: JobCheckpoint = Field(default_factory=JobCheckpoint)
    errors: list[dict[str, Any]] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=_now)
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None


class SourceVideoDoc(Doc):
    job_id: str
    agent_id: Optional[str]
    youtube_id: str
    title: str = ""
    channel_name: str = ""
    duration_seconds: float = 0
    view_count: int = 0
    like_count: int = 0
    video_type: str = "podcast"
    quality_score: float = 0
    status: Literal["pending", "analyzing", "completed", "failed"] = "pending"
    created_at: datetime = Field(default_factory=_now)


class TranscriptDoc(Doc):
    source: Literal["youtube", "whisper", "mock"]
    language: Optional[str] = None
    segments: list[dict[str, Any]]
    fetched_at: datetime = Field(default_factory=_now)


class ClipFiles(BaseModel):
    raw: Optional[str] = None
    final: Optional[str] = None
    thumbnail: Optional[str] = None


class ClipDoc(Doc):
    agent_id: Optional[str]
    job_id: Optional[str]
    source_video_id: Optional[str]
    youtube_id: Optional[str]
    start_time: float
    end_time: float
    duration_seconds: float
    viral_score: float = 0
    hook_text: str = ""
    tags: list[str] = Field(default_factory=list)
    rationale: str = ""
    files: ClipFiles = Field(default_factory=ClipFiles)
    subtitle: dict[str, Any] = Field(default_factory=lambda: {"words": []})
    subtitle_style: dict[str, Any] = Field(default_factory=dict)
    # Brand template of this clip (set from the agent's default at creation, switchable in the editor)
    brand_template_id: Optional[str] = None
    status: ClipStatus = "processing"
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class RenderJobDoc(Doc):
    clip_id: str
    status: RenderStatus = "queued"
    progress_pct: float = 0.0
    output_path: Optional[str] = None
    error: Optional[str] = None
    created_at: datetime = Field(default_factory=_now)
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
