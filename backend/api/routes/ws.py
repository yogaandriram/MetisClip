"""WebSocket event stream (token checked by TokenAuthMiddleware)."""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.core.events import bus

router = APIRouter()


@router.websocket("/ws/events")
async def events_ws(ws: WebSocket):
    await ws.accept()
    q = bus.subscribe()

    async def pump() -> None:
        while True:
            msg = await q.get()
            await ws.send_text(msg)

    sender = asyncio.create_task(pump())
    try:
        while True:
            # Keep reading so disconnects are noticed; clients send nothing meaningful
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        sender.cancel()
        bus.unsubscribe(q)
