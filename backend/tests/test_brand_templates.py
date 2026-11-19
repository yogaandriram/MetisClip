"""Brand templates of each campaign: the template made with a campaign (basic, then designed by the AI),
several templates per campaign and the default, clip template choice, assets, and migrations 003/011."""
import pytest
from fastapi.testclient import TestClient

from backend.agents.tools import template_ai
from backend.core.config import config
from backend.core.db import new_id, utcnow
from backend.models.documents import ClipDoc

REAL_DESIGN = template_ai.design  # taken at import, before conftest's fixture replaces it


@pytest.fixture()
def client(db, secrets):
    from backend.main import create_app

    with TestClient(create_app()) as c:
        c.headers.update({"Authorization": f"Bearer {config.token}"})
        yield c


def _clip(db, campaign_id, template_id=None):
    cid = new_id()
    doc = ClipDoc(_id=cid, campaign_id=campaign_id, job_id=None, source_video_id=None, youtube_id="x", start_time=0,
                  end_time=10, duration_seconds=10, status="ready", brand_template_id=template_id).to_mongo()
    db.clips.insert_one(doc)
    return cid


def _templates(client, campaign_id):
    return client.get("/api/brand-templates", params={"campaign_id": campaign_id}).json()["brand_templates"]


CHOICE = {
    "name": "Hijau Ramadan",
    "caption_preset": "kineticbox",
    "highlight_color": "#00aa5b",
    "layout": "podcast-dark",
    "background_color": "#0b3d2e",
    "background_color2": "#123456",
    "title": True,
    "zoom": "keywords",
    "keywords": True,
    "emojis": True,
    "reasons": [
        {"part": "colors", "text": "Warna hijau sesuai brand.", "quote": "warna hijau Tokopedia"},
        {"part": "layout", "text": "Kutipan karangan.", "quote": "pakai latar ungu"},
        {"part": "nope", "text": "Bagian tak dikenal jadi layout.", "quote": ""},
    ],
}


@pytest.fixture()
def fake_llm(monkeypatch, secrets):
    """An LLM key is set and the template designer answers with `answer` (a dict, or a callable)."""
    secrets.set_secret("llm_api_key", "k")
    calls = []
    state = {"answer": CHOICE}

    def chat(system, user, **kw):
        calls.append(user)
        ans = state["answer"]
        return ans() if callable(ans) else ans

    monkeypatch.setattr(template_ai, "design", REAL_DESIGN)  # conftest blocks it for every other test
    monkeypatch.setattr(template_ai.llm, "chat_json", chat)
    return type("F", (), {"calls": calls, "state": state})


def test_fresh_install_has_no_templates(client, db):
    assert db.brand_templates.count_documents({}) == 0  # migration 011 removed 003's empty default
    assert client.get("/api/brand-templates").json() == {"brand_templates": []}


def test_new_campaign_gets_its_own_default_template(client, db):
    camp = client.post("/api/campaigns", json={"name": "Channel Saya"}).json()["campaign"]
    [tpl] = _templates(client, camp["id"])
    assert camp["brand_template_id"] == tpl["id"] and tpl["is_default"] is True
    assert tpl["campaign_id"] == camp["id"] and tpl["campaign_name"] == "Channel Saya"
    assert tpl["name"] == "Template Channel Saya"
    assert tpl["caption_settings"] == {"mode": "popshadow"} and tpl["layout_settings"]["mode"] == "full"
    # No LLM key: the basic look, and the reason why
    assert tpl["design"]["status"] == "basic" and tpl["design"]["auto"] is True
    assert "API key LLM" in tpl["design"]["message"]
    other = client.post("/api/campaigns", json={"name": "Lain"}).json()["campaign"]
    assert [t["id"] for t in _templates(client, other["id"])] != [tpl["id"]]
    assert len(client.get("/api/brand-templates").json()["brand_templates"]) == 2


