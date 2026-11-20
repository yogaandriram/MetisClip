"""Brand Template layout (frontend/lib/presets/layout.ts): validation, a clip's effective layout, the
clip's original-ratio video (`source.mp4`) that the podcast, card, duo and auto layouts show, the
clip's face scan (`faces.json`) that the duo and auto layouts pick their views and crops by, and the companion video of the split layout
(a Brand Template asset, normalized on import).

Layouts are stored as patches: a template's `layout_settings` (next to its preview-only `safeZone`)
and a clip's `layout_style` (only the keys the user changed in the editor). The effective layout is
template ⊕ clip, section by section; the renderer fills in the defaults. Keep the enums and limits
in sync with layout.ts.
"""
from __future__ import annotations

import logging
import re
import shutil
from pathlib import Path
from typing import Any, Callable

from backend.core import cache, procs
from backend.core.db import get_db, utcnow
from backend.core.paths import get_paths
from backend.core import i18n

M = i18n.messages({
    "unknown_value": {
        "id": "Nilai {where} tidak dikenal",
        "en": "Unknown value for {where}",
    },
    "not_number": {
        "id": "{where} harus berupa angka",
        "en": "{where} must be a number",
    },
    "not_bool": {
        "id": "{where} harus true/false",
        "en": "{where} must be true/false",
    },
    "not_color": {
        "id": "{where} harus warna hex (#RRGGBB)",
        "en": "{where} must be a hex color (#RRGGBB)",
    },
    "not_text": {
        "id": "{where} harus berupa teks",
        "en": "{where} must be text",
    },
    "not_asset": {
        "id": "{where} harus file dari Brand Template",
        "en": "{where} must be a Brand Template file",
    },
    "not_object": {
        "id": "Layout harus berupa objek",
        "en": "The layout must be an object",
    },
    "unknown_mode": {
        "id": "Mode layout tidak dikenal",
        "en": "Unknown layout mode",
    },
    "section_not_object": {
        "id": "layout {section} harus berupa objek",
        "en": "layout {section} must be an object",
    },
    "companion_none": {
        "id": "Layout video pendamping belum punya video. Unggah video pendamping di Brand Template → Layout.",
        "en": "The companion video layout has no video yet. Upload a companion video in Brand Template → Layout.",
    },
    "companion_missing": {
        "id": "File video pendamping tidak ditemukan di folder data. Unggah lagi di Brand Template → Layout.",
        "en": "The companion video file is not in the data folder. Upload it again in Brand Template → Layout.",
    },
    "companion_no_duration": {
        "id": "Durasi video pendamping tidak diketahui. Unggah lagi di Brand Template → Layout.",
        "en": "The companion video's length is unknown. Upload it again in Brand Template → Layout.",
    },
    "no_clip_file": {
        "id": "File klip tidak ada",
        "en": "The clip file is missing",
    },
    "bad_edges": {
        "id": "Batas waktu klip tidak valid",
        "en": "The clip's start and end times are invalid",
    },
    "preparing_source": {
        "id": "Menyiapkan video sumber…",
        "en": "Preparing the source video…",
    },
    "original_missing": {
        "id": "File video asli tidak ditemukan: {path}. Kembalikan file itu untuk memakai layout ini.",
        "en": "The original video file was not found: {path}. Put that file back to use this layout.",
    },
    "download_failed": {
        "id": "Video sumber gagal diunduh dari YouTube: {error}",
        "en": "The source video couldn't be downloaded from YouTube: {error}",
    },
    "no_source": {
        "id": "Klip ini tidak punya video sumber",
        "en": "This clip has no source video",
    },
    "source_missing": {
        "id": "Video sumber klip tidak ada",
        "en": "The clip's source video is missing",
    },
    "analyzing_faces": {
        "id": "Menganalisis wajah…",
        "en": "Analyzing faces…",
    },
    "faces_label": {
        "id": "Analisis wajah",
        "en": "Face analysis",
    },
    "faces_failed": {
        "id": "Analisis wajah gagal: {error}",
        "en": "Face analysis failed: {error}",
    },
    "mode:podcast": {"id": "podcast", "en": "podcast"},
    "mode:card": {"id": "kartu", "en": "card"},
    "mode:duo": {"id": "dua pembicara", "en": "two-speaker"},
    "mode:auto": {"id": "otomatis per adegan", "en": "per-scene automatic"},
    "mode:smart": {"id": "otomatis sesuai konten", "en": "content-based automatic"},
    "mode:other": {"id": "ini", "en": "this"},
})

