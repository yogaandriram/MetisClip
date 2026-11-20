"""1:1 and 16:9 exports and the export quality: the layout's format, the render props,
the source and face scan a render prepares first, the export's file name, and the quality settings."""
from __future__ import annotations

import pytest

from backend.core import procs
from backend.core.config import config
from backend.core.db import new_id, utcnow
from backend.core.settings_store import SettingsError, update_settings
from backend.models.documents import ClipDoc, RenderJobDoc
from backend.services import exports, layout, render


def _clip(db, paths, *, source: bool = True, style: dict | None = None) -> dict:
    cid = new_id()
    folder = paths.library_dir / "format" / cid
    folder.mkdir(parents=True)
    (folder / "raw.mp4").write_bytes(b"raw")
    files = {"raw": paths.to_relative(folder / "raw.mp4")}
    if source:
        (folder / "source.mp4").write_bytes(b"source")
        files["source"] = paths.to_relative(folder / "source.mp4")
    doc = ClipDoc(_id=cid, job_id=None, source_video_id=None, youtube_id="yt123", start_time=754.0, end_time=764.0,
                  duration_seconds=10.0, hook_text="Format baru", status="ready", files=files,
                  source_width=1920 if source else None, source_height=1080 if source else None,
                  layout_style=style or {}).to_mongo()
    db.clips.insert_one(doc)
    return doc


def _faces_doc() -> dict:
    from backend.agents.tools import faces

    two = [[0.3, 0.42, 0.09, 0.16, 0.9], [0.7, 0.4, 0.09, 0.15, 0.9]]
    return {"version": faces.VERSION, "width": 1920, "height": 1080, "fps": 25.0, "frames": 100, "interval": 5,
            "samples": [[i / 25, two] for i in range(0, 100, 5)], "cuts": []}


@pytest.fixture()
def events_seen(monkeypatch):
    seen: list[dict] = []
    monkeypatch.setattr(render.events, "publish", seen.append)
    return seen


@pytest.fixture()
def worker(monkeypatch):
    """The render worker replaced: records its command line and fails, so no render ever runs in tests."""
    calls: list[list[str]] = []

    def stub(cmd, *a, **k):
        calls.append(cmd)
        return "stub worker", False, {}

    monkeypatch.setattr(render, "_run_worker", stub)
    monkeypatch.setattr(render.Path, "exists", lambda self: True if self.name == "render.js" else _exists(self))
    return calls


_exists = render.Path.exists


def _render(db, clip) -> dict:
    rid = new_id()
    db.render_jobs.insert_one({**RenderJobDoc(_id=rid, clip_id=clip["_id"]).to_mongo(), "status": "queued"})
    render.run_render(rid, procs.CancelToken())  # fails at the stub worker, after the preparation
    return db.render_jobs.find_one({"_id": rid})


def test_a_clip_takes_a_format_and_a_template_stays_9_16():
    assert layout.clean_layout({"format": "square", "mode": "podcast"}) == {"mode": "podcast", "format": "square"}
    assert layout.clean_layout({"format": "landscape", "safeZone": "all"}, keep_safe_zone=True) == {"safeZone": "all"}
    with pytest.raises(layout.LayoutError):
        layout.clean_layout({"format": "4:3"})
    assert layout.merge({"mode": "duo"}, {"format": "square"}) == {"mode": "duo", "format": "square"}
    assert layout.merge({"format": "square"}, {"format": "vertical"})["format"] == "vertical"
    assert layout.output_format({}) == "vertical" and layout.output_format({"format": "nope"}) == "vertical"
    # 1:1 and 16:9 always show source.mp4; the duo panels (and their face scan requirement) are 9:16 only
    assert layout.needs_source({"format": "landscape"}) and not layout.needs_source({"format": "vertical"})
    assert layout.needs_faces({"mode": "duo"}) and not layout.needs_faces({"mode": "duo", "format": "square"})


def test_build_props_of_a_square_clip_use_the_source_and_its_shots(db, paths):
    from backend.agents.tools import faces

    clip = _clip(db, paths, style={"format": "square"})
    props = render.build_props(clip)
    assert props["layout"]["format"] == "square"
    assert props["sourceUrl"] == f"{config.base_url}/api/clips/{clip['_id']}/media/source?token={config.token}"
    assert props["sourceAspect"] == pytest.approx(16 / 9, abs=1e-4)
    assert "scenes" not in props  # no face scan yet: the crop points at the center
    dest = faces.save(_faces_doc(), paths.from_relative(clip["files"]["source"]).parent / "faces.json")
    db.clips.update_one({"_id": clip["_id"]}, {"$set": {"files.faces": paths.to_relative(dest)}})
    props = render.build_props(db.clips.find_one({"_id": clip["_id"]}))
    assert [s["kind"] for s in props["scenes"]["shots"]] == ["duo"]


def test_a_square_render_fails_clearly_without_a_source(db, paths, monkeypatch, events_seen, worker):
    from backend.agents.tools import ytdlp

    def no_youtube(*a, **k):
        raise RuntimeError("HTTP Error 403")

    monkeypatch.setattr(ytdlp, "download_section", no_youtube)
    rj = _render(db, _clip(db, paths, source=False, style={"format": "square", "mode": "full"}))
    assert rj["status"] == "failed"
    assert rj["error"].startswith("Format 1:1 butuh video sumber: Video sumber gagal diunduh dari YouTube")