def test_ai_designs_the_campaign_template(client, db, fake_llm):
    brief = {"platforms": ["TikTok"], "visual": {"credit": "required", "logo": "required"},
             "rules": [{"text": "Pakai warna hijau Tokopedia di subtitle", "type": "must", "stage": "visual"}]}
    camp = client.post("/api/campaigns", json={"name": "Tokopedia Ramadan", "client": "Tokopedia", "brief": brief}).json()["campaign"]
    [tpl] = _templates(client, camp["id"])
    assert tpl["id"] == camp["brand_template_id"]
    assert "Tokopedia Ramadan" in fake_llm.calls[0] and "warna hijau Tokopedia" in fake_llm.calls[0]
    d = tpl["design"]
    assert d["status"] == "done" and tpl["name"] == "Hijau Ramadan"
    assert tpl["caption_settings"] == {"mode": "kineticbox", "highlightColor": "#00AA5B"}
    lay = tpl["layout_settings"]
    assert lay["mode"] == "podcast" and lay["background"] == {"type": "color", "color": "#0B3D2E", "dim": 0}
    assert lay["header"] == {"enabled": True} and lay["zoom"] == {"enabled": True, "style": "keywords", "amount": 0.12}
    assert lay["credit"] == {"enabled": True} and lay["safeZone"] == "tiktok"
    assert tpl["ai_settings"] == {"fillerWords": True, "keywords": True, "emojis": True}
    # A quote is kept only when the campaign really says it
    assert [r["quote"] for r in d["reasons"]] == ["warna hijau Tokopedia", "", ""]
    assert [r["part"] for r in d["reasons"]] == ["colors", "layout", "layout"]
    assert {n["kind"] for n in d["notes"]} == {"logo", "visual_rules"}


def test_brief_wins_over_the_ai_choice():
    camp = {"_id": "c", "name": "X", "brief": {"visual": {"credit": "required"}, "platforms": ["Reels", "Shorts"]}}
    settings, notes = template_ai.build({"layout": "full", "highlight_color": "#FFFFFF", "caption_preset": "nope"}, camp)
    assert settings["layout_settings"]["mode"] == "podcast"  # the credit is hidden in the full layout
    assert {"kind": "credit_layout", "params": {}} in notes
    assert settings["caption_settings"] == {"mode": "popshadow"}  # unknown preset; white highlight dropped
    assert settings["layout_settings"]["safeZone"] == "all"
    forbidden = template_ai.build({"layout": "card-dark"}, {"_id": "c", "name": "X", "brief": {"visual": {"credit": "forbidden"}}})
    assert forbidden[0]["layout_settings"]["credit"] == {"enabled": False}
    assert template_ai._platform_zone(["Instagram Reels"]) == "reels" and template_ai._platform_zone([]) == "all"


def test_ai_can_turn_on_the_automatic_layout():
    camp = {"_id": "c", "name": "X", "brief": {}}
    assert template_ai.build({"layout": "duo"}, camp)[0]["layout_settings"]["smart"] == {"enabled": False}
    settings, notes = template_ai.build({"layout": "podcast-dark", "smart_layout": True, "smart": {
        "speaker": "split", "duo": "full", "screen": "card", "mixed": "nope"}}, camp)
    lay = settings["layout_settings"]
    # Unknown choices take the default; the companion video needs an upload, so the AI never picks it
    assert lay["smart"] == {"enabled": True, "speaker": "full", "duo": "full", "screen": "card", "mixed": "auto"}
    assert lay["mode"] == "podcast" and notes == []  # the look stays the layout for when it is turned off
    # A required source credit: no kind of content gets the full layout, which hides it
    required = {"_id": "c", "name": "X", "brief": {"visual": {"credit": "required"}}}
    settings, notes = template_ai.build({"layout": "podcast", "smart_layout": True, "smart": {
        "speaker": "full", "duo": "full", "screen": "full", "mixed": "full"}}, required)
    assert settings["layout_settings"]["smart"] == {
        "enabled": True, "speaker": "podcast", "duo": "duo", "screen": "podcast", "mixed": "auto"}
    assert {"kind": "credit_smart", "params": {}} in notes
    assert "smart_layout" in template_ai._prompt("id") and "split" not in str(template_ai.AI_SMART_CHOICES)


