"""Speaker name tag (layout `speaker`): who is talking in a clip, suggested by the LLM on request.

The LLM reads the video title, the channel name and the clip's own words. Only names that actually
appear in that text are kept (every significant word of the name must be there), so it cannot put
an invented or guessed name on someone. The user picks a suggestion in the clip editor; nothing is
saved here.

QA 2026-11-19 asked 8 times per clip (9Router route `metisclip`): a channel named "Sepulang Sekolah"
came back as the host in 11 of 16 answers (the rest empty), "Son" from "Risyad and Son" as a second
host, and "Cair" ("Itu si Cair banget tuh") as a name in 3 of 8. The prompt now says that channel and
show names are not people, that a name in the speech must be used for a person (a greeting, an
introduction), and that an empty list is a normal answer; the call runs at temperature 0. Same test:
"Sepulang Sekolah" never, "Son" never, "Cair" 1 of 8; real names kept every time (a guest in the
title, a channel named after its host, "Makasih, Mas Fajar" in the speech).
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
    "Kamu memberi label nama pembicara pada klip video pendek. Kamu menerima judul video, nama channel, "
    "dan kata-kata yang diucapkan di klip (transkripsi otomatis, bisa salah dengar).\n"
    "Tugas: sebutkan orang yang kemungkinan berbicara di klip ini (tamu atau host), paling banyak 3, "
    "yang paling mungkin lebih dulu.\n"
    "Aturan:\n"
    "- Hanya nama orang yang tertulis di judul, nama channel, atau ucapan. Jangan menebak nama dari "
    "pengetahuanmu sendiri.\n"
    "- Nama channel, acara, rubrik, atau perusahaan bukan nama orang (misal \"Ngobrol Sore\", "
    "\"Belajar Bareng Kita\", \"Kabar Pagi\"). Ambil nama dari channel hanya bila channel itu memakai nama "
    "orang, dan hanya bagian yang nama orang: dari \"Budi and Friends\" ambil \"Budi\" saja.\n"
    "- Dari ucapan, ambil nama hanya bila jelas dipakai untuk orang: menyapa (\"Makasih, Mas Andi\"), "
    "memperkenalkan diri (\"saya Andi\"), atau menyebut orang yang bicara. Kata yang bisa berarti sifat, "
    "keadaan, atau benda bukan nama, walau ditulis dengan huruf besar atau didahului \"si\" (misal "
    "\"si Cuek banget\", \"si Kalem\").\n"
    "- Tulis nama dengan huruf besar-kecil yang wajar dan gelar dalam bentuk lazimnya (misal "
    "\"dr. Andi Pratama\"), walau judulnya ditulis dengan huruf kapital semua.\n"
    "- \"role\": keterangan singkat (maks 40 karakter) dalam bahasa ucapan di klip, seperti profesi, "
    "jabatan, \"Host\", atau \"Tamu\", hanya bila tersirat dari judul atau ucapan; selain itu kosongkan.\n"
    "- Daftar kosong adalah jawaban yang benar bila tidak ada nama orang. Ini sering terjadi.\n"
    'Jawab hanya dengan JSON: {"speakers": [{"name": "...", "role": "..."}]}'
)


def _tokens(text: str) -> list[str]:
    plain = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode().lower()
    return re.findall(r"[a-z0-9]+", plain)


def grounded(name: str, haystack: set[str]) -> bool:
    """Every significant word of the name (3+ letters, not an honorific) appears in the source text."""
    words = _significant(name)
    return bool(words) and all(t in haystack for t in words)


def _significant(name: str) -> list[str]:
    return [t for t in _tokens(name) if len(t) >= 3 and t not in _TITLES]


def _clean(value: Any, limit: int) -> str:
    return " ".join(value.split())[:limit].strip() if isinstance(value, str) else ""


def _tidy_case(name: str) -> str:
    """A name copied from an all-caps title ("DR. TIRTA") in normal case ("Dr. Tirta")."""
    letters = [ch for ch in name if ch.isalpha()]
    if len(letters) < 4 or name != name.upper():
        return name
    return " ".join(w[:1].upper() + w[1:].lower() for w in name.split())


# Informal ways to address someone, not part of a name tag: "Mas Fajar" and "Fajar" are one label
_ADDRESS = {"si", "mas", "mbak", "mba", "kak", "bang"}


def _drop_address(name: str) -> str:
    parts = name.split()
    while len(parts) > 1 and parts[0].lower().strip(".,") in _ADDRESS:
        parts = parts[1:]
    return " ".join(parts)


def suggest_speakers(title: str, channel: str, words: list[dict[str, Any]], hook: str = "") -> list[dict[str, str]]:
    """Up to 3 {name, role} suggestions, most likely first. Raises llm.LLMError (message in the UI language)."""
    spoken = " ".join((w.get("word") or "").strip() for w in words[:MAX_WORDS]).strip()
    res = llm.chat_json(
        _PROMPT,
        f"Judul video: {title or '-'}\nChannel: {channel or '-'}\nUcapan di klip:\n{spoken or hook or '-'}",
        temperature=0,  # the same clip gets the same names
        max_tokens=1500,  # room for reasoning models (the default 9Router route is one)
        retries=2,
    )
    haystack = set(_tokens(" ".join([title or "", channel or "", spoken, hook or ""])))
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for item in res.get("speakers") or []:
        if not isinstance(item, dict):
            continue
        name = _tidy_case(_drop_address(_clean(item.get("name"), 60)))
        key = " ".join(_significant(name))  # "dr. Tirta" and "Tirta" are one person
        if not name or key in seen or not grounded(name, haystack):
            continue
        seen.add(key)
        out.append({"name": name, "role": _clean(item.get("role"), MAX_ROLE)})
        if len(out) >= MAX_SPEAKERS:
            break
    return out
