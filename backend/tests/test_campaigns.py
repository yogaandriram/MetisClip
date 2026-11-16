"""Campaigns and briefs: word matching, the brief shape, brief material, the Analyzer and Processor with
briefs, vision requests, post text, the brief checklist, the API and the export text file."""
from __future__ import annotations

import io
import re
import time
import zipfile
from datetime import date
from pathlib import Path

import pytest

from backend.agents.nodes import analyzer as an
from backend.agents.tools import brief_match
from backend.core.config import config
from backend.core.db import new_id, utcnow
from backend.models.documents import ClipDoc, clean_brief, duration_range


# ---------------------------------------------------------------- word matching

def test_required_terms_match_split_and_misspelled_names():
    idx = brief_match.TextIndex("Nah, belanja di Toko Pedia sekarang lebih murah, kata Pak Budi. Rebranding itu penting.")
    assert idx.has("Tokopedia")          # split in two by the transcript
    assert idx.has("tokopidia")          # a near miss still counts for a required name
    assert idx.has("pak budi")
    assert not idx.has("brand")          # never inside another word ("Rebranding")
    assert not idx.has("Shopee")
    assert brief_match.missing_terms(idx, ["Tokopedia", "Shopee"]) == ["Shopee"]


def test_banned_words_are_matched_strictly():
    assert brief_match.banned_found("ini anjing banget", ["anjing", "babi"]) == ["anjing"]
    assert brief_match.banned_found("anjang", ["anjing"]) == []           # no fuzzy match for banned words
    assert brief_match.banned_found("ANJING!", ["anjing"]) == ["anjing"]  # case and punctuation


def test_required_terms_become_highlighted_words():
    words = [{"word": w} for w in "belanja di toko pedia sekarang".split()]
    assert brief_match.term_word_indices(words, ["Tokopedia"]) == {2, 3}
    assert brief_match.term_word_indices(words, ["Shopee"]) == set()


# ---------------------------------------------------------------- the brief shape

def test_clean_brief_normalizes_llm_output():
    b = clean_brief({
        "focus": ["tips hemat", "Tips hemat", "", None],
        "post": {"hashtags": ["Tokopedia Ramadan", "#ad"], "mentions": ["tokopedia"], "bogus": 1},
        "deadline": "2026-12-01T10:00", "clips_target": "12", "max_per_video": -3,
        "visual": {"subtitles": "required", "logo": "maybe"},
        "rules": [{"text": "Wajib sebut Tokopedia", "type": "must", "stage": "selection"},
                  {"text": "Posting jam 7 malam", "stage": "schedule"}, {"text": ""}, "junk"],
        "unknown": "dropped",
    })
    assert b["focus"] == ["tips hemat"]
    assert b["post"]["hashtags"] == ["#TokopediaRamadan", "#ad"] and b["post"]["mentions"] == ["@tokopedia"]
    assert b["deadline"] == "2026-12-01" and b["clips_target"] == 12 and b["max_per_video"] == 0
    assert b["visual"]["subtitles"] == "required" and b["visual"]["logo"] == "optional"
    assert [r["id"] for r in b["rules"]] == ["r1", "r2"]
    assert b["rules"][1]["stage"] == "manual"   # an unknown stage is something the user checks
    assert "unknown" not in b


def test_custom_durations():
    assert duration_range("45-60") == (45, 60)
    assert duration_range("20-40") == (20, 40)
    assert duration_range("5-40") is None       # below the minimum
    assert duration_range("40-42") is None      # too narrow
    assert duration_range("abc") is None


# ---------------------------------------------------------------- brief material

def _docx(paragraphs: list[str], table: list[list[str]]) -> bytes:
    w = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    body = "".join(f"<w:p><w:r><w:t>{p}</w:t></w:r></w:p>" for p in paragraphs)
    rows = "".join("<w:tr>" + "".join(f"<w:tc><w:p><w:r><w:t>{c}</w:t></w:r></w:p></w:tc>" for c in row) + "</w:tr>"
                   for row in table)
    xml = f'<?xml version="1.0"?><w:document xmlns:w="{w}"><w:body>{body}<w:tbl>{rows}</w:tbl></w:body></w:document>'
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("word/document.xml", xml)
    return buf.getvalue()


def _text_pdf(text: str) -> bytes:
    stream = f"BT /F1 14 Tf 40 700 Td ({text}) Tj ET".encode()
    objs = [b"<</Type/Catalog/Pages 2 0 R>>", b"<</Type/Pages/Kids[3 0 R]/Count 1>>",
            b"<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>",
            b"<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
            b"<</Length %d>>stream\n" % len(stream) + stream + b"\nendstream"]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for n, body in enumerate(objs, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % n + body + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1)
    out += b"".join(b"%010d 00000 n \n" % o for o in offsets)
    out += b"trailer<</Size %d/Root 1 0 R>>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, xref)
    return bytes(out)


def _png(path: Path, text: str = "BRIEF") -> Path:
    from PIL import Image, ImageDraw

    img = Image.new("RGB", (900, 300), "white")
    ImageDraw.Draw(img).text((20, 20), text, fill="black")
    img.save(path)
    return path


