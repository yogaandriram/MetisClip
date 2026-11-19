"""Local speech-to-text with whisper.cpp: the bundled `whisper-cli.exe` and a GGML model.

Models are not in the installer. Each one is downloaded once, on first use or from Pengaturan, into
`<DATA_ROOT>\\models\\whisper\\`, resumed after a broken connection and checked against a pinned
SHA256. Transcription runs one at a time, at below-normal priority, on about half the CPU threads.
It does not start while an export render runs (`core/workload.py`), nor before the RAM its model
needs is free (`core/resources.py`).

whisper-cli takes paths as narrow strings, which breaks on non-ASCII folder names (a Windows user
name such as `C:\\Users\\Dédé`). It therefore runs with the data folder as its working directory and
only gets ASCII paths relative to it: the model, and a 16 kHz WAV copy of the input in the cache.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import shutil
import subprocess
import threading
import uuid
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from backend.agents.tools.whisper import WhisperError
from backend.core import events, procs, resources, workload
from backend.core.config import ffmpeg_path, whisper_cli_path
from backend.core.paths import get_paths
from backend.core import i18n

M = i18n.messages({
    "desc:small": {
        "id": "Paling cepat dan ringan (RAM sekitar 0,5 GB). Cocok untuk laptop 8 GB.",
        "en": "Fastest and lightest (about 0.5 GB of RAM). Good for 8 GB laptops.",
    },
    "desc:large-v3-turbo": {
        "id": "Lebih akurat untuk bahasa Indonesia, tetapi beberapa kali lebih lambat (RAM sekitar 1,5 GB).",
        "en": "More accurate for Indonesian, but several times slower (about 1.5 GB of RAM).",
    },
    "offline": {
        "id": "Model Whisper lokal belum terunduh dan internet tidak tersedia. Sambungkan internet sekali untuk mengunduhnya ({mb} MB).",
        "en": "The local Whisper model is not downloaded yet and there is no internet. Connect once to download it ({mb} MB).",
    },
    "http_failed": {
        "id": "Unduhan model Whisper gagal (HTTP {status}). Coba lagi nanti.",
        "en": "The Whisper model download failed (HTTP {status}). Try again later.",
    },
    "connection_lost": {
        "id": "Koneksi terputus saat mengunduh model Whisper. Unduhan dilanjutkan saat dicoba lagi.",
        "en": "The connection dropped while downloading the Whisper model. The download continues when you try again.",
    },
    "checksum": {
        "id": "File model Whisper yang terunduh rusak (checksum tidak cocok). Coba unduh lagi.",
        "en": "The downloaded Whisper model file is damaged (checksum mismatch). Try downloading it again.",
    },
    "download_cancelled": {
        "id": "Unduhan model Whisper dibatalkan. Unduh lagi di Pengaturan, lalu lanjutkan job ini.",
        "en": "The Whisper model download was cancelled. Download it again in Settings, then resume this job.",
    },
    "download_failed": {
        "id": "Unduhan model Whisper gagal: {error}",
        "en": "The Whisper model download failed: {error}",
    },
    "downloading_busy": {
        "id": "Model ini sedang diunduh. Batalkan unduhannya dulu.",
        "en": "This model is downloading. Cancel the download first.",
    },
    "in_use": {
        "id": "Model ini sedang dipakai untuk transkripsi. Coba lagi setelah selesai.",
        "en": "This model is in use for a transcription. Try again when it is done.",
    },
    "delete_failed": {
        "id": "Model tidak bisa dihapus: {error}",
        "en": "The model couldn't be deleted: {error}",
    },
    "binary_missing": {
        "id": "Whisper lokal tidak ditemukan di folder aplikasi. Pasang ulang MetisClip.",
        "en": "Local Whisper was not found in the app folder. Reinstall MetisClip.",
    },
    "downloading_model": {
        "id": "Mengunduh model Whisper lokal {model} ({mb} MB, sekali saja)…",
        "en": "Downloading the local Whisper model {model} ({mb} MB, only once)…",
    },
    "downloading_pct": {
        "id": "Mengunduh model Whisper lokal: {pct}%",
        "en": "Downloading the local Whisper model: {pct}%",
    },
    "hold_label": {
        "id": "Whisper lokal {model}",
        "en": "Local Whisper {model}",
    },
    "waiting_other": {
        "id": "Menunggu Whisper lokal selesai mentranskripsi bagian lain…",
        "en": "Waiting for local Whisper to finish another part…",
    },
    "waiting_render": {
        "id": "Whisper lokal menunggu export video selesai…",
        "en": "Local Whisper is waiting for a video export to finish…",
    },
    "progress": {
        "id": "Transkripsi Whisper lokal: {pct}%",
        "en": "Local Whisper transcription: {pct}%",
    },
    "failed": {
        "id": "Whisper lokal gagal (kode {code}). {detail}",
        "en": "Local Whisper failed (code {code}). {detail}",
    },
})

logger = logging.getLogger(__name__)

# Hugging Face repo of the whisper.cpp project, pinned to one revision; every file is also SHA256-checked
_MODEL_REPO = "https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/"


@dataclass(frozen=True)
class LocalModel:
    id: str
    label: str
    description: str
    file: str
    size_bytes: int
    sha256: str

    @property
    def url(self) -> str:
        return _MODEL_REPO + self.file


def describe(model: LocalModel) -> str:
    """The model's description in the UI language."""
    key = f"desc:{model.id}"
    return M(key) if key in M.entries else model.description


