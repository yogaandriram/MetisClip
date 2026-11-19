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
    assert db.meta.find_one({"_id": "schema"})["version"] == 12
    assert not {"scheduled_posts", "api_cache", "super_agents"} & set(db.list_collection_names())
    names = {ix["name"] for ix in db.clips.list_indexes()}
    assert "campaign_id_1_created_at_-1" in names and "agent_id_1_created_at_-1" not in names
    assert "campaign_ids_1_created_at_-1" in {ix["name"] for ix in db.discovery_jobs.list_indexes()}


def test_validator_rejects_bad_status(db):
    with pytest.raises(WriteError):
        db.clips.insert_one({"_id": new_id(), "start_time": 1.0, "end_time": 2.0, "status": "bogus",
                             "files": {}, "created_at": utcnow()})


def test_migration_is_idempotent(db):
    from backend.core.db import migrate

    assert migrate(db) == 12


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

        assert dbm.migrate(old) == 12
        assert "scheduled_posts" not in old.list_collection_names()
        # The workspace became a campaign (migration 010) without the old field
        assert "social_connections" not in old.campaigns.find_one({"name": "Agen"})
        job = old.discovery_jobs.find_one({"_id": "j1"})
        assert job["current_step"] == "processing"
        assert job["checkpoint"] == {"analysis_done": True}
    finally:
        mongo.drop_database(name)
        dbm.set_db(None, None)  # type: ignore[arg-type]


def test_migration_005_removes_keyword_search(mongo, secrets):
    """A database from before keyword search was removed loses the search cache, fields and key."""
    import os
    import time

    from backend.core import db as dbm
    from backend.db.migrations import m001_init

    name = f"metisclip_v4_{os.getpid()}_{time.time_ns()}"
    old = mongo[name]
    dbm.set_db(old, mongo)
    try:
        m001_init.up(old)
        old.create_collection("api_cache")
        old.api_cache.insert_one({"_id": "yt:x", "value": {}, "expires_at": utcnow()})
        old.super_agents.insert_one({"_id": "a1", "name": "Agen", "default_keywords": ["AI"],
                                     "default_video_types": ["podcast"], "niche": "bisnis", "created_at": utcnow()})
        old.discovery_jobs.insert_one({"_id": "j1", "source": {"type": "keyword", "keywords": ["AI"], "youtube_url": None},
                                       "config": {"video_types": ["podcast"], "min_duration_minutes": 30, "min_views": 0,
                                                  "clip_duration": "45-60"},
                                       "status": "completed", "created_at": utcnow()})
        old.source_videos.insert_one({"_id": "v1", "job_id": "j1", "youtube_id": "abc", "video_type": "podcast",
                                      "quality_score": 42.0, "created_at": utcnow()})
        old.meta.insert_one({"_id": "schema", "version": 4})
        secrets.set_secret("youtube_api_key", "AIza-test-key")

        assert dbm.migrate(old) == 12
        assert "api_cache" not in old.list_collection_names()
        assert "default_keywords" not in old.campaigns.find_one({"name": "Agen"})
        job = old.discovery_jobs.find_one({"_id": "j1"})
        assert job["source"] == {"type": "keyword", "youtube_url": None} and job["config"] == {"clip_duration": "45-60"}
        assert set(old.source_videos.find_one({"_id": "v1"})) == {"_id", "job_id", "youtube_id", "created_at"}
        assert secrets.get_secret("youtube_api_key") is None
        assert dbm.migrate(old) == 12  # idempotent
    finally:
        mongo.drop_database(name)
        dbm.set_db(None, None)  # type: ignore[arg-type]


def test_migration_006_accepts_uploaded_source_videos(mongo):
    """Before 006 the validator required youtube_id; an uploaded file has file_path instead."""
    import os
    import time

    from backend.core import db as dbm
    from backend.db.migrations import m001_init

    name = f"metisclip_v5_{os.getpid()}_{time.time_ns()}"
    old = mongo[name]
    dbm.set_db(old, mongo)
    try:
        m001_init.up(old)
        old.command("collMod", "source_videos", validator={"$jsonSchema": {
            "bsonType": "object", "required": ["_id", "job_id", "youtube_id", "created_at"],
            "properties": {"youtube_id": {"bsonType": "string"}}}}, validationLevel="moderate")
        upload = {"_id": "v1", "job_id": "j1", "youtube_id": None, "file_path": "D:\\Video\\a.mp4", "created_at": utcnow()}
        with pytest.raises(WriteError):
            old.source_videos.insert_one(dict(upload))
        old.meta.insert_one({"_id": "schema", "version": 5})
        assert dbm.migrate(old) == 12
        old.source_videos.insert_one(upload)
    finally:
        mongo.drop_database(name)
        dbm.set_db(None, None)  # type: ignore[arg-type]


