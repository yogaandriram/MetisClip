"""Pydantic document models, one per collection.

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
# A job (or a campaign brief) may ask for any range inside these limits, e.g. "15-30"
CUSTOM_DURATION_MIN = 10.0
CUSTOM_DURATION_MAX = 180.0
CUSTOM_DURATION_SPAN = 5.0


def _now() -> datetime:
    return datetime.now(timezone.utc)


def duration_range(value: str) -> tuple[float, float] | None:
    """(lo, hi) of a clip duration "lo-hi": one of DURATIONS or a custom range within the limits."""
    try:
        lo, hi = (float(x) for x in str(value).split("-", 1))
    except (TypeError, ValueError):
        return None
    if str(value) in DURATIONS:
        return lo, hi
    if CUSTOM_DURATION_MIN <= lo and hi <= CUSTOM_DURATION_MAX and hi - lo >= CUSTOM_DURATION_SPAN:
        return lo, hi
    return None


def format_duration(lo: float, hi: float) -> str:
    return f"{lo:g}-{hi:g}"


class Doc(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    id: str = Field(alias="_id")

    def to_mongo(self) -> dict[str, Any]:
        data = self.model_dump(by_alias=True)
        return data


class BrandTemplateDoc(Doc):
    """A named brand template of one campaign (collection `brand_templates`, services/brand_templates.py)."""

    name: str = Field(min_length=1, max_length=80)
    # The campaign it belongs to (null only for a template migration 011 could not place: no campaign yet)
    campaign_id: Optional[str] = None
    brand_settings: dict[str, Any] = Field(default_factory=dict)
    caption_settings: dict[str, Any] = Field(default_factory=lambda: {"mode": "popshadow"})
    layout_settings: dict[str, Any] = Field(default_factory=dict)
    ai_settings: dict[str, Any] = Field(default_factory=dict)
    # How it was made: the AI design's status, reasons and notes (services/brand_templates.py)
    design: Optional[dict[str, Any]] = None
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)




# ---------------------------------------------------------------- campaign briefs

CampaignStatus = Literal["active", "archived"]
RuleType = Literal["must", "must_not", "prefer"]
# Where a rule applies: choosing moments (Analyzer), the look of the video (Brand Template), the post text,
# or something only the user can check (account, posting schedule…)
RuleStage = Literal["selection", "visual", "post", "manual"]
Requirement = Literal["required", "optional", "forbidden"]
SourceKind = Literal["text", "file", "image"]

LIST_MAX = 40
ITEM_MAX = 300
TEXT_MAX = 4000


def _clean_items(value: Any, *, max_items: int = LIST_MAX, max_len: int = ITEM_MAX) -> list[str]:
    """Strings of a list: trimmed, single-spaced, without empties or duplicates (case-insensitive)."""
    if value is None:
        return []
    if isinstance(value, str):
        value = [value]
    out: list[str] = []
    seen: set[str] = set()
    for item in value if isinstance(value, (list, tuple)) else []:
        text = " ".join(str(item).split())[:max_len] if item is not None else ""
        if text and text.lower() not in seen:
            seen.add(text.lower())
            out.append(text)
        if len(out) >= max_items:
            break
    return out


def _clean_text(value: Any, max_len: int = TEXT_MAX) -> str:
    return str(value).strip()[:max_len] if value is not None else ""


def _tag(value: str, prefix: str) -> str:
    """'#Brand X' -> '#BrandX', 'brand' -> '@brand' (hashtags and handles have no spaces)."""
    core = "".join(value.split()).lstrip("#@")
    return f"{prefix}{core}" if core else ""


class _Lenient(BaseModel):
    """Brief parts accept what an LLM or an older version wrote: unknown keys are dropped and
    every field falls back to its default instead of failing the whole brief."""

    model_config = ConfigDict(extra="ignore")


class BriefRule(_Lenient):
    id: str = Field(default="", max_length=40)
    text: str = Field(min_length=1, max_length=600)
    type: RuleType = "must"
    stage: RuleStage = "selection"
    # Where the brief says so, e.g. "brief.pdf p. 2" (shown next to the rule)
    source: str = Field(default="", max_length=160)

    @field_validator("text", mode="before")
    @classmethod
    def _text(cls, v: Any) -> str:
        return " ".join(str(v or "").split())[:600]

    @field_validator("source", mode="before")
    @classmethod
    def _source(cls, v: Any) -> str:
        return _clean_text(v, 160)

    @field_validator("type", mode="before")
    @classmethod
    def _type(cls, v: Any) -> str:
        return v if v in ("must", "must_not", "prefer") else "must"

    @field_validator("stage", mode="before")
    @classmethod
    def _stage(cls, v: Any) -> str:
        return v if v in ("selection", "visual", "post", "manual") else "manual"


class BriefDuration(_Lenient):
    min: Optional[float] = None
    max: Optional[float] = None

    @field_validator("min", "max", mode="before")
    @classmethod
    def _seconds(cls, v: Any) -> Optional[float]:
        try:
            f = float(v)
        except (TypeError, ValueError):
            return None
        return round(f, 1) if 1 <= f <= 3600 else None


class BriefVisual(_Lenient):
    subtitles: Requirement = "optional"
    logo: Requirement = "optional"
    credit: Requirement = "optional"
    notes: list[str] = Field(default_factory=list)

    @field_validator("subtitles", "logo", "credit", mode="before")
    @classmethod
    def _req(cls, v: Any) -> str:
        return v if v in ("required", "optional", "forbidden") else "optional"

    @field_validator("notes", mode="before")
    @classmethod
    def _notes(cls, v: Any) -> list[str]:
        return _clean_items(v)


class BriefPost(_Lenient):
    hashtags: list[str] = Field(default_factory=list)
    mentions: list[str] = Field(default_factory=list)
    cta: str = ""
    # Paid-partnership label the post must carry, e.g. "#ad" or "Paid partnership"
    disclosure: str = ""
    caption_rules: list[str] = Field(default_factory=list)

    @field_validator("hashtags", mode="before")
    @classmethod
    def _hashtags(cls, v: Any) -> list[str]:
        return _clean_items([_tag(x, "#") for x in _clean_items(v, max_len=80)], max_len=80)

    @field_validator("mentions", mode="before")
    @classmethod
    def _mentions(cls, v: Any) -> list[str]:
        return _clean_items([_tag(x, "@") for x in _clean_items(v, max_len=80)], max_len=80)

    @field_validator("cta", "disclosure", mode="before")
    @classmethod
    def _short(cls, v: Any) -> str:
        return _clean_text(v, 300)

    @field_validator("caption_rules", mode="before")
    @classmethod
    def _rules(cls, v: Any) -> list[str]:
        return _clean_items(v)


class Brief(_Lenient):
    """What a campaign asks for, in a shape the pipeline can act on. Typed fields cover what the app
    checks or uses itself; anything else is a rule with a type and a stage, so no requirement is lost."""

    summary: str = ""
    platforms: list[str] = Field(default_factory=list)
    deadline: Optional[str] = None                      # YYYY-MM-DD
    allowed_sources: list[str] = Field(default_factory=list)
    focus: list[str] = Field(default_factory=list)      # topics / moments to look for (judged by the LLM)
    must_include: list[str] = Field(default_factory=list)  # words or names that must be heard in the clip
    banned_words: list[str] = Field(default_factory=list)  # words that must not be heard
    avoid: list[str] = Field(default_factory=list)      # topics to stay away from (judged by the LLM)
    tone: str = ""
    audience: str = ""
    language: str = ""
    duration: BriefDuration = Field(default_factory=BriefDuration)
    clips_target: int = 0                               # clips the campaign wants in total (0 = no target)
    max_per_video: int = 0                              # clips per source video (0 = no limit)
    visual: BriefVisual = Field(default_factory=BriefVisual)
    post: BriefPost = Field(default_factory=BriefPost)
    rules: list[BriefRule] = Field(default_factory=list)
    payout: str = ""                                    # information only
    submission: str = ""                                # information only
    questions: list[str] = Field(default_factory=list)  # what the brief leaves unclear

    @field_validator("summary", "payout", "submission", mode="before")
    @classmethod
    def _long(cls, v: Any) -> str:
        return _clean_text(v)

    @field_validator("tone", "audience", "language", mode="before")
    @classmethod
    def _short(cls, v: Any) -> str:
        return _clean_text(v, 300)

    @field_validator("platforms", "allowed_sources", "focus", "must_include", "banned_words", "avoid",
                     "questions", mode="before")
    @classmethod
    def _items(cls, v: Any) -> list[str]:
        return _clean_items(v)

    @field_validator("deadline", mode="before")
    @classmethod
    def _deadline(cls, v: Any) -> Optional[str]:
        text = str(v or "").strip()[:10]
        try:
            return datetime.strptime(text, "%Y-%m-%d").date().isoformat() if text else None
        except ValueError:
            return None

    @field_validator("clips_target", "max_per_video", mode="before")
    @classmethod
    def _count(cls, v: Any) -> int:
        try:
            return max(0, min(10000, int(float(v))))
        except (TypeError, ValueError):
            return 0

    @field_validator("duration", "visual", "post", mode="before")
    @classmethod
    def _section(cls, v: Any) -> Any:
        return v if isinstance(v, dict) else {}

    @field_validator("rules", mode="before")
    @classmethod
    def _rules(cls, v: Any) -> list[Any]:
        items = [dict(r) for r in (v if isinstance(v, list) else [])
                 if isinstance(r, dict) and str(r.get("text") or "").strip()][:60]
        seen: set[str] = set()
        for n, r in enumerate(items, 1):  # stable, unique ids: manual checks are stored per rule id
            rid = "".join(ch for ch in str(r.get("id") or "") if ch.isalnum() or ch in "-_")[:40] or f"r{n}"
            while rid in seen:
                rid = f"{rid}-{n}"
            seen.add(rid)
            r["id"] = rid
        return items


def clean_brief(raw: Any) -> dict[str, Any]:
    """A stored brief: any dict (LLM output, form data, older version) -> the current Brief shape."""
    return Brief.model_validate(raw if isinstance(raw, dict) else {}).model_dump()


class CampaignSourceDoc(BaseModel):
    """One piece of the brief as the user gave it: typed text, a document or an image."""

    model_config = ConfigDict(extra="forbid")

    id: str
    kind: SourceKind
    name: str = Field(min_length=1, max_length=160)
    path: Optional[str] = None          # relative to DATA_ROOT (library/_campaigns/<id>/…)
    mime: Optional[str] = None
    size: int = 0
    text: str = ""                      # typed text, or the text read from the file
    pages: int = 0                      # PDF pages
    images: list[str] = Field(default_factory=list)  # scanned PDF pages rendered to PNG (relative paths)
    added_at: datetime = Field(default_factory=_now)


class CampaignDoc(Doc):
    """A campaign (collection `campaigns`): the container of everything the app makes. Every job follows
    one or more campaigns and every clip belongs to one. A campaign with an empty brief is a plain one
    (e.g. the user's own channel): its clips are chosen by viral score only."""

    name: str = Field(min_length=1, max_length=80)
    client: str = Field(default="", max_length=80)
    status: CampaignStatus = "active"
    # Library folder of its clips: <DATA_ROOT>/library/<slug>/<clip id>/ (kept when the campaign is renamed)
    slug: str = ""
    # Its default brand template (one of its own templates, brand_templates.campaign_id)
    brand_template_id: Optional[str] = None
    sources: list[dict[str, Any]] = Field(default_factory=list)
    brief: dict[str, Any] = Field(default_factory=lambda: clean_brief({}))
    # The last "understand the brief" result, until the user saves or discards it
    draft: Optional[dict[str, Any]] = None
    # {status: idle|running|done|failed, message, provider, model, used_ocr, at}
    parse: dict[str, Any] = Field(default_factory=lambda: {"status": "idle"})
    version: int = 1
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class JobSource(BaseModel):
    type: Literal["url", "local_file"]
    youtube_url: Optional[str] = None
    local_file_path: Optional[str] = None


class JobConfig(BaseModel):
    clip_duration: str = "45-60"
    # Total number of clips for the job (0 = unlimited); also the per-video early-stop limit
    max_clips: int = 3
    max_clips_per_video: int = 3
    # The automatic layout by content for this job's clips: True/False sets it on each new clip
    # (layout_style.smart.enabled), None follows each campaign's brand template
    smart_layout: Optional[bool] = None
    # Moments the user chose ({start, end} in seconds of the video): the Analyzer is skipped and each
    # range becomes a clip for every campaign of the job (agents/nodes/manual.py)
    manual_ranges: list[dict[str, float]] = Field(default_factory=list)
    # Move user-chosen edges to the nearest sentence boundary in the clip's Whisper words
    snap_edges: bool = True
    # Cut an existing clip again at new edges: {clip_id, start, end}. Its files are replaced, its
    # style, template, title and edited words stay (agents/nodes/manual.py)
    recut: Optional[dict[str, Any]] = None


class JobCheckpoint(BaseModel):
    discovery_done: bool = False
    analysis_done: bool = False
    segments: list[dict[str, Any]] = Field(default_factory=list)
    done_segment_ids: list[str] = Field(default_factory=list)


class JobDoc(Doc):
    source: JobSource
    config: JobConfig
    status: JobStatus = "pending"
    current_step: Optional[JobStep] = None
    progress_pct: float = 0.0
    total_scenes: int = 0
    processed_scenes: int = 0
    checkpoint: JobCheckpoint = Field(default_factory=JobCheckpoint)
    errors: list[dict[str, Any]] = Field(default_factory=list)
    # What the running job does or waits for now: {message, at}, its last job.progress message
    # (agents/context.py); reset when the job starts or is resumed
    activity: Optional[dict[str, Any]] = None
    # Campaigns the clips are made for (at least one), and each one's brief as it was when the job was
    # created: {id, name, slug, version, brief, brand_template_id}. A later brief edit does not change a job.
    campaign_ids: list[str] = Field(default_factory=list)
    campaigns: list[dict[str, Any]] = Field(default_factory=list)
    # Extra instructions for this video only (added to every campaign's brief)
    note: str = Field(default="", max_length=2000)
    created_at: datetime = Field(default_factory=_now)
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None


class SourceVideoDoc(Doc):
    job_id: str
    # A YouTube video, or an uploaded file used in place (never copied)
    youtube_id: Optional[str] = None
    file_path: Optional[str] = None
    # sha256 of path, size and mtime: the transcript cache id ("file:<fingerprint>")
    file_fingerprint: Optional[str] = None
    title: str = ""
    channel_name: str = ""
    duration_seconds: float = 0
    view_count: int = 0
    like_count: int = 0
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
    # The clip in the source video's own ratio, same timeline as raw (podcast layout)
    source: Optional[str] = None
    # Face scan of source.mp4 (agents/tools/faces.py), for layouts that crop at render time (duo)
    faces: Optional[str] = None
    # The chosen cover frame taken from final.mp4 by the last render (exported as <video name>.jpg)
    cover: Optional[str] = None


class ClipDoc(Doc):
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
    # "ai": chosen and scored by the Analyzer; "manual": a moment the user chose (no score)
    origin: Literal["ai", "manual"] = "ai"
    files: ClipFiles = Field(default_factory=ClipFiles)
    # The cover the user chose, in seconds of raw.mp4 (None: the middle frame, and no cover is exported)
    cover_time: Optional[float] = None
    # What final.mp4 was rendered from (services/render.py): the fingerprint of its props, the kept
    # frames (to map a later cover to an output frame) and the cover it made. None: not rendered yet.
    final_render: Optional[dict[str, Any]] = None
    subtitle: dict[str, Any] = Field(default_factory=lambda: {"words": []})
    subtitle_style: dict[str, Any] = Field(default_factory=dict)
    # Per-clip override of the template's layout_settings (only changed keys; services/layout.py)
    layout_style: dict[str, Any] = Field(default_factory=dict)
    source_width: Optional[int] = None
    source_height: Optional[int] = None
    # Brand template of this clip (its campaign's at creation, switchable in the editor)
    brand_template_id: Optional[str] = None
    # The campaign the clip belongs to, how well it fits that brief (0-100, from the Analyzer; None for a
    # plain campaign) and why
    campaign_id: Optional[str] = None
    brief_fit: Optional[float] = None
    brief_reason: str = ""
    # Text for posting the clip: {title, caption, hashtags, mentions, disclosure} (agents/tools/post_copy_ai.py)
    post_copy: Optional[dict[str, Any]] = None
    # Brief rules only the user can check, ticked in the editor: {rule id: true}
    brief_manual: dict[str, bool] = Field(default_factory=dict)
    status: ClipStatus = "processing"
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class RenderJobDoc(Doc):
    clip_id: str
    status: RenderStatus = "queued"
    progress_pct: float = 0.0
    output_path: Optional[str] = None
    # Copy in the export folder, made when the render finishes (export_error: why it failed)
    exported_path: Optional[str] = None
    export_dir: Optional[str] = None
    export_error: Optional[str] = None
    # True when nothing changed since the last render: final.mp4 was copied again, not rendered
    reused: bool = False
    # The sound leveled to about -14 LUFS: {"before", "after"} in LUFS (None: left as it was)
    loudness: Optional[dict[str, float]] = None
    # The format ("vertical", "square", "landscape") and quality ("high", "standard", "small") it was made in
    format: Optional[str] = None
    quality: Optional[str] = None
    error: Optional[str] = None
    created_at: datetime = Field(default_factory=_now)
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