logger = logging.getLogger(__name__)

MODES = ("full", "podcast", "card", "split", "duo", "auto")
SOURCE_MODES = ("podcast", "card", "duo", "auto")  # modes that show source.mp4
SCENE_MODES = ("duo", "auto")  # modes that pick a view per shot of the face scan
# Output format (OUTPUT_FORMATS in frontend/lib/presets/position.ts): 9:16 uses the mode,
# 1:1 and 16:9 show source.mp4 cropped per shot of the face scan whatever the mode
FORMATS = ("vertical", "square", "landscape")
FORMAT_LABELS = {"vertical": "9:16", "square": "1:1", "landscape": "16:9"}
SCENE_VIEWS = ("full", "duo", "framed")
FULL_OR_FRAMED = ("full", "framed")
RATIOS = ("source", "16:9", "4:3", "1:1", "4:5")
BACKGROUNDS = ("blur", "color", "gradient", "image")
HEADER_SOURCES = ("title", "custom")
ALIGNS = ("left", "center", "right")
ZOOM_STYLES = ("keywords", "sentences")
SPEAKER_ALIGNS = ("left", "center")
COMPANION_POSITIONS = ("bottom", "top")
DUO_TOPS = ("left", "right")
SAFE_ZONES = ("none", "all", "tiktok", "reels", "shorts")
# "Layout otomatis sesuai konten" (the `smart` section): the layout each kind of clip content may get,
# the first one being the default. Mirrors SMART_CHOICES in frontend/lib/presets/layout.ts.
SMART_CHOICES: dict[str, tuple[str, ...]] = {
    "speaker": ("full", "split", "podcast"),
    "duo": ("duo", "full", "podcast"),
    "screen": ("podcast", "card", "full"),
    "mixed": ("auto", "full", "podcast"),
}
CONTENT_KINDS = ("vertical", "speaker", "duo", "screen", "mixed")
DESIGN_HEIGHT = 533

_HEX = re.compile(r"^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$")

