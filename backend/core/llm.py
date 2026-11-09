"""The single OpenAI-compatible LLM client (CLAUDE.md rule 2).

Provider (base_url, model) comes from settings; the key from Credential Manager.
"""
from __future__ import annotations

import json
import logging
import re
import threading
import time
from typing import Any, Callable

from backend.core.secrets import get_secret

logger = logging.getLogger(__name__)


class LLMError(RuntimeError):
    """User-facing LLM failure (message in Bahasa Indonesia)."""


class LLMNotConfigured(LLMError):
    pass


_lock = threading.Lock()
_client = None
_client_key: tuple[str, str] | None = None


def _llm_settings() -> dict:
    from backend.core.settings_store import get_settings

    return get_settings()["llm"]


def get_client():
    """Shared OpenAI client, rebuilt only when base_url or key change."""
    global _client, _client_key
    from openai import OpenAI

    s = _llm_settings()
    key = get_secret("llm_api_key")
    if not key:
        raise LLMNotConfigured("API key LLM belum diisi di Pengaturan")
    base_url = s["base_url"].rstrip("/")
    with _lock:
        if _client is None or _client_key != (base_url, key):
            _client = OpenAI(api_key=key, base_url=base_url, max_retries=0, timeout=90.0)
            _client_key = (base_url, key)
        return _client


def model_name() -> str:
    return _llm_settings()["model"]


def _provider_detail(exc: Exception) -> str:
    """Short upstream error text (e.g. 'model ... does not exist') so the user sees the real cause."""
    body = getattr(exc, "body", None)
    msg = ""
    if isinstance(body, dict):
        err = body.get("error") if isinstance(body.get("error"), dict) else body
        msg = str(err.get("message") or "")
    if not msg:
        msg = str(exc)
    msg = re.sub(r"\s+", " ", msg).strip()
    return msg[:220] + ("…" if len(msg) > 220 else "")


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
    """Chat completion in JSON mode with retry/backoff on 429, 5xx and timeouts."""
    import openai

    client = get_client()
    model = model_name()
    last_exc: Exception | None = None
    for attempt in range(retries + 1):
        if should_stop and should_stop():
            raise LLMError("Dibatalkan")
        try:
            kwargs: dict[str, Any] = dict(
                model=model,
                messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                temperature=temperature,
                max_tokens=max_tokens,
            )
            try:
                resp = client.chat.completions.create(response_format={"type": "json_object"}, **kwargs)
            except openai.BadRequestError as exc:
                # Endpoint without JSON mode support: retry once without it
                if "response_format" in str(exc).lower():
                    resp = client.chat.completions.create(**kwargs)
                else:
                    raise
            content = resp.choices[0].message.content or ""
            return _parse_json(content)
        except openai.AuthenticationError as exc:
            raise LLMNotConfigured("API key LLM ditolak oleh penyedia. Periksa kembali di Pengaturan.") from exc
        except (openai.NotFoundError, openai.PermissionDeniedError) as exc:
            raise LLMError(f"Model atau endpoint LLM tidak tersedia ({model}). Periksa Pengaturan. "
                           f"Pesan penyedia: {_provider_detail(exc)}") from exc
        except openai.APIStatusError as exc:
            if exc.status_code in (408, 409, 425, 500, 502, 503, 504) and attempt < retries:
                last_exc = exc
                time.sleep(min(30.0, 2.0 * (2**attempt)))
                continue
            raise LLMError(f"LLM menolak permintaan (HTTP {exc.status_code}): {_provider_detail(exc)}") from exc
        except (openai.RateLimitError, openai.APITimeoutError, openai.APIConnectionError, openai.InternalServerError) as exc:
            last_exc = exc
            if attempt >= retries:
                break
            wait = min(30.0, 2.0 * (2**attempt))
            kind = "batas rate (429)" if isinstance(exc, openai.RateLimitError) else "gangguan koneksi"
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


def test_connection(api_key: str | None = None) -> tuple[bool, str]:
    """Cheap request to validate base_url + model + key."""
    from openai import OpenAI
    import openai

    s = _llm_settings()
    key = api_key or get_secret("llm_api_key")
    if not key:
        return False, "API key LLM belum diisi"
    client = OpenAI(api_key=key, base_url=s["base_url"].rstrip("/"), max_retries=0, timeout=30.0)
    try:
        client.chat.completions.create(
            model=s["model"],
            messages=[{"role": "user", "content": "Reply with the single word: ok"}],
            max_tokens=5,
            temperature=0,
        )
        return True, f"Terhubung ke {s['model']}"
    except openai.AuthenticationError:
        return False, "API key ditolak (401)"
    except (openai.NotFoundError, openai.PermissionDeniedError) as exc:
        return False, f"Model '{s['model']}' tidak tersedia: {_provider_detail(exc)}"
    except openai.RateLimitError:
        return True, "Key valid, tetapi sedang terkena batas rate (429)"
    except openai.APIStatusError as exc:
        return False, f"HTTP {exc.status_code}: {_provider_detail(exc)}"
    except openai.APIConnectionError:
        return False, "Tidak dapat terhubung ke endpoint LLM"
    except Exception as exc:
        return False, f"Gagal: {str(exc)[:200]}"
