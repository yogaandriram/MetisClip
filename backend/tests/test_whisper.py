"""Speech-to-text: engine choice (auto / local / groq), whisper.cpp output parsing, model downloads,
resumable chunked transcripts, settings, migration 007 and the /api/whisper routes."""
from __future__ import annotations

import hashlib
import os
import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.agents.tools import whisper, whisper_local
from backend.core.config import config

REPO = Path(__file__).resolve().parents[2]
_REAL_DOWNLOAD = whisper_local._download  # conftest blocks downloads; these tests fake the HTTP side


@pytest.fixture()
def client(db, secrets):
    from backend.main import create_app

    with TestClient(create_app()) as c:
        c.headers.update({"Authorization": f"Bearer {config.token}"})
        yield c


@pytest.fixture(autouse=True)
def _fresh_groq_pause():
    whisper.resume_groq()
    yield
    whisper.resume_groq()


# ---------------------------------------------------------------------------
# whisper-cli JSON -> Groq-like payload
# ---------------------------------------------------------------------------

def _tok(text, a, b):
    return {"text": text, "offsets": {"from": a, "to": b}}


CLI_OUTPUT = {
    "result": {"language": "id"},
    "transcription": [
        {
            "offsets": {"from": 0, "to": 2760},
            "text": " Halo semuanya, selamat datang.",
            "tokens": [
                _tok("[_BEG_]", 0, 0),
                _tok(" Halo", 150, 460),
                _tok(" semu", 480, 900),
                _tok("anya", 900, 1260),
                _tok(",", 1260, 1260),
                _tok(" selamat", 1540, 1790),
                _tok(" datang", 2640, 2640),  # zero length, as whisper.cpp often reports
                _tok(".", 2760, 2760),
                _tok("[_TT_138]", 2760, 2760),
            ],
        },
        {"offsets": {"from": 2760, "to": 5000}, "text": " ", "tokens": []},
        {"offsets": {"from": 5000, "to": 7000}, "text": " Tanpa token", "tokens": []},
    ],
}


def test_parse_output_merges_tokens_into_words():
    out = whisper_local.parse_output(CLI_OUTPUT)
    assert out["language"] == "id"
    assert [s["text"] for s in out["segments"]] == ["Halo semuanya, selamat datang.", "Tanpa token"]
    assert out["segments"][0] == {"text": "Halo semuanya, selamat datang.", "start": 0.0, "end": 2.76}
    words = out["words"]
    assert [w["word"] for w in words] == ["Halo", "semuanya,", "selamat", "datang.", "Tanpa", "token"]
    assert words[1]["start"] == 0.48 and words[1]["end"] == 1.26
    # The zero-length word gets a visible duration, and nothing overlaps the next word
    assert words[3]["start"] == 2.64 and words[3]["end"] > words[3]["start"] + 0.05
    for a, b in zip(words, words[1:]):
        assert a["start"] <= b["start"] and a["end"] <= b["start"] + 1e-9
    # A segment without tokens is split evenly
    assert words[4]["start"] == 5.0 and words[5]["end"] == 7.0
    assert whisper.words_from_payload(out) == [{"word": w["word"], "start": w["start"], "end": w["end"]} for w in words]


def test_parse_output_drops_broken_utf8_pieces():
    data = {"transcription": [{"offsets": {"from": 0, "to": 1000}, "text": " ok �",
                               "tokens": [_tok(" ok", 0, 400), _tok(" �", 400, 600)]}]}
    assert [w["word"] for w in whisper_local.parse_output(data)["words"]] == ["ok"]


# ---------------------------------------------------------------------------
# Engine choice
# ---------------------------------------------------------------------------

@pytest.fixture()
def engines(monkeypatch, secrets):
    """Fake Groq and local engines that record which one ran."""
    calls: list[str] = []
    state = {"groq_error": None, "settings": {"provider": "auto"}, "local": True}

    def fake_groq(path, *, words, retries=3):
        calls.append("groq")
        if state["groq_error"]:
            raise state["groq_error"]
        return {"text": "groq", "segments": []}

    def fake_local(path, *, words, cancel=None, on_status=None):
        calls.append("local")
        return {"text": "local", "segments": []}

    monkeypatch.setattr(whisper, "_groq_transcribe", fake_groq)
    monkeypatch.setattr(whisper_local, "transcribe", fake_local)
    monkeypatch.setattr(whisper_local, "binary", lambda: Path("whisper-cli.exe") if state["local"] else None)
    monkeypatch.setattr(whisper, "_settings", lambda: state["settings"])
    return calls, state


