"""AI subtitle settings: keyword/emoji marking, effective settings, editor endpoints, render props."""
import pytest
from fastapi.testclient import TestClient

from backend.agents.tools import caption_ai
from backend.core import llm
from backend.core.config import config
from backend.core.db import new_id
from backend.models.documents import ClipDoc

WORDS = [
    {"word": "Rahasia", "start": 0.0, "end": 0.4},
    {"word": "eh", "start": 0.4, "end": 0.6},
    {"word": "bisnis", "start": 0.6, "end": 1.0},
    {"word": "itu", "start": 1.0, "end": 1.2},
    {"word": "konsisten.", "start": 1.2, "end": 1.8, "keyword": True},
    {"word": "Mulai", "start": 2.0, "end": 2.3},
    {"word": "dari", "start": 2.3, "end": 2.5},
    {"word": "kecil", "start": 2.5, "end": 2.9},
    {"word": "dulu", "start": 2.9, "end": 3.2},
    {"word": "aja!", "start": 3.2, "end": 3.6, "emoji": "😀"},
]


def test_filler_and_emoji_validation():
    assert caption_ai.is_filler("Ehm,") and caption_ai.is_filler("hmmm") and caption_ai.is_filler("eee")
    assert not caption_ai.is_filler("enak") and not caption_ai.is_filler("hemat")
    assert caption_ai.valid_emoji("🔥") == "🔥"
    assert caption_ai.valid_emoji("❤️") == "❤️"
    assert caption_ai.valid_emoji("abc") is None and caption_ai.valid_emoji(":fire:") is None and caption_ai.valid_emoji(5) is None


def test_enrich_words_filters_llm_output(monkeypatch):
    def fake_chat(system, user, **kw):
        assert "keywords" in system and "emojis" in system
        assert "[2]bisnis" in user
        return {"keywords": [2, 2, 1, 99, "x", 7, 0], "emojis": [{"index": 2, "emoji": "💼"}, {"index": 3, "emoji": "abc"}, [9, "🚀"]]}

    monkeypatch.setattr(caption_ai.llm, "chat_json", fake_chat)
    out, n_kw, n_emoji = caption_ai.enrich_words(WORDS, keywords=True, emojis=True)
    # duplicates, out-of-range, non-numeric and filler ("eh") indices are dropped; cap = 10 // 5 = 2
    assert [i for i, w in enumerate(out) if w.get("keyword")] == [2, 7]
    assert n_kw == 2
    # old marks of the requested kinds are replaced; cap = 10 // 10 = 1 emoji
    assert {i: w["emoji"] for i, w in enumerate(out) if w.get("emoji")} == {2: "💼"}
    assert n_emoji == 1
    assert WORDS[4]["keyword"] is True  # input not mutated


def test_enrich_keeps_marks_of_kinds_not_requested(monkeypatch):
    monkeypatch.setattr(caption_ai.llm, "chat_json", lambda system, user, **kw: {"keywords": [5]})
    out, _, n_emoji = caption_ai.enrich_words(WORDS, keywords=True, emojis=False)
    assert [i for i, w in enumerate(out) if w.get("keyword")] == [5]
    assert out[9]["emoji"] == "😀" and n_emoji == 1


def test_effective_ai_layers():
    from backend.services.render import DEFAULT_AI_SETTINGS, effective_ai

    assert effective_ai(None, None) == DEFAULT_AI_SETTINGS
    bt = {"ai_settings": {"pauses": True, "emojis": True, "bogus": True, "keywords": "yes"}}
    clip = {"subtitle_style": {"ai": {"emojis": False}}}
    assert effective_ai(clip, bt) == {**DEFAULT_AI_SETTINGS, "pauses": True, "emojis": False}


@pytest.fixture()
def client(db, secrets):
    from backend.main import create_app

    with TestClient(create_app()) as c:
        c.headers.update({"Authorization": f"Bearer {config.token}"})
        yield c


