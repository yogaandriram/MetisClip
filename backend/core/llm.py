"""The single LLM client (CLAUDE.md rule 2).

The provider (OpenAI, Anthropic, Gemini, xAI, DeepSeek, Qwen or any OpenAI-compatible endpoint) and
its model come from settings (`llm`); each provider's key comes from Credential Manager.
Anthropic uses its Messages API; every other provider uses the OpenAI chat-completions format.

Providers differ in which request parameters they accept (temperature on reasoning models,
max_tokens vs max_completion_tokens, JSON mode, reasoning_effort). A request refused because of
such a parameter is retried without it, and the adjustment is remembered per endpoint and model.

Rate limits (HTTP 429): a short limit (per minute) is retried after the wait the provider asks for.
A used-up quota (a daily limit, billing, or a wait of minutes) raises LLMQuotaExhausted at once,
because retrying cannot help and every caller should stop instead of trying the next request.
"""
from __future__ import annotations

import json
import logging
import re
import threading
import time
from dataclasses import dataclass
from email.utils import parsedate_to_datetime
from typing import Any, Callable
from urllib.parse import urlsplit

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


QUOTA_ADVICE = "Untuk lanjut sekarang, pilih model atau penyedia lain di Pengaturan."


class LLMQuotaExhausted(LLMError):
    """The provider's quota is used up (daily limit, billing, or a wait of minutes): retrying now cannot help."""

    def __init__(self, summary: str, detail: str = "", *, advice: str = QUOTA_ADVICE,
                 retry_after: float | None = None) -> None:
        self.summary, self.detail, self.advice, self.retry_after = summary, detail, advice, retry_after
        super().__init__(self.message())

    def message(self, extra: str = "") -> str:
        """User-facing text; `extra` (e.g. what to do in a job) goes before the provider's own message."""
        parts = (self.summary, self.advice, extra, f"Pesan penyedia: {self.detail}" if self.detail else "")
        return " ".join(p for p in parts if p)


# Rate-limit waits up to this long happen inline (per-minute limits reset within a minute);
# a longer wait means the quota is used up for now
MAX_INLINE_WAIT = 65.0


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
    """Worth retrying soon. kind: "rate" (429), "server" (5xx), "timeout" or "network"."""

    def __init__(self, kind: str, detail: str = "", *, status: int | None = None,
                 retry_after: float | None = None, daily: bool = False) -> None:
        super().__init__(detail)
        self.kind = kind
        self.detail = detail
        self.status = status
        self.retry_after = retry_after
        # A daily limit with a short wait (rolling window): worth one wait, not more
        self.daily = daily


class _Quota(Exception):
    """Retrying now cannot help. kind: "daily", "billing" or "wait" (a wait longer than MAX_INLINE_WAIT)."""

    def __init__(self, kind: str, detail: str = "", retry_after: float | None = None) -> None:
        super().__init__(detail)
        self.kind = kind
        self.detail = detail
        self.retry_after = retry_after


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


def _clean_detail(text: str) -> str:
    """Readable provider message for the user.

    Routers such as 9Router put the upstream JSON error inside their own message
    ('[groq/model] [429]: {"error":{"message":"…"}} (reset after 30s)', sometimes cut off):
    keep the route and the inner message. Organization ids and service tiers are dropped."""
    text = text or ""
    inner = re.search(r'"message"\s*:\s*"((?:[^"\\]|\\.)*)"?', text)
    if inner:
        try:
            msg = json.loads(f'"{inner.group(1)}"')
        except ValueError:
            msg = inner.group(1)
        route = re.match(r"\s*(\[[^\]]+\])", text)
        text = f"{route.group(1)} {msg}" if route else msg
    text = re.sub(r"\s+(?:in organization|service tier)\s+`[^`\s]*`?", "", text)
    return _short(text)


def _provider_message(exc: Exception) -> str:
    """The provider's own error text (falls back to the exception text)."""
    body = getattr(exc, "body", None)
    msg = ""
    if isinstance(body, dict):
        err = body.get("error") if isinstance(body.get("error"), dict) else body
        msg = str(err.get("message") or "")
    return msg or str(exc)


