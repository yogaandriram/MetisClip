"""The data folder (QA finding 8, 2026-11-19): restoring a database backup, the engine side of moving the
data folder ("Pindahkan Lokasi Data"), and the database credentials file staying private after the
folder was copied by hand."""
from __future__ import annotations

import dataclasses
import gzip
import os
import subprocess
from pathlib import Path

import pytest
from bson import json_util
from bson.json_util import CANONICAL_JSON_OPTIONS
from fastapi.testclient import TestClient

from backend.core import db as dbm
from backend.core.config import config
from backend.core.db import latest_schema_version, new_id, utcnow
from backend.core.paths import get_paths, set_paths
from backend.services import activity, backup, data_move


@pytest.fixture()
def own_data_root(paths, tmp_path):
    """A data folder of its own, so backups of other tests never mix in."""
    p = dataclasses.replace(paths, data_root=tmp_path / "data root ü")
    p.ensure()
    set_paths(p)
    yield p
    set_paths(paths)


@pytest.fixture()
def client(db, secrets):
    from backend.main import create_app

    with TestClient(create_app()) as c:
        c.headers.update({"Authorization": f"Bearer {config.token}"})
        yield c


def _campaign(db, name):
    doc = {"_id": new_id(), "name": name, "client": "", "status": "active", "slug": name.lower().replace(" ", "-"),
           "sources": [], "brief": {}, "draft": None, "version": 1, "created_at": utcnow(), "updated_at": utcnow()}
    db.campaigns.insert_one(doc)
    return doc


def _write_backup_file(path: Path, schema: int, collections: dict[str, list[dict]]) -> None:
    """A backup as an older MetisClip wrote it."""
    body = {"meta": {"app": "metisclip", "app_version": "0.1.0", "schema_version": schema, "reason": "daily",
                     "created_at": "2026-11-12T10:00:00Z"},
            "collections": collections}
    with gzip.open(path, "wt", encoding="utf-8") as f:
        f.write(json_util.dumps(body, json_options=CANONICAL_JSON_OPTIONS))


# ---------------------------------------------------------------------------
# Restore
# ---------------------------------------------------------------------------

def test_a_restore_puts_the_database_back_and_keeps_a_way_back(db, own_data_root):
    kept = _campaign(db, "Tetap Ada")
    deleted_later = _campaign(db, "Terhapus Nanti")
    made = backup.write_backup("manual")

    db.campaigns.delete_one({"_id": deleted_later["_id"]})
    added_later = _campaign(db, "Dibuat Setelah Backup")
    db.campaigns.update_one({"_id": kept["_id"]}, {"$set": {"name": "Diganti"}})

    result = backup.restore_backup(made["name"])

    names = sorted(c["name"] for c in db.campaigns.find())
    assert names == ["Terhapus Nanti", "Tetap Ada"]
    assert db.campaigns.find_one({"_id": added_later["_id"]}) is None
    assert isinstance(db.campaigns.find_one({"_id": kept["_id"]})["created_at"], type(utcnow()))
    assert result["restored"]["name"] == made["name"]
    assert result["restored"]["documents"] >= 2
    # The state before the restore is a backup of its own, and the restored file is still there
    safety = result["safety_backup"]["name"]
    listed = [b["name"] for b in backup.list_backups()]
    assert safety in listed and made["name"] in listed
    meta, colls = backup.read_backup(get_paths().backups_dir / safety)
    assert meta["reason"] == "pre-restore"
    assert sorted(c["name"] for c in colls["campaigns"]) == ["Dibuat Setelah Backup", "Diganti"]
    # Indexes and validators of this version stay
    assert any(ix.get("key", {}).get("slug") for ix in db.campaigns.list_indexes())
    assert db.command("listCollections", filter={"name": "campaigns"})["cursor"]["firstBatch"][0]["options"].get("validator")


def test_the_backup_being_restored_survives_the_rotation(db, own_data_root):
    first = backup.write_backup("manual")
    os.utime(get_paths().backups_dir / first["name"], (1_000_000_000, 1_000_000_000))  # the oldest
    for i in range(backup.KEEP - 1):
        path = get_paths().backups_dir / f"metisclip-2026111{i}-1000.json.gz"
        _write_backup_file(path, latest_schema_version(), {"meta": [{"_id": "schema", "version": latest_schema_version()}]})
        os.utime(path, (1_500_000_000 + i, 1_500_000_000 + i))
    assert len(backup.list_backups()) == backup.KEEP

    backup.restore_backup(first["name"])

    names = [b["name"] for b in backup.list_backups()]
    assert first["name"] in names
    assert len(names) == backup.KEEP + 1  # the oldest one stays only because it was restored