def test_auto_uses_groq_when_a_key_is_set(engines, secrets):
    calls, _ = engines
    secrets.set_secret("groq_api_key", "gsk_test")
    assert whisper.transcribe(Path("a.mp3"), words=False)["text"] == "groq"
    assert calls == ["groq"]


def test_auto_without_key_uses_local(engines):
    calls, _ = engines
    assert whisper.available()
    assert whisper.transcribe(Path("a.mp3"), words=True)["text"] == "local"
    assert calls == ["local"]


def test_auto_falls_back_to_local_and_pauses_groq(engines, secrets):
    calls, state = engines
    secrets.set_secret("groq_api_key", "gsk_test")
    state["groq_error"] = whisper.GroqError("Kuota Groq Whisper sedang habis.", pause=900)
    notes: list[str] = []
    assert whisper.transcribe(Path("a.mp3"), words=False, on_status=notes.append)["text"] == "local"
    assert calls == ["groq", "local"]
    assert notes and "Beralih ke Whisper lokal" in notes[0]
    # While paused, the next chunk goes straight to the local engine
    whisper.transcribe(Path("b.mp3"), words=False)
    assert calls == ["groq", "local", "local"]
    # A new key resumes Groq at once
    whisper.resume_groq()
    state["groq_error"] = None
    whisper.transcribe(Path("c.mp3"), words=False)
    assert calls[-1] == "groq"


def test_auto_without_local_engine_keeps_the_groq_error(engines, secrets):
    _, state = engines
    secrets.set_secret("groq_api_key", "gsk_test")
    state["local"] = False
    state["groq_error"] = whisper.GroqError("Groq Whisper tidak dapat dihubungi.", pause=120)
    with pytest.raises(whisper.GroqError):
        whisper.transcribe(Path("a.mp3"), words=False)


def test_forced_modes(engines, secrets):
    calls, state = engines
    state["settings"] = {"provider": "groq"}
    assert not whisper.available()
    assert "API key Groq belum diisi" in whisper.unavailable_reason()
    secrets.set_secret("groq_api_key", "gsk_test")
    state["groq_error"] = whisper.GroqError("Groq Whisper tidak dapat dihubungi.", pause=120)
    with pytest.raises(whisper.GroqError):  # "Selalu Groq" never falls back
        whisper.transcribe(Path("a.mp3"), words=False)
    state["settings"] = {"provider": "local"}
    whisper.transcribe(Path("a.mp3"), words=False)
    assert calls == ["groq", "local"]
    state["local"] = False
    assert not whisper.available()


def test_model_choice(monkeypatch):
    monkeypatch.setattr(whisper_local, "model_setting", lambda: "auto")
    monkeypatch.setattr(whisper_local, "_hardware", lambda: (12, 16, 23.6))
    assert whisper_local.chosen_model(words=False).id == "small"  # full transcripts: always the fast model
    assert whisper_local.chosen_model(words=True).id == "large-v3-turbo"
    monkeypatch.setattr(whisper_local, "_hardware", lambda: (4, 8, 7.8))
    assert whisper_local.chosen_model(words=True).id == "small"
    assert whisper_local.threads() == 4
    monkeypatch.setattr(whisper_local, "model_setting", lambda: "large-v3-turbo")
    assert whisper_local.chosen_model(words=False).id == "large-v3-turbo"


# ---------------------------------------------------------------------------
# Model download
# ---------------------------------------------------------------------------

class _Resp:
    def __init__(self, status, body):
        self.status_code, self._body = status, body

    def iter_content(self, chunk_size):
        for i in range(0, len(self._body), 4):
            yield self._body[i:i + 4]

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def _fake_model(monkeypatch, body: bytes) -> whisper_local.LocalModel:
    monkeypatch.setattr(whisper_local, "_download", _REAL_DOWNLOAD)
    model = whisper_local.LocalModel("tiny-test", "Tiny", "", "ggml-tiny-test.bin", len(body), hashlib.sha256(body).hexdigest())
    monkeypatch.setitem(whisper_local.MODELS, model.id, model)
    monkeypatch.setitem(whisper_local._model_locks, model.id, __import__("threading").Lock())
    return model


