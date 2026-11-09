"""Brand template library: CRUD, usage, clip template choice, assets and the 003 migration."""
import pytest
from fastapi.testclient import TestClient

from backend.core.config import config
from backend.core.db import new_id, utcnow
from backend.models.documents import ClipDoc


@pytest.fixture()
def client(db, secrets):
    from backend.main import create_app

    with TestClient(create_app()) as c:
        c.headers.update({"Authorization": f"Bearer {config.token}"})
        yield c


def _clip(db, agent_id, template_id=None):
    cid = new_id()
    doc = ClipDoc(_id=cid, agent_id=agent_id, job_id=None, source_video_id=None, youtube_id="x", start_time=0,
                  end_time=10, duration_seconds=10, status="ready", brand_template_id=template_id).to_mongo()
    db.clips.insert_one(doc)
    return cid


def test_library_crud_and_usage(client, db):
    [default] = client.get("/api/brand-templates").json()["brand_templates"]
    a = client.post("/api/brand-templates", json={"name": "  Podcast Gelap  "}).json()["brand_template"]
    assert a["name"] == "Podcast Gelap" and a["caption_settings"] == {"mode": "popshadow"}
    client.put(f"/api/brand-templates/{a['id']}", json={"caption_settings": {"mode": "glitch"}, "ai_settings": {"emojis": True}})
    b = client.post("/api/brand-templates", json={"name": "Salinan", "copy_from": a["id"]}).json()["brand_template"]
    assert b["caption_settings"] == {"mode": "glitch"} and b["ai_settings"] == {"emojis": True}
    assert client.put(f"/api/brand-templates/{b['id']}", json={"name": "Edukasi"}).json()["brand_template"]["name"] == "Edukasi"
    assert client.put(f"/api/brand-templates/{b['id']}", json={"name": "  "}).status_code == 400
    assert client.post("/api/brand-templates", json={"name": ""}).status_code == 400

    agent = client.post("/api/agents", json={"name": "Agent", "default_brand_template_id": a["id"]}).json()["agent"]
    assert agent["default_brand_template_id"] == a["id"]
    assert client.put(f"/api/agents/{agent['id']}", json={"default_brand_template_id": "nope"}).status_code == 400
    clip_a = _clip(db, agent["id"], a["id"])
    _clip(db, agent["id"], a["id"])

    listed = {t["id"]: t for t in client.get("/api/brand-templates").json()["brand_templates"]}
    assert [t["name"] for t in listed.values()] == ["Template Default", "Podcast Gelap", "Edukasi"]
    assert listed[a["id"]]["used_by_agents"] == [{"id": agent["id"], "name": "Agent"}]
    assert listed[a["id"]]["clip_count"] == 2 and listed[b["id"]]["clip_count"] == 0

    # Deleting a template: its clips follow the agent default again, the agent gets the oldest template
    assert client.delete(f"/api/brand-templates/{a['id']}").json() == {"ok": True}
    assert "brand_template_id" not in db.clips.find_one({"_id": clip_a})
    assert db.super_agents.find_one({"_id": agent["id"]})["default_brand_template_id"] == default["id"]
    assert client.get(f"/api/clips/{clip_a}").json()["brand_template"]["id"] == default["id"]
    client.delete(f"/api/brand-templates/{b['id']}")
    r = client.delete(f"/api/brand-templates/{default['id']}")
    assert r.status_code == 400 and "Minimal" in r.text


def test_clip_switches_template(client, db):
    agent = client.post("/api/agents", json={"name": "A"}).json()["agent"]
    default_id = agent["default_brand_template_id"]
    client.put(f"/api/brand-templates/{default_id}", json={"caption_settings": {"mode": "lumina"}, "brand_settings": {"logoUrl": "x"}})
    other = client.post("/api/brand-templates", json={"name": "Neon"}).json()["brand_template"]
    client.put(f"/api/brand-templates/{other['id']}", json={"caption_settings": {"mode": "neonpulse", "fontSize": 40},
                                                           "ai_settings": {"pauses": True}})
    cid = _clip(db, agent["id"])  # no own choice -> agent default
    d = client.get(f"/api/clips/{cid}").json()
    assert d["brand_template"]["id"] == default_id and d["effective_style"] == {"mode": "lumina"}

    r = client.put(f"/api/clips/{cid}/subtitles", json={"brand_template_id": other["id"], "style": {"fontSize": 50}})
    assert r.json()["clip"]["brand_template_id"] == other["id"]
    d = client.get(f"/api/clips/{cid}").json()
    assert d["brand_template"]["name"] == "Neon"
    assert d["effective_style"] == {"mode": "neonpulse", "fontSize": 50}
    assert d["effective_ai"]["pauses"] is True

    from backend.services.render import build_props

    props = build_props(db.clips.find_one({"_id": cid}))
    assert props["style"]["mode"] == "neonpulse" and props["brandSettings"] == {}

    assert client.put(f"/api/clips/{cid}/subtitles", json={"brand_template_id": "missing"}).status_code == 400
    client.put(f"/api/clips/{cid}/subtitles", json={"brand_template_id": None})
    assert "brand_template_id" not in db.clips.find_one({"_id": cid})
    # Saving words only keeps the template choice
    client.put(f"/api/clips/{cid}/subtitles", json={"brand_template_id": other["id"]})
    client.put(f"/api/clips/{cid}/subtitles", json={"words": []})
    assert db.clips.find_one({"_id": cid})["brand_template_id"] == other["id"]