# section -> key -> (kind, spec): "enum" values | "num" (min, max) | "int" (min, max) | "color" | "bool"
# | "text" max length | "asset" (an asset://… path or "")
SCHEMA: dict[str, dict[str, tuple[str, Any]]] = {
    "frame": {
        "y": ("num", (0, DESIGN_HEIGHT - 60)),
        "ratio": ("enum", RATIOS),
        "margin": ("num", (0, 60)),
        "radius": ("num", (0, 40)),
        "focusX": ("num", (0, 1)),
    },
    "background": {
        "type": ("enum", BACKGROUNDS),
        "color": ("color", None),
        "color2": ("color", None),
        "imageUrl": ("asset", None),
        "blur": ("num", (0, 40)),
        "dim": ("num", (0, 0.9)),
    },
    "header": {
        "enabled": ("bool", None),
        "source": ("enum", HEADER_SOURCES),
        "text": ("text", 200),
        "fontFamily": ("text", 80),
        "fontWeight": ("text", 40),
        "fontSize": ("num", (16, 72)),
        "color": ("color", None),
        "boxColor": ("color_or_empty", None),
        "align": ("enum", ALIGNS),
        "isUppercase": ("bool", None),
        "gap": ("num", (0, 60)),
        "maxLines": ("int", (1, 4)),
    },
    "credit": {
        "enabled": ("bool", None),
        "text": ("text", 80),
        "fontSize": ("num", (10, 32)),
        "color": ("color", None),
    },
    "card": {
        "name": ("text", 60),
        "handle": ("text", 40),
        "avatarUrl": ("asset", None),
        "color": ("color", None),
        "textColor": ("color", None),
        "mutedColor": ("color", None),
        "margin": ("num", (0, 60)),
        "radius": ("num", (0, 40)),
    },
    "zoom": {
        "enabled": ("bool", None),
        "style": ("enum", ZOOM_STYLES),
        "amount": ("num", (0.05, 0.3)),
    },
    "speaker": {
        "enabled": ("bool", None),
        "name": ("text", 60),
        "role": ("text", 60),
        "fontFamily": ("text", 80),
        "fontSize": ("num", (14, 48)),
        "y": ("num", (0, DESIGN_HEIGHT - 30)),
        "align": ("enum", SPEAKER_ALIGNS),
        "start": ("num", (0, 30)),
        "duration": ("num", (1, 30)),
        "color": ("color", None),
        "textColor": ("color", None),
        "accent": ("color", None),
        "accentText": ("color", None),
    },
    "companion": {
        "videoUrl": ("asset", None),
        "duration": ("num", (0, 600)),
        "position": ("enum", COMPANION_POSITIONS),
        "split": ("num", (0.35, 0.65)),
        "focusY": ("num", (0, 1)),
        "divider": ("num", (0, 8)),
        "dividerColor": ("color", None),
    },
    "duo": {
        "top": ("enum", DUO_TOPS),
        "split": ("num", (0.35, 0.65)),
        "faceSize": ("num", (0.15, 0.5)),
        "divider": ("num", (0, 8)),
        "dividerColor": ("color", None),
    },
    # Layout per kind of clip content, when "Layout otomatis sesuai konten" is on (content_profile)
    "smart": {
        "enabled": ("bool", None),
        **{kind: ("enum", choices) for kind, choices in SMART_CHOICES.items()},
    },
    # The view for each kind of shot (auto mode); panels need two people
    "auto": {
        "solo": ("enum", FULL_OR_FRAMED),
        "duo": ("enum", SCENE_VIEWS),
        "group": ("enum", FULL_OR_FRAMED),
        "none": ("enum", FULL_OR_FRAMED),
    },
}


class LayoutError(ValueError):
    """An invalid layout value (message in the UI language)."""


def _value(section: str, key: str, value: Any) -> Any:
    kind, spec = SCHEMA[section][key]
    where = f"layout {section}.{key}"
    if kind == "enum":
        if value not in spec:
            raise LayoutError(M("unknown_value", where=where))
        return value
    if kind in ("num", "int"):
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise LayoutError(M("not_number", where=where))
        lo, hi = spec
        v = min(hi, max(lo, float(value)))
        return int(round(v)) if kind == "int" else round(v, 4)
    if kind == "bool":
        if not isinstance(value, bool):
            raise LayoutError(M("not_bool", where=where))
        return value
    if kind in ("color", "color_or_empty"):
        if kind == "color_or_empty" and value == "":
            return ""
        if not isinstance(value, str) or not _HEX.match(value):
            raise LayoutError(M("not_color", where=where))
        return value
    if kind == "text":
        if not isinstance(value, str):
            raise LayoutError(M("not_text", where=where))
        return value[:spec]
    if kind == "asset":
        if value == "" or (isinstance(value, str) and value.startswith("asset://") and ".." not in value):
            return value
        raise LayoutError(M("not_asset", where=where))
    raise AssertionError(kind)


def clean_layout(raw: Any, *, keep_safe_zone: bool = False) -> dict[str, Any]:
    """Validated layout patch: known keys only (unknown ones are dropped), numbers clamped.

    Raises LayoutError for a known key with a value of the wrong type. `keep_safe_zone`: a template's
    layout_settings also holds the preview-only safe-zone guide."""
    if raw is None:
        return {}
    if not isinstance(raw, dict):
        raise LayoutError(M("not_object"))
    out: dict[str, Any] = {}
    if "mode" in raw:
        if raw["mode"] not in MODES:
            raise LayoutError(M("unknown_mode"))
        out["mode"] = raw["mode"]
    if keep_safe_zone and raw.get("safeZone") in SAFE_ZONES:
        out["safeZone"] = raw["safeZone"]
    # The format is picked per clip: a template (keep_safe_zone) stays 9:16, its previews are 9:16
    if "format" in raw and not keep_safe_zone:
        if raw["format"] not in FORMATS:
            raise LayoutError(M("unknown_value", where="format"))
        out["format"] = raw["format"]
    for section, keys in SCHEMA.items():
        part = raw.get(section)
        if part is None:
            continue
        if not isinstance(part, dict):
            raise LayoutError(M("section_not_object", section=section))
        cleaned = {k: _value(section, k, part[k]) for k in keys if k in part}
        if cleaned:
            out[section] = cleaned
    return out


