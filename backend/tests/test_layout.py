"""Brand Template layout (podcast mode): validation, the effective layout of a clip, the render props,
the clip's original-ratio video (source.mp4) and its preparation for older clips."""
from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.core import procs
from backend.core.config import config
from backend.core.db import new_id, utcnow
from backend.models.documents import ClipDoc
from backend.services import layout, render


@pytest.fixture()
def client(db, secrets):
    from backend.main import create_app

    with TestClient(create_app()) as c:
        c.headers.update({"Authorization": f"Bearer {config.token}"})
        yield c


def _clip(db, paths, *, source: bool = False, source_video_id: str | None = None, youtube_id: str | None = "yt123") -> dict:
    cid = new_id()
    folder = paths.library_dir / "podcast" / cid
    folder.mkdir(parents=True)
    (folder / "raw.mp4").write_bytes(b"raw")
    files = {"raw": paths.to_relative(folder / "raw.mp4")}
    if source:
        (folder / "source.mp4").write_bytes(b"source")
        files["source"] = paths.to_relative(folder / "source.mp4")
    doc = ClipDoc(_id=cid, agent_id=None, job_id=None, source_video_id=source_video_id, youtube_id=youtube_id,
                  start_time=754.0, end_time=799.5, duration_seconds=45.5, hook_text="Rahasia yang jarang orang tahu",
                  status="ready", files=files, source_width=1920 if source else None,
                  source_height=1080 if source else None).to_mongo()
    db.clips.insert_one(doc)
    return doc


def test_clean_layout_keeps_known_keys_and_clamps():
    raw = {
        "mode": "podcast",
        "safeZone": "reels",
        "frame": {"y": 999, "ratio": "4:3", "radius": -5, "junk": 1},
        "background": {"type": "blur", "dim": 0.4, "color": "#112233", "imageUrl": ""},
        "header": {"maxLines": 2.6, "boxColor": "", "text": "x" * 500},
        "credit": {"enabled": True},
        "other": {"a": 1},
    }
    out = layout.clean_layout(raw)
    assert out == {
        "mode": "podcast",
        "frame": {"y": 473, "ratio": "4:3", "radius": 0},
        "background": {"type": "blur", "dim": 0.4, "color": "#112233", "imageUrl": ""},
        "header": {"maxLines": 3, "boxColor": "", "text": "x" * 200},
        "credit": {"enabled": True},
    }
    assert layout.clean_layout(raw, keep_safe_zone=True)["safeZone"] == "reels"
    assert layout.clean_layout(None) == {}
    for bad in ({"mode": "wide"}, {"frame": {"ratio": "21:9"}}, {"frame": {"y": "atas"}}, {"frame": {"y": True}},
                {"background": {"color": "red"}}, {"background": {"imageUrl": "C:/x.png"}},
                {"background": {"imageUrl": "asset://../../x.png"}}, {"header": {"enabled": "ya"}}, {"frame": []}, []):
        with pytest.raises(layout.LayoutError):
            layout.clean_layout(bad)


def test_effective_layout_merges_sections():
    bt = {"layout_settings": {"safeZone": "all", "mode": "podcast", "frame": {"y": 120, "ratio": "source"},
                              "header": {"fontSize": 34}}}
    clip = {"layout_style": {"frame": {"y": 160}, "header": {"align": "left"}}}
    assert layout.effective_layout(clip, bt) == {
        "mode": "podcast", "frame": {"y": 160, "ratio": "source"}, "header": {"fontSize": 34, "align": "left"}}
    assert layout.effective_layout({"layout_style": {"mode": "full"}}, bt)["mode"] == "full"
    assert layout.effective_layout(None, None) == {}


def test_template_layout_is_validated(client, db):
    tpl = client.post("/api/brand-templates", json={"name": "Podcast"}).json()["brand_template"]
    r = client.put(f"/api/brand-templates/{tpl['id']}", json={"layout_settings": {
        "safeZone": "tiktok", "mode": "podcast", "frame": {"y": 150, "bogus": 1}, "background": {"type": "gradient"}}})
    assert r.status_code == 200
    assert r.json()["brand_template"]["layout_settings"] == {
        "mode": "podcast", "safeZone": "tiktok", "frame": {"y": 150}, "background": {"type": "gradient"}}
    r = client.put(f"/api/brand-templates/{tpl['id']}", json={"layout_settings": {"mode": "landscape"}})
    assert r.status_code == 400 and "Mode layout" in r.json()["detail"]