def test_brief_files_are_read(tmp_path):
    from backend.services import brief_sources as bs

    assert bs.read_text_file("Wajib sebut Tokopedia\r\n\r\n\r\n#ad".encode("utf-8")) == "Wajib sebut Tokopedia\n\n#ad"
    assert bs.read_text_file("caf\xe9".encode("cp1252")) == "café"
    doc = bs.read_docx(_docx(["Brief Ramadan", "Durasi 30-60 detik"], [["Hashtag", "#ad"]]))
    assert doc == "Brief Ramadan\nDurasi 30-60 detik\nHashtag | #ad"

    text_pdf = tmp_path / "brief.pdf"
    data = _text_pdf("Brief: wajib sebut Tokopedia dalam klip, durasi 30 sampai 60 detik.")
    text_pdf.write_bytes(data)
    got = bs.extract(text_pdf, data)
    assert "wajib sebut Tokopedia" in got["text"] and got["pages"] == 1 and got["images"] == []

    # A scanned page (only a picture) becomes an image for OCR / the vision model
    scan = tmp_path / "scan.pdf"
    from PIL import Image

    Image.new("RGB", (600, 800), "white").save(scan)
    got = bs.extract(scan, scan.read_bytes())
    assert got["text"] == "" and len(got["images"]) == 1 and got["images"][0].suffix == ".png"

    assert bs.kind_for("shot.PNG") == "image" and bs.kind_for("brief.docx") == "file"
    with pytest.raises(bs.SourceError, match="DOCX atau PDF"):
        bs.kind_for("lama.doc")
    with pytest.raises(bs.SourceError):
        bs.extract(tmp_path / "rusak.pdf", b"not a pdf")


def test_llm_image_copy_is_small_rgb(tmp_path):
    from PIL import Image

    from backend.services import brief_sources as bs

    big = tmp_path / "big.png"
    Image.new("RGBA", (4000, 2000), (0, 128, 0, 128)).save(big)
    data, mime = bs.llm_image(big)
    with Image.open(io.BytesIO(data)) as im:
        assert max(im.size) == bs.IMAGE_MAX_SIDE and im.mode == "RGB"
    assert mime in ("image/png", "image/jpeg")


# ---------------------------------------------------------------- understanding the brief

BRIEF_JSON = {
    "name": "Tokopedia Ramadan", "client": "Tokopedia", "summary": "Klip tentang belanja hemat.",
    "must_include": ["Tokopedia"], "post": {"hashtags": ["#TokopediaRamadan"]},
    "rules": [{"text": "Wajib sebut Tokopedia", "type": "must", "stage": "selection", "source": "[1] Wajib sebut Tokopedia"}],
    "questions": ["Boleh pakai musik?"], "unreadable": [],
}


def test_brief_is_read_from_text_and_images(monkeypatch, tmp_path):
    from backend.agents.tools import brief_ai

    shot = _png(tmp_path / "shot.png")
    calls = []

    def chat(system, user, **kw):
        calls.append({"system": system, "user": user, "images": kw.get("images")})
        return {**BRIEF_JSON, "seen": [{"image": 1, "first_line": "Hashtag #TokopediaRamadan"}]}

    monkeypatch.setattr(brief_ai.ocr, "available", lambda: True)
    monkeypatch.setattr(brief_ai.ocr, "read_image", lambda path, work, cancel=None: "Hashtag #TokopediaRamadan")
    monkeypatch.setattr(brief_ai.llm, "supports_vision", lambda t=None: True)
    monkeypatch.setattr(brief_ai.llm, "chat_json", chat)
    sources = [{"kind": "text", "name": "Chat", "text": "Wajib sebut Tokopedia"},
               {"kind": "image", "name": "shot.png", "path": "x/shot.png"}]
    res = brief_ai.read_brief(sources, resolve=lambda rel: shot if rel else None, work_dir=tmp_path / "w")

    assert res["brief"]["must_include"] == ["Tokopedia"] and res["name"] == "Tokopedia Ramadan"
    assert res["used_ocr"] and res["used_vision"] and len(calls) == 1
    assert "[1] Chat\nWajib sebut Tokopedia" in calls[0]["user"]
    # the model reads the picture itself: OCR mistakes must not override it
    assert "text found by OCR" not in calls[0]["user"] and "image 1: [2] shot.png" in calls[0]["user"]
    assert '"seen"' in calls[0]["system"]
    assert len(calls[0]["images"]) == 1 and calls[0]["images"][0][1].startswith("image/")


def test_a_router_that_drops_the_images_is_caught(monkeypatch, tmp_path):
    """Some OpenAI-compatible routers drop image parts without an error; the model then answers from the
    text alone. Its "seen" lines do not match the OCR text, so the brief is read again from the OCR text."""
    from backend.agents.tools import brief_ai

    shot = _png(tmp_path / "shot.png")
    calls = []

    def chat(system, user, **kw):
        calls.append({"user": user, "images": kw.get("images")})
        return {**BRIEF_JSON, "seen": [{"image": 1, "first_line": "Brief campaign"}]} if kw.get("images") else BRIEF_JSON

    monkeypatch.setattr(brief_ai.ocr, "available", lambda: True)
    monkeypatch.setattr(brief_ai.ocr, "read_image", lambda path, work, cancel=None: "Deadline 30 November 2026")
    monkeypatch.setattr(brief_ai.llm, "supports_vision", lambda t=None: True)
    monkeypatch.setattr(brief_ai.llm, "chat_json", chat)
    res = brief_ai.read_brief([{"kind": "image", "name": "s.png", "path": "s.png"}],
                              resolve=lambda rel: shot, work_dir=tmp_path / "w")
    assert [bool(c["images"]) for c in calls] == [True, False]
    assert "Deadline 30 November 2026" in calls[1]["user"] and not res["used_vision"]

    assert brief_ai._saw_images({"seen": [{"image": 1, "first_line": "deadline 30 november"}]},
                                [("[1] s", shot, "Deadline: 30 November 2026")])
    assert brief_ai._saw_images({}, [("[1] s", shot, "")])   # nothing to compare: trusted


