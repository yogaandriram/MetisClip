"""FFmpeg operations: encoder detection, 9:16 finishing, thumbnails, audio extraction, local video cuts."""
from __future__ import annotations

import json
import logging
import math
import re
import threading
from pathlib import Path

from backend.core import procs, resources
from backend.core.config import ffmpeg_path
from backend.core import i18n

M = i18n.messages({
    "empty_cut": {
        "id": "Potongan video kosong",
        "en": "The video cut is empty",
    },
    "unreadable": {
        "id": "Video tidak bisa dibaca. Pakai file MP4, MOV atau WEBM yang bisa diputar.",
        "en": "The video can't be read. Use an MP4, MOV or WEBM file that plays.",
    },
    "companion_failed": {
        "id": "Video pendamping gagal diproses",
        "en": "The companion video couldn't be processed",
    },
})

logger = logging.getLogger(__name__)

HW_ORDER = ("h264_nvenc", "h264_qsv", "h264_amf")
_detect_lock = threading.Lock()
_detected: list[str] | None = None


def detect_hw_encoders() -> list[str]:
    """Hardware H.264 encoders that actually work on this PC (cached)."""
    global _detected
    with _detect_lock:
        if _detected is not None:
            return list(_detected)
        found: list[str] = []
        try:
            listing = procs.run([ffmpeg_path(), "-hide_banner", "-encoders"], timeout=30).stdout.decode("utf-8", "replace")
        except Exception as exc:
            logger.warning("ffmpeg -encoders failed: %s", exc)
            listing = ""
        for enc in HW_ORDER:
            if not re.search(rf"\b{enc}\b", listing):
                continue
            try:
                procs.run(
                    [ffmpeg_path(), "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
                     "color=black:s=320x240:d=0.2", "-c:v", enc, "-f", "null", "-"],
                    timeout=30,
                )
                found.append(enc)
            except Exception:
                pass
        _detected = found
        logger.info("Hardware encoders available: %s", found or "none")
        return list(found)


def pick_encoder() -> str:
    from backend.core.settings_store import get_settings

    try:
        wanted = get_settings()["processing"]["encoder"]
    except Exception:
        wanted = "auto"
    hw = detect_hw_encoders()
    if wanted == "auto":
        return hw[0] if hw else "libx264"
    if wanted == "libx264" or wanted in hw:
        return wanted
    return "libx264"


# libx264 threads while RAM is tight: about half the encode RAM of the default (one thread per
# logical CPU, 0.85 GB for a 1080x1920 clip on 16 threads), at about 1.5x the encode time
LEAN_X264_THREADS = 4


def encoder_args(encoder: str, lean: bool = False) -> list[str]:
    if encoder == "h264_nvenc":
        return ["-c:v", "h264_nvenc", "-preset", "p5", "-rc", "vbr", "-cq", "19", "-b:v", "0", "-profile:v", "high", "-pix_fmt", "yuv420p"]
    if encoder == "h264_qsv":
        return ["-c:v", "h264_qsv", "-preset", "medium", "-global_quality", "20", "-pix_fmt", "nv12"]
    if encoder == "h264_amf":
        return ["-c:v", "h264_amf", "-quality", "quality", "-rc", "cqp", "-qp_i", "19", "-qp_p", "21", "-pix_fmt", "yuv420p"]
    args = ["-c:v", "libx264", "-preset", "fast", "-crf", "18", "-profile:v", "high", "-pix_fmt", "yuv420p"]
    return args + ["-threads", str(LEAN_X264_THREADS)] if lean else args


def _encode_with_fallback(build, cancel: procs.CancelToken | None) -> str:
    """Run an ffmpeg command built by `build(encoder_args)`; on a hardware-encoder error fall back to libx264.

    With "Hemat RAM otomatis" on, encodes run at below-normal priority (the user's apps stay
    responsive) and libx264 uses fewer threads when RAM is tight (`core/resources.py`)."""
    enc = pick_encoder()
    lean = resources.tight()
    low = resources.enabled()
    try:
        procs.run(build(encoder_args(enc, lean)), cancel=cancel, timeout=1800, low_priority=low)
        return enc
    except procs.ProcessError as exc:
        if enc == "libx264":
            raise
        logger.warning("Encoder %s failed, falling back to libx264: %s", enc, exc)
        procs.run(build(encoder_args("libx264", lean)), cancel=cancel, timeout=1800, low_priority=low)
        return "libx264"


