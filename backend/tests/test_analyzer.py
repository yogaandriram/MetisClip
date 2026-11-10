import pytest

from backend.agents.nodes import analyzer as an


@pytest.mark.parametrize("value,expected", [("01:30", 90.0), ("1:02:03", 3723.0), ("754", 754.0), (754, 754.0),
                                            ("", None), ("abc", None), (None, None)])
def test_ts_to_seconds(value, expected):
    assert an.ts_to_seconds(value) == expected


def test_parse_duration_range():
    assert an.parse_duration_range("30-45") == (30.0, 45.0)
    assert an.parse_duration_range("garbage") == (45.0, 60.0)


def test_critic_accepted_within_window():
    assert an.apply_critic(100, 150, {"start_time": "01:45", "end_time": "02:40"}) == (105.0, 160.0)


def test_critic_rejected_when_shift_too_large():
    assert an.apply_critic(100, 150, {"start_time": "02:20", "end_time": "03:00"}) == (100, 150)
    assert an.apply_critic(100, 150, {"start_time": "01:40", "end_time": "01:30"}) == (100, 150)
    assert an.apply_critic(100, 150, {}) == (100, 150)


TRANSCRIPT = [{"text": f"kalimat {i}.", "start": float(i * 5), "duration": 5.0} for i in range(200)]


def test_enforce_duration_expands_to_sentence_end():
    s, e = an.enforce_duration(100, 120, 45, 60, TRANSCRIPT)
    assert s == 100 and 145 <= e <= 150


def test_enforce_duration_trims_absurd_length():
    s, e = an.enforce_duration(100, 300, 45, 60, TRANSCRIPT)
    assert (s, e) == (100, 160)


def test_enforce_duration_clamps_to_video():
    _, e = an.enforce_duration(100, 158, 45, 60, TRANSCRIPT, video_duration=150)
    assert e == 150


def test_segment_id_is_deterministic():
    a = an.segment_id("job", "vid", 100.0, 145.0)
    assert a == an.segment_id("job", "vid", 100.0, 145.0)
    assert a != an.segment_id("job", "vid2", 100.0, 145.0)


def test_chunking_splits_by_duration():
    chunks = an.chunk_transcript(TRANSCRIPT, chunk_seconds=600)
    assert len(chunks) == 2 and sum(len(c) for c in chunks) == len(TRANSCRIPT)


class FakeCtx:
    id = "job-1"

    class cancel:
        cancelled = False

    def check(self):
        pass

    def progress(self, *a, **k):
        pass

    def error(self, *a, **k):
        pass


def test_intro_ban_and_overlap_dedupe(monkeypatch):
    calls = {"n": 0}

    def fake_chat(system, user, **kw):
        calls["n"] += 1
        if "Critic" in system:
            return {}
        return {"segments": [
            {"start_time": "00:30", "end_time": "01:20", "viral_score": 99, "hook_text": "intro"},   # intro ban
            {"start_time": "02:00", "end_time": "02:50", "viral_score": 90, "hook_text": "a"},
            {"start_time": "02:10", "end_time": "03:00", "viral_score": 80, "hook_text": "overlap"},  # overlaps a
            {"start_time": "05:00", "end_time": "05:50", "viral_score": 70, "hook_text": "b"},
        ]}

    monkeypatch.setattr(an.llm, "chat_json", fake_chat)
    video = {"_id": "sv1", "youtube_id": "AAAAAAAAAAA", "title": "t", "duration_seconds": 1000}
    out = an._analyze_video(FakeCtx(), video, 45, 60, 0, TRANSCRIPT, use_llm=True)
    hooks = [s["hook_text"] for s in out]
    assert hooks == ["a", "b"]
    assert all(s["start_time"] >= an.INTRO_BAN_SECONDS for s in out)
    assert all(s["youtube_id"] == "AAAAAAAAAAA" for s in out)


def test_early_stop_per_video(monkeypatch):
    calls = {"main": 0}

    def fake_chat(system, user, **kw):
        if "Critic" in system:
            return {}
        calls["main"] += 1
        base = 100 + calls["main"] * 100
        return {"segments": [{"start_time": base, "end_time": base + 50, "viral_score": 80}]}

    monkeypatch.setattr(an.llm, "chat_json", fake_chat)
    video = {"_id": "sv1", "youtube_id": "AAAAAAAAAAA", "title": "t", "duration_seconds": 5000}
    long_transcript = [{"text": "x.", "start": float(i * 5), "duration": 5.0} for i in range(1000)]
    out = an._analyze_video(FakeCtx(), video, 45, 60, 2, long_transcript, use_llm=True)
    assert calls["main"] == 2 and len(out) == 2


def _quota():
    from backend.core import llm

    return llm.LLMQuotaExhausted("Kuota harian LLM habis (host · m).", "tokens per day (TPD)", retry_after=1800)


def test_quota_stops_the_analysis_at_once(monkeypatch):
    """A used-up quota fails every next chunk the same way: stop instead of trying them all."""
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


def test_quota_during_critic_keeps_the_segments(monkeypatch):
    calls = {"critic": 0}

    def fake_chat(system, user, **kw):
        if "Critic" in system:
            calls["critic"] += 1
            raise _quota()
        return {"segments": [{"start_time": "02:00", "end_time": "02:50", "viral_score": 90, "hook_text": "a"},
                             {"start_time": "05:00", "end_time": "05:50", "viral_score": 70, "hook_text": "b"}]}

    monkeypatch.setattr(an.llm, "chat_json", fake_chat)
    video = {"_id": "sv1", "youtube_id": "AAAAAAAAAAA", "title": "t", "duration_seconds": 1000}
    out = an._analyze_video(FakeCtx(), video, 45, 60, 0, TRANSCRIPT, use_llm=True)
    assert [s["hook_text"] for s in out] == ["a", "b"]
    assert calls["critic"] == 1  # the remaining critic calls are skipped