def test_a_model_without_vision_reads_the_ocr_text(monkeypatch, tmp_path):
    from backend.agents.tools import brief_ai

    shot = _png(tmp_path / "shot.png")
    calls = []

    def chat(system, user, **kw):
        calls.append(kw.get("images"))
        if kw.get("images"):
            raise brief_ai.llm.LLMNoVision("no images")
        return BRIEF_JSON

    monkeypatch.setattr(brief_ai.ocr, "available", lambda: True)
    monkeypatch.setattr(brief_ai.ocr, "read_image", lambda path, work, cancel=None: "Wajib sebut Tokopedia")
    monkeypatch.setattr(brief_ai.llm, "supports_vision", lambda t=None: True)
    monkeypatch.setattr(brief_ai.llm, "chat_json", chat)
    res = brief_ai.read_brief([{"kind": "image", "name": "s.png", "path": "s.png"}],
                              resolve=lambda rel: shot, work_dir=tmp_path / "w")
    assert [bool(c) for c in calls] == [True, False]   # asked once with images, then with the OCR text
    assert res["used_ocr"] and not res["used_vision"]


def test_images_without_vision_or_ocr_fail_clearly(monkeypatch, tmp_path):
    from backend.agents.tools import brief_ai

    monkeypatch.setattr(brief_ai.ocr, "available", lambda: False)
    monkeypatch.setattr(brief_ai.llm, "supports_vision", lambda t=None: False)
    with pytest.raises(brief_ai.BriefReadError, match="tidak menerima gambar"):
        brief_ai.read_brief([{"kind": "image", "name": "s.png", "path": "s.png"}],
                            resolve=lambda rel: _png(tmp_path / "s.png"), work_dir=tmp_path)
    with pytest.raises(brief_ai.BriefReadError, match="Belum ada bahan"):
        brief_ai.read_brief([], resolve=lambda rel: None, work_dir=tmp_path)


# ---------------------------------------------------------------- vision requests

class _FakeCompletions:
    def __init__(self, fail=None):
        self.params, self.fail = [], fail

    def create(self, **params):
        self.params.append(params)
        if self.fail:
            raise self.fail

        class R:
            class C:
                class Mm:
                    content = '{"ok": true}'
                message = Mm
            choices = [C]
        return R


def _bad_request(message: str):
    import httpx
    import openai

    resp = httpx.Response(400, request=httpx.Request("POST", "http://x/v1/chat/completions"),
                          json={"error": {"message": message}})
    return openai.BadRequestError(message, response=resp, body={"error": {"message": message}})


def test_images_go_as_openai_parts_and_refusals_are_remembered(db, secrets, monkeypatch):
    from backend.core import llm

    secrets.set_secret("llm_api_key", "k")
    llm._no_vision.clear()
    ok = _FakeCompletions()
    monkeypatch.setattr(llm, "_openai_client", lambda t, timeout: type("C", (), {"chat": type("Ch", (), {"completions": ok})})())
    assert llm.chat_json("s", "u", images=[(b"\x89PNG", "image/png")]) == {"ok": True}
    content = ok.params[0]["messages"][1]["content"]
    assert content[0] == {"type": "text", "text": "u"}
    assert content[1]["image_url"]["url"].startswith("data:image/png;base64,")

    refuse = _FakeCompletions(_bad_request("Invalid content type. image_url is only supported by certain models."))
    monkeypatch.setattr(llm, "_openai_client", lambda t, timeout: type("C", (), {"chat": type("Ch", (), {"completions": refuse})})())
    with pytest.raises(llm.LLMNoVision):
        llm.chat_json("s", "u", images=[(b"x", "image/png")])
    assert not llm.supports_vision()
    with pytest.raises(llm.LLMNoVision):  # remembered: no second request
        llm.chat_json("s", "u", images=[(b"x", "image/png")])
    assert len(refuse.params) == 1
    llm._no_vision.clear()


def test_images_go_as_anthropic_blocks(db, secrets, monkeypatch):
    import httpx

    from backend.core import llm
    from backend.core.settings_store import update_settings

    update_settings({"llm": {"provider": "anthropic"}})
    secrets.set_secret("anthropic_api_key", "k")
    sent = {}

    def post(url, headers=None, json=None, timeout=None):
        sent.update(json)
        return httpx.Response(200, json={"content": [{"type": "text", "text": '{"ok": 1}'}]},
                              request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx, "post", post)
    assert llm.chat_json("s", "u", images=[(b"img", "image/jpeg")]) == {"ok": 1}
    blocks = sent["messages"][0]["content"]
    assert blocks[0]["type"] == "image" and blocks[0]["source"]["media_type"] == "image/jpeg"
    assert blocks[-1] == {"type": "text", "text": "u"}


def test_deepseek_is_known_to_take_no_images(db, secrets):
    from backend.core import llm
    from backend.core.settings_store import update_settings

    update_settings({"llm": {"provider": "deepseek"}})
    secrets.set_secret("deepseek_api_key", "k")
    assert not llm.supports_vision()
    with pytest.raises(llm.LLMNoVision):
        llm.chat_json("s", "u", images=[(b"x", "image/png")])


# ---------------------------------------------------------------- the Analyzer with briefs

def _transcript():
    out = []
    for i in range(400):
        text = f"Ini kalimat nomor {i}."
        if 150 <= i <= 159:
            text = f"Belanja hemat di Tokopedia nomor {i}."
        if 300 <= i <= 309:
            text = f"Ini anjing sekali nomor {i}."
        out.append({"text": text, "start": float(i * 5), "duration": 5.0})
    return out


class FakeCtx:
    id = "job-1"

    class cancel:
        cancelled = False

    def __init__(self):
        self.errors = []

    def check(self):
        pass

    def progress(self, *a, **k):
        pass

    def error(self, step, message):
        self.errors.append(message)


def _s(v):
    return {"hook": v, "value": v, "standalone": v, "payoff": v, "shareability": v}


CAMPAIGNS = [
    {"id": "cA", "name": "Tokopedia", "brief": clean_brief({"must_include": ["Tokopedia"], "focus": ["belanja hemat"]})},
    {"id": "cB", "name": "Bersih", "brief": clean_brief({"banned_words": ["anjing"],
                                                         "rules": [{"text": "Tanpa gosip", "type": "must_not"}]})},
]


