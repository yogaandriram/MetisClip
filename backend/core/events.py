"""In-process event bus feeding the WebSocket `/ws/events`.

`publish()` is safe to call from any thread (pipeline workers, render threads).
"""
from __future__ import annotations

import asyncio
import json
import logging
import threading
from typing import Any

logger = logging.getLogger(__name__)


class EventBus:
    def __init__(self) -> None:
        self._loop: asyncio.AbstractEventLoop | None = None
        self._subscribers: set[asyncio.Queue] = set()
        self._lock = threading.Lock()

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=500)
        with self._lock:
            self._subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        with self._lock:
            self._subscribers.discard(q)

    def _deliver(self, message: str) -> None:
        with self._lock:
            subs = list(self._subscribers)
        for q in subs:
            try:
                q.put_nowait(message)
            except asyncio.QueueFull:
                # Slow client: drop the oldest message
                try:
                    q.get_nowait()
                    q.put_nowait(message)
                except Exception:
                    pass

    def publish(self, event: dict[str, Any]) -> None:
        loop = self._loop
        if loop is None or loop.is_closed():
            return
        try:
            message = json.dumps(event, default=str)
        except Exception as exc:
            logger.warning("Unserializable event %s: %s", event.get("type"), exc)
            return
        try:
            running = asyncio.get_running_loop()
        except RuntimeError:
            running = None
        if running is loop:
            self._deliver(message)
        else:
            loop.call_soon_threadsafe(self._deliver, message)


bus = EventBus()


def publish(event: dict[str, Any]) -> None:
    bus.publish(event)


def notice(message: str, level: str = "info") -> None:
    bus.publish({"type": "system.notice", "level": level, "message": message})
