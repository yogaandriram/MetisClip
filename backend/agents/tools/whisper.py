"""Speech-to-text: Groq Whisper (online) and the built-in local whisper.cpp engine (`whisper_local`).

`whisper.provider` in Pengaturan:
  * "auto" (default): Groq while a key is set and Groq answers. When there is no key, or Groq fails
    (offline, quota, rejected key, server error), the local engine takes over, and Groq is skipped
    for a while so the next chunks and clips do not wait for it again.
  * "local": always the local engine; no network needed once the model is downloaded.
  * "groq":  always Groq; fails without a key, like before the local engine existed.

Both engines return the same verbose_json-like dict: {text, language?, segments, words?}.
"""
from __future__ import annotations

import logging
import threading
import time
from pathlib import Path
from typing import Any, Callable

from backend.core.procs import CancelToken
from backend.core.secrets import get_secret

logger = logging.getLogger(__name__)

PROVIDERS = ("auto", "local", "groq")


class WhisperError(RuntimeError):
    pass


class GroqError(WhisperError):
    """A Groq failure after its retries. `pause` = seconds "auto" mode skips Groq afterwards."""

    def __init__(self, message: str, pause: float = 0.0):
        super().__init__(message)
        self.pause = pause


_pause_lock = threading.Lock()
_groq_paused_until = 0.0


def _pause_groq(seconds: float) -> None:
    global _groq_paused_until
    if seconds <= 0:
        return
    with _pause_lock:
        _groq_paused_until = max(_groq_paused_until, time.monotonic() + seconds)


def _groq_paused() -> bool:
    with _pause_lock:
        return time.monotonic() < _groq_paused_until


def resume_groq() -> None:
    """Forget an earlier Groq failure (a new key was saved)."""
    global _groq_paused_until
    with _pause_lock:
        _groq_paused_until = 0.0


def _settings() -> dict[str, Any]:
    try:
        from backend.core.settings_store import get_settings

        return get_settings()["whisper"]
    except Exception:
        return {}


def provider() -> str:
    value = _settings().get("provider", "auto")
    return value if value in PROVIDERS else "auto"


def _model() -> str:
    return _settings().get("model") or "whisper-large-v3-turbo"


def _local_ready() -> bool:
    from backend.agents.tools import whisper_local

    return whisper_local.binary() is not None


def available() -> bool:
    """Whether a transcription can be attempted with the current settings."""
    p = provider()
    if p == "groq":
        return bool(get_secret("groq_api_key"))
    if p == "local":
        return _local_ready()
    return bool(get_secret("groq_api_key")) or _local_ready()


def unavailable_reason() -> str:
    """Indonesian explanation for when `available()` is False."""
    if provider() == "groq":
        return "Transkripsi diatur ke Groq, tetapi API key Groq belum diisi. Isi key-nya atau pilih mode Otomatis di Pengaturan."
    return "Whisper lokal tidak ditemukan di folder aplikasi. Pasang ulang MetisClip, atau isi API key Groq di Pengaturan."


def transcribe(
    audio_path: Path,
    *,
    words: bool,
    cancel: CancelToken | None = None,
    on_status: Callable[[str], None] | None = None,
) -> dict[str, Any]:
    """Transcribe with the engine chosen in Pengaturan (see the module docstring)."""
    from backend.agents.tools import whisper_local

    p = provider()
    if p == "groq":
        return _groq_transcribe(audio_path, words=words)
    if p == "local":
        return whisper_local.transcribe(audio_path, words=words, cancel=cancel, on_status=on_status)
    if get_secret("groq_api_key") and not _groq_paused():
        try:
            # One quick retry only: the local engine is the better fallback than waiting on Groq
            return _groq_transcribe(audio_path, words=words, retries=1)
        except GroqError as exc:
            if not _local_ready():
                raise
            _pause_groq(exc.pause)
            logger.warning("Groq Whisper unavailable, using local Whisper: %s", exc)
            if on_status:
                on_status(f"{exc} Beralih ke Whisper lokal…")
    if cancel is not None:
        cancel.check()
    return whisper_local.transcribe(audio_path, words=words, cancel=cancel, on_status=on_status)


def _groq_transcribe(audio_path: Path, *, words: bool, retries: int = 3) -> dict[str, Any]:
    """Groq verbose_json payload as a dict ({text, segments, words?})."""
    from groq import Groq
    import groq

    key = get_secret("groq_api_key")
    if not key:
        raise GroqError("API key Groq belum diisi di Pengaturan.")
    client = Groq(api_key=key, max_retries=0, timeout=300.0)
    granularities = ["word", "segment"] if words else ["segment"]
    data = audio_path.read_bytes()
    last: Exception | None = None
    pause = 120.0
    for attempt in range(retries + 1):
        try:
            res = client.audio.transcriptions.create(
                file=(audio_path.name, data),
                model=_model(),
                response_format="verbose_json",
                timestamp_granularities=granularities,
            )
            return res.model_dump() if hasattr(res, "model_dump") else dict(res)
        except groq.AuthenticationError as exc:
            raise GroqError("API key Groq ditolak. Periksa kembali di Pengaturan.", pause=3600) from exc
        except groq.RateLimitError as exc:
            last, pause = exc, 900.0  # quota: the hourly audio limit resets slowly
        except (groq.APIConnectionError, groq.APITimeoutError, groq.InternalServerError) as exc:
            last, pause = exc, 120.0
        except groq.APIStatusError as exc:  # e.g. 413 file too large: not worth a retry or a pause
            raise GroqError(f"Groq Whisper menolak permintaan (HTTP {exc.status_code}).") from exc
        if attempt >= retries:
            break
        wait = min(30, 3 * 2**attempt)
        logger.warning("Groq Whisper retry in %ss: %s", wait, last)
        time.sleep(wait)
    if pause >= 900:
        raise GroqError("Kuota Groq Whisper sedang habis.", pause=pause) from last
    raise GroqError("Groq Whisper tidak dapat dihubungi.", pause=pause) from last


def words_from_payload(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Word timings from verbose_json; splits segments evenly when only segment timing exists."""
    out: list[dict[str, Any]] = []
    for w in payload.get("words") or []:
        text = str(w.get("word", "")).strip()
        if not text:
            continue
        out.append({"word": text, "start": round(float(w.get("start", 0)), 3), "end": round(float(w.get("end", 0)), 3)})
    if out:
        return out
    for seg in payload.get("segments") or []:
        out.extend(split_evenly(str(seg.get("text", "")), float(seg.get("start", 0)), float(seg.get("end", 0))))
    return out


def split_evenly(text: str, start: float, end: float) -> list[dict[str, Any]]:
    tokens = text.split()
    if not tokens:
        return []
    end = max(end, start + 0.2 * len(tokens))
    step = (end - start) / len(tokens)
    return [
        {"word": t, "start": round(start + i * step, 3), "end": round(start + (i + 1) * step, 3)}
        for i, t in enumerate(tokens)
    ]


def test_key(api_key: str) -> tuple[bool, str]:
    import requests

    try:
        r = requests.get("https://api.groq.com/openai/v1/models", headers={"Authorization": f"Bearer {api_key}"}, timeout=20)
    except requests.RequestException:
        return False, "Tidak dapat terhubung ke Groq"
    if r.status_code == 200:
        return True, "API key Groq valid"
    if r.status_code in (401, 403):
        return False, "API key Groq ditolak"
    return False, f"Groq mengembalikan HTTP {r.status_code}"
