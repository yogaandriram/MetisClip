"""Copies of rendered clips outside the library.

Every finished render is copied to the export folder (Pengaturan → Folder ekspor, by default
<DATA_ROOT>\\exports), and "Ekspor ke…" copies to a folder the user picks. Both go through here so the
file name and the folder rules are the same. `final.mp4` in the library stays the clip's own file.
"""
from __future__ import annotations

import logging
import os
import shutil
from pathlib import Path
from typing import Any

from backend.core.paths import get_paths
from backend.core import i18n

M = i18n.messages({
    "not_allowed": {
        "id": "Folder tujuan tidak diizinkan",
        "en": "This destination folder is not allowed",
    },
    "cannot_create": {
        "id": "Folder tujuan tidak dapat dibuat ({folder}): {error}",
        "en": "The destination folder can't be created ({folder}): {error}",
    },
    "not_rendered": {
        "id": "Belum dirender",
        "en": "Not rendered yet",
    },
    "final_missing": {
        "id": "File hasil render hilang",
        "en": "The rendered file is missing",
    },
    "locked": {
        "id": "Gagal menyalin ke {folder}: file tujuan sedang dibuka aplikasi lain, atau folder itu tidak bisa ditulis",
        "en": "Couldn't copy to {folder}: the target file is open in another app, or the folder is not writable",
    },
    "copy_failed": {
        "id": "Gagal menyalin ke {folder}: {error}",
        "en": "Couldn't copy to {folder}: {error}",
    },
})


logger = logging.getLogger(__name__)


class ExportError(Exception):
    """Message for the user (in the UI language)."""


def default_dir() -> Path:
    from backend.core.settings_store import get_settings

    return Path(get_settings()["export_dir"])


def check_dest(dest: str | Path | None = None) -> Path:
    """The resolved, existing destination folder (the export folder when `dest` is empty)."""
    folder = Path(dest).expanduser() if dest else default_dir()
    paths = get_paths()
    try:
        folder = folder.resolve()
        # Checked before mkdir, so a refused folder is never created. The cache is purged per job.
        forbidden = (paths.db_dir.resolve(), paths.private_dir.resolve(), paths.cache_dir.resolve())
        if folder == paths.data_root.resolve() or any(f == folder or f in folder.parents for f in forbidden):
            raise ExportError(M("not_allowed"))
        folder.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise ExportError(M("cannot_create", folder=folder, error=exc.strerror or exc)) from exc
    return folder


def file_name(clip: dict[str, Any]) -> str:
    """`<hook text> - <id8>.mp4`: readable, and the same for every render of a clip (a re-render replaces it)."""
    base = "".join(ch for ch in (clip.get("hook_text") or "")[:50] if ch.isalnum() or ch in " -_").strip()
    return f"{base or 'metisclip'} - {clip['_id'][:8]}.mp4"


def copy_final(clip: dict[str, Any], folder: Path) -> Path:
    """Copy the clip's final.mp4 into `folder` (checked with `check_dest`) and return the new file."""
    rel = (clip.get("files") or {}).get("final")
    if not rel:
        raise ExportError(M("not_rendered"))
    src = get_paths().from_relative(rel)
    if not src.exists():
        raise ExportError(M("final_missing"))
    target = folder / file_name(clip)
    part = target.with_name(target.name + ".part")
    try:
        # Copy beside the target, then swap: an interrupted copy never leaves a broken .mp4 behind.
        # copyfile (not copy2): the copy gets the time of this render, so Explorer sorts it as new.
        shutil.copyfile(src, part)
        os.replace(part, target)
    except OSError as exc:
        part.unlink(missing_ok=True)
        if isinstance(exc, PermissionError):
            raise ExportError(M("locked", folder=folder)) from exc
        raise ExportError(M("copy_failed", folder=folder, error=exc.strerror or exc)) from exc
    write_post_text(clip, target)
    return target


def post_text_enabled() -> bool:
    from backend.core.settings_store import get_settings

    return bool(get_settings()["export"]["post_text"])


def write_post_text(clip: dict[str, Any], video: Path) -> Path | None:
    """A campaign clip's post text as `<video name>.txt` next to the exported video (Pengaturan →
    Folder ekspor can turn it off). Never fails the export: the video is what matters."""
    from backend.agents.tools.post_copy_ai import as_text

    if not clip.get("campaign_id") or not clip.get("post_copy") or not post_text_enabled():
        return None
    text = as_text(clip.get("post_copy"))
    if not text.strip():
        return None
    out = video.with_suffix(".txt")
    try:
        out.write_text(text, encoding="utf-8")  # UTF-8 without BOM: hashtags and emoji paste cleanly
    except OSError as exc:
        logger.warning("Post text next to %s not written: %s", video.name, exc)
        return None
    return out
