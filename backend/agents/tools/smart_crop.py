"""Face-tracking 9:16 crop (MediaPipe) with frames piped straight to FFmpeg.

Pass 1 scans the faces (`faces.scan`, ~5 fps, kept as faces.json for the layouts that crop at render
time) and follows the face closest to its last position; pass 2 smooths the pan with a 1.5 s moving
average inside each shot (a camera cut restarts it, so the crop never drifts across the cut);
pass 3 crops every frame and pipes raw BGR frames to FFmpeg (near-lossless CRF 10 intermediate).
Returns False on any failure so the caller can fall back to a center crop.
"""
from __future__ import annotations

import logging
import subprocess
from pathlib import Path

import numpy as np

from backend.agents.tools import faces
from backend.core import procs, resources
from backend.core.config import ffmpeg_path

logger = logging.getLogger(__name__)


def _smooth(raw_x: list[int], fps: float) -> np.ndarray:
    arr = np.asarray(raw_x, dtype=np.float64)
    window = max(1, int(fps * 1.5))
    if window <= 1 or len(arr) <= window:
        return np.full_like(arr, arr.mean()) if len(arr) else arr
    kernel = np.ones(window) / window
    smoothed = np.convolve(arr, kernel, mode="same")
    half = window // 2
    smoothed[:half] = smoothed[half]
    smoothed[-half:] = smoothed[-half - 1]
    return smoothed


def smooth_shots(raw_x: list[int], fps: float, starts: list[int]) -> np.ndarray:
    """`_smooth` within each shot (starts = first frame of every shot after the first)."""
    bounds = [0] + [s for s in starts if 0 < s < len(raw_x)] + [len(raw_x)]
    parts = [_smooth(raw_x[a:b], fps) for a, b in zip(bounds, bounds[1:]) if b > a]
    return np.concatenate(parts) if parts else np.asarray(raw_x, dtype=np.float64)


def process_auto_tracking_video(input_path: str, output_path: str, cancel: procs.CancelToken | None = None,
                                faces_out: Path | None = None) -> bool:
    """Track and crop `input_path` to 9:16. The face scan is also written to `faces_out` (if given)."""
    import cv2

    try:
        cap = cv2.VideoCapture(input_path)
        if not cap.isOpened():
            raise RuntimeError("OpenCV cannot open the input video")
        video_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        video_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        if not (1.0 <= fps <= 120.0):
            fps = 30.0
        cap.release()
        if video_w <= 0 or video_h <= 0:
            raise RuntimeError("Invalid video dimensions")

        target_h = video_h & ~1
        target_w = min(int(video_h * 9 / 16), video_w) & ~1

        doc = faces.scan(Path(input_path), cancel)
        if faces_out is not None:
            faces.save(doc, faces_out)
        smoothed = smooth_shots(faces.track_x(doc), fps, faces.shot_starts(doc))
        if not len(smoothed):
            raise RuntimeError("No frames read from video")

        cmd = [
            ffmpeg_path(), "-y", "-hide_banner", "-loglevel", "error",
            "-f", "rawvideo", "-vcodec", "rawvideo", "-s", f"{target_w}x{target_h}",
            "-pix_fmt", "bgr24", "-r", f"{fps:.3f}", "-i", "-",
            "-c:v", "libx264", "-preset", "superfast", "-crf", "10", "-pix_fmt", "yuv420p",
            output_path,
        ]
        proc = procs.popen(cmd, cancel=cancel, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                           low_priority=resources.enabled())
        last = len(smoothed) - 1
        try:
            cap = cv2.VideoCapture(input_path)
            idx = 0
            try:
                # OpenCV and the ffmpeg scan may count a frame differently at the end: crop every
                # frame OpenCV reads, holding the last position
                while True:
                    ok, frame = cap.read()
                    if not ok:
                        break
                    if cancel is not None and idx % 150 == 0:
                        cancel.check()
                    cx = int(smoothed[min(idx, last)])
                    x1 = max(0, min(video_w - target_w, cx - target_w // 2))
                    crop = np.ascontiguousarray(frame[:target_h, x1:x1 + target_w])
                    proc.stdin.write(crop.tobytes())  # type: ignore[union-attr]
                    idx += 1
            finally:
                cap.release()
            proc.stdin.close()  # type: ignore[union-attr]
            stderr = proc.stderr.read().decode("utf-8", "replace") if proc.stderr else ""
            code = proc.wait()
        finally:
            procs.release(proc, cancel)
        if cancel is not None:
            cancel.check()
        if code != 0:
            raise RuntimeError(f"ffmpeg pipe exited with {code}: {stderr[-300:]}")
        if not Path(output_path).exists() or Path(output_path).stat().st_size == 0:
            raise RuntimeError("Tracked output is empty")
        return True
    except procs.Cancelled:
        raise
    except Exception as exc:
        if cancel is not None and cancel.cancelled:
            raise procs.Cancelled(cancel.reason) from exc
        logger.warning("Smart auto tracking failed (%s); caller will fall back to center crop", exc)
        return False
