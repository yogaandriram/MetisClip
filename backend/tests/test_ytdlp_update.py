"""The daily yt-dlp update check (agents/tools/ytdlp.maybe_auto_update, run by the engine's housekeeping)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from backend.agents.tools import ytdlp
from backend.core import events
from backend.core.settings_store import SettingsError, update_settings

T0 = datetime(2026, 11, 19, 8, 0, tzinfo=timezone.utc)
UP_TO_DATE = {"ok": True, "updated": False, "version": "2026.11.01", "message": "yt-dlp sudah versi terbaru (2026.11.01)"}
UPDATED = {"ok": True, "updated": True, "version": "2026.11.18", "message": "yt-dlp diperbarui ke 2026.11.18"}
OFFLINE = {"ok": False, "updated": False, "version": "2026.11.01", "message": "Update yt-dlp gagal. Periksa koneksi internet lalu coba lagi."}


@pytest.fixture()
def updater(db, monkeypatch):
    """`yt-dlp -U` replaced by the next queued result; records the runs and the notices."""
    state = ytdlp._state_path()
    state.unlink(missing_ok=True)
    runs: list[dict] = []
    results: list[dict] = []
    notices: list[str] = []

    def fake_run() -> dict:
        res = results.pop(0) if results else UP_TO_DATE
        runs.append(res)
        return res

    monkeypatch.setattr(ytdlp, "_run_self_update", fake_run)
    monkeypatch.setattr(events, "notice", lambda message, level="info": notices.append(message))
    yield {"runs": runs, "results": results, "notices": notices}
    state.unlink(missing_ok=True)


def _at(state_time: str | None) -> datetime | None:
    return datetime.fromisoformat(state_time) if state_time else None


def test_first_check_runs_then_waits_a_day(updater, monkeypatch):
    assert ytdlp.update_state() == {}
    assert ytdlp.maybe_auto_update(T0) == UP_TO_DATE
    state = ytdlp.update_state()
    assert state["ok"] is True and state["auto"] is True and state["checked_at"] == state["attempted_at"]
    assert state["version"] == "2026.11.01"
    checked = _at(state["checked_at"])

    # within a day of that check: nothing runs
    assert ytdlp.maybe_auto_update(checked + timedelta(hours=23, minutes=59)) is None
    assert len(updater["runs"]) == 1
    # a day later it checks again
    assert ytdlp.maybe_auto_update(checked + timedelta(hours=24, minutes=1)) == UP_TO_DATE
    assert len(updater["runs"]) == 2
    assert updater["notices"] == []  # "already up to date" stays quiet


def test_a_new_version_is_announced(updater):
    updater["results"].append(UPDATED)
    assert ytdlp.maybe_auto_update(T0)["updated"] is True
    assert updater["notices"] == ["yt-dlp diperbarui ke 2026.11.18"]


def test_a_failed_check_is_tried_again_after_three_hours(updater):
    updater["results"].append(OFFLINE)
    assert ytdlp.maybe_auto_update(T0)["ok"] is False
    state = ytdlp.update_state()
    assert state["ok"] is False and "checked_at" not in state
    attempted = _at(state["attempted_at"])
    assert updater["notices"] == []  # offline is not worth a toast

    assert ytdlp.maybe_auto_update(attempted + timedelta(hours=2, minutes=59)) is None
    assert ytdlp.maybe_auto_update(attempted + timedelta(hours=3, minutes=1)) == UP_TO_DATE
    state = ytdlp.update_state()
    assert state["ok"] is True and state["checked_at"] == state["attempted_at"]


def test_skipped_while_a_job_or_an_export_runs(updater, db):
    db.discovery_jobs.insert_one({"_id": "job-1", "status": "running"}, bypass_document_validation=True)
    assert ytdlp.maybe_auto_update(T0) is None
    db.discovery_jobs.update_one({"_id": "job-1"}, {"$set": {"status": "completed"}}, bypass_document_validation=True)
    db.render_jobs.insert_one({"_id": "render-1", "status": "queued"}, bypass_document_validation=True)
    assert ytdlp.maybe_auto_update(T0) is None
    assert updater["runs"] == [] and ytdlp.update_state() == {}  # nothing recorded: next round tries again
    db.render_jobs.update_one({"_id": "render-1"}, {"$set": {"status": "completed"}}, bypass_document_validation=True)
    assert ytdlp.maybe_auto_update(T0) == UP_TO_DATE


def test_the_switch_turns_it_off(updater):
    update_settings({"ytdlp": {"auto_update": False}})
    assert ytdlp.maybe_auto_update(T0) is None
    assert updater["runs"] == []
    update_settings({"ytdlp": {"auto_update": True}})
    assert ytdlp.maybe_auto_update(T0) == UP_TO_DATE
    with pytest.raises(SettingsError):
        update_settings({"ytdlp": {"auto_update": "yes"}})


def test_the_update_button_counts_as_the_days_check(updater):
    ytdlp.self_update()
    state = ytdlp.update_state()
    assert state["auto"] is False and state["ok"] is True
    assert ytdlp.maybe_auto_update(_at(state["checked_at"]) + timedelta(hours=1)) is None
    assert len(updater["runs"]) == 1


def test_waits_for_a_check_already_running(updater):
    assert ytdlp._update_lock.acquire(blocking=False)
    try:
        assert ytdlp.maybe_auto_update(T0) is None  # the button is updating right now
    finally:
        ytdlp._update_lock.release()
    assert updater["runs"] == []


def test_the_component_check_reports_it(updater, db, secrets):
    from fastapi.testclient import TestClient

    from backend.core.config import config
    from backend.main import create_app

    ytdlp.maybe_auto_update(T0)
    with TestClient(create_app()) as client:
        client.headers.update({"Authorization": f"Bearer {config.token}"})
        res = client.get("/api/system/check")
    assert res.status_code == 200
    info = res.json()["ytdlp_update"]
    assert info["auto"] is True and info["ok"] is True and info["checked_at"]
