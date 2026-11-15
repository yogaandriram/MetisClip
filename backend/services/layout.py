"""Brand Template layout (frontend/lib/presets/layout.ts): validation, a clip's effective layout, the
clip's original-ratio video (`source.mp4`) that the podcast and card layouts show, and the companion
video of the split layout (a Brand Template asset, normalized on import).

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

from backend.core import procs
from backend.core.db import get_db, utcnow
from backend.core.paths import get_paths

logger = logging.getLogger(__name__)

MODES = ("full", "podcast", "card", "split")
SOURCE_MODES = ("podcast", "card")  # modes that show source.mp4
RATIOS = ("source", "16:9", "4:3", "1:1", "4:5")
BACKGROUNDS = ("blur", "color", "gradient", "image")
HEADER_SOURCES = ("title", "custom")
ALIGNS = ("left", "center", "right")
ZOOM_STYLES = ("keywords", "sentences")
SPEAKER_ALIGNS = ("left", "center")
COMPANION_POSITIONS = ("bottom", "top")
SAFE_ZONES = ("none", "all", "tiktok", "reels", "shorts")
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
}


class LayoutError(ValueError):
    """An invalid layout value (Indonesian message)."""


def _value(section: str, key: str, value: Any) -> Any:
    kind, spec = SCHEMA[section][key]
    where = f"layout {section}.{key}"
    if kind == "enum":
        if value not in spec:
            raise LayoutError(f"Nilai {where} tidak dikenal")
        return value
    if kind in ("num", "int"):
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise LayoutError(f"{where} harus berupa angka")
        lo, hi = spec
        v = min(hi, max(lo, float(value)))
        return int(round(v)) if kind == "int" else round(v, 4)
    if kind == "bool":
        if not isinstance(value, bool):
            raise LayoutError(f"{where} harus true/false")
        return value
    if kind in ("color", "color_or_empty"):
        if kind == "color_or_empty" and value == "":
            return ""
        if not isinstance(value, str) or not _HEX.match(value):
            raise LayoutError(f"{where} harus warna hex (#RRGGBB)")
        return value
    if kind == "text":
        if not isinstance(value, str):
            raise LayoutError(f"{where} harus berupa teks")
        return value[:spec]
    if kind == "asset":
        if value == "" or (isinstance(value, str) and value.startswith("asset://") and ".." not in value):
            return value
        raise LayoutError(f"{where} harus file dari Brand Template")
    raise AssertionError(kind)


def clean_layout(raw: Any, *, keep_safe_zone: bool = False) -> dict[str, Any]:
    """Validated layout patch: known keys only (unknown ones are dropped), numbers clamped.

    Raises LayoutError for a known key with a value of the wrong type. `keep_safe_zone`: a template's
    layout_settings also holds the preview-only safe-zone guide."""
    if raw is None:
        return {}
    if not isinstance(raw, dict):
        raise LayoutError("Layout harus berupa objek")
    out: dict[str, Any] = {}
    if "mode" in raw:
        if raw["mode"] not in MODES:
            raise LayoutError("Mode layout tidak dikenal")
        out["mode"] = raw["mode"]
    if keep_safe_zone and raw.get("safeZone") in SAFE_ZONES:
        out["safeZone"] = raw["safeZone"]
    for section, keys in SCHEMA.items():
        part = raw.get(section)
        if part is None:
            continue
        if not isinstance(part, dict):
            raise LayoutError(f"layout {section} harus berupa objek")
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
        if "mode" in p:
            out["mode"] = p["mode"]
        for section in SCHEMA:
            if isinstance(p.get(section), dict):
                out[section] = {**out.get(section, {}), **p[section]}
    return out


def effective_layout(clip: dict[str, Any] | None, bt: dict[str, Any] | None) -> dict[str, Any]:
    """Template layout ⊕ the clip's override (without the preview-only safeZone)."""
    tpl = dict((bt or {}).get("layout_settings") or {})
    tpl.pop("safeZone", None)
    return merge(tpl, (clip or {}).get("layout_style") or {})


def needs_source(layout: dict[str, Any]) -> bool:
    """Podcast and card layouts show the clip's original-ratio video (source.mp4)."""
    return layout.get("mode") in SOURCE_MODES


def companion_problem(layout: dict[str, Any]) -> str | None:
    """Why a split layout cannot render (Indonesian), or None. Other modes never have a problem."""
    if layout.get("mode") != "split":
        return None
    comp = layout.get("companion") or {}
    url = comp.get("videoUrl") or ""
    if not url:
        return "Layout video pendamping belum punya video. Unggah video pendamping di Brand Template → Layout."
    try:
        path: Path | None = get_paths().from_relative(url[len("asset://"):])
    except ValueError:
        path = None
    if path is None or not path.is_file():
        return "File video pendamping tidak ditemukan di folder data. Unggah lagi di Brand Template → Layout."
    if not float(comp.get("duration") or 0) > 0:
        return "Durasi video pendamping tidak diketahui. Unggah lagi di Brand Template → Layout."
    return None


# -- the clip's source video -----------------------------------------------------------------------

class SourceError(RuntimeError):
    """The original-ratio video cannot be prepared (Indonesian message)."""


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
        raise SourceError("File klip tidak ada")
    out_dir = get_paths().from_relative(raw_rel).parent
    start, end = float(clip.get("start_time") or 0), float(clip.get("end_time") or 0)
    if end <= start:
        raise SourceError("Batas waktu klip tidak valid")
    db = get_db()
    sv = db.source_videos.find_one({"_id": clip.get("source_video_id")}) if clip.get("source_video_id") else None
    local = (sv or {}).get("file_path")
    work = get_paths().cache_dir / f"source-{clip['_id']}"
    work.mkdir(parents=True, exist_ok=True)
    if on_step:
        on_step("Menyiapkan video sumber…")
    try:
        if local:
            if not Path(local).is_file():
                raise SourceError(f"File video asli tidak ditemukan: {local}. Kembalikan file itu untuk memakai layout podcast atau kartu.")
            tmp = ffmpeg_ops.cut_section(Path(local), start, end, work / "source.mp4", cancel)
        elif clip.get("youtube_id"):
            try:
                tmp = ytdlp.download_section(clip["youtube_id"], start, end, work / "source.mp4", cancel)
            except procs.Cancelled:
                raise
            except Exception as exc:
                raise SourceError(f"Video sumber gagal diunduh dari YouTube: {exc}") from exc
        else:
            raise SourceError("Klip ini tidak punya video sumber")
        dest = out_dir / "source.mp4"
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(tmp), str(dest))
    finally:
        shutil.rmtree(work, ignore_errors=True)
    fields = source_fields(dest)
    db.clips.update_one({"_id": clip["_id"]}, {"$set": {**fields, "updated_at": utcnow()}})
    return db.clips.find_one({"_id": clip["_id"]}) or clip
