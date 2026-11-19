"""012_caption_speaker_marks: caption words lose the marks nobody says (2026-11-19).

whisper.cpp writes "-" where the speaker changes ("- Itu si Cair banget tuh."), and each such dash
became a caption word of its own (QA: 20 of 112 words of an uploaded clip). YouTube's ">>" for the same,
an ellipsis for a pause and music notes could do the same. New clips leave them out
(`agents/tools/whisper.caption_word`); this removes them from the words of existing clips, and strips
the mark where it is glued to a word ("-Itu" -> "Itu"). A minus before a number ("-5") and a cut-off word
("sa-") stay. Rendered videos are not touched: the next export of such a clip uses the cleaned words.

The rules are copied here, not imported, so this migration keeps doing what it did if they change later.
"""
from __future__ import annotations

import re
from typing import Any

from pymongo.database import Database

_NOT_SPOKEN = re.compile(r"^(?:[-–—]+|>{2,}|\.{2,}|…+|[♪♫]+)$")
_TURN_MARK = re.compile(r"^(?:[-–—]+|>{2,})(?=[^\W\d_])")
# Clips with a word that starts with one of the marks (the exact rules are applied in Python)
_CANDIDATE = {"subtitle.words.word": {"$regex": "^\\s*(?:[-–—]|>>|\\.\\.|…|♪|♫)"}}


def clean_words(words: list[Any]) -> list[Any]:
    out: list[Any] = []
    for w in words:
        if not isinstance(w, dict):
            out.append(w)
            continue
        text = str(w.get("word") or "").strip()
        if text and _NOT_SPOKEN.match(text):
            continue
        fixed = _TURN_MARK.sub("", text)
        out.append({**w, "word": fixed} if fixed != w.get("word") and fixed else w)
    return out


def up(db: Database) -> None:
    for clip in db.clips.find(_CANDIDATE, {"subtitle.words": 1}):
        words = (clip.get("subtitle") or {}).get("words")
        if not isinstance(words, list):
            continue
        cleaned = clean_words(words)
        if cleaned != words:
            db.clips.update_one({"_id": clip["_id"]}, {"$set": {"subtitle.words": cleaned}})
