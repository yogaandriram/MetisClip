"""RAM guard ("Hemat RAM otomatis"): heavy work starts only when the PC has room for it.

Each heavy step needs hundreds of MB to a few GB. Measured 2026-11-15 on the reference laptop
with a 60 s 1080p source:
  * one Processor clip: MediaPipe face scan plus the raw-frame pipe to x264, about 0.5 GB; the final
    1080x1920 encode, about 0.26 GB with QSV and 0.85 GB with libx264 (0.48 GB at 4 threads);
  * an export render, with the lean options below: about 2.0 GB plus 0.45 GB per Chrome tab (2.4 GB
    with 1 tab, 3.0 GB with 2, 3.8 GB with 4); Remotion's defaults took 0.7 GB more;
  * local Whisper: about 0.7 GB (small) and 0.9 GB (large-v3-turbo).
Several of these at once, next to the user's own apps, can use up the RAM; Windows then pages to disk
and the whole PC stalls.

So every heavy step runs inside `hold(kind, need_mb)`:
  * It starts when the RAM Windows reports as available, minus what MetisClip's running steps were
    granted but have not allocated yet, covers `need_mb` and still leaves the reserve for Windows and
    the user's other apps (setting `resources.reserve_gb`, 0 = automatic).
  * Otherwise it waits, says why (job or render message, plus one system notice) and starts once RAM
    frees up. The clip pool therefore runs fewer clips at once on a busy PC, never more than
    `processing.max_workers`.
  * When nothing else of MetisClip runs, waiting for MetisClip cannot help, so only a smaller reserve
    (ALONE_RESERVE_MB) applies, and after ALONE_MAX_WAIT_S the step starts anyway: work is slowed by
    a full PC but never blocked.
  * An export render (what the user is waiting for) goes first: while one waits, no clip or
    transcription starts. It takes as many Chrome tabs as the RAM allows (`render_slot`).
  * Holds are per thread and re-entrant: Whisper inside a clip runs under the clip's hold.
With the guard on, encoders and the render worker also run at below-normal priority, so the user's
own apps stay responsive. With "Hemat RAM otomatis" off (`resources.auto` false) every hold starts
at once and the render uses Remotion's own sizing.
"""
from __future__ import annotations

import logging
import os
import threading
import time
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Callable, Iterator

import psutil

from backend.core import events
from backend.core.procs import CancelToken, Cancelled
from backend.core import i18n

M = i18n.messages({
    "wait_busy": {
        "id": "Menunggu RAM: {busy} proses berat MetisClip lain masih berjalan (butuh {need} GB). Lanjut otomatis setelah RAM cukup.",
        "en": "Waiting for RAM: {busy} other heavy MetisClip steps are still running (needs {need} GB). Continues automatically once there is enough RAM.",
    },
    "wait_busy_one": {
        "id": "Menunggu RAM: {busy} proses berat MetisClip lain masih berjalan (butuh {need} GB). Lanjut otomatis setelah RAM cukup.",
        "en": "Waiting for RAM: {busy} other heavy MetisClip step is still running (needs {need} GB). Continues automatically once there is enough RAM.",
    },
    "wait_free": {
        "id": "Menunggu RAM: tersedia {available} GB, butuh {need} GB ditambah cadangan {reserve} GB untuk aplikasi lain. Tutup aplikasi lain agar lebih cepat; proses tetap lanjut otomatis.",
        "en": "Waiting for RAM: {available} GB free, {need} GB needed plus a {reserve} GB reserve for other apps. Close other apps to speed this up; it continues automatically.",
    },
    "ram_full": {
        "id": "RAM komputer hampir penuh. MetisClip menunda proses berat sampai RAM cukup; tutup aplikasi lain agar lebih cepat.",
        "en": "The computer's RAM is almost full. MetisClip holds heavy steps back until there is enough RAM; close other apps to speed this up.",
    },
    "render_label": {
        "id": "Ekspor video",
        "en": "Video export",
    },
})

