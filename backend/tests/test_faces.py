"""Face data of a clip (faces.json): cut candidates, the shot analysis behind the duo layout, the face
tracking input of smart_crop, and a real scan of a short video with one camera cut."""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from backend.agents.tools import faces
from backend.agents.tools.smart_crop import _smooth, smooth_shots
from backend.core import procs
from backend.core.config import ffmpeg_path

FPS = 25.0
INTERVAL = 5  # a sample every 0.2 s


def _doc(seconds: float, faces_at, cuts=(), width=1920, height=1080) -> dict:
    """A faces document with a sample every 0.2 s; faces_at(t) gives that sample's faces."""
    frames = int(round(seconds * FPS))
    samples = [[round(i / FPS, 3), faces_at(i / FPS)] for i in range(0, frames, INTERVAL)]
    return {"version": faces.VERSION, "width": width, "height": height, "fps": FPS, "frames": frames,
            "interval": INTERVAL, "samples": samples, "cuts": [[t, 40.0] for t in cuts]}


DUO = [[0.3, 0.42, 0.09, 0.16, 0.9], [0.7, 0.4, 0.09, 0.15, 0.88]]
SOLO = [[0.5, 0.4, 0.2, 0.4, 0.95]]


def test_cut_candidates_find_single_frame_changes():
    d = [2.0] * 200
    d[50] = 40.0                      # a cut
    d[52] = 30.0                      # within 0.3 s of it: the stronger one stays
    for i in range(100, 112):         # motion: many high frames in a row, not a cut
        d[i] = 30.0
    d[150] = 6.0                      # under CUT_MIN
    d[170] = 9.0                      # a weak but clear cut (screen change, whiteboard)
    cuts = faces.cut_candidates(d, FPS)
    assert cuts == [[2.0, 40.0], [6.8, 9.0]]


def test_faces_filter_drops_noise_and_background():
    raw = [[0.8, 0.5, 0.05, 0.1, 0.6], [0.2, 0.4, 0.1, 0.3, 0.9], [0.5, 0.5, 0.02, 0.03, 0.9],
           [0.6, 0.4, 0.1, 0.2, 0.4]]
    # Low score, tiny, and far smaller than the biggest face are all dropped
    assert faces._faces(raw) == [[0.2, 0.4, 0.1, 0.3, 0.9]]
    assert faces._faces([]) == []


def test_ghost_detection_next_to_a_face_is_dropped():
    # Measured in a real podcast: a weaker box 0.94 face widths up-left of the right speaker's face
    real = [0.5983, 0.33, 0.0817, 0.1409, 0.838]
    ghost = [0.5218, 0.28, 0.0738, 0.1255, 0.616]
    left = [0.1633, 0.35, 0.08, 0.145, 0.704]
    assert faces._faces([real, ghost, left]) == [left, real]
    # Two people close together but a head apart are both kept
    beside = [0.5983 - 0.12, 0.33, 0.08, 0.14, 0.7]
    assert faces._faces([real, beside]) == [beside, real]


def test_shots_merge_false_cuts_and_classify():
    # 0-4 s two speakers (a background screen makes a false cut at 2 s), then 4-8 s a close-up
    doc = _doc(8.0, lambda t: DUO if t < 4 else SOLO, cuts=[2.0, 4.0])
    out = faces.shots(doc)
    assert [(s["start"], s["end"], s["kind"]) for s in out] == [(0.0, 4.0, "duo"), (4.0, 8.0, "solo")]
    left, right = out[0]["faces"]
    assert left["x"] == pytest.approx(0.3) and right["x"] == pytest.approx(0.7)
    assert left["h"] == pytest.approx(0.16) and right["h"] == pytest.approx(0.15)
    assert faces.shot_starts(doc) == [100]


def test_two_faces_too_close_or_small_are_a_group():
    close = [[0.45, 0.4, 0.08, 0.15, 0.9], [0.55, 0.4, 0.08, 0.15, 0.9]]
    small = [[0.3, 0.4, 0.03, 0.06, 0.9], [0.7, 0.4, 0.03, 0.06, 0.9]]
    assert faces.shots(_doc(3.0, lambda t: close))[0]["kind"] == "group"
    assert faces.shots(_doc(3.0, lambda t: small))[0]["kind"] == "group"
    assert faces.shots(_doc(3.0, lambda t: []))[0]["kind"] == "none"


