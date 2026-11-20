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


def fake_chat(system, user, **kw):
    """Scan: two clips in the first part (sentences 24-32 = 02:00-02:45, 60-68 = 05:00-05:45); rank: no changes."""
    if "Transcript part 1/" not in user:  # later parts, the rank pass, AI keyword/emoji marks
        return {"clips": []}
    scores = {"hook": 9, "value": 9, "standalone": 9, "payoff": 9, "shareability": 9}
    return {"clips": [{"start_id": 24, "end_id": 32, **scores, "hook_text": "pertama"},
                      {"start_id": 60, "end_id": 68, **scores, "payoff": 7, "hook_text": "kedua"}]}


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
    monkeypatch.setattr(analyzer.llm, "chat_json", fake_chat)  # module-level fake
    monkeypatch.setattr(processor.ytdlp, "download_section", fake_download)
    # No Groq key and no local engine: clip words come from the transcript
    monkeypatch.setattr(whisper_local, "binary", lambda: None)
    return downloads


def _campaign(name):
    """A plain campaign (no brief): its clips are the best moments by viral score."""
    from backend.services import campaigns

    return campaigns.snapshot(campaigns.create(name))


def _make_job(db, campaign):
    job = JobDoc(_id=new_id(), campaign_ids=[campaign["id"]], campaigns=[campaign],
                 source=JobSource(type="url", youtube_url=URL),
                 config=JobConfig(clip_duration="45-60", max_clips=2, max_clips_per_video=2)).to_mongo()
    db.discovery_jobs.insert_one(job)
    return job["_id"]


