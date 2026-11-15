import re

import pytest

from backend.agents.nodes import analyzer as an
from backend.agents.tools.sentences import Unit, build_units


@pytest.mark.parametrize("value,expected", [("01:30", 90.0), ("1:02:03", 3723.0), ("754", 754.0), (754, 754.0),
                                            ("", None), ("abc", None), (None, None)])
def test_ts_to_seconds(value, expected):
    assert an.ts_to_seconds(value) == expected


def test_parse_duration_range():
    assert an.parse_duration_range("30-45") == (30.0, 45.0)
    assert an.parse_duration_range("garbage") == (45.0, 60.0)


def _units(n: int, seconds: float = 5.0, complete=lambda k: True) -> list[Unit]:
    return [Unit(k, k * seconds, (k + 1) * seconds, f"kalimat {k}" + ("." if complete(k) else ""), complete(k))
            for k in range(n)]


def test_fit_duration_grows_a_short_clip_by_whole_sentences():
    units = _units(200)
    i, j = an.fit_duration(units, 20, 23, 45, 60)       # 20 s
    assert i == 20 and 45 <= an.duration(units, i, j) <= 63


def test_fit_duration_trims_a_long_clip_at_a_sentence_end_never_mid_sentence():
    units = _units(200)
    i, j = an.fit_duration(units, 20, 60, 45, 60)       # 205 s
    assert i == 20 and 45 <= an.duration(units, i, j) <= 60 + an.DURATION_TOLERANCE
    assert units[j].complete


def test_fit_duration_prefers_a_complete_sentence_near_the_chosen_end():
    units = _units(200, complete=lambda k: k % 4 == 3)  # every 4th sentence ends with punctuation
    i, j = an.fit_duration(units, 20, 29, 45, 60)       # 50 s, but sentence 29 is unfinished
    assert units[j].complete and 45 <= an.duration(units, i, j) <= 63 and j == 31


def test_fit_duration_near_the_end_of_the_video_grows_backwards():
    units = _units(30)
    i, j = an.fit_duration(units, 25, 29, 45, 60)
    assert j == 29 and an.duration(units, i, j) >= 45


def test_chunks_overlap_and_cover_everything():
    units = _units(400)                                 # 2000 s
    chunks = an.chunk_units(units, chunk_seconds=600, overlap=60)
    assert {u.id for c in chunks for u in c} == set(range(400))
    for a, b in zip(chunks, chunks[1:]):
        assert b[0].start == pytest.approx(a[-1].end - 60, abs=5)


def test_score_uses_the_rubric_weights():
    assert an.score_of({"hook": 10, "value": 10, "standalone": 10, "payoff": 10, "shareability": 10})[0] == 100
    assert an.score_of({"hook": 2, "value": 9, "standalone": 6, "payoff": 6, "shareability": 7})[0] == 59
    assert an.score_of({"viral_score": 77})[0] == 77            # a model that ignores the rubric
    assert an.score_of({})[0] == 50
    # Clamped to 1..10; with only three scores the weights are renormalised: (2.5 + 0.25 + 1.0) / 0.7
    assert an.score_of({"hook": "15", "value": 0, "standalone": 5})[0] == 54


TRANSCRIPT = [{"text": f"Ini kalimat nomor {i}.", "start": float(i * 5), "duration": 5.0} for i in range(400)]


class FakeCtx:
    id = "job-1"

    class cancel:
        cancelled = False

    def __init__(self):
        self.errors = []

    def check(self):
        pass

    def progress(self, *a, **k):
        pass

    def error(self, step, message):
        self.errors.append(message)


def _scores(s):
    return {"hook": s, "value": s, "standalone": s, "payoff": s, "shareability": s}


def _part(user: str) -> int:
    return int(re.search(r"Transcript part (\d+)/", user).group(1))


