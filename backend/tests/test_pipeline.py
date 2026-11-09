"""A link job cuts its clips from that video, and resuming a finished job never duplicates clips."""
from pathlib import Path

import pytest

from backend.agents import static_pipeline
from backend.agents.nodes import analyzer, discovery, processor
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

    def fake_transcript(youtube_id, cancel, on_status=None):
        db.transcripts.replace_one({"_id": f"yt:{youtube_id}"}, {"_id": f"yt:{youtube_id}", "source": "youtube",
                                   "segments": TRANSCRIPT, "fetched_at": utcnow()}, upsert=True)
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