def test_assets_live_with_the_template(client, paths):
    tpl = client.post("/api/brand-templates", json={"name": "Logo"}).json()["brand_template"]
    r = client.post(f"/api/brand-templates/{tpl['id']}/assets", files={"file": ("logo.png", b"PNG", "image/png")},
                    data={"kind": "logo"})
    asset = r.json()
    assert asset["path"].startswith(f"library/_brand/{tpl['id']}/logo-") and asset["value"] == "asset://" + asset["path"]
    assert client.post(f"/api/brand-templates/{tpl['id']}/assets", files={"file": ("x.exe", b"MZ")}).status_code == 400
    client.put(f"/api/brand-templates/{tpl['id']}", json={"brand_settings": {"logoUrl": asset["value"]}})

    # A duplicate shares the file, so deleting the original keeps it ...
    dup = client.post("/api/brand-templates", json={"name": "Dup", "copy_from": tpl["id"]}).json()["brand_template"]
    client.delete(f"/api/brand-templates/{tpl['id']}")
    assert paths.from_relative(asset["path"]).exists()
    # ... and deleting the last user removes the imported copy
    client.delete(f"/api/brand-templates/{dup['id']}")
    assert not paths.from_relative(asset["path"]).exists()


def test_migration_moves_embedded_templates(db, paths):
    from backend.db.migrations import m003_brand_template_library as m003

    db.brand_templates.delete_many({})
    agent_id = new_id()
    old_rel = "library/podcast-bisnis/_assets/logo-abc.png"
    old_file = paths.from_relative(old_rel)
    old_file.parent.mkdir(parents=True, exist_ok=True)
    old_file.write_bytes(b"PNG")
    db.super_agents.insert_one({
        "_id": agent_id, "name": "Podcast Bisnis", "slug": "podcast-bisnis", "created_at": utcnow(),
        "brand_template": {"brand_settings": {"logoUrl": "asset://" + old_rel, "showLogo": True},
                           "caption_settings": {"mode": "glitch"}, "layout_settings": {"safeZone": "reels"},
                           "ai_settings": {"emojis": True}, "updated_at": utcnow()},
    })
    other_agent = new_id()
    db.super_agents.insert_one({"_id": other_agent, "name": "Kosong", "slug": "kosong", "created_at": utcnow()})
    cid = new_id()
    db.clips.insert_one({"_id": cid, "agent_id": agent_id, "start_time": 0, "end_time": 1, "status": "ready",
                         "files": {}, "created_at": utcnow()})

    m003.up(db)
    m003.up(db)  # re-run after a crash is a no-op

    [tpl] = list(db.brand_templates.find({}))
    assert tpl["name"] == "Podcast Bisnis" and tpl["caption_settings"] == {"mode": "glitch"}
    assert tpl["layout_settings"] == {"safeZone": "reels"} and tpl["ai_settings"] == {"emojis": True}
    new_rel = f"library/_brand/{tpl['_id']}/logo-abc.png"
    assert tpl["brand_settings"] == {"logoUrl": "asset://" + new_rel, "showLogo": True}
    assert paths.from_relative(new_rel).read_bytes() == b"PNG" and not old_file.exists()
    assert not old_file.parent.exists()  # the emptied per-agent _assets folder is removed
    agent = db.super_agents.find_one({"_id": agent_id})
    assert "brand_template" not in agent and agent["default_brand_template_id"] == tpl["_id"]
    # Agents without an embedded template get the oldest library template
    assert db.super_agents.find_one({"_id": other_agent})["default_brand_template_id"] == tpl["_id"]
    assert db.clips.find_one({"_id": cid})["brand_template_id"] == tpl["_id"]
