"""Free space on the data folder's drive (CLAUDE.md §6.1).

Below 5 GB the user is warned; below 2 GB no new heavy work starts (a job, a resume, an export, a Whisper
model download), and a running job stops before its next clip so the database and the clips being written
never meet a full disk. Everything stopped this way can be resumed once space is free again.
"""
from __future__ import annotations

import logging
import shutil
import threading
import time

from backend.core import events
from backend.core import i18n

M = i18n.messages({
    "full": {
        "id": "Ruang disk hampir habis ({gb} GB tersisa). Kosongkan ruang atau pindahkan lokasi data di Sistem.",
        "en": "The disk is almost full ({gb} GB left). Free up space or move the data location in System.",
    },
    "full_for": {
        "id": "Ruang disk tidak cukup: {gb} GB tersisa, butuh sekitar {need} GB lagi. Kosongkan ruang atau pindahkan lokasi data di Sistem.",
        "en": "Not enough disk space: {gb} GB left, about {need} GB more is needed. Free up space or move the data location in System.",
    },
    "low": {
        "id": "Ruang disk folder data tinggal {gb} GB. Hapus clip atau backup lama, atau pindahkan lokasi data di Sistem.",
        "en": "Only {gb} GB of disk space is left for the data folder. Delete old clips or backups, or move the data location in System.",
    },
})

logger = logging.getLogger(__name__)

GB = 1024**3
MIN_FREE_BYTES = 2 * GB
WARN_FREE_BYTES = 5 * GB
WARN_EVERY_S = 3 * 3600  # the housekeeping warning repeats at most this often

_warn_lock = threading.Lock()
_last_warned = 0.0


class DiskFull(RuntimeError):
    """Not enough free space for the work asked for (message in the UI language)."""


def _gb(n: float) -> str:
    return f"{n / GB:.1f}"


def free_bytes() -> int | None:
    """Free bytes on the data folder's drive, or None when it cannot be read."""
    from backend.core.paths import get_paths

    try:
        return shutil.disk_usage(get_paths().data_root).free
    except OSError:
        return None


def check(need_bytes: int = 0, warn: bool = True) -> None:
    """Raises DiskFull when less than 2 GB would be left after `need_bytes`; warns below 5 GB."""
    free = free_bytes()
    if free is None:
        return
    if free - max(0, need_bytes) < MIN_FREE_BYTES:
        if need_bytes > 0 and free >= MIN_FREE_BYTES:
            raise DiskFull(M("full_for", gb=_gb(free), need=_gb(need_bytes + MIN_FREE_BYTES - free)))
        raise DiskFull(M("full", gb=_gb(free)))
    if warn and free - max(0, need_bytes) < WARN_FREE_BYTES:
        events.notice(M("low", gb=_gb(free)), "warning")


def warn_if_low() -> None:
    """Housekeeping: a warning while the drive is under 5 GB, at most every few hours."""
    global _last_warned
    free = free_bytes()
    if free is None or free >= WARN_FREE_BYTES:
        return
    with _warn_lock:
        now = time.monotonic()
        if _last_warned and now - _last_warned < WARN_EVERY_S:
            return
        _last_warned = now
    logger.warning("Low disk space on the data folder's drive: %s GB free", _gb(free))
    events.notice(M("low", gb=_gb(free)), "warning")