def test_each_campaign_chooses_its_own_clips(monkeypatch):
    prompts = []

    def chat(system, user, **kw):
        prompts.append((system, user))
        if "Candidate 1" in user:
            return {"clips": []}  # the rank pass changes nothing
        if "Transcript part 1/" in user:
            return {"clips": [{"start_id": 30, "end_id": 39, **_s(8), "hook_text": "umum",
                               "campaigns": [{"campaign": 1, "fit": 2}, {"campaign": 2, "fit": 9}]}]}
        if "Transcript part 2/" in user:
            return {"clips": [{"start_id": 150, "end_id": 159, **_s(7), "hook_text": "toko",
                               "campaigns": [{"campaign": 1, "fit": 9, "why": "sebut Tokopedia"}, {"campaign": 2, "fit": 5}]}]}
        if "Transcript part 3/" in user:
            return {"clips": [{"start_id": 300, "end_id": 309, **_s(9), "hook_text": "kasar",
                               "campaigns": [{"campaign": 1, "fit": 3}, {"campaign": 2, "fit": 8}]},
                              {"start_id": 330, "end_id": 339, **_s(9), "hook_text": "gosip",
                               "campaigns": [{"campaign": 2, "fit": 9, "violations": ["gosip"]}]}]}
        return {"clips": []}

    monkeypatch.setattr(an.llm, "chat_json", chat)
    ctx = FakeCtx()
    video = {"_id": "sv1", "youtube_id": "AAAAAAAAAAA", "title": "Podcast", "duration_seconds": 2000}
    out = an._analyze_video(ctx, video, 45, 60, 2, _transcript(), True, CAMPAIGNS, "fokus ke tips")

    a = [s for s in out if s["campaign_id"] == "cA"]
    b = [s for s in out if s["campaign_id"] == "cB"]
    # A: only the moment that says "Tokopedia"; fewer clips than asked -> a warning, no filler clips
    assert [s["hook_text"] for s in a] == ["toko"] and a[0]["brief_fit"] == 90 and a[0]["brief_reason"] == "sebut Tokopedia"
    assert any("Hanya 1 momen" in e and "Tokopedia" in e for e in ctx.errors)
    # B: the swearing and the gossip clip are dropped; ranked by viral score and fit together
    assert [s["hook_text"] for s in b] == ["umum", "toko"]
    assert b[0]["rank_score"] == an.combined_score(80, 9) == 83
    # The same moment for two campaigns: two clips (ids differ), one media key (cut once)
    from backend.agents.nodes.processor import media_key

    toko_a, toko_b = a[0], b[1]
    assert toko_a["segment_id"] != toko_b["segment_id"] and media_key(toko_a) == media_key(toko_b)
    assert toko_a["segment_id"] == an.segment_id("job-1", "AAAAAAAAAAA", toko_a["start_time"], toko_a["end_time"], "cA")
    # The briefs and the note are in the prompts, as data
    system, user = prompts[0]
    assert "[Campaign 1] Tokopedia" in user and "Must be said in the clip: Tokopedia" in user
    assert "Words that must not be said: anjing" in user and "Must not: Tanpa gosip" in user
    assert "fokus ke tips" in user and '"campaigns"' in system


def test_without_campaigns_ids_and_prompts_are_unchanged(monkeypatch):
    seen = []

    def chat(system, user, **kw):
        seen.append(system + user)
        return {"clips": [{"start_id": 30, "end_id": 39, **_s(8), "hook_text": "a"}]} if "part 1/" in user else {"clips": []}

    monkeypatch.setattr(an.llm, "chat_json", chat)
    out = an._analyze_video(FakeCtx(), {"_id": "sv1", "youtube_id": "AAAAAAAAAAA", "title": "t", "duration_seconds": 2000},
                            45, 60, 2, _transcript(), True)
    assert "campaign_id" not in out[0] and "Campaign" not in "".join(seen)
    assert out[0]["segment_id"] == an.segment_id("job-1", "AAAAAAAAAAA", out[0]["start_time"], out[0]["end_time"])


def test_a_clip_gets_the_length_its_brief_accepts():
    from backend.agents.tools.sentences import Unit

    units = [Unit(k, 100 + 6 * k, 105.8 + 6 * k, f"kalimat {k}.", True) for k in range(12)]
    brief = {"duration": {"min": 30, "max": 45}}
    # The job allows 45-60 s (+3 s to finish a sentence); the brief wants at most 45 s: whole sentences go
    c = an.fit_brief_length(units, {"i": 0, "j": 9}, brief, 45, 60)
    assert c["i"] == 0 and 29.5 <= an.clip_length(units, c["i"], c["j"]) <= 45.5
    # Already inside the brief's range: unchanged, so a moment shared with another campaign stays shared
    assert an.fit_brief_length(units, {"i": 0, "j": 5}, brief, 45, 60) == {"i": 0, "j": 5}
    # Only a maximum: the longest clip under it
    c = an.fit_brief_length(units, {"i": 0, "j": 9}, {"duration": {"max": 45}}, 45, 60)
    assert an.clip_length(units, c["i"], c["j"]) <= 45.5
    # No whole sentence fits 10-12 s: dropped rather than cut mid-sentence
    long = [Unit(k, 20.0 * k, 20.0 * k + 19.5, f"panjang {k}.", True) for k in range(8)]
    assert an.fit_brief_length(long, {"i": 2, "j": 4}, {"duration": {"min": 10, "max": 12}}, 45, 60) is None