def test_whole_video_is_scanned_then_ranked_side_by_side(monkeypatch):
    calls = {"scan": [], "rank": 0}

    def fake_chat(system, user, **kw):
        if "Candidate 1" in user:
            calls["rank"] += 1
            # The editor reorders: the last scan candidate becomes the best, and fixes its edges
            return {"clips": [{"candidate": 1, **_scores(4)},
                              {"candidate": 2, **_scores(6)},
                              {"candidate": 3, "start_id": 299, "end_id": 308, **_scores(9), "hook_text": "terbaik"}]}
        part = _part(user)
        calls["scan"].append(part)
        if part == 1:
            return {"clips": [{"start_id": 30, "end_id": 39, **_scores(8), "hook_text": "a"},
                              {"start_id": 5, "end_id": 14, **_scores(9), "hook_text": "intro"},      # intro ban
                              {"start_id": 33, "end_id": 42, **_scores(7), "hook_text": "overlap"}]}  # overlaps a
        if part == 2:
            return {"clips": [{"start_id": 150, "end_id": 159, **_scores(7), "hook_text": "b"}]}
        if part == 3:
            return {"clips": [{"start_id": 300, "end_id": 309, **_scores(5), "hook_text": "c"}]}
        return {"clips": []}

    monkeypatch.setattr(an.llm, "chat_json", fake_chat)
    video = {"_id": "sv1", "youtube_id": "AAAAAAAAAAA", "title": "t", "duration_seconds": 2000}
    out = an._analyze_video(FakeCtx(), video, 45, 60, 2, TRANSCRIPT, use_llm=True)

    assert calls["scan"] == [1, 2, 3, 4], "no early stop: every part is read"
    assert calls["rank"] == 1
    assert [s["hook_text"] for s in out] == ["terbaik", "b"]
    assert out[0]["viral_score"] == 90 and out[1]["viral_score"] == 60
    best = out[0]
    assert best["start_time"] == pytest.approx(299 * 5 - an.LEAD_IN)       # the editor's new start
    assert best["end_time"] == pytest.approx(309 * 5 + an.TAIL)            # sentence 308 ends at 1545
    assert all(s["start_time"] >= an.INTRO_BAN_SECONDS for s in out)
    assert all(45 <= s["duration_seconds"] <= 60 + an.DURATION_TOLERANCE + an.LEAD_IN + an.TAIL for s in out)


def test_ids_outside_the_part_and_garbage_are_ignored(monkeypatch):
    def fake_chat(system, user, **kw):
        if "Candidate 1" in user:
            return {"clips": []}
        if _part(user) != 1:
            return {"clips": []}
        return {"clips": [{"start_id": 390, "end_id": 399, **_scores(9)},   # not in part 1
                          {"start_id": "x", "end_id": 40}, "nonsense", {"start_id": 50, "end_id": 40},
                          {"start_id": 40, "end_id": 49, **_scores(6), "hook_text": "ok"}]}

    monkeypatch.setattr(an.llm, "chat_json", fake_chat)
    video = {"_id": "sv1", "youtube_id": "AAAAAAAAAAA", "title": "t", "duration_seconds": 2000}
    out = an._analyze_video(FakeCtx(), video, 45, 60, 0, TRANSCRIPT, use_llm=True)
    assert [s["hook_text"] for s in out] == ["ok"]


def test_a_failed_rank_pass_keeps_the_scan_results(monkeypatch):
    def fake_chat(system, user, **kw):
        if "Candidate 1" in user:
            raise an.llm.LLMError("LLM tidak dapat dihubungi")
        if _part(user) == 1:
            return {"clips": [{"start_id": 30, "end_id": 39, **_scores(5), "hook_text": "a"},
                              {"start_id": 60, "end_id": 69, **_scores(8), "hook_text": "b"}]}
        return {"clips": []}

    monkeypatch.setattr(an.llm, "chat_json", fake_chat)
    ctx = FakeCtx()
    video = {"_id": "sv1", "youtube_id": "AAAAAAAAAAA", "title": "t", "duration_seconds": 2000}
    out = an._analyze_video(ctx, video, 45, 60, 0, TRANSCRIPT, use_llm=True)
    assert [s["hook_text"] for s in out] == ["b", "a"]
    assert any("Penilaian ulang kandidat dilewati" in e for e in ctx.errors)