def test_migration_008_moves_the_old_default_caption_position(mongo):
    """Captions still at the old default (80, inside the platforms' bottom UI) move to the safe default."""
    import os
    import time

    from backend.core import db as dbm
    from backend.db.migrations import m001_init, m003_brand_template_library

    name = f"metisclip_v7_{os.getpid()}_{time.time_ns()}"
    old = mongo[name]
    dbm.set_db(old, mongo)
    try:
        m001_init.up(old)
        m003_brand_template_library.up(old)
        now = utcnow()
        old.brand_templates.insert_many([
            {"_id": "t-old", "name": "Lama", "caption_settings": {"mode": "lumina", "positionY": 80, "fontSize": 40},
             "created_at": now, "updated_at": now},
            {"_id": "t-own", "name": "Sendiri", "caption_settings": {"mode": "lumina", "positionY": 260},
             "created_at": now, "updated_at": now},
        ])
        clip = {"job_id": None, "source_video_id": None, "youtube_id": "x", "start_time": 0,
                "end_time": 10, "duration_seconds": 10, "status": "ready", "files": {}, "created_at": now, "updated_at": now}
        old.clips.insert_many([
            {**clip, "_id": "c-old", "subtitle_style": {"mode": "glitch", "positionY": 80}},
            {**clip, "_id": "c-own", "subtitle_style": {"positionY": 120}},
            {**clip, "_id": "c-none", "subtitle_style": {}},
        ])
        old.meta.insert_one({"_id": "schema", "version": 7})
        assert dbm.migrate(old) == 12

        assert old.brand_templates.find_one({"_id": "t-old"})["caption_settings"] == {"mode": "lumina", "fontSize": 40}
        assert old.brand_templates.find_one({"_id": "t-own"})["caption_settings"]["positionY"] == 260
        assert old.clips.find_one({"_id": "c-old"})["subtitle_style"] == {"mode": "glitch", "positionY": 190}
        assert old.clips.find_one({"_id": "c-own"})["subtitle_style"] == {"positionY": 120}
        assert old.clips.find_one({"_id": "c-none"})["subtitle_style"] == {}
        # Clips without a workspace or campaign end up in one "Clip lama" campaign
        [older] = list(old.campaigns.find({}))
        assert older["name"] == "Clip lama" and older["slug"] == "clip-lama"
        assert {c["campaign_id"] for c in old.clips.find({})} == {older["_id"]}
    finally:
        mongo.drop_database(name)
        dbm.set_db(None, None)  # type: ignore[arg-type]


def test_auth_required(db):
    from backend.main import create_app

    with TestClient(create_app()) as c:
        assert c.get("/health").status_code == 200
        assert c.get("/api/campaigns").status_code == 401
        assert c.get("/api/campaigns", params={"token": config.token}).status_code == 200
        assert c.get("/api/agents", params={"token": config.token}).status_code == 404  # workspaces are gone


