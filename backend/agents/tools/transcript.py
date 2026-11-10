"""Transcript chain with a MongoDB cache (`transcripts`).

YouTube video (_id "yt:<youtube_id>"): youtube-transcript-api (en, id) -> full audio download
+ 20-min chunks + Whisper -> mock transcript (dev only).
Uploaded video file (_id "file:<fingerprint>"): its audio track in 20-min chunks + Whisper
-> mock transcript (dev only). The fingerprint changes when the file changes.
Whisper is Groq or the local engine, as chosen in Pengaturan (`tools/whisper.py`).
"""
from __future__ import annotations

import logging
import shutil
from pathlib import Path
from typing import Any, Callable

from backend.agents.context import PipelineError
from backend.agents.tools import ffmpeg_ops, whisper, ytdlp
from backend.core.config import config
from backend.core.db import get_db, utcnow
from backend.core.procs import CancelToken, Cancelled
from backend.core.paths import get_paths

logger = logging.getLogger(__name__)

CHUNK_SECONDS = 1200


def cache_key(video: dict[str, Any]) -> str:
    """Transcript cache id of a source video document (or segment)."""
    if video.get("file_path"):
        return f"file:{video['file_fingerprint']}"
    return f"yt:{video['youtube_id']}"


def _label(video: dict[str, Any]) -> str:
    return Path(video["file_path"]).name if video.get("file_path") else str(video.get("youtube_id"))


def cached(key: str) -> list[dict[str, Any]] | None:
    doc = get_db().transcripts.find_one({"_id": key})
    return doc["segments"] if doc and doc.get("segments") else None


def _save(key: str, segments: list[dict[str, Any]], source: str, language: str | None) -> None:
    get_db().transcripts.replace_one(
        {"_id": key},
        {"_id": key, "source": source, "language": language, "segments": segments, "fetched_at": utcnow()},
        upsert=True,
    )


def _from_youtube(youtube_id: str) -> tuple[list[dict[str, Any]], str | None]:
    from youtube_transcript_api import YouTubeTranscriptApi

    fetched = YouTubeTranscriptApi().fetch(youtube_id, languages=["en", "id"])
    raw = fetched.to_raw_data()
    segs = [{"text": str(e["text"]).replace("\n", " ").strip(), "start": float(e["start"]), "duration": float(e.get("duration", 0))}
            for e in raw if str(e.get("text", "")).strip()]
    return segs, getattr(fetched, "language_code", None)


def _partial_id(key: str) -> str:
    return f"partial:{key}"


def _whisper_chunks(
    key: str, chunks: list[Path], cancel: CancelToken, on_status: Callable[[str], None] | None
) -> tuple[list[dict[str, Any]], str | None]:
    """Transcribe the chunks in order. Each finished chunk is stored in a `partial:<key>` document, so
    a resumed job (or a retry after a crash) continues with the next chunk instead of starting over.
    """
    if not chunks:
        raise PipelineError("Gagal memecah audio untuk transkripsi")
    db = get_db()
    partial = db.transcripts.find_one({"_id": _partial_id(key)}) or {}
    done: dict[str, Any] = partial.get("chunks") if partial.get("chunk_seconds") == CHUNK_SECONDS else None
    if done is None:
        done = {}
        db.transcripts.replace_one(
            {"_id": _partial_id(key)},
            {"_id": _partial_id(key), "source": "whisper", "segments": [], "chunk_seconds": CHUNK_SECONDS,
             "chunks": {}, "fetched_at": utcnow()},
            upsert=True,
        )
    segments: list[dict[str, Any]] = []
    language: str | None = partial.get("language")
    for i, chunk in enumerate(chunks):
        cancel.check()
        if str(i) in done:
            segments.extend(done[str(i)])
            continue
        label = f"bagian {i + 1}/{len(chunks)}"
        if on_status:
            on_status(f"Transkripsi Whisper {label}…")
        status = (lambda msg, label=label: on_status(f"{msg} ({label})")) if on_status else None
        payload = whisper.transcribe(chunk, words=False, cancel=cancel, on_status=status)
        offset = i * CHUNK_SECONDS
        part: list[dict[str, Any]] = []
        for seg in payload.get("segments") or []:
            text = str(seg.get("text", "")).strip()
            if not text:
                continue
            start = float(seg.get("start", 0))
            end = float(seg.get("end", start))
            part.append({"text": text, "start": round(start + offset, 3), "duration": round(max(0.0, end - start), 3)})
        segments.extend(part)
        language = language or payload.get("language")
        db.transcripts.update_one(
            {"_id": _partial_id(key)},
            {"$set": {f"chunks.{i}": part, "language": language, "fetched_at": utcnow()}},
        )
    return segments, language


def _from_whisper(
    video: dict[str, Any], cancel: CancelToken, on_status: Callable[[str], None] | None
) -> tuple[list[dict[str, Any]], str | None]:
    work = get_paths().cache_dir / f"transcript-{cache_key(video).replace(':', '-')}"
    try:
        if video.get("file_path"):
            if on_status:
                on_status("Mengambil audio dari video untuk Whisper…")
            audio = Path(video["file_path"])
        else:
            if on_status:
                on_status("Subtitle YouTube tidak tersedia, mengunduh audio untuk Whisper…")
            audio = ytdlp.download_audio(video["youtube_id"], work, cancel)
        chunks = ffmpeg_ops.chunk_audio(audio, work / "chunks", CHUNK_SECONDS, cancel)
        return _whisper_chunks(cache_key(video), chunks, cancel, on_status)
    finally:
        shutil.rmtree(work, ignore_errors=True)


def get_transcript(
    video: dict[str, Any], cancel: CancelToken, on_status: Callable[[str], None] | None = None
) -> list[dict[str, Any]]:
    """Transcript segments ({text, start, duration}) of a source video document, cached by `cache_key`."""
    key = cache_key(video)
    hit = cached(key)
    if hit:
        return hit
    if not video.get("file_path"):
        try:
            segs, lang = _from_youtube(video["youtube_id"])
            if segs:
                _save(key, segs, "youtube", lang)
                return segs
        except Exception as exc:
            logger.info("youtube-transcript-api failed for %s: %s", video["youtube_id"], exc)
        cancel.check()

    if whisper.available():
        try:
            segs, lang = _from_whisper(video, cancel, on_status)
            if segs:
                _save(key, segs, "whisper", lang)
                get_db().transcripts.delete_one({"_id": _partial_id(key)})
                return segs
        except Cancelled:
            raise
        except Exception as exc:
            logger.warning("Whisper transcript failed for %s: %s", _label(video), exc)
            if not config.is_dev:
                raise PipelineError(f"Transkrip video {_label(video)} tidak bisa dibuat: {exc}") from exc

    if config.is_dev:
        logger.warning("Using dev mock transcript for %s", _label(video))
        return MOCK_TRANSCRIPT
    raise PipelineError(f"Transkrip video {_label(video)} tidak tersedia. {whisper.unavailable_reason()} Lalu lanjutkan job ini.")


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