def finish_vertical(tracked_video: Path, source_with_audio: Path, out_path: Path, cancel: procs.CancelToken | None) -> str:
    """Tracked (cropped, silent) video + original audio -> 1080x1920 H.264/AAC mp4.

    The output length is the tracked video's, set with `-t`. `-shortest` would do the same but makes
    ffmpeg 7 buffer far more frames: measured 2026-11-15, it doubled the peak RAM of this encode
    (QSV 1.16 GB -> 0.26 GB, libx264 1.75 GB -> 0.85 GB)."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    length = probe_duration(tracked_video)
    until = ["-t", f"{length:.3f}"] if length else ["-shortest"]

    def build(venc: list[str]) -> list[str]:
        return [
            ffmpeg_path(), "-y", "-hide_banner", "-loglevel", "error", "-err_detect", "ignore_err",
            "-i", str(tracked_video), "-i", str(source_with_audio),
            "-map", "0:v:0", "-map", "1:a:0?",
            "-vf", "scale=1080:1920:flags=bicubic,setsar=1",
            *venc,
            "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
            "-movflags", "+faststart", *until,
            str(out_path),
        ]

    return _encode_with_fallback(build, cancel)


def center_crop_vertical(source: Path, out_path: Path, cancel: procs.CancelToken | None) -> str:
    """Fallback when face tracking fails (K16): static center crop to 9:16 in one pass."""
    out_path.parent.mkdir(parents=True, exist_ok=True)

    def build(venc: list[str]) -> list[str]:
        return [
            ffmpeg_path(), "-y", "-hide_banner", "-loglevel", "error", "-err_detect", "ignore_err",
            "-i", str(source),
            "-map", "0:v:0", "-map", "0:a:0?",
            "-vf", "crop='min(iw,trunc(ih*9/16/2)*2)':'trunc(ih/2)*2',scale=1080:1920:flags=bicubic,setsar=1",
            *venc,
            "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
            "-movflags", "+faststart",
            str(out_path),
        ]

    return _encode_with_fallback(build, cancel)


def thumbnail(video: Path, out_path: Path, at_seconds: float, cancel: procs.CancelToken | None) -> None:
    procs.run(
        [ffmpeg_path(), "-y", "-hide_banner", "-loglevel", "error", "-ss", f"{max(0.0, at_seconds):.2f}",
         "-i", str(video), "-frames:v", "1", "-q:v", "3", "-update", "1", str(out_path)],
        cancel=cancel, timeout=120,
    )


def extract_audio_mp3(video: Path, out_path: Path, cancel: procs.CancelToken | None) -> Path:
    """Mono 16 kHz mp3: small enough for the Groq upload limit."""
    procs.run(
        [ffmpeg_path(), "-y", "-hide_banner", "-loglevel", "error", "-i", str(video), "-vn",
         "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "48k", str(out_path)],
        cancel=cancel, timeout=600,
    )
    return out_path


def chunk_audio(audio: Path, out_dir: Path, chunk_seconds: int, cancel: procs.CancelToken | None) -> list[Path]:
    """Re-encode to mono 16 kHz mp3 and split into fixed-length chunks."""
    out_dir.mkdir(parents=True, exist_ok=True)
    pattern = out_dir / "chunk_%03d.mp3"
    procs.run(
        [ffmpeg_path(), "-y", "-hide_banner", "-loglevel", "error", "-i", str(audio), "-vn",
         "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "48k",
         "-f", "segment", "-segment_time", str(chunk_seconds), "-reset_timestamps", "1", str(pattern)],
        cancel=cancel, timeout=3600,
    )
    return sorted(out_dir.glob("chunk_*.mp3"))


def cut_section(source: Path, start: float, end: float, out_path: Path, cancel: procs.CancelToken | None) -> Path:
    """Frame-accurate [start, end] cut of a local video, like a YouTube section download.

    Re-encoded (a stream copy would start at the previous keyframe, seconds early) and scaled down so
    neither side exceeds 1920 px (4K sources -> 1080p); smaller videos are never upscaled.
    """
    out_path.parent.mkdir(parents=True, exist_ok=True)
    procs.run(
        [ffmpeg_path(), "-y", "-hide_banner", "-loglevel", "error",
         "-ss", f"{max(0.0, start):.3f}", "-i", str(source), "-t", f"{max(0.1, end - start):.3f}",
         "-map", "0:v:0", "-map", "0:a:0?", "-sn", "-dn",
         "-vf", "scale=w='min(iw,1920)':h='min(ih,1920)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1",
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-pix_fmt", "yuv420p",
         *(["-threads", str(LEAN_X264_THREADS)] if resources.tight() else []),
         "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
         "-movflags", "+faststart", str(out_path)],
        cancel=cancel, timeout=1800, low_priority=resources.enabled(),
    )
    if not out_path.exists() or out_path.stat().st_size == 0:
        raise RuntimeError(M("empty_cut"))
    return out_path


# The companion video of the split layout loops behind every clip: a few minutes is plenty
COMPANION_MAX_SECONDS = 180


def normalize_companion(source: Path, out_path: Path, cancel: procs.CancelToken | None = None) -> float:
    """Companion video for the split layout, from any video the user imports: silent, 30 fps, H.264,
    short side at most 1080 px (enough for the largest companion part, never upscaled), and at most
    COMPANION_MAX_SECONDS long. Returns its duration in seconds."""
    info = probe_media(source)
    if not info or not info.get("has_video") or not info.get("duration"):
        raise ValueError(M("unreadable"))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    procs.run(
        [ffmpeg_path(), "-y", "-hide_banner", "-loglevel", "error",
         "-i", str(source), "-t", str(COMPANION_MAX_SECONDS),
         "-map", "0:v:0", "-an", "-sn", "-dn",
         "-vf", "scale=w='min(iw,1080)':h='min(ih,1080)':force_original_aspect_ratio=increase:force_divisible_by=2,fps=30,setsar=1",
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
         *(["-threads", str(LEAN_X264_THREADS)] if resources.tight() else []),
         "-movflags", "+faststart", str(out_path)],
        cancel=cancel, timeout=1800, low_priority=resources.enabled(),
    )
    duration = probe_duration(out_path)
    if not duration:
        out_path.unlink(missing_ok=True)
        raise ValueError(M("companion_failed"))
    return round(duration, 3)


# Loudness of exported videos (gap analysis B8): what YouTube, TikTok and Instagram play short videos at,
# with a true peak that survives their own AAC encode
LOUDNESS_TARGET = -14.0  # LUFS, integrated
LOUDNESS_TRUE_PEAK = -1.0  # dBTP
LOUDNESS_RANGE = 11.0  # LU: speech keeps its dynamics (loudnorm's default 7 squeezes it)
LOUDNESS_SILENT = -70.0  # LUFS: quieter than this is silence (nothing to level)
LOUDNESS_CLOSE = 0.5  # LU: already this close to the target (and under the peak): left as it is


def measure_loudness(video: Path, cancel: procs.CancelToken | None = None) -> dict[str, float] | None:
    """EBU R128 loudness of the video's audio (loudnorm's first pass): input_i, input_tp, input_lra,
    input_thresh and target_offset. None when the audio cannot be measured (none, or silence)."""
    res = procs.run(
        [ffmpeg_path(), "-hide_banner", "-nostats", "-i", str(video), "-vn", "-sn", "-dn",
         "-af", f"loudnorm=I={LOUDNESS_TARGET}:TP={LOUDNESS_TRUE_PEAK}:LRA={LOUDNESS_RANGE}:print_format=json",
         "-f", "null", "-"],
        cancel=cancel, timeout=600, low_priority=resources.enabled(),
    )
    text = (res.stderr or b"").decode("utf-8", "replace")
    start, end = text.rfind("{"), text.rfind("}")
    if start < 0 or end < start:
        return None
    try:
        raw = json.loads(text[start:end + 1])
        values = {k: float(raw[k]) for k in ("input_i", "input_tp", "input_lra", "input_thresh", "target_offset")}
    except (ValueError, KeyError, TypeError):
        return None
    if not all(math.isfinite(v) for v in values.values()):  # "-inf" for silence
        return None
    return values


def normalize_loudness(video: Path, out_path: Path, cancel: procs.CancelToken | None = None) -> dict[str, float] | None:
    """Level the video's audio to LOUDNESS_TARGET (loudnorm's second pass, linear when the peak allows):
    the picture is copied, only the audio is encoded again. Returns {"before", "after"} in LUFS when
    `out_path` was written; None when there is nothing to do (no audio, silence, already at the target)."""
    info = probe_media(video)
    if not info or not info.get("has_audio"):
        return None
    m = measure_loudness(video, cancel)
    if not m or m["input_i"] < LOUDNESS_SILENT:
        return None
    if abs(m["input_i"] - LOUDNESS_TARGET) < LOUDNESS_CLOSE and m["input_tp"] <= LOUDNESS_TRUE_PEAK:
        return None
    af = (f"loudnorm=I={LOUDNESS_TARGET}:TP={LOUDNESS_TRUE_PEAK}:LRA={LOUDNESS_RANGE}"
          f":measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}"
          f":measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    procs.run(
        [ffmpeg_path(), "-y", "-hide_banner", "-loglevel", "error", "-i", str(video),
         "-map", "0:v:0?", "-map", "0:a:0", "-c:v", "copy", "-af", af,
         # loudnorm works at 192 kHz inside: back to the usual 48 kHz. The fast AAC coder: ffmpeg 7.1's default
         # (twoloop) took 13.7 s for 90 s of mono audio on the reference laptop, the fast one 5.1 s
         "-ar", "48000", "-c:a", "aac", "-aac_coder", "fast", "-b:a", "192k", "-movflags", "+faststart",
         str(out_path)],
        cancel=cancel, timeout=600, low_priority=resources.enabled(),
    )
    if not out_path.is_file() or out_path.stat().st_size == 0:
        raise RuntimeError("loudnorm")
    return {"before": round(m["input_i"], 1), "after": LOUDNESS_TARGET}


def probe_media(path: Path) -> dict | None:
    """{duration, has_video, has_audio, width, height} from `ffmpeg -i`, or None when unreadable."""
    try:
        res = procs.run([ffmpeg_path(), "-hide_banner", "-i", str(path)], timeout=60, check=False)
    except Exception:
        return None
    text = (res.stderr or b"").decode("utf-8", "replace")
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", text)
    # Cover art is stored as an mjpeg/png "video" stream: it does not count
    video = re.search(r"Stream #\S+.*?: Video: (?!mjpeg|png|bmp)[^\n]*?\b(\d{2,5})x(\d{2,5})\b", text)
    if not m and not video:
        return None
    h, mi, s = m.groups() if m else ("0", "0", "0")
    return {
        "duration": int(h) * 3600 + int(mi) * 60 + float(s),
        "has_video": bool(video),
        "has_audio": bool(re.search(r"Stream #\S+.*?: Audio:", text)),
        "width": int(video.group(1)) if video else 0,
        "height": int(video.group(2)) if video else 0,
    }


def probe_duration(path: Path) -> float | None:
    """Duration via `ffmpeg -i` (ffprobe is not bundled with imageio-ffmpeg)."""
    try:
        res = procs.run([ffmpeg_path(), "-hide_banner", "-i", str(path)], timeout=60, check=False)
    except Exception:
        return None
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", (res.stderr or b"").decode("utf-8", "replace"))
    if not m:
        return None
    h, mi, s = m.groups()
    return int(h) * 3600 + int(mi) * 60 + float(s)


def ffmpeg_version() -> str | None:
    try:
        out = procs.run([ffmpeg_path(), "-hide_banner", "-version"], timeout=30).stdout.decode("utf-8", "replace")
        m = re.search(r"ffmpeg version (\S+)", out)
        return m.group(1) if m else out.splitlines()[0]
    except Exception:
        return None