def test_campaign_is_the_container(client, db, paths):
    from backend.models.documents import ClipDoc, JobConfig, JobDoc, JobSource

    a = client.post("/api/campaigns", json={"name": "Podcast Bisnis"}).json()["campaign"]
    b = client.post("/api/campaigns", json={"name": "Podcast Bisnis"}).json()["campaign"]
    other = client.post("/api/campaigns", json={"name": "Lain"}).json()["campaign"]
    slugs = {c["_id"]: c["slug"] for c in db.campaigns.find({})}
    assert slugs[a["id"]] == "podcast-bisnis" and slugs[b["id"]] == "podcast-bisnis-2"  # one folder each
    # Each campaign got its own brand template, its default
    templates = client.get("/api/brand-templates").json()["brand_templates"]
    assert len(templates) == 3 and all(t["is_default"] for t in templates)
    assert {t["campaign_id"] for t in templates} == {a["id"], b["id"], other["id"]}

    # Clips and jobs: the job that follows only `a` goes with it, the shared one keeps following `other`
    only_a = JobDoc(_id=new_id(), source=JobSource(type="url", youtube_url="https://youtu.be/abcdefghijk"), config=JobConfig(),
                    campaign_ids=[a["id"]], status="completed").to_mongo()
    shared = JobDoc(_id=new_id(), source=JobSource(type="url", youtube_url="https://youtu.be/abcdefghijk"), config=JobConfig(),
                    campaign_ids=[a["id"], other["id"]], campaigns=[{"id": a["id"]}, {"id": other["id"]}],
                    status="completed").to_mongo()
    db.discovery_jobs.insert_many([only_a, shared])
    clip_ids = []
    for cid, n in ((a["id"], 2), (other["id"], 1)):
        for _ in range(n):
            clip_id = new_id()
            folder = paths.clip_dir(slugs[cid], clip_id)
            folder.mkdir(parents=True, exist_ok=True)
            (folder / "raw.mp4").write_bytes(b"v")
            db.clips.insert_one(ClipDoc(_id=clip_id, campaign_id=cid, job_id=shared["_id"], source_video_id=None,
                                        youtube_id="x", start_time=0, end_time=10, duration_seconds=10, status="ready",
                                        files={"raw": paths.to_relative(folder / "raw.mp4")}).to_mongo())
            clip_ids.append(clip_id)
    assert client.get("/api/dashboard/stats", params={"campaign_id": a["id"]}).json()["clipsGenerated"] == 2
    assert client.get("/api/dashboard/stats").json()["clipsGenerated"] == 3
    storage = client.get("/api/system/storage").json()
    assert [c["name"] for c in storage["per_campaign"]] == ["Podcast Bisnis", "Podcast Bisnis", "Lain"]
    assert storage["per_campaign"][0]["bytes"] == 2

    r = client.delete(f"/api/campaigns/{a['id']}", params={"delete_files": True})
    assert r.json() == {"ok": True, "deleted_clips": 2}
    assert db.clips.count_documents({}) == 1 and db.discovery_jobs.find_one({"_id": only_a["_id"]}) is None
    kept = db.discovery_jobs.find_one({"_id": shared["_id"]})
    assert kept["campaign_ids"] == [other["id"]] and kept["campaigns"] == [{"id": other["id"]}]
    assert not paths.campaign_library("podcast-bisnis").exists()  # its clip folders and the emptied folder
    assert paths.clip_dir("lain", clip_ids[2]).exists()
    assert len(client.get("/api/brand-templates").json()["brand_templates"]) == 2  # its template went with it


