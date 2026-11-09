"""AI subtitle settings: keywords to highlight and emojis, picked by the LLM in one call per clip.

The result is stored on the subtitle words (`keyword: true`, `emoji: "🔥"`), so it stays editable
in the clip editor and is rendered by the shared caption presets (frontend/lib/presets).
Filler-word and pause removal need no LLM: they are computed from word timings at display/render
time (frontend/lib/presets/captions.ts).
"""
from __future__ import annotations

import re
import unicodedata
from typing import Any, Callable

from backend.core import llm

MAX_WORDS = 800
KEYWORD_RATIO = 5  # at most one keyword per 5 words
EMOJI_RATIO = 10  # at most one emoji per 10 words

# Same list as frontend/lib/presets/captions.ts (repeated letters are collapsed first: "hmmm" -> "hm").
_FILLERS = {"e", "eh", "ehm", "em", "m", "hm", "um", "uh", "uhm", "ah", "erm", "er", "eu", "ehe", "ee"}


def _token(word: str) -> str:
    return re.sub(r"[^a-z0-9]", "", unicodedata.normalize("NFKD", word or "").lower())


def is_filler(word: str) -> bool:
    t = _token(word)
    if not t or len(t) > 6:
        return False
    return t in _FILLERS or re.sub(r"(.)\1+", r"\1", t) in _FILLERS


def valid_emoji(value: Any) -> str | None:
    """A short pictographic emoji (no letters/digits), else None."""
    if not isinstance(value, str):
        return None
    e = value.strip()
    if not e or len(e) > 8:
        return None
    if any(ch.isalnum() for ch in e if ord(ch) < 0x2000):
        return None
    if not any(unicodedata.category(ch) == "So" or 0x1F000 <= ord(ch) <= 0x1FAFF for ch in e):
        return None
    return e


def _prompt(keywords: bool, emojis: bool) -> str:
    tasks = []
    shape = []
    if keywords:
        tasks.append(
            '- "keywords": nomor kata paling penting untuk DISOROT: kata benda kunci, angka, kata emosional, '
            "atau punchline. Paling banyak 1 dari setiap 5 kata. Jangan pilih kata sambung, kata ganti, "
            "kata depan, atau kata pengisi (eh, hmm)."
        )
        shape.append('"keywords": [3, 17]')
    if emojis:
        tasks.append(
            '- "emojis": emoji Unicode standar yang cocok dengan makna kalimat, ditempel di nomor kata tempat '
            "emoji itu paling pas muncul. Paling banyak 1 emoji per kalimat dan 1 dari setiap 10 kata. "
            "Lewati kalimat yang tidak butuh emoji."
        )
        shape.append('"emojis": [{"index": 3, "emoji": "🔥"}]')
    return (
        "Kamu editor subtitle video pendek (TikTok, Reels, Shorts). Kamu menerima kata-kata subtitle "
        "bernomor dalam format [nomor]kata, sesuai urutan bicara.\n"
        + "\n".join(tasks)
        + "\nJawab hanya dengan JSON: {" + ", ".join(shape) + "}"
    )


def _index(value: Any, n: int) -> int | None:
    try:
        i = int(value)
    except (TypeError, ValueError):
        return None
    return i if 0 <= i < n else None


def enrich_words(
    words: list[dict[str, Any]],
    *,
    keywords: bool,
    emojis: bool,
    should_stop: Callable[[], bool] | None = None,
) -> tuple[list[dict[str, Any]], int, int]:
    """Mark keywords and/or attach emojis. Replaces earlier marks of the requested kinds only.

    Returns (words, keyword_count, emoji_count). Raises llm.LLMError (Indonesian message) on failure.
    """
    if not words or not (keywords or emojis):
        return words, sum(1 for w in words if w.get("keyword")), sum(1 for w in words if w.get("emoji"))

    sample = words[:MAX_WORDS]
    numbered = " ".join(f"[{i}]{(w.get('word') or '').strip()}" for i, w in enumerate(sample))
    res = llm.chat_json(
        _prompt(keywords, emojis),
        f"Kata subtitle ({len(sample)} kata):\n{numbered}",
        temperature=0.3,
        max_tokens=1200,
        retries=2,
        should_stop=should_stop,
    )

    n = len(sample)
    kw: list[int] = []
    if keywords:
        seen: set[int] = set()
        for v in res.get("keywords") or []:
            i = _index(v, n)
            if i is None or i in seen:
                continue
            word = sample[i].get("word") or ""
            if is_filler(word) or len(_token(word)) < 2:
                continue
            seen.add(i)
            kw.append(i)
        kw = kw[: max(1, n // KEYWORD_RATIO)]

    em: dict[int, str] = {}
    if emojis:
        for item in res.get("emojis") or []:
            if isinstance(item, dict):
                i, e = _index(item.get("index"), n), valid_emoji(item.get("emoji"))
            elif isinstance(item, (list, tuple)) and len(item) == 2:
                i, e = _index(item[0], n), valid_emoji(item[1])
            else:
                continue
            if i is not None and e and i not in em:
                em[i] = e
        em = dict(sorted(em.items())[: max(1, n // EMOJI_RATIO)])

    kw_set = set(kw)
    out: list[dict[str, Any]] = []
    for i, w in enumerate(words):
        item = dict(w)
        if keywords:
            if i in kw_set:
                item["keyword"] = True
            else:
                item.pop("keyword", None)
        if emojis:
            if i in em:
                item["emoji"] = em[i]
            else:
                item.pop("emoji", None)
        out.append(item)
    return out, sum(1 for w in out if w.get("keyword")), sum(1 for w in out if w.get("emoji"))
