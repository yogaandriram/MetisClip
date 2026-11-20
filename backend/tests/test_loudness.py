"""Exported videos get their sound leveled to about -14 LUFS (gap analysis B8)."""
from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from backend.agents.tools import ffmpeg_ops
from backend.agents.tools.ffmpeg_ops import ffmpeg_path
from backend.core import procs
from backend.core.db import new_id
from backend.core.settings_store import update_settings
from backend.models.documents import ClipDoc, RenderJobDoc
from backend.services import render


def _video(path: Path, audio: str | None, seconds: int = 4) -> Path:
    """A small H.264 picture with `audio` (a lavfi source, None for none) as AAC."""
    path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [ffmpeg_path(), "-y", "-hide_banner", "-loglevel", "error",
           "-f", "lavfi", "-i", f"testsrc=size=108x192:rate=30:duration={seconds}"]
    if audio:
        cmd += ["-f", "lavfi", "-i", f"{audio}:duration={seconds}" if "duration" not in audio else audio]
    cmd += ["-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p"]
    cmd += ["-c:a", "aac", "-b:a", "128k", "-shortest"] if audio else []
    subprocess.run(cmd + [str(path)], check=True)
    return path


def _quiet(path: Path) -> Path:
    # A tone 30 dB under full scale: about -33 LUFS, far quieter than the platforms play
    path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([ffmpeg_path(), "-y", "-hide_banner", "-loglevel", "error",
                    "-f", "lavfi", "-i", "testsrc=size=108x192:rate=30:duration=4",
                    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=4",
                    "-filter:a", "volume=-30dB", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-b:a", "128k", "-shortest", str(path)], check=True)
    return path


def _video_stream(path: Path) -> str:
    text = procs.run([ffmpeg_path(), "-hide_banner", "-i", str(path)], check=False).stderr.decode("utf-8", "replace")
    return next(line.strip() for line in text.splitlines() if "Video:" in line)


def test_a_quiet_video_is_leveled_to_the_target_and_its_picture_kept(tmp_path):
    src = _quiet(tmp_path / "quiet.mp4")
    before = ffmpeg_ops.measure_loudness(src)
    assert before and before["input_i"] < -25
    out = tmp_path / "leveled.mp4"
    result = ffmpeg_ops.normalize_loudness(src, out)
    assert result == {"before": round(before["input_i"], 1), "after": ffmpeg_ops.LOUDNESS_TARGET}
    after = ffmpeg_ops.measure_loudness(out)
    assert abs(after["input_i"] - ffmpeg_ops.LOUDNESS_TARGET) < 1.0
    assert after["input_tp"] <= ffmpeg_ops.LOUDNESS_TRUE_PEAK + 0.5
    assert _video_stream(out).split("(")[0] == _video_stream(src).split("(")[0]  # copied, not encoded
    assert "48000 Hz" in procs.run([ffmpeg_path(), "-hide_banner", "-i", str(out)], check=False).stderr.decode()
    # Leveled once is enough: the second pass leaves it alone
    assert ffmpeg_ops.normalize_loudness(out, tmp_path / "again.mp4") is None
    assert not (tmp_path / "again.mp4").exists()


@pytest.mark.parametrize("audio", [None, "anullsrc=r=48000:cl=stereo"])
def test_no_sound_or_silence_is_left_alone(tmp_path, audio):
    src = _video(tmp_path / "v.mp4", audio)
    assert ffmpeg_ops.normalize_loudness(src, tmp_path / "out.mp4") is None
    assert not (tmp_path / "out.mp4").exists()


def test_the_render_step_levels_in_place_and_never_fails_the_render(tmp_path, events_seen):
    video = _quiet(tmp_path / "final.mp4")
    result = render._level_loudness("r1", "c1", video, tmp_path, procs.CancelToken())
    assert result and result["before"] < -25
    assert abs(ffmpeg_ops.measure_loudness(video)["input_i"] - ffmpeg_ops.LOUDNESS_TARGET) < 1.0
    assert any(e.get("message") == "Menyamakan volume suara…" for e in events_seen)
    broken = tmp_path / "broken.mp4"
    broken.write_bytes(b"not a video")
    assert render._level_loudness("r2", "c2", broken, tmp_path, procs.CancelToken()) is None
    assert broken.read_bytes() == b"not a video"


@pytest.fixture()
def events_seen(monkeypatch):
    seen: list[dict] = []
    monkeypatch.setattr(render.events, "publish", seen.append)
    return seen


def test_turning_leveling_off_or_on_makes_the_last_render_out_of_date(db, paths, events_seen):
    cid = new_id()
    raw = paths.library_dir / "podcast" / cid / "raw.mp4"
    raw.parent.mkdir(parents=True)
    raw.write_bytes(b"raw")
    clip = ClipDoc(_id=cid, job_id=None, source_video_id=None, youtube_id="x", start_time=0, end_time=10,
                   duration_seconds=10, hook_text="Volume", status="rendering",
                   files={"raw": paths.to_relative(raw)}).to_mongo()
    db.clips.insert_one(clip)
    out = paths.cache_dir / f"render-{new_id()}" / "final.mp4"
    out.parent.mkdir(parents=True)
    out.write_bytes(b"video")
    rid = new_id()
    db.render_jobs.insert_one({**RenderJobDoc(_id=rid, clip_id=cid).to_mongo(), "status": "rendering"})
    assert render.loudness_on() is True  # on by default
    render._finish(rid, clip, out, {}, render.fingerprint(render.build_props(clip), True),
                   {"before": -22.3, "after": -14.0})
    assert render.final_current(db.clips.find_one({"_id": cid}))
    assert db.render_jobs.find_one({"_id": rid})["loudness"] == {"before": -22.3, "after": -14.0}
    update_settings({"export": {"loudness": False}})
    assert render.loudness_on() is False
    assert not render.final_current(db.clips.find_one({"_id": cid}))
    update_settings({"export": {"loudness": True}})
    assert render.final_current(db.clips.find_one({"_id": cid}))