def test_link_job_clips_its_video_and_resume_is_idempotent(db, fake_world, monkeypatch):
    from backend.core import events

    sent: list[dict] = []
    monkeypatch.setattr(events, "publish", sent.append)
    camp = _campaign("Agen")
    job_id = _make_job(db, camp)
    static_pipeline.run_job(job_id, procs.CancelToken())
    # The final status names the video and the clip count (the Windows notification, §9.3)
    [done] = [e for e in sent if e["type"] == "job.status" and e["status"] == "completed"]
    assert done["title"] == f"Video {VID}" and done["clips"] == 2 and done["campaign_ids"] == [camp["id"]]

    job = db.discovery_jobs.find_one({"_id": job_id})
    assert job["status"] == "completed", job.get("errors")
    [video] = list(db.source_videos.find({"job_id": job_id}))
    assert video["youtube_id"] == VID and video["title"] == f"Video {VID}" and video["duration_seconds"] == 3600
    clips = list(db.clips.find({"job_id": job_id}))
    assert {c["hook_text"] for c in clips} == {"pertama", "kedua"}
    assert {c["youtube_id"] for c in clips} == {VID} and fake_world == [VID, VID]
    for c in clips:
        assert c["status"] == "ready" and c["campaign_id"] == camp["id"] and c.get("brief_fit") is None
        raw = get_paths().from_relative(c["files"]["raw"])
        assert raw.exists() and raw.stat().st_size > 0
        assert c["files"]["raw"].startswith("library/agen/")
        # The original-ratio cut is kept next to raw.mp4 (podcast layout)
        source = get_paths().from_relative(c["files"]["source"])
        assert source.parent == raw.parent and source.name == "source.mp4" and source.stat().st_size > 0
        assert (c["source_width"], c["source_height"]) == (640, 360)
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
        if words:  # per clip (fetched with a margin): a word every 0.5 s, a sentence ends every 4 words
            return {"words": [{"word": f"kata{k}" + ("." if k % 4 == 3 else ""), "start": k * 0.5, "end": k * 0.5 + 0.4}
                              for k in range(110)]}
        return {"segments": [{"text": f"Kalimat {i}.", "start": i * 5.0, "end": i * 5.0 + 5} for i in range(80)]}

    def chat(system, user, **kw):
        if "Transcript part" in user:
            assert "Video title: podcast lokal" in user  # the file name is the title
        return fake_chat(system, user, **kw)

    monkeypatch.setattr(whisper, "transcribe", fake_transcribe)
    monkeypatch.setattr(analyzer.llm, "chat_json", chat)
    monkeypatch.setattr(processor.ytdlp, "download_section", lambda *a, **k: pytest.fail("an upload never downloads"))
    camp = _campaign("Agen Upload")
    job = JobDoc(_id=new_id(), campaign_ids=[camp["id"]], campaigns=[camp],
                 source=JobSource(type="local_file", local_file_path=str(video_path)),
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
        source = ffmpeg_ops.probe_media(get_paths().from_relative(c["files"]["source"]))
        assert (source["width"], source["height"]) == (64, 64) == (c["source_width"], c["source_height"])
        # Same timeline as raw (both start at the clip's start); lengths may differ by one frame (1 s here)
        assert source["duration"] == pytest.approx(info["duration"], abs=1.01)
        # Trimmed at the sentence boundaries of the clip's own words: it starts on the first word of a
        # sentence and ends right after a word with a full stop
        words = c["subtitle"]["words"]
        assert int(words[0]["word"][4:]) % 4 == 0 and words[0]["start"] < 0.2
        assert words[-1]["word"].endswith(".") and words[-1]["end"] <= c["end_time"] - c["start_time"]
    assert calls.count(False) == 1 and calls.count(True) == 2  # one transcript, Whisper words per clip

    # Resume a finished job: nothing is cut or transcribed again
    db.discovery_jobs.update_one({"_id": job["_id"]}, {"$set": {"status": "pending"}})
    static_pipeline.run_job(job["_id"], procs.CancelToken())
    assert db.clips.count_documents({"job_id": job["_id"]}) == 2 and len(calls) == 3


def test_upload_job_fails_clearly_when_the_file_is_gone(db, secrets, tmp_path, monkeypatch):
    from backend.core import events

    sent: list[dict] = []
    monkeypatch.setattr(events, "publish", sent.append)
    secrets.set_secret("llm_api_key", "sk-test-0000000000")
    gone = str(tmp_path / "dipindah.mp4")
    job_id = new_id()
    db.discovery_jobs.insert_one(JobDoc(
        _id=job_id, source=JobSource(type="local_file", local_file_path=gone),
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
    [failed] = [e for e in sent if e["type"] == "job.status" and e["status"] == "failed"]
    assert failed["error"].startswith("File video tidak ditemukan") and "clips" not in failed


def test_cancel_marks_job_cancelled(db, fake_world):
    job_id = _make_job(db, _campaign("Agen"))
    token = procs.CancelToken()
    token.cancel()
    static_pipeline.run_job(job_id, token)
    assert db.discovery_jobs.find_one({"_id": job_id})["status"] == "cancelled"


def test_missing_llm_key_fails_with_indonesian_message_in_production(db, fake_world, secrets, monkeypatch):
    from backend.core.config import config

    secrets.delete_secret("llm_api_key")
    monkeypatch.setattr(config, "env", "production")
    job_id = _make_job(db, _campaign("Agen"))
    static_pipeline.run_job(job_id, procs.CancelToken())
    job = db.discovery_jobs.find_one({"_id": job_id})
    assert job["status"] == "failed"
    assert "API key LLM (OpenAI-compatible) belum diisi" in job["errors"][-1]["message"]


def test_clip_without_any_words_gets_no_invented_captions_in_production(db, fake_world, secrets, monkeypatch):
    """Without Whisper words or transcript words for a clip, production keeps the clip with no captions and
    says so; it never fills in the hook text as fake words (dev still does, for demos)."""
    from backend.core.config import config

    monkeypatch.setattr(config, "env", "production")
    secrets.set_secret("llm_api_key", "sk-test-0000000000")  # the production keyring service
    monkeypatch.setattr(processor, "words_from_transcript", lambda *a, **k: [])
    job_id = _make_job(db, _campaign("Agen"))
    static_pipeline.run_job(job_id, procs.CancelToken())
    job = db.discovery_jobs.find_one({"_id": job_id})
    assert job["status"] == "completed", job.get("errors")
    clips = list(db.clips.find({"job_id": job_id}))
    assert len(clips) == 2 and all(c["subtitle"]["words"] == [] for c in clips)
    assert sum("tidak punya subtitle" in e["message"] for e in job["errors"]) == 2