MODELS: dict[str, LocalModel] = {
    m.id: m
    for m in (
        LocalModel(
            id="small",
            label="Small",
            description="",  # describe(): in the UI language
            file="ggml-small-q5_1.bin",
            size_bytes=190_085_487,
            sha256="ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb",
        ),
        LocalModel(
            id="large-v3-turbo",
            label="Large v3 Turbo",
            description="",
            file="ggml-large-v3-turbo-q5_0.bin",
            size_bytes=574_041_195,
            sha256="394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2",
        ),
    )
}

# "auto": full-video transcripts (input for the Analyzer, often an hour or more) always use the
# small model, because large-v3-turbo runs slower than real time on laptop CPUs. Clip subtitles
# (about a minute each, and what viewers read) use large-v3-turbo on PCs with this much RAM and cores.
_TURBO_MIN_RAM_GB = 16
_TURBO_MIN_CORES = 8


class LocalWhisperError(WhisperError):
    pass


# ---------------------------------------------------------------------------
# Binary, hardware and model choice
# ---------------------------------------------------------------------------

def binary() -> Path | None:
    return whisper_cli_path()


def version() -> str | None:
    exe = binary()
    if exe is None:
        return None
    try:
        out = procs.run([str(exe), "--version"], timeout=20, check=False)
    except Exception:
        return None
    m = re.search(r"version:\s*([\w.\-]+)", (out.stdout + out.stderr).decode("utf-8", "replace"))
    return m.group(1) if m else None


def _hardware() -> tuple[int, int, float]:
    """(physical cores, logical threads, RAM in GB)."""
    import psutil

    logical = psutil.cpu_count() or os.cpu_count() or 2
    physical = psutil.cpu_count(logical=False) or logical
    return physical, logical, psutil.virtual_memory().total / 1024**3


