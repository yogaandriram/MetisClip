"""Filesystem layout of MetisClip Desktop.

Every path the engine touches is resolved here from the METISCLIP_* environment
variables (set by the Electron main process). Nothing in the engine may use a
path relative to the current working directory.

Data root layout (chosen by the user, e.g. D:\\MetisClip):
    db\\          MongoDB dbPath (managed by mongod)
    library\\     media: {agent-slug}\\{clip_id}\\raw.mp4 | final.mp4 | thumb.jpg, {agent-slug}\\_assets\\
    exports\\     default export target
    cache\\       temporary files, purged per job
    backups\\     EJSON database backups
    .metisclip\\  engine-private files (DB credentials)

Self-updating tools (yt-dlp) are copied out of the read-only install dir to
%LOCALAPPDATA%\\MetisClip\\bin (MetisClip-Dev in dev; METISCLIP_TOOLS_DIR overrides).
"""
from __future__ import annotations

import os
import re
import sys
import unicodedata
from dataclasses import dataclass
from pathlib import Path


def is_frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


def repo_root() -> Path:
    """Repository root (dev only)."""
    return Path(__file__).resolve().parents[2]


class PathOutsideRoot(ValueError):
    pass


@dataclass(frozen=True)
class Paths:
    data_root: Path
    appdata_dir: Path
    bin_dir: Path
    render_dir: Path
    # User-writable copy of self-updating tools; None = derived from %LOCALAPPDATA%
    tools_override: Path | None = None

    @property
    def tools_dir(self) -> Path:
        if self.tools_override is not None:
            return self.tools_override
        return default_tools_dir()

    @property
    def db_dir(self) -> Path:
        return self.data_root / "db"

    @property
    def library_dir(self) -> Path:
        return self.data_root / "library"

    @property
    def exports_dir(self) -> Path:
        return self.data_root / "exports"

    @property
    def cache_dir(self) -> Path:
        return self.data_root / "cache"

    @property
    def models_dir(self) -> Path:
        """Downloaded AI models (local Whisper), kept on the drive the user chose for the data."""
        return self.data_root / "models"

    @property
    def backups_dir(self) -> Path:
        return self.data_root / "backups"

    @property
    def private_dir(self) -> Path:
        return self.data_root / ".metisclip"

    @property
    def logs_dir(self) -> Path:
        return self.appdata_dir / "logs"

    def ensure(self) -> None:
        for d in (
            self.data_root,
            self.library_dir,
            self.exports_dir,
            self.cache_dir,
            self.backups_dir,
            self.private_dir,
            self.logs_dir,
        ):
            d.mkdir(parents=True, exist_ok=True)

    # -- relative <-> absolute ------------------------------------------------

    def to_relative(self, path: os.PathLike | str) -> str:
        """Absolute path under the data root -> 'library/x/y.mp4' (forward slashes)."""
        p = Path(path).resolve()
        root = self.data_root.resolve()
        try:
            rel = p.relative_to(root)
        except ValueError as exc:
            raise PathOutsideRoot(f"{p} is outside the data root") from exc
        return rel.as_posix()

    def from_relative(self, rel: str) -> Path:
        """'library/x/y.mp4' -> absolute path, refusing anything that escapes the data root."""
        if not rel or rel.startswith(("/", "\\")) or ":" in rel:
            raise PathOutsideRoot(f"invalid relative path: {rel!r}")
        root = self.data_root.resolve()
        p = (root / rel.replace("\\", "/")).resolve()
        if p != root and root not in p.parents:
            raise PathOutsideRoot(f"{rel!r} escapes the data root")
        return p

    def agent_library(self, agent_slug: str) -> Path:
        return self.library_dir / agent_slug

    def clip_dir(self, agent_slug: str, clip_id: str) -> Path:
        return self.library_dir / agent_slug / clip_id

    def job_cache(self, job_id: str) -> Path:
        return self.cache_dir / f"job-{job_id}"


def default_tools_dir() -> Path:
    env_dir = os.environ.get("METISCLIP_TOOLS_DIR", "").strip()
    if env_dir:
        return Path(env_dir).resolve()
    dev = os.environ.get("METISCLIP_ENV", "dev" if not is_frozen() else "production") == "dev"
    base = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
    return Path(base) / ("MetisClip-Dev" if dev else "MetisClip") / "bin"


def _env_path(name: str) -> Path | None:
    value = os.environ.get(name, "").strip()
    return Path(value).resolve() if value else None


def resolve_paths() -> Paths:
    """Build the Paths object from the environment, with dev fallbacks."""
    data_root = _env_path("METISCLIP_DATA_ROOT")
    appdata = _env_path("METISCLIP_APPDATA_DIR")
    bin_dir = _env_path("METISCLIP_BIN_DIR")
    render_dir = _env_path("METISCLIP_RENDER_DIR")

    if is_frozen():
        missing = [n for n, v in (("METISCLIP_DATA_ROOT", data_root), ("METISCLIP_APPDATA_DIR", appdata),
                                  ("METISCLIP_BIN_DIR", bin_dir), ("METISCLIP_RENDER_DIR", render_dir)) if v is None]
        if missing:
            raise RuntimeError("Missing environment variables: " + ", ".join(missing))
    else:
        root = repo_root()
        data_root = data_root or (root / ".devdata")
        appdata = appdata or (root / ".devdata" / ".appdata")
        bin_dir = bin_dir or (root / "desktop" / "resources" / "bin")
        render_dir = render_dir or (root / "render-engine")

    return Paths(data_root=data_root, appdata_dir=appdata, bin_dir=bin_dir, render_dir=render_dir)  # type: ignore[arg-type]


_paths: Paths | None = None


def get_paths() -> Paths:
    global _paths
    if _paths is None:
        _paths = resolve_paths()
    return _paths


def set_paths(p: Paths) -> None:
    """Used by tests."""
    global _paths
    _paths = p


_slug_re = re.compile(r"[^a-z0-9]+")


def slugify(text: str, max_len: int = 32) -> str:
    """'Podcast Bisnis & Startup' -> 'podcast-bisnis-startup' (ASCII, short, filesystem-safe)."""
    norm = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode("ascii").lower()
    slug = _slug_re.sub("-", norm).strip("-")
    return (slug[:max_len].strip("-")) or "agent"
