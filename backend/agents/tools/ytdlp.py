"""yt-dlp wrapper (standalone yt-dlp.exe + bundled deno as JS runtime)."""
from __future__ import annotations

import json
import logging
import re
from pathlib import Path

from backend.core import procs
from backend.core.config import deno_path, ffmpeg_path, ytdlp_command

logger = logging.getLogger(__name__)

_ID_RE = re.compile(r"^[0-9A-Za-z_-]{11}$")
_URL_PATTERNS = [
    re.compile(r"(?:youtube\.com/watch\?(?:.*&)?v=)([0-9A-Za-z_-]{11})"),
    re.compile(r"(?:youtu\.be/)([0-9A-Za-z_-]{11})"),
    re.compile(r"(?:youtube\.com/(?:shorts|live|embed|v)/)([0-9A-Za-z_-]{11})"),
]


class YtDlpError(RuntimeError):
    pass


def extract_video_id(url_or_id: str) -> str | None:
    s = (url_or_id or "").strip()
    if _ID_RE.match(s):
        return s
    for pat in _URL_PATTERNS:
        m = pat.search(s)
        if m:
            return m.group(1)
    return None


def watch_url(youtube_id: str) -> str:
    return f"https://www.youtube.com/watch?v={youtube_id}"


def _base_args() -> list[str]:
    from backend.core.settings_store import get_settings

    args = ytdlp_command() + [
        "--ffmpeg-location", ffmpeg_path(),
        "--no-playlist",
        "--no-progress",
        "--no-warnings",
        "--socket-timeout", "30",
        "--retries", "3",
        "--encoding", "utf-8",
    ]
    deno = deno_path()
    if deno:
        args += ["--js-runtimes", f"deno:{deno}"]
    try:
        yt = get_settings().get("ytdlp", {})
    except Exception:
        yt = {}
    client = (yt.get("player_client") or "").strip()
    if client and client != "default":
        args += ["--extractor-args", f"youtube:player_client={client}"]
    cookies = (yt.get("cookies_file") or "").strip() if yt.get("cookies_file") else ""
    if cookies and Path(cookies).exists():
        args += ["--cookies", cookies]
    return args


def _friendly(stderr: str) -> str:
    low = (stderr or "").lower()
    if "sign in to confirm" in low or "not a bot" in low:
        return ("YouTube meminta verifikasi bot. Coba 'Update yt-dlp' di halaman Sistem, "
                "atau impor cookies.txt di Pengaturan.")
    if "403 forbidden" in low or "http error 403" in low:
        return ("YouTube menolak unduhan (HTTP 403). Biasanya yt-dlp perlu diperbarui: klik "
                "'Update yt-dlp' di halaman Sistem, lalu lanjutkan job.")
    if "page needs to be reloaded" in low or "requested format is not available" in low:
        return ("yt-dlp tidak dapat membaca format video dari YouTube. Klik 'Update yt-dlp' di halaman "
                "Sistem, atau ganti player client di Pengaturan.")
    if "video unavailable" in low or "private video" in low:
        return "Video YouTube tidak tersedia atau bersifat privat."
    if "http error 429" in low or "too many requests" in low:
        return "YouTube membatasi permintaan (429). Coba lagi beberapa saat lagi."
    if "unable to download" in low or "timed out" in low or "getaddrinfo" in low:
        return "Gagal mengunduh dari YouTube. Periksa koneksi internet Anda."
    tail = "\n".join((stderr or "").strip().splitlines()[-3:])
    return f"yt-dlp gagal: {tail[:300]}"


def _run(args: list[str], cancel: procs.CancelToken | None, timeout: float) -> str:
    try:
        res = procs.run(args, cancel=cancel, timeout=timeout)
    except procs.ProcessError as exc:
        raise YtDlpError(_friendly(exc.stderr)) from exc
    except FileNotFoundError as exc:
        raise YtDlpError("yt-dlp tidak ditemukan. Jalankan ulang instalasi MetisClip.") from exc
    return (res.stdout or b"").decode("utf-8", "replace")