def test_a_restore_keeps_the_usual_number_of_backups(db, own_data_root):
    for i in range(backup.KEEP):
        path = get_paths().backups_dir / f"metisclip-2026111{i}-1000.json.gz"
        _write_backup_file(path, latest_schema_version(), {"meta": [{"_id": "schema", "version": latest_schema_version()}]})
        os.utime(path, (1_500_000_000 + i, 1_500_000_000 + i))
    newest = "metisclip-20261114-1000.json.gz"

    backup.restore_backup(newest)

    names = [b["name"] for b in backup.list_backups()]
    assert len(names) == backup.KEEP
    assert newest in names and "metisclip-20261110-1000.json.gz" not in names


def test_an_older_backup_is_migrated_after_the_restore(db, own_data_root):
    """A backup from before migration 012 gets that migration: its lone dashes are no caption words."""
    older = latest_schema_version() - 1
    clip_id = new_id()
    words = [{"word": "-", "start": 0.0, "end": 0.2}, {"word": "Halo", "start": 0.2, "end": 0.5}]
    path = get_paths().backups_dir / "metisclip-20261112-1000.json.gz"
    _write_backup_file(path, older, {
        "meta": [{"_id": "schema", "version": older}],
        "clips": [{"_id": clip_id, "campaign_id": new_id(), "job_id": new_id(), "status": "ready",
                   "subtitle": {"words": words}, "created_at": utcnow(), "updated_at": utcnow()}],
    })

    result = backup.restore_backup(path.name)

    assert result["restored"]["schema_version"] == older
    assert dbm.schema_version(db) == latest_schema_version()
    assert [w["word"] for w in db.clips.find_one({"_id": clip_id})["subtitle"]["words"]] == ["Halo"]
    # The restore wrote one backup (the state before it), not a second one before the migration
    assert [b["name"] for b in backup.list_backups()].count(result["safety_backup"]["name"]) == 1
    assert len(backup.list_backups()) == 2


def test_running_work_in_a_backup_becomes_resumable(db, own_data_root):
    running, waiting, clip_id = new_id(), new_id(), new_id()
    db.discovery_jobs.insert_many([
        {"_id": running, "source": {"type": "url"}, "config": {}, "status": "running", "checkpoint": {}, "errors": [],
         "activity": {"message": "Analisis", "at": utcnow()}, "created_at": utcnow()},
        {"_id": waiting, "source": {"type": "url"}, "config": {}, "status": "pending", "checkpoint": {}, "errors": [],
         "created_at": utcnow()},
    ])
    db.clips.insert_one({"_id": clip_id, "status": "rendering", "files": {"final": None}, "start_time": 100.0,
                         "end_time": 150.0, "created_at": utcnow()})
    db.render_jobs.insert_one({"_id": new_id(), "clip_id": clip_id, "status": "rendering", "progress_pct": 40,
                               "created_at": utcnow()})
    made = backup.write_backup("manual")
    db.discovery_jobs.update_many({}, {"$set": {"status": "completed"}})
    db.render_jobs.update_many({}, {"$set": {"status": "completed"}})

    backup.restore_backup(made["name"])

    for jid in (running, waiting):
        job = db.discovery_jobs.find_one({"_id": jid})
        assert job["status"] == "interrupted"
        assert job["activity"] is None
        assert "saat backup dibuat" in job["errors"][-1]["message"]
    assert db.render_jobs.find_one({"clip_id": clip_id})["status"] == "failed"
    assert db.clips.find_one({"_id": clip_id})["status"] == "ready"


def test_a_restore_waits_until_nothing_runs(db, own_data_root):
    made = backup.write_backup("manual")
    db.discovery_jobs.insert_one({"_id": new_id(), "source": {"type": "url"}, "config": {}, "status": "running",
                                  "checkpoint": {}, "errors": [], "created_at": utcnow()})
    db.campaigns.insert_one({**_campaign(db, "Brief"), "_id": new_id(), "slug": "brief-2",
                             "parse": {"status": "running"}})

    with pytest.raises(backup.BackupError) as err:
        backup.restore_backup(made["name"])

    assert err.value.status == 409
    assert str(err.value) == ("Masih ada yang berjalan: 1 job clip, 1 pembacaan brief. "
                              "Tunggu sampai selesai atau batalkan dulu, lalu coba lagi.")
    assert db.campaigns.count_documents({}) == 2  # nothing restored


