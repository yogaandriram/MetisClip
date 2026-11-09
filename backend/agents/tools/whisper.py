"""Groq Whisper speech-to-text."""
from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Any

from backend.core.secrets import get_secret

logger = logging.getLogger(__name__)


class WhisperError(RuntimeError):
    pass


def _model() -> str:
    try:
        from backend.core.settings_store import get_settings

        return get_settings()["whisper"]["model"]
    except Exception:
        return "whisper-large-v3-turbo"


def available() -> bool:
    return bool(get_secret("groq_api_key"))


def transcribe(audio_path: Path, *, words: bool, retries: int = 3) -> dict[str, Any]:
    """Returns the verbose_json payload as a dict ({text, segments, words?})."""
    from groq import Groq
    import groq

    key = get_secret("groq_api_key")
    if not key:
        raise WhisperError("API key Groq belum diisi di Pengaturan")
    client = Groq(api_key=key, max_retries=0, timeout=300.0)
    granularities = ["word", "segment"] if words else ["segment"]
    data = audio_path.read_bytes()
    last: Exception | None = None
    for attempt in range(retries + 1):
        try:
            res = client.audio.transcriptions.create(
                file=(audio_path.name, data),
                model=_model(),
                response_format="verbose_json",
                timestamp_granularities=granularities,
            )
            payload = res.model_dump() if hasattr(res, "model_dump") else dict(res)
            return payload
        except groq.AuthenticationError as exc:
            raise WhisperError("API key Groq ditolak. Periksa kembali di Pengaturan.") from exc
        except (groq.RateLimitError, groq.APIConnectionError, groq.APITimeoutError, groq.InternalServerError) as exc:
            last = exc
            if attempt >= retries:
                break
            wait = min(30, 3 * 2**attempt)
            logger.warning("Groq Whisper retry in %ss: %s", wait, exc)
            time.sleep(wait)
    raise WhisperError("Groq Whisper tidak dapat dihubungi setelah beberapa percobaan") from last


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
