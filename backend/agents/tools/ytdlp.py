"""yt-dlp wrapper (standalone yt-dlp.exe + bundled deno as JS runtime)."""
from __future__ import annotations

import json
import logging
import os
import re
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Iterator
from pathlib import Path

from backend.core import procs
from backend.core.config import deno_path, ffmpeg_path, ytdlp_command
from backend.core import i18n

M = i18n.messages({
    "in_use": {
        "id": "yt-dlp sedang mengunduh video (job, ekspor, atau persiapan video sumber). Coba update lagi setelah unduhan selesai.",
        "en": "yt-dlp is downloading a video (a job, an export or a source video being prepared). Try the update again once it is done.",
    },
    "bot_check": {
        "id": "YouTube meminta verifikasi bot. Coba 'Update yt-dlp' di halaman Sistem, atau impor cookies.txt di Pengaturan.",
        "en": "YouTube is asking for a bot check. Try 'Update yt-dlp' on the System page, or import cookies.txt in Settings.",
    },
    "forbidden": {
        "id": "YouTube menolak unduhan (HTTP 403). Biasanya yt-dlp perlu diperbarui: klik 'Update yt-dlp' di halaman Sistem, lalu lanjutkan job.",
        "en": "YouTube refused the download (HTTP 403). yt-dlp usually needs an update: click 'Update yt-dlp' on the System page, then resume the job.",
    },
    "format": {
        "id": "yt-dlp tidak dapat membaca format video dari YouTube. Klik 'Update yt-dlp' di halaman Sistem, atau ganti player client di Pengaturan.",
        "en": "yt-dlp can't read the video formats from YouTube. Click 'Update yt-dlp' on the System page, or change the player client in Settings.",
    },
    "unavailable": {
        "id": "Video YouTube tidak tersedia atau bersifat privat.",
        "en": "The YouTube video is unavailable or private.",
    },
    "rate_limited": {
        "id": "YouTube membatasi permintaan (429). Coba lagi beberapa saat lagi.",
        "en": "YouTube is limiting requests (429). Try again in a moment.",
    },
    "network": {
        "id": "Gagal mengunduh dari YouTube. Periksa koneksi internet Anda.",
        "en": "Couldn't download from YouTube. Check your internet connection.",
    },
    "failed": {
        "id": "yt-dlp gagal: {tail}",
        "en": "yt-dlp failed: {tail}",
    },
    "missing_reinstall": {
        "id": "yt-dlp tidak ditemukan. Jalankan ulang instalasi MetisClip.",
        "en": "yt-dlp was not found. Run the MetisClip installer again.",
    },
    "no_section_file": {
        "id": "Unduhan segmen video tidak menghasilkan file",
        "en": "The video section download produced no file",
    },
    "no_audio_file": {
        "id": "Unduhan audio tidak menghasilkan file",
        "en": "The audio download produced no file",
    },
    "missing": {
        "id": "yt-dlp tidak ditemukan",
        "en": "yt-dlp was not found",
    },
    "not_writable": {
        "id": "Folder {folder} tidak dapat ditulis, yt-dlp tidak dapat diperbarui",
        "en": "Folder {folder} is not writable, so yt-dlp can't be updated",
    },
    "updated": {
        "id": "yt-dlp diperbarui ke {version}",
        "en": "yt-dlp updated to {version}",
    },
    "up_to_date": {
        "id": "yt-dlp sudah versi terbaru ({version})",
        "en": "yt-dlp is already up to date ({version})",
    },
    "update_failed": {
        "id": "Update yt-dlp gagal: {tail}",
        "en": "The yt-dlp update failed: {tail}",
    },
    "update_failed_offline": {
        "id": "Update yt-dlp gagal. Periksa koneksi internet lalu coba lagi.",
        "en": "The yt-dlp update failed. Check your internet connection and try again.",
    },
})

logger = logging.getLogger(__name__)

# Daily update check: YouTube breaks old builds within weeks
AUTO_EVERY_S = 24 * 3600
AUTO_RETRY_S = 3 * 3600  # after a failed check (offline, GitHub unreachable)
STATE_FILE = "yt-dlp-update.json"  # next to the updatable copy, in tools_dir
_update_lock = threading.Lock()  # one `yt-dlp -U` at a time (the button and the daily check)

_ID_RE = re.compile(r"^[0-9A-Za-z_-]{11}$")
_URL_PATTERNS = [
    re.compile(r"(?:youtube\.com/watch\?(?:.*&)?v=)([0-9A-Za-z_-]{11})"),
    re.compile(r"(?:youtu\.be/)([0-9A-Za-z_-]{11})"),
    re.compile(r"(?:youtube\.com/(?:shorts|live|embed|v)/)([0-9A-Za-z_-]{11})"),
]


class YtDlpError(RuntimeError):
    pass


