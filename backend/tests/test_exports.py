"""A finished render is copied to the export folder; "Ekspor ke…" uses the same rules and file name."""
from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.core.config import config
from backend.core.db import new_id
from backend.core.settings_store import update_settings
from backend.models.documents import ClipDoc, RenderJobDoc
from backend.services import exports, render


@pytest.fixture()
def events_seen(monkeypatch):
    seen: list[dict] = []
    monkeypatch.setattr(render.events, "publish", seen.append)
    return seen


def _clip(db, paths, hook="Rahasia kaya: jangan /\\ boros!") -> dict:
    cid = new_id()
    raw = paths.library_dir / "podcast" / cid / "raw.mp4"
    raw.parent.mkdir(parents=True)
    raw.write_bytes(b"raw")
    doc = ClipDoc(_id=cid, job_id=None, source_video_id=None, youtube_id="x", start_time=0,
                  end_time=10, duration_seconds=10, hook_text=hook, status="rendering",
                  files={"raw": paths.to_relative(raw)}).to_mongo()
    db.clips.insert_one(doc)
    return doc


def _render_job(db, clip_id: str) -> str:
    rid = new_id()
    db.render_jobs.insert_one({**RenderJobDoc(_id=rid, clip_id=clip_id).to_mongo(), "status": "rendering"})
    return rid


def _rendered(paths, data: bytes):
    out = paths.cache_dir / f"render-{new_id()}" / "final.mp4"
    out.parent.mkdir(parents=True)
    out.write_bytes(data)
    return out


def test_finished_render_is_copied_to_the_export_folder(db, paths, tmp_path, events_seen):
    dest = (tmp_path / "Ekspor ü").resolve()
    update_settings({"export_dir": str(dest)})
    clip = _clip(db, paths)
    rid = _render_job(db, clip["_id"])

    render._finish(rid, clip, _rendered(paths, b"video-1"))

    final = (paths.library_dir / "podcast" / clip["_id"] / "final.mp4").resolve()
    copy = dest / f"Rahasia kaya jangan  boros - {clip['_id'][:8]}.mp4"
    assert final.read_bytes() == b"video-1" and copy.read_bytes() == b"video-1"
    assert sorted(p.name for p in dest.iterdir()) == [copy.name]  # no .part left behind

    rj = db.render_jobs.find_one({"_id": rid})
    assert rj["status"] == "completed" and rj["progress_pct"] == 100
    assert Path(rj["output_path"]).resolve() == final and rj["exported_path"] == str(copy)
    assert rj["export_dir"] == str(dest) and rj["export_error"] is None
    assert db.clips.find_one({"_id": clip["_id"]})["files"]["final"] == paths.to_relative(final)

    done = [e for e in events_seen if e["type"] == "render.status"]
    assert done == [{"type": "render.status", "id": rid, "clip_id": clip["_id"], "status": "completed",
                     "output_path": rj["output_path"], "exported_path": str(copy), "export_dir": str(dest),
                     "export_error": None, "loudness": None}]

    # A re-render of the same clip replaces its copy instead of adding a second file
    render._finish(_render_job(db, clip["_id"]), clip, _rendered(paths, b"video-2"))
    assert [p.name for p in dest.iterdir()] == [copy.name] and copy.read_bytes() == b"video-2"


def test_render_completes_when_the_copy_fails(db, paths, events_seen):
    update_settings({"export_dir": str(paths.private_dir)})  # not allowed as a destination
    clip = _clip(db, paths, hook="")
    rid = _render_job(db, clip["_id"])

    render._finish(rid, clip, _rendered(paths, b"video"))

    rj = db.render_jobs.find_one({"_id": rid})
    assert rj["status"] == "completed" and rj["exported_path"] is None
    assert rj["export_error"] == "Folder tujuan tidak diizinkan"
    assert (paths.library_dir / "podcast" / clip["_id"] / "final.mp4").read_bytes() == b"video"
    assert db.clips.find_one({"_id": clip["_id"]})["status"] == "exported"
    assert events_seen[-1]["status"] == "completed" and events_seen[-1]["export_error"] == "Folder tujuan tidak diizinkan"


