"""Face-tracking 9:16 crop (MediaPipe) with frames piped straight to FFmpeg.

Pass 1 scans faces at ~5 fps and follows the face closest to its last position,
pass 2 smooths the pan with a 1.5 s moving average, pass 3 crops every frame and
pipes raw BGR frames to FFmpeg (near-lossless CRF 10 intermediate).
Returns False on any failure so the caller can fall back to a center crop.
"""
from __future__ import annotations

import logging
import subprocess
from pathlib import Path

import numpy as np

from backend.core import procs
from backend.core.config import ffmpeg_path

logger = logging.getLogger(__name__)


def _scan_faces(input_path: str, video_w: int, fps: float, cancel: procs.CancelToken | None) -> list[int]:
    import cv2
    from mediapipe.python.solutions import face_detection as mp_face_detection

    interval = max(1, int(round(fps / 5)))
    raw_x: list[int] = []
    last_x = video_w // 2
    cap = cv2.VideoCapture(input_path)
    try:
        with mp_face_detection.FaceDetection(model_selection=1, min_detection_confidence=0.5) as detector:
            idx = 0
            while True:
                ok, frame = cap.read()
                if not ok:
                    break
                if idx % interval == 0:
                    if cancel is not None and idx % (interval * 25) == 0:
                        cancel.check()
                    results = detector.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
                    best, best_d = None, float("inf")
                    for det in getattr(results, "detections", None) or []:
                        bbox = det.location_data.relative_bounding_box
                        cx = int((bbox.xmin + bbox.width / 2) * video_w)
                        d = abs(cx - last_x)
                        if d < best_d:
                            best, best_d = cx, d
                    if best is not None:
                        last_x = best
                raw_x.append(last_x)
                idx += 1
    finally:
        cap.release()
    return raw_x


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


def process_auto_tracking_video(input_path: str, output_path: str, cancel: procs.CancelToken | None = None) -> bool:
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

        raw_x = _scan_faces(input_path, video_w, fps, cancel)
        if not raw_x:
            raise RuntimeError("No frames read from video")
        smoothed = _smooth(raw_x, fps)

        cmd = [
            ffmpeg_path(), "-y", "-hide_banner", "-loglevel", "error",
            "-f", "rawvideo", "-vcodec", "rawvideo", "-s", f"{target_w}x{target_h}",
            "-pix_fmt", "bgr24", "-r", f"{fps:.3f}", "-i", "-",
            "-c:v", "libx264", "-preset", "superfast", "-crf", "10", "-pix_fmt", "yuv420p",
            output_path,
        ]
        proc = procs.popen(cmd, cancel=cancel, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        try:
            cap = cv2.VideoCapture(input_path)
            idx = 0
            try:
                while idx < len(smoothed):
                    ok, frame = cap.read()
                    if not ok:
                        break
                    if cancel is not None and idx % 150 == 0:
                        cancel.check()
                    cx = int(smoothed[idx])
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
