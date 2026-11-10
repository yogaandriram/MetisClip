"""A link job cuts its clips from that video, an upload job cuts them from the local file, and resuming
a finished job never duplicates clips."""
from pathlib import Path

import pytest

from backend.agents import static_pipeline
from backend.agents.nodes import analyzer, discovery, processor
from backend.agents.tools import ffmpeg_ops, whisper_local
from backend.agents.tools import transcript as transcript_mod
from backend.core import procs
from backend.core.config import ffmpeg_path
from backend.core.db import new_id, utcnow
from backend.core.paths import get_paths
from backend.models.documents import JobConfig, JobDoc, JobSource

VID = "AAAAAAAAAAA"
URL = f"https://www.youtube.com/watch?v={VID}"
TRANSCRIPT = [{"text": f"Ini kalimat nomor {i}.", "start": float(i * 5), "duration": 5.0} for i in range(400)]


@pytest.fixture()
def fake_world(monkeypatch, db, secrets):
    secrets.set_secret("llm_api_key", "sk-test-0000000000")
    downloads: list[str] = []

    def fake_metadata(youtube_id, cancel=None):
        return {"title": f"Video {youtube_id}", "channel": "c", "duration": 3600, "view_count": 100000, "like_count": 5000}

    def fake_transcript(video, cancel, on_status=None):
        key = f"yt:{video['youtube_id']}"
        db.transcripts.replace_one({"_id": key}, {"_id": key, "source": "youtube", "segments": TRANSCRIPT,
                                                  "fetched_at": utcnow()}, upsert=True)
        return TRANSCRIPT

    def fake_chat(system, user, **kw):
        if "Critic" in system:
            return {}
        return {"segments": [{"start_time": "02:00", "end_time": "02:46", "viral_score": 90, "hook_text": "pertama"},
                             {"start_time": "05:00", "end_time": "05:46", "viral_score": 95, "hook_text": "kedua"}]}

    def fake_download(youtube_id, start, end, out_path: Path, cancel=None):
        downloads.append(youtube_id)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        procs.run([ffmpeg_path(), "-y", "-hide_banner", "-loglevel", "error",
                   "-f", "lavfi", "-i", "testsrc=size=640x360:rate=30:duration=2",
                   "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
                   "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
                   str(out_path)], timeout=120)
        return out_path

    monkeypatch.setattr(discovery.ytdlp, "dump_metadata", fake_metadata)
    monkeypatch.setattr(analyzer, "get_transcript", fake_transcript)
    monkeypatch.setattr(analyzer.llm, "chat_json", fake_chat)
    monkeypatch.setattr(processor.ytdlp, "download_section", fake_download)
    # No Groq key and no local engine: clip words come from the transcript
    monkeypatch.setattr(whisper_local, "binary", lambda: None)
    return downloads


def _make_job(db, agent_id):
    job = JobDoc(_id=new_id(), agent_id=agent_id,
                 source=JobSource(type="url", youtube_url=URL),
                 config=JobConfig(clip_duration="45-60", max_clips=2, max_clips_per_video=2)).to_mongo()
    db.discovery_jobs.insert_one(job)
    return job["_id"]


def test_link_job_clips_its_video_and_resume_is_idempotent(db, fake_world):
    db.super_agents.insert_one({"_id": "agent-1", "name": "Agen", "slug": "agen", "timezone": "Asia/Jakarta",
                                "created_at": utcnow()})
    job_id = _make_job(db, "agent-1")
    static_pipeline.run_job(job_id, procs.CancelToken())

    job = db.discovery_jobs.find_one({"_id": job_id})
    assert job["status"] == "completed", job.get("errors")
    [video] = list(db.source_videos.find({"job_id": job_id}))
    assert video["youtube_id"] == VID and video["title"] == f"Video {VID}" and video["duration_seconds"] == 3600
    clips = list(db.clips.find({"job_id": job_id}))
    assert {c["hook_text"] for c in clips} == {"pertama", "kedua"}
    assert {c["youtube_id"] for c in clips} == {VID} and fake_world == [VID, VID]
    for c in clips:
        assert c["status"] == "ready" and c["agent_id"] == "agent-1"
        raw = get_paths().from_relative(c["files"]["raw"])
        assert raw.exists() and raw.stat().st_size > 0
        assert c["files"]["raw"].startswith("library/agen/")
        assert c["subtitle"]["words"], "word timings derived from the transcript"
    assert job["processed_scenes"] == 2 and job["total_scenes"] == 2
    assert job["progress_pct"] == 100 and job["current_step"] == "processing"

    # Resume a finished job: nothing is duplicated
    db.discovery_jobs.update_one({"_id": job_id}, {"$set": {"status": "pending"}})
    static_pipeline.run_job(job_id, procs.CancelToken())
    assert db.clips.count_documents({"job_id": job_id}) == 2
    assert len(fake_world) == 2  # finished segments were not downloaded again


def _make_video(path: Path, seconds: int) -> Path:
    """A tiny long video (64x64, 1 fps) with a tone: cheap to cut, crop and encode."""
    path.parent.mkdir(parents=True, exist_ok=True)
    procs.run([ffmpeg_path(), "-y", "-hide_banner", "-loglevel", "error",
               "-f", "lavfi", "-i", f"testsrc=size=64x64:rate=1:duration={seconds}",
               "-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}",
               "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
               str(path)], timeout=300)
    return path