logger = logging.getLogger(__name__)

MB = 1024 * 1024

# Peak RAM per step (see the module docstring), with headroom for longer clips and bigger sources
CLIP_TRACK_MB = 600
CLIP_ENCODE_MB = {"hardware": 350, "libx264": 900}
WHISPER_MB = {"small": 800, "large-v3-turbo": 1000}
RENDER_BASE_MB = 2000
RENDER_TAB_MB = 500
RENDER_MAX_TABS = 4
# Lean render options (render-engine/render.ts): x264 stitcher threads and the frame cache. Measured
# with 2 tabs: 3.6 GB -> 3.0 GB, and no slower, since the encoder competes less with Chrome for the CPU
RENDER_ENCODER_THREADS = 4
RENDER_MEDIA_CACHE_MB = 256
# A split layout decodes its companion video next to the clip. Measured 2026-11-15 (15 s clip, 4 tabs,
# worker tree working set): 4.51 GB against 4.22 GB for the same render in full mode
RENDER_COMPANION_MB = 300
# A duo layout decodes the original-ratio source twice (one copy per panel) in two-speaker shots.
# Measured 2026-11-15 (15 s of a 1080p two-host podcast, 4 tabs): 4.85 GB against 4.09 GB in full mode
RENDER_DUO_MB = 800
# An auto layout can use every view: the panels' two source copies, the framed source and its blurred
# background. Measured 2026-11-15 (15 s with a slide, one person and two people, 4 tabs): 4.77 GB
# against 4.14 GB in full mode, so the duo figure covers it
RENDER_AUTO_MB = RENDER_DUO_MB
# What a layout adds to a render (RAM guard), whatever the tab count
LAYOUT_RENDER_MB = {"split": RENDER_COMPANION_MB, "duo": RENDER_DUO_MB, "auto": RENDER_AUTO_MB}

ALONE_RESERVE_MB = 768
ALONE_MAX_WAIT_S = 90.0
# libx264 uses fewer threads (about half its RAM) when less than this is left after the reserve
TIGHT_MB = 2048
POLL_S = 2.0
TELL_EVERY_S = 30.0
NOTICE_EVERY_S = 300.0


@dataclass
class Hold:
    id: int
    kind: str
    label: str
    need_mb: int
    priority: bool
    since: float = field(default_factory=time.monotonic)


@dataclass
class WaitInfo:
    """Why a step waits, for its job or render message."""

    kind: str
    need_mb: int
    available_mb: int
    reserve_mb: int
    busy: int  # MetisClip's heavy steps running now

    def message(self) -> str:
        comma = i18n.language() == "id"  # decimal comma in Indonesian

        def gb(mb: int) -> str:
            text = f"{mb / 1024:.1f}"
            return text.replace(".", ",") if comma else text

        if self.busy:
            return M("wait_busy_one" if self.busy == 1 else "wait_busy", busy=self.busy, need=gb(self.need_mb))
        return M("wait_free", available=gb(self.available_mb), need=gb(self.need_mb), reserve=gb(self.reserve_mb))


_cond = threading.Condition()
_holds: dict[int, Hold] = {}
_waiting: dict[int, Hold] = {}
_local = threading.local()
_next_id = 0
_engine_base_rss = 0
_last_notice = 0.0


# -- settings -----------------------------------------------------------------

def _settings() -> dict:
    try:
        from backend.core import db
        from backend.core.settings_store import get_settings

        if not db.connected():  # scripts and tests without a database: the defaults
            return {}
        return get_settings().get("resources") or {}
    except Exception:
        return {}


def enabled() -> bool:
    return bool(_settings().get("auto", True))


def total_mb() -> int:
    return int(psutil.virtual_memory().total / MB)


def available_mb() -> int:
    return int(psutil.virtual_memory().available / MB)


