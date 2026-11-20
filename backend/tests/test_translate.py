"""Subtitle translation: phrases, the LLM answer turned into timed words, the editor's
endpoint, the saved translation record and the brief checklist reading the spoken words."""
from __future__ import annotations

import json

import pytest

from backend.agents.tools import translate_ai
from backend.core import llm
from backend.core.db import new_id
from backend.models.documents import ClipDoc


def _w(word: str, start: float, end: float, **extra) -> dict:
    return {"word": word, "start": start, "end": end, **extra}


SPOKEN = [
    _w("Jadi", 0.0, 0.3), _w("kita", 0.3, 0.5), _w("harus", 0.5, 0.8), _w("hemat", 0.8, 1.2, keyword=True, emoji="💰"),
    _w("dulu.", 1.2, 1.5),
    _w("eh", 1.6, 1.9),  # a filler word: kept as it is (the export hides and cuts it)
    _w("Baru", 2.0, 2.3), _w("investasi", 2.3, 2.9),
    _w("pelan-pelan", 4.0, 4.6),  # after a 1.1 s pause: its own phrase, so the pause is still cut
]


class FakeLLM:
    """Answers like the LLM: each phrase in English, the keyword wrapped in asterisks."""

    def __init__(self, table: dict[str, str] | None = None, title: str = "Save first"):
        self.calls: list[dict] = []
        self.table = table if table is not None else {
            "Jadi kita harus *hemat* dulu.": "So we have to *save* first.",
            "Baru investasi": "Then invest",
            "pelan-pelan": "slowly",
        }
        self.title = title

    def __call__(self, system, user, **kw):
        payload = json.loads(user)
        self.calls.append({"system": system, "payload": payload})
        out = {"phrases": [{"id": p["id"], "text": self.table.get(p["text"], "")} for p in payload["phrases"]]}
        if "title" in payload:
            out["title"] = self.title
        return out


def test_words_are_grouped_into_phrases():
    units = translate_ai._phrases(SPOKEN)
    assert units == [(0, 5, False), (5, 6, True), (6, 8, False), (8, 9, False)]
    long = [_w(f"kata{i}", i * 0.3, i * 0.3 + 0.25) for i in range(30)]
    assert [b - a for a, b, _ in translate_ai._phrases(long)] == [12, 12, 6]
    assert translate_ai._tokens("So *we save*, then *invest*. done*") == [
        ("So", False), ("we", True), ("save,", True), ("then", False), ("invest.", True), ("done", False)]


def test_a_translation_keeps_the_timing_marks_and_filler_words(monkeypatch):
    fake = FakeLLM()
    monkeypatch.setattr(translate_ai.llm, "chat_json", fake)
    res = translate_ai.translate_words(SPOKEN, "en", "Hemat dulu")
    assert "English" in fake.calls[0]["system"]
    assert fake.calls[0]["payload"]["title"] == "Hemat dulu"
    words = res["words"]
    assert [w["word"] for w in words] == ["So", "we", "have", "to", "save", "first.", "eh", "Then", "invest", "slowly"]
    # The first phrase keeps its span (0-1.5 s); its words follow each other in order
    assert words[0]["start"] == 0.0 and words[5]["end"] == 1.5
    assert all(a["end"] == pytest.approx(b["start"], abs=0.002) for a, b in zip(words[:5], words[1:6]))
    assert words[4].get("keyword") is True and words[0]["emoji"] == "💰" and "emoji" not in words[4]
    assert words[6] == {"word": "eh", "start": 1.6, "end": 1.9}
    assert (words[7]["start"], words[8]["end"]) == (2.0, 2.9) and (words[9]["start"], words[9]["end"]) == (4.0, 4.6)
    assert res["title"] == "Save first" and res["kept"] == 0 and res["phrases"] == 3
    assert fake.calls[0]["payload"]["context"].startswith("Jadi kita harus hemat dulu. eh Baru")


def test_highlights_only_where_the_spoken_phrase_had_a_keyword(monkeypatch):
    fake = FakeLLM(table={"Jadi kita harus *hemat* dulu.": "*So* *we* *have* *to* *save* first.",
                          "Baru investasi": "Then *invest*", "pelan-pelan": "slowly"})
    monkeypatch.setattr(translate_ai.llm, "chat_json", fake)
    words = translate_ai.translate_words(SPOKEN, "en")["words"]
    assert [w["word"] for w in words if w.get("keyword")] == ["So", "we"]  # 1 spoken keyword: at most 2 words