def test_clip_layout_override_and_title(client, db, paths):
    agent = client.post("/api/agents", json={"name": "Podcast"}).json()["agent"]
    tpl_id = agent["default_brand_template_id"]
    client.put(f"/api/brand-templates/{tpl_id}", json={"layout_settings": {"safeZone": "all", "mode": "podcast"}})
    clip = _clip(db, paths)
    db.clips.update_one({"_id": clip["_id"]}, {"$set": {"agent_id": agent["id"]}})

    r = client.put(f"/api/clips/{clip['_id']}/subtitles", json={"layout": {"frame": {"y": 170}}, "hook_text": "  Judul   baru  "})
    assert r.status_code == 200
    body = r.json()["clip"]
    assert body["layout_style"] == {"frame": {"y": 170}} and body["hook_text"] == "Judul baru"
    d = client.get(f"/api/clips/{clip['_id']}").json()
    assert d["effective_layout"] == {"mode": "podcast", "frame": {"y": 170}} and d["channel"] == ""

    assert client.put(f"/api/clips/{clip['_id']}/subtitles", json={"layout": {"frame": {"ratio": "9:21"}}}).status_code == 400
    client.put(f"/api/clips/{clip['_id']}/subtitles", json={"reset_layout": True})
    assert db.clips.find_one({"_id": clip["_id"]})["layout_style"] == {}
    # Saving other fields leaves the title alone
    client.put(f"/api/clips/{clip['_id']}/subtitles", json={"words": []})
    assert db.clips.find_one({"_id": clip["_id"]})["hook_text"] == "Judul baru"


def test_build_props_podcast(db, paths):
    sv_id = new_id()
    db.source_videos.insert_one({"_id": sv_id, "job_id": "j", "agent_id": None, "youtube_id": "yt123",
                                 "title": "Video", "channel_name": "Podcast Kita", "created_at": utcnow()})
    tpl_id = new_id()
    db.brand_templates.insert_one({"_id": tpl_id, "name": "P", "created_at": utcnow(), "updated_at": utcnow(),
                                   "brand_settings": {}, "caption_settings": {}, "ai_settings": {},
                                   "layout_settings": {"safeZone": "all", "mode": "podcast",
                                                       "background": {"type": "image", "imageUrl": "asset://library/_brand/x/bg.png"}}})
    clip = _clip(db, paths, source=True, source_video_id=sv_id)
    db.clips.update_one({"_id": clip["_id"]}, {"$set": {"brand_template_id": tpl_id}})
    clip = db.clips.find_one({"_id": clip["_id"]})

    props = render.build_props(clip)
    assert props["layout"]["mode"] == "podcast" and "safeZone" not in props["layout"]
    assert props["layout"]["background"]["imageUrl"].startswith(f"{config.base_url}/api/files/library/_brand/x/bg.png")
    assert props["sourceUrl"] == f"{config.base_url}/api/clips/{clip['_id']}/media/source?token={config.token}"
    assert props["sourceAspect"] == pytest.approx(16 / 9, abs=1e-4)
    assert props["title"] == "Rahasia yang jarang orang tahu" and props["channel"] == "Podcast Kita"

    # Full layout (or no source yet): the render stays on raw.mp4
    db.clips.update_one({"_id": clip["_id"]}, {"$set": {"layout_style": {"mode": "full"}}})
    props = render.build_props(db.clips.find_one({"_id": clip["_id"]}))
    assert "sourceUrl" not in props and props["layout"]["mode"] == "full"


def test_source_media_route(client, db, paths):
    with_source = _clip(db, paths, source=True)
    r = client.get(f"/api/clips/{with_source['_id']}/media/source")
    assert r.status_code == 200 and r.content == b"source"
    without = _clip(db, paths)
    assert client.get(f"/api/clips/{without['_id']}/media/source").status_code == 404