def auto_reserve_mb(total: int | None = None) -> int:
    """15 % of the RAM, between 1.5 and 2.5 GB: 1.5 GB on 8 GB, 2.4 GB on 16 GB, 2.5 GB above that."""
    total = total if total is not None else total_mb()
    return int(min(2560, max(1536, total * 0.15)))


def reserve_mb() -> int:
    try:
        gb = float(_settings().get("reserve_gb") or 0)
    except (TypeError, ValueError):
        gb = 0.0
    return int(gb * 1024) if gb > 0 else auto_reserve_mb()


# -- measuring ----------------------------------------------------------------

def _ours_mb() -> int:
    """RAM MetisClip's heavy steps use now: the engine's child processes (ffmpeg, yt-dlp, whisper-cli,
    the render worker and its Chrome) plus what the engine itself grew by since it was last idle."""
    total = 0
    try:
        me = psutil.Process()
        for child in me.children(recursive=True):
            try:
                total += child.memory_info().rss
            except psutil.Error:
                pass
        total += max(0, me.memory_info().rss - _engine_base_rss)
    except psutil.Error:
        pass
    return int(total / MB)


def _mark_idle() -> None:
    """Called while no hold is active: the engine's RSS now is its baseline (modules, caches)."""
    global _engine_base_rss
    try:
        _engine_base_rss = psutil.Process().memory_info().rss
    except psutil.Error:
        pass


def _usable() -> tuple[int, int, int]:
    """(RAM a new step may use, available, reserve) in MB. Call with `_cond` held."""
    available = available_mb()
    reserve = reserve_mb() if _holds else min(reserve_mb(), ALONE_RESERVE_MB)
    granted = sum(h.need_mb for h in _holds.values())
    # Running steps may not have allocated all they were granted yet: count the rest as taken
    pending = max(0, granted - _ours_mb()) if granted else 0
    return available - pending - reserve, available, reserve


def tight() -> bool:
    """Little RAM to spare: encoders use their lighter settings."""
    return enabled() and available_mb() - reserve_mb() < TIGHT_MB


# -- holds --------------------------------------------------------------------

def _admit(h: Hold, waited_s: float) -> bool:
    if not h.priority and any(w.priority for w in _waiting.values() if w.id != h.id):
        return False
    usable, _, _ = _usable()
    if usable >= h.need_mb:
        return True
    return not _holds and waited_s >= ALONE_MAX_WAIT_S


def _changed() -> None:
    try:
        events.publish({"type": "system.resources", **status()})
    except Exception:  # never let a status event break a step
        logger.debug("resources event failed", exc_info=True)


@contextmanager
def hold(
    kind: str,
    need_mb: int,
    *,
    label: str = "",
    cancel: CancelToken | None = None,
    on_wait: Callable[[WaitInfo], None] | None = None,
    priority: bool = False,
) -> Iterator[Hold | None]:
    """Run the block once `need_mb` of RAM can be spared (see the module docstring).

    Yields the hold, or None when the guard is off or this thread already holds one."""
    global _next_id
    if getattr(_local, "depth", 0) > 0 or not enabled():
        _local.depth = getattr(_local, "depth", 0) + 1
        try:
            yield None
        finally:
            _local.depth -= 1
        return

    with _cond:
        _next_id += 1
        h = Hold(id=_next_id, kind=kind, label=label, need_mb=int(need_mb), priority=priority)
        if not _holds:
            _mark_idle()
        started = time.monotonic()
        last_told = 0.0
        try:
            while not _admit(h, time.monotonic() - started):
                if cancel is not None and cancel.cancelled:
                    raise Cancelled(cancel.reason)
                if h.id not in _waiting:
                    _waiting[h.id] = h
                    _changed()
                now = time.monotonic()
                if now - last_told >= TELL_EVERY_S:
                    last_told = now
                    usable, available, reserve = _usable()
                    info = WaitInfo(kind, h.need_mb, available, reserve, len(_holds))
                    logger.info("RAM guard: %s waits (need %d MB, usable %d MB, available %d MB, reserve %d MB, %d running)",
                                kind, h.need_mb, usable, available, reserve, len(_holds))
                    _notify_full(info)
                    if on_wait:
                        _cond.release()
                        try:
                            on_wait(info)
                        except Exception:
                            logger.debug("on_wait failed", exc_info=True)
                        finally:
                            _cond.acquire()
                _cond.wait(timeout=POLL_S)
        finally:
            if _waiting.pop(h.id, None) is not None:
                _cond.notify_all()
        h.since = time.monotonic()
        _holds[h.id] = h
    _changed()
    _local.depth = 1
    try:
        yield h
    finally:
        _local.depth = 0
        with _cond:
            _holds.pop(h.id, None)
            _cond.notify_all()
        _changed()


