"""Phase 0 done-criterion: a keyword job with 2+ source videos cuts each clip from ITS OWN video (K1),
and resuming a finished job never duplicates clips or posts."""
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

VID_A, VID_B = "AAAAAAAAAAA", "BBBBBBBBBBB"
TRANSCRIPT = [{"text": f"Ini kalimat nomor {i}.", "start": float(i * 5), "duration": 5.0} for i in range(400)]


@pytest.fixture()
def fake_world(monkeypatch, db, secrets):
    secrets.set_secret("llm_api_key", "sk-test-0000000000")
    downloads: list[str] = []

    def fake_search(query, video_type, max_results=3):
        vid = VID_A if query == "satu" else VID_B
        return [{"youtube_id": vid, "title": f"Video {vid}", "channel_name": "c", "duration_seconds": 3600,
                 "view_count": 100000, "like_count": 5000, "video_type": video_type, "quality_score": 50.0}]

    def fake_transcript(youtube_id, cancel, on_status=None):
        db.transcripts.replace_one({"_id": f"yt:{youtube_id}"}, {"_id": f"yt:{youtube_id}", "source": "youtube",
                                   "segments": TRANSCRIPT, "fetched_at": utcnow()}, upsert=True)
        return TRANSCRIPT

    def fake_chat(system, user, **kw):
        if "Critic" in system:
            return {}
        if VID_A in user:
            return {"segments": [{"start_time": "02:00", "end_time": "02:46", "viral_score": 90, "hook_text": "dari A"}]}
        return {"segments": [{"start_time": "05:00", "end_time": "05:46", "viral_score": 95, "hook_text": "dari B"}]}

    def fake_download(youtube_id, start, end, out_path: Path, cancel=None):
        downloads.append(youtube_id)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        procs.run([ffmpeg_path(), "-y", "-hide_banner", "-loglevel", "error",
                   "-f", "lavfi", "-i", "testsrc=size=640x360:rate=30:duration=2",
                   "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
                   "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
                   str(out_path)], timeout=120)
        return out_path

    monkeypatch.setattr(discovery.youtube_api, "search_videos", fake_search)
    monkeypatch.setattr(analyzer, "get_transcript", fake_transcript)
    monkeypatch.setattr(analyzer.llm, "chat_json", fake_chat)
    monkeypatch.setattr(processor.ytdlp, "download_section", fake_download)
    return downloads


def _make_job(db, agent_id):
    job = JobDoc(_id=new_id(), agent_id=agent_id,
                 source=JobSource(type="keyword", keywords=["satu", "dua"]),
                 config=JobConfig(video_types=["podcast"], clip_duration="45-60", max_clips=2, max_clips_per_video=2)).to_mongo()
    db.discovery_jobs.insert_one(job)
    return job["_id"]


def test_multi_video_job_uses_each_segments_own_video(db, fake_world):
    db.super_agents.insert_one({"_id": "agent-1", "name": "Agen", "slug": "agen", "timezone": "Asia/Jakarta",
                                "default_keywords": [], "default_video_types": [],
                                "created_at": utcnow()})
    job_id = _make_job(db, "agent-1")
    static_pipeline.run_job(job_id, procs.CancelToken())

    job = db.discovery_jobs.find_one({"_id": job_id})
    assert job["status"] == "completed", job.get("errors")
    clips = list(db.clips.find({"job_id": job_id}))
    assert {c["youtube_id"] for c in clips} == {VID_A, VID_B}
    assert sorted(fake_world) == sorted([VID_A, VID_B])  # each download used its own video id
    by_hook = {c["hook_text"]: c for c in clips}
    assert by_hook["dari A"]["youtube_id"] == VID_A and by_hook["dari B"]["youtube_id"] == VID_B
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
