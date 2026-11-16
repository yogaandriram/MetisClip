"""Speaker name tag (layout `speaker`): who is talking in a clip, suggested by the LLM on request.

The LLM reads the video title, the channel name and the clip's own words. Only names that actually
appear in that text are kept (every significant word of the name must be there), so it cannot put
an invented or guessed name on someone. The user picks a suggestion in the clip editor; nothing is
saved here.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Any

from backend.core import llm

MAX_WORDS = 600
MAX_SPEAKERS = 3
MAX_ROLE = 40

# Honorifics and degrees: not enough on their own to ground a name ("dr." alone proves nothing).
_TITLES = {
    "dr", "drg", "prof", "ir", "h", "hj", "kh", "ust", "ustadz", "ustaz", "ustazah", "habib", "gus",
    "bapak", "pak", "ibu", "bu", "mas", "mbak", "kak", "bang", "coach", "sir", "mr", "mrs", "ms",
    "st", "se", "mm", "mba", "msc", "phd", "sp", "spog", "spa", "spkj", "md", "mt", "mpd", "spsi",
}

_PROMPT = (
    "Kamu membantu memberi label nama pembicara pada klip video pendek. Kamu menerima judul video, "
    "nama channel, dan kata-kata yang diucapkan di klip.\n"
    "Tugas: sebutkan orang yang kemungkinan berbicara di klip ini (tamu atau host), paling banyak 3, "
    "yang paling mungkin lebih dulu.\n"
    "Aturan:\n"
    "- Pakai hanya nama yang tertulis di judul, nama channel, atau ucapan. Jangan menebak nama dari "
    "pengetahuanmu sendiri.\n"
    '- Tulis nama seperti di judul, dengan gelar bila ada (misal "dr. Andi Pratama").\n'
    '- "role": keterangan singkat (maks 40 karakter) seperti profesi, jabatan, atau "Host", hanya bila '
    "tersirat dari judul atau ucapan; selain itu kosongkan.\n"
    "- Jika tidak ada nama orang sama sekali, jawab daftar kosong.\n"
    'Jawab hanya dengan JSON: {"speakers": [{"name": "...", "role": "..."}]}'
)


def _tokens(text: str) -> list[str]:
    plain = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode().lower()
    return re.findall(r"[a-z0-9]+", plain)


def grounded(name: str, haystack: set[str]) -> bool:
    """Every significant word of the name (3+ letters, not an honorific) appears in the source text."""
    words = [t for t in _tokens(name) if len(t) >= 3 and t not in _TITLES]
    return bool(words) and all(t in haystack for t in words)


def _clean(value: Any, limit: int) -> str:
    return " ".join(value.split())[:limit].strip() if isinstance(value, str) else ""


def suggest_speakers(title: str, channel: str, words: list[dict[str, Any]], hook: str = "") -> list[dict[str, str]]:
    """Up to 3 {name, role} suggestions, most likely first. Raises llm.LLMError (message in the UI language)."""
    spoken = " ".join((w.get("word") or "").strip() for w in words[:MAX_WORDS]).strip()
    res = llm.chat_json(
        _PROMPT,
        f"Judul video: {title or '-'}\nChannel: {channel or '-'}\nUcapan di klip:\n{spoken or hook or '-'}",
        temperature=0.2,
        max_tokens=600,
        retries=2,
    )
    haystack = set(_tokens(" ".join([title or "", channel or "", spoken, hook or ""])))
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for item in res.get("speakers") or []:
        if not isinstance(item, dict):
            continue
        name = _clean(item.get("name"), 60)
        key = " ".join(_tokens(name))
        if not name or key in seen or not grounded(name, haystack):
            continue
        seen.add(key)
        out.append({"name": name, "role": _clean(item.get("role"), MAX_ROLE)})
        if len(out) >= MAX_SPEAKERS:
            break
    return out