def _provider_detail(exc: Exception) -> str:
    """Short upstream error text (e.g. 'model ... does not exist') so the user sees the real cause."""
    return _clean_detail(_provider_message(exc))


# ---------------------------------------------------------------- rate limits and quotas

_DAILY = re.compile(r"per[\s_-]?day|perday|\b(?:tpd|rpd)\b|daily", re.I)
_BILLING = re.compile(r"insufficient[\s_]quota|insufficient[\s_]balance|plan and billing|billing details|"
                      r"credit balance|payment required|out of credits", re.I)
_UNIT = r"(?:ms|milliseconds?|hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)(?![a-z])"
# "Please try again in 27m41.0s" (Groq, OpenAI), "Please retry in 41.2s" / "retryDelay": "41s" (Gemini),
# "(reset after 30s)" (9Router)
_WAIT = re.compile(rf"(?:try again in|retry in|retry after|resets? (?:after|in)|retrydelay\W*)\s*"
                   rf"((?:\d+(?:\.\d+)?\s*{_UNIT}\s*)+)", re.I)
_DURATION = re.compile(rf"(\d+(?:\.\d+)?)\s*({_UNIT})", re.I)


def _unit_seconds(unit: str) -> float:
    u = unit.lower()
    if u == "ms" or u.startswith("milli"):
        return 0.001
    if u.startswith("h"):
        return 3600.0
    if u.startswith("m"):
        return 60.0
    return 1.0


def _header_wait(headers: Any) -> float | None:
    """Retry-After (seconds or an HTTP date) / retry-after-ms, if the response has them."""
    if not headers:
        return None
    try:
        ms = headers.get("retry-after-ms")
        if ms:
            return max(0.0, float(ms) / 1000)
    except (TypeError, ValueError):
        pass
    value = headers.get("retry-after")
    if not value:
        return None
    try:
        return max(0.0, float(value))
    except (TypeError, ValueError):
        pass
    try:
        return max(0.0, parsedate_to_datetime(value).timestamp() - time.time())
    except (TypeError, ValueError):
        return None


def _retry_after(text: str, headers: Any = None) -> float | None:
    """How long the provider asks us to wait (the longest of the headers and the message), or None."""
    waits = [w for w in (_header_wait(headers),) if w is not None]
    for m in _WAIT.finditer(text or ""):
        secs = sum(float(v) * _unit_seconds(u) for v, u in _DURATION.findall(m.group(1)))
        waits.append(secs)
    return max(waits) if waits else None


def _limit_error(status: int, message: str, headers: Any = None, raw: str = "") -> Exception:
    """A 429 / 402: _Retryable (wait briefly, then retry) or _Quota (stop: daily limit, billing, long wait)."""
    text = f"{message} {raw}"
    detail = _clean_detail(message)
    wait = _retry_after(text, headers)
    daily = bool(_DAILY.search(text))
    if wait is not None and wait > MAX_INLINE_WAIT:
        return _Quota("daily" if daily else "wait", detail, wait)
    if wait is None and daily:
        return _Quota("daily", detail)
    # Gemini's per-minute limit also says "check your plan and billing details", but it names a wait
    if wait is None and (status == 402 or _BILLING.search(text)):
        return _Quota("billing", detail)
    return _Retryable("rate", detail, status=status, retry_after=wait, daily=daily)


def _fmt_wait(seconds: float) -> str:
    s = int(round(seconds))
    if s < 60:
        return f"{max(1, s)} detik"
    minutes = round(s / 60)
    if minutes < 60:
        return f"{minutes} menit"
    h, m = divmod(minutes, 60)
    return f"{h} jam" + (f" {m} menit" if m else "")


def _where(t: Target) -> str:
    """'Groq · model' style name for messages; an OpenAI-compatible endpoint is named by its host."""
    name = t.provider.label
    if t.provider.id == "openai_compatible":
        name = urlsplit(t.base_url).hostname or name
    return f"{name} · {t.model}"