def test_backups_from_a_newer_version_or_elsewhere_are_refused(db, own_data_root):
    newer = get_paths().backups_dir / "metisclip-20261201-0900.json.gz"
    _write_backup_file(newer, latest_schema_version() + 1, {})
    with pytest.raises(backup.BackupError) as err:
        backup.restore_backup(newer.name)
    assert err.value.status == 409 and "lebih baru" in str(err.value)

    broken = get_paths().backups_dir / "metisclip-20261201-0901.json.gz"
    broken.write_bytes(b"not gzip")
    with pytest.raises(backup.BackupError, match="tidak bisa dibaca"):
        backup.restore_backup(broken.name)

    for name in ("..\\..\\x.json.gz", "metisclip-1.json", "other.json.gz", "metisclip-20261201-0902.json.gz"):
        with pytest.raises(backup.BackupError) as err:
            backup.restore_backup(name)
        assert err.value.status == 404


def test_restore_and_activity_through_the_api(client, db, own_data_root):
    _campaign(db, "Lewat API")
    made = client.post("/api/system/backup").json()["backup"]
    db.campaigns.delete_many({})

    assert client.get("/api/system/activity").json() == {"busy": False, "items": [], "message": None}
    res = client.post(f"/api/system/backups/{made['name']}/restore")
    assert res.status_code == 200, res.text
    assert [c["name"] for c in db.campaigns.find()] == ["Lewat API"]

    db.render_jobs.insert_one({"_id": new_id(), "clip_id": new_id(), "status": "queued", "created_at": utcnow()})
    busy = client.get("/api/system/activity").json()
    assert busy["busy"] is True and busy["items"] == [{"kind": "renders", "count": 1}]
    res = client.post(f"/api/system/backups/{made['name']}/restore")
    assert res.status_code == 409 and "1 ekspor video" in res.json()["detail"]
    assert client.post("/api/system/backups/nope.json.gz/restore").status_code == 404


def test_activity_names_every_kind_in_english(db, monkeypatch):
    from backend.agents.tools import whisper_local
    from backend.core import i18n

    monkeypatch.setattr(whisper_local, "active_downloads", lambda: 1)
    db.brand_templates.insert_one({"_id": new_id(), "campaign_id": new_id(), "name": "T", "design": {"status": "running"},
                                   "created_at": utcnow()})
    i18n.set_language("en")
    st = activity.status()
    assert st["items"] == [{"kind": "designs", "count": 1}, {"kind": "downloads", "count": 1}]
    assert st["message"] == ("Still running: 1 AI template design(s), 1 Whisper model download(s). "
                             "Wait for it to finish or cancel it first, then try again.")


# ---------------------------------------------------------------------------
# Moving the data folder (engine side)
# ---------------------------------------------------------------------------

def test_moved_path_only_follows_paths_inside_the_old_folder():
    old, new = r"D:\MetisClip", r"E:\Data\MetisClip"
    assert data_move.moved_path(r"D:\MetisClip\exports\tiktok", old, new) == r"E:\Data\MetisClip\exports\tiktok"
    assert data_move.moved_path(r"d:/metisclip/library/x.mp4", old, new) == r"E:\Data\MetisClip\library\x.mp4"
    assert data_move.moved_path(r"D:\MetisClip", old, new) == r"E:\Data\MetisClip"
    assert data_move.moved_path(r"D:\MetisClip2\video.mp4", old, new) is None
    assert data_move.moved_path(r"C:\Users\Budi\Videos\podcast.mp4", old, new) is None
    assert data_move.moved_path("", old, new) is None
    assert data_move.moved_path(None, old, new) is None


