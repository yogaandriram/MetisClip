"""Does a campaign clip meet its brief? A checklist computed on every read, never stored, so it follows
edits to the clip, its template, its post text and the brief itself.

Items are data, not text: {id, kind, status, params}. The frontend words them in the UI language.
status: "ok", "fail", "warn" (worth a look, e.g. the deadline is near), "manual" (only the user can
check it: ticked per rule in `clips.brief_manual`), "ai" (judged by the Analyzer when it chose the
moment; `fit` has its score) or "info".
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any

from backend.agents.tools import brief_match
from backend.services import layout as layout_svc

DURATION_TOLERANCE = brief_match.DURATION_TOLERANCE
DEADLINE_WARN_DAYS = 2


def _item(kind: str, status: str, item_id: str | None = None, **params: Any) -> dict[str, Any]:
    return {"id": item_id or kind, "kind": kind, "status": status, "params": params}


def _requirement(kind: str, need: str, present: bool, **params: Any) -> dict[str, Any] | None:
    if need == "required":
        return _item(kind, "ok" if present else "fail", need=need, present=present, **params)
    if need == "forbidden":
        return _item(kind, "fail" if present else "ok", need=need, present=present, **params)
    return None


def _today() -> date:
    try:
        import pytz

        return datetime.now(pytz.timezone("Asia/Jakarta")).date()
    except Exception:
        return date.today()


def check(clip: dict[str, Any], campaign: dict[str, Any], template: dict[str, Any] | None,
          channel: str = "", *, today: date | None = None) -> dict[str, Any]:
    brief = campaign.get("brief") or {}
    words = (clip.get("subtitle") or {}).get("words") or []
    text = brief_match.TextIndex(brief_match.words_text(words))
    items: list[dict[str, Any]] = []

    if clip.get("brief_fit") is not None:
        items.append(_item("fit", "ai", score=clip.get("brief_fit"), reason=clip.get("brief_reason") or ""))

    dur = brief.get("duration") or {}
    lo, hi = dur.get("min"), dur.get("max")
    if lo or hi:
        seconds = float(clip.get("duration_seconds") or 0)
        ok = brief_match.within(seconds, brief_match.length_range(brief))
        items.append(_item("duration", "ok" if ok else "fail", seconds=round(seconds, 1), min=lo, max=hi))

    required = brief.get("must_include") or []
    if required:
        missing = brief_match.missing_terms(text, required)
        items.append(_item("required_words", "fail" if missing else "ok", missing=missing,
                           found=[t for t in required if t not in missing]))
    banned = brief.get("banned_words") or []
    if banned:
        said = brief_match.banned_found(text, banned)
        items.append(_item("banned_words", "fail" if said else "ok", found=said))

    visual = brief.get("visual") or {}
    lay = layout_svc.effective_layout(clip, template)
    credit = lay.get("credit") or {}
    credit_text = str(credit.get("text") or "Sumber: {channel}")
    credit_shown = bool(credit.get("enabled")) and (lay.get("mode") or "full") != "full" and \
        ("{channel}" not in credit_text or bool(channel.strip()))
    logo = bool(((template or {}).get("brand_settings") or {}).get("overlayUrl"))
    for kind, need, present, extra in (
        ("subtitles", visual.get("subtitles"), bool(words), {}),
        ("logo", visual.get("logo"), logo, {}),
        ("credit", visual.get("credit"), credit_shown,
         {"mode": lay.get("mode") or "full", "no_channel": "{channel}" in credit_text and not channel.strip()}),
    ):
        if (it := _requirement(kind, str(need or "optional"), present, **extra)):
            items.append(it)

    post = brief.get("post") or {}
    copy = clip.get("post_copy") or {}
    if any(post.get(k) for k in ("hashtags", "mentions", "disclosure", "cta")) or post.get("caption_rules"):
        if not copy:
            items.append(_item("post_copy", "fail"))
        else:
            have = {h.lower() for h in copy.get("hashtags") or []}
            missing = [h for h in post.get("hashtags") or [] if h.lower() not in have]
            if post.get("hashtags"):
                items.append(_item("hashtags", "fail" if missing else "ok", missing=missing))
            have = {m.lower() for m in copy.get("mentions") or []}
            missing = [m for m in post.get("mentions") or [] if m.lower() not in have]
            if post.get("mentions"):
                items.append(_item("mentions", "fail" if missing else "ok", missing=missing))
            if post.get("disclosure"):
                label = str(post["disclosure"]).lower()
                body = " ".join(str(copy.get(k) or "") for k in ("title", "caption", "disclosure")).lower() + " " + \
                    " ".join(copy.get("hashtags") or []).lower()
                items.append(_item("disclosure", "ok" if label in body else "fail", label=post["disclosure"]))

    if brief.get("deadline"):
        try:
            due = date.fromisoformat(brief["deadline"])
            left = (due - (today or _today())).days
            status = "fail" if left < 0 else ("warn" if left <= DEADLINE_WARN_DAYS else "info")
            items.append(_item("deadline", status, date=brief["deadline"], days_left=left))
        except ValueError:
            pass

    ticked = clip.get("brief_manual") or {}
    for rule in brief.get("rules") or []:
        rid = str(rule.get("id") or "")
        if not rid:
            continue
        if rule.get("stage") == "selection":
            items.append(_item("rule", "ai", f"rule:{rid}", rule=rid, text=rule.get("text") or "",
                               type=rule.get("type") or "must", source=rule.get("source") or ""))
        else:
            items.append(_item("rule", "manual", f"rule:{rid}", rule=rid, text=rule.get("text") or "",
                               type=rule.get("type") or "must", stage=rule.get("stage") or "manual",
                               source=rule.get("source") or "", checked=bool(ticked.get(rid))))

    summary = {s: 0 for s in ("ok", "fail", "warn", "ai", "info")}
    manual_open = manual_done = 0
    for it in items:
        if it["status"] == "manual":
            if it["params"].get("checked"):
                manual_done += 1
            else:
                manual_open += 1
        else:
            summary[it["status"]] += 1
    summary.update(manual_open=manual_open, manual_done=manual_done,
                   ready=summary["fail"] == 0 and manual_open == 0)
    return {"campaign_id": campaign.get("_id") or campaign.get("id"), "version": campaign.get("version", 1),
            "items": items, "summary": summary}
