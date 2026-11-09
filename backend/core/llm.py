"""The single LLM client (CLAUDE.md rule 2).

The provider (OpenAI, Anthropic, Gemini, xAI, DeepSeek, Qwen or any OpenAI-compatible endpoint) and
its model come from settings (`llm`); each provider's key comes from Credential Manager.
Anthropic uses its Messages API; every other provider uses the OpenAI chat-completions format.

Providers differ in which request parameters they accept (temperature on reasoning models,
max_tokens vs max_completion_tokens, JSON mode, reasoning_effort). A request refused because of
such a parameter is retried without it, and the adjustment is remembered per endpoint and model.
"""
from __future__ import annotations

import json
import logging
import re
import threading
import time
from dataclasses import dataclass
from typing import Any, Callable

from backend.core.llm_providers import PROVIDERS, Provider
from backend.core.secrets import get_secret

logger = logging.getLogger(__name__)

# Extra output tokens for models that think before answering (the thinking counts toward the limit)
REASONING_HEADROOM = 6000
JSON_HINT = "\n\nRespond with a single JSON object only, without prose or code fences."
_NON_TEXT_MODEL = re.compile(
    r"embed|whisper|tts|transcri|dall-e|image|imagen|audio|realtime|moderation|speech|veo|lyria|aqa|rerank|"
    r"computer-use|search-preview|babbage|davinci|-vision-exp",
    re.I,
)


class LLMError(RuntimeError):
    """User-facing LLM failure (message in Bahasa Indonesia)."""


class LLMNotConfigured(LLMError):
    pass


# Transport-level outcomes, mapped to user-facing errors by the callers
class _Auth(Exception):
    pass


class _NotFound(Exception):
    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


class _Rejected(Exception):
    def __init__(self, status: int, detail: str) -> None:
        super().__init__(detail)
        self.status = status
        self.detail = detail


class _Retryable(Exception):
    def __init__(self, rate_limited: bool, detail: str = "") -> None:
        super().__init__(detail)
        self.rate_limited = rate_limited


@dataclass(frozen=True)
class Target:
    provider: Provider
    base_url: str
    model: str
    key: str


def _llm_settings() -> dict:
    from backend.core.settings_store import get_settings

    return get_settings()["llm"]


def target(provider_id: str | None = None, *, key: str | None = None, base_url: str | None = None,
           model: str | None = None) -> Target:
    """Provider, endpoint, model and key for a request (defaults: the active provider in settings)."""
    s = _llm_settings()
    provider = PROVIDERS.get(provider_id or s["provider"])
    if provider is None:
        raise LLMError("Penyedia LLM tidak dikenal. Pilih ulang di Pengaturan.")
    url = (base_url or provider.base_url or s.get("base_url") or "").strip().rstrip("/")
    if not url.startswith(("http://", "https://")):
        raise LLMNotConfigured("Base URL LLM belum diisi di Pengaturan")
    name = (model or (s.get("models") or {}).get(provider.id) or provider.default_model).strip()
    api_key = (key or "").strip() or get_secret(provider.secret)
    if not api_key:
        raise LLMNotConfigured(f"API key LLM ({provider.label}) belum diisi di Pengaturan")
    return Target(provider, url, name, api_key)


def is_configured() -> bool:
    try:
        target()
        return True
    except LLMError:
        return False


def model_name() -> str:
    s = _llm_settings()
    provider = PROVIDERS.get(s["provider"])
    return ((s.get("models") or {}).get(s["provider"]) or (provider.default_model if provider else "")).strip()


def _short(text: str) -> str:
    text = re.sub(r"\s+", " ", text or "").strip()
    return text[:220] + ("…" if len(text) > 220 else "")


def _provider_detail(exc: Exception) -> str:
    """Short upstream error text (e.g. 'model ... does not exist') so the user sees the real cause."""
    body = getattr(exc, "body", None)
    msg = ""
    if isinstance(body, dict):
        err = body.get("error") if isinstance(body.get("error"), dict) else body
        msg = str(err.get("message") or "")
    return _short(msg or str(exc))


def _looks_like_bad_key(detail: str) -> bool:
    d = detail.lower()
    return any(s in d for s in ("api key not valid", "invalid api key", "incorrect api key", "invalid x-api-key",
                                "api_key_invalid", "invalid_api_key", "unauthorized"))


