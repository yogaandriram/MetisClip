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


def test_failed_clips_of_a_completed_job_can_be_retried(db, fake_world, monkeypatch):
    """A job whose clips partly failed completes with failed_clips; resuming it processes only those, and
    never brings back a clip the user deleted meanwhile."""
    from backend.api.dto import job_dto
    from backend.api.routes import jobs as jobs_route

    real = processor.process_segment
    calls: list[str] = []

    def flaky(ctx, seg, limits=(None, None)):
        calls.append(seg["hook_text"])
        if seg["hook_text"] == "kedua" and calls.count("kedua") == 1:
            raise RuntimeError("encoder rusak")
        return real(ctx, seg, limits)

    monkeypatch.setattr(processor, "process_segment", flaky)
    job_id = _make_job(db, _campaign("Agen"))
    static_pipeline.run_job(job_id, procs.CancelToken())
    job = db.discovery_jobs.find_one({"_id": job_id})
    assert job["status"] == "completed" and "1 dari 2 klip gagal" in job["errors"][-1]["message"]
    assert job_dto(job)["failed_clips"] == 1
    [first] = list(db.clips.find({"job_id": job_id}))
    assert first["hook_text"] == "pertama"
    db.clips.delete_one({"_id": first["_id"]})  # the user deleted the clip that worked

    submitted: list[str] = []
    monkeypatch.setattr(jobs_route.runner, "submit_job", submitted.append)
    assert jobs_route.resume_job(job_id)["job"]["status"] == "pending" and submitted == [job_id]
    static_pipeline.run_job(job_id, procs.CancelToken())
    job = db.discovery_jobs.find_one({"_id": job_id})
    assert job["status"] == "completed" and job_dto(job)["failed_clips"] == 0
    assert [c["hook_text"] for c in db.clips.find({"job_id": job_id})] == ["kedua"]
    assert sorted(calls) == ["kedua", "kedua", "pertama"]  # clips run in parallel
    # Nothing left to retry: a completed job without failed clips is not resumable
    with pytest.raises(Exception):
        jobs_route.resume_job(job_id)


def test_a_full_disk_stops_the_job_before_its_next_clip_and_refuses_new_work(db, fake_world, monkeypatch):
    """Below 2 GB free (CLAUDE.md §6.1) a running job fails before its next cut (resumable), and creating,
    resuming or exporting is refused with 507."""
    from collections import namedtuple

    from fastapi import HTTPException

    from backend.api.routes import clips as clips_route
    from backend.api.routes import jobs as jobs_route
    from backend.core import disk
    from backend.core.settings_store import update_settings

    usage = namedtuple("usage", "total used free")
    free = {"bytes": 50 * disk.GB}
    monkeypatch.setattr(disk.shutil, "disk_usage", lambda p: usage(100 * disk.GB, 0, free["bytes"]))
    update_settings({"processing": {"max_workers": 1}})  # one clip at a time: the second sees the full disk
    real = processor.process_segment
    done: list[str] = []

    def fills_the_disk(ctx, seg, limits=(None, None)):
        clip = real(ctx, seg, limits)
        done.append(seg["hook_text"])
        free["bytes"] = int(1.5 * disk.GB)  # the first clip left the drive nearly full
        return clip

    monkeypatch.setattr(processor, "process_segment", fills_the_disk)
    job_id = _make_job(db, _campaign("Agen"))
    static_pipeline.run_job(job_id, procs.CancelToken())
    job = db.discovery_jobs.find_one({"_id": job_id})
    assert job["status"] == "failed" and "Ruang disk hampir habis (1.5 GB tersisa)" in job["errors"][-1]["message"]
    assert len(done) == 1 and db.clips.count_documents({"job_id": job_id}) == 1

    with pytest.raises(HTTPException) as err:
        jobs_route.resume_job(job_id)
    assert err.value.status_code == 507
    clip = db.clips.find_one({"job_id": job_id})
    with pytest.raises(HTTPException) as err:
        clips_route.render_clip(clip["_id"])
    assert err.value.status_code == 507

    free["bytes"] = 40 * disk.GB  # space freed: the job resumes and makes the other clip
    submitted: list[str] = []
    monkeypatch.setattr(jobs_route.runner, "submit_job", submitted.append)
    assert jobs_route.resume_job(job_id)["job"]["status"] == "pending"
    static_pipeline.run_job(job_id, procs.CancelToken())
    assert db.discovery_jobs.find_one({"_id": job_id})["status"] == "completed"
    assert db.clips.count_documents({"job_id": job_id}) == 2