def merge(*patches: Any) -> dict[str, Any]:
    """Patch over patch, section by section (same as mergeLayout in layout.ts)."""
    out: dict[str, Any] = {}
    for p in patches:
        if not isinstance(p, dict):
            continue
        for key in ("mode", "format"):
            if key in p:
                out[key] = p[key]
        for section in SCHEMA:
            if isinstance(p.get(section), dict):
                out[section] = {**out.get(section, {}), **p[section]}
    return out


def effective_layout(clip: dict[str, Any] | None, bt: dict[str, Any] | None) -> dict[str, Any]:
    """Template layout ⊕ the clip's override (without the preview-only safeZone)."""
    tpl = dict((bt or {}).get("layout_settings") or {})
    tpl.pop("safeZone", None)
    return merge(tpl, (clip or {}).get("layout_style") or {})


# -- "Layout otomatis sesuai konten": one layout per clip, picked from what its shots show ------------

# A source this narrow (4:5 or taller) is already vertical: the 9:16 crop keeps nearly all of it
VERTICAL_MAX_ASPECT = 0.8
# Share of the clip without a person to crop to (slides, screen recordings, B-roll, crowds) from which
# the clip goes in a frame whole
SCREEN_MIN = 0.75
# The speaker and two-speaker layouts crop to faces: they allow this much of such shots at most
FACES_OTHER_MAX = 0.2
# Two people side by side for at least this share: the two-speaker layout (one person elsewhere is full)
DUO_MIN = 0.25
# Mirrors MIN_DUO_S in layout.ts: a shorter two-speaker shot is never split into panels, so it counts
# as a group here too
MIN_DUO_S = 0.8

_UNSET: Any = object()


def content_profile(clip: dict[str, Any], scenes: Any = _UNSET) -> dict[str, Any] | None:
    """What the clip shows, for the smart layout: {kind, solo, duo, other}, the shares of its length
    with one person, two people side by side, and anything else (no face, a crowd, two people too close
    to split). kind: 'vertical' (the source is already upright), 'screen' (mostly no person to crop to),
    'duo', 'speaker' (faces nearly all the time, two people for at least DUO_MIN or not), else 'mixed'.
    None before the face scan (unless the source size alone says it is vertical). `scenes`: the clip's
    scene_info when the caller has it already."""
    data = scene_info(clip) if scenes is _UNSET else scenes
    w, h = clip.get("source_width"), clip.get("source_height")
    if not (isinstance(w, int) and isinstance(h, int) and w > 0 and h > 0) and data:
        w, h = data.get("width"), data.get("height")
    shots = (data or {}).get("shots") or []
    total = sum(max(0.0, float(s["end"]) - float(s["start"])) for s in shots)
    shares = {"solo": 0.0, "duo": 0.0, "other": 0.0}
    if total > 0:
        for s in shots:
            length = max(0.0, float(s["end"]) - float(s["start"]))
            kind = s.get("kind")
            if kind == "duo" and (length < MIN_DUO_S or len(s.get("faces") or []) < 2):
                kind = "group"
            shares["solo" if kind == "solo" else "duo" if kind == "duo" else "other"] += length / total
    shares = {k: round(v, 3) for k, v in shares.items()}
    if isinstance(w, int) and isinstance(h, int) and w > 0 and h > 0 and w / h <= VERTICAL_MAX_ASPECT:
        kind = "vertical"
    elif total <= 0:
        return None
    elif shares["other"] >= SCREEN_MIN:
        kind = "screen"
    elif shares["other"] <= FACES_OTHER_MAX:
        kind = "duo" if shares["duo"] >= DUO_MIN else "speaker"
    else:
        kind = "mixed"
    return {"kind": kind, **shares}


