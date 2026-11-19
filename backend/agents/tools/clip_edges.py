"""Exact clip edges from the clip's own Whisper words.

The Analyzer picks edges per sentence from the video transcript, whose times are estimates (YouTube
caption lines are interpolated, see `sentences`). The Processor therefore fetches each clip with
EDGE_MARGIN extra seconds on both sides, transcribes that, and moves each edge to a sentence boundary
in the words, never inside a word. Then it trims the clip to those edges.

How an edge is found, best first:
1. Anchors: the transcript's own first words of the clip's first sentence and of the sentence after its
   last one (the Analyzer sends them when the transcript marks a sentence end there). Found in the
   Whisper words near the estimate, they give the Analyzer's sentence exactly, whatever punctuation and
   pauses Whisper produced.
2. The nearest strong boundary: a word ending in . ? ! … (whisper.cpp and recent Groq models keep
   punctuation on the word), or the last word of a Whisper segment whose text ends in punctuation.
3. The nearest weak boundary: the last word of any Whisper segment, or a pause of at least PAUSE seconds.
4. Otherwise the gap between two words nearest to the estimate.
"""
from __future__ import annotations

import difflib
import re
from typing import Any

from backend.agents.tools.brief_match import norm

EDGE_MARGIN = 1.5     # seconds fetched before and after the Analyzer's edges
SEARCH = 1.75         # how far an edge may move to reach a sentence boundary
ANCHOR_SEARCH = 3.0   # how far from the estimate the transcript's words are looked for
ANCHOR_WORDS = 4      # words of an anchor (fewer when the transcript has fewer)
PAUSE = 0.45          # a silence this long counts as a (weak) sentence boundary
SEG_MATCH = 0.6       # a segment's last word, found by its text, may end this far from the segment's end
SEG_NEAR = 0.25       # without a text match, the word ending this close to the segment's end
LEAD_IN = 0.12        # kept before the first word
TAIL = 0.3            # kept after the last word (less when the next word follows sooner)

_END = re.compile(r"[.?!…]+[\"'”’)\]]*$")
_NOTE = re.compile(r"\[[^\]]*\]|\([^)]*\)")   # [tertawa], (musik): not spoken words
# Hesitations that one transcript writes and the other leaves out ("ee kamu pernah dengar" / "Kamu pernah
# dengar"), so they are left out of both before comparing
_FILLERS = frozenset("e ee eee eh ehm em emm eum hmm hm mm ah uh um umm".split())


def _spoken(tokens: list[str]) -> list[str]:
    return [t for t in tokens if t not in _FILLERS and not (len(t) == 1 and t.isalpha())]


def anchor_tokens(text: str) -> list[str]:
    """Normalized spoken words of a transcript text (annotations such as [tertawa] and hesitations left out)."""
    return _spoken(norm(_NOTE.sub(" ", str(text or ""))).split())


def _same(a: str, b: str) -> bool:
    """Two normalized words that a transcript and Whisper may spell differently ("simpel"/"simple")."""
    if a == b:
        return True
    if min(len(a), len(b)) < 4:
        return False
    if a.startswith(b) or b.startswith(a):  # "misal" / "misalnya"
        return True
    return difflib.SequenceMatcher(None, a, b).ratio() >= 0.75


def _tokens(words: list[dict[str, Any]]) -> list[tuple[str, int]]:
    """Normalized tokens of the Whisper words, each with the index of its word ("Satu-satunya" gives two)."""
    return [(tok, k) for k, w in enumerate(words) for tok in _spoken(norm(w["word"]).split())]


def _find(words: list[dict[str, Any]], anchor: str, target: float, first: int = 0) -> int | None:
    """Index of the word where `anchor` starts, nearest to `target` (within ANCHOR_SEARCH), or None.

    A match needs the anchor's first word and all but one of the others (both of a two-word anchor)."""
    want = anchor_tokens(anchor)[:ANCHOR_WORDS]
    n = len(want)
    if n < 2:  # one word ("Oke.") is found almost anywhere
        return None
    toks = _tokens(words)
    best: int | None = None
    for p in range(len(toks) - n + 1):
        k = toks[p][1]
        if k < first or abs(words[k]["start"] - target) > ANCHOR_SEARCH:
            continue
        if p > 0 and toks[p - 1][1] == k:  # the anchor must start at a word's start
            continue
        if not _same(want[0], toks[p][0]):
            continue
        hits = sum(_same(a, toks[p + q][0]) for q, a in enumerate(want))
        if hits < (n if n == 2 else n - 1):
            continue
        if best is None or abs(words[k]["start"] - target) < abs(words[best]["start"] - target):
            best = k
    return best