def test_migration_010_turns_workspaces_into_campaigns(mongo, paths):
    import os
    import time

    from backend.core import db as dbm
    from backend.db.migrations import m001_init, m003_brand_template_library, m009_campaigns
    from backend.db.migrations import m010_campaigns_replace_workspaces as m010

    name = f"metisclip_v9_{os.getpid()}_{time.time_ns()}"
    old = mongo[name]
    dbm.set_db(old, mongo)
    try:
        m001_init.up(old)
        m003_brand_template_library.up(old)
        m009_campaigns.up(old)
        now = utcnow()
        tpl = old.brand_templates.find_one({})["_id"]
        old.super_agents.insert_many([
            {"_id": "w1", "name": "Podcast Bisnis", "slug": "podcast-bisnis", "niche": "bisnis",
             "default_brand_template_id": "t-own", "created_at": now},
            {"_id": "w2", "name": "Kosong", "slug": "kosong", "default_brand_template_id": "gone", "created_at": now},
        ])
        old.brand_templates.insert_one({"_id": "t-own", "name": "Sendiri", "created_at": now, "updated_at": now})
        # A campaign made before (with a brief) whose name would take the same folder
        old.campaigns.insert_one({"_id": "camp", "name": "Podcast Bisnis", "status": "active", "brief": {"focus": ["x"]},
                                  "sources": [], "version": 1, "created_at": now, "updated_at": now})
        job = {"source": {"type": "url"}, "config": {}, "status": "completed", "checkpoint": {}, "created_at": now}
        old.discovery_jobs.insert_many([
            {**job, "_id": "j1", "agent_id": "w1"},
            {**job, "_id": "j2", "agent_id": "w1", "campaign_ids": ["camp"], "campaigns": [{"id": "camp"}]},
            {**job, "_id": "j3", "agent_id": "deleted"},
        ])
        clip = {"job_id": "j1", "source_video_id": None, "youtube_id": "x", "start_time": 0, "end_time": 10,
                "duration_seconds": 10, "status": "ready", "files": {}, "created_at": now, "updated_at": now}
        old.clips.insert_many([
            {**clip, "_id": "c1", "agent_id": "w1"},
            {**clip, "_id": "c2", "agent_id": "w1", "campaign_id": "camp"},
            {**clip, "_id": "c3", "agent_id": "deleted"},
        ])
        old.source_videos.insert_one({"_id": "sv", "job_id": "j1", "agent_id": "w1", "created_at": now})
        old.meta.insert_one({"_id": "schema", "version": 9})
        assert dbm.migrate(old) == 12
        m010.up(old)  # a re-run is harmless

        camps = {c["name"]: c for c in old.campaigns.find({})}
        assert set(camps) == {"Podcast Bisnis", "Kosong", "Clip lama"} and old.campaigns.count_documents({}) == 4
        ws = old.campaigns.find_one({"name": "Podcast Bisnis", "_id": {"$ne": "camp"}})
        # The workspace's campaign keeps its folder and template; the older campaign got another folder
        assert ws["slug"] == "podcast-bisnis" and ws["brand_template_id"] == "t-own" and ws["brief"]["focus"] == []
        assert old.campaigns.find_one({"_id": "camp"})["slug"] == "podcast-bisnis-2"
        # Its template was gone: migration 011 gave it the old default template, now its own
        assert old.brand_templates.find_one({"_id": camps["Kosong"]["brand_template_id"]})["campaign_id"] == camps["Kosong"]["_id"]
        assert old.clips.find_one({"_id": "c1"})["campaign_id"] == ws["_id"]
        assert old.clips.find_one({"_id": "c2"})["campaign_id"] == "camp"
        assert old.clips.find_one({"_id": "c3"})["campaign_id"] == camps["Clip lama"]["_id"]
        j1 = old.discovery_jobs.find_one({"_id": "j1"})
        assert j1["campaign_ids"] == [ws["_id"]] and j1["campaigns"][0]["name"] == "Podcast Bisnis"
        assert old.discovery_jobs.find_one({"_id": "j2"})["campaign_ids"] == ["camp"]
        assert old.discovery_jobs.find_one({"_id": "j3"})["campaign_ids"] == [camps["Clip lama"]["_id"]]
        for coll in ("clips", "discovery_jobs", "source_videos"):
            assert not old[coll].count_documents({"agent_id": {"$exists": True}})
        assert "super_agents" not in old.list_collection_names()
        assert old.meta.find_one({"_id": m010.MAP_ID}) is None
        assert tpl
    finally:
        mongo.drop_database(name)
        dbm.set_db(None, None)  # type: ignore[arg-type]


def _video(path, *, audio=True):
    from backend.core import procs
    from backend.core.config import ffmpeg_path

    args = [ffmpeg_path(), "-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=64x64:rate=5:duration=1"]
    if audio:
        args += ["-f", "lavfi", "-i", "sine=duration=1", "-c:a", "aac", "-shortest"]
    procs.run(args + ["-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", str(path)], timeout=120)
    return str(path)