def smart_on(layout: dict[str, Any]) -> bool:
    return bool((layout.get("smart") or {}).get("enabled"))


def smart_mode(kind: str, layout: dict[str, Any]) -> str:
    """The layout the smart choice gives a kind of content (same as smartMode in layout.ts). A vertical
    source is always full; the companion-video layout without its video falls back to full."""
    if kind == "vertical":
        return "full"
    choices = SMART_CHOICES.get(kind)
    if not choices:
        return "full"
    mode = (layout.get("smart") or {}).get(kind)
    mode = mode if mode in choices else choices[0]
    if mode == "split" and not (layout.get("companion") or {}).get("videoUrl"):
        return "full"
    return mode


def apply_smart(layout: dict[str, Any], clip: dict[str, Any], scenes: Any = _UNSET) -> dict[str, Any]:
    """The layout with the mode picked for the clip's content when the smart layout is on; unchanged
    when it is off or the content is not known yet (before the face scan)."""
    if not smart_on(layout):
        return layout
    profile = content_profile(clip, scenes)
    if profile is None:
        return layout
    return {**layout, "mode": smart_mode(profile["kind"], layout)}


def render_layout(clip: dict[str, Any], bt: dict[str, Any] | None) -> dict[str, Any]:
    """The layout a render uses: template ⊕ clip override, its mode picked by the content when smart."""
    return apply_smart(effective_layout(clip, bt), clip)


def output_format(layout: dict[str, Any]) -> str:
    """'vertical' (9:16), 'square' (1:1) or 'landscape' (16:9)."""
    fmt = layout.get("format")
    return fmt if fmt in FORMATS else "vertical"


def needs_source(layout: dict[str, Any]) -> bool:
    """Podcast, card, duo and auto layouts, and the 1:1 and 16:9 formats, show the clip's original-ratio
    video (source.mp4)."""
    return layout.get("mode") in SOURCE_MODES or output_format(layout) != "vertical"


def needs_faces(layout: dict[str, Any]) -> bool:
    """The duo and auto layouts pick a view per shot of the clip's face scan (9:16 only: 1:1 and 16:9
    point their crop at the faces when the scan exists, the center otherwise)."""
    return output_format(layout) == "vertical" and layout.get("mode") in SCENE_MODES


def mode_name(mode: str) -> str:
    """The layout's name inside a message ("Layout {name} butuh ..."), in the UI language."""
    key = f"mode:{mode}"
    return M(key if key in M.entries else "mode:other")


def companion_problem(layout: dict[str, Any]) -> str | None:
    """Why a split layout cannot render (in the UI language), or None. Other modes never have a problem."""
    if layout.get("mode") != "split":
        return None
    comp = layout.get("companion") or {}
    url = comp.get("videoUrl") or ""
    if not url:
        return M("companion_none")
    try:
        path: Path | None = get_paths().from_relative(url[len("asset://"):])
    except ValueError:
        path = None
    if path is None or not path.is_file():
        return M("companion_missing")
    if not float(comp.get("duration") or 0) > 0:
        return M("companion_no_duration")
    return None


# -- the clip's source video -----------------------------------------------------------------------

class SourceError(RuntimeError):
    """The original-ratio video cannot be prepared (message in the UI language)."""


def source_size(path: Path) -> tuple[int, int] | None:
    from backend.agents.tools import ffmpeg_ops

    info = ffmpeg_ops.probe_media(path)
    if not info or not info.get("width") or not info.get("height"):
        return None
    return int(info["width"]), int(info["height"])


def source_fields(path: Path) -> dict[str, Any]:
    """Clip document fields for a kept source.mp4: its path and size."""
    size = source_size(path)
    out: dict[str, Any] = {"files.source": get_paths().to_relative(path)}
    if size:
        out["source_width"], out["source_height"] = size
    return out


