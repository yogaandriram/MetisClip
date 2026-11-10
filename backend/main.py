"""MetisClip engine: FastAPI app factory (started by backend/run.py)."""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Callable

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.core import db as dbm
from backend.core.auth import TokenAuthMiddleware
from backend.core.config import config
from backend.core.events import bus

logger = logging.getLogger(__name__)


def create_app(request_shutdown: Callable[[], None] | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        bus.bind_loop(asyncio.get_running_loop())
        yield

    app = FastAPI(
        title="MetisClip Engine",
        version=config.version,
        lifespan=lifespan,
        docs_url="/docs" if config.is_dev else None,
        redoc_url=None,
        openapi_url="/openapi.json" if config.is_dev else None,
    )
    app.state.request_shutdown = request_shutdown or (lambda: None)

    # Starlette: the last middleware added is the outermost. CORS must wrap auth so
    # preflights and 401s still carry CORS headers.
    app.add_middleware(TokenAuthMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.cors_origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(RequestValidationError)
    async def validation_error(_request: Request, exc: RequestValidationError):
        msgs = []
        for e in exc.errors():
            loc = ".".join(str(x) for x in e.get("loc", ()) if x not in ("body", "query", "path"))
            msgs.append(f"{loc}: {e.get('msg')}" if loc else str(e.get("msg")))
        return JSONResponse(status_code=422, content={"detail": "Input tidak valid — " + "; ".join(msgs)})

    @app.exception_handler(Exception)
    async def unhandled(_request: Request, exc: Exception):
        logger.exception("Unhandled error")
        return JSONResponse(status_code=500, content={"detail": f"Terjadi kesalahan internal: {exc}"})

    @app.get("/health", tags=["system"])
    def health():
        ok = dbm.ping()
        return {"status": "ok" if ok else "degraded", "version": config.version, "mongo": ok}

    @app.post("/internal/shutdown", tags=["system"])
    def internal_shutdown():
        logger.info("Shutdown requested by the desktop shell")
        app.state.request_shutdown()
        return {"ok": True}

    from backend.api.routes import agents, brand_templates, clips, dashboard, files, jobs, settings, system, whisper, ws

    for r in (system.router, settings.router, whisper.router, agents.router, brand_templates.router, files.router,
              jobs.router, clips.router, dashboard.router, ws.router):
        app.include_router(r)
    return app
