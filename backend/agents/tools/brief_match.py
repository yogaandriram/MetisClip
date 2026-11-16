"""Words a campaign brief requires or bans, found in a transcript without an LLM.

Used by the Analyzer (a clip must say every `must_include` term and none of the `banned_words`), the
Processor (required terms become highlighted subtitle keywords) and the brief check of a finished clip.

Transcripts misspell names ("toko pedia", "Tokopedia", "tokopidia"), so a term matches:
- as whole words, ignoring case, accents and punctuation;
- with the spaces removed (terms of 5+ characters), so a name split in two still counts;
- for required terms only, approximately (similarity >= 0.85, terms of 5+ characters).
Banned words are matched strictly: a near miss must not fail a clip.
"""
from __future__ import annotations

import re
import unicodedata
from difflib import SequenceMatcher
from typing import Any, Iterable

FUZZY_RATIO = 0.85
MIN_LOOSE_LEN = 5
DURATION_TOLERANCE = 0.5   # seconds a clip may be off a brief's duration and still meet it


def length_range(brief: dict[str, Any] | None) -> tuple[float | None, float | None]:
    """The clip length a brief accepts, tolerance included: (shortest, longest), None = no limit."""
    dur = (brief or {}).get("duration") or {}
    lo, hi = dur.get("min"), dur.get("max")
    return (float(lo) - DURATION_TOLERANCE if lo else None, float(hi) + DURATION_TOLERANCE if hi else None)


def within(seconds: float, limits: tuple[float | None, float | None]) -> bool:
    lo, hi = limits
    return (lo is None or seconds >= lo) and (hi is None or seconds <= hi)


def norm(text: str) -> str:
    """Lowercase ASCII words separated by single spaces."""
    t = unicodedata.normalize("NFKD", str(text or "")).encode("ascii", "ignore").decode().lower()
    return " ".join(re.sub(r"[^a-z0-9]+", " ", t).split())


class TextIndex:
    """A text prepared once for many term lookups."""

    def __init__(self, text: str):
        self.norm = norm(text)
        self.tokens = self.norm.split()
        self.padded = f" {self.norm} "
        self.compact = self.norm.replace(" ", "")

    def has(self, term: str, *, fuzzy: bool = True) -> bool:
        t = norm(term)
        if not t:
            return False
        if f" {t} " in self.padded:
            return True
        tc = t.replace(" ", "")
        if len(tc) < MIN_LOOSE_LEN:
            return False
        if tc in self.compact:
            # A split name ("toko pedia") or one glued to its neighbour: the match must start and end on
            # word edges, so "brand" is not found inside "rebranding"
            return _on_word_edges(self.tokens, tc)
        if not fuzzy:
            return False
        n = len(t.split())
        for size in {max(1, n - 1), n, n + 1}:
            for k in range(0, max(0, len(self.tokens) - size + 1)):
                window = "".join(self.tokens[k:k + size])
                if abs(len(window) - len(tc)) <= max(2, len(tc) // 5) and \
                        SequenceMatcher(None, window, tc).ratio() >= FUZZY_RATIO:
                    return True
        return False


def _on_word_edges(tokens: list[str], compact_term: str) -> bool:
    for k in range(len(tokens)):
        joined = ""
        for tok in tokens[k:]:
            joined += tok
            if joined == compact_term:
                return True
            if len(joined) >= len(compact_term):
                break
    return False


def found_terms(text: str | TextIndex, terms: Iterable[str], *, fuzzy: bool = True) -> list[str]:
    idx = text if isinstance(text, TextIndex) else TextIndex(text)
    return [t for t in terms if t and idx.has(t, fuzzy=fuzzy)]


def missing_terms(text: str | TextIndex, terms: Iterable[str]) -> list[str]:
    """Required terms the text does not say."""
    idx = text if isinstance(text, TextIndex) else TextIndex(text)
    return [t for t in terms if t and not idx.has(t, fuzzy=True)]


def banned_found(text: str | TextIndex, words: Iterable[str]) -> list[str]:
    """Banned words the text says (strict matching)."""
    return found_terms(text, words, fuzzy=False)


def words_text(words: list[dict[str, Any]]) -> str:
    return " ".join(str(w.get("word") or "") for w in words)


def term_word_indices(words: list[dict[str, Any]], terms: Iterable[str]) -> set[int]:
    """Indices of the subtitle words that say one of `terms` (to highlight them as keywords)."""
    toks = [norm(str(w.get("word") or "")).replace(" ", "") for w in words]
    hits: set[int] = set()
    for term in terms:
        t = norm(term)
        tc = t.replace(" ", "")
        if not tc:
            continue
        n = len(t.split())
        for size in sorted({max(1, n - 1), n, n + 1}):
            for k in range(0, max(0, len(toks) - size + 1)):
                window = "".join(toks[k:k + size])
                if not window:
                    continue
                if window == tc or (len(tc) >= MIN_LOOSE_LEN and abs(len(window) - len(tc)) <= max(2, len(tc) // 5)
                                    and SequenceMatcher(None, window, tc).ratio() >= FUZZY_RATIO):
                    hits.update(range(k, k + size))
    return hits