def test_copy_failure_has_an_indonesian_message(db, paths, tmp_path, monkeypatch):
    clip = _clip(db, paths)
    final = paths.library_dir / "podcast" / clip["_id"] / "final.mp4"
    final.write_bytes(b"v")
    clip["files"]["final"] = paths.to_relative(final)

    def locked(src, dst):
        raise PermissionError(13, "Access is denied")

    monkeypatch.setattr(exports.shutil, "copyfile", locked)
    with pytest.raises(exports.ExportError, match="sedang dibuka aplikasi lain"):
        exports.copy_final(clip, exports.check_dest(tmp_path))
    assert list(tmp_path.iterdir()) == []


def test_export_route(db, paths, secrets, tmp_path):
    from backend.main import create_app

    done = _clip(db, paths, hook="Satu")
    final = paths.library_dir / "podcast" / done["_id"] / "final.mp4"
    final.write_bytes(b"v")
    db.clips.update_one({"_id": done["_id"]}, {"$set": {"files.final": paths.to_relative(final)}})
    not_rendered = _clip(db, paths, hook="Dua")

    with TestClient(create_app()) as c:
        c.headers.update({"Authorization": f"Bearer {config.token}"})
        r = c.post("/api/clips/export", json={"clip_ids": [done["_id"], not_rendered["_id"], "nope"],
                                               "dest_dir": str(tmp_path / "pilihan")}).json()
        assert r["dest_dir"] == str((tmp_path / "pilihan").resolve())
        assert r["exported"] == [{"clip_id": done["_id"],
                                  "path": str((tmp_path / "pilihan").resolve() / f"Satu - {done['_id'][:8]}.mp4")}]
        assert [s["reason"] for s in r["skipped"]] == ["Belum dirender", "Klip tidak ditemukan"]

        for bad in (paths.private_dir, paths.db_dir / "x", paths.cache_dir / "y", paths.data_root):
            res = c.post("/api/clips/export", json={"clip_ids": [done["_id"]], "dest_dir": str(bad)})
            assert res.status_code == 400 and res.json()["detail"] == "Folder tujuan tidak diizinkan", bad
        assert not (paths.db_dir / "x").exists() and not (paths.cache_dir / "y").exists()


# -- the gallery: a lean list and bulk actions ---------------------------------------------------------------


@pytest.fixture()
def client(db, secrets):
    from backend.main import create_app

    with TestClient(create_app()) as c:
        c.headers.update({"Authorization": f"Bearer {config.token}"})
        yield c


def _ready(db, paths, hook: str, *, raw: bool = True, words: int = 0, source_video_id: str | None = None) -> dict:
    doc = _clip(db, paths, hook)
    upd: dict = {"status": "ready", "source_video_id": source_video_id,
                 "subtitle": {"words": [{"word": f"w{i}", "start": i, "end": i + 0.5} for i in range(words)]}}
    if not raw:
        upd["files"] = {"raw": None}
    db.clips.update_one({"_id": doc["_id"]}, {"$set": upd})
    return {**doc, **upd}


def test_the_clip_list_leaves_out_the_words(client, db, paths):
    from backend.core.db import utcnow

    db.source_videos.insert_one({"_id": "sv-1", "job_id": "job-1", "title": "Podcast Bisnis Eps 12", "created_at": utcnow()})
    a = _ready(db, paths, "Satu", words=3, source_video_id="sv-1")
    b = _ready(db, paths, "Dua")
    listed = client.get("/api/clips").json()["clips"]
    by_id = {c["id"]: c for c in listed}
    assert "subtitle_data" not in by_id[a["_id"]]
    assert by_id[a["_id"]]["word_count"] == 3 and by_id[a["_id"]]["source_title"] == "Podcast Bisnis Eps 12"
    assert by_id[b["_id"]]["word_count"] == 0 and by_id[b["_id"]]["source_title"] == ""
    assert len(client.get("/api/clips", params={"limit": 1}).json()["clips"]) == 1
    # The editor still gets them
    assert len(client.get(f"/api/clips/{a['_id']}").json()["clip"]["subtitle_data"]["words"]) == 3


