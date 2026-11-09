"""Subprocess helpers: no console windows, cancellation, process-tree kill.

Every child process the engine starts (yt-dlp, ffmpeg, the render worker) must go
through this module so that:
  * no console window flashes on Windows (CREATE_NO_WINDOW),
  * the process is registered with its job's CancelToken and killed on cancel,
  * everything still alive is killed when the engine shuts down.
"""
from __future__ import annotations

import logging
import os
import subprocess
import threading
from typing import IO, Iterable, Sequence

import psutil

logger = logging.getLogger(__name__)

CREATE_NO_WINDOW = 0x08000000 if os.name == "nt" else 0


class Cancelled(Exception):
    """Raised when a job/render was cancelled by the user or by shutdown."""


_registry_lock = threading.Lock()
_live: set[subprocess.Popen] = set()


def kill_tree(pid: int, timeout: float = 5.0) -> None:
    """Kill a process and all of its descendants."""
    try:
        parent = psutil.Process(pid)
    except psutil.NoSuchProcess:
        return
    procs = parent.children(recursive=True) + [parent]
    for p in procs:
        try:
            p.kill()
        except psutil.NoSuchProcess:
            pass
        except Exception as exc:  # pragma: no cover - best effort
            logger.warning("kill pid %s failed: %s", p.pid, exc)
    psutil.wait_procs(procs, timeout=timeout)


class CancelToken:
    """Cancellation flag shared by a job and all its child processes."""

    def __init__(self) -> None:
        self._event = threading.Event()
        self._lock = threading.Lock()
        self._procs: set[subprocess.Popen] = set()
        self.reason = "cancelled"

    @property
    def cancelled(self) -> bool:
        return self._event.is_set()

    def cancel(self, reason: str = "cancelled") -> None:
        self.reason = reason
        self._event.set()
        with self._lock:
            procs = list(self._procs)
        for p in procs:
            if p.poll() is None:
                kill_tree(p.pid)

    def check(self) -> None:
        if self._event.is_set():
            raise Cancelled(self.reason)

    def wait(self, seconds: float) -> bool:
        """Sleep up to `seconds`; returns True if cancelled meanwhile."""
        return self._event.wait(seconds)

    def _register(self, p: subprocess.Popen) -> None:
        with self._lock:
            self._procs.add(p)
        if self._event.is_set():
            kill_tree(p.pid)

    def _unregister(self, p: subprocess.Popen) -> None:
        with self._lock:
            self._procs.discard(p)


def popen(
    cmd: Sequence[str],
    *,
    cancel: CancelToken | None = None,
    stdin: int | IO | None = None,
    stdout: int | IO | None = None,
    stderr: int | IO | None = None,
    cwd: str | os.PathLike | None = None,
    env: dict[str, str] | None = None,
    text: bool = False,
) -> subprocess.Popen:
    """Start a child process (list args only, never shell=True)."""
    if isinstance(cmd, (str, bytes)):
        raise TypeError("cmd must be a list of arguments")
    if cancel is not None:
        cancel.check()
    full_env = None
    if env:
        full_env = os.environ.copy()
        full_env.update(env)
    p = subprocess.Popen(
        [str(c) for c in cmd],
        stdin=stdin,
        stdout=stdout,
        stderr=stderr,
        cwd=str(cwd) if cwd else None,
        env=full_env,
        creationflags=CREATE_NO_WINDOW,
        text=text,
        encoding="utf-8" if text else None,
        errors="replace" if text else None,
    )
    with _registry_lock:
        _live.add(p)
    if cancel is not None:
        cancel._register(p)
    return p


def release(p: subprocess.Popen, cancel: CancelToken | None = None) -> None:
    with _registry_lock:
        _live.discard(p)
    if cancel is not None:
        cancel._unregister(p)


class ProcessError(RuntimeError):
    def __init__(self, cmd: Sequence[str], returncode: int, stderr: str):
        self.cmd = list(cmd)
        self.returncode = returncode
        self.stderr = stderr
        tail = "\n".join((stderr or "").strip().splitlines()[-15:])
        super().__init__(f"{os.path.basename(str(cmd[0]))} exited with code {returncode}: {tail}")


def run(
    cmd: Sequence[str],
    *,
    cancel: CancelToken | None = None,
    timeout: float | None = None,
    cwd: str | os.PathLike | None = None,
    env: dict[str, str] | None = None,
    check: bool = True,
    input_bytes: bytes | None = None,
) -> subprocess.CompletedProcess:
    """Run to completion, capturing output. Raises Cancelled / ProcessError / TimeoutExpired."""
    p = popen(
        cmd,
        cancel=cancel,
        stdin=subprocess.PIPE if input_bytes is not None else subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        cwd=cwd,
        env=env,
    )
    try:
        out, err = p.communicate(input=input_bytes, timeout=timeout)
    except subprocess.TimeoutExpired:
        kill_tree(p.pid)
        p.communicate()
        raise
    finally:
        release(p, cancel)
    if cancel is not None and cancel.cancelled:
        raise Cancelled(cancel.reason)
    result = subprocess.CompletedProcess(list(cmd), p.returncode, out, err)
    if check and p.returncode != 0:
        raise ProcessError(cmd, p.returncode, (err or b"").decode("utf-8", "replace"))
    return result


def kill_all() -> None:
    """Kill every child process still alive (engine shutdown)."""
    with _registry_lock:
        procs = list(_live)
    for p in procs:
        if p.poll() is None:
            kill_tree(p.pid)


def iter_lines(stream: IO[str]) -> Iterable[str]:
    for line in iter(stream.readline, ""):
        yield line.rstrip("\r\n")