def test_job_sources_are_validated(client, tmp_path):
    camp = client.post("/api/campaigns", json={"name": "Sumber"}).json()["campaign"]

    def post(**body):
        r = client.post("/api/jobs", json={"campaign_ids": [camp["id"]], **body})
        return r.status_code, r.json().get("detail")

    one_of = (400, "Isi link YouTube atau pilih file video (salah satu)")
    assert post(source_type="keyword", keywords=["AI"]) == one_of  # the removed keyword search
    assert post(youtube_url="https://youtu.be/abcdefghijk", local_file_path="C:\\a.mp4") == one_of
    assert post(youtube_url="https://example.com/video") == (400, "URL YouTube tidak valid")
    # Uploads: an absolute path to a readable video with sound
    assert post(local_file_path="video.mp4") == (400, "Pilih file video dari komputer Anda")
    assert post(local_file_path=str(tmp_path / "hilang.mp4"))[1].startswith("File video tidak ditemukan")
    (tmp_path / "catatan.txt").write_text("x")
    assert post(local_file_path=str(tmp_path / "catatan.txt"))[1].startswith("Format file tidak didukung")
    (tmp_path / "rusak.mp4").write_text("bukan video")
    assert post(local_file_path=str(tmp_path / "rusak.mp4"))[1].startswith("File ini tidak bisa dibaca")
    silent = _video(tmp_path / "bisu.mp4", audio=False)
    assert "tidak punya suara" in post(local_file_path=silent)[1]
    # Without a transcription engine outside dev: see test_whisper.test_upload_jobs_need_a_transcription_engine


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
    s = client.put("/api/settings", json={"llm": {"provider": "openai_compatible", "base_url": "http://localhost:1234/v1",
                                                  "models": {"openai_compatible": "m", "bogus": "x"}},
                                          "unknown": 1}).json()["settings"]
    assert s["llm"]["provider"] == "openai_compatible" and s["llm"]["base_url"] == "http://localhost:1234/v1"
    assert s["llm"]["models"]["openai_compatible"] == "m" and "bogus" not in s["llm"]["models"]
    assert s["llm"]["models"]["anthropic"]  # every provider keeps a (default) model
    assert "unknown" not in s
    assert client.put("/api/settings", json={"processing": {"max_workers": 99}}).status_code == 400


def test_secret_values_are_only_returned_on_reveal(client):
    assert client.put("/api/secrets/groq_api_key", json={"value": "gsk_abcdefghijklmnop"}).status_code == 200
    body = client.get("/api/secrets").text
    assert "gsk_" not in body and '"groq_api_key":true' in body

    r = client.post("/api/secrets/groq_api_key/reveal")
    assert r.status_code == 200 and r.json() == {"value": "gsk_abcdefghijklmnop"}
    assert r.headers["cache-control"] == "no-store"
    assert client.post("/api/secrets/llm_api_key/reveal").status_code == 404  # not set
    assert client.post("/api/secrets/db_password/reveal").status_code == 404  # not a public secret
    r = client.post("/api/secrets/groq_api_key/reveal", headers={"Authorization": "Bearer wrong"})
    assert r.status_code == 401 and "gsk_" not in r.text


def test_subtitle_update_and_effective_style(client, db):
    camp = client.post("/api/campaigns", json={"name": "A"}).json()["campaign"]
    default_id = client.get("/api/brand-templates").json()["brand_templates"][0]["id"]
    client.put(f"/api/brand-templates/{default_id}", json={"caption_settings": {"mode": "lumina", "fontSize": 60}})
    cid = new_id()
    from backend.models.documents import ClipDoc

    db.clips.insert_one(ClipDoc(_id=cid, campaign_id=camp["id"], job_id=None, source_video_id=None, youtube_id="x",
                                start_time=0, end_time=10, duration_seconds=10, status="ready").to_mongo())
    r = client.put(f"/api/clips/{cid}/subtitles", json={"words": [{"word": "Halo", "start": 0, "end": 0.4}],
                                                         "style": {"fontSize": 80}})
    assert r.json()["clip"]["subtitle_data"]["words"][0]["word"] == "Halo"
    detail = client.get(f"/api/clips/{cid}").json()
    assert detail["effective_style"] == {"mode": "lumina", "fontSize": 80}
    client.put(f"/api/clips/{cid}/subtitles", json={"reset_style": True})
    assert client.get(f"/api/clips/{cid}").json()["effective_style"] == {"mode": "lumina", "fontSize": 60}


def test_system_resources_and_setting(client):
    import time

    t0 = time.monotonic()
    r = client.get("/api/system/resources")
    assert r.status_code == 200, r.text
    assert time.monotonic() - t0 < 5
    st = r.json()
    assert st["auto"] is True and st["total_mb"] > 0 and st["running"] == [] and st["waiting"] == []
    r = client.put("/api/settings", json={"resources": {"auto": False, "reserve_gb": 2}})
    assert r.status_code == 200, r.text
    assert r.json()["settings"]["resources"] == {"auto": False, "reserve_gb": 2}
    st = client.get("/api/system/resources").json()
    assert st["auto"] is False and st["reserve_mb"] == 2048
    assert client.put("/api/settings", json={"resources": {"reserve_gb": 99}}).status_code in (400, 422)
    client.put("/api/settings", json={"resources": {"auto": True, "reserve_gb": 0}})