def test_the_strictest_brief_length_limits_a_shared_moment():
    import types

    from backend.agents.nodes import processor

    ctx = types.SimpleNamespace(job={"campaigns": [{"id": "a", "brief": {"duration": {"min": 30, "max": 60}}},
                                                   {"id": "b", "brief": {"duration": {"max": 45}}},
                                                   {"id": "c", "brief": {}}]})
    assert processor.length_limits(ctx, [{"campaign_id": "a"}, {"campaign_id": "b"}, {"campaign_id": "c"}, {}]) \
        == (29.5, 45.5)
    assert processor.length_limits(ctx, [{}]) == (None, None)


def test_campaign_limits():
    assert an.campaign_limit(3, {"brief": {"max_per_video": 1}}) == 1
    assert an.campaign_limit(0, {"brief": {"max_per_video": 2}}) == 2
    assert an.campaign_limit(3, {"brief": {}}) == 3


# ---------------------------------------------------------------- the Processor with briefs

def _ctx_for(db, job):
    from backend.agents.context import JobContext
    from backend.core.procs import CancelToken

    return JobContext(job, CancelToken())


def _job(db, campaigns):
    job = {"_id": new_id(), "source": {"type": "url"}, "config": {}, "status": "running",
           "checkpoint": {}, "campaigns": campaigns, "campaign_ids": [c["id"] for c in campaigns], "created_at": utcnow()}
    db.discovery_jobs.insert_one(job)
    return job


def test_a_moment_for_two_campaigns_is_cut_once(db, monkeypatch, paths):
    from backend.agents.nodes import processor
    from backend.services import brand_templates, campaigns as csvc

    ca = csvc.create("Tokopedia", brief={"must_include": ["Tokopedia"], "post": {"hashtags": ["#ad"]}})
    tpl = brand_templates.create("Kampanye", {"ai_settings": {"keywords": False}}, campaign_id=ca["_id"])
    brand_templates.set_default(ca["_id"], tpl["_id"])
    ca = csvc.get(ca["_id"])
    cb = csvc.create("Lain", brief={"post": {"hashtags": ["#lain"]}})
    cc = csvc.create("Channel sendiri")  # a plain campaign: no brief
    job = _job(db, [csvc.snapshot(ca), csvc.snapshot(cb), csvc.snapshot(cc)])
    ctx = _ctx_for(db, job)

    def seg(cid):
        out = {"segment_id": an.segment_id(job["_id"], "AAAAAAAAAAA", 100, 150, cid), "source_video_id": "sv1",
               "youtube_id": "AAAAAAAAAAA", "start_time": 100.0, "end_time": 150.0, "duration_seconds": 50.0,
               "viral_score": 80, "hook_text": f"hook {cid}", "tags": [], "rationale": "", "campaign_id": cid}
        return out if cid == cc["_id"] else {**out, "brief_fit": 70, "brief_reason": "pas"}

    cut = []

    def fake_process(c, s, limits=(None, None)):
        cut.append(s["segment_id"])
        folder = paths.clip_dir(c.campaign_slug(s["campaign_id"]), s["segment_id"])
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "raw.mp4").write_bytes(b"video")
        (folder / "thumb.jpg").write_bytes(b"jpg")
        doc = ClipDoc(_id=s["segment_id"], job_id=job["_id"], source_video_id="sv1",
                      youtube_id="AAAAAAAAAAA", start_time=100.2, end_time=149.8, duration_seconds=49.6,
                      files={"raw": paths.to_relative(folder / "raw.mp4"), "thumbnail": paths.to_relative(folder / "thumb.jpg")},
                      subtitle={"words": [{"word": "di", "start": 0, "end": 0.2}, {"word": "toko", "start": 0.2, "end": 0.5},
                                          {"word": "pedia", "start": 0.5, "end": 0.9, "emoji": "x"}]},
                      brand_template_id=processor._template_id(c, s), campaign_id=s["campaign_id"], status="ready").to_mongo()
        db.clips.insert_one(doc)
        return doc

    monkeypatch.setattr(processor, "process_segment", fake_process)
    clips = processor.run(ctx, [seg(ca["_id"]), seg(cb["_id"]), seg(cc["_id"])])

    assert len(cut) == 1 and len(clips) == 3
    base = db.clips.find_one({"_id": seg(ca["_id"])["segment_id"]})
    assert paths.from_relative(base["files"]["raw"]).parent.parent.name == "tokopedia"  # the campaign's folder
    derived = db.clips.find_one({"_id": seg(cb["_id"])["segment_id"]})
    assert derived["start_time"] == 100.2 and derived["hook_text"] == f"hook {cb['_id']}"
    assert derived["campaign_id"] == cb["_id"] and derived["brief_fit"] == 70
    # Its own files (hard links or copies in its own folder) with the same bytes
    raw = paths.from_relative(derived["files"]["raw"])
    assert raw.parent.name == derived["_id"] and raw.read_bytes() == b"video"
    assert derived["files"]["source"] is None
    # Its own marks: the other campaign requires no words, and the base's emoji is not copied
    assert not any(w.get("keyword") or w.get("emoji") for w in derived["subtitle"]["words"])
    # Each campaign's clip takes that campaign's default template; the post text has the required tags
    assert base["brand_template_id"] == tpl["_id"] and derived["brand_template_id"] == cb["brand_template_id"]
    assert derived["post_copy"]["source"] == "basic" and derived["post_copy"]["hashtags"] == ["#lain"]
    # The plain campaign's clip: no fit, no post text, its own folder
    own = db.clips.find_one({"_id": seg(cc["_id"])["segment_id"]})
    assert own["campaign_id"] == cc["_id"] and own.get("brief_fit") is None and not own.get("post_copy")
    assert paths.from_relative(own["files"]["raw"]).parent.parent.name == "channel-sendiri"
    done = db.discovery_jobs.find_one({"_id": job["_id"]})["checkpoint"]["done_segment_ids"]
    assert set(done) == {seg(c["_id"])["segment_id"] for c in (ca, cb, cc)}