def _parse_json(content: str) -> dict:
    content = (content or "").strip()
    if not content:
        raise ValueError("empty response")
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        # Some providers wrap JSON in ```json fences or add prose
        m = re.search(r"\{.*\}", content, re.S)
        if not m:
            raise
        return json.loads(m.group(0))


# ---------------------------------------------------------------- parameter adaptation

# (base_url, model) -> adjustments learned from refused requests
_quirks: dict[tuple[str, str], dict[str, Any]] = {}
_quirks_lock = threading.Lock()


def _apply_quirks(params: dict[str, Any], q: dict[str, Any] | None) -> None:
    if not q:
        return
    for name in q.get("drop", ()):
        params.pop(name, None)
    swap = q.get("limit_param")
    for name in ("max_tokens", "max_completion_tokens"):
        if swap and name in params and name != swap:
            params[swap] = params.pop(name)
    if q.get("max_limit"):
        for name in ("max_tokens", "max_completion_tokens"):
            if name in params:
                params[name] = min(params[name], q["max_limit"])


def _adapt(params: dict[str, Any], detail: str, key: tuple[str, str]) -> bool:
    """Adjust `params` after a 400 that names a parameter. Returns False when nothing applies."""
    text = detail.lower()
    with _quirks_lock:
        q = _quirks.setdefault(key, {"drop": set()})
        changed = False
        for name in ("response_format", "temperature", "reasoning_effort"):
            if name in params and name in text:
                params.pop(name)
                q["drop"].add(name)
                changed = True
        if "max_tokens" in params and "max_completion_tokens" in text:
            params["max_completion_tokens"] = params.pop("max_tokens")
            q["limit_param"] = "max_completion_tokens"
            changed = True
        elif "max_completion_tokens" in params and "max_completion_tokens" in text:
            params["max_tokens"] = params.pop("max_completion_tokens")
            q["limit_param"] = "max_tokens"
            changed = True
        elif "token" in text:
            # e.g. "max_tokens is too large: 8000. This model supports at most 4096 completion tokens"
            # or "the valid range of max_tokens is [1, 8192]"
            m = re.search(r"(?:at most|maximum(?: value)?(?: is| of)?|less than or equal to|<=)\s*:?\s*(\d{3,6})"
                          r"|\[\s*\d+\s*,\s*(\d{3,6})\s*\]", text)
            limit_name = next((n for n in ("max_tokens", "max_completion_tokens") if n in params), None)
            value = int(m.group(1) or m.group(2)) if m else 0
            if limit_name and 0 < value < params[limit_name]:
                params[limit_name] = value
                q["max_limit"] = value
                changed = True
        return changed


# ---------------------------------------------------------------- OpenAI-format providers

_clients: dict[tuple[str, str, float], Any] = {}
_clients_lock = threading.Lock()


def _openai_client(t: Target, timeout: float):
    from openai import OpenAI

    k = (t.base_url, t.key, timeout)
    with _clients_lock:
        client = _clients.get(k)
        if client is None:
            if len(_clients) > 8:
                _clients.clear()
            client = _clients[k] = OpenAI(api_key=t.key, base_url=t.base_url, max_retries=0, timeout=timeout)
        return client


def _openai_complete(t: Target, system: str, user: str, *, temperature: float, max_tokens: int,
                     json_mode: bool, timeout: float) -> str:
    import openai

    p = t.provider
    limit = max_tokens + (REASONING_HEADROOM if p.reasoning else 0)
    params: dict[str, Any] = {
        "model": t.model,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "temperature": temperature,
        ("max_completion_tokens" if p.completion_tokens else "max_tokens"): limit,
    }
    if p.effort:
        params["reasoning_effort"] = "low"
    if json_mode:
        params["response_format"] = {"type": "json_object"}
    qkey = (t.base_url, t.model)
    _apply_quirks(params, _quirks.get(qkey))
    client = _openai_client(t, timeout)
    for _ in range(5):
        try:
            resp = client.chat.completions.create(**params)
            return (resp.choices[0].message.content or "") if resp.choices else ""
        except openai.AuthenticationError as exc:
            raise _Auth(_provider_detail(exc)) from exc
        except (openai.NotFoundError, openai.PermissionDeniedError) as exc:
            raise _NotFound(_provider_detail(exc)) from exc
        except openai.RateLimitError as exc:
            raise _Retryable(True, _provider_detail(exc)) from exc
        except openai.BadRequestError as exc:
            detail = _provider_detail(exc)
            if _looks_like_bad_key(detail):
                raise _Auth(detail) from exc
            if not _adapt(params, f"{detail} {exc}", qkey):
                raise _Rejected(400, detail) from exc
            logger.info("LLM %s/%s refused a parameter, retrying with %s", p.id, t.model, sorted(params))
        except openai.APIStatusError as exc:
            if exc.status_code in (408, 409, 425, 500, 502, 503, 504, 529):
                raise _Retryable(False, _provider_detail(exc)) from exc
            raise _Rejected(exc.status_code, _provider_detail(exc)) from exc
        except (openai.APITimeoutError, openai.APIConnectionError) as exc:
            raise _Retryable(False, str(exc)) from exc
    raise _Rejected(400, "Parameter permintaan ditolak oleh penyedia")