def test_disk_check_counts_what_the_work_needs(monkeypatch):
    from collections import namedtuple

    from backend.core import disk

    usage = namedtuple("usage", "total used free")
    monkeypatch.setattr(disk.shutil, "disk_usage", lambda p: usage(100 * disk.GB, 0, 2.5 * disk.GB))
    disk.check(warn=False)  # 2.5 GB left: fine without a need
    with pytest.raises(disk.DiskFull, match="butuh sekitar 0.1 GB lagi"):
        disk.check(int(0.6 * disk.GB), warn=False)  # a 0.6 GB model would leave 1.9 GB


# -- moments the user chose (agents/nodes/manual.py) -------------------------------------------------


def _manual_job(db, campaign, ranges, snap=True):
    job = JobDoc(_id=new_id(), campaign_ids=[campaign["id"]], campaigns=[campaign],
                 source=JobSource(type="url", youtube_url=URL),
                 config=JobConfig(manual_ranges=ranges, snap_edges=snap)).to_mongo()
    db.discovery_jobs.insert_one(job)
    return job["_id"]


def test_a_manual_job_clips_the_chosen_moments_without_the_analyzer(db, fake_world, monkeypatch):
    from backend.agents.nodes import manual

    monkeypatch.setattr(manual, "get_transcript", analyzer.get_transcript)  # the fake (no Whisper here)
    monkeypatch.setattr(analyzer, "run", lambda *a, **k: pytest.fail("the Analyzer must not run"))
    camp = _campaign("Manual")
    job_id = _manual_job(db, camp, [{"start": 120.0, "end": 140.0}, {"start": 300.0, "end": 330.0}])
    static_pipeline.run_job(job_id, procs.CancelToken())
    job = db.discovery_jobs.find_one({"_id": job_id})
    assert job["status"] == "completed", job.get("errors")
    clips = sorted(db.clips.find({"job_id": job_id}), key=lambda c: c["start_time"])
    assert [(c["start_time"], c["end_time"]) for c in clips] == [(120.0, 140.0), (300.0, 330.0)]
    assert all(c["origin"] == "manual" and c["viral_score"] == 0 and c["campaign_id"] == camp["id"] for c in clips)
    # Titled from the first sentence of their words
    assert [c["hook_text"] for c in clips] == ["Ini kalimat nomor 24.", "Ini kalimat nomor 60."]

    from backend.api.dto import job_dto

    assert job_dto(job)["kind"] == "manual"