def _quota_error(q: _Quota, where: str) -> LLMQuotaExhausted:
    when = f" Kuota pulih sekitar {_fmt_wait(q.retry_after)} lagi." if q.retry_after else ""
    if q.kind == "billing":
        return LLMQuotaExhausted(f"Kuota atau saldo akun LLM habis ({where}).", q.detail,
                                 advice="Periksa paket atau billing di situs penyedia, atau pilih penyedia lain di Pengaturan.")
    if q.kind == "daily":
        return LLMQuotaExhausted(f"Kuota harian LLM habis ({where}).{when}", q.detail, retry_after=q.retry_after)
    return LLMQuotaExhausted(f"Batas pemakaian LLM tercapai ({where}).{when}", q.detail, retry_after=q.retry_after)


def _gave_up(exc: _Retryable, where: str, attempts: int, compatible: bool) -> LLMError:
    """The error after the last retry, named after what actually went wrong."""
    said = f" Pesan penyedia: {exc.detail}" if exc.detail else ""
    if exc.daily:
        return _quota_error(_Quota("daily", exc.detail, exc.retry_after), where)
    if exc.kind == "rate":
        return LLMError(f"LLM terus terkena batas rate (HTTP 429) dari {where} setelah {attempts} percobaan. "
                        f"Coba lagi beberapa menit lagi, atau pilih model lain di Pengaturan.{said}")
    if exc.kind == "server":
        return LLMError(f"Server LLM sedang bermasalah (HTTP {exc.status}, {where}) setelah {attempts} percobaan. "
                        f"Coba lagi nanti.{said}")
    if exc.kind == "timeout":
        return LLMError(f"LLM tidak menjawab dalam batas waktu ({where}), {attempts} kali berturut-turut. "
                        "Coba lagi nanti, atau pilih model yang lebih cepat di Pengaturan.")
    check = "koneksi internet dan Base URL di Pengaturan" if compatible else "koneksi internet"
    return LLMError(f"LLM tidak dapat dihubungi ({where}) setelah {attempts} percobaan. Periksa {check}."
                    + (f" Detail: {exc.detail}" if exc.detail else ""))