def test_required_words_are_marked_with_the_campaign_template(db):
    from backend.agents.nodes import processor

    words = [{"word": "di"}, {"word": "Toko"}, {"word": "pedia"}]
    marked = processor._brief_marks(words, {"brief": {"must_include": ["Tokopedia"]}})
    assert [bool(w.get("keyword")) for w in marked] == [False, True, True]
    assert processor._brief_marks(words, None) == words


# ---------------------------------------------------------------- post text

def test_post_text_always_has_the_required_tags():
    from backend.agents.tools import post_copy_ai as pc

    brief = clean_brief({"post": {"hashtags": ["#TokopediaRamadan", "#ad"], "mentions": ["@tokopedia"],
                                  "disclosure": "Paid partnership", "cta": "Cek link di bio"}})
    out = pc.enforce({"title": " Judul  bagus ", "caption": "Seru!", "hashtags": ["hemat", "#AD"]}, brief)
    assert out["title"] == "Judul bagus"
    assert out["hashtags"] == ["#hemat", "#AD", "#TokopediaRamadan"]  # case-insensitive: #ad is there
    assert out["mentions"] == ["@tokopedia"] and out["disclosure"] == "Paid partnership"
    text = pc.as_text(out)
    assert text.startswith("Judul bagus\n\nSeru!\n\n@tokopedia #hemat") and text.rstrip().endswith("Paid partnership")
    basic = pc.fallback({"hook_text": "Hook"}, brief)
    assert basic["caption"] == "Hook Cek link di bio" and basic["source"] == "basic"


# ---------------------------------------------------------------- the brief checklist

def test_brief_checklist():
    from backend.services import brief_check

    campaign = {"_id": "c1", "version": 3, "brief": clean_brief({
        "duration": {"min": 30, "max": 60}, "must_include": ["Tokopedia"], "banned_words": ["anjing"],
        "visual": {"subtitles": "required", "logo": "required", "credit": "required"},
        "post": {"hashtags": ["#ad"], "mentions": ["@toko"], "disclosure": "#ad"},
        "deadline": "2026-11-17",
        "rules": [{"text": "Pilih momen hemat", "stage": "selection"}, {"text": "Posting jam 7", "stage": "manual"}],
    })}
    clip = {"duration_seconds": 45, "subtitle": {"words": [{"word": "Toko"}, {"word": "pedia"}]},
            "post_copy": {"title": "t", "caption": "c", "hashtags": ["#ad"], "mentions": []},
            "brief_fit": 80, "brief_manual": {}}
    tpl = {"brand_settings": {"overlayUrl": "asset://x.png"},
           "layout_settings": {"mode": "podcast", "credit": {"enabled": True}}}
    res = brief_check.check(clip, campaign, tpl, "Kanal", today=date(2026, 11, 16))
    by = {i["id"]: i for i in res["items"]}
    assert by["duration"]["status"] == "ok" and by["required_words"]["status"] == "ok"
    assert by["banned_words"]["status"] == "ok" and by["subtitles"]["status"] == "ok"
    assert by["logo"]["status"] == "ok" and by["credit"]["status"] == "ok"
    assert by["hashtags"]["status"] == "ok" and by["mentions"]["params"]["missing"] == ["@toko"]
    assert by["disclosure"]["status"] == "ok"  # "#ad" is among the hashtags
    assert by["deadline"]["status"] == "warn" and by["deadline"]["params"]["days_left"] == 1
    assert by["rule:r1"]["status"] == "ai" and by["rule:r2"]["status"] == "manual"
    assert res["summary"]["fail"] == 1 and res["summary"]["manual_open"] == 1 and not res["summary"]["ready"]

    # Full layout: no credit on screen; an upload has no channel for "{channel}"
    tpl_full = {"layout_settings": {"mode": "full", "credit": {"enabled": True}}}
    res = brief_check.check({**clip, "brief_manual": {"r2": True}}, campaign, tpl_full, "", today=date(2026, 11, 20))
    by = {i["id"]: i for i in res["items"]}
    assert by["credit"]["status"] == "fail" and by["logo"]["status"] == "fail"
    assert by["deadline"]["status"] == "fail" and by["rule:r2"]["params"]["checked"] is True


# ---------------------------------------------------------------- API

@pytest.fixture()
def client(db, secrets):
    from fastapi.testclient import TestClient

    from backend.main import create_app

    with TestClient(create_app()) as c:
        c.headers.update({"Authorization": f"Bearer {config.token}"})
        yield c


def _wait_parse(client, cid, timeout=10.0):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        c = client.get(f"/api/campaigns/{cid}").json()["campaign"]
        if c["parse"]["status"] != "running":
            return c
        time.sleep(0.05)
    raise AssertionError("parse did not finish")


