"""LLM providers: settings, per-provider keys, parameter adaptation, Anthropic Messages API, model lists."""
from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.core import llm
from backend.core.config import config
from backend.core.settings_store import get_settings, update_settings


@pytest.fixture()
def client(db, secrets):
    from backend.main import create_app

    llm._quirks.clear()
    with TestClient(create_app()) as c:
        c.headers.update({"Authorization": f"Bearer {config.token}"})
        yield c


class _StrictModel(BaseHTTPRequestHandler):
    """OpenAI-format endpoint that behaves like a reasoning model: refuses max_tokens and temperature."""

    requests: list[dict] = []

    def log_message(self, *args):  # keep test output quiet
        pass

    def _send(self, status: int, payload: dict) -> None:
        data = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _authorized(self) -> bool:
        if self.headers.get("Authorization") != "Bearer sk-fake":
            self._send(401, {"error": {"message": "Incorrect API key provided"}})
            return False
        return True

    def do_GET(self):
        if not self._authorized():
            return
        self._send(200, {"data": [{"id": "text-embedding-3", "created": 5}, {"id": "model-a", "created": 1},
                                  {"id": "model-b", "created": 9}]})

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        type(self).requests.append(body)
        if not self._authorized():
            return
        if "max_tokens" in body:
            return self._send(400, {"error": {"message": "Unsupported parameter: 'max_tokens' is not supported with "
                                                         "this model. Use 'max_completion_tokens' instead."}})
        if "temperature" in body:
            return self._send(400, {"error": {"message": "Unsupported value: 'temperature' does not support 0.2 "
                                                         "with this model. Only the default (1) value is supported."}})
        self._send(200, {"id": "x", "object": "chat.completion", "created": 1, "model": body["model"],
                         "choices": [{"index": 0, "finish_reason": "stop",
                                      "message": {"role": "assistant", "content": '```json\n{"ok": true}\n```'}}]})


@pytest.fixture()
def strict_server():
    _StrictModel.requests = []
    server = ThreadingHTTPServer(("127.0.0.1", 0), _StrictModel)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_address[1]}/v1"
    server.shutdown()


def test_default_settings_have_every_provider(db):
    s = get_settings()["llm"]
    assert s["provider"] == "openai_compatible"
    assert set(s["models"]) == {"openai", "anthropic", "gemini", "xai", "deepseek", "qwen", "openai_compatible"}
    with pytest.raises(ValueError):
        update_settings({"llm": {"provider": "nope"}})
    with pytest.raises(ValueError):
        update_settings({"llm": {"provider": "openai_compatible", "base_url": "ftp://x"}})
    # Hosted providers ignore the base URL, so an empty one is fine there
    assert update_settings({"llm": {"provider": "gemini", "base_url": ""}})["llm"]["provider"] == "gemini"


def test_secrets_have_one_key_per_provider(client):
    names = set(client.get("/api/secrets").json()["secrets"])
    assert {"openai_api_key", "anthropic_api_key", "gemini_api_key", "xai_api_key", "deepseek_api_key",
            "qwen_api_key", "llm_api_key", "groq_api_key"} == names


def test_missing_key_names_the_provider(db, secrets, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    update_settings({"llm": {"provider": "anthropic"}})
    assert not llm.is_configured()
    with pytest.raises(llm.LLMNotConfigured, match="Anthropic"):
        llm.chat_json("s", "u")


def test_openai_format_adapts_refused_parameters(client, secrets, strict_server):
    client.put("/api/settings", json={"llm": {"provider": "openai_compatible", "base_url": strict_server,
                                              "models": {"openai_compatible": "strict-1"}}})
    secrets.set_secret("llm_api_key", "sk-fake")

    assert llm.chat_json("Return JSON", "go") == {"ok": True}
    first = _StrictModel.requests
    assert len(first) == 3 and "max_completion_tokens" in first[-1] and "temperature" not in first[-1]
    assert first[0]["response_format"] == {"type": "json_object"} and first[0]["model"] == "strict-1"

    # The adjustments are remembered: the next call succeeds on the first request
    _StrictModel.requests = []
    assert llm.chat_json("Return JSON", "again") == {"ok": True}
    assert len(_StrictModel.requests) == 1

    r = client.post("/api/secrets/llm_api_key/test").json()
    assert r["ok"] and "strict-1" in r["message"]


def test_model_list_filters_and_sorts(client, secrets, strict_server):
    client.put("/api/settings", json={"llm": {"provider": "openai_compatible", "base_url": strict_server}})
    secrets.set_secret("llm_api_key", "sk-fake")
    assert client.post("/api/llm/models", json={"provider": "openai_compatible"}).json() == {"models": ["model-b", "model-a"]}
    # An unsaved key / base URL from the form can be used before saving
    bad = client.post("/api/llm/models", json={"provider": "openai_compatible", "value": "wrong", "base_url": strict_server})
    assert bad.status_code == 400 and "ditolak" in bad.json()["detail"]
    assert client.post("/api/llm/models", json={"provider": "bogus"}).status_code == 400


def test_anthropic_messages_api(db, secrets, monkeypatch):
    calls: list[dict] = []

    def fake_post(url, headers=None, json=None, timeout=None):
        calls.append({"url": url, "headers": headers, "json": json})
        if "temperature" in json:
            return httpx.Response(400, json={"type": "error", "error": {
                "type": "invalid_request_error", "message": "temperature is not supported for this model"}})
        return httpx.Response(200, json={"content": [{"type": "text", "text": '{"segments": []}'}]})

    monkeypatch.setattr(httpx, "post", fake_post)
    update_settings({"llm": {"provider": "anthropic"}})
    secrets.set_secret("anthropic_api_key", "sk-ant-test")

    assert llm.chat_json("Pick clips", "transcript") == {"segments": []}
    assert calls[0]["url"] == "https://api.anthropic.com/v1/messages"
    assert calls[0]["headers"]["x-api-key"] == "sk-ant-test" and calls[0]["headers"]["anthropic-version"]
    assert calls[0]["json"]["model"] == "claude-haiku-5-5"
    assert calls[0]["json"]["system"].startswith("Pick clips") and "JSON" in calls[0]["json"]["system"]
    assert len(calls) == 2 and "temperature" not in calls[1]["json"]

    monkeypatch.setattr(httpx, "post", lambda *a, **k: httpx.Response(401, json={"error": {"message": "invalid x-api-key"}}))
    with pytest.raises(llm.LLMNotConfigured, match="ditolak"):
        llm.chat_json("s", "u")


def test_adapt_lowers_token_limit_to_provider_maximum():
    params = {"max_tokens": 9000}
    assert llm._adapt(params, "Invalid max_tokens value, the valid range of max_tokens is [1, 8192]", ("u", "m-range"))
    assert params == {"max_tokens": 8192}
    assert not llm._adapt({"max_tokens": 10}, "something unrelated went wrong", ("u", "m-other"))


def test_migration_004_converts_presets(db):
    from backend.db.migrations import m004_llm_providers

    db.app_settings.replace_one({"_id": "settings"}, {"_id": "settings", "llm": {
        "preset": "groq", "base_url": "https://api.groq.com/openai/v1", "model": "llama-3.3-70b-versatile"}}, upsert=True)
    m004_llm_providers.up(db)
    m004_llm_providers.up(db)  # idempotent
    s = get_settings()["llm"]
    assert s["provider"] == "openai_compatible" and s["base_url"] == "https://api.groq.com/openai/v1"
    assert s["models"]["openai_compatible"] == "llama-3.3-70b-versatile"
    assert "preset" not in s and "model" not in s