def _clip(db, agent_id, words):
    cid = new_id()
    db.clips.insert_one(ClipDoc(_id=cid, agent_id=agent_id, job_id=None, source_video_id=None, youtube_id="x",
                                start_time=0, end_time=10, duration_seconds=10, status="ready",
                                subtitle={"words": words}).to_mongo())
    return cid


def test_subtitle_words_keep_ai_marks_and_clip_ai_override(client, db):
    agent = client.post("/api/agents", json={"name": "A"}).json()["agent"]
    client.put(f"/api/agents/{agent['id']}/brand-template", json={"ai_settings": {"pauses": True}})
    cid = _clip(db, agent["id"], [])
    words = [{"word": "Halo", "start": 0, "end": 0.4, "keyword": True, "emoji": "👋"},
             {"word": "semua", "start": 0.4, "end": 0.8, "emoji": "not-an-emoji"}]
    r = client.put(f"/api/clips/{cid}/subtitles", json={"words": words, "style": {"mode": "glitch", "ai": {"emojis": True, "x": 1}}})
    saved = r.json()["clip"]["subtitle_data"]["words"]
    assert saved[0] == {"word": "Halo", "start": 0.0, "end": 0.4, "keyword": True, "emoji": "👋"}
    assert saved[1] == {"word": "semua", "start": 0.4, "end": 0.8}
    detail = client.get(f"/api/clips/{cid}").json()
    assert detail["effective_style"] == {"mode": "glitch"}  # the AI override is not a caption style key
    assert detail["effective_ai"] == {"fillerWords": True, "pauses": True, "keywords": True, "emojis": True}
    assert db.clips.find_one({"_id": cid})["subtitle_style"]["ai"] == {"emojis": True}


def test_enrich_endpoint(client, db, monkeypatch):
    agent = client.post("/api/agents", json={"name": "A"}).json()["agent"]
    cid = _clip(db, agent["id"], WORDS)
    monkeypatch.setattr(caption_ai.llm, "chat_json", lambda system, user, **kw: {"keywords": [0, 7], "emojis": [{"index": 7, "emoji": "🌱"}]})
    r = client.post(f"/api/clips/{cid}/subtitles/enrich", json={"keywords": True, "emojis": True})
    assert r.status_code == 200, r.text
    body = r.json()
    assert (body["keywords"], body["emojis"]) == (2, 1)
    words = db.clips.find_one({"_id": cid})["subtitle"]["words"]
    assert [w["word"] for w in words if w.get("keyword")] == ["Rahasia", "kecil"]
    assert [w.get("emoji") for w in words if w.get("emoji")] == ["🌱"]

    def boom(*a, **kw):
        raise llm.LLMNotConfigured("API key LLM belum diisi di Pengaturan")

    monkeypatch.setattr(caption_ai.llm, "chat_json", boom)
    r = client.post(f"/api/clips/{cid}/subtitles/enrich", json={"keywords": True, "emojis": False})
    assert r.status_code == 400 and "API key LLM" in r.text
    empty = _clip(db, agent["id"], [])
    assert client.post(f"/api/clips/{empty}/subtitles/enrich", json={}).status_code == 400


def test_render_props_carry_ai_settings(db):
    from backend.services.render import build_props

    agent_id = new_id()
    from backend.models.documents import AgentDoc, BrandTemplateDoc

    db.super_agents.insert_one(AgentDoc(_id=agent_id, name="A", slug="a", brand_template=BrandTemplateDoc(
        ai_settings={"pauses": True}, caption_settings={"mode": "lumina"})).to_mongo())
    clip = {"_id": new_id(), "agent_id": agent_id, "duration_seconds": 12.5,
            "subtitle": {"words": WORDS}, "subtitle_style": {"ai": {"keywords": False}, "fontSize": 50}}
    props = build_props(clip)
    assert props["ai"] == {"fillerWords": True, "pauses": True, "keywords": False, "emojis": False}
    assert props["style"] == {"mode": "lumina", "fontSize": 50}
    assert props["durationInFrames"] == 375 and props["words"] == WORDS