def _fake_video(out: Path, size: str = "320x240") -> Path:
    from backend.core.config import ffmpeg_path

    out.parent.mkdir(parents=True, exist_ok=True)
    procs.run([ffmpeg_path(), "-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
               f"testsrc=size={size}:rate=10:duration=1", "-c:v", "libx264", "-preset", "ultrafast",
               "-pix_fmt", "yuv420p", str(out)], timeout=60)
    return out


def test_prepare_source_from_youtube(client, db, paths, monkeypatch):
    from backend.agents.tools import ytdlp

    calls: list[tuple] = []

    def fake_download(youtube_id, start, end, out_path, cancel=None):
        calls.append((youtube_id, start, end))
        return _fake_video(out_path)

    monkeypatch.setattr(ytdlp, "download_section", fake_download)
    clip = _clip(db, paths)
    r = client.post(f"/api/clips/{clip['_id']}/source")
    assert r.status_code == 200
    body = r.json()["clip"]
    assert calls == [("yt123", 754.0, 799.5)]  # the clip's exact edges, like raw.mp4
    assert body["files"]["source"] == clip["files"]["raw"].replace("raw.mp4", "source.mp4")
    assert (body["source_width"], body["source_height"]) == (320, 240)
    assert paths.from_relative(body["files"]["source"]).stat().st_size > 0
    # Already there: nothing is fetched again
    client.post(f"/api/clips/{clip['_id']}/source")
    assert len(calls) == 1
    assert not list(paths.cache_dir.glob("source-*"))


def test_prepare_source_from_the_uploaded_file(db, paths, tmp_path):
    video = _fake_video(tmp_path / "unggahan ü.mp4", "200x200")
    sv_id = new_id()
    db.source_videos.insert_one({"_id": sv_id, "job_id": "j", "agent_id": None, "youtube_id": None, "title": "u",
                                 "file_path": str(video), "created_at": utcnow()})
    clip = _clip(db, paths, source_video_id=sv_id, youtube_id=None)
    db.clips.update_one({"_id": clip["_id"]}, {"$set": {"start_time": 0.2, "end_time": 0.8}})
    updated = layout.prepare_source(db.clips.find_one({"_id": clip["_id"]}), procs.CancelToken())
    assert (updated["source_width"], updated["source_height"]) == (200, 200)

    # The upload was moved away: a clear Indonesian error
    other = _clip(db, paths, source_video_id=sv_id, youtube_id=None)
    video.unlink()
    with pytest.raises(layout.SourceError, match="File video asli tidak ditemukan"):
        layout.prepare_source(other)


def test_podcast_render_fails_clearly_without_a_source(db, paths, monkeypatch):
    seen: list[dict] = []
    monkeypatch.setattr(render.events, "publish", seen.append)

    def no_youtube(*a, **k):
        raise RuntimeError("HTTP Error 403")

    from backend.agents.tools import ytdlp

    monkeypatch.setattr(ytdlp, "download_section", no_youtube)
    clip = _clip(db, paths)
    db.clips.update_one({"_id": clip["_id"]}, {"$set": {"layout_style": {"mode": "podcast"}}})
    rid = new_id()
    db.render_jobs.insert_one({"_id": rid, "clip_id": clip["_id"], "status": "queued", "progress_pct": 0,
                               "created_at": utcnow()})
    render.run_render(rid, procs.CancelToken())
    rj = db.render_jobs.find_one({"_id": rid})
    assert rj["status"] == "failed"
    assert rj["error"].startswith("Layout podcast butuh video sumber: Video sumber gagal diunduh dari YouTube")
    assert any(e.get("message") == "Menyiapkan video sumber…" for e in seen)