# ---------------------------------------------------------------- Anthropic (Messages API)

def _anthropic_headers(key: str) -> dict[str, str]:
    return {"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"}


def _anthropic_detail(resp) -> str:
    try:
        err = resp.json().get("error") or {}
        return _short(str(err.get("message") or resp.text))
    except Exception:
        return _short(resp.text)


def _anthropic_complete(t: Target, system: str, user: str, *, temperature: float, max_tokens: int,
                        json_mode: bool, timeout: float) -> str:
    import httpx

    body: dict[str, Any] = {
        "model": t.model,
        "max_tokens": max_tokens,
        "system": system + (JSON_HINT if json_mode else ""),
        "messages": [{"role": "user", "content": user}],
        "temperature": temperature,
    }
    qkey = (t.base_url, t.model)
    _apply_quirks(body, _quirks.get(qkey))
    for _ in range(3):
        try:
            resp = httpx.post(f"{t.base_url}/messages", headers=_anthropic_headers(t.key), json=body, timeout=timeout)
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            raise _Retryable(False, str(exc)) from exc
        if resp.status_code == 200:
            data = resp.json()
            return "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
        detail = _anthropic_detail(resp)
        status = resp.status_code
        if status == 401:
            raise _Auth(detail)
        if status in (403, 404):
            raise _NotFound(detail)
        if status == 429:
            raise _Retryable(True, detail)
        if status in (408, 409, 500, 502, 503, 504, 529):
            raise _Retryable(False, detail)
        if status == 400 and _adapt(body, detail, qkey):
            continue
        raise _Rejected(status, detail)
    raise _Rejected(400, "Parameter permintaan ditolak oleh penyedia")


def _complete(t: Target, system: str, user: str, **kw: Any) -> str:
    fn = _anthropic_complete if t.provider.api == "anthropic" else _openai_complete
    return fn(t, system, user, **kw)


# ---------------------------------------------------------------- public API

def chat_json(
    system: str,
    user: str,
    *,
    temperature: float = 0.2,
    max_tokens: int = 2000,
    retries: int = 3,
    on_retry: Callable[[str], None] | None = None,
    should_stop: Callable[[], bool] | None = None,
) -> dict[str, Any]:
    """JSON answer from the active provider, with retry/backoff on 429, 5xx, timeouts and invalid JSON."""
    t = target()
    label = t.provider.label
    last_exc: Exception | None = None
    for attempt in range(retries + 1):
        if should_stop and should_stop():
            raise LLMError("Dibatalkan")
        try:
            content = _complete(t, system, user, temperature=temperature, max_tokens=max_tokens, json_mode=True, timeout=90.0)
            return _parse_json(content)
        except _Auth as exc:
            raise LLMNotConfigured(f"API key {label} ditolak oleh penyedia. Periksa kembali di Pengaturan.") from exc
        except _NotFound as exc:
            raise LLMError(f"Model atau endpoint LLM tidak tersedia ({label} · {t.model}). Periksa Pengaturan. "
                           f"Pesan penyedia: {exc.detail}") from exc
        except _Rejected as exc:
            raise LLMError(f"{label} menolak permintaan (HTTP {exc.status}): {exc.detail}") from exc
        except _Retryable as exc:
            last_exc = exc
            if attempt >= retries:
                break
            wait = min(30.0, 2.0 * (2**attempt))
            kind = "batas rate (429)" if exc.rate_limited else "gangguan koneksi"
            msg = f"LLM terkena {kind}, mencoba lagi dalam {int(wait)} detik"
            logger.warning("%s: %s", msg, exc)
            if on_retry:
                on_retry(msg)
            time.sleep(wait)
        except (ValueError, json.JSONDecodeError) as exc:
            last_exc = exc
            if attempt >= retries:
                break
            logger.warning("LLM returned invalid JSON (attempt %s): %s", attempt + 1, exc)
    if isinstance(last_exc, (ValueError, json.JSONDecodeError)):
        raise LLMError("LLM mengembalikan respons yang tidak valid") from last_exc
    raise LLMError("LLM tidak dapat dihubungi setelah beberapa percobaan") from last_exc


