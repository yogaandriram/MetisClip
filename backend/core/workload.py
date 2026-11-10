"""Coordination between CPU-heavy work in the engine.

An export render (Remotion + Chrome) is what the user is waiting for, so local Whisper does not start
a transcription while one runs; it waits and resumes afterwards. A transcription that is already
running keeps going at below-normal priority, so the render still gets the CPU first.
"""
from __future__ import annotations

import threading
from contextlib import contextmanager
from typing import Callable, Iterator

from backend.core.procs import CancelToken, Cancelled

_cond = threading.Condition()
_renders = 0


@contextmanager
def rendering() -> Iterator[None]:
    """Marks an export render as running for as long as the block runs."""
    global _renders
    with _cond:
        _renders += 1
    try:
        yield
    finally:
        with _cond:
            _renders -= 1
            _cond.notify_all()


def renders_active() -> bool:
    with _cond:
        return _renders > 0


def wait_for_renders(cancel: CancelToken | None = None, on_wait: Callable[[], None] | None = None) -> None:
    """Blocks while a render runs. Raises Cancelled when the job is cancelled meanwhile."""
    notified = False
    with _cond:
        while _renders > 0:
            if cancel is not None and cancel.cancelled:
                raise Cancelled(cancel.reason)
            if on_wait and not notified:
                notified = True
                _cond.release()
                try:
                    on_wait()
                finally:
                    _cond.acquire()
                continue
            _cond.wait(timeout=1.0)
    if cancel is not None:
        cancel.check()