def source_path(clip: dict[str, Any]) -> Path | None:
    rel = (clip.get("files") or {}).get("source")
    if not rel:
        return None
    p = get_paths().from_relative(rel)
    return p if p.is_file() and p.stat().st_size > 0 else None


def prepare_source(clip: dict[str, Any], cancel: procs.CancelToken | None = None,
                   on_step: Callable[[str], None] | None = None) -> dict[str, Any]:
    """Make sure the clip has its source.mp4 (clips made before the podcast layout did not keep it).

    Fetched again for the clip's exact edges: a section download from YouTube, or a cut of the
    uploaded file. Raw.mp4 shares that timeline (both start at the clip's start_time), so subtitles
    and cuts stay in sync. Returns the updated clip document."""
    if source_path(clip):
        return clip
    from backend.agents.tools import ffmpeg_ops, ytdlp

    raw_rel = (clip.get("files") or {}).get("raw")
    if not raw_rel:
        raise SourceError(M("no_clip_file"))
    out_dir = get_paths().from_relative(raw_rel).parent
    start, end = float(clip.get("start_time") or 0), float(clip.get("end_time") or 0)
    if end <= start:
        raise SourceError(M("bad_edges"))
    db = get_db()
    sv = db.source_videos.find_one({"_id": clip.get("source_video_id")}) if clip.get("source_video_id") else None
    local = (sv or {}).get("file_path")
    work = cache.claim(f"source-{clip['_id']}")
    if on_step:
        on_step(M("preparing_source"))
    try:
        if local:
            if not Path(local).is_file():
                raise SourceError(M("original_missing", path=local))
            tmp = ffmpeg_ops.cut_section(Path(local), start, end, work / "source.mp4", cancel)
        elif clip.get("youtube_id"):
            try:
                tmp = ytdlp.download_section(clip["youtube_id"], start, end, work / "source.mp4", cancel)
            except procs.Cancelled:
                raise
            except Exception as exc:
                raise SourceError(M("download_failed", error=exc)) from exc
        else:
            raise SourceError(M("no_source"))
        dest = out_dir / "source.mp4"
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(tmp), str(dest))
    finally:
        cache.release(work)
    fields = source_fields(dest)
    db.clips.update_one({"_id": clip["_id"]}, {"$set": {**fields, "updated_at": utcnow()}})
    return db.clips.find_one({"_id": clip["_id"]}) or clip


# -- the clip's face scan --------------------------------------------------------------------------

def faces_path(clip: dict[str, Any]) -> Path | None:
    rel = (clip.get("files") or {}).get("faces")
    if not rel:
        return None
    p = get_paths().from_relative(rel)
    return p if p.is_file() else None


def scene_info(clip: dict[str, Any]) -> dict[str, Any] | None:
    """The clip's shots for the duo and auto layouts ({width, height, shots}), or None before its face scan."""
    from backend.agents.tools import faces

    return faces.scene_data(faces.load(faces_path(clip)))


def prepare_faces(clip: dict[str, Any], cancel: procs.CancelToken | None = None,
                  on_step: Callable[[str], None] | None = None) -> dict[str, Any]:
    """Make sure the clip has its face scan (clips made before it was kept do not): source.mp4 first,
    then a scan of it into faces.json next to it. Returns the updated clip document."""
    from backend.agents.tools import faces
    from backend.core import resources

    if faces.load(faces_path(clip)):
        return clip
    clip = prepare_source(clip, cancel, on_step)
    src = source_path(clip)
    if src is None:
        raise SourceError(M("source_missing"))
    if on_step:
        on_step(M("analyzing_faces"))
    try:
        with resources.hold("clip", resources.CLIP_TRACK_MB, label=M("faces_label"), cancel=cancel):
            doc = faces.scan(src, cancel)
    except procs.Cancelled:
        raise
    except Exception as exc:
        raise SourceError(M("faces_failed", error=exc)) from exc
    dest = faces.save(doc, src.parent / "faces.json")
    db = get_db()
    db.clips.update_one({"_id": clip["_id"]}, {"$set": {"files.faces": get_paths().to_relative(dest), "updated_at": utcnow()}})
    return db.clips.find_one({"_id": clip["_id"]}) or clip