def test_a_missed_detection_does_not_break_a_duo_shot():
    # One sample in four sees only one of the two people: still a duo shot
    doc = _doc(4.0, lambda t: DUO[:1] if int(round(t * 5)) % 4 == 0 else DUO)
    assert [s["kind"] for s in faces.shots(doc)] == ["duo"]


def test_scene_data_lists_every_shot():
    # 0-0.6 s duo, 0.6-3 s solo, 3-6 s duo: all of them (the layout model drops too-short panels)
    doc = _doc(6.0, lambda t: DUO if t < 0.6 or t >= 3 else SOLO, cuts=[0.6, 3.0])
    data = faces.scene_data(doc)
    assert data["width"] == 1920 and data["height"] == 1080
    assert [(s["start"], s["end"], s["kind"]) for s in data["shots"]] == [(0.0, 0.6, "duo"), (0.6, 3.0, "solo"), (3.0, 6.0, "duo")]
    assert data["shots"][1]["faces"] == [{"x": 0.5, "y": 0.4, "h": 0.4}]
    assert faces.scene_data(None) is None


def test_track_x_follows_the_nearest_face():
    def at(t):
        if t < 1:
            return [[0.5, 0.4, 0.1, 0.2, 0.9]]
        if t < 2:
            return []  # nobody: the last position holds
        return [[0.1, 0.4, 0.1, 0.2, 0.9], [0.55, 0.4, 0.1, 0.2, 0.9]]

    doc = _doc(3.0, at, width=1000)
    x = faces.track_x(doc)
    assert len(x) == doc["frames"] == 75
    assert x[0] == 500 and x[30] == 500 and x[-1] == 550


def test_smooth_shots_restarts_at_a_cut():
    raw = [100] * 50 + [900] * 50
    blended = _smooth(raw, FPS)
    assert 100 < blended[49] < 900  # one moving average drifts across the cut
    per_shot = smooth_shots(raw, FPS, [50])
    assert per_shot[49] == pytest.approx(100) and per_shot[50] == pytest.approx(900)
    assert len(per_shot) == 100
    assert np.allclose(smooth_shots(raw, FPS, []), blended)


def test_save_and_load(tmp_path):
    doc = _doc(1.0, lambda t: SOLO)
    path = faces.save(doc, tmp_path / "clip" / "faces.json")
    assert faces.load(path) == doc
    path.write_text('{"version": 0, "samples": [[0, []]]}', encoding="utf-8")
    assert faces.load(path) is None
    path.write_text("not json", encoding="utf-8")
    assert faces.load(path) is None
    assert faces.load(tmp_path / "missing.json") is None and faces.load(None) is None


def test_scan_finds_the_camera_cut(tmp_path):
    video = tmp_path / "cut.mp4"
    procs.run([ffmpeg_path(), "-y", "-hide_banner", "-loglevel", "error",
               "-f", "lavfi", "-i", "testsrc=size=800x450:rate=25:duration=2",
               "-f", "lavfi", "-i", "smptebars=size=800x450:rate=25:duration=2",
               "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[v]", "-map", "[v]",
               "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", str(video)], timeout=60)
    doc = faces.scan(video)
    assert (doc["width"], doc["height"], doc["interval"]) == (800, 450, 5)
    assert doc["frames"] == 100 and len(doc["samples"]) == 20
    assert faces.scan_size(800, 450) == (640, 360)
    assert [t for t, _ in doc["cuts"]] == [2.0]
    # No faces on either side of the cut: one 'none' shot (nothing for the duo layout)
    assert faces.shots(doc) == [{"start": 0.0, "end": 4.0, "kind": "none", "faces": []}]
    assert [s["kind"] for s in faces.scene_data(doc)["shots"]] == ["none"]


def test_scan_size_never_upscales():
    assert faces.scan_size(1920, 1080) == (640, 360)
    assert faces.scan_size(1080, 1920) == (360, 640)
    assert faces.scan_size(320, 180) == (320, 180)


def test_scan_reports_an_unreadable_video(tmp_path):
    bad = tmp_path / "bad.mp4"
    bad.write_bytes(b"not a video")
    with pytest.raises(faces.FacesError):
        faces.scan(Path(bad))
