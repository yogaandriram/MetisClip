"""Face data of a clip (`faces.json`): the faces MediaPipe finds about five times a second and the
frames where the picture changes at once (camera cuts), plus a shot analysis on top of them.

One scan serves both the 9:16 face tracking of raw.mp4 (`smart_crop`) and the layouts that crop the
original-ratio source.mp4 at render time (`duo`: two speakers, one per panel). Keeping the faces as
data, not only as a cropped video, is what lets a layout pick its own crop per shot.

The scan decodes with ffmpeg at a long side of `SCAN_LONG_SIDE` px. MediaPipe's full-range model
resizes its input to 192x192 anyway, so the detections match a full-size scan (measured on two
podcasts: positions within 0.6 % of the frame), and the scan is about 4x faster than decoding full
size frames with OpenCV.

Document (version 1); positions and sizes are fractions of the frame:
    {version, width, height, fps, frames, interval,
     samples: [[t, [[cx, cy, w, h, score], ...]], ...],   # every `interval` frames, from frame 0
     cuts:    [[t, strength], ...]}                         # first frame of a new picture
"""
from __future__ import annotations

import json
import logging
import statistics
import subprocess
from pathlib import Path
from typing import Any

import numpy as np

from backend.core import procs, resources
from backend.core.config import ffmpeg_path

logger = logging.getLogger(__name__)

VERSION = 1
SAMPLE_FPS = 5
SCAN_LONG_SIDE = 640
MIN_DETECTION = 0.5

# Cut candidates: a frame that differs from the previous one by at least CUT_MIN (mean absolute
# difference of a 64x36 thumbnail, 0-255) and CUT_RATIO times its neighbours' median. Motion and
# effects change many frames in a row, a cut changes one. Candidates closer than CUT_GAP_S keep the
# strongest. Sensitive on purpose: a screen in the background that changes is also a candidate, and
# the shot analysis merges such pieces back when their faces match.
CUT_MIN = 8.0
CUT_RATIO = 3.0
CUT_GAP_S = 0.3
_THUMB = (36, 64)

# Shot analysis
MIN_FACE_SCORE = 0.55
MIN_FACE_H = 0.04      # of the frame height; smaller detections are noise
REL_FACE_H = 0.5       # a face under half the size of the sample's biggest is background (posters, far away)
# A weaker detection whose center is within this many face widths across (and one face height up or
# down) of a stronger one is a ghost of it: MediaPipe's full-range model sometimes adds a second box
# about 0.75-0.95 face widths up and to the side of a real face (score 0.62-0.67, seen in two
# podcasts). Two real heads side by side are never that close.
GHOST_DX = 1.1
DUO_SHARE = 0.6        # share of a shot's samples that show exactly two faces
DUO_MIN_GAP = 0.18     # the two face centers at least this far apart (of the frame width)
DUO_MIN_FACE = 0.08    # both faces at least this tall: smaller ones would be blown up too much
SAME_X = 0.035         # neighbouring shots with faces this close (and SAME_H in size) are one shot
SAME_H = 1.18
MIN_DUO_S = 0.8        # shorter two-speaker shots stay full-frame (no layout flicker)


class FacesError(RuntimeError):
    pass


# -- scan ---------------------------------------------------------------------------------------------

def _video_info(video: Path) -> tuple[int, int, float]:
    import cv2

    cap = cv2.VideoCapture(str(video))
    try:
        if not cap.isOpened():
            raise FacesError("Video tidak bisa dibuka")
        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    finally:
        cap.release()
    if w <= 0 or h <= 0:
        raise FacesError("Ukuran video tidak valid")
    if not (1.0 <= fps <= 120.0):
        fps = 30.0
    return w, h, float(fps)


def scan_size(w: int, h: int) -> tuple[int, int]:
    """Decode size: long side SCAN_LONG_SIDE (never upscaled), both sides even."""
    s = min(1.0, SCAN_LONG_SIDE / max(w, h))
    return max(2, int(round(w * s / 2)) * 2), max(2, int(round(h * s / 2)) * 2)


def cut_candidates(diffs: list[float], fps: float) -> list[list[float]]:
    d = np.asarray(diffs, dtype=np.float64)
    out: list[list[float]] = []
    for i in range(1, len(d)):
        if d[i] < CUT_MIN:
            continue
        near = np.concatenate([d[max(1, i - 5):i], d[i + 1:i + 6]])
        base = float(np.median(near)) if len(near) else 0.0
        if d[i] < CUT_RATIO * max(base, 1.0):
            continue
        t = round(i / fps, 3)
        if out and t - out[-1][0] < CUT_GAP_S:
            if d[i] > out[-1][1]:
                out[-1] = [t, round(float(d[i]), 1)]
            continue
        out.append([t, round(float(d[i]), 1)])
    return out