def test_the_automatic_layout_is_always_explained(monkeypatch):
    camp = {"_id": "c", "name": "X", "brief": {}}
    answer = {"layout": "podcast", "smart_layout": True, "reasons": [{"part": "caption", "text": "Huruf tebal."}]}
    monkeypatch.setattr(template_ai, "design", REAL_DESIGN)
    monkeypatch.setattr(template_ai.llm, "chat_json", lambda *a, **k: answer)
    reasons = template_ai.design(camp)["reasons"]
    assert reasons[-1]["part"] == "layout" and "otomatis sesuai konten" in reasons[-1]["text"]  # the fixed text
    answer["smart_reason"] = "Video campaign ini campuran podcast dan slide."
    assert template_ai.design(camp)["reasons"][-1]["text"] == "Video campaign ini campuran podcast dan slide."
    answer["smart_layout"] = False
    assert [r["part"] for r in template_ai.design(camp)["reasons"]] == ["caption"]


def test_brief_change_redesigns_until_the_user_edits(client, db, fake_llm):
    camp = client.post("/api/campaigns", json={"name": "Kampanye"}).json()["campaign"]
    tid = camp["brand_template_id"]
    assert len(fake_llm.calls) == 1
    client.put(f"/api/campaigns/{camp['id']}", json={"brief": {"tone": "lucu"}})
    assert len(fake_llm.calls) == 2 and "lucu" in fake_llm.calls[1]
    client.put(f"/api/campaigns/{camp['id']}", json={"brief": {"tone": "lucu"}})  # unchanged: no new design
    assert len(fake_llm.calls) == 2
    # A rename keeps the AI's look in charge but no longer renames it
    client.put(f"/api/brand-templates/{tid}", json={"name": "Punyaku"})
    client.put(f"/api/campaigns/{camp['id']}", json={"brief": {"tone": "serius"}})
    assert len(fake_llm.calls) == 3 and client.get(f"/api/brand-templates/{tid}").json()["brand_template"]["name"] == "Punyaku"
    # Once the user changes the look, the brief no longer replaces it ...
    client.put(f"/api/brand-templates/{tid}", json={"caption_settings": {"mode": "lumina"}})
    client.put(f"/api/campaigns/{camp['id']}", json={"brief": {"tone": "formal"}})
    assert len(fake_llm.calls) == 3
    tpl = client.get(f"/api/brand-templates/{tid}").json()["brand_template"]
    assert tpl["caption_settings"] == {"mode": "lumina"} and tpl["design"]["edited"] is True
    # ... unless they ask for it
    assert client.post(f"/api/brand-templates/{tid}/design").status_code == 200
    tpl = client.get(f"/api/brand-templates/{tid}").json()["brand_template"]
    assert len(fake_llm.calls) == 4 and tpl["caption_settings"]["mode"] == "kineticbox" and tpl["design"]["edited"] is False


def test_redesign_keeps_what_the_user_set_in_the_layout(client, db, fake_llm):
    camp = client.post("/api/campaigns", json={"name": "Kampanye"}).json()["campaign"]
    tid = camp["brand_template_id"]
    companion = "asset://library/_brand/x/companion.mp4"
    client.put(f"/api/brand-templates/{tid}", json={"layout_settings": {
        "mode": "full", "smart": {"enabled": True, "screen": "card"},
        "companion": {"videoUrl": companion, "duration": 12, "split": 0.6},
        "card": {"name": "Akun Saya", "color": "#FFFFFF"}, "credit": {"text": "Via {channel}", "enabled": False}}})
    assert client.post(f"/api/brand-templates/{tid}/design").status_code == 200
    lay = client.get(f"/api/brand-templates/{tid}").json()["brand_template"]["layout_settings"]
    # The AI's look ...
    assert lay["mode"] == "podcast" and lay["background"]["color"].lower() == "#0b3d2e"
    # ... with the uploads and typed text the user set; the automatic layout is the AI's to decide
    assert lay["smart"] == {"enabled": False}
    assert lay["companion"] == {"videoUrl": companion, "duration": 12}
    assert lay["card"] == {"name": "Akun Saya"} and lay["credit"]["text"] == "Via {channel}"


