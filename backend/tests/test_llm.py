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


def test_api_keys_are_never_read_from_the_environment(db, secrets, monkeypatch):
    """Keys are entered in Pengaturan only; a key in .env / the environment is ignored, also in dev."""
    assert config.is_dev
    for env_name in ("LLM_API_KEY", "NINEROUTER_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GROQ_API_KEY"):
        monkeypatch.setenv(env_name, "sk-from-dotenv-1234567890")
    for name in ("llm_api_key", "openai_api_key", "anthropic_api_key", "groq_api_key"):
        assert secrets.get_secret(name) is None
    assert not llm.is_configured()


def test_missing_key_names_the_provider(db, secrets):
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


# ---------------------------------------------------------------- rate limits and quotas

GROQ_TPD = ("Rate limit reached for model `openai/gpt-oss-120b` in organization `org_01abc` service tier `on_demand` "
            "on tokens per day (TPD): Limit 200000, Used 199323, Requested 4523. Please try again in 27m41.0s. "
            "Need more tokens? Upgrade to Dev Tier today at https://console.groq.com/settings/billing")
# 9Router wraps the upstream error in its own message; while it cools down it sends a cut-off copy
ROUTER_TPD = '[groq/openai/gpt-oss-120b] [429]: {"error":{"message":' + json.dumps(GROQ_TPD) + ',"type":"tokens"}}'
ROUTER_COOLDOWN = ('[groq/openai/gpt-oss-120b] [429]: {"error":{"message":"Rate limit reached for model '
                   '`openai/gpt-oss-120b` in organization `org_ (reset after 30s)')


def test_clean_detail_unwraps_router_messages():
    full = llm._clean_detail(ROUTER_TPD)
    assert full.startswith("[groq/openai/gpt-oss-120b] Rate limit reached")
    assert "tokens per day" in full and "org_" not in full and "on_demand" not in full and '{"error"' not in full
    cut = llm._clean_detail(ROUTER_COOLDOWN)
    assert cut == "[groq/openai/gpt-oss-120b] Rate limit reached for model `openai/gpt-oss-120b` (reset after 30s)"
    assert llm._clean_detail("Incorrect API key provided") == "Incorrect API key provided"


@pytest.mark.parametrize("status,message,headers,kind,wait", [
    # Groq's daily token limit behind 9Router: the provider's wait (27 min) wins over the router's 30 s
    (429, ROUTER_TPD + " (reset after 30s)", None, "daily", 1661.0),
    (429, "Rate limit reached on tokens per day (TPD): Limit 200000, Used 200000", None, "daily", None),
    # The router's cut-off copy names no limit, only its own short cooldown: wait it out once
    (429, ROUTER_COOLDOWN, None, "rate", 30.0),
    # A rolling daily window that frees up within seconds: worth one wait
    (429, "Rate limit reached on requests per day (RPD). Please try again in 7.5s.", None, "rate", 7.5),
    (429, "Rate limit reached on tokens per minute (TPM). Please try again in 2.2s.", None, "rate", 2.2),
    (429, "Rate limit exceeded", {"retry-after": "3"}, "rate", 3.0),
    (429, "Rate limit exceeded", {"retry-after-ms": "450"}, "rate", 0.45),
    (429, "Too many requests", {"retry-after": "300"}, "wait", 300.0),
    (429, "Too many requests", None, "rate", None),
    # OpenAI: the account has no credit left
    (429, "You exceeded your current quota, please check your plan and billing details.", None, "billing", None),
    # Gemini's per-minute limit uses the same words but names a wait
    (429, "You exceeded your current quota, please check your plan and billing details. Please retry in 41.2s.",
     None, "rate", 41.2),
    (429, "Quota exceeded for metric: GenerateRequestsPerDayPerProjectPerModel-FreeTier", None, "daily", None),
    (402, "Insufficient Balance", None, "billing", None),
])
def test_limit_error_classification(status, message, headers, kind, wait):
    err = llm._limit_error(status, message, headers)
    if kind == "rate":
        assert isinstance(err, llm._Retryable) and err.kind == "rate"
    else:
        assert isinstance(err, llm._Quota) and err.kind == kind
    if wait is None:
        assert err.retry_after is None
    else:
        assert err.retry_after == pytest.approx(wait, abs=0.01)


def test_wait_formatting():
    assert llm._fmt_wait(0.2) == "1 detik"
    assert llm._fmt_wait(45) == "45 detik"
    assert llm._fmt_wait(1661) == "28 menit"
    assert llm._fmt_wait(3 * 3600 + 5 * 60) == "3 jam 5 menit"