def _notify_full(info: WaitInfo) -> None:
    """A system notice, at most every few minutes, when other apps (not MetisClip) fill the RAM."""
    global _last_notice
    if info.busy or time.monotonic() - _last_notice < NOTICE_EVERY_S:
        return
    _last_notice = time.monotonic()
    events.notice(M("ram_full"), "warning")


# -- sizing -------------------------------------------------------------------

def clip_need_mb(encoder: str, whisper_mb: int = 0) -> int:
    """One Processor clip: its steps run one after another, so the need is the largest of them."""
    enc = CLIP_ENCODE_MB["libx264" if encoder == "libx264" else "hardware"]
    return max(CLIP_TRACK_MB, enc, whisper_mb)


def render_need_mb(tabs: int, extra_mb: int = 0) -> int:
    return RENDER_BASE_MB + RENDER_TAB_MB * max(1, tabs) + max(0, extra_mb)


def _tab_cap(max_tabs: int | None) -> int:
    cpu_cap = max(1, (os.cpu_count() or 2) // 2)
    return max(1, min(RENDER_MAX_TABS, cpu_cap, max_tabs or RENDER_MAX_TABS))


@contextmanager
def render_slot(
    *,
    cancel: CancelToken | None = None,
    on_wait: Callable[[WaitInfo], None] | None = None,
    max_tabs: int | None = None,
    extra_mb: int = 0,
) -> Iterator[int | None]:
    """Hold RAM for an export render. Waits (with priority) for one Chrome tab's worth, then takes as
    many more tabs as the RAM free at that moment allows. Yields the tab count, or None with the
    guard off (the worker then sizes itself). `extra_mb`: what the layout adds whatever the tab count
    (LAYOUT_RENDER_MB for the split, duo and auto layouts)."""
    with hold("render", render_need_mb(1, extra_mb), label=M("render_label"), cancel=cancel, on_wait=on_wait,
              priority=True) as h:
        if h is None:
            yield None
            return
        with _cond:
            # Net of this render's one-tab grant, and with the full reserve: extra tabs only speed the
            # render up, so they never eat into the RAM kept for the user's apps
            usable, _, _ = _usable()
            tabs = max(1, min(_tab_cap(max_tabs), 1 + max(0, usable) // RENDER_TAB_MB))
            h.need_mb = render_need_mb(tabs, extra_mb)
        yield tabs


# -- status (System page) -----------------------------------------------------

def status() -> dict:
    vm = psutil.virtual_memory()
    total = int(vm.total / MB)

    def rows(items: dict[int, Hold]) -> list[dict]:
        return [{"kind": h.kind, "label": h.label, "need_mb": h.need_mb} for h in items.values()]

    with _cond:
        running, waiting = rows(_holds), rows(_waiting)
    return {
        "auto": enabled(),
        "total_mb": total,
        "available_mb": int(vm.available / MB),
        "reserve_mb": reserve_mb(),
        "auto_reserve_mb": auto_reserve_mb(total),
        "running": running,
        "waiting": waiting,
    }
