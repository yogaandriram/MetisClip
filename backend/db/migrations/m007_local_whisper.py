"""007_local_whisper: speech-to-text gains a built-in local engine (2026-11-10).

Before: whisper = {provider: "groq", model}; Groq was the only engine and stored settings always
said "groq".
After:  whisper = {provider: "auto" | "local" | "groq", model, local_model}. "auto" uses Groq while a
key is set and Groq answers, and the local whisper.cpp engine otherwise, so the old implicit
"groq" becomes "auto": users with a key keep Groq and gain the offline fallback.
"""
from __future__ import annotations

from pymongo.database import Database


def up(db: Database) -> None:
    db.app_settings.update_one({"_id": "settings", "whisper.provider": "groq"}, {"$set": {"whisper.provider": "auto"}})
