"""
The cache folder (<DATA_ROOT>\\cache): work folders of running steps, and the limit on what is left over.

Every step that writes there claims its folder or file (`claim`) and releases it when it is done (`release`,
which deletes it). Anything else in the cache was left behind by a crash, a power loss or a hard kill.
`sweep` deletes such leftovers: all of them when the engine starts, and later whenever the cache grows
past `cache_limit_gb` (Pengaturan → Penyimpanan), oldest first. Work that still runs is never touched.
"""
from __future__ import annotations

import logging
import os
import shutil
import threading
import time
from pathlib import Path

from backend.core.paths import get_paths

logger = logging.getLogger(__name__)

GB = 1024**3

_lock = threading.Lock()
_claimed: dict[str, int] = {}  # normalized path -> how many running steps use it


def _key(path: Path) -> str:
    return os.path.normcase(os.path.abspath(path))


def _resolve(name: str | Path) -> Path:
    p = Path(name)
    return p if p.is_absolute() else get_paths().cache_dir / p


def claim(name: str | Path, *, folder: bool = True) -> Path:
    """Marks a cache folder (or with folder=False, a file) as in use and creates it (a file: its parent)."""
    path = _resolve(name)
    with _lock:
        k = _key(path)
        _claimed[k] = _claimed.get(k, 0) + 1
    (path if folder else path.parent).mkdir(parents=True, exist_ok=True)
    return path


def release(path: Path) -> None:
    """Frees a claim; the last step to release it deletes the folder or file (two jobs on the same video
    share their transcript folder, and the first one done must not pull it from under the other)."""
    with _lock:
        k = _key(path)
        n = _claimed.get(k, 0) - 1
        if n > 0:
            _claimed[k] = n
            return
        _claimed.pop(k, None)
        _delete(path)


def _delete(path: Path) -> None:
    if path.is_dir() and not path.is_symlink():
        shutil.rmtree(path, ignore_errors=True)
    else:
        try:
            path.unlink()
        except FileNotFoundError:
            pass
        except OSError as exc:
            logger.debug("Could not delete %s: %s", path, exc)


def _in_use(entry: Path) -> bool:
    """A running step uses this entry, or something inside it. Call with _lock held."""
    k = _key(entry)
    prefix = k.rstrip("\\/") + os.sep
    return any(c == k or c.startswith(prefix) for c in _claimed)


def _size(path: Path) -> int:
    if not path.is_dir() or path.is_symlink():
        try:
            return path.stat().st_size
        except OSError:
            return 0
    total = 0
    for root, _dirs, files in os.walk(path):
        for name in files:
            try:
                total += os.stat(os.path.join(root, name)).st_size
            except OSError:
                pass
    return total


def _mtime(path: Path) -> float:
    """The newest change inside an entry, so a folder that is still written to counts as recent."""
    try:
        newest = path.stat().st_mtime
    except OSError:
        return 0.0
    if path.is_dir() and not path.is_symlink():
        for root, dirs, files in os.walk(path):
            for name in files + dirs:
                try:
                    newest = max(newest, os.stat(os.path.join(root, name)).st_mtime)
                except OSError:
                    pass
    return newest


def sweep(limit_bytes: int | None = None) -> dict:
    """
    Deletes cache entries no running step claims. With `limit_bytes`, only while the cache is larger than
    that, oldest first; without it, every leftover. Returns {freed_bytes, removed, total_bytes, in_use_bytes}.
    """
    cache_dir = get_paths().cache_dir
    try:
        children = list(cache_dir.iterdir())
    except FileNotFoundError:
        return {"freed_bytes": 0, "removed": 0, "total_bytes": 0, "in_use_bytes": 0}
    entries = [(child, _size(child), _mtime(child)) for child in children]
    total = sum(size for _, size, _ in entries)
    freed = removed = 0
    if limit_bytes is None or total > limit_bytes:
        for child, size, _ in sorted(entries, key=lambda e: e[2]):
            if limit_bytes is not None and total <= limit_bytes:
                break
            # Held while deleting, so a step cannot claim this name halfway through
            with _lock:
                if _in_use(child):
                    continue
                _delete(child)
            left = _size(child) if child.exists() else 0  # a file another program holds open stays
            total -= size - left
            freed += size - left
            removed += 0 if left else 1
    with _lock:
        in_use = sum(size for child, size, _ in entries if child.exists() and _in_use(child))
    return {"freed_bytes": freed, "removed": removed, "total_bytes": total, "in_use_bytes": in_use}


def limit_bytes() -> int:
    from backend.core.settings_store import get_settings

    try:
        gb = float(get_settings().get("cache_limit_gb") or 10)
    except Exception:
        gb = 10.0
    return int(max(1.0, gb) * GB)


_last_over_warning = 0.0


def enforce_limit() -> dict:
    """The periodic check: leftovers go once the cache is over its limit (work that runs stays)."""
    global _last_over_warning
    limit = limit_bytes()
    res = sweep(limit)
    if res["removed"]:
        logger.info("Cache over its %.0f GB limit: removed %s leftover(s), %.1f MB",
                    limit / GB, res["removed"], res["freed_bytes"] / 1024**2)
    if res["total_bytes"] > limit and time.monotonic() - _last_over_warning > 3600:
        _last_over_warning = time.monotonic()
        logger.warning("Cache is %.1f GB, over its %.0f GB limit, all of it used by running work",
                       res["total_bytes"] / GB, limit / GB)
    return res


def clear_leftovers() -> dict:
    """At engine start: nothing runs yet, so everything in the cache is left over from the last session."""
    res = sweep(None)
    if res["removed"]:
        logger.info("Removed %s leftover cache entr%s from the last session (%.1f MB)",
                    res["removed"], "y" if res["removed"] == 1 else "ies", res["freed_bytes"] / 1024**2)
    return res