class _LimitedModel(BaseHTTPRequestHandler):
    """OpenAI-format endpoint that answers from a script of (status, headers, payload); the last one repeats."""

    script: list[tuple[int, dict, dict]] = []
    hits = 0

    def log_message(self, *args):
        pass

    def do_POST(self):
        self.rfile.read(int(self.headers["Content-Length"]))
        cls = type(self)
        status, headers, payload = cls.script[min(cls.hits, len(cls.script) - 1)]
        cls.hits += 1
        data = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        for k, v in headers.items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)


OK_REPLY = {"id": "x", "object": "chat.completion", "created": 1, "model": "m",
            "choices": [{"index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": '{"ok": true}'}}]}


@pytest.fixture()
def limited(db, secrets, monkeypatch):
    """Point the OpenAI-compatible provider at _LimitedModel; waits are recorded instead of slept."""
    llm._quirks.clear()
    _LimitedModel.script, _LimitedModel.hits = [], 0
    server = ThreadingHTTPServer(("127.0.0.1", 0), _LimitedModel)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    update_settings({"llm": {"provider": "openai_compatible", "base_url": f"http://127.0.0.1:{server.server_address[1]}/v1",
                             "models": {"openai_compatible": "metisclip"}}})
    secrets.set_secret("llm_api_key", "sk-fake")
    waits: list[float] = []
    monkeypatch.setattr(llm, "_sleep", lambda seconds, should_stop: waits.append(seconds) or False)
    yield waits
    server.shutdown()


def test_daily_quota_stops_without_retrying(limited):
    _LimitedModel.script = [(429, {}, {"error": {"message": ROUTER_TPD, "type": "rate_limit_error"}})]
    with pytest.raises(llm.LLMQuotaExhausted) as info:
        llm.chat_json("s", "u")
    assert _LimitedModel.hits == 1 and limited == []
    msg = str(info.value)
    assert msg.startswith("Kuota harian LLM habis (127.0.0.1 · metisclip). Kuota pulih sekitar 28 menit lagi.")
    assert "pilih model atau penyedia lain di Pengaturan" in msg and "tokens per day" in msg
    assert "tidak dapat dihubungi" not in msg
    in_job = info.value.message("Lalu klik Lanjutkan pada job ini.")
    assert in_job.index("Lanjutkan") < in_job.index("Pesan penyedia")


def test_rate_limit_waits_as_long_as_the_provider_asks(limited):
    _LimitedModel.script = [(429, {"retry-after": "3"}, {"error": {"message": "Rate limit exceeded"}}), (200, {}, OK_REPLY)]
    assert llm.chat_json("s", "u") == {"ok": True}
    assert _LimitedModel.hits == 2 and limited == [3.5]


def test_daily_limit_with_a_short_wait_is_waited_once(limited):
    _LimitedModel.script = [(429, {}, {"error": {"message": "Limit on tokens per day (TPD). Please try again in 5s."}})]
    with pytest.raises(llm.LLMQuotaExhausted, match="Kuota harian"):
        llm.chat_json("s", "u")
    assert _LimitedModel.hits == 2 and limited == [5.5]


def test_repeated_rate_limit_says_so(limited):
    _LimitedModel.script = [(429, {}, {"error": {"message": "Too many requests"}})]
    with pytest.raises(llm.LLMError) as info:
        llm.chat_json("s", "u", retries=2)
    assert not isinstance(info.value, llm.LLMQuotaExhausted)
    assert "batas rate (HTTP 429)" in str(info.value) and "3 percobaan" in str(info.value)
    assert limited == [2.0, 4.0]


def test_server_errors_and_unreachable_endpoints_are_named(limited):
    _LimitedModel.script = [(503, {}, {"error": {"message": "upstream overloaded"}})]
    with pytest.raises(llm.LLMError, match=r"Server LLM sedang bermasalah \(HTTP 503"):
        llm.chat_json("s", "u", retries=1)
    update_settings({"llm": {"base_url": "http://127.0.0.1:9/v1"}})  # nothing listens on port 9
    with pytest.raises(llm.LLMError, match="tidak dapat dihubungi .*Base URL"):
        llm.chat_json("s", "u", retries=0)


def test_connection_check_reports_a_used_up_quota(limited):
    _LimitedModel.script = [(429, {}, {"error": {"message": ROUTER_TPD}})]
    ok, message = llm.test_connection()
    assert not ok and message.startswith("Kuota harian LLM habis")