def test_an_edit_into_the_intro_is_refused(monkeypatch):
    def fake_chat(system, user, **kw):
        if "Candidate 1" in user:
            return {"clips": [{"candidate": 1, "start_id": 12, **_scores(9)}, {"candidate": 2, **_scores(3)}]}
        if _part(user) == 1:
            return {"clips": [{"start_id": 19, "end_id": 28, **_scores(6), "hook_text": "a"},
                              {"start_id": 60, "end_id": 69, **_scores(6), "hook_text": "b"}]}
        return {"clips": []}

    monkeypatch.setattr(an.llm, "chat_json", fake_chat)
    video = {"_id": "sv1", "youtube_id": "AAAAAAAAAAA", "title": "t", "duration_seconds": 2000}
    out = an._analyze_video(FakeCtx(), video, 45, 60, 0, TRANSCRIPT, use_llm=True)
    a = next(s for s in out if s["hook_text"] == "a")
    assert a["start_time"] == pytest.approx(19 * 5 - an.LEAD_IN) and a["viral_score"] == 60


def test_caption_lines_are_cut_at_sentences_not_lines(monkeypatch):
    """Lines that hold the end of one sentence and the start of the next never become clip edges."""
    lines = []
    for k in range(60):  # 3-second lines; every sentence is spread over two lines
        lines.append({"text": f"ujung kalimat {k}. Awal kalimat", "start": 100 + k * 6.0, "duration": 5.0})
        lines.append({"text": f"berikutnya nomor {k + 1}", "start": 103 + k * 6.0, "duration": 5.0})
    units = build_units(lines)

    def fake_chat(system, user, **kw):
        if "Candidate 1" in user:
            return {"clips": []}
        return {"clips": [{"start_id": 2, "end_id": 9, **_scores(7), "hook_text": "x"}]}

    monkeypatch.setattr(an.llm, "chat_json", fake_chat)
    video = {"_id": "sv1", "youtube_id": "AAAAAAAAAAA", "title": "t", "duration_seconds": 500}
    [seg] = an._analyze_video(FakeCtx(), video, 45, 60, 0, lines, use_llm=True)
    first = next(u for u in units if u.id == 2)
    assert first.text.startswith("Awal kalimat")
    assert seg["start_time"] == pytest.approx(first.start - an.LEAD_IN, abs=0.01)
    assert not any(abs(seg["start_time"] + an.LEAD_IN - ln["start"]) < 0.01 for ln in lines), "not a line start"
    last = next(u for u in units if abs(u.end + an.TAIL - seg["end_time"]) < 0.01)
    assert last.complete


def test_segment_id_is_deterministic():
    a = an.segment_id("job", "vid", 100.0, 145.0)
    assert a == an.segment_id("job", "vid", 100.0, 145.0)
    assert a != an.segment_id("job", "vid2", 100.0, 145.0)


def _quota():
    from backend.core import llm

    return llm.LLMQuotaExhausted("Kuota harian LLM habis (host · m).", "tokens per day (TPD)", retry_after=1800)


def test_quota_stops_the_analysis_at_once(monkeypatch):
    """A used-up quota fails every next part the same way: stop instead of trying them all."""
    calls = {"n": 0}

    def fake_chat(system, user, **kw):
        calls["n"] += 1
        raise _quota()

    monkeypatch.setattr(an.llm, "chat_json", fake_chat)
    video = {"_id": "sv1", "youtube_id": "AAAAAAAAAAA", "title": "t", "duration_seconds": 5000}
    long_transcript = [{"text": "x.", "start": float(i * 5), "duration": 5.0} for i in range(1000)]
    with pytest.raises(an.llm.LLMQuotaExhausted):
        an._analyze_video(FakeCtx(), video, 45, 60, 0, long_transcript, use_llm=True)
    assert calls["n"] == 1


def test_quota_during_the_rank_pass_keeps_the_segments(monkeypatch):
    def fake_chat(system, user, **kw):
        if "Candidate 1" in user:
            raise _quota()
        if _part(user) == 1:
            return {"clips": [{"start_id": 24, "end_id": 33, **_scores(8), "hook_text": "a"},
                              {"start_id": 60, "end_id": 69, **_scores(6), "hook_text": "b"}]}
        return {"clips": []}

    monkeypatch.setattr(an.llm, "chat_json", fake_chat)
    video = {"_id": "sv1", "youtube_id": "AAAAAAAAAAA", "title": "t", "duration_seconds": 2000}
    out = an._analyze_video(FakeCtx(), video, 45, 60, 0, TRANSCRIPT, use_llm=True)
    assert [s["hook_text"] for s in out] == ["a", "b"]