def test_several_clips_are_rendered_and_deleted_at_once(client, db, paths, monkeypatch):
    from backend.api.routes import clips as clips_route

    submitted: list[str] = []
    monkeypatch.setattr(clips_route.runner, "submit_render", submitted.append)
    a, b = _ready(db, paths, "Satu"), _ready(db, paths, "Dua")
    no_raw = _ready(db, paths, "Belum ada video", raw=False)
    deleted_by_hand = _ready(db, paths, "Filenya dihapus")
    (paths.library_dir / "podcast" / deleted_by_hand["_id"] / "raw.mp4").unlink()
    r = client.post("/api/clips/render", json={"clip_ids": [a["_id"], no_raw["_id"], b["_id"], a["_id"], "hilang",
                                                            deleted_by_hand["_id"]]})
    assert r.status_code == 200, r.text
    data = r.json()
    assert [j["clip_id"] for j in data["render_jobs"]] == [a["_id"], b["_id"]] and len(submitted) == 2
    assert [s["clip_id"] for s in data["skipped"]] == [no_raw["_id"], "hilang", deleted_by_hand["_id"]]
    assert data["skipped"][2]["reason"] == "File video mentah klip ini tidak ada di folder data"
    # Asking again keeps the queued renders instead of adding more
    again = client.post("/api/clips/render", json={"clip_ids": [a["_id"]]}).json()
    assert again["render_jobs"][0]["id"] == data["render_jobs"][0]["id"] and len(submitted) == 2

    cancelled: list[str] = []
    monkeypatch.setattr(clips_route.runner, "cancel_render", cancelled.append)
    folder = paths.library_dir / "podcast" / a["_id"]
    r = client.post("/api/clips/delete", json={"clip_ids": [a["_id"], b["_id"], "hilang"]})
    assert r.json() == {"deleted": [a["_id"], b["_id"]], "missing": ["hilang"]}
    assert db.clips.count_documents({"_id": {"$in": [a["_id"], b["_id"]]}}) == 0 and not folder.exists()
    assert sorted(cancelled) == sorted(j["id"] for j in data["render_jobs"])
    assert client.post("/api/clips/delete", json={"clip_ids": []}).status_code == 422


def test_a_full_disk_stops_queueing_the_rest(client, db, paths, monkeypatch):
    from backend.api.routes import clips as clips_route
    from backend.core import disk

    monkeypatch.setattr(clips_route.runner, "submit_render", lambda rid: None)
    clips = [_ready(db, paths, f"K{i}") for i in range(3)]

    def full(need: int = 0):
        raise disk.DiskFull("Ruang disk hampir habis")

    monkeypatch.setattr(clips_route.disk, "check", full)
    data = client.post("/api/clips/render", json={"clip_ids": [c["_id"] for c in clips]}).json()
    assert data["render_jobs"] == [] and [s["clip_id"] for s in data["skipped"]] == [c["_id"] for c in clips]
    assert {s["reason"] for s in data["skipped"]} == {"Ruang disk hampir habis"}


def _video(path: Path, seconds: int = 2) -> Path:
    """A real H.264 test picture (its frames differ over time), so ffmpeg can take frames from it."""
    import subprocess

    from backend.agents.tools.ffmpeg_ops import ffmpeg_path

    path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([ffmpeg_path(), "-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
                    f"testsrc=size=108x192:rate=30:duration={seconds}", "-c:v", "libx264", "-preset", "ultrafast",
                    "-pix_fmt", "yuv420p", str(path)], check=True)
    return path


