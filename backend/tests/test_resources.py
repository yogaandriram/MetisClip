"""RAM guard (core/resources.py): admission, waiting, priority, re-entrancy, render sizing; and the
RAM-saving encoder arguments."""
from __future__ import annotations

import copy
import threading
import time

import pytest

from backend.core import procs, resources


@pytest.fixture
def ram(monkeypatch):
    """Fake RAM: `state["available"]` MB available, nothing of ours allocated, guard settings in
    `state["settings"]`; fast polling; no events."""
    state = {"available": 8000, "ours": 0, "settings": {"auto": True, "reserve_gb": 1}}
    monkeypatch.setattr(resources, "_settings", lambda: state["settings"])
    monkeypatch.setattr(resources, "available_mb", lambda: state["available"])
    monkeypatch.setattr(resources, "_ours_mb", lambda: state["ours"])
    monkeypatch.setattr(resources, "_changed", lambda: None)
    monkeypatch.setattr(resources.events, "notice", lambda *a, **k: None)
    monkeypatch.setattr(resources, "POLL_S", 0.02)
    monkeypatch.setattr(resources, "TELL_EVERY_S", 0.0)
    monkeypatch.setattr(resources.os, "cpu_count", lambda: 16)
    yield state
    assert not resources._holds and not resources._waiting


class Holder(threading.Thread):
    """Takes a hold in its own thread and keeps it until `release` is set."""

    def __init__(self, kind: str, need: int, **kw):
        super().__init__(daemon=True)
        self.kind, self.need, self.kw = kind, need, kw
        self.entered = threading.Event()
        self.release = threading.Event()
        self.error: BaseException | None = None
        self.waits: list[resources.WaitInfo] = []

    def run(self) -> None:
        try:
            with resources.hold(self.kind, self.need, on_wait=self.waits.append, **self.kw):
                self.entered.set()
                self.release.wait(10)
        except BaseException as exc:  # noqa: BLE001
            self.error = exc


def test_auto_reserve():
    assert resources.auto_reserve_mb(8192) == 1536
    assert resources.auto_reserve_mb(16384) == 2457
    assert resources.auto_reserve_mb(32768) == 2560


def test_off_never_waits(ram):
    ram["settings"] = {"auto": False, "reserve_gb": 0}
    ram["available"] = 10
    with resources.hold("clip", 5000) as h:
        assert h is None
    with resources.render_slot() as tabs:
        assert tabs is None


def test_second_step_waits_for_ram(ram):
    ram["available"] = 4000  # reserve 1 GB; alone only 768 MB
    a = Holder("clip", 2000)
    a.start()
    assert a.entered.wait(2)
    b = Holder("clip", 2000)  # 4000 - 2000 granted - 1024 reserve = 976 < 2000
    b.start()
    time.sleep(0.2)
    assert not b.entered.is_set()
    assert b.waits and "Menunggu RAM" in b.waits[0].message() and b.waits[0].busy == 1
    a.release.set()
    assert b.entered.wait(2)
    b.release.set()
    a.join(2)
    b.join(2)
    assert a.error is None and b.error is None


def test_allocated_ram_is_not_counted_twice(ram):
    """A running step's RAM is already gone from `available`: only the part it has not allocated yet
    is held back for it."""
    ram["available"] = 4000
    a = Holder("clip", 2000)
    a.start()
    assert a.entered.wait(2)
    ram["available"], ram["ours"] = 2500, 1500  # it allocated 1.5 GB of its 2 GB
    b = Holder("clip", 900)  # 2500 - (2000 - 1500) - 1024 = 976 >= 900
    b.start()
    assert b.entered.wait(2)
    a.release.set()
    b.release.set()
    a.join(2)
    b.join(2)


def test_nested_hold_is_free(ram):
    ram["available"] = 3000
    with resources.hold("clip", 2000) as outer:
        assert outer is not None
        ram["available"] = 100
        with resources.hold("whisper", 1000) as inner:  # Whisper inside the clip
            assert inner is None
    assert not resources._holds


def test_render_goes_first(ram):
    ram["available"] = 6000
    a = Holder("clip", 1000)
    a.start()
    assert a.entered.wait(2)
    render = Holder("render", 5000, priority=True)  # 6000 - 1000 - 1024 < 5000: waits
    render.start()
    time.sleep(0.15)
    assert not render.entered.is_set()
    clip = Holder("clip", 500)  # would fit, but the waiting render goes first
    clip.start()
    time.sleep(0.15)
    assert not clip.entered.is_set()
    a.release.set()
    assert render.entered.wait(2)
    time.sleep(0.1)
    assert not clip.entered.is_set()  # 6000 - 5000 - 1024 < 500
    render.release.set()
    assert clip.entered.wait(2)
    clip.release.set()
    for t in (a, render, clip):
        t.join(2)
        assert t.error is None


def test_cancel_while_waiting(ram):
    ram["available"] = 3000
    a = Holder("clip", 2000)
    a.start()
    assert a.entered.wait(2)
    token = procs.CancelToken()
    b = Holder("clip", 2000, cancel=token)
    b.start()
    time.sleep(0.1)
    token.cancel("test")
    b.join(2)
    assert isinstance(b.error, procs.Cancelled)
    assert not b.entered.is_set()
    a.release.set()
    a.join(2)


