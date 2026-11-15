"""Transcript lines -> sentence units: the granularity at which the Analyzer picks clip edges.

YouTube captions come in fixed-width lines that ignore sentences. One line often holds the end of one
sentence and the start of the next ("awal series itu di Rp2 juta. Oke. Nah,"), and each line's duration
overlaps the next line. A clip cut at line edges therefore starts or ends mid-sentence.

Here the lines are split into words, each word gets a time interpolated inside its line (a line lasts
until the next one starts), and the words are regrouped into sentences at . ? ! … or a long pause.
Captions without punctuation fall back to pieces of at most MAX_UNIT_SECONDS, split at a comma when
there is one. The times are estimates (about ±0.5 s); the Processor snaps the final edges to the
clip's own Whisper words (`clip_edges`).
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

SENTENCE_END = re.compile(r"[.?!…]+[\"'”’)\]]*$")
_SOFT_BREAK = re.compile(r"[,;:]+[\"'”’)\]]*$")
PAUSE_SPLIT = 1.2          # a silence this long ends a unit even without punctuation
MAX_UNIT_SECONDS = 20.0    # unpunctuated captions are split into pieces of at most this length
_DEFAULT_LINE_SECONDS = 2.0


@dataclass(frozen=True)
class Unit:
    id: int
    start: float
    end: float
    text: str
    complete: bool  # ends with . ? ! …


def _timed_words(lines: list[dict[str, Any]]) -> list[tuple[str, float, float]]:
    rows = sorted((ln for ln in lines if str(ln.get("text", "")).strip()), key=lambda ln: float(ln["start"]))
    out: list[tuple[str, float, float]] = []
    for i, line in enumerate(rows):
        start = float(line["start"])
        end = start + (float(line.get("duration") or 0) or _DEFAULT_LINE_SECONDS)
        if i + 1 < len(rows):
            nxt = float(rows[i + 1]["start"])
            if nxt > start:
                end = min(end, nxt)
        tokens = str(line["text"]).split()
        total = sum(len(t) + 1 for t in tokens)
        t = start
        for tok in tokens:
            span = (end - start) * (len(tok) + 1) / total
            out.append((tok, t, t + span))
            t += span
    return out


def build_units(lines: list[dict[str, Any]]) -> list[Unit]:
    """Sentence units with ids 0..n-1 in time order, from transcript entries {text, start, duration}."""
    units: list[Unit] = []
    cur: list[tuple[str, float, float]] = []

    def flush(upto: int | None = None) -> None:
        nonlocal cur
        part, rest = (cur, []) if upto is None else (cur[:upto], cur[upto:])
        if part:
            units.append(Unit(
                id=len(units),
                start=round(part[0][1], 2),
                end=round(part[-1][2], 2),
                text=" ".join(w[0] for w in part),
                complete=bool(SENTENCE_END.search(part[-1][0])),
            ))
        cur = rest

    for word in _timed_words(lines):
        if cur and word[1] - cur[-1][2] >= PAUSE_SPLIT:
            flush()
        cur.append(word)
        if SENTENCE_END.search(word[0]):
            flush()
        elif cur[-1][2] - cur[0][1] >= MAX_UNIT_SECONDS:
            soft = [k + 1 for k, w in enumerate(cur[:-1]) if _SOFT_BREAK.search(w[0])]
            flush(soft[-1] if soft else None)
    flush()
    return units