def test_campaign_api_flow(client, secrets, monkeypatch, tmp_path, db):
    from backend.agents.tools import brief_ai

    r = client.post("/api/campaigns", json={"name": "  Tokopedia   Ramadan ", "client": "Tokopedia"})
    assert r.status_code == 200, r.text
    camp = r.json()["campaign"]
    cid = camp["id"]
    assert camp["name"] == "Tokopedia Ramadan" and camp["version"] == 1 and camp["clip_count"] == 0
    assert client.post("/api/campaigns", json={"name": " "}).status_code == 400

    camp = client.post(f"/api/campaigns/{cid}/sources/text", json={"text": "Wajib sebut Tokopedia"}).json()["campaign"]
    assert camp["sources"][0]["kind"] == "text" and camp["sources"][0]["name"] == "Teks brief"
    png = _png(tmp_path / "shot.png").read_bytes()
    camp = client.post(f"/api/campaigns/{cid}/sources/file", files={"file": ("shot.png", png, "image/png")}).json()["campaign"]
    docx = _docx(["Durasi 30-60 detik"], [])
    camp = client.post(f"/api/campaigns/{cid}/sources/file", files={"file": ("brief.docx", docx)}).json()["campaign"]
    kinds = [(s["kind"], s["text"]) for s in camp["sources"]]
    assert kinds[1] == ("image", "") and kinds[2] == ("file", "Durasi 30-60 detik")
    r = client.post(f"/api/campaigns/{cid}/sources/file", files={"file": ("lama.doc", b"x")})
    assert r.status_code == 400 and "DOCX" in r.json()["detail"]
    image_id = camp["sources"][1]["id"]
    from backend.core.paths import get_paths

    stored = get_paths().from_relative(camp["sources"][1]["path"])
    assert stored.is_file()
    camp = client.delete(f"/api/campaigns/{cid}/sources/{image_id}").json()["campaign"]
    assert len(camp["sources"]) == 2 and not stored.exists()

    # Understanding the brief: needs an LLM key, runs in the background, lands in the draft
    assert client.post(f"/api/campaigns/{cid}/parse").status_code == 400
    secrets.set_secret("llm_api_key", "k")
    monkeypatch.setattr(brief_ai, "read_brief", lambda sources, **kw: {
        "brief": clean_brief(BRIEF_JSON), "name": "Tokopedia Ramadan", "client": "Tokopedia",
        "unreadable": [], "used_ocr": False, "used_vision": False})
    assert client.post(f"/api/campaigns/{cid}/parse").status_code == 200
    camp = _wait_parse(client, cid)
    assert camp["parse"]["status"] == "done" and camp["draft"]["brief"]["must_include"] == ["Tokopedia"]
    assert camp["version"] == 1  # nothing is used until the user saves the reviewed brief
    listed = client.get("/api/campaigns").json()["campaigns"]
    assert listed[0]["has_draft"] is True and "draft" not in listed[0]

    camp = client.put(f"/api/campaigns/{cid}", json={"brief": camp["draft"]["brief"]}).json()["campaign"]
    assert camp["version"] == 2 and camp["draft"] is None and camp["brief"]["post"]["hashtags"] == ["#TokopediaRamadan"]
    camp = client.put(f"/api/campaigns/{cid}", json={"brief": camp["brief"]}).json()["campaign"]
    assert camp["version"] == 2  # the same brief again is not a new version
    listed = client.get("/api/campaigns").json()["campaigns"]
    assert listed[0]["id"] == cid and listed[0]["source_count"] == 2 and "sources" not in listed[0]
    assert listed[0]["has_draft"] is False

    # A job for the campaign keeps a snapshot of its brief; a custom duration is accepted
    from backend.api.routes import jobs as jobs_route

    monkeypatch.setattr(jobs_route.runner, "submit_job", lambda job_id: None)
    body = {"youtube_url": "https://youtu.be/abcdefghijk", "clip_duration": "20-40",
            "campaign_ids": [cid], "note": "fokus tips"}
    r = client.post("/api/jobs", json=body)
    assert r.status_code == 200, r.text
    job = r.json()["job"]
    assert job["campaigns"] == [{"id": cid, "name": "Tokopedia Ramadan", "version": 2}] and job["note"] == "fokus tips"
    stored_job = db.discovery_jobs.find_one({"_id": job["id"]})
    assert stored_job["config"]["clip_duration"] == "20-40"
    assert stored_job["campaigns"][0]["brief"]["must_include"] == ["Tokopedia"]
    assert client.post("/api/jobs", json={**body, "clip_duration": "5-8"}).status_code == 400
    assert client.post("/api/jobs", json={**body, "campaign_ids": ["nope"]}).status_code == 400
    r = client.post("/api/jobs", json={**body, "campaign_ids": []})
    assert r.status_code == 400 and "minimal satu campaign" in r.json()["detail"]
    assert client.get("/api/jobs", params={"campaign_id": cid}).json()["jobs"][0]["id"] == job["id"]
    assert client.get("/api/jobs", params={"campaign_id": "other"}).json()["jobs"] == []
    client.put(f"/api/campaigns/{cid}", json={"status": "archived"})
    assert "diarsipkan" in client.post("/api/jobs", json=body).json()["detail"]
    client.put(f"/api/campaigns/{cid}", json={"status": "active"})

    # A clip of the campaign: list filter, checklist, post text, manual ticks, export text file
    clip_id = new_id()
    db.clips.insert_one(ClipDoc(_id=clip_id, job_id=None, source_video_id=None, youtube_id="x",
                                start_time=0, end_time=45, duration_seconds=45, status="ready", campaign_id=cid,
                                brief_fit=80, subtitle={"words": [{"word": "Tokopedia", "start": 0, "end": 1}]}).to_mongo())
    plain = client.post("/api/campaigns", json={"name": "Polos"}).json()["campaign"]
    plain_clip = new_id()
    db.clips.insert_one(ClipDoc(_id=plain_clip, job_id=None, source_video_id=None, youtube_id="y", campaign_id=plain["id"],
                                start_time=0, end_time=45, duration_seconds=45, status="ready").to_mongo())
    listed = client.get("/api/clips", params={"campaign_id": cid}).json()["clips"]
    assert [c["id"] for c in listed] == [clip_id] and listed[0]["campaign_name"] == "Tokopedia Ramadan"
    assert listed[0]["brief_summary"]["fail"] >= 1  # no post text yet
    detail = client.get(f"/api/clips/{clip_id}").json()
    assert detail["campaign"]["id"] == cid and "sources" not in detail["campaign"]
    kinds = {i["id"]: i["status"] for i in detail["brief_check"]["items"]}
    assert kinds["required_words"] == "ok" and kinds["post_copy"] == "fail"
    # A plain campaign's clip has no checklist
    [listed_plain] = client.get("/api/clips", params={"campaign_id": plain["id"]}).json()["clips"]
    assert listed_plain["brief_summary"] is None and listed_plain["campaign_name"] == "Polos"
    detail = client.get(f"/api/clips/{plain_clip}").json()
    assert detail["campaign"]["id"] == plain["id"] and detail["brief_check"] is None

    # Moving a clip to another campaign drops what belonged to the old one
    other = client.post("/api/campaigns", json={"name": "Lain", "brief": {"post": {"hashtags": ["#Lain"]}}}).json()["campaign"]
    db.clips.update_one({"_id": clip_id}, {"$set": {"brief_reason": "cocok", "brief_manual": {"r1": True}}})
    moved = client.put(f"/api/clips/{clip_id}/campaign", json={"campaign_id": other["id"]}).json()["clip"]
    stored = db.clips.find_one({"_id": clip_id})
    assert moved["campaign_id"] == other["id"] and "brief_fit" not in stored and "brief_manual" not in stored
    assert stored["post_copy"]["hashtags"] == ["#Lain"] and stored["post_copy"]["source"] == "basic"
    # Every clip belongs to a campaign; moving to a plain one drops the post text
    assert client.put(f"/api/clips/{clip_id}/campaign", json={"campaign_id": None}).status_code == 422
    client.put(f"/api/clips/{clip_id}/campaign", json={"campaign_id": plain["id"]})
    assert "post_copy" not in db.clips.find_one({"_id": clip_id})
    client.put(f"/api/clips/{clip_id}/campaign", json={"campaign_id": cid})
    client.delete(f"/api/campaigns/{other['id']}")

    r = client.put(f"/api/clips/{clip_id}/post-copy", json={"title": "Judul", "caption": "Seru", "hashtags": ["TokopediaRamadan"]})
    assert r.json()["clip"]["post_copy"]["hashtags"] == ["#TokopediaRamadan"]
    detail = client.get(f"/api/clips/{clip_id}").json()
    assert {i["id"]: i["status"] for i in detail["brief_check"]["items"]}["hashtags"] == "ok"
    rule_id = camp["brief"]["rules"][0]["id"]
    assert client.put(f"/api/clips/{clip_id}/brief-manual", json={"rule": "zzz", "checked": True}).status_code == 400
    r = client.put(f"/api/clips/{clip_id}/brief-manual", json={"rule": rule_id, "checked": True})
    assert r.status_code == 200 and r.json()["clip"]["brief_manual"] == {rule_id: True}

    final = get_paths().clip_dir("podcast", clip_id) / "final.mp4"
    final.parent.mkdir(parents=True, exist_ok=True)
    final.write_bytes(b"mp4")
    db.clips.update_one({"_id": clip_id}, {"$set": {"files.final": get_paths().to_relative(final)}})
    out_dir = tmp_path / "ekspor"
    out_dir.mkdir()
    r = client.post("/api/clips/export", json={"clip_ids": [clip_id], "dest_dir": str(out_dir)})
    video = Path(r.json()["exported"][0]["path"])
    txt = video.with_suffix(".txt").read_text(encoding="utf-8")
    assert txt.startswith("Judul\n\nSeru\n\n#TokopediaRamadan")
    client.put("/api/settings", json={"export": {"post_text": False}})
    video.with_suffix(".txt").unlink()
    client.post("/api/clips/export", json={"clip_ids": [clip_id], "dest_dir": str(out_dir)})
    assert not video.with_suffix(".txt").exists()

    # Deleting the campaign deletes its clips, its brief files and the job that followed only it; the
    # clip files stay unless asked
    folder = get_paths().library_dir / "_campaigns" / cid
    assert folder.is_dir()
    r = client.delete(f"/api/campaigns/{cid}")
    assert r.status_code == 200 and r.json()["deleted_clips"] == 1
    assert db.clips.find_one({"_id": clip_id}) is None and not folder.exists() and final.exists()
    assert db.discovery_jobs.find_one({"_id": job["id"]}) is None
    assert client.get(f"/api/campaigns/{cid}").status_code == 404
    assert db.clips.find_one({"_id": plain_clip})["campaign_id"] == plain["id"]


