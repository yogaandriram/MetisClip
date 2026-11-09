import pytest
from fastapi.testclient import TestClient
from pymongo.errors import WriteError

from backend.core.config import config
from backend.core.db import new_id, utcnow


@pytest.fixture()
def client(db, secrets):
    from backend.main import create_app

    with TestClient(create_app()) as c:
        c.headers.update({"Authorization": f"Bearer {config.token}"})
        yield c


def test_migration_creates_indexes_and_version(db):
    assert db.meta.find_one({"_id": "schema"})["version"] == 3
    assert "scheduled_posts" not in db.list_collection_names()
    names = {ix["name"] for ix in db.clips.list_indexes()}
    assert "agent_id_1_created_at_-1" in names
    ttl = [ix for ix in db.api_cache.list_indexes() if ix["name"] == "expires_at_1"][0]
    assert ttl["expireAfterSeconds"] == 0


def test_validator_rejects_bad_status(db):
    with pytest.raises(WriteError):
        db.clips.insert_one({"_id": new_id(), "start_time": 1.0, "end_time": 2.0, "status": "bogus",
                             "files": {}, "created_at": utcnow()})


def test_migration_is_idempotent(db):
    from backend.core.db import migrate

    assert migrate(db) == 3


def test_migration_002_removes_publishing_data(mongo):
    """A database created before scheduling/social connections were removed is cleaned up."""
    import os
    import time

    from backend.core import db as dbm
    from backend.db.migrations import m001_init

    name = f"metisclip_v1_{os.getpid()}_{time.time_ns()}"
    old = mongo[name]
    dbm.set_db(old, mongo)
    try:
        m001_init.up(old)  # current 001 + the collection/field the old 001 used to create
        old.create_collection("scheduled_posts")
        old.scheduled_posts.insert_one({"_id": "p1", "clip_id": "c1", "status": "scheduled"})
        old.super_agents.insert_one({"_id": "a1", "name": "Agen", "social_connections": [], "created_at": utcnow()})
        old.discovery_jobs.insert_one({"_id": "j1", "source": {"type": "url"}, "config": {}, "status": "completed",
                                       "current_step": "scheduling", "created_at": utcnow(),
                                       "checkpoint": {"analysis_done": True, "scheduling_done": True}})
        old.meta.insert_one({"_id": "schema", "version": 1})

        assert dbm.migrate(old) == 3
        assert "scheduled_posts" not in old.list_collection_names()
        assert "social_connections" not in old.super_agents.find_one({"_id": "a1"})
        job = old.discovery_jobs.find_one({"_id": "j1"})
        assert job["current_step"] == "processing"
        assert job["checkpoint"] == {"analysis_done": True}
    finally:
        mongo.drop_database(name)
        dbm.set_db(None, None)  # type: ignore[arg-type]


def test_auth_required(db):
    from backend.main import create_app

    with TestClient(create_app()) as c:
        assert c.get("/health").status_code == 200
        assert c.get("/api/agents").status_code == 401
        assert c.get("/api/agents", params={"token": config.token}).status_code == 200


def test_agent_crud_and_brand_template(client):
    r = client.post("/api/agents", json={"name": "Podcast Bisnis", "default_keywords": "AI, startup"})
    assert r.status_code == 200
    agent = r.json()["agent"]
    assert agent["default_keywords"] == "AI, startup"
    # A fresh database has one library template; new agents use the oldest one by default
    [tpl] = client.get("/api/brand-templates").json()["brand_templates"]
    assert tpl["name"] == "Template Default" and agent["default_brand_template_id"] == tpl["id"]
    # Same name -> unique slug
    client.post("/api/agents", json={"name": "Podcast Bisnis"})
    bt = client.put(f"/api/brand-templates/{tpl['id']}", json={"caption_settings": {"mode": "glitch"}}).json()
    assert bt["brand_template"]["caption_settings"] == {"mode": "glitch"}
    assert client.delete(f"/api/agents/{agent['id']}").json() == {"ok": True}
    assert len(client.get("/api/brand-templates").json()["brand_templates"]) == 1  # templates outlive agents
    assert len(client.get("/api/agents").json()["agents"]) == 1


def test_files_route_blocks_private_dirs(client, paths):
    (paths.private_dir / "db-credentials.json").write_text("{}")
    (paths.library_dir / "ok.txt").write_text("hi")
    assert client.get("/api/files/library/ok.txt").text == "hi"
    for bad in (".metisclip/db-credentials.json", "library/../.metisclip/db-credentials.json",
                ".METISCLIP/db-credentials.json", "db/WiredTiger", "library/%2e%2e/.metisclip/db-credentials.json"):
        assert client.get(f"/api/files/{bad}").status_code in (403, 404), bad


def test_clips_list_route_exists_k2(client):
    assert client.get("/api/clips").json() == {"clips": []}


def test_settings_roundtrip(client):
    s = client.put("/api/settings", json={"llm": {"preset": "custom", "base_url": "http://localhost:1234/v1", "model": "m"},
                                          "unknown": 1}).json()["settings"]
    assert s["llm"] == {"preset": "custom", "base_url": "http://localhost:1234/v1", "model": "m"}
    assert "unknown" not in s
    assert client.put("/api/settings", json={"processing": {"max_workers": 99}}).status_code == 400


def test_secrets_are_write_only(client):
    assert client.put("/api/secrets/groq_api_key", json={"value": "gsk_abcdefghijklmnop"}).status_code == 200
    body = client.get("/api/secrets").text
    assert "gsk_" not in body and '"groq_api_key":true' in body


def test_subtitle_update_and_effective_style(client, db):
    agent = client.post("/api/agents", json={"name": "A"}).json()["agent"]
    client.put(f"/api/brand-templates/{agent['default_brand_template_id']}", json={"caption_settings": {"mode": "lumina", "fontSize": 60}})
    cid = new_id()
    from backend.models.documents import ClipDoc

    db.clips.insert_one(ClipDoc(_id=cid, agent_id=agent["id"], job_id=None, source_video_id=None, youtube_id="x",
                                start_time=0, end_time=10, duration_seconds=10, status="ready").to_mongo())
    r = client.put(f"/api/clips/{cid}/subtitles", json={"words": [{"word": "Halo", "start": 0, "end": 0.4}],
                                                         "style": {"fontSize": 80}})
    assert r.json()["clip"]["subtitle_data"]["words"][0]["word"] == "Halo"
    detail = client.get(f"/api/clips/{cid}").json()
    assert detail["effective_style"] == {"mode": "lumina", "fontSize": 80}
    client.put(f"/api/clips/{cid}/subtitles", json={"reset_style": True})
    assert client.get(f"/api/clips/{cid}").json()["effective_style"] == {"mode": "lumina", "fontSize": 60}