def test_ai_result_is_dropped_when_the_user_edits_meanwhile(client, db, fake_llm):
    camp = client.post("/api/campaigns", json={"name": "K"}).json()["campaign"]
    tid = camp["brand_template_id"]
    client.put(f"/api/brand-templates/{tid}", json={"caption_settings": {"mode": "glitch"}})

    def edit_while_designing():  # what PUT /api/brand-templates/{id} writes
        db.brand_templates.update_one({"_id": tid}, {"$set": {"caption_settings": {"mode": "lumina"}, "design.edited": True}})
        return CHOICE

    fake_llm.state["answer"] = edit_while_designing
    client.post(f"/api/brand-templates/{tid}/design")
    tpl = client.get(f"/api/brand-templates/{tid}").json()["brand_template"]
    assert tpl["caption_settings"] == {"mode": "lumina"} and tpl["design"]["status"] == "skipped"


def test_design_failure_and_restart_recovery(client, db, fake_llm):
    from backend.core import llm
    from backend.services import brand_templates as bts

    camp = client.post("/api/campaigns", json={"name": "K"}).json()["campaign"]
    tid = camp["brand_template_id"]

    def quota():
        raise llm.LLMQuotaExhausted("Kuota harian LLM habis")

    fake_llm.state["answer"] = quota
    client.post(f"/api/brand-templates/{tid}/design")
    d = client.get(f"/api/brand-templates/{tid}").json()["brand_template"]["design"]
    assert d["status"] == "failed" and "Kuota" in d["message"]
    db.brand_templates.update_one({"_id": tid}, {"$set": {"design.status": "running"}})
    bts.recover()
    assert db.brand_templates.find_one({"_id": tid})["design"]["status"] == "failed"


def test_several_templates_per_campaign_and_the_default(client, db, fake_llm):
    camp = client.post("/api/campaigns", json={"name": "Channel"}).json()["campaign"]
    first = camp["brand_template_id"]
    other = client.post("/api/campaigns", json={"name": "Lain"}).json()["campaign"]
    blank = client.post("/api/brand-templates", json={"campaign_id": camp["id"], "name": "  Podcast Gelap  "}).json()["brand_template"]
    assert blank["name"] == "Podcast Gelap" and blank["is_default"] is False and blank["design"] is None
    client.put(f"/api/brand-templates/{blank['id']}", json={"caption_settings": {"mode": "glitch"}, "ai_settings": {"emojis": True}})
    # A copy may come from another campaign's template
    copy = client.post("/api/brand-templates", json={"campaign_id": other["id"], "name": "Salinan", "copy_from": blank["id"]}).json()["brand_template"]
    assert copy["campaign_id"] == other["id"] and copy["caption_settings"] == {"mode": "glitch"}
    ai = client.post("/api/brand-templates", json={"campaign_id": camp["id"], "ai": True}).json()["brand_template"]
    assert ai["name"] == "Hijau Ramadan" and ai["design"]["auto"] is False
    assert client.post("/api/brand-templates", json={"campaign_id": camp["id"], "name": ""}).status_code == 400
    assert client.post("/api/brand-templates", json={"campaign_id": "missing", "name": "X"}).status_code == 400
    assert [t["name"] for t in _templates(client, camp["id"])] == ["Hijau Ramadan", "Podcast Gelap", "Hijau Ramadan"]

    # Make another one the default (endpoint, or the campaign's own field); never another campaign's
    assert client.post(f"/api/brand-templates/{blank['id']}/default").json()["brand_template"]["is_default"] is True
    assert db.campaigns.find_one({"_id": camp["id"]})["brand_template_id"] == blank["id"]
    assert client.put(f"/api/campaigns/{camp['id']}", json={"brand_template_id": ai["id"]}).json()["campaign"]["brand_template_id"] == ai["id"]
    assert client.put(f"/api/campaigns/{camp['id']}", json={"brand_template_id": copy["id"]}).status_code == 400

    clip = _clip(db, camp["id"], blank["id"])
    assert client.put(f"/api/clips/{clip}/subtitles", json={"brand_template_id": copy["id"]}).status_code == 400
    # Deleting the default: the oldest remaining one takes over; clips follow the campaign
    assert client.delete(f"/api/brand-templates/{ai['id']}").json() == {"ok": True}
    assert db.campaigns.find_one({"_id": camp["id"]})["brand_template_id"] == first
    client.delete(f"/api/brand-templates/{blank['id']}")
    assert "brand_template_id" not in db.clips.find_one({"_id": clip})
    assert client.get(f"/api/clips/{clip}").json()["brand_template"]["id"] == first
    r = client.delete(f"/api/brand-templates/{first}")
    assert r.status_code == 400 and "minimal satu" in r.text

    # Moving a clip to another campaign: it follows that campaign's default
    moved = _clip(db, camp["id"], first)
    client.put(f"/api/clips/{moved}/campaign", json={"campaign_id": other["id"]})
    assert "brand_template_id" not in db.clips.find_one({"_id": moved})
    assert client.get(f"/api/clips/{moved}").json()["brand_template"]["id"] == other["brand_template_id"]