def test_a_recut_replaces_the_files_and_keeps_the_users_edits(db, fake_world, monkeypatch):
    from backend.agents.nodes import manual
    from backend.api.dto import job_dto
    from backend.api.routes import clips as clips_route
    from backend.api.routes import jobs as jobs_route
    from backend.core import events

    monkeypatch.setattr(manual, "get_transcript", analyzer.get_transcript)
    camp = _campaign("Recut")
    job_id = _manual_job(db, camp, [{"start": 120.0, "end": 140.0}])
    static_pipeline.run_job(job_id, procs.CancelToken())
    [clip] = list(db.clips.find({"job_id": job_id}))
    folder = get_paths().from_relative(clip["files"]["raw"]).parent
    (folder / "final.mp4").write_bytes(b"old export")
    (folder / "cover.jpg").write_bytes(b"old cover")
    db.clips.update_one({"_id": clip["_id"]}, {"$set": {
        "cover_time": 12.0, "files.cover": clip["files"]["raw"].replace("raw.mp4", "cover.jpg"),
        "subtitle.words": [{"word": "DIEDIT", "start": 0.0, "end": 0.5}],
        # Translated subtitles: the spoken words are cut the same way (gap analysis B10)
        "subtitle.translation": {"language": "en", "original_words": [{"word": "DIUCAPKAN", "start": 0.0, "end": 0.5}],
                                 "original_title": "Judul asli", "partial": False},
        "subtitle_style": {"fontSize": 40}, "hook_text": "Judul saya",
        "files.final": clip["files"]["raw"].replace("raw.mp4", "final.mp4"), "status": "exported"}})

    submitted: list[str] = []
    monkeypatch.setattr(jobs_route.runner, "submit_job", submitted.append)
    res = clips_route.recut_clip(clip["_id"], clips_route.RecutBody(start=115, end=140))
    recut_id = res["job"]["id"]
    assert submitted == [recut_id] and res["job"]["kind"] == "recut" and res["job"]["recut_clip_id"] == clip["_id"]
    assert clips_route.get_clip(clip["_id"])["recut_job"]["id"] == recut_id
    with pytest.raises(Exception) as err:  # one recut at a time, and no export meanwhile
        clips_route.recut_clip(clip["_id"], clips_route.RecutBody(start=110, end=140))
    assert err.value.status_code == 409
    with pytest.raises(Exception) as err:
        clips_route.render_clip(clip["_id"])
    assert err.value.status_code == 409

    sent: list[dict] = []
    monkeypatch.setattr(events, "publish", sent.append)
    static_pipeline.run_job(recut_id, procs.CancelToken())
    assert db.discovery_jobs.find_one({"_id": recut_id})["status"] == "completed"
    after = db.clips.find_one({"_id": clip["_id"]})
    assert (after["start_time"], after["end_time"]) == (115.0, 140.0)
    assert after["job_id"] == job_id and db.clips.count_documents({}) == 1  # the same clip, not a new one
    assert after["hook_text"] == "Judul saya" and after["subtitle_style"] == {"fontSize": 40}
    assert after["status"] == "ready" and after["files"]["final"] is None and not (folder / "final.mp4").exists()
    # The chosen cover belonged to the old timeline
    assert after["cover_time"] is None and after["files"].get("cover") is None and not (folder / "cover.jpg").exists()
    words = after["subtitle"]["words"]
    # The added 5 s at the start come from the transcript; the edited word moved with its moment
    assert [w["word"] for w in words] == ["Ini", "kalimat", "nomor", "23.", "DIEDIT"]
    assert words[-1]["start"] == 5.0 and words[-1]["end"] == 5.5
    tr = after["subtitle"]["translation"]
    assert [w["word"] for w in tr["original_words"]] == ["Ini", "kalimat", "nomor", "23.", "DIUCAPKAN"]
    assert tr["original_words"][-1]["start"] == 5.0 and tr["partial"] is True  # the added words are not translated
    assert tr["language"] == "en" and tr["original_title"] == "Judul asli"
    assert get_paths().from_relative(after["files"]["raw"]).parent == folder
    # Every status event names the clip, so its editor follows a recut it did not start itself
    [running, done] = [e for e in sent if e["type"] == "job.status" and e["status"] in ("running", "completed")]
    assert running["kind"] == "recut" and running["clip_id"] == clip["_id"]
    assert done["kind"] == "recut" and done["clip_id"] == clip["_id"] and done["clips"] == 1
    assert job_dto(db.discovery_jobs.find_one({"_id": recut_id}))["kind"] == "recut"
    assert clips_route.get_clip(clip["_id"])["recut_job"] is None


def test_user_ranges_are_validated(db):
    from backend.agents.nodes import manual

    assert manual.clean_ranges([{"start": -3, "end": 20.004}]) == [{"start": 0.0, "end": 20.0}]
    for bad in ([], [{"start": 10, "end": 5}], [{"start": 0, "end": 2}], [{"start": 0, "end": 200}],
                [{"start": 0, "end": 30}] * 21, [{"start": "x", "end": 9}]):
        with pytest.raises(manual.RangeError):
            manual.clean_ranges(bad)
    with pytest.raises(manual.RangeError, match="setelah video berakhir"):
        manual.clean_ranges([{"start": 400, "end": 420}], duration=300)


def test_recut_words_keep_the_overlap_and_add_only_new_parts():
    old = [{"word": w, "start": t, "end": t + 1} for w, t in (("a", 0), ("b", 2), ("c", 4), ("d", 6), ("e", 8))]
    new = [{"word": w.upper(), "start": t, "end": t + 1} for w, t in (("x", 0), ("b", 1), ("c", 3))]
    # Trimmed 3 s at the start and 2 s at the end: old words inside [3, 8] stay, shifted; nothing is added
    words, added = processor.merge_recut_words(old, 100, 110, new, 103, 108)
    assert [(w["word"], w["start"]) for w in words] == [("c", 1.0), ("d", 3.0)] and added == []
    # Extended 2 s at the start: the new words there (source 98-100) are added, the old words move by 2 s
    words, added = processor.merge_recut_words(old, 100, 110, new, 98, 110)
    assert [w["word"] for w in words] == ["X", "B", "a", "b", "c", "d", "e"] and added == [0, 1]
    assert words[2]["start"] == 2.0
    # No words before (e.g. Whisper had failed): all new words
    words, added = processor.merge_recut_words([], 100, 110, new, 98, 110)
    assert [w["word"] for w in words] == ["X", "B", "C"] and added == [0, 1, 2]
