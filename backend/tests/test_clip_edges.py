import pytest

from backend.agents.tools import clip_edges as ce


def _words(spec):
    """[(text, start, end), …] -> word dicts."""
    return [{"word": t, "start": s, "end": e} for t, s, e in spec]


# Fetched clip with a 1.5 s margin: the tail of the previous sentence, then the clip, then the next sentence
LOCAL = _words([
    ("jadi", 0.10, 0.40), ("gitu.", 0.45, 0.95),                      # previous sentence ends at 0.95
    ("Modal", 1.20, 1.55), ("itu", 1.60, 1.80), ("penting.", 1.85, 2.40),
    ("Tapi", 2.60, 2.85), ("framework", 2.90, 3.50), ("lebih", 3.55, 3.80), ("penting.", 3.85, 4.40),
    ("Nah", 4.85, 5.05), ("terus", 5.10, 5.40),                       # next sentence
])


def test_edges_move_to_the_nearest_sentence_boundaries():
    # The analyzer's estimate starts mid-word ("Modal") and ends inside the next sentence
    a, b = ce.snap(LOCAL, None, t0=1.40, t1=4.95, total=5.5)
    assert a == pytest.approx(1.20 - ce.LEAD_IN)       # just before "Modal", after "gitu."
    assert a > 0.95
    assert b == pytest.approx(4.40 + ce.TAIL)          # after "penting.", before "Nah"
    assert b < 4.85


def test_snapped_edges_stay_within_a_brief_s_length():
    # Snapping gives 1.05-4.65 (3.6 s); a brief that accepts at most 3.4 s keeps the Analyzer's edges
    assert ce.snap(LOCAL, None, t0=1.40, t1=4.95, total=5.5, limits=(None, 3.4)) is None
    assert ce.snap(LOCAL, None, t0=1.40, t1=4.95, total=5.5, limits=(3.0, 4.0)) is not None


def test_the_tail_never_reaches_into_the_next_word():
    tight = [*LOCAL[:9], {"word": "Nah", "start": 4.55, "end": 4.75}]
    _, b = ce.snap(tight, None, t0=1.40, t1=4.60, total=5.5)
    assert b == pytest.approx(4.55 - 0.02)


def test_groq_words_use_the_punctuation_of_their_segments():
    groq = [{**w, "word": w["word"].rstrip(".")} for w in LOCAL]   # Groq words carry no punctuation
    payload = {"segments": [{"text": "jadi gitu.", "start": 0.1, "end": 0.95},
                            {"text": "Modal itu penting. Tapi framework lebih penting.", "start": 1.2, "end": 4.4},
                            {"text": "Nah terus", "start": 4.85, "end": 5.4}]}
    a, b = ce.snap(groq, payload, t0=1.40, t1=4.95, total=5.5)
    assert a == pytest.approx(1.20 - ce.LEAD_IN)
    assert b == pytest.approx(4.40 + ce.TAIL)


def test_without_a_boundary_nearby_the_edges_still_fall_between_words():
    flat = _words([(f"kata{k}", k * 0.5, k * 0.5 + 0.42) for k in range(40)])   # no punctuation, no pauses
    a, b = ce.snap(flat, None, t0=3.3, t1=15.1, total=20.0)
    gaps = [(w["end"], n["start"]) for w, n in zip(flat, flat[1:])]
    assert any(e <= a <= s for e, s in gaps), "the start lies between two words, never inside one"
    assert any(e <= b <= s for e, s in gaps), "the end lies between two words"
    assert abs(a - 3.3) < 0.5 and abs(b - 15.1) < 0.5


def test_nothing_usable_keeps_the_original_edges():
    assert ce.snap([], None, 1.5, 40.0, 43.0) is None
    assert ce.snap(_words([("x", 0.1, 0.2)]), None, 1.5, 40.0, 43.0) is None
    # Snapping would throw away most of the clip
    short = _words([("satu.", 1.0, 1.4), ("dua.", 1.6, 2.0), ("tiga", 2.2, 2.6)])
    assert ce.snap(short, None, 1.5, 40.0, 43.0) is None


def test_shift_words_into_the_trimmed_clip():
    out = ce.shift_words(LOCAL, offset=1.08, length=3.62)
    assert [w["word"] for w in out] == ["Modal", "itu", "penting.", "Tapi", "framework", "lebih", "penting."]
    assert out[0]["start"] == pytest.approx(0.12) and out[-1]["end"] == pytest.approx(3.32)
    assert all(0 <= w["start"] <= w["end"] <= 3.62 for w in out)