def test_download_resumes_and_verifies(monkeypatch, paths):
    import requests

    body = b"0123456789abcdefghij"
    model = _fake_model(monkeypatch, body)
    part = whisper_local.model_path(model).with_name(model.file + ".part")
    part.parent.mkdir(parents=True, exist_ok=True)
    part.write_bytes(body[:8])
    seen = {}

    def fake_get(url, headers, stream, timeout):
        seen["range"] = headers.get("Range")
        return _Resp(206, body[8:])

    monkeypatch.setattr(requests, "get", fake_get)
    progress: list[float] = []
    path = whisper_local.ensure_model(model, on_progress=progress.append)
    assert seen["range"] == "bytes=8-"
    assert path.read_bytes() == body and not part.exists()
    assert whisper_local.installed(model) and progress
    whisper_local.delete_model(model.id)
    assert not path.exists()


def test_download_rejects_a_bad_checksum(monkeypatch, paths):
    import requests

    model = _fake_model(monkeypatch, b"good model bytes")
    monkeypatch.setattr(requests, "get", lambda *a, **k: _Resp(200, b"evil model bytes"))
    with pytest.raises(whisper_local.LocalWhisperError, match="checksum"):
        whisper_local.ensure_model(model)
    assert not whisper_local.installed(model)
    assert whisper_local.download_state(model.id)["status"] == "failed"


def test_complete_part_file_is_used_without_downloading(monkeypatch, paths):
    """A crash after the last byte but before the rename: the next attempt verifies and keeps it."""
    import requests

    body = b"complete model"
    model = _fake_model(monkeypatch, body)
    part = whisper_local.model_path(model).with_name(model.file + ".part")
    part.parent.mkdir(parents=True, exist_ok=True)
    part.write_bytes(body)
    monkeypatch.setattr(requests, "get", lambda *a, **k: pytest.fail("no request needed"))
    assert whisper_local.ensure_model(model).read_bytes() == body


def test_cancelling_a_download_does_not_cancel_the_waiting_job(monkeypatch, paths):
    import threading

    import requests

    from backend.core.procs import CancelToken

    model = _fake_model(monkeypatch, b"y" * 64)
    started = threading.Event()

    class Slow(_Resp):
        def iter_content(self, chunk_size):
            started.set()
            for _ in range(200):
                yield b"y"
                __import__("time").sleep(0.05)

    monkeypatch.setattr(requests, "get", lambda *a, **k: Slow(200, b""))
    job = CancelToken()
    result: dict = {}

    def run():
        try:
            whisper_local.ensure_model(model, job)
        except Exception as exc:
            result["exc"] = exc

    t = threading.Thread(target=run)
    t.start()
    assert started.wait(5)
    assert whisper_local.cancel_download(model.id)
    t.join(10)
    assert isinstance(result.get("exc"), whisper_local.LocalWhisperError) and "dibatalkan" in str(result["exc"])
    assert not job.cancelled
    assert whisper_local.download_state(model.id)["status"] == "cancelled"


def test_download_offline_message(monkeypatch, paths):
    import requests

    model = _fake_model(monkeypatch, b"x" * 10)

    def offline(*a, **k):
        raise requests.ConnectionError("no route")

    monkeypatch.setattr(requests, "get", offline)
    with pytest.raises(whisper_local.LocalWhisperError, match="internet tidak tersedia"):
        whisper_local.ensure_model(model)


# ---------------------------------------------------------------------------
# Chunked transcripts survive an interruption
# ---------------------------------------------------------------------------

def test_transcript_chunks_resume_after_failure(db, monkeypatch, tmp_path):
    from backend.agents.tools import transcript
    from backend.core.procs import CancelToken

    chunks = [tmp_path / f"chunk_{i:03d}.mp3" for i in range(3)]
    calls: list[str] = []

    def fake_transcribe(path, *, words, cancel=None, on_status=None):
        calls.append(path.name)
        if path.name == "chunk_002.mp3" and calls.count(path.name) == 1:
            raise whisper.WhisperError("putus")
        return {"language": "id", "segments": [{"text": path.stem, "start": 1.0, "end": 2.0}]}

    monkeypatch.setattr(whisper, "transcribe", fake_transcribe)
    with pytest.raises(whisper.WhisperError):
        transcript._whisper_chunks("file:abc", chunks, CancelToken(), None)
    segs, lang = transcript._whisper_chunks("file:abc", chunks, CancelToken(), None)
    assert calls == ["chunk_000.mp3", "chunk_001.mp3", "chunk_002.mp3", "chunk_002.mp3"]
    assert lang == "id"
    assert [(s["text"], s["start"]) for s in segs] == [("chunk_000", 1.0), ("chunk_001", 1201.0), ("chunk_002", 2401.0)]


