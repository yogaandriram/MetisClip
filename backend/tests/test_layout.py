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
