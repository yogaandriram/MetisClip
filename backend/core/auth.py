"""Per-launch token check for every HTTP and WebSocket route (CLAUDE.md §3.4, rule 7)."""
from __future__ import annotations

import hmac
import json
from urllib.parse import parse_qs

from backend.core.config import config

_PUBLIC_HTTP = {("GET", "/health")}
_DEV_PUBLIC = {"/docs", "/openapi.json", "/redoc", "/docs/oauth2-redirect"}


def _token_ok(candidate: str | None) -> bool:
    expected = config.token
    if not expected or not candidate:
        return False
    return hmac.compare_digest(candidate.encode(), expected.encode())


def _extract(scope) -> str | None:
    for name, value in scope.get("headers") or []:
        if name == b"authorization":
            v = value.decode("latin-1")
            if v.lower().startswith("bearer "):
                return v[7:].strip()
    qs = parse_qs((scope.get("query_string") or b"").decode("latin-1"))
    vals = qs.get("token")
    return vals[0] if vals else None


class TokenAuthMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        kind = scope["type"]
        if kind not in ("http", "websocket"):
            return await self.app(scope, receive, send)
        path = scope.get("path", "")
        if kind == "http":
            method = scope.get("method", "GET")
            if method == "OPTIONS" or (method, path) in _PUBLIC_HTTP or (config.is_dev and path in _DEV_PUBLIC):
                return await self.app(scope, receive, send)
        if _token_ok(_extract(scope)):
            return await self.app(scope, receive, send)

        if kind == "websocket":
            await send({"type": "websocket.close", "code": 4401})
            return
        body = json.dumps({"detail": "Token tidak valid"}).encode()
        await send(
            {
                "type": "http.response.start",
                "status": 401,
                "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())],
            }
        )
        await send({"type": "http.response.body", "body": body})