class YtDlpBusy(RuntimeError):
    """`yt-dlp -U` refused: yt-dlp is running (message in the UI language)."""


class _ExeGate:
    """
    yt-dlp runs share the exe; `yt-dlp -U` replaces it and needs it to itself. An update starts only while no
    yt-dlp runs (never waits), and a run that starts during an update waits for it, then uses the new exe.
    """

    def __init__(self) -> None:
        self._cond = threading.Condition()
        self._users = 0
        self._updating = False

    @contextmanager
    def use(self, cancel: procs.CancelToken | None = None) -> Iterator[None]:
        with self._cond:
            while self._updating:
                if cancel is not None:
                    cancel.check()
                self._cond.wait(0.5)
            self._users += 1
        try:
            yield
        finally:
            with self._cond:
                self._users -= 1
                self._cond.notify_all()

    def begin_update(self) -> bool:
        with self._cond:
            if self._users or self._updating:
                return False
            self._updating = True
            return True

    def end_update(self) -> None:
        with self._cond:
            self._updating = False
            self._cond.notify_all()

    @property
    def in_use(self) -> bool:
        with self._cond:
            return self._users > 0


_exe_gate = _ExeGate()


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


_PLAYLIST_RE = re.compile(r"[?&]list=([0-9A-Za-z_-]{10,64})")
PLAYLIST_MAX = 50
# Entries a flat playlist lists without a video behind them
_GONE_TITLES = {"[private video]", "[deleted video]", "[unavailable video]"}


def extract_playlist_id(url: str) -> str | None:
    """The `list=` id of a YouTube link (a playlist page, or a video opened inside a playlist)."""
    s = (url or "").strip()
    if "youtube.com" not in s and "youtu.be" not in s:
        return None
    m = _PLAYLIST_RE.search(s)
    return m.group(1) if m else None


def list_playlist(playlist_id: str, cancel: procs.CancelToken | None = None, limit: int = PLAYLIST_MAX) -> dict:
    """The first `limit` videos of a playlist, without downloading anything (`--flat-playlist`):
    {title, channel, entries: [{youtube_id, title, duration_seconds, channel}], more: bool}. Private and
    deleted entries are left out."""
    args = [a for a in _base_args() if a != "--no-playlist"]
    url = f"https://www.youtube.com/playlist?list={playlist_id}"
    out = _run(args + ["--flat-playlist", "-J", "--playlist-end", str(limit + 1), url], cancel, timeout=120)
    data = json.loads(out)
    entries = []
    for e in data.get("entries") or []:
        vid = e.get("id") if isinstance(e, dict) else None
        title = str(e.get("title") or "").strip() if isinstance(e, dict) else ""
        if not vid or not _ID_RE.match(vid) or title.lower() in _GONE_TITLES:
            continue
        duration = e.get("duration")
        entries.append({
            "youtube_id": vid,
            "title": title,
            "duration_seconds": float(duration) if isinstance(duration, (int, float)) else None,
            "channel": e.get("channel") or e.get("uploader") or "",
        })
    return {
        "title": data.get("title") or "",
        "channel": data.get("channel") or data.get("uploader") or "",
        "entries": entries[:limit],
        "more": len(entries) > limit,
    }


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
        return M("bot_check")
    if "403 forbidden" in low or "http error 403" in low:
        return M("forbidden")
    if "page needs to be reloaded" in low or "requested format is not available" in low:
        return M("format")
    if "video unavailable" in low or "private video" in low:
        return M("unavailable")
    if "http error 429" in low or "too many requests" in low:
        return M("rate_limited")
    if "unable to download" in low or "timed out" in low or "getaddrinfo" in low:
        return M("network")
    tail = "\n".join((stderr or "").strip().splitlines()[-3:])
    return M("failed", tail=tail[:300])


def _run(args: list[str], cancel: procs.CancelToken | None, timeout: float) -> str:
    try:
        with _exe_gate.use(cancel):
            res = procs.run(args, cancel=cancel, timeout=timeout)
    except procs.ProcessError as exc:
        raise YtDlpError(_friendly(exc.stderr)) from exc
    except FileNotFoundError as exc:
        raise YtDlpError(M("missing_reinstall")) from exc
    return (res.stdout or b"").decode("utf-8", "replace")


def dump_metadata(youtube_id: str, cancel: procs.CancelToken | None = None) -> dict:
    out = _run(_base_args() + ["-J", "--skip-download", watch_url(youtube_id)], cancel, timeout=120)
    return json.loads(out)


def download_section(
    youtube_id: str, start: float, end: float, out_path: Path, cancel: procs.CancelToken | None = None
) -> Path:
    """Download only [start, end] (≤1080p mp4). Never the full video."""
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
        raise YtDlpError(M("no_section_file"))
    return out_path


