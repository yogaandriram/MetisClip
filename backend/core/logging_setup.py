"""Engine logging: rotating file in <APPDATA>\\logs\\engine.log + stderr, with secret redaction.

stdout is reserved for the single ready line (see backend/run.py).
"""
from __future__ import annotations

import logging
import re
import sys
from logging.handlers import RotatingFileHandler

from backend.core.paths import get_paths

_PATTERNS = [
    re.compile(r"(token=)[^&\s\"']+", re.I),
    re.compile(r"(Bearer\s+)[A-Za-z0-9._\-]+", re.I),
    re.compile(r"\b(sk-[A-Za-z0-9_\-]{8})[A-Za-z0-9_\-]+"),
    re.compile(r"\b(gsk_[A-Za-z0-9]{4})[A-Za-z0-9]+"),
    re.compile(r"\b(AIza[0-9A-Za-z_\-]{4})[0-9A-Za-z_\-]+"),
    re.compile(r"(mongodb://[^:/\s]+:)[^@\s]+(@)"),
]


class RedactFilter(logging.Filter):
    def __init__(self) -> None:
        super().__init__()
        self.extra: list[str] = []

    def add_secret(self, value: str) -> None:
        if value and len(value) >= 6 and value not in self.extra:
            self.extra.append(value)

    def _redact(self, text: str) -> str:
        for pat in _PATTERNS:
            if pat.groups >= 2:
                text = pat.sub(lambda m: m.group(1) + "***" + m.group(2), text)
            else:
                text = pat.sub(lambda m: m.group(1) + "***", text)
        for s in self.extra:
            text = text.replace(s, "***")
        return text

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            msg = record.getMessage()
        except Exception:
            return True
        red = self._redact(msg)
        if red != msg:
            record.msg = red
            record.args = ()
        return True


redactor = RedactFilter()
_configured = False


def setup_logging(level: int = logging.INFO) -> None:
    global _configured
    if _configured:
        return
    _configured = True
    paths = get_paths()
    paths.logs_dir.mkdir(parents=True, exist_ok=True)

    fmt = logging.Formatter("%(asctime)s %(levelname)-7s %(name)s: %(message)s")
    root = logging.getLogger()
    root.setLevel(level)

    fh = RotatingFileHandler(paths.logs_dir / "engine.log", maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8")
    fh.setFormatter(fmt)
    fh.addFilter(redactor)
    root.addHandler(fh)

    if sys.stderr is not None:
        sh = logging.StreamHandler(sys.stderr)
        sh.setFormatter(fmt)
        sh.addFilter(redactor)
        root.addHandler(sh)

    for noisy in ("uvicorn.access", "httpx", "httpcore", "pymongo", "urllib3", "openai", "groq", "multipart"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    logging.getLogger("uvicorn").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.error").setLevel(logging.WARNING)