def test_deleting_a_campaign_deletes_its_templates(client, db, paths):
    camp = client.post("/api/campaigns", json={"name": "Hapus"}).json()["campaign"]
    tid = camp["brand_template_id"]
    asset = client.post(f"/api/brand-templates/{tid}/assets", files={"file": ("logo.png", b"PNG", "image/png")},
                        data={"kind": "logo"}).json()
    client.put(f"/api/brand-templates/{tid}", json={"brand_settings": {"logoUrl": asset["value"]}})
    keep = client.post("/api/campaigns", json={"name": "Tetap"}).json()["campaign"]
    client.delete(f"/api/campaigns/{camp['id']}")
    assert db.brand_templates.count_documents({"campaign_id": camp["id"]}) == 0
    assert not paths.from_relative(asset["path"]).exists()
    assert db.brand_templates.find_one({"_id": keep["brand_template_id"]})


def test_clip_switches_template(client, db):
    camp = client.post("/api/campaigns", json={"name": "A"}).json()["campaign"]
    default_id = camp["brand_template_id"]
    client.put(f"/api/brand-templates/{default_id}", json={"caption_settings": {"mode": "lumina"}, "brand_settings": {"logoUrl": "x"}})
    other = client.post("/api/brand-templates", json={"campaign_id": camp["id"], "name": "Neon"}).json()["brand_template"]
    client.put(f"/api/brand-templates/{other['id']}", json={"caption_settings": {"mode": "neonpulse", "fontSize": 40},
                                                           "ai_settings": {"pauses": True}})
    cid = _clip(db, camp["id"])  # no own choice -> the campaign's default
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


def test_assets_live_with_the_template(client, db, paths):
    camp = client.post("/api/campaigns", json={"name": "Logo"}).json()["campaign"]
    tpl = client.post("/api/brand-templates", json={"campaign_id": camp["id"], "name": "Logo"}).json()["brand_template"]
    r = client.post(f"/api/brand-templates/{tpl['id']}/assets", files={"file": ("logo.png", b"PNG", "image/png")},
                    data={"kind": "logo"})
    asset = r.json()
    assert asset["path"].startswith(f"library/_brand/{tpl['id']}/logo-") and asset["value"] == "asset://" + asset["path"]
    assert client.post(f"/api/brand-templates/{tpl['id']}/assets", files={"file": ("x.exe", b"MZ")}).status_code == 400
    client.put(f"/api/brand-templates/{tpl['id']}", json={"brand_settings": {"logoUrl": asset["value"]}})

    # A duplicate shares the file, so deleting the original keeps it ...
    dup = client.post("/api/brand-templates", json={"campaign_id": camp["id"], "name": "Dup", "copy_from": tpl["id"]}).json()["brand_template"]
    client.delete(f"/api/brand-templates/{tpl['id']}")
    assert paths.from_relative(asset["path"]).exists()
    # ... and deleting the last user removes the imported copy
    client.delete(f"/api/brand-templates/{dup['id']}")
    assert not paths.from_relative(asset["path"]).exists()