def test_a_chosen_cover_is_the_thumbnail_and_the_exported_picture(client, db, paths, tmp_path, events_seen):
    dest = (tmp_path / "Ekspor").resolve()
    update_settings({"export_dir": str(dest)})
    clip = _clip(db, paths, "Sampul")
    folder = paths.from_relative(clip["files"]["raw"]).parent
    _video(folder / "raw.mp4")
    db.clips.update_one({"_id": clip["_id"]}, {"$set": {"duration_seconds": 2, "status": "ready"}})
    url = f"/api/clips/{clip['_id']}/cover"

    # Outside the clip: refused
    assert client.put(url, json={"time": 5}).status_code == 400

    # A frame of raw.mp4 becomes the thumbnail (a new file, so a shared hard link keeps its own)
    linked = tmp_path / "other-campaign-thumb.jpg"
    first = client.put(url, json={"time": 0.2}).json()["clip"]
    thumb = paths.from_relative(first["files"]["thumbnail"])
    import os

    os.link(thumb, linked)
    assert first["cover_time"] == 0.2
    second = client.put(url, json={"time": 1.5}).json()["clip"]
    assert second["cover_time"] == 1.5 and thumb.read_bytes() != linked.read_bytes()

    # The render takes the same moment from final.mp4 (the composition's output frame) as the cover,
    # and the export copies it next to the video
    doc = db.clips.find_one({"_id": clip["_id"]})
    render._finish(_render_job(db, clip["_id"]), doc, _video(paths.cache_dir / f"render-{new_id()}" / "final.mp4"), {"cover_frame": 40})
    after = db.clips.find_one({"_id": clip["_id"]})
    cover = paths.from_relative(after["files"]["cover"])
    assert cover.name == "cover.jpg" and cover.stat().st_size > 0
    video = dest / f"Sampul - {clip['_id'][:8]}.mp4"
    assert video.exists() and video.with_suffix(".jpg").read_bytes() == cover.read_bytes()
    assert client.get(f"/api/clips/{clip['_id']}").json()["clip"]["files"]["cover"] == after["files"]["cover"]

    # A new choice: the old cover no longer matches and goes until the next render
    third = client.put(url, json={"time": None}).json()["clip"]
    assert third["cover_time"] is None and third["files"]["cover"] is None and not cover.exists()

    # A render without a chosen cover makes none (and copies none)
    video.with_suffix(".jpg").unlink()
    doc = db.clips.find_one({"_id": clip["_id"]})
    render._finish(_render_job(db, clip["_id"]), doc, _video(paths.cache_dir / f"render-{new_id()}" / "final.mp4"), {"cover_frame": 40})
    assert db.clips.find_one({"_id": clip["_id"]})["files"]["cover"] is None
    assert not cover.exists() and not video.with_suffix(".jpg").exists()


def test_a_cover_changed_during_an_old_render_waits_for_the_next_one(db, paths, events_seen):
    # A worker that reported no kept frames: the new choice cannot be mapped to a frame of the video
    clip = _clip(db, paths, "Ganti")
    db.clips.update_one({"_id": clip["_id"]}, {"$set": {"cover_time": 1.0}})
    rendered_with = db.clips.find_one({"_id": clip["_id"]})
    db.clips.update_one({"_id": clip["_id"]}, {"$set": {"cover_time": 0.5}})  # chosen while it rendered
    render._finish(_render_job(db, clip["_id"]), rendered_with, _video(paths.cache_dir / f"render-{new_id()}" / "final.mp4"), {"cover_frame": 30})
    assert db.clips.find_one({"_id": clip["_id"]})["files"]["cover"] is None


def test_the_render_props_carry_the_chosen_cover(db, paths):
    clip = _clip(db, paths, "Props")
    assert "coverTime" not in render.build_props(clip)
    assert render.build_props({**clip, "cover_time": 3.25})["coverTime"] == 3.25


def test_the_editor_gets_the_source_video_and_a_link_to_the_moment(client, db, paths, tmp_path):
    from backend.core.db import utcnow

    db.source_videos.insert_many([
        {"_id": "sv-yt", "job_id": "j", "youtube_id": "abc123", "title": "Podcast 12", "channel_name": "Kanal",
         "duration_seconds": 3600, "created_at": utcnow()},
        {"_id": "sv-file", "job_id": "j", "youtube_id": None, "file_path": str(tmp_path / "rekaman ü.mp4"),
         "title": "rekaman ü.mp4", "duration_seconds": 600, "created_at": utcnow()},
    ])
    yt = _clip(db, paths, "YouTube")
    db.clips.update_one({"_id": yt["_id"]}, {"$set": {"source_video_id": "sv-yt", "youtube_id": "abc123", "start_time": 754.6}})
    info = client.get(f"/api/clips/{yt['_id']}").json()["source_video"]
    assert info["youtube_url"] == "https://www.youtube.com/watch?v=abc123"
    assert info["youtube_url_at"] == "https://www.youtube.com/watch?v=abc123&t=754s"
    assert (info["title"], info["channel"], info["file_path"], info["file_exists"]) == ("Podcast 12", "Kanal", None, False)

    up = _clip(db, paths, "Upload")
    db.clips.update_one({"_id": up["_id"]}, {"$set": {"source_video_id": "sv-file", "youtube_id": None}})
    info = client.get(f"/api/clips/{up['_id']}").json()["source_video"]
    assert info["youtube_url"] is None and info["youtube_url_at"] is None and info["file_exists"] is False
    (tmp_path / "rekaman ü.mp4").write_bytes(b"x")
    assert client.get(f"/api/clips/{up['_id']}").json()["source_video"]["file_exists"] is True