def dump_metadata(youtube_id: str, cancel: procs.CancelToken | None = None) -> dict:
    out = _run(_base_args() + ["-J", "--skip-download", watch_url(youtube_id)], cancel, timeout=120)
    return json.loads(out)


def download_section(
    youtube_id: str, start: float, end: float, out_path: Path, cancel: procs.CancelToken | None = None
) -> Path:
    """Download only [start, end] (≤1080p mp4). Never the full video (rule 1)."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    # Prefer H.264 over plain HTTPS: ffmpeg seeks a range request in seconds, while HLS (m3u8)
    # sections crawl, and AV1/VP9 decode is slower (or missing) in OpenCV for face tracking.
    fmt = ("bv*[height<=1080][vcodec^=avc1][protocol=https]+ba[ext=m4a][protocol=https]"
           "/bv*[height<=1080][protocol=https]+ba[protocol=https]"
           "/bv*[height<=1080]+ba/b[height<=1080]/b")
    args = _base_args() + [
        "--force-overwrites",
        "-f", fmt,
        "--download-sections", f"*{start:.2f}-{end:.2f}",
        "--merge-output-format", "mp4",
        "-o", str(out_path),
        watch_url(youtube_id),
    ]
    _run(args, cancel, timeout=900)
    if not out_path.exists():
        # yt-dlp may append an extension when merging
        candidates = sorted(out_path.parent.glob(out_path.stem + "*"))
        if candidates:
            candidates[0].replace(out_path)
    if not out_path.exists() or out_path.stat().st_size == 0:
        raise YtDlpError("Unduhan segmen video tidak menghasilkan file")
    return out_path


def download_audio(youtube_id: str, out_dir: Path, cancel: procs.CancelToken | None = None) -> Path:
    """Full audio track (allowed only for the Whisper transcript fallback)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    template = out_dir / f"{youtube_id}-audio.%(ext)s"
    _run(_base_args() + ["-f", "ba[ext=m4a]/ba", "-o", str(template), watch_url(youtube_id)], cancel, timeout=1800)
    files = sorted(out_dir.glob(f"{youtube_id}-audio.*"))
    if not files:
        raise YtDlpError("Unduhan audio tidak menghasilkan file")
    return files[0]


def version() -> str | None:
    try:
        res = procs.run(ytdlp_command() + ["--version"], timeout=30)
        return res.stdout.decode().strip()
    except Exception:
        return None


def self_update() -> dict:
    """`yt-dlp -U` on the user-writable copy (YouTube breaks old builds; CLAUDE.md §10.4)."""
    from backend.core.config import note_ytdlp_version, ytdlp_exe
    from backend.core.paths import get_paths

    exe = ytdlp_exe()
    if exe is None:
        return {"ok": False, "updated": False, "version": None, "message": "yt-dlp tidak ditemukan"}
    if exe.parent != get_paths().tools_dir:
        return {"ok": False, "updated": False, "version": version(),
                "message": f"Folder {get_paths().tools_dir} tidak dapat ditulis, yt-dlp tidak dapat diperbarui"}
    before = version()
    output = ""
    try:
        res = procs.run([str(exe), "-U"], timeout=300)
        output = (res.stdout or b"").decode("utf-8", "replace") + (res.stderr or b"").decode("utf-8", "replace")
    except procs.ProcessError as exc:
        output = exc.stderr or ""
    except Exception as exc:  # timeout, cancelled
        output = str(exc)
    after = version()
    if after and after != before:
        note_ytdlp_version(after)
        logger.info("yt-dlp updated %s -> %s", before, after)
        return {"ok": True, "updated": True, "version": after, "message": f"yt-dlp diperbarui ke {after}"}
    if "up to date" in output.lower() or "up-to-date" in output.lower():
        return {"ok": True, "updated": False, "version": after, "message": f"yt-dlp sudah versi terbaru ({after})"}
    tail = " ".join(output.strip().splitlines()[-2:])[:240]
    logger.warning("yt-dlp self-update failed: %s", output.strip()[-1000:])
    return {"ok": False, "updated": False, "version": after,
            "message": "Update yt-dlp gagal" + (f": {tail}" if tail else ". Periksa koneksi internet lalu coba lagi.")}