def _sleep(seconds: float, should_stop: Callable[[], bool] | None) -> bool:
    """Wait, checking for cancellation. True when cancelled."""
    end = time.monotonic() + seconds
    while True:
        if should_stop and should_stop():
            return True
        left = end - time.monotonic()
        if left <= 0:
            return False
        time.sleep(min(0.5, left))


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
            raise _limit_error(429, _provider_message(exc), getattr(exc.response, "headers", None), str(exc)) from exc
        except openai.BadRequestError as exc:
            detail = _provider_detail(exc)
            if _looks_like_bad_key(detail):
                raise _Auth(detail) from exc
            if _BILLING.search(f"{_provider_message(exc)} {exc}"):
                raise _Quota("billing", detail) from exc
            if not _adapt(params, f"{detail} {exc}", qkey):
                raise _Rejected(400, detail) from exc
            logger.info("LLM %s/%s refused a parameter, retrying with %s", p.id, t.model, sorted(params))
        except openai.APIStatusError as exc:
            if exc.status_code == 402:
                raise _limit_error(402, _provider_message(exc), getattr(exc.response, "headers", None), str(exc)) from exc
            if exc.status_code in (408, 409, 425, 500, 502, 503, 504, 529):
                raise _Retryable("server", _provider_detail(exc), status=exc.status_code) from exc
            raise _Rejected(exc.status_code, _provider_detail(exc)) from exc
        except openai.APITimeoutError as exc:
            raise _Retryable("timeout", str(exc)) from exc
        except openai.APIConnectionError as exc:
            raise _Retryable("network", str(exc)) from exc
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
        except httpx.TimeoutException as exc:
            raise _Retryable("timeout", str(exc)) from exc
        except httpx.TransportError as exc:
            raise _Retryable("network", str(exc)) from exc
        if resp.status_code == 200:
            data = resp.json()
            return "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
        detail = _anthropic_detail(resp)
        status = resp.status_code
        if status == 401:
            raise _Auth(detail)
        if status in (403, 404):
            raise _NotFound(detail)
        if status in (402, 429):
            raise _limit_error(status, detail, resp.headers, resp.text)
        if status in (408, 409, 500, 502, 503, 504, 529):
            raise _Retryable("server", detail, status=status)
        if status == 400 and _BILLING.search(detail):  # "Your credit balance is too low …"
            raise _Quota("billing", detail)
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
    """JSON answer from the active provider.

    Retries 429 (after the wait the provider asks for), 5xx, timeouts and invalid JSON. Raises
    LLMQuotaExhausted without retrying when the quota is used up (daily limit, billing, long wait)."""
    t = target()
    label = t.provider.label
    where = _where(t)
    last_exc: Exception | None = None
    attempts = 0
    daily_waited = False
    for attempt in range(retries + 1):
        if should_stop and should_stop():
            raise LLMError("Dibatalkan")
        attempts += 1
        try:
            content = _complete(t, system, user, temperature=temperature, max_tokens=max_tokens, json_mode=True, timeout=90.0)
            return _parse_json(content)
        except _Auth as exc:
            raise LLMNotConfigured(f"API key {label} ditolak oleh penyedia. Periksa kembali di Pengaturan.") from exc
        except _NotFound as exc:
            raise LLMError(f"Model atau endpoint LLM tidak tersedia ({where}). Periksa Pengaturan. "
                           f"Pesan penyedia: {exc.detail}") from exc
        except _Rejected as exc:
            raise LLMError(f"{label} menolak permintaan (HTTP {exc.status}): {exc.detail}") from exc
        except _Quota as exc:
            logger.warning("LLM quota used up (%s, %s): %s", exc.kind, where, exc.detail)
            raise _quota_error(exc, where) from exc
        except _Retryable as exc:
            last_exc = exc
            if exc.daily:
                if daily_waited:  # the daily limit is still reached after waiting once
                    break
                daily_waited = True
            if attempt >= retries:
                break
            if exc.retry_after is not None:
                wait = min(MAX_INLINE_WAIT, exc.retry_after + 0.5)
            else:
                wait = min(30.0, 2.0 * (2**attempt))
            what = {
                "rate": "LLM terkena batas rate (429)",
                "server": f"Server LLM sedang bermasalah (HTTP {exc.status})",
                "timeout": "LLM tidak menjawab dalam batas waktu",
            }.get(exc.kind, "LLM tidak dapat dihubungi")
            msg = f"{what}, mencoba lagi dalam {_fmt_wait(wait)}"
            logger.warning("%s (%s): %s", msg, where, exc.detail)
            if on_retry:
                on_retry(msg)
            if _sleep(wait, should_stop):
                raise LLMError("Dibatalkan")
        except (ValueError, json.JSONDecodeError) as exc:
            last_exc = exc
            if attempt >= retries:
                break
            logger.warning("LLM returned invalid JSON (attempt %s): %s", attempt + 1, exc)
    if isinstance(last_exc, _Retryable):
        raise _gave_up(last_exc, where, attempts, t.provider.id == "openai_compatible") from last_exc
    raise LLMError("LLM mengembalikan respons yang tidak valid") from last_exc


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
    except _Quota as exc:
        return False, _quota_error(exc, _where(t)).message()
    except _Retryable as exc:
        if exc.daily:
            return False, _quota_error(_Quota("daily", exc.detail, exc.retry_after), _where(t)).message()
        if exc.kind == "rate":
            return True, "Key valid, tetapi sedang terkena batas rate (429). Coba lagi sebentar lagi."
        if exc.kind == "server":
            return False, f"Server {label} sedang bermasalah (HTTP {exc.status}). Coba lagi nanti."
        if exc.kind == "timeout":
            return False, f"{label} tidak menjawab dalam batas waktu"
        return False, f"Tidak dapat terhubung ke {label}"
    except _Rejected as exc:
        return False, f"HTTP {exc.status}: {exc.detail}"
    except Exception as exc:
        return False, f"Gagal: {str(exc)[:200]}"