# The kept frames and cover frames of render-engine/src/Root.tsx for a 10 s clip whose 3 s pause and
# filler word are cut (selectComposition on the bundle, 2026-11-20)
CUT_FRAMES = [[0, 0, 65], [65, 146, 210], [129, 225, 300]]


@pytest.mark.parametrize(("frames", "total", "time", "frame"), [
    ([[0, 0, 300]], 300, 6, 180),
    (CUT_FRAMES, 204, 6, 99),
    (CUT_FRAMES, 204, 3, 65),     # inside the pause: the next kept frame
    (CUT_FRAMES, 204, 7.2, 129),  # inside the filler word
    (CUT_FRAMES, 204, 9.9, 201),
    (CUT_FRAMES, 204, 30, 203),   # past the end: the last frame
    ([], 300, 1.25, 38),          # JavaScript rounds 37.5 up (Python's round() would give 38 too, 36.5 -> 36)
    ([], 300, 1.2167, 37),
])
def test_a_cover_maps_to_the_same_output_frame_as_the_composition(frames, total, time, frame):
    assert render.output_frame_at(frames, total, time) == frame


def test_the_render_fingerprint_follows_the_picture_not_the_launch_or_the_cover(db, paths, monkeypatch):
    clip = _clip(db, paths, "Sidik")
    props = render.build_props(clip)
    base = render.fingerprint(props)
    assert render.fingerprint({**props, "coverTime": 4.0}) == base
    # Another launch: another port and token in every media URL
    monkeypatch.setattr(type(config), "base_url", property(lambda self: "http://127.0.0.1:61234"))
    monkeypatch.setattr(config, "token", "another-launch-token")
    assert render.fingerprint(render.build_props(clip)) == base
    assert render.fingerprint(render.build_props({**clip, "hook_text": "Judul lain"})) != base
    words = [{"word": "Halo", "start": 0.0, "end": 0.4}]
    assert render.fingerprint(render.build_props({**clip, "subtitle": {"words": words}})) != base
    assert render.fingerprint(render.build_props({**clip, "subtitle_style": {"mode": "karaoke"}})) != base


