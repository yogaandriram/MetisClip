"""Exact clip edges from the clip's own Whisper words.

The Analyzer picks edges per sentence from the video transcript, whose times are estimates (YouTube
caption lines are interpolated, see `sentences`). The Processor therefore fetches each clip with
EDGE_MARGIN extra seconds on both sides, transcribes that, and moves each edge to the nearest sentence
boundary in the words, never inside a word. Then it trims the clip to those edges.

Sentence boundaries, strongest first:
- a word ending in . ? ! … (whisper.cpp keeps punctuation on the word), or a word that ends where a
  Whisper segment ending in punctuation ends (Groq words carry no punctuation, its segments do);
- a pause of at least PAUSE seconds.
"""
from __future__ import annotations

import re
from typing import Any

EDGE_MARGIN = 1.5   # seconds fetched before and after the Analyzer's edges
SEARCH = 1.75       # how far an edge may move to reach a sentence boundary
PAUSE = 0.45        # a silence this long counts as a (weak) sentence boundary
LEAD_IN = 0.12      # kept before the first word
TAIL = 0.3          # kept after the last word (less when the next word follows sooner)

_END = re.compile(r"[.?!…]+[\"'”’)\]]*$")


def _boundaries(words: list[dict[str, Any]], payload: dict[str, Any] | None) -> tuple[list[int], list[int]]:
    """Per word: end strength (2 punctuation, 1 pause, 0 none) and start strength of the next sentence."""
    seg_ends = [float(s.get("end", 0) or 0) for s in (payload or {}).get("segments") or []
                if _END.search(str(s.get("text", "")).strip())]
    ends: list[int] = []
    for k, w in enumerate(words):
        nxt = words[k + 1] if k + 1 < len(words) else None
        if _END.search(w["word"]) or any(abs(w["end"] - t) <= 0.25 for t in seg_ends):
            ends.append(2)
        elif nxt is not None and nxt["start"] - w["end"] >= PAUSE:
            ends.append(1)
        else:
            ends.append(0)
    starts = [ends[k - 1] if k > 0 else (1 if words[0]["start"] >= PAUSE else 0) for k in range(len(words))]
    return ends, starts


def _nearest(candidates: list[int], strength: list[int], at, target: float) -> int | None:
    for level in (2, 1):
        pool = [k for k in candidates if strength[k] >= level and abs(at(k) - target) <= SEARCH]
        if pool:
            return min(pool, key=lambda k: abs(at(k) - target))
    return None


def snap(words: list[dict[str, Any]], payload: dict[str, Any] | None, t0: float, t1: float,
         total: float, limits: tuple[float | None, float | None] = (None, None)) -> tuple[float, float] | None:
    """Edges (seconds in the fetched clip) at sentence boundaries near [t0, t1], or None to keep them.

    `limits` (shortest, longest) is the length a campaign brief accepts: edges that would leave it are
    not used (the Analyzer's edges already fit it)."""
    if len(words) < 2 or t1 <= t0:
        return None
    ends, starts = _boundaries(words, payload)
    idx = list(range(len(words)))

    i = _nearest(idx, starts, lambda k: words[k]["start"], t0)
    if i is None:
        later = [k for k in idx if words[k]["start"] >= t0 - 0.25]
        if not later:
            return None
        i = later[0]
    j = _nearest(idx[i:], ends, lambda k: words[k]["end"], t1)
    if j is None:
        before = [k for k in idx[i:] if words[k]["end"] <= t1 + 0.25]
        if not before:
            return None
        j = before[-1]

    a = words[i]["start"] - LEAD_IN
    if i > 0:
        a = max(a, words[i - 1]["end"] + 0.02)
    a = max(0.0, min(a, words[i]["start"]))
    b = words[j]["end"] + TAIL
    if j + 1 < len(words):
        b = min(b, words[j + 1]["start"] - 0.02)
    b = min(total, max(b, words[j]["end"]))
    if b - a < 0.6 * (t1 - t0):
        return None
    lo, hi = limits
    if (lo is not None and b - a < lo) or (hi is not None and b - a > hi):
        return None
    return round(a, 3), round(b, 3)


def shift_words(words: list[dict[str, Any]], offset: float, length: float) -> list[dict[str, Any]]:
    """Words of the fetched clip -> words of the trimmed clip [offset, offset + length]."""
    out: list[dict[str, Any]] = []
    for w in words:
        s, e = w["start"] - offset, w["end"] - offset
        if e <= 0.02 or s >= length - 0.02:
            continue
        out.append({**w, "start": round(max(0.0, s), 3), "end": round(min(length, e), 3)})
    return out