def test_a_phrase_left_out_keeps_its_words_and_long_clips_go_in_parts(monkeypatch):
    fake = FakeLLM(table={"Baru investasi": "Then invest"})
    monkeypatch.setattr(translate_ai.llm, "chat_json", fake)
    res = translate_ai.translate_words(SPOKEN, "en")
    assert [w["word"] for w in res["words"]][:5] == ["Jadi", "kita", "harus", "hemat", "dulu."]
    assert res["kept"] == 2 and res["title"] == "" and "title" not in fake.calls[0]["payload"]

    many = [_w(f"kalimat{i}.", i, i + 0.5) for i in range(130)]
    fake = FakeLLM(table={f"kalimat{i}.": f"sentence{i}." for i in range(130)})
    monkeypatch.setattr(translate_ai.llm, "chat_json", fake)
    res = translate_ai.translate_words(many, "es", "Judul")
    assert [len(c["payload"]["phrases"]) for c in fake.calls] == [60, 60, 10]
    assert "title" in fake.calls[0]["payload"] and "title" not in fake.calls[1]["payload"]
    assert res["words"][129] == {"word": "sentence129.", "start": 129.0, "end": 129.5}

    monkeypatch.setattr(translate_ai.llm, "chat_json", FakeLLM(table={}))
    with pytest.raises(translate_ai.TranslateError):
        translate_ai.translate_words(SPOKEN, "en")
    with pytest.raises(KeyError):
        translate_ai.translate_words(SPOKEN, "xx")


def _clip(db, words=SPOKEN) -> dict:
    doc = ClipDoc(_id=new_id(), job_id=None, source_video_id=None, youtube_id="yt1", start_time=10.0, end_time=15.0,
                  duration_seconds=5.0, hook_text="Hemat dulu", status="ready", files={},
                  subtitle={"words": [dict(w) for w in words]}).to_mongo()
    db.clips.insert_one(doc)
    return doc


def test_the_editor_translates_and_saves_the_spoken_words(db, monkeypatch):
    from backend.api.routes import clips as route

    fake = FakeLLM()
    monkeypatch.setattr(translate_ai.llm, "chat_json", fake)
    clip = _clip(db)
    res = route.translate_subtitles(clip["_id"], route.TranslateBody(language="en"))
    assert res["language"] == "en" and res["words"][0]["word"] == "So" and res["title"] == "Save first"
    assert db.clips.find_one({"_id": clip["_id"]})["subtitle"]["words"][0]["word"] == "Jadi"  # nothing saved

    # The editor saves the translation with the spoken words and title
    body = route.SubtitleUpdate(words=res["words"], hook_text=res["title"], translation=route.Translation(
        language="en", original_words=SPOKEN, original_title="Hemat dulu"))
    dto = route.update_subtitles(clip["_id"], body)["clip"]
    tr = dto["subtitle_data"]["translation"]
    assert tr["language"] == "en" and tr["original_words"][3] == {**SPOKEN[3]} and tr["partial"] is False
    assert dto["subtitle_data"]["words"][0]["word"] == "So" and dto["hook_text"] == "Save first"

    # Translating again starts from the spoken words, not the English ones
    route.translate_subtitles(clip["_id"], route.TranslateBody(language="es"))
    assert fake.calls[-1]["payload"]["phrases"][0]["text"] == "Jadi kita harus *hemat* dulu."

    # Back to the spoken language
    route.update_subtitles(clip["_id"], route.SubtitleUpdate(words=SPOKEN, translation=None))
    assert "translation" not in db.clips.find_one({"_id": clip["_id"]})["subtitle"]
    assert route.get_clip(clip["_id"])["clip"]["subtitle_data"]["translation"] is None

    for bad in (lambda: route.translate_subtitles(clip["_id"], route.TranslateBody(language="xx")),
                lambda: route.update_subtitles(clip["_id"], route.SubtitleUpdate(
                    translation=route.Translation(language="xx")))):
        with pytest.raises(Exception) as err:
            bad()
        assert err.value.status_code == 400


def test_translation_errors_are_clear(db, monkeypatch):
    from backend.api.routes import clips as route

    clip = _clip(db)
    with pytest.raises(Exception) as err:
        route.translate_subtitles(_clip(db, [])["_id"], route.TranslateBody(language="en"))
    assert err.value.status_code == 400 and err.value.detail == "Clip ini belum punya subtitle"

    monkeypatch.setattr(translate_ai.llm, "chat_json", FakeLLM(table={}))
    with pytest.raises(Exception) as err:
        route.translate_subtitles(clip["_id"], route.TranslateBody(language="en"))
    assert err.value.status_code == 502 and err.value.detail.startswith("AI tidak mengembalikan terjemahan")

    def offline(*a, **k):
        raise llm.LLMError("Server LLM tidak dapat dihubungi")

    monkeypatch.setattr(translate_ai.llm, "chat_json", offline)
    with pytest.raises(Exception) as err:
        route.translate_subtitles(clip["_id"], route.TranslateBody(language="en"))
    assert err.value.status_code == 502 and err.value.detail == "Terjemahan subtitle gagal: Server LLM tidak dapat dihubungi"


def test_the_brief_checklist_reads_the_spoken_words():
    from backend.services import brief_check
    from backend.services.campaigns import clean_brief

    campaign = {"_id": "c1", "version": 1, "brief": clean_brief({"must_include": ["hemat"], "banned_words": ["boros"]})}
    clip = {"duration_seconds": 5, "brief_manual": {},
            "subtitle": {"words": [_w("save", 0, 1), _w("wasteful", 1, 2)],
                         "translation": {"language": "en", "original_words": [_w("hemat", 0, 1)]}}}
    by = {i["id"]: i for i in brief_check.check(clip, campaign, None, "")["items"]}
    assert by["required_words"]["status"] == "ok" and by["banned_words"]["status"] == "ok"