def test_alone_step_starts_after_a_while(ram, monkeypatch):
    """With nothing else of MetisClip running, waiting cannot free RAM: start anyway, later."""
    monkeypatch.setattr(resources, "ALONE_MAX_WAIT_S", 0.2)
    ram["available"] = 1000
    t0 = time.monotonic()
    with resources.hold("clip", 2000) as h:
        assert h is not None
    assert time.monotonic() - t0 >= 0.2


def test_render_slot_takes_the_tabs_that_fit(ram):
    ram["available"] = 6000  # 6000 - 2500 (one tab) - 1024 = 2476 -> 4 more tabs, capped at 4
    with resources.render_slot() as tabs:
        assert tabs == 4
        assert resources._holds and next(iter(resources._holds.values())).need_mb == resources.render_need_mb(4)
    ram["available"] = 4000  # 4000 - 2500 - 1024 = 476 -> 1 tab
    with resources.render_slot() as tabs:
        assert tabs == 1
    with resources.render_slot(max_tabs=2) as tabs:
        ram["available"] = 9000
        assert tabs == 1  # sized when it started


def test_render_slot_counts_the_companion_video(ram):
    # Split layout: the companion is held on top of every tab count, and leaves less room for tabs
    ram["available"] = 4300  # 4300 - (2500 + 300) - 1024 = 476 -> 1 tab
    with resources.render_slot(extra_mb=resources.RENDER_COMPANION_MB) as tabs:
        assert tabs == 1
        assert next(iter(resources._holds.values())).need_mb == resources.render_need_mb(1) + resources.RENDER_COMPANION_MB
    ram["available"] = 6300
    with resources.render_slot(extra_mb=resources.RENDER_COMPANION_MB) as tabs:
        assert tabs == 4
        assert next(iter(resources._holds.values())).need_mb == resources.render_need_mb(4, resources.RENDER_COMPANION_MB)


def test_clip_need():
    assert resources.clip_need_mb("h264_qsv") == resources.CLIP_TRACK_MB
    assert resources.clip_need_mb("libx264") == resources.CLIP_ENCODE_MB["libx264"]
    assert resources.clip_need_mb("h264_nvenc", whisper_mb=1000) == 1000


def test_tight(ram):
    ram["available"] = 8000
    assert not resources.tight()
    ram["available"] = 2500
    assert resources.tight()
    ram["settings"] = {"auto": False, "reserve_gb": 0}
    assert not resources.tight()


def test_finish_vertical_uses_duration_not_shortest(monkeypatch, tmp_path):
    from backend.agents.tools import ffmpeg_ops

    calls: list[list[str]] = []
    monkeypatch.setattr(ffmpeg_ops, "pick_encoder", lambda: "libx264")
    monkeypatch.setattr(ffmpeg_ops.resources, "tight", lambda: True)
    monkeypatch.setattr(ffmpeg_ops.resources, "enabled", lambda: True)
    monkeypatch.setattr(ffmpeg_ops.procs, "run", lambda cmd, **kw: calls.append([str(c) for c in cmd]) or kw)
    monkeypatch.setattr(ffmpeg_ops, "probe_duration", lambda p: 12.5)
    ffmpeg_ops.finish_vertical(tmp_path / "t.mp4", tmp_path / "s.mp4", tmp_path / "o.mp4", None)
    cmd = calls[-1]
    assert "-shortest" not in cmd
    assert cmd[cmd.index("-t") + 1] == "12.500"
    assert cmd[cmd.index("-threads") + 1] == str(ffmpeg_ops.LEAN_X264_THREADS)

    monkeypatch.setattr(ffmpeg_ops, "probe_duration", lambda p: None)
    ffmpeg_ops.finish_vertical(tmp_path / "t.mp4", tmp_path / "s.mp4", tmp_path / "o.mp4", None)
    assert "-shortest" in calls[-1]


def test_encoder_args_lean_only_for_x264():
    from backend.agents.tools import ffmpeg_ops

    assert "-threads" not in ffmpeg_ops.encoder_args("libx264")
    assert "-threads" in ffmpeg_ops.encoder_args("libx264", lean=True)
    assert "-threads" not in ffmpeg_ops.encoder_args("h264_qsv", lean=True)


def test_settings_validation(paths):
    from backend.core import settings_store as ss

    s = copy.deepcopy(ss.defaults())
    assert s["resources"] == {"auto": True, "reserve_gb": 0}
    s["resources"]["reserve_gb"] = "2.5"
    ss._validate(s)
    assert s["resources"]["reserve_gb"] == 2.5
    for bad in ({"auto": "ya", "reserve_gb": 0}, {"auto": True, "reserve_gb": 40}, {"auto": True, "reserve_gb": "x"}):
        s = copy.deepcopy(ss.defaults())
        s["resources"] = bad
        with pytest.raises(ss.SettingsError):
            ss._validate(s)


def test_status_shape(ram):
    with resources.hold("clip", 700, label="Klip 12s"):
        st = resources.status()
    assert st["running"] == [{"kind": "clip", "label": "Klip 12s", "need_mb": 700}]
    assert st["reserve_mb"] == 1024 and st["auto"] is True
    assert st["total_mb"] > 0