def download_audio(youtube_id: str, out_dir: Path, cancel: procs.CancelToken | None = None) -> Path:
    """Full audio track (allowed only for the Whisper transcript fallback)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    template = out_dir / f"{youtube_id}-audio.%(ext)s"
    _run(_base_args() + ["-f", "ba[ext=m4a]/ba", "-o", str(template), watch_url(youtube_id)], cancel, timeout=1800)
    files = sorted(out_dir.glob(f"{youtube_id}-audio.*"))
    if not files:
        raise YtDlpError(M("no_audio_file"))
    return files[0]


def version() -> str | None:
    try:
        res = procs.run(ytdlp_command() + ["--version"], timeout=30)
        return res.stdout.decode().strip()
    except Exception:
        return None


def self_update() -> dict:
    """`yt-dlp -U` on the user-writable copy (YouTube breaks old builds).
    Waits for a daily check that is already running; raises YtDlpBusy while yt-dlp downloads."""
    with _update_lock:
        return _update(auto=False)


def _update(auto: bool) -> dict:
    if not _exe_gate.begin_update():
        raise YtDlpBusy(M("in_use"))
    try:
        result = _run_self_update()
    finally:
        _exe_gate.end_update()
    _save_state(result, auto)
    return result


def _run_self_update() -> dict:
    from backend.core.config import note_ytdlp_version, ytdlp_exe
    from backend.core.paths import get_paths

    exe = ytdlp_exe()
    if exe is None:
        return {"ok": False, "updated": False, "version": None, "message": M("missing")}
    if exe.parent != get_paths().tools_dir:
        return {"ok": False, "updated": False, "version": version(),
                "message": M("not_writable", folder=get_paths().tools_dir)}
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
        return {"ok": True, "updated": True, "version": after, "message": M("updated", version=after)}
    if "up to date" in output.lower() or "up-to-date" in output.lower():
        return {"ok": True, "updated": False, "version": after, "message": M("up_to_date", version=after)}
    tail = " ".join(output.strip().splitlines()[-2:])[:240]
    logger.warning("yt-dlp self-update failed: %s", output.strip()[-1000:])
    return {"ok": False, "updated": False, "version": after,
            "message": M("update_failed", tail=tail) if tail else M("update_failed_offline")}


# ---------------------------------------------------------------------------
# Daily update check
# ---------------------------------------------------------------------------

def _state_path() -> Path:
    from backend.core.paths import get_paths

    return get_paths().tools_dir / STATE_FILE


def update_state() -> dict:
    """The last update check of the tools copy: {checked_at (last success), attempted_at, ok, auto,
    version, message}, times as ISO strings in UTC; {} before the first one."""
    try:
        data = json.loads(_state_path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def _save_state(result: dict, auto: bool) -> None:
    now = datetime.now(timezone.utc).isoformat()
    state = update_state()
    state.update({"attempted_at": now, "ok": bool(result.get("ok")), "auto": auto,
                  "version": result.get("version"), "message": result.get("message")})
    if result.get("ok"):
        state["checked_at"] = now
    path = _state_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, path)
    except OSError as exc:
        logger.warning("Cannot save the yt-dlp update state: %s", exc)


def _age_s(iso: str | None, now: datetime) -> float:
    try:
        return (now - datetime.fromisoformat(str(iso))).total_seconds()
    except (TypeError, ValueError):
        return float("inf")


def maybe_auto_update(now: datetime | None = None) -> dict | None:
    """Housekeeping (backend/run.py): checks for a new yt-dlp once a day while `ytdlp.auto_update` is on,
    and only while no job or export runs (they may be running yt-dlp). A failed check is tried again
    after 3 hours. Returns the result when a check ran."""
    from backend.core import events
    from backend.core.db import get_db
    from backend.core.settings_store import get_settings

    if not get_settings()["ytdlp"].get("auto_update", True):
        return None
    now = now or datetime.now(timezone.utc)
    state = update_state()
    if _age_s(state.get("checked_at"), now) < AUTO_EVERY_S or _age_s(state.get("attempted_at"), now) < AUTO_RETRY_S:
        return None
    db = get_db()
    if (db.discovery_jobs.count_documents({"status": {"$in": ["running", "pending"]}})
            or db.render_jobs.count_documents({"status": {"$in": ["queued", "rendering"]}})):
        return None
    if not _update_lock.acquire(blocking=False):
        return None  # the Update button is running it now
    try:
        result = _update(auto=True)
    except YtDlpBusy:
        return None  # yt-dlp is downloading (e.g. an editor preparing a source video): next round
    finally:
        _update_lock.release()
    if result.get("updated"):
        events.notice(result["message"])
    elif not result.get("ok"):
        logger.info("Automatic yt-dlp update check failed, trying again in 3 hours: %s", result.get("message"))
    return result