def test_upload_job_clips_the_local_file(db, secrets, monkeypatch, tmp_path):
    from backend.agents.tools import whisper

    secrets.set_secret("llm_api_key", "sk-test-0000000000")
    secrets.set_secret("groq_api_key", "gsk-test-0000000000")
    video_path = _make_video(tmp_path / "Video Saya ü" / "podcast lokal.mp4", 400)
    calls: list[bool] = []

    def fake_transcribe(audio, *, words, cancel=None, on_status=None):
        calls.append(words)
        if words:  # per clip: word timings
            return {"words": [{"word": "halo", "start": 0.0, "end": 0.4}, {"word": "semua", "start": 0.5, "end": 0.9}]}
        return {"segments": [{"text": f"Kalimat {i}.", "start": i * 5.0, "end": i * 5.0 + 5} for i in range(80)]}

    def fake_chat(system, user, **kw):
        if "Critic" in system or "Transcript Chunk" not in user:  # critic pass, AI keyword/emoji marks
            return {}
        assert "Video Title: podcast lokal" in user  # the file name is the title
        return {"segments": [{"start_time": "02:00", "end_time": "02:46", "viral_score": 90, "hook_text": "pertama"},
                             {"start_time": "05:00", "end_time": "05:46", "viral_score": 95, "hook_text": "kedua"}]}

    monkeypatch.setattr(whisper, "transcribe", fake_transcribe)
    monkeypatch.setattr(analyzer.llm, "chat_json", fake_chat)
    monkeypatch.setattr(processor.ytdlp, "download_section", lambda *a, **k: pytest.fail("an upload never downloads"))
    db.super_agents.insert_one({"_id": "agent-u", "name": "Agen", "slug": "agen-u", "timezone": "Asia/Jakarta",
                                "created_at": utcnow()})
    job = JobDoc(_id=new_id(), agent_id="agent-u", source=JobSource(type="local_file", local_file_path=str(video_path)),
                 config=JobConfig(clip_duration="45-60", max_clips=2, max_clips_per_video=2)).to_mongo()
    db.discovery_jobs.insert_one(job)
    static_pipeline.run_job(job["_id"], procs.CancelToken())

    done = db.discovery_jobs.find_one({"_id": job["_id"]})
    assert done["status"] == "completed", done.get("errors")
    [video] = list(db.source_videos.find({"job_id": job["_id"]}))
    assert video["youtube_id"] is None and video["title"] == "podcast lokal"
    assert Path(video["file_path"]) == video_path.resolve() and video["duration_seconds"] == pytest.approx(400, abs=1)
    transcript = db.transcripts.find_one({"_id": f"file:{video['file_fingerprint']}"})
    assert transcript["source"] == "whisper" and len(transcript["segments"]) == 80
    clips = list(db.clips.find({"job_id": job["_id"]}))
    assert {c["hook_text"] for c in clips} == {"pertama", "kedua"}
    for c in clips:
        assert c["youtube_id"] is None and c["status"] == "ready"
        raw = get_paths().from_relative(c["files"]["raw"])
        info = ffmpeg_ops.probe_media(raw)
        assert info["width"] == 1080 and info["height"] == 1920 and info["has_audio"]
        assert info["duration"] == pytest.approx(c["end_time"] - c["start_time"], abs=1.5)
        assert [w["word"] for w in c["subtitle"]["words"]] == ["halo", "semua"]
    assert calls.count(False) == 1 and calls.count(True) == 2  # one transcript, Whisper words per clip

    # Resume a finished job: nothing is cut or transcribed again
    db.discovery_jobs.update_one({"_id": job["_id"]}, {"$set": {"status": "pending"}})
    static_pipeline.run_job(job["_id"], procs.CancelToken())
    assert db.clips.count_documents({"job_id": job["_id"]}) == 2 and len(calls) == 3


def test_upload_job_fails_clearly_when_the_file_is_gone(db, secrets, tmp_path):
    secrets.set_secret("llm_api_key", "sk-test-0000000000")
    gone = str(tmp_path / "dipindah.mp4")
    job_id = new_id()
    db.discovery_jobs.insert_one(JobDoc(
        _id=job_id, agent_id=None, source=JobSource(type="local_file", local_file_path=gone),
        config=JobConfig(clip_duration="45-60", max_clips=1, max_clips_per_video=1),
    ).to_mongo())
    db.source_videos.insert_one({"_id": "sv-gone", "job_id": job_id, "file_path": gone, "created_at": utcnow()})
    seg = {"segment_id": new_id(), "source_video_id": "sv-gone", "youtube_id": None, "file_path": gone,
           "transcript_key": "file:x", "start_time": 120.0, "end_time": 166.0, "duration_seconds": 46.0,
           "viral_score": 90, "hook_text": "x", "tags": [], "rationale": ""}
    db.discovery_jobs.update_one({"_id": job_id}, {"$set": {"checkpoint": {
        "discovery_done": True, "analysis_done": True, "segments": [seg], "done_segment_ids": []}}})
    static_pipeline.run_job(job_id, procs.CancelToken())
    job = db.discovery_jobs.find_one({"_id": job_id})
    assert job["status"] == "failed"
    assert job["errors"][-1]["message"].startswith("File video tidak ditemukan")


def test_cancel_marks_job_cancelled(db, fake_world):
    job_id = _make_job(db, None)
    token = procs.CancelToken()
    token.cancel()
    static_pipeline.run_job(job_id, token)
    assert db.discovery_jobs.find_one({"_id": job_id})["status"] == "cancelled"


def test_missing_llm_key_fails_with_indonesian_message_in_production(db, fake_world, secrets, monkeypatch):
    from backend.core.config import config

    secrets.delete_secret("llm_api_key")
    monkeypatch.setattr(config, "env", "production")
    job_id = _make_job(db, None)
    static_pipeline.run_job(job_id, procs.CancelToken())
    job = db.discovery_jobs.find_one({"_id": job_id})
    assert job["status"] == "failed"
    assert "API key LLM (OpenAI-compatible) belum diisi" in job["errors"][-1]["message"]