def test_a_landscape_render_scans_the_faces_first_and_goes_on_without_them(db, paths, monkeypatch, events_seen, worker):
    from backend.agents.tools import faces

    monkeypatch.setattr(faces, "scan", lambda video, cancel=None: _faces_doc())
    clip = _clip(db, paths, style={"format": "landscape", "mode": "duo"})
    rj = _render(db, clip)
    assert any(e.get("message") == "Menganalisis wajah…" for e in events_seen)
    assert db.clips.find_one({"_id": clip["_id"]})["files"]["faces"].endswith("/faces.json")
    assert rj["error"] == "stub worker"  # got as far as the worker
    cmd = worker[-1]
    assert cmd[cmd.index("--crf") + 1] == "18" and cmd[cmd.index("--scale") + 1] == "1.0000000"

    def broken(video, cancel=None):
        raise RuntimeError("model missing")

    monkeypatch.setattr(faces, "scan", broken)
    update_settings({"export": {"quality": "small"}})
    rj = _render(db, _clip(db, paths, style={"format": "landscape"}))
    assert rj["error"] == "stub worker"  # a failed scan centers the crop instead of failing
    cmd = worker[-1]
    assert cmd[cmd.index("--crf") + 1] == "23" and cmd[cmd.index("--scale") + 1] == "0.6666667"


def test_a_square_export_gets_its_own_name(db, paths, events_seen, tmp_path):
    clip = _clip(db, paths, style={"format": "square"})
    assert exports.file_name(clip) == f"Format baru - {clip['_id'][:8]}.mp4"
    assert exports.file_name({**clip, "final_render": {"format": "square"}}).endswith(" 1x1.mp4")
    assert exports.file_name({**clip, "final_render": {"format": "landscape"}}).endswith(" 16x9.mp4")

    update_settings({"export_dir": str(tmp_path / "out")})
    out = paths.cache_dir / f"render-{new_id()}" / "final.mp4"
    out.parent.mkdir(parents=True)
    out.write_bytes(b"video")
    rid = new_id()
    db.render_jobs.insert_one({**RenderJobDoc(_id=rid, clip_id=clip["_id"]).to_mongo(), "status": "rendering"})
    render._finish(rid, clip, out, {}, "fp", None, {"format": "square", "quality": "small"})
    rj = db.render_jobs.find_one({"_id": rid})
    assert rj["exported_path"].endswith(f"Format baru - {clip['_id'][:8]} 1x1.mp4")
    assert (rj["format"], rj["quality"]) == ("square", "small")
    final_render = db.clips.find_one({"_id": clip["_id"]})["final_render"]
    assert (final_render["format"], final_render["quality"]) == ("square", "small")


def test_the_export_quality(db, paths, events_seen):
    assert render.quality_now() == "standard"
    assert render.quality_args("standard") == ["--crf", "18", "--scale", "1.0000000", "--jpeg-quality", "90"]
    assert render.quality_args("small") == ["--crf", "23", "--scale", "0.6666667", "--jpeg-quality", "85"]
    with pytest.raises(SettingsError):
        update_settings({"export": {"quality": "ultra"}})

    clip = _clip(db, paths)
    props = render.build_props(clip)
    assert render.fingerprint(props, True, "high") != render.fingerprint(props, True, "standard")
    out = paths.cache_dir / f"render-{new_id()}" / "final.mp4"
    out.parent.mkdir(parents=True)
    out.write_bytes(b"video")
    rid = new_id()
    db.render_jobs.insert_one({**RenderJobDoc(_id=rid, clip_id=clip["_id"]).to_mongo(), "status": "rendering"})
    render._finish(rid, clip, out, {}, render.fingerprint(props), None)
    assert render.final_current(db.clips.find_one({"_id": clip["_id"]}))
    update_settings({"export": {"quality": "small"}})
    assert not render.final_current(db.clips.find_one({"_id": clip["_id"]}))
    # Switching the clip to 1:1 renders it again too
    update_settings({"export": {"quality": "standard"}})
    db.clips.update_one({"_id": clip["_id"]}, {"$set": {"layout_style": {"format": "square"}}})
    assert not render.final_current(db.clips.find_one({"_id": clip["_id"]}))


def test_the_brief_credit_shows_in_a_square_video():
    from backend.services import brief_check
    from backend.services.campaigns import clean_brief

    campaign = {"_id": "c1", "version": 1, "brief": clean_brief({"visual": {"credit": "required"}})}
    tpl = {"layout_settings": {"mode": "full", "credit": {"enabled": True}}}
    clip = {"duration_seconds": 45, "subtitle": {"words": []}, "brief_manual": {}}
    credit = lambda c: {i["id"]: i for i in brief_check.check(c, campaign, tpl, "Kanal")["items"]}["credit"]["status"]
    assert credit(clip) == "fail"  # the full 9:16 layout shows no credit
    assert credit({**clip, "layout_style": {"format": "square"}}) == "ok"
