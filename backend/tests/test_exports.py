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
                     "export_error": None}]

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