def test_background_image_asset_is_kept_while_used(client, paths):
    tpl = client.post("/api/brand-templates", json={"name": "Latar"}).json()["brand_template"]
    asset = client.post(f"/api/brand-templates/{tpl['id']}/assets", files={"file": ("bg.png", b"PNG", "image/png")},
                        data={"kind": "background"}).json()
    client.put(f"/api/brand-templates/{tpl['id']}", json={"layout_settings": {
        "mode": "podcast", "background": {"type": "image", "imageUrl": asset["value"]}}})
    dup = client.post("/api/brand-templates", json={"name": "Dup", "copy_from": tpl["id"]}).json()["brand_template"]
    client.delete(f"/api/brand-templates/{tpl['id']}")
    assert paths.from_relative(asset["path"]).exists()  # the duplicate still uses it
    client.delete(f"/api/brand-templates/{dup['id']}")
    assert not paths.from_relative(asset["path"]).exists()


# -- card mode, dynamic zoom, speaker tag ------------------------------------------------------------

def test_clean_layout_card_zoom_and_speaker():
    out = layout.clean_layout({
        "mode": "card",
        "card": {"name": "Klip Bisnis", "handle": "@klipbisnis", "avatarUrl": "", "color": "#16181C", "radius": 99},
        "zoom": {"enabled": True, "style": "sentences", "amount": 0.9},
        "speaker": {"enabled": True, "name": "dr. Andi", "role": "Dokter", "y": 999, "align": "center",
                    "duration": 0.2, "accent": "#FACC15", "extra": 1},
    })
    assert out == {
        "mode": "card",
        "card": {"name": "Klip Bisnis", "handle": "@klipbisnis", "avatarUrl": "", "color": "#16181C", "radius": 40},
        "zoom": {"enabled": True, "style": "sentences", "amount": 0.3},
        "speaker": {"enabled": True, "name": "dr. Andi", "role": "Dokter", "y": 503, "align": "center",
                    "duration": 1, "accent": "#FACC15"},
    }
    for bad in ({"zoom": {"style": "pulse"}}, {"zoom": {"enabled": 1}}, {"speaker": {"align": "right"}},
                {"speaker": {"color": "kuning"}}, {"card": {"avatarUrl": "C:/a.png"}}, {"card": {"name": 5}}):
        with pytest.raises(layout.LayoutError):
            layout.clean_layout(bad)
    assert layout.needs_source({"mode": "card"}) and layout.needs_source({"mode": "podcast"})
    assert not layout.needs_source({"mode": "full"}) and not layout.needs_source({})


def test_clip_speaker_override_merges_with_the_template():
    bt = {"layout_settings": {"speaker": {"enabled": True, "accent": "#22C55E"}, "zoom": {"enabled": True}}}
    clip = {"layout_style": {"speaker": {"name": "Rina", "role": "Psikolog"}}}
    assert layout.effective_layout(clip, bt) == {
        "speaker": {"enabled": True, "accent": "#22C55E", "name": "Rina", "role": "Psikolog"},
        "zoom": {"enabled": True}}


def test_build_props_card_uses_the_source(db, paths):
    clip = _clip(db, paths, source=True)
    db.clips.update_one({"_id": clip["_id"]}, {"$set": {"layout_style": {
        "mode": "card", "card": {"avatarUrl": "asset://library/_brand/x/avatar.png"}}}})
    props = render.build_props(db.clips.find_one({"_id": clip["_id"]}))
    assert props["sourceUrl"].endswith(f"/api/clips/{clip['_id']}/media/source?token={config.token}")
    assert props["layout"]["card"]["avatarUrl"].startswith(f"{config.base_url}/api/files/library/_brand/x/avatar.png")


def test_card_render_fails_clearly_without_a_source(db, paths, monkeypatch):
    from backend.agents.tools import ytdlp

    monkeypatch.setattr(render.events, "publish", lambda e: None)
    monkeypatch.setattr(ytdlp, "download_section", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("HTTP Error 403")))
    clip = _clip(db, paths)
    db.clips.update_one({"_id": clip["_id"]}, {"$set": {"layout_style": {"mode": "card"}}})
    rid = new_id()
    db.render_jobs.insert_one({"_id": rid, "clip_id": clip["_id"], "status": "queued", "progress_pct": 0,
                               "created_at": utcnow()})
    render.run_render(rid, procs.CancelToken())
    assert db.render_jobs.find_one({"_id": rid})["error"].startswith("Layout kartu butuh video sumber")


