"""Copies of rendered clips outside the library.

Every finished render is copied to the export folder (Pengaturan → Folder ekspor, by default
<DATA_ROOT>\\exports), and "Ekspor ke…" copies to a folder the user picks. Both go through here so the
file name and the folder rules are the same. `final.mp4` in the library stays the clip's own file.
"""
from __future__ import annotations

import os
import shutil
from pathlib import Path
from typing import Any

from backend.core.paths import get_paths


class ExportError(Exception):
    """Indonesian message for the user."""


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
            raise ExportError("Folder tujuan tidak diizinkan")
        folder.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise ExportError(f"Folder tujuan tidak dapat dibuat ({folder}): {exc.strerror or exc}") from exc
    return folder


def file_name(clip: dict[str, Any]) -> str:
    """`<hook text> - <id8>.mp4`: readable, and the same for every render of a clip (a re-render replaces it)."""
    base = "".join(ch for ch in (clip.get("hook_text") or "")[:50] if ch.isalnum() or ch in " -_").strip()
    return f"{base or 'metisclip'} - {clip['_id'][:8]}.mp4"


def copy_final(clip: dict[str, Any], folder: Path) -> Path:
    """Copy the clip's final.mp4 into `folder` (checked with `check_dest`) and return the new file."""
    rel = (clip.get("files") or {}).get("final")
    if not rel:
        raise ExportError("Belum dirender")
    src = get_paths().from_relative(rel)
    if not src.exists():
        raise ExportError("File hasil render hilang")
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
            raise ExportError(f"Gagal menyalin ke {folder}: file tujuan sedang dibuka aplikasi lain, "
                              "atau folder itu tidak bisa ditulis") from exc
        raise ExportError(f"Gagal menyalin ke {folder}: {exc.strerror or exc}") from exc
    return target