def test_an_unchanged_clip_is_exported_again_without_a_render(client, db, paths, tmp_path, monkeypatch, events_seen):
    from backend.api.routes import clips as clips_route

    submitted: list[str] = []
    monkeypatch.setattr(clips_route.runner, "submit_render", submitted.append)
    dest = (tmp_path / "Ekspor").resolve()
    update_settings({"export_dir": str(dest)})
    clip = _clip(db, paths, "Salin lagi")
    _video(paths.from_relative(clip["files"]["raw"]), seconds=10)
    db.clips.update_one({"_id": clip["_id"]}, {"$set": {"status": "ready"}})
    url = f"/api/clips/{clip['_id']}/render"

    # Never rendered: a reuse request renders
    first = client.post(url, json={"reuse": True}).json()["render_job"]
    assert first["status"] == "queued" and not first["reused"] and submitted == [first["id"]]
    doc = db.clips.find_one({"_id": clip["_id"]})
    db.render_jobs.update_one({"_id": first["id"]}, {"$set": {"status": "rendering"}})
    render._finish(first["id"], doc, _video(paths.cache_dir / f"render-{new_id()}" / "final.mp4", 7),
                   {"cover_frame": None, "frames": CUT_FRAMES, "total_frames": 204},
                   render.fingerprint(render.build_props(doc)))
    assert render.final_current(db.clips.find_one({"_id": clip["_id"]}))
    video = dest / f"Salin lagi - {clip['_id'][:8]}.mp4"
    video.unlink()

    # Nothing changed: copied again at once, no render
    again = client.post(url, json={"reuse": True}).json()["render_job"]
    assert again["status"] == "completed" and again["reused"] and again["exported_path"] == str(video)
    assert video.exists() and len(submitted) == 1
    assert db.render_jobs.find_one({"_id": again["id"]})["reused"] is True
    # Without `reuse` (the editor's "Render ulang") it renders
    forced = client.post(url).json()["render_job"]
    assert forced["status"] == "queued" and not forced["reused"] and len(submitted) == 2
    db.render_jobs.update_one({"_id": forced["id"]}, {"$set": {"status": "cancelled"}})

    # A cover chosen after the render is taken from final.mp4 at once (7.2 s is in the cut filler: frame 129)
    chosen = client.put(f"/api/clips/{clip['_id']}/cover", json={"time": 7.2}).json()["clip"]
    cover = paths.from_relative(chosen["files"]["cover"])
    assert cover.is_file() and db.clips.find_one({"_id": clip["_id"]})["final_render"]["cover_time"] == 7.2
    assert render.final_current(db.clips.find_one({"_id": clip["_id"]}))  # a cover needs no render
    taken = cover.read_bytes()
    render._make_cover({"_id": clip["_id"], "cover_time": 7.2}, paths.from_relative(chosen["files"]["final"]), 129)
    assert cover.read_bytes() == taken
    # ... and the next export copies it next to the video, still without a render
    third = client.post(url, json={"reuse": True}).json()["render_job"]
    assert third["reused"] and video.with_suffix(".jpg").read_bytes() == taken and len(submitted) == 2

    # An edit since the render: the video no longer matches, so it renders again
    words = [{"word": "Baru", "start": 0.0, "end": 0.5}]
    assert client.put(f"/api/clips/{clip['_id']}/subtitles", json={"words": words}).status_code == 200
    assert not render.final_current(db.clips.find_one({"_id": clip["_id"]}))
    fourth = client.post(url, json={"reuse": True}).json()["render_job"]
    assert fourth["status"] == "queued" and not fourth["reused"] and len(submitted) == 3


def test_several_unchanged_clips_are_copied_and_the_others_rendered(client, db, paths, tmp_path, monkeypatch, events_seen):
    from backend.api.routes import clips as clips_route

    submitted: list[str] = []
    monkeypatch.setattr(clips_route.runner, "submit_render", submitted.append)
    update_settings({"export_dir": str((tmp_path / "Ekspor").resolve())})
    done, edited, fresh = (_clip(db, paths, name) for name in ("Sudah", "Diedit", "Baru"))
    for clip in (done, edited):
        render._finish(_render_job(db, clip["_id"]), clip, _rendered(paths, b"video"), {},
                       render.fingerprint(render.build_props(clip)))
    db.clips.update_one({"_id": edited["_id"]}, {"$set": {"hook_text": "Judul baru"}})
    ids = [done["_id"], edited["_id"], fresh["_id"]]
    data = client.post("/api/clips/render", json={"clip_ids": ids, "reuse": True}).json()
    jobs = {j["clip_id"]: j for j in data["render_jobs"]}
    assert jobs[done["_id"]]["reused"] and jobs[done["_id"]]["status"] == "completed"
    assert [jobs[c]["status"] for c in (edited["_id"], fresh["_id"])] == ["queued", "queued"] and len(submitted) == 2


def test_a_cover_changed_during_the_render_is_taken_from_the_new_video(db, paths, events_seen):
    clip = _clip(db, paths, "Ganti")
    db.clips.update_one({"_id": clip["_id"]}, {"$set": {"cover_time": 1.0}})
    rendered_with = db.clips.find_one({"_id": clip["_id"]})
    db.clips.update_one({"_id": clip["_id"]}, {"$set": {"cover_time": 0.5}})  # chosen while it rendered
    render._finish(_render_job(db, clip["_id"]), rendered_with, _video(paths.cache_dir / f"render-{new_id()}" / "final.mp4"),
                   {"cover_frame": 30, "frames": [[0, 0, 60]], "total_frames": 60})
    after = db.clips.find_one({"_id": clip["_id"]})
    assert after["files"]["cover"] and after["final_render"]["cover_time"] == 0.5