def test_speaker_names_must_appear_in_the_source():
    from backend.agents.tools.speaker_ai import _tokens, grounded

    hay = set(_tokens("Dr. Andi Pratama bongkar mitos diet | Podcast Sehat — kata Bu Rina"))
    assert grounded("dr. Andi Pratama", hay) and grounded("Rina", hay) and grounded("Andi", hay)
    assert not grounded("Budi Santoso", hay)  # never mentioned
    assert not grounded("dr. Budi", hay)
    assert not grounded("Dr.", hay)  # an honorific alone proves nothing


def test_speaker_suggest_endpoint(client, db, paths, monkeypatch):
    from backend.agents.tools import speaker_ai
    from backend.core import llm

    sv_id = new_id()
    db.source_videos.insert_one({"_id": sv_id, "job_id": "j", "agent_id": None, "youtube_id": "yt123",
                                 "title": "dr. Andi Pratama: Cara Diet yang Benar", "channel_name": "Podcast Sehat",
                                 "created_at": utcnow()})
    clip = _clip(db, paths, source_video_id=sv_id)
    db.clips.update_one({"_id": clip["_id"]}, {"$set": {"subtitle": {"words": [
        {"word": "Halo", "start": 0, "end": 0.3}, {"word": "Rina,", "start": 0.3, "end": 0.6}]}}})
    seen: dict = {}

    def fake_chat(system, user, **kw):
        seen["user"] = user
        return {"speakers": [
            {"name": "dr. Andi Pratama", "role": "  Dokter   gizi "},
            {"name": "Budi Santoso", "role": "Host"},  # not in the title, channel or words: dropped
            {"name": "DR. ANDI PRATAMA", "role": ""},  # duplicate
            {"name": "Rina", "role": "x" * 80},
            "bukan objek",
        ]}

    monkeypatch.setattr(speaker_ai.llm, "chat_json", fake_chat)
    r = client.post(f"/api/clips/{clip['_id']}/speaker/suggest")
    assert r.status_code == 200, r.text
    assert r.json()["speakers"] == [{"name": "dr. Andi Pratama", "role": "Dokter gizi"}, {"name": "Rina", "role": "x" * 40}]
    assert "Podcast Sehat" in seen["user"] and "Halo Rina," in seen["user"]

    def boom(*a, **kw):
        raise llm.LLMNotConfigured("API key LLM belum diisi di Pengaturan")

    monkeypatch.setattr(speaker_ai.llm, "chat_json", boom)
    r = client.post(f"/api/clips/{clip['_id']}/speaker/suggest")
    assert r.status_code == 400 and "API key LLM" in r.text
    bare = _clip(db, paths, youtube_id=None)
    assert client.post(f"/api/clips/{bare['_id']}/speaker/suggest").status_code == 400


# -- split layout (companion video) ------------------------------------------------------------------

def test_clean_layout_companion():
    out = layout.clean_layout({
        "mode": "split",
        "companion": {"videoUrl": "asset://library/_brand/x/companion-1.mp4", "duration": 42.5, "position": "top",
                      "split": 0.9, "focusY": -1, "divider": 3, "dividerColor": "#FFFFFF", "junk": 1},
    })
    assert out == {"mode": "split", "companion": {
        "videoUrl": "asset://library/_brand/x/companion-1.mp4", "duration": 42.5, "position": "top",
        "split": 0.65, "focusY": 0, "divider": 3, "dividerColor": "#FFFFFF"}}
    for bad in ({"companion": {"position": "left"}}, {"companion": {"videoUrl": "D:/gameplay.mp4"}},
                {"companion": {"split": "half"}}):
        with pytest.raises(layout.LayoutError):
            layout.clean_layout(bad)
    assert not layout.needs_source({"mode": "split"})  # the speaker part is the face-tracked raw.mp4


