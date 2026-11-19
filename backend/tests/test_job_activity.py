"""A job's activity: the last job.progress message is kept on the job, so Antrian and Cari Video show
what a running job does or waits for even when they were opened after the message was sent (QA
2026-11-19: an upload job sat at "Analisis 15%" for about 5 minutes with no word in Antrian while
local Whisper waited for an export). A wait message is replaced once the wait is over."""
from __future__ import annotations

import threading
import time
from contextlib import contextmanager
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.agents.nodes import analyzer as an
from backend.core import resources
from backend.core.config import config
from backend.core.db import new_id, utcnow
from backend.models.documents import ClipDoc


@pytest.fixture()
def client(db, secrets):
    from backend.main import create_app

    with TestClient(create_app()) as c:
        c.headers.update({"Authorization": f"Bearer {config.token}"})
        yield c


def _ctx(job):
    from backend.agents.context import JobContext
    from backend.core.procs import CancelToken

    return JobContext(job, CancelToken())


def _job(db, campaigns=(), **extra):
    job = {"_id": new_id(), "source": {"type": "url", "youtube_url": "https://youtu.be/AAAAAAAAAAA"}, "config": {},
           "status": "running", "checkpoint": {}, "campaigns": list(campaigns),
           "campaign_ids": [c["id"] for c in campaigns], "created_at": utcnow(), **extra}
    db.discovery_jobs.insert_one(job)
    return job


def test_the_last_message_is_kept_while_the_job_runs(db, client, monkeypatch):
    from backend.api.routes import jobs as jobs_route

    job = _job(db)
    ctx = _ctx(job)
    ctx.progress(15, step="analysis", message="Whisper lokal menunggu export video selesai…")
    got = client.get(f"/api/jobs/{job['_id']}").json()["job"]
    assert got["activity"]["message"] == "Whisper lokal menunggu export video selesai…" and got["activity"]["at"]
    ctx.progress(20)  # progress without a message keeps it
    assert client.get(f"/api/jobs/{job['_id']}").json()["job"]["activity"]["message"].startswith("Whisper lokal")
    ctx.error("processing", "Klip 100–150s gagal: x")  # a warning is what the job last said, as on Cari Video
    assert client.get(f"/api/jobs/{job['_id']}").json()["job"]["activity"]["message"] == "Klip 100–150s gagal: x"
    ctx.progress(message="Transkripsi Whisper lokal: 40%")
    listed = client.get("/api/jobs").json()["jobs"]
    assert next(j for j in listed if j["id"] == job["_id"])["activity"]["message"] == "Transkripsi Whisper lokal: 40%"

    # Only while it runs; resuming starts without one
    db.discovery_jobs.update_one({"_id": job["_id"]}, {"$set": {"status": "interrupted"}})
    assert client.get(f"/api/jobs/{job['_id']}").json()["job"]["activity"] is None
    monkeypatch.setattr(jobs_route.runner, "submit_job", lambda job_id: None)
    assert client.post(f"/api/jobs/{job['_id']}/resume").status_code == 200
    assert db.discovery_jobs.find_one({"_id": job["_id"]})["activity"] is None
    # Older jobs have none
    old = _job(db)
    assert client.get(f"/api/jobs/{old['_id']}").json()["job"]["activity"] is None


def test_a_clip_that_waited_for_ram_says_when_it_starts(db, monkeypatch, paths):
    from backend.agents.nodes import processor
    from backend.services import campaigns as csvc

    camp = csvc.create("Channel sendiri")
    job = _job(db, [csvc.snapshot(camp)])
    ctx = _ctx(job)

    @contextmanager
    def waiting_hold(kind, need_mb, *, on_wait=None, **kw):
        if on_wait:
            on_wait(resources.WaitInfo(kind, need_mb, 1200, 1536, 1))
        yield None

    seen = []

    def fake_process(c, s, limits=(None, None)):
        seen.append(db.discovery_jobs.find_one({"_id": job["_id"]})["activity"]["message"])
        folder = paths.clip_dir(c.campaign_slug(s["campaign_id"]), s["segment_id"])
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "raw.mp4").write_bytes(b"video")
        doc = ClipDoc(_id=s["segment_id"], job_id=job["_id"], source_video_id="sv1", youtube_id="AAAAAAAAAAA",
                      start_time=100.0, end_time=150.0, duration_seconds=50.0,
                      files={"raw": paths.to_relative(folder / "raw.mp4")}, subtitle={"words": []},
                      campaign_id=s["campaign_id"], status="ready").to_mongo()
        db.clips.insert_one(doc)
        return doc

    monkeypatch.setattr(processor.resources, "hold", waiting_hold)
    monkeypatch.setattr(processor, "process_segment", fake_process)
    seg = {"segment_id": an.segment_id(job["_id"], "AAAAAAAAAAA", 100, 150, camp["_id"]), "source_video_id": "sv1",
           "youtube_id": "AAAAAAAAAAA", "start_time": 100.0, "end_time": 150.0, "duration_seconds": 50.0,
           "viral_score": 80, "hook_text": "hook", "tags": [], "rationale": "", "campaign_id": camp["_id"]}
    assert len(processor.run(ctx, [seg])) == 1
    assert seen == ["RAM cukup, klip 100s mulai diproses…"]
    assert db.discovery_jobs.find_one({"_id": job["_id"]})["activity"]["message"] == "Klip 1/1 selesai"


def test_local_whisper_says_when_it_stops_waiting(monkeypatch):
    from backend.agents.tools import whisper_local
    from backend.core import workload

    monkeypatch.setattr(resources, "_settings", lambda: {"auto": False, "reserve_gb": 0})
    monkeypatch.setattr(whisper_local, "binary", lambda: Path("whisper-cli.exe"))
    monkeypatch.setattr(whisper_local, "installed", lambda model: True)
    monkeypatch.setattr(whisper_local, "chosen_model", lambda words=True: whisper_local.MODELS["small"])
    ran = []
    monkeypatch.setattr(whisper_local, "_run", lambda exe, model, audio, cancel, on_status: ran.append(1) or {"words": []})

    said: list[str] = []
    whisper_local.transcribe(Path("a.wav"), words=True, on_status=said.append)
    assert said == [] and ran == [1]  # nothing to wait for: nothing extra is said

    release = threading.Event()
    started = threading.Event()

    def render():
        with workload.rendering():
            started.set()
            release.wait(5)

    t = threading.Thread(target=render, daemon=True)
    t.start()
    assert started.wait(2)
    threading.Timer(0.3, release.set).start()
    began = time.monotonic()
    whisper_local.transcribe(Path("a.wav"), words=True, on_status=said.append)
    t.join(2)
    assert time.monotonic() - began >= 0.25 and ran == [1, 1]
    assert said == ["Whisper lokal menunggu export video selesai…", "Transkripsi Whisper lokal: 0%"]