def _segment_ends(words: list[dict[str, Any]], payload: dict[str, Any] | None) -> dict[int, int]:
    """Word index -> 2 when a Whisper segment ending in punctuation ends on that word, 1 for any other.

    Each segment marks one word: the word with the segment's last text nearest to its end, else the
    word ending nearest to it. Word and segment times disagree by a few tenths of a second, so marking
    every word close to the end would also mark the word before it ("Gitu" in "Gitu ya.")."""
    marks: dict[int, int] = {}
    for seg in (payload or {}).get("segments") or []:
        text = str(seg.get("text", "")).strip()
        toks = norm(text).split()
        if not toks:
            continue
        end = float(seg.get("end", 0) or 0)
        cands = [k for k, w in enumerate(words)
                 if abs(w["end"] - end) <= SEG_MATCH and (norm(w["word"]).split() or [""])[-1] == toks[-1]]
        if not cands:
            cands = [k for k, w in enumerate(words) if abs(w["end"] - end) <= SEG_NEAR]
        if cands:
            k = min(cands, key=lambda k: abs(words[k]["end"] - end))
            marks[k] = max(marks.get(k, 0), 2 if _END.search(text) else 1)
    return marks


def _boundaries(words: list[dict[str, Any]], payload: dict[str, Any] | None) -> tuple[list[int], list[int]]:
    """Per word: end strength (2 sentence end, 1 weak boundary, 0 none) and start strength of the next."""
    marks = _segment_ends(words, payload)
    ends: list[int] = []
    for k, w in enumerate(words):
        nxt = words[k + 1] if k + 1 < len(words) else None
        if _END.search(w["word"]) or marks.get(k) == 2:
            ends.append(2)
        elif marks.get(k) == 1 or (nxt is not None and nxt["start"] - w["end"] >= PAUSE):
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
         total: float, limits: tuple[float | None, float | None] = (None, None),
         anchors: dict[str, str] | None = None) -> tuple[float, float] | None:
    """Edges (seconds in the fetched clip) at sentence boundaries near [t0, t1], or None to keep them.

    `anchors` ({"first": …, "next": …}, either optional) are the transcript's first words of the clip and
    of the sentence after it. `limits` (shortest, longest) is the length a campaign brief accepts: edges
    that would leave it are not used (the Analyzer's edges already fit it)."""
    if len(words) < 2 or t1 <= t0:
        return None
    if min(words[-1]["end"], t1) - max(words[0]["start"], t0) < 0.6 * (t1 - t0):
        return None  # Whisper heard too little of the clip to judge its edges
    anchors = anchors or {}
    ends, starts = _boundaries(words, payload)
    idx = list(range(len(words)))

    i = _find(words, anchors["first"], t0) if anchors.get("first") else None
    if i is None:
        i = _nearest(idx, starts, lambda k: words[k]["start"], t0)
    if i is None:
        later = [k for k in idx if words[k]["start"] >= t0 - 0.25]
        if not later:
            return None
        i = later[0]
    j = None
    if anchors.get("next"):
        m = _find(words, anchors["next"], t1, first=i + 1)
        if m is not None:
            j = m - 1
            while j > i and not _spoken(norm(words[j]["word"]).split()):  # "Eh," opens the next sentence
                j -= 1
    if j is None:
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
    # Whisper now and then leaves out a stretch at either end (once the last 12 s of a 48 s fetch): an
    # edge its words do not reach stays where the Analyzer put it rather than cutting that speech away
    if words[0]["start"] > t0 + SEARCH:
        a = t0
    if words[-1]["end"] < t1 - SEARCH:
        b = t1
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
