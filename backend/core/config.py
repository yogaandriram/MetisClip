"""Engine process configuration (from the environment set by Electron main).

User-editable settings live in MongoDB (see core/settings_store.py); secrets live
in Windows Credential Manager (see core/secrets.py).
"""
from __future__ import annotations

import logging
import os
import shutil
import sys
import threading
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from backend.core.paths import get_paths, is_frozen, repo_root
from backend.version import __version__

logger = logging.getLogger(__name__)


def _load_dev_dotenv() -> None:
    """In dev, read the repo .env so LLM/Groq/YouTube keys work without the UI."""
    if is_frozen():
        return
    env_file = repo_root() / ".env"
    if env_file.exists():
        try:
            from dotenv import load_dotenv

            load_dotenv(env_file, override=False)
        except Exception:
            pass


_load_dev_dotenv()


@dataclass
class EngineConfig:
    env: str = field(default_factory=lambda: os.environ.get("METISCLIP_ENV", "production" if is_frozen() else "dev"))
    token: str = field(default_factory=lambda: os.environ.get("METISCLIP_TOKEN", "" if is_frozen() else "dev-token"))
    requested_port: int = field(default_factory=lambda: int(os.environ.get("METISCLIP_PORT", "0") or 0))
    mongo_port: int = field(default_factory=lambda: int(os.environ.get("METISCLIP_MONGO_PORT", "27017") or 27017))
    mongodb_uri: str = field(default_factory=lambda: os.environ.get("MONGODB_URI", ""))
    node_path: str = field(default_factory=lambda: os.environ.get("METISCLIP_NODE_PATH", ""))
    browser_path: str = field(default_factory=lambda: os.environ.get("METISCLIP_BROWSER_PATH", ""))
    version: str = __version__
    # Set by backend/run.py once the HTTP socket is bound
    port: int = 0

    @property
    def is_dev(self) -> bool:
        return self.env == "dev"

    @property
    def base_url(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    @property
    def keyring_service(self) -> str:
        return os.environ.get("METISCLIP_KEYRING_SERVICE") or ("MetisClip-Dev" if self.is_dev else "MetisClip")

    @property
    def cors_origins(self) -> list[str]:
        origins = ["app://metisclip"]
        if self.is_dev:
            origins += ["http://localhost:3000", "http://127.0.0.1:3000"]
        return origins


config = EngineConfig()


# ---------------------------------------------------------------------------
# Bundled tools
# ---------------------------------------------------------------------------

@lru_cache(maxsize=1)
def ffmpeg_path() -> str:
    """bin\\ffmpeg.exe -> imageio-ffmpeg's bundled binary -> PATH."""
    candidate = get_paths().bin_dir / "ffmpeg.exe"
    if candidate.exists():
        return str(candidate)
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return shutil.which("ffmpeg") or "ffmpeg"


def _version_tuple(v: str | None) -> tuple[int, ...]:
    try:
        return tuple(int(x) for x in (v or "").strip().split("."))
    except ValueError:
        return ()


def bundled_tool_version(name: str) -> str | None:
    """Pinned version from <bin>\\versions.json (written by scripts/fetch-binaries.ps1)."""
    import json

    try:
        raw = (get_paths().bin_dir / "versions.json").read_text(encoding="utf-8-sig")
        return json.loads(raw).get(name)
    except (OSError, ValueError):
        return None


_ytdlp_lock = threading.Lock()
_ytdlp_exe: Path | None = None


def ytdlp_exe() -> Path | None:
    """The yt-dlp.exe to run: a user-writable copy in tools_dir so `yt-dlp -U` works.

    Seeded from the bundled bin dir on first use, and replaced when an app update ships a
    newer pinned build than the copy. Falls back to the bundled exe if the copy fails.
    """
    global _ytdlp_exe
    if _ytdlp_exe is not None and _ytdlp_exe.exists():
        return _ytdlp_exe
    with _ytdlp_lock:
        paths = get_paths()
        bundled = paths.bin_dir / "yt-dlp.exe"
        copy = paths.tools_dir / "yt-dlp.exe"
        if bundled.exists():
            try:
                stamp = copy.with_name("yt-dlp.version")
                current = stamp.read_text(encoding="utf-8").strip() if stamp.exists() else None
                pinned = bundled_tool_version("yt-dlp")
                if not copy.exists() or (pinned and _version_tuple(pinned) > _version_tuple(current)):
                    copy.parent.mkdir(parents=True, exist_ok=True)
                    tmp = copy.with_suffix(".tmp")
                    shutil.copy2(bundled, tmp)
                    os.replace(tmp, copy)
                    if pinned:
                        stamp.write_text(pinned, encoding="utf-8")
            except OSError as exc:
                logger.warning("Cannot prepare updatable yt-dlp copy in %s: %s", copy.parent, exc)
                _ytdlp_exe = bundled
                return bundled
        _ytdlp_exe = copy if copy.exists() else (bundled if bundled.exists() else None)
        return _ytdlp_exe


def note_ytdlp_version(version: str) -> None:
    """Record the version of the tools copy after a self-update."""
    try:
        (get_paths().tools_dir / "yt-dlp.version").write_text(version.strip(), encoding="utf-8")
    except OSError:
        pass


def ytdlp_command() -> list[str]:
    """Standalone yt-dlp.exe (updatable copy); in dev without it, fall back to the Python module."""
    exe = ytdlp_exe()
    if exe is not None:
        return [str(exe)]
    if not is_frozen():
        return [sys.executable, "-m", "yt_dlp"]
    found = shutil.which("yt-dlp")
    if found:
        return [found]
    raise FileNotFoundError("yt-dlp.exe tidak ditemukan di folder bin aplikasi")


def deno_path() -> str | None:
    exe = get_paths().bin_dir / "deno.exe"
    if exe.exists():
        return str(exe)
    return shutil.which("deno")


def mongod_path() -> str | None:
    exe = get_paths().bin_dir / "mongod.exe"
    return str(exe) if exe.exists() else None


def node_command() -> tuple[list[str], dict[str, str]]:
    """Command prefix + extra env to run a Node script (Electron-as-Node when available)."""
    if config.node_path and Path(config.node_path).exists():
        return [config.node_path], {"ELECTRON_RUN_AS_NODE": "1"}
    node = shutil.which("node")
    if node:
        return [node], {}
    raise FileNotFoundError("Runtime Node/Electron untuk render tidak ditemukan")