def test_parse_failure_and_restart_recovery(client, secrets, monkeypatch, db):
    from backend.agents.tools import brief_ai
    from backend.services import campaigns as csvc

    secrets.set_secret("llm_api_key", "k")
    cid = client.post("/api/campaigns", json={"name": "X"}).json()["campaign"]["id"]

    def boom(sources, **kw):
        raise brief_ai.BriefReadError("Belum ada bahan brief")

    monkeypatch.setattr(brief_ai, "read_brief", boom)
    client.post(f"/api/campaigns/{cid}/parse")
    camp = _wait_parse(client, cid)
    assert camp["parse"]["status"] == "failed" and "Belum ada bahan" in camp["parse"]["message"]
    assert client.post(f"/api/campaigns/{cid}/draft/discard").status_code == 400

    db.campaigns.update_one({"_id": cid}, {"$set": {"parse": {"status": "running"}}})
    csvc.recover()
    assert db.campaigns.find_one({"_id": cid})["parse"]["status"] == "failed"


def test_deleting_the_default_template_hands_over_to_another(client, db):
    from backend.services import campaigns as csvc

    camp = csvc.create("C")
    tpl = client.post("/api/brand-templates", json={"campaign_id": camp["_id"], "name": "T2", "make_default": True}).json()["brand_template"]
    assert db.campaigns.find_one({"_id": camp["_id"]})["brand_template_id"] == tpl["id"]
    assert client.delete(f"/api/brand-templates/{tpl['id']}").status_code == 200
    assert db.campaigns.find_one({"_id": camp["_id"]})["brand_template_id"] == camp["brand_template_id"]


def test_migration_009_creates_the_campaigns_collection(db):
    assert "campaigns" in db.list_collection_names()
    assert "campaign_id_1_created_at_-1" in {ix["name"] for ix in db.clips.list_indexes()}
    assert db.meta.find_one({"_id": "schema"})["version"] >= 9
