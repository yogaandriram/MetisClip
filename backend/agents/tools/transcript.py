"""Transcript chain with a MongoDB cache (`transcripts`, _id = "yt:<youtube_id>").

youtube-transcript-api (en, id) -> full audio download + 20-min chunks + Groq
Whisper -> mock transcript (dev only).
"""
from __future__ import annotations

import logging
import shutil
from typing import Any, Callable

from backend.agents.context import PipelineError
from backend.agents.tools import ffmpeg_ops, whisper, ytdlp
from backend.core.config import config
from backend.core.db import get_db, utcnow
from backend.core.procs import CancelToken, Cancelled
from backend.core.paths import get_paths

logger = logging.getLogger(__name__)

CHUNK_SECONDS = 1200


def cached(youtube_id: str) -> list[dict[str, Any]] | None:
    doc = get_db().transcripts.find_one({"_id": f"yt:{youtube_id}"})
    return doc["segments"] if doc and doc.get("segments") else None


def _save(youtube_id: str, segments: list[dict[str, Any]], source: str, language: str | None) -> None:
    get_db().transcripts.replace_one(
        {"_id": f"yt:{youtube_id}"},
        {"_id": f"yt:{youtube_id}", "source": source, "language": language, "segments": segments, "fetched_at": utcnow()},
        upsert=True,
    )


def _from_youtube(youtube_id: str) -> tuple[list[dict[str, Any]], str | None]:
    from youtube_transcript_api import YouTubeTranscriptApi

    fetched = YouTubeTranscriptApi().fetch(youtube_id, languages=["en", "id"])
    raw = fetched.to_raw_data()
    segs = [{"text": str(e["text"]).replace("\n", " ").strip(), "start": float(e["start"]), "duration": float(e.get("duration", 0))}
            for e in raw if str(e.get("text", "")).strip()]
    return segs, getattr(fetched, "language_code", None)


def _from_whisper(youtube_id: str, cancel: CancelToken, on_status: Callable[[str], None] | None) -> list[dict[str, Any]]:
    work = get_paths().cache_dir / f"transcript-{youtube_id}"
    try:
        if on_status:
            on_status("Subtitle YouTube tidak tersedia, mengunduh audio untuk Whisper…")
        audio = ytdlp.download_audio(youtube_id, work, cancel)
        chunks = ffmpeg_ops.chunk_audio(audio, work / "chunks", CHUNK_SECONDS, cancel)
        if not chunks:
            raise PipelineError("Gagal memecah audio untuk transkripsi")
        segments: list[dict[str, Any]] = []
        for i, chunk in enumerate(chunks):
            cancel.check()
            if on_status:
                on_status(f"Transkripsi Whisper bagian {i + 1}/{len(chunks)}…")
            payload = whisper.transcribe(chunk, words=False)
            offset = i * CHUNK_SECONDS
            for seg in payload.get("segments") or []:
                text = str(seg.get("text", "")).strip()
                if not text:
                    continue
                start = float(seg.get("start", 0))
                end = float(seg.get("end", start))
                segments.append({"text": text, "start": round(start + offset, 3), "duration": round(max(0.0, end - start), 3)})
        return segments
    finally:
        shutil.rmtree(work, ignore_errors=True)


def get_transcript(
    youtube_id: str, cancel: CancelToken, on_status: Callable[[str], None] | None = None
) -> list[dict[str, Any]]:
    hit = cached(youtube_id)
    if hit:
        return hit
    try:
        segs, lang = _from_youtube(youtube_id)
        if segs:
            _save(youtube_id, segs, "youtube", lang)
            return segs
    except Exception as exc:
        logger.info("youtube-transcript-api failed for %s: %s", youtube_id, exc)
    cancel.check()

    if whisper.available():
        try:
            segs = _from_whisper(youtube_id, cancel, on_status)
            if segs:
                _save(youtube_id, segs, "whisper", None)
                return segs
        except Cancelled:
            raise
        except Exception as exc:
            logger.warning("Whisper transcript fallback failed for %s: %s", youtube_id, exc)
            if not config.is_dev:
                raise PipelineError(f"Transkrip video {youtube_id} tidak bisa diambil: {exc}") from exc

    if config.is_dev:
        logger.warning("Using dev mock transcript for %s", youtube_id)
        return MOCK_TRANSCRIPT
    raise PipelineError(
        f"Transkrip video {youtube_id} tidak tersedia. Isi API key Groq di Pengaturan agar audio bisa ditranskripsi dengan Whisper."
    )


MOCK_TRANSCRIPT: list[dict[str, Any]] = [
    {"text": "Hello everyone and welcome back to the channel.", "start": 0.0, "duration": 3.2},
    {"text": "Today we have a very special episode.", "start": 3.2, "duration": 2.5},
    {"text": "We are going to talk about the future of artificial intelligence and AGI.", "start": 5.7, "duration": 4.1},
    {"text": "And many people keep asking me: is GPT-5 already here?", "start": 9.8, "duration": 3.8},
    {"text": "Here's what nobody tells you about AI right now.", "start": 13.6, "duration": 4.5},
    {"text": "Everyone thinks scaling compute is the only way to reach artificial general intelligence.", "start": 18.1, "duration": 5.2},
    {"text": "But that is a complete lie. Let me explain why.", "start": 23.3, "duration": 4.0},
    {"text": "The real secret isn't bigger neural networks. The secret is agentic reasoning.", "start": 27.3, "duration": 5.5},
    {"text": "An AI that can run loops, test its own code, and self-correct on the fly.", "start": 32.8, "duration": 5.1},
    {"text": "That is what will replace 90 percent of software engineering jobs by next year.", "start": 37.9, "duration": 4.8},
    {"text": "It sounds scary but it is the ultimate truth that founders aren't ready to hear.", "start": 42.7, "duration": 5.0},
    {"text": "If you are not building agents, you are basically building legacy software.", "start": 47.7, "duration": 4.8},
    {"text": "We need to shift our focus immediately from chat interfaces to autonomous agents.", "start": 52.5, "duration": 5.5},
    {"text": "That is the absolute core of the new internet economy.", "start": 58.0, "duration": 4.2},
    {"text": "Let's pause here and talk about security implications.", "start": 62.2, "duration": 3.8},
    {"text": "Because when agents can buy server space and code themselves, they become unstoppable.", "start": 66.0, "duration": 5.5},
    {"text": "This is not science fiction. It is happening in private labs today.", "start": 71.5, "duration": 4.5},
    {"text": "So, how do you prepare for this disruption? You adapt or you fail.", "start": 76.0, "duration": 5.2},
]