# ---------------------------------------------------------------------------
# Settings, migration, routes
# ---------------------------------------------------------------------------

def test_whisper_settings_are_validated(client):
    s = client.get("/api/settings").json()["settings"]["whisper"]
    assert s == {"provider": "auto", "model": "whisper-large-v3-turbo", "local_model": "auto"}
    assert client.put("/api/settings", json={"whisper": {"provider": "openai"}}).status_code == 400
    assert client.put("/api/settings", json={"whisper": {"local_model": "medium"}}).status_code == 400
    r = client.put("/api/settings", json={"whisper": {"provider": "local", "local_model": "small"}})
    assert r.status_code == 200 and r.json()["settings"]["whisper"]["provider"] == "local"


def test_migration_007_turns_groq_into_auto(mongo):
    import time

    from backend.core import db as dbm

    name = f"metisclip_v6_{os.getpid()}_{time.time_ns()}"
    old = mongo[name]
    dbm.set_db(old, mongo)
    try:
        old.meta.insert_one({"_id": "schema", "version": 6})
        old.app_settings.insert_one({"_id": "settings", "whisper": {"provider": "groq", "model": "whisper-large-v3"}})
        assert dbm.migrate(old) == 7
        assert old.app_settings.find_one({"_id": "settings"})["whisper"] == {"provider": "auto", "model": "whisper-large-v3"}
    finally:
        mongo.drop_database(name)
        dbm.set_db(None, None)  # type: ignore[arg-type]


def test_whisper_routes(client):
    st = client.get("/api/whisper/status").json()
    assert st["provider"] == "auto" and st["groq_key_set"] is False
    assert {m["id"] for m in st["models"]} == {"small", "large-v3-turbo"}
    assert st["local"]["transcript_model"] == "small"
    assert st["local"]["auto_models"]["transcript"] == "small"
    assert client.post("/api/whisper/models/medium/download").status_code == 404
    assert client.post("/api/whisper/models/small/cancel").json() == {"ok": False}
    assert client.delete("/api/whisper/models/small").json() == {"ok": True}  # not installed: nothing to delete


def test_upload_jobs_need_a_transcription_engine(client, tmp_path, monkeypatch):
    from backend.tests.test_db_and_api import _video

    agent = client.post("/api/agents", json={"name": "Agen Upload"}).json()["agent"]
    video = _video(tmp_path / "Klip Saya ü.mp4")
    monkeypatch.setattr(config, "env", "production")
    # "Selalu Groq" without a key
    client.put("/api/settings", json={"whisper": {"provider": "groq"}})
    r = client.post("/api/jobs", json={"agent_id": agent["id"], "local_file_path": video})
    assert r.status_code == 400 and "API key Groq" in r.json()["detail"]
    # "Otomatis" on an install without whisper-cli
    client.put("/api/settings", json={"whisper": {"provider": "auto"}})
    monkeypatch.setattr(whisper_local, "binary", lambda: None)
    r = client.post("/api/jobs", json={"agent_id": agent["id"], "local_file_path": video})
    assert r.status_code == 400 and "Whisper lokal tidak ditemukan" in r.json()["detail"]


# ---------------------------------------------------------------------------
# The real whisper-cli (dev machines with the binary and the small model)
# ---------------------------------------------------------------------------

def test_real_whisper_cli_in_a_non_ascii_data_folder(paths, monkeypatch, tmp_path):
    """The test data folder contains 'ü' and spaces: whisper-cli must still find the model and audio."""
    from backend.core import procs
    from backend.core.config import ffmpeg_path

    model = whisper_local.MODELS["small"]
    dev_model = REPO / ".devdata" / "models" / "whisper" / model.file
    if whisper_local.binary() is None or not dev_model.exists():
        pytest.skip("whisper-cli or the dev small model is missing (scripts/fetch-binaries.ps1, Pengaturan → Unduh)")
    target = whisper_local.model_path(model)
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        try:
            os.link(dev_model, target)
        except OSError:
            shutil.copy2(dev_model, target)
    monkeypatch.setattr(whisper_local, "model_setting", lambda: "small")
    audio = tmp_path / "suara ü.mp3"
    procs.run([ffmpeg_path(), "-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
               "-ac", "1", "-ar", "16000", str(audio)], timeout=60)
    notes: list[str] = []
    out = whisper_local.transcribe(audio, words=True, on_status=notes.append)
    assert set(out) == {"text", "language", "segments", "words"}
    assert not any(p.name.startswith("whisper-") for p in paths.cache_dir.iterdir())  # work dir cleaned up