def scan(video: Path, cancel: procs.CancelToken | None = None) -> dict[str, Any]:
    """Faces about SAMPLE_FPS times a second and the cut candidates of `video` (see the module doc)."""
    from mediapipe.python.solutions import face_detection as mp_face_detection

    width, height, fps = _video_info(video)
    w, h = scan_size(width, height)
    interval = max(1, int(round(fps / SAMPLE_FPS)))
    cmd = [ffmpeg_path(), "-hide_banner", "-loglevel", "error", "-nostdin", "-i", str(video),
           "-map", "0:v:0", "-an", "-sn", "-vf", f"scale={w}:{h}:flags=area",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    size = w * h * 3
    sy, sx = max(1, h // _THUMB[0]), max(1, w // _THUMB[1])
    samples: list[list[Any]] = []
    diffs: list[float] = []
    prev: np.ndarray | None = None
    proc = procs.popen(cmd, cancel=cancel, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                       low_priority=resources.enabled())
    try:
        with mp_face_detection.FaceDetection(model_selection=1, min_detection_confidence=MIN_DETECTION) as detector:
            idx = 0
            while True:
                buf = proc.stdout.read(size)  # type: ignore[union-attr]
                if len(buf) < size:
                    break
                frame = np.frombuffer(buf, np.uint8).reshape(h, w, 3)
                thumb = frame[::sy, ::sx].astype(np.int16)
                diffs.append(0.0 if prev is None else float(np.abs(thumb - prev).mean()))
                prev = thumb
                if idx % interval == 0:
                    if cancel is not None and idx % (interval * 25) == 0:
                        cancel.check()
                    result = detector.process(frame)
                    faces = []
                    for det in getattr(result, "detections", None) or []:
                        b = det.location_data.relative_bounding_box
                        faces.append([round(b.xmin + b.width / 2, 4), round(b.ymin + b.height / 2, 4),
                                      round(b.width, 4), round(b.height, 4), round(float(det.score[0]), 3)])
                    samples.append([round(idx / fps, 3), faces])
                idx += 1
        proc.stdout.close()  # type: ignore[union-attr]
        stderr = proc.stderr.read().decode("utf-8", "replace") if proc.stderr else ""
        code = proc.wait()
    finally:
        procs.release(proc, cancel)
    if cancel is not None:
        cancel.check()
    if not samples:
        raise FacesError(f"Tidak ada frame yang terbaca dari video ({code}: {stderr[-200:]})")
    return {
        "version": VERSION,
        "width": width,
        "height": height,
        "fps": round(fps, 4),
        "frames": len(diffs),
        "interval": interval,
        "samples": samples,
        "cuts": cut_candidates(diffs, fps),
    }


def save(doc: dict[str, Any], path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(doc, separators=(",", ":")), encoding="utf-8")
    tmp.replace(path)
    return path


def load(path: Path | None) -> dict[str, Any] | None:
    """The faces document, or None when missing, unreadable or of another version."""
    if path is None or not path.is_file():
        return None
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(doc, dict) or doc.get("version") != VERSION or not doc.get("samples"):
        return None
    return doc


# -- face tracking (raw.mp4) --------------------------------------------------------------------------

def track_x(doc: dict[str, Any]) -> list[int]:
    """Per frame, the x (pixels) of the face closest to the previous one: smart_crop's pan before
    smoothing. Between samples the last position holds."""
    width, frames, k = int(doc["width"]), int(doc["frames"]), int(doc["interval"])
    last = width // 2
    out: list[int] = []
    for _, faces in doc["samples"]:
        if faces:
            last = min((int(f[0] * width) for f in faces), key=lambda x: abs(x - last))
        out.extend([last] * k)
    if len(out) < frames:
        out.extend([last] * (frames - len(out)))
    return out[:frames]


def shot_starts(doc: dict[str, Any]) -> list[int]:
    """First frame of every shot after the first: where the face tracking restarts its smoothing."""
    fps = float(doc["fps"])
    return [int(round(s["start"] * fps)) for s in shots(doc)[1:]]


# -- shot analysis ------------------------------------------------------------------------------------

def _faces(raw: list[list[float]]) -> list[list[float]]:
    """The sample's real faces, left to right: confident, not tiny, not a ghost of a stronger one, not
    far smaller than the biggest."""
    faces: list[list[float]] = []
    for f in sorted((f for f in raw if f[4] >= MIN_FACE_SCORE and f[3] >= MIN_FACE_H), key=lambda f: -f[4]):
        if not any(abs(f[0] - g[0]) < GHOST_DX * max(f[2], g[2]) and abs(f[1] - g[1]) < max(f[3], g[3]) for g in faces):
            faces.append(f)
    if not faces:
        return []
    top = max(f[3] for f in faces)
    return sorted((f for f in faces if f[3] >= REL_FACE_H * top), key=lambda f: f[0])


def _median_face(faces: list[list[float]]) -> dict[str, float]:
    return {
        "x": round(statistics.median(f[0] for f in faces), 4),
        "y": round(statistics.median(f[1] for f in faces), 4),
        "h": round(statistics.median(f[3] for f in faces), 4),
    }


def _classify(samples: list[list[list[float]]]) -> tuple[str, list[dict[str, float]]]:
    n = len(samples)
    two = [s for s in samples if len(s) == 2]
    if len(two) >= DUO_SHARE * n:
        left, right = _median_face([s[0] for s in two]), _median_face([s[1] for s in two])
        if right["x"] - left["x"] >= DUO_MIN_GAP and min(left["h"], right["h"]) >= DUO_MIN_FACE:
            return "duo", [left, right]
    counts = [min(len(s), 3) for s in samples]
    mode = max(sorted(set(counts)), key=counts.count)
    if mode == 0:
        return "none", []
    if mode == 1:
        return "solo", [_median_face([s[0] for s in samples if len(s) == 1])]
    return "group", []


def _same_faces(a: list[dict[str, float]], b: list[dict[str, float]]) -> bool:
    return len(a) == len(b) and all(
        abs(p["x"] - q["x"]) <= SAME_X and max(p["h"], q["h"]) <= SAME_H * min(p["h"], q["h"]) for p, q in zip(a, b)
    )


def shots(doc: dict[str, Any]) -> list[dict[str, Any]]:
    """The clip cut into shots: {start, end, kind, faces}, covering 0 to the clip's end.

    kind: 'duo' (two people side by side; faces = [left, right]), 'solo' (one; faces = [it]),
    'group' (more, or two that are too close or too small to crop apart) or 'none'. Pieces split by
    a cut candidate that show the same faces are merged back (a background screen that changes is
    not a new shot)."""
    fps = float(doc["fps"])
    end = round(int(doc["frames"]) / fps, 3)
    bounds = [0.0] + [float(t) for t, _ in doc.get("cuts") or [] if 0 < float(t) < end] + [end]
    filtered = [(float(t), _faces(f)) for t, f in doc["samples"]]
    pieces: list[dict[str, Any]] = []
    j = 0
    for a, b in zip(bounds, bounds[1:]):
        group: list[list[list[float]]] = []
        while j < len(filtered) and filtered[j][0] < b - 1e-6:
            if filtered[j][0] >= a - 1e-6:
                group.append(filtered[j][1])
            j += 1
        pieces.append({"start": a, "end": b, "samples": group})

    out: list[dict[str, Any]] = []
    for p in pieces:
        if not p["samples"]:  # shorter than the sample step: part of the shot before it
            if out:
                out[-1]["end"] = p["end"]
            continue
        kind, faces = _classify(p["samples"])
        last = out[-1] if out else None
        if last and last["kind"] == kind and (kind in ("group", "none") or _same_faces(last["faces"], faces)):
            merged = last["samples"] + p["samples"]
            mkind, mfaces = _classify(merged)
            if mkind == kind:
                last.update(end=p["end"], faces=mfaces, samples=merged)
                continue
        out.append({"start": p["start"], "end": p["end"], "kind": kind, "faces": faces, "samples": p["samples"]})
    if not out:
        return [{"start": 0.0, "end": end, "kind": "none", "faces": []}]
    return [{"start": round(s["start"], 3), "end": round(s["end"], 3), "kind": s["kind"], "faces": s["faces"]} for s in out]


def duo_data(doc: dict[str, Any] | None) -> dict[str, Any] | None:
    """What the `duo` layout needs (render props and the editor): the source size and the shots with
    two speakers, each {start, end, faces: [left, right]} with faces {x, y, h}. None without faces."""
    if not doc:
        return None
    duo = [{"start": s["start"], "end": s["end"], "faces": s["faces"]}
           for s in shots(doc) if s["kind"] == "duo" and s["end"] - s["start"] >= MIN_DUO_S]
    return {"width": int(doc["width"]), "height": int(doc["height"]), "shots": duo}
