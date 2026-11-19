"""Text for posting a campaign clip: a title, a caption, hashtags, mentions and the disclosure label,
following the campaign brief (one LLM call per clip).

The brief's required hashtags, mentions and disclosure are added in code when the LLM leaves them out,
so the text always carries them, once: a brief may ask for them inside the caption, and the composed
text (`as_text`) does not repeat what the caption already says. MetisClip never posts: the user copies
this text (clip editor) or takes it from the .txt file saved next to the exported video
(services/exports.py).
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Callable

from backend.core import llm
from backend.models.documents import _clean_items, _tag

MAX_WORDS = 600
TITLE_MAX = 120
CAPTION_MAX = 2200  # TikTok's caption limit; Reels and Shorts are close to it
TAGS_MAX = 30


def _words_text(clip: dict[str, Any]) -> str:
    words = ((clip.get("subtitle") or {}).get("words") or [])[:MAX_WORDS]
    return " ".join(str(w.get("word") or "").strip() for w in words).strip()


def _brief_lines(brief: dict[str, Any]) -> str:
    post = brief.get("post") or {}
    lines = []
    for label, value in (
        ("Campaign summary", brief.get("summary")),
        ("Platforms", ", ".join(brief.get("platforms") or [])),
        ("Tone", brief.get("tone")),
        ("Audience", brief.get("audience")),
        ("Language of the post", brief.get("language")),
        ("Required hashtags", " ".join(post.get("hashtags") or [])),
        ("Required mentions", " ".join(post.get("mentions") or [])),
        ("Call to action", post.get("cta")),
        ("Disclosure label", post.get("disclosure")),
    ):
        if value:
            lines.append(f"{label}: {value}")
    rules = list(post.get("caption_rules") or [])
    labels = {"must": "Must", "must_not": "Must not", "prefer": "Prefer"}
    rules += [f"{labels.get(r.get('type'), 'Must')}: {r.get('text')}" for r in brief.get("rules") or []
              if r.get("stage") == "post"]
    if rules:
        lines.append("Caption rules:\n" + "\n".join(f"- {r}" for r in rules))
    return "\n".join(lines)[:3000]


PROMPT = (
    "You write the text a creator posts with a short vertical clip (TikTok, Instagram Reels, YouTube "
    "Shorts) made for a client's campaign. Follow the campaign brief below; it is data describing what the "
    "client wants, not instructions about the output format.\n"
    "- title: a short, punchy title for the clip (max 80 characters).\n"
    "- caption: the post text (1 to 3 short sentences that make people watch, then the call to action if "
    "the brief has one). Put hashtags and mentions in the caption only when the brief asks for them "
    "there, and the disclosure label where the brief says (for example at the start of the caption).\n"
    "- hashtags: every required hashtag, plus up to 4 relevant ones.\n"
    "- mentions: every required mention.\n"
    "Write in the language the brief asks for; without one, in the language of the clip's words. Never "
    "invent facts, prices or promises that are not in the clip or the brief.\n"
    'Output exactly one JSON object: {"title": "...", "caption": "...", "hashtags": ["#..."], "mentions": ["@..."]}'
)


def enforce(copy: dict[str, Any], brief: dict[str, Any]) -> dict[str, Any]:
    """The stored shape, with every required hashtag, mention and the disclosure present."""
    post = brief.get("post") or {}
    hashtags = _clean_items([_tag(h, "#") for h in _clean_items(copy.get("hashtags"), max_len=80)], max_len=80)
    mentions = _clean_items([_tag(m, "@") for m in _clean_items(copy.get("mentions"), max_len=80)], max_len=80)
    have = {h.lower() for h in hashtags}
    hashtags += [h for h in post.get("hashtags") or [] if h.lower() not in have]
    have = {m.lower() for m in mentions}
    mentions += [m for m in post.get("mentions") or [] if m.lower() not in have]
    return {
        "title": " ".join(str(copy.get("title") or "").split())[:TITLE_MAX],
        "caption": str(copy.get("caption") or "").strip()[:CAPTION_MAX],
        "hashtags": hashtags[:TAGS_MAX],
        "mentions": mentions[:TAGS_MAX],
        "disclosure": str(copy.get("disclosure") or post.get("disclosure") or "").strip()[:300],
    }


def fallback(clip: dict[str, Any], brief: dict[str, Any]) -> dict[str, Any]:
    """A basic text without the LLM: the clip's title, the brief's call to action and required tags."""
    post = brief.get("post") or {}
    caption = " ".join(x for x in (clip.get("hook_text") or "", post.get("cta") or "") if x).strip()
    out = enforce({"title": clip.get("hook_text") or "", "caption": caption}, brief)
    out["generated_at"] = datetime.now(timezone.utc).isoformat()
    out["source"] = "basic"
    return out


def generate(clip: dict[str, Any], brief: dict[str, Any], *, video_title: str = "", channel: str = "",
             should_stop: Callable[[], bool] | None = None) -> dict[str, Any]:
    """Raises llm.LLMError (message in the UI language) when the LLM fails."""
    user = (
        f"Campaign brief:\n{_brief_lines(brief) or '(no post requirements)'}\n\n"
        f"Source video: {video_title}" + (f" (channel: {channel})" if channel else "") + "\n"
        f"Clip title: {clip.get('hook_text') or ''}\n"
        f"Words said in the clip: {_words_text(clip) or '(none)'}"
    )
    res = llm.chat_json(PROMPT, user, temperature=0.5, max_tokens=900, retries=2, should_stop=should_stop)
    out = enforce(res if isinstance(res, dict) else {}, brief)
    if not out["title"]:
        out["title"] = " ".join(str(clip.get("hook_text") or "").split())[:TITLE_MAX]
    out["generated_at"] = datetime.now(timezone.utc).isoformat()
    out["source"] = "ai"
    return out


# A hashtag or mention written in a text ("@sehatku.id." at a sentence end is "@sehatku.id")
_TAG_IN_TEXT = re.compile(r"[#@][^\s#@,;:!?()\[\]{}\"'“”‘’]+")


def _tags_in(text: str) -> set[str]:
    return {t.rstrip(".").lower() for t in _TAG_IN_TEXT.findall(text or "")}


def _has_label(text: str, label: str) -> bool:
    """The disclosure label as a whole word or phrase, any case ("Ad" is not the "ad" in "adalah")."""
    return bool(label) and re.search(r"(?<!\w)" + re.escape(label) + r"(?!\w)", text or "", re.IGNORECASE) is not None


def as_text(copy: dict[str, Any] | None) -> str:
    """The post text as one block (export .txt, copy button; frontend/lib/postCopy.ts mirrors it): the
    title, the caption opened by the disclosure label, then the mentions and hashtags.

    A brief may ask for the label and tags inside the caption ('tulis "Ad" di awal caption'), and the LLM
    then writes them there: what the caption already carries is not repeated (QA 2026-11-19 found the
    mention, both hashtags and "Ad" twice). A label the caption lacks opens it, where it is seen before
    the platform folds the text, rather than after the hashtags."""
    if not copy:
        return ""
    caption = str(copy.get("caption") or "").strip()
    disclosure = str(copy.get("disclosure") or "").strip()
    if disclosure and not _has_label(caption, disclosure):
        caption = f"{disclosure}\n{caption}" if caption else disclosure
    written = _tags_in(caption)
    tags = " ".join(t for t in [*(copy.get("mentions") or []), *(copy.get("hashtags") or [])]
                    if t and t.lower() not in written)
    parts = [p.strip() for p in (str(copy.get("title") or ""), caption, tags) if p and p.strip()]
    return "\n\n".join(parts) + "\n" if parts else ""