def threads() -> int:
    """About half the CPU threads, so the rest of the pipeline and the user's other apps keep running."""
    _, logical, _ = _hardware()
    return max(2, min(8, logical // 2))


def recommended_model_id(words: bool = True) -> str:
    """The "auto" model: small for full transcripts; for clip subtitles, turbo on strong enough PCs."""
    if not words:
        return "small"
    physical, _, ram_gb = _hardware()
    if ram_gb >= _TURBO_MIN_RAM_GB and physical >= _TURBO_MIN_CORES:
        return "large-v3-turbo"
    return "small"


def model_setting() -> str:
    try:
        from backend.core.settings_store import get_settings

        value = get_settings()["whisper"].get("local_model", "auto")
    except Exception:
        value = "auto"
    return value if value in MODELS or value == "auto" else "auto"


def chosen_model(words: bool = True) -> LocalModel:
    """The model for clip subtitles (`words`) or for a full-video transcript."""
    setting = model_setting()
    return MODELS[recommended_model_id(words) if setting == "auto" else setting]


def models_dir() -> Path:
    return get_paths().models_dir / "whisper"


def model_path(model: LocalModel) -> Path:
    return models_dir() / model.file


def installed(model: LocalModel) -> bool:
    try:
        return model_path(model).stat().st_size == model.size_bytes
    except OSError:
        return False


# ---------------------------------------------------------------------------
# Model download (resumable, SHA256-checked, one per model at a time)
# ---------------------------------------------------------------------------

_state_lock = threading.Lock()
_model_locks: dict[str, threading.Lock] = {m: threading.Lock() for m in MODELS}
# model id -> {"status": downloading|failed|cancelled, "progress": 0-100, "error": str|None, "cancel": CancelToken}
_downloads: dict[str, dict[str, Any]] = {}


def download_state(model_id: str) -> dict[str, Any] | None:
    with _state_lock:
        st = _downloads.get(model_id)
        return None if st is None else {k: v for k, v in st.items() if k != "cancel"}


def active_downloads() -> int:
    """Model downloads running right now."""
    with _state_lock:
        return sum(1 for st in _downloads.values() if st.get("status") == "downloading")


def _set_state(model_id: str, **fields: Any) -> None:
    with _state_lock:
        _downloads.setdefault(model_id, {}).update(fields)


def _publish(model_id: str, status: str, progress: float, message: str | None = None) -> None:
    events.publish({"type": "whisper.download", "id": model_id, "status": status,
                    "progress": round(progress, 1), "message": message})


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _download(model: LocalModel, check: Callable[[], None],
              on_progress: Callable[[float], None] | None) -> None:
    """Download into `<file>.part` (resumed when present), verify, then rename. `check` raises Cancelled."""
    import requests

    dest = model_path(model)
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_name(dest.name + ".part")
    digest = hashlib.sha256()
    have = part.stat().st_size if part.exists() else 0
    if have >= model.size_bytes:  # complete but never renamed (crash), or too big
        if have == model.size_bytes and _sha256(part) == model.sha256:
            os.replace(part, dest)
            return
        part.unlink()
        have = 0
    headers = {"User-Agent": "MetisClip"}
    if have:
        headers["Range"] = f"bytes={have}-"
    try:
        resp = requests.get(model.url, headers=headers, stream=True, timeout=(20, 60))
    except requests.RequestException as exc:
        raise LocalWhisperError(M("offline", mb=f"{model.size_bytes / 1024**2:.0f}")) from exc
    with resp:
        if have and resp.status_code == 206:
            with part.open("rb") as f:
                for block in iter(lambda: f.read(1024 * 1024), b""):
                    digest.update(block)
            mode = "ab"
        elif resp.status_code == 200:
            have, mode = 0, "wb"
        else:
            raise LocalWhisperError(M("http_failed", status=resp.status_code))
        done = have
        last_pct = -1.0
        try:
            with part.open(mode) as f:
                for block in resp.iter_content(chunk_size=1024 * 1024):
                    check()
                    if not block:
                        continue
                    f.write(block)
                    digest.update(block)
                    done += len(block)
                    pct = min(100.0, done * 100.0 / model.size_bytes)
                    if pct - last_pct >= 1.0:
                        if on_progress and int(pct) // 5 > int(max(last_pct, 0)) // 5:
                            on_progress(pct)
                        last_pct = pct
                        _set_state(model.id, progress=round(pct, 1))
                        _publish(model.id, "downloading", pct)
        except requests.RequestException as exc:
            raise LocalWhisperError(M("connection_lost")) from exc
    if done != model.size_bytes or digest.hexdigest() != model.sha256:
        part.unlink(missing_ok=True)
        raise LocalWhisperError(M("checksum"))
    os.replace(part, dest)


def ensure_model(model: LocalModel, cancel: procs.CancelToken | None = None,
                 on_progress: Callable[[float], None] | None = None) -> Path:
    """The model file, downloading it first when missing. Concurrent callers wait for one download.

    `cancel` is the job's token. The download has a token of its own, so "Batalkan" in Pengaturan
    stops only the download: a job that was waiting for it then fails with a clear message.
    """
    if installed(model):
        return model_path(model)
    lock = _model_locks[model.id]
    while not lock.acquire(timeout=1.0):  # another job or Pengaturan is downloading it
        if cancel is not None:
            cancel.check()
    try:
        if installed(model):
            return model_path(model)
        own = procs.CancelToken()

        def check() -> None:
            if cancel is not None:
                cancel.check()
            own.check()

        _set_state(model.id, status="downloading", progress=0.0, error=None, cancel=own)
        _publish(model.id, "downloading", 0.0)
        try:
            _download(model, check, on_progress)
        except procs.Cancelled:
            _set_state(model.id, status="cancelled", error=None)
            _publish(model.id, "cancelled", 0.0)
            if cancel is not None and cancel.cancelled:
                raise
            raise LocalWhisperError(M("download_cancelled")) from None
        except Exception as exc:
            message = str(exc) if isinstance(exc, LocalWhisperError) else M("download_failed", error=exc)
            _set_state(model.id, status="failed", error=message)
            _publish(model.id, "failed", 0.0, message)
            if isinstance(exc, LocalWhisperError):
                raise
            raise LocalWhisperError(message) from exc
    finally:
        lock.release()
    with _state_lock:
        _downloads.pop(model.id, None)
    _publish(model.id, "completed", 100.0)
    return model_path(model)


def start_download(model_id: str) -> bool:
    """Download in the background (Pengaturan). False when it is already installed or downloading."""
    model = MODELS[model_id]
    if installed(model):
        return False
    st = download_state(model_id)
    if st and st.get("status") == "downloading":
        return False

    def work() -> None:
        try:
            ensure_model(model)
        except Exception as exc:  # state and event already carry the message
            logger.warning("Whisper model download %s failed: %s", model_id, exc)

    threading.Thread(target=work, name=f"whisper-download-{model_id}", daemon=True).start()
    return True


def cancel_download(model_id: str) -> bool:
    with _state_lock:
        st = _downloads.get(model_id)
        token = st.get("cancel") if st and st.get("status") == "downloading" else None
    if token is None:
        return False
    token.cancel()
    return True


def delete_model(model_id: str) -> None:
    model = MODELS[model_id]
    st = download_state(model_id)
    if st and st.get("status") == "downloading":
        raise LocalWhisperError(M("downloading_busy"))
    if _run_lock.locked() and _active_model == model_id:
        raise LocalWhisperError(M("in_use"))
    for p in (model_path(model), model_path(model).with_name(model.file + ".part")):
        try:
            p.unlink(missing_ok=True)
        except OSError as exc:
            raise LocalWhisperError(M("delete_failed", error=exc)) from exc
    with _state_lock:
        _downloads.pop(model_id, None)


# ---------------------------------------------------------------------------
# Transcription
# ---------------------------------------------------------------------------

_run_lock = threading.Lock()
_active_model: str | None = None
_PROGRESS = re.compile(r"progress\s*=\s*(\d+)%")
_SPECIAL = re.compile(r"^\[_.*\]$")


def busy() -> bool:
    return _run_lock.locked()


def _rel(path: Path, root: Path) -> str:
    return os.path.relpath(path, root)


def _wav_seconds(wav: Path) -> float:
    return max(0.0, (wav.stat().st_size - 44) / 32000.0)  # 16 kHz, mono, 16-bit


def transcribe(
    audio_path: Path,
    *,
    words: bool,
    cancel: procs.CancelToken | None = None,
    on_status: Callable[[str], None] | None = None,
) -> dict[str, Any]:
    """Transcribe an audio or video file. Returns a Groq-like verbose_json dict:
    {text, language, segments: [{text, start, end}], words: [{word, start, end}]}.
    """
    global _active_model
    exe = binary()
    if exe is None:
        raise LocalWhisperError(M("binary_missing"))
    model = chosen_model(words)
    if not installed(model):
        if on_status:
            on_status(M("downloading_model", model=model.label, mb=f"{model.size_bytes / 1024**2:.0f}"))
        ensure_model(model, cancel, (lambda pct: on_status(M("downloading_pct", pct=f"{pct:.0f}"))) if on_status else None)

    # RAM first, then the one-at-a-time lock: a Processor clip takes them in that order too (its clip
    # hold covers this one, holds being re-entrant), so the two can never wait on each other
    waited: list[bool] = []

    def tell_wait(message: str) -> None:
        waited.append(True)
        if on_status:
            on_status(message)

    with resources.hold("whisper", resources.WHISPER_MB.get(model.id, 1000), label=M("hold_label", model=model.label),
                        cancel=cancel, on_wait=lambda info: tell_wait(info.message())):
        if _run_lock.locked():
            tell_wait(M("waiting_other"))
        with _run_lock:
            workload.wait_for_renders(cancel, lambda: tell_wait(M("waiting_render")))
            if waited and on_status:  # the job's activity would still say it waits
                on_status(M("progress", pct=0))
            _active_model = model.id
            try:
                return _run(exe, model, audio_path, cancel, on_status)
            finally:
                _active_model = None


def _run(exe: Path, model: LocalModel, audio_path: Path, cancel: procs.CancelToken | None,
         on_status: Callable[[str], None] | None) -> dict[str, Any]:
    paths = get_paths()
    root = paths.data_root
    work = paths.cache_dir / f"whisper-{uuid.uuid4().hex[:12]}"
    work.mkdir(parents=True, exist_ok=True)
    try:
        wav = work / "in.wav"
        procs.run(
            [ffmpeg_path(), "-y", "-hide_banner", "-loglevel", "error", "-i", str(audio_path), "-vn",
             "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(wav)],
            cancel=cancel, timeout=1800,
        )
        seconds = _wav_seconds(wav)
        if seconds < 0.1:
            return {"text": "", "language": None, "segments": [], "words": []}
        cmd = [str(exe), "-m", _rel(model_path(model), root), "-f", _rel(wav, root), "-of", _rel(work / "out", root),
               "-t", str(threads()), "-l", "auto", "-ojf", "-np", "-pp"]
        tail: deque[str] = deque(maxlen=30)
        p = procs.popen(cmd, cancel=cancel, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                        stderr=subprocess.PIPE, cwd=root, text=True, low_priority=True)
        timer = threading.Timer(max(900.0, seconds * 8), lambda: procs.kill_tree(p.pid))
        timer.start()
        try:
            last = -1
            assert p.stderr is not None
            for line in procs.iter_lines(p.stderr):
                tail.append(line)
                m = _PROGRESS.search(line)
                if m and on_status and int(m.group(1)) >= last + 10:
                    last = int(m.group(1))
                    on_status(M("progress", pct=last))
            rc = p.wait()
        finally:
            timer.cancel()
            procs.release(p, cancel)
        if cancel is not None:
            cancel.check()
        out = work / "out.json"
        if rc != 0 or not out.exists():
            detail = " ".join(line for line in tail if "error" in line.lower())[-300:]
            raise LocalWhisperError(M("failed", code=rc, detail=detail).strip())
        data = json.loads(out.read_bytes().decode("utf-8", "replace"), strict=False)
        return parse_output(data)
    finally:
        shutil.rmtree(work, ignore_errors=True)


def parse_output(data: dict[str, Any]) -> dict[str, Any]:
    """whisper-cli `-ojf` JSON -> {text, language, segments, words}. Offsets are in milliseconds."""
    segments: list[dict[str, Any]] = []
    words: list[dict[str, Any]] = []
    for seg in data.get("transcription") or []:
        text = str(seg.get("text") or "").replace("\ufffd", "").strip()
        if not text:
            continue
        off = seg.get("offsets") or {}
        start = float(off.get("from", 0)) / 1000.0
        end = float(off.get("to", 0)) / 1000.0
        segments.append({"text": text, "start": round(start, 3), "end": round(max(start, end), 3)})
        seg_words = _words_from_tokens(seg.get("tokens") or [])
        words.extend(seg_words or _even_words(text, start, end))
    _fix_timings(words)
    return {
        "text": " ".join(s["text"] for s in segments),
        "language": (data.get("result") or {}).get("language"),
        "segments": segments,
        "words": words,
    }


def _words_from_tokens(tokens: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Merge sub-word tokens into words: a token that starts with a space starts a new word."""
    out: list[dict[str, Any]] = []
    cur: dict[str, Any] | None = None
    for tok in tokens:
        raw = str(tok.get("text") or "")
        if not raw or _SPECIAL.match(raw.strip()):
            continue
        off = tok.get("offsets") or {}
        a = float(off.get("from", 0)) / 1000.0
        b = float(off.get("to", 0)) / 1000.0
        if cur is None or raw.startswith(" "):
            if cur is not None:
                out.append(cur)
            cur = {"word": raw, "start": a, "end": max(a, b)}
        else:
            cur["word"] += raw
            cur["end"] = max(cur["end"], b)
    if cur is not None:
        out.append(cur)
    result = []
    for w in out:
        text = w["word"].replace("\ufffd", "").strip()
        if text:
            result.append({"word": text, "start": w["start"], "end": w["end"]})
    return result


def _even_words(text: str, start: float, end: float) -> list[dict[str, Any]]:
    from backend.agents.tools.whisper import split_evenly

    return split_evenly(text, start, end)


def _fix_timings(words: list[dict[str, Any]]) -> None:
    """Monotonic, non-overlapping word times; zero-length words get up to 0.3 s before the next word."""
    prev_start = 0.0
    for i, w in enumerate(words):
        start = max(float(w["start"]), prev_start)
        nxt = float(words[i + 1]["start"]) if i + 1 < len(words) else None
        end = max(float(w["end"]), start)
        if end - start < 0.08:
            end = start + 0.3
        if nxt is not None and nxt >= start:
            end = min(end, nxt)
        w["start"] = round(start, 3)
        w["end"] = round(max(end, start + 0.02), 3)
        prev_start = start