def list_models(provider_id: str, *, key: str | None = None, base_url: str | None = None) -> list[str]:
    """Text model ids the provider offers for this key (newest first when the provider says so)."""
    import httpx

    t = target(provider_id, key=key, base_url=base_url, model="-")
    if t.provider.api == "anthropic":
        url, headers = f"{t.base_url}/models?limit=1000", _anthropic_headers(t.key)
    else:
        url, headers = f"{t.base_url}/models", {"Authorization": f"Bearer {t.key}"}
    try:
        resp = httpx.get(url, headers=headers, timeout=20.0)
    except (httpx.TimeoutException, httpx.TransportError) as exc:
        raise LLMError(f"Tidak dapat terhubung ke {t.provider.label}") from exc
    if resp.status_code in (401, 403) or (resp.status_code == 400 and _looks_like_bad_key(resp.text)):
        raise LLMError(f"API key {t.provider.label} ditolak")
    if resp.status_code == 404:
        raise LLMError("Penyedia ini tidak menyediakan daftar model. Ketik nama model secara manual.")
    if resp.status_code != 200:
        raise LLMError(f"Daftar model gagal dimuat (HTTP {resp.status_code})")
    try:
        items = resp.json().get("data") or resp.json().get("models") or []
    except ValueError as exc:
        raise LLMError("Daftar model tidak dapat dibaca") from exc
    rows: list[tuple[float, str]] = []
    for item in items:
        mid = str((item or {}).get("id") or (item or {}).get("name") or "")
        if mid.startswith("models/"):
            mid = mid[len("models/"):]
        if not mid or _NON_TEXT_MODEL.search(mid):
            continue
        created = item.get("created") or 0
        if not created and isinstance(item.get("created_at"), str):
            created = float(re.sub(r"\D", "", item["created_at"])[:14] or 0)
        rows.append((float(created or 0), mid))
    seen: set[str] = set()
    out = []
    for _, mid in sorted(rows, key=lambda r: (-r[0], r[1])):
        if mid not in seen:
            seen.add(mid)
            out.append(mid)
    return out


def test_connection(provider_id: str | None = None, api_key: str | None = None) -> tuple[bool, str]:
    """Tiny real request to validate provider + model + key."""
    try:
        t = target(provider_id, key=api_key)
    except LLMNotConfigured as exc:
        return False, str(exc)
    except LLMError as exc:
        return False, str(exc)
    label = t.provider.label
    try:
        _complete(t, "You are a connection check.", "Reply with the single word: ok",
                  temperature=0, max_tokens=16, json_mode=False, timeout=30.0)
        return True, f"Terhubung ke {label} · {t.model}"
    except _Auth:
        return False, f"API key {label} ditolak (401)"
    except _NotFound as exc:
        hint = ""
        try:
            models = list_models(t.provider.id, key=t.key, base_url=t.base_url)
            if models:
                hint = f" Contoh model yang tersedia: {', '.join(models[:5])}."
        except LLMError:
            pass
        return False, f"Model '{t.model}' tidak tersedia: {exc.detail}.{hint}"
    except _Retryable as exc:
        if exc.rate_limited:
            return True, "Key valid, tetapi sedang terkena batas rate (429)"
        return False, f"Tidak dapat terhubung ke {label}"
    except _Rejected as exc:
        return False, f"HTTP {exc.status}: {exc.detail}"
    except Exception as exc:
        return False, f"Gagal: {str(exc)[:200]}"