def test_the_first_start_after_a_move_points_stored_paths_at_the_new_folder(db):
    old, new = r"D:\MetisClip", r"E:\MetisClip"
    db.app_settings.update_one({"_id": "settings"}, {"$set": {"export_dir": r"D:\MetisClip\exports\tiktok",
                                                              "ytdlp": {"cookies_file": r"C:\cookies.txt"}}}, upsert=True)
    inside, outside = new_id(), new_id()
    db.source_videos.insert_many([
        {"_id": inside, "job_id": new_id(), "file_path": r"D:\MetisClip\uploads\a.mp4", "status": "completed",
         "created_at": utcnow()},
        {"_id": outside, "job_id": new_id(), "file_path": r"C:\Videos\b.mp4", "status": "completed",
         "created_at": utcnow()},
    ])
    db.discovery_jobs.insert_one({"_id": new_id(), "source": {"type": "local_file",
                                                              "local_file_path": r"D:\MetisClip\uploads\a.mp4"},
                                  "config": {}, "status": "completed", "checkpoint": {}, "errors": [], "created_at": utcnow()})
    rid = new_id()
    db.render_jobs.insert_one({"_id": rid, "clip_id": new_id(), "status": "completed", "created_at": utcnow(),
                               "output_path": r"D:\MetisClip\library\c\x\final.mp4",
                               "exported_path": r"D:\MetisClip\exports\Judul - abcd1234.mp4",
                               "export_dir": r"D:\MetisClip\exports"})

    assert data_move.rewrite_paths(old, new) == 6
    assert data_move.rewrite_paths(old, new) == 0  # a second start changes nothing

    s = db.app_settings.find_one({"_id": "settings"})
    assert s["export_dir"] == r"E:\MetisClip\exports\tiktok"
    assert s["ytdlp"]["cookies_file"] == r"C:\cookies.txt"
    assert db.source_videos.find_one({"_id": inside})["file_path"] == r"E:\MetisClip\uploads\a.mp4"
    assert db.source_videos.find_one({"_id": outside})["file_path"] == r"C:\Videos\b.mp4"
    assert db.discovery_jobs.find_one()["source"]["local_file_path"] == r"E:\MetisClip\uploads\a.mp4"
    r = db.render_jobs.find_one({"_id": rid})
    assert (r["output_path"], r["exported_path"], r["export_dir"]) == (
        r"E:\MetisClip\library\c\x\final.mp4", r"E:\MetisClip\exports\Judul - abcd1234.mp4", r"E:\MetisClip\exports")


# ---------------------------------------------------------------------------
# The database credentials file stays private
# ---------------------------------------------------------------------------

INHERITED = (
    "C:\\Users\\x\\scratchpad\\data\\.metisclip\\db-credentials.json NT AUTHORITY\\SYSTEM:(I)(F)\r\n"
    "                                   BUILTIN\\Administrators:(I)(F)\r\n"
    "                                   DESKTOP-UJI01\\Pengguna Uji:(I)(F)\r\n"
    "\r\n"
    "Successfully processed 1 files; Failed processing 0 files\r\n"
)
PRIVATE = (
    "C:\\Users\\Pengguna Uji\\MetisClip\\.metisclip\\db-credentials.json DESKTOP-UJI01\\Pengguna Uji:(F)\r\n"
    "\r\n"
    "Berhasil memproses 1 file; Gagal memproses 0 file\r\n"
)


def test_icacls_output_tells_a_private_file_from_a_copied_one():
    assert dbm.acl_entries(INHERITED) == ["(I)(F)", "(I)(F)", "(I)(F)"]
    assert not dbm.acl_is_private(INHERITED)
    assert dbm.acl_entries(PRIVATE) == ["(F)"]
    assert dbm.acl_is_private(PRIVATE)
    # An explicit entry for someone else next to ours is not private either
    assert not dbm.acl_is_private(PRIVATE.replace(":(F)\r\n", ":(F)\r\n   Everyone:(R)\r\n", 1))


@pytest.mark.skipif(os.name != "nt", reason="Windows access lists")
def test_a_copied_credentials_file_is_made_private_again(tmp_path):
    f = tmp_path / "copied ü" / "db-credentials.json"
    f.parent.mkdir()
    f.write_text('{"username": "metisclip", "password": "x"}', encoding="utf-8")  # inherits the folder's entries

    def acl() -> str:
        return subprocess.run(["icacls", str(f)], capture_output=True).stdout.decode("utf-8", "replace")

    assert not dbm.acl_is_private(acl())
    assert dbm.ensure_private(f) is True
    assert dbm.acl_is_private(acl())
    assert dbm.ensure_private(f) is False  # already private: left alone
    assert f.read_text(encoding="utf-8").startswith("{")  # still readable by this user