def test_migration_011_gives_every_campaign_its_own_templates(db):
    from backend.db.migrations import m011_campaign_brand_templates as m011

    now = utcnow()

    def at(n):
        from datetime import timedelta

        return now + timedelta(seconds=n)

    db.brand_templates.insert_many([
        {"_id": "t-default", "name": "Template Default", "caption_settings": {"mode": "lumina"}, "created_at": at(0)},
        {"_id": "t-shared", "name": "Bersama", "caption_settings": {"mode": "glitch"},
         "brand_settings": {"logoUrl": "asset://library/_brand/t-shared/logo.png"}, "created_at": at(1)},
        {"_id": "t-unused", "name": "Nganggur", "created_at": at(2)},
    ])
    db.campaigns.insert_many([
        {"_id": "c1", "name": "Satu", "status": "active", "brief": {}, "brand_template_id": "t-shared", "created_at": at(0)},
        {"_id": "c2", "name": "Dua", "status": "active", "brief": {}, "brand_template_id": "t-shared", "created_at": at(1)},
        {"_id": "c3", "name": "Tiga", "status": "active", "brief": {}, "brand_template_id": None, "created_at": at(2)},
    ])
    db.clips.insert_many([
        {"_id": "k1", "campaign_id": "c2", "brand_template_id": "t-shared", "start_time": 0, "end_time": 1, "status": "ready", "files": {}, "created_at": now},
        {"_id": "k2", "campaign_id": "c3", "brand_template_id": "t-shared", "start_time": 0, "end_time": 1, "status": "ready", "files": {}, "created_at": now},
        {"_id": "k3", "campaign_id": "c1", "brand_template_id": "gone", "start_time": 0, "end_time": 1, "status": "ready", "files": {}, "created_at": now},
    ])
    m011.up(db)
    m011.up(db)  # a re-run after a crash changes nothing

    c = {d["_id"]: d for d in db.campaigns.find({})}
    t = {d["_id"]: d for d in db.brand_templates.find({})}
    copy2, copy3 = m011._copy_id("t-shared", "c2"), m011._copy_id("t-shared", "c3")
    assert t["t-shared"]["campaign_id"] == "c1" and c["c1"]["brand_template_id"] == "t-shared"
    assert t[copy2]["campaign_id"] == "c2" and t[copy2]["caption_settings"] == {"mode": "glitch"}
    assert t[copy2]["brand_settings"] == t["t-shared"]["brand_settings"]  # the asset file is shared
    assert c["c2"]["brand_template_id"] == copy2
    # c3 fell back to the old default; its clip used the shared template -> its own copy
    assert t["t-default"]["campaign_id"] == "c3" and c["c3"]["brand_template_id"] == "t-default"
    assert t[copy3]["campaign_id"] == "c3"
    assert db.clips.find_one({"_id": "k1"})["brand_template_id"] == copy2
    assert db.clips.find_one({"_id": "k2"})["brand_template_id"] == copy3
    assert "brand_template_id" not in db.clips.find_one({"_id": "k3"})
    assert t["t-unused"]["campaign_id"] == "c1"  # nobody used it: the oldest campaign keeps it
    assert len(t) == 5


def test_migration_011_without_campaigns(db, secrets):
    from backend.db.migrations import m011_campaign_brand_templates as m011

    now = utcnow()
    db.brand_templates.insert_many([
        {"_id": "t-builtin", "name": "Default template", "caption_settings": {"mode": "popshadow"},
         "layout_settings": {"safeZone": "all"}, "created_at": now},
        {"_id": "t-mine", "name": "Punyaku", "caption_settings": {"mode": "lumina"}, "created_at": now},
    ])
    m011.up(db)
    assert db.brand_templates.find_one({"_id": "t-builtin"}) is None
    assert db.brand_templates.find_one({"_id": "t-mine"})["campaign_id"] is None
    # The first campaign created takes it, next to the template made with it
    from backend.services import campaigns

    camp = campaigns.create("Pertama")
    assert {d["_id"] for d in db.brand_templates.find({"campaign_id": camp["_id"]})} == {"t-mine", camp["brand_template_id"]}


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