def test_companion_problem(paths):
    assert layout.companion_problem({"mode": "full"}) is None
    assert "belum punya video" in layout.companion_problem({"mode": "split"})
    rel = "library/_brand/t/companion-1.mp4"
    split = {"mode": "split", "companion": {"videoUrl": f"asset://{rel}", "duration": 10}}
    assert "tidak ditemukan" in layout.companion_problem(split)
    f = paths.from_relative(rel)
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_bytes(b"mp4")
    assert layout.companion_problem(split) is None
    assert "Durasi" in layout.companion_problem({"mode": "split", "companion": {"videoUrl": f"asset://{rel}"}})
    assert "tidak ditemukan" in layout.companion_problem(
        {"mode": "split", "companion": {"videoUrl": "asset://../luar.mp4", "duration": 3}})


def test_split_render_fails_clearly_without_a_companion(db, paths, monkeypatch):
    monkeypatch.setattr(render.events, "publish", lambda e: None)
    clip = _clip(db, paths)
    db.clips.update_one({"_id": clip["_id"]}, {"$set": {"layout_style": {"mode": "split"}}})
    rid = new_id()
    db.render_jobs.insert_one({"_id": rid, "clip_id": clip["_id"], "status": "queued", "progress_pct": 0,
                               "created_at": utcnow()})
    render.run_render(rid, procs.CancelToken())
    rj = db.render_jobs.find_one({"_id": rid})
    assert rj["status"] == "failed"
    assert rj["error"].startswith("Layout video pendamping belum punya video")
    assert db.clips.find_one({"_id": clip["_id"]})["status"] == "ready"


def test_build_props_split(db, paths):
    clip = _clip(db, paths)
    db.clips.update_one({"_id": clip["_id"]}, {"$set": {"layout_style": {
        "mode": "split", "companion": {"videoUrl": "asset://library/_brand/x/companion-1.mp4", "duration": 30}}}})
    props = render.build_props(db.clips.find_one({"_id": clip["_id"]}))
    assert props["clipId"] == clip["_id"]
    assert props["videoUrl"].endswith(f"/api/clips/{clip['_id']}/media/raw?token={config.token}")
    assert "sourceUrl" not in props
    assert props["layout"]["companion"]["videoUrl"].startswith(f"{config.base_url}/api/files/library/_brand/x/companion-1.mp4")


def test_companion_upload_is_converted(client, paths, tmp_path):
    from backend.agents.tools import ffmpeg_ops
    from backend.core.config import ffmpeg_path

    src = tmp_path / "gameplay.mov"
    procs.run([ffmpeg_path(), "-y", "-hide_banner", "-loglevel", "error",
               "-f", "lavfi", "-i", "testsrc=size=1600x1200:rate=60:duration=2",
               "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
               "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(src)],
              timeout=120)
    tpl = client.post("/api/brand-templates", json={"name": "Gameplay"}).json()["brand_template"]
    r = client.post(f"/api/brand-templates/{tpl['id']}/assets",
                    files={"file": ("gameplay.mov", src.read_bytes(), "video/quicktime")}, data={"kind": "companion"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["value"].startswith(f"asset://library/_brand/{tpl['id']}/companion-") and body["value"].endswith(".mp4")
    assert 1.9 <= body["duration"] <= 2.1
    out = paths.from_relative(body["path"])
    info = ffmpeg_ops.probe_media(out)
    assert info and not info["has_audio"]
    assert (info["width"], info["height"]) == (1440, 1080)  # short side capped at 1080
    probe = procs.run([ffmpeg_path(), "-hide_banner", "-i", str(out)], timeout=60, check=False).stderr.decode("utf-8", "replace")
    assert "30 fps" in probe
    assert not list(paths.cache_dir.glob("upload-*"))  # the raw upload is not kept
    assert len([f for f in out.parent.iterdir() if f.is_file()]) == 1

    # Not a video, or unreadable
    r = client.post(f"/api/brand-templates/{tpl['id']}/assets", files={"file": ("a.png", b"PNG", "image/png")},
                    data={"kind": "companion"})
    assert r.status_code == 400 and "MP4, MOV atau WEBM" in r.json()["detail"]
    r = client.post(f"/api/brand-templates/{tpl['id']}/assets", files={"file": ("rusak.mp4", b"bukan video", "video/mp4")},
                    data={"kind": "companion"})
    assert r.status_code == 400 and "tidak bisa dibaca" in r.json()["detail"]
    assert not list(paths.cache_dir.glob("upload-*"))
