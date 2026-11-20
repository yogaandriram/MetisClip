"""The cache folder: running work is never deleted, leftovers go at start and once the cache is over its limit."""
from __future__ import annotations

import dataclasses
import os
import time

import pytest
from fastapi.testclient import TestClient

from backend.core import cache
from backend.core.config import config
from backend.core.paths import set_paths
from backend.core.settings_store import update_settings

MB = 1024**2


@pytest.fixture()
def own_cache(paths, tmp_path):
    p = dataclasses.replace(paths, data_root=tmp_path / "data ü")
    p.ensure()
    set_paths(p)
    yield p.cache_dir
    set_paths(paths)


def _leftover(cache_dir, name: str, mb: float, age_s: float) -> None:
    """A folder with one file of `mb`, last written `age_s` seconds ago."""
    d = cache_dir / name
    (d / "sub").mkdir(parents=True)
    f = d / "sub" / "part.bin"
    f.write_bytes(b"\0" * int(mb * MB))
    t = time.time() - age_s
    for p in (f, d / "sub", d):
        os.utime(p, (t, t))


def test_a_claimed_folder_lives_until_its_step_releases_it(own_cache):
    work = cache.claim("render-abc")
    assert work == own_cache / "render-abc" and work.is_dir()
    (work / "props.json").write_text("{}", encoding="utf-8")
    assert cache.sweep(None)["removed"] == 0
    assert (work / "props.json").exists()
    cache.release(work)
    assert not work.exists()
    # released: the name is free again, a later leftover with it goes
    _leftover(own_cache, "render-abc", 0.1, 10)
    assert cache.sweep(None)["removed"] == 1


def test_a_claimed_file_and_a_claim_deep_inside_a_folder_are_kept(own_cache):
    upload = cache.claim("upload-1.mp4", folder=False)
    upload.write_bytes(b"x" * 10)
    brief = cache.claim(os.path.join("brief", "campaign-1"))
    (brief / "page-1.png").write_bytes(b"png")
    _leftover(own_cache, "whisper-dead", 0.2, 60)

    res = cache.sweep(None)
    assert res["removed"] == 1 and res["freed_bytes"] == int(0.2 * MB)
    assert upload.exists() and (brief / "page-1.png").exists()
    assert not (own_cache / "whisper-dead").exists()

    cache.release(upload)
    cache.release(brief)
    assert not upload.exists() and not brief.exists()
    assert (own_cache / "brief").is_dir()  # the shared parent is a leftover now
    assert cache.sweep(None)["removed"] == 1


def test_two_steps_sharing_a_folder_keep_it_until_both_are_done(own_cache):
    # Two jobs on the same video transcribe into the same transcript folder
    a = cache.claim("transcript-yt-abc")
    b = cache.claim("transcript-yt-abc")
    (a / "chunks").mkdir()
    cache.release(b)  # the first one done leaves the files to the other
    assert (a / "chunks").is_dir()
    assert cache.sweep(None)["removed"] == 0
    cache.release(a)
    assert not a.exists()


def test_over_the_limit_the_oldest_leftovers_go_until_it_fits(own_cache):
    _leftover(own_cache, "job-old", 3, 3 * 3600)
    _leftover(own_cache, "job-mid", 3, 2 * 3600)
    _leftover(own_cache, "job-new", 3, 60)
    running = cache.claim("render-running")
    (running / "final.mp4").write_bytes(b"\0" * (4 * MB))

    assert cache.sweep(20 * MB)["removed"] == 0  # 13 MB is under the limit: nothing goes

    res = cache.sweep(8 * MB)
    assert res["removed"] == 2 and res["total_bytes"] == 7 * MB
    assert not (own_cache / "job-old").exists() and not (own_cache / "job-mid").exists()
    assert (own_cache / "job-new").exists() and (running / "final.mp4").exists()

    # Running work alone over the limit: leftovers go, the running render stays
    res = cache.sweep(2 * MB)
    assert res["removed"] == 1 and res["total_bytes"] == res["in_use_bytes"] == 4 * MB
    assert (running / "final.mp4").exists()
    cache.release(running)


def test_a_folder_still_written_to_counts_as_recent(own_cache):
    _leftover(own_cache, "job-a", 1, 2 * 3600)
    _leftover(own_cache, "job-b", 1, 3600)
    # job-a's folder is old, but a file inside it changed a minute ago
    fresh = own_cache / "job-a" / "sub" / "new.bin"
    fresh.write_bytes(b"1")
    t = time.time() - 60
    os.utime(fresh, (t, t))
    cache.sweep(int(1.5 * MB))
    assert (own_cache / "job-a").exists() and not (own_cache / "job-b").exists()


def test_the_limit_comes_from_settings(db, own_cache):
    update_settings({"cache_limit_gb": 2})
    try:
        assert cache.limit_bytes() == 2 * 1024**3
        _leftover(own_cache, "transcript-yt-x", 1, 60)
        assert cache.enforce_limit()["removed"] == 0  # 1 MB is far under 2 GB
        update_settings({"cache_limit_gb": 0})  # never below 1 GB
        assert cache.limit_bytes() == 1024**3
    finally:
        update_settings({"cache_limit_gb": 10})


def test_start_removes_every_leftover(own_cache):
    _leftover(own_cache, "job-crashed", 0.5, 30)
    _leftover(own_cache, "render-killed", 0.5, 30)
    (own_cache / "upload-x.mp4").write_bytes(b"x")
    res = cache.clear_leftovers()
    assert res["removed"] == 3 and list(own_cache.iterdir()) == []


def test_the_purge_button_keeps_running_work(db, secrets, own_cache):
    from backend.main import create_app

    running = cache.claim("whisper-running")
    (running / "in.wav").write_bytes(b"\0" * MB)
    _leftover(own_cache, "source-old", 2, 600)
    with TestClient(create_app()) as c:
        c.headers.update({"Authorization": f"Bearer {config.token}"})
        r = c.post("/api/system/purge-cache")
    assert r.status_code == 200 and r.json()["freed_bytes"] == 2 * MB
    assert (running / "in.wav").exists() and not (own_cache / "source-old").exists()
    cache.release(running)