# ---------------------------------------------------------------------------
# The data folder itself: only this Windows account
# ---------------------------------------------------------------------------

ME = "S-1-5-21-522631399-1311164166-3349481265-1001"
DRIVE_D = ("D:(A;;FA;;;BA)(A;OICIIO;GA;;;BA)(A;;FA;;;SY)(A;OICIIO;GA;;;SY)(A;;0x1301bf;;;AU)"
           "(A;OICIIO;SDGXGWGR;;;AU)(A;;0x1200a9;;;BU)(A;OICIIO;GXGR;;;BU)")
IN_PROFILE = f"MetisClip\r\nD:(A;OICIID;FA;;;SY)(A;OICIID;FA;;;BA)(A;OICIID;FA;;;{ME})\r\n"
RESTRICTED = f"mc\r\nD:PAI(A;OICI;FA;;;{ME})(A;OICI;FA;;;BA)(A;OICI;FA;;;SY)\r\n"


def test_sddl_tells_a_shared_folder_from_a_private_one():
    from backend.core import acl

    d = acl.parse_sddl(DRIVE_D)
    assert not d.protected and "S-1-5-18" in d.allowed and "S-1-5-11" in d.allowed  # Authenticated Users
    assert not acl.is_private(d, ME)
    profile = acl.parse_sddl(IN_PROFILE)
    assert not profile.protected and acl.is_private(profile, ME)
    restricted = acl.parse_sddl(RESTRICTED)
    assert restricted.protected and acl.is_private(restricted, ME)
    assert not acl.is_private(restricted, "S-1-5-21-1-2-3-1002")  # another account's folder
    # A deny entry for someone else does not let them in
    assert acl.is_private(acl.parse_sddl(RESTRICTED.replace("D:PAI", "D:PAI(D;OICI;FA;;;WD)")), ME)
    assert acl.parse_sddl("no dacl here") is None


@pytest.mark.skipif(os.name != "nt", reason="Windows access lists")
def test_a_shared_data_folder_is_restricted_to_this_account(tmp_path):
    from backend.core import acl

    root = tmp_path / "data root ü"
    (root / "library" / "c1" / "clip1").mkdir(parents=True)
    clip = root / "library" / "c1" / "clip1" / "raw.mp4"
    clip.write_bytes(b"video")
    # What a folder on another drive inherits: every account of the PC may read it
    subprocess.run(["icacls", str(root), "/grant", "*S-1-5-32-545:(OI)(CI)RX"], capture_output=True, check=True)
    assert acl.status(root) == "shared"
    assert "S-1-5-32-545" in acl.read_dacl(clip).allowed

    assert acl.restrict_data_root(root) is True
    assert acl.status(root) == "private"
    dacl = acl.read_dacl(root)
    assert dacl.protected and sorted(dacl.allowed) == sorted([acl.SYSTEM, acl.ADMINISTRATORS, acl.current_user_sid()])
    assert "S-1-5-32-545" not in acl.read_dacl(clip).allowed  # the files inside follow
    assert clip.read_bytes() == b"video"
    assert acl.restrict_data_root(root) is False  # done once


@pytest.mark.skipif(os.name != "nt", reason="Windows access lists")
def test_a_folder_in_the_profile_and_one_set_by_hand_are_left_alone(tmp_path):
    from backend.core import acl

    plain = tmp_path / "in profile"
    plain.mkdir()  # tmp_path lives under the user profile: private through inheritance
    assert acl.status(plain) == "private" and acl.restrict_data_root(plain) is False
    assert not acl.read_dacl(plain).protected  # untouched

    by_hand = tmp_path / "shared on purpose"
    by_hand.mkdir()
    subprocess.run(["icacls", str(by_hand), "/inheritance:r", "/grant:r", "*S-1-1-0:(OI)(CI)RX",
                    f"*{acl.current_user_sid()}:(OI)(CI)F"], capture_output=True, check=True)
    assert acl.status(by_hand) == "shared" and acl.restrict_data_root(by_hand) is False


def test_storage_reports_who_may_open_the_data_folder(client, own_data_root):
    r = client.get("/api/system/storage")
    assert r.status_code == 200
    assert r.json()["access"] in (("private", "shared") if os.name == "nt" else ("unknown",))
