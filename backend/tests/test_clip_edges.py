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


# Groq words as one real job returned them (2026-11-19, QA): punctuation on some words, none where a
# sentence ends inside the speech flow, and no pause there. The transcript knew the sentence ended.
GROQ_END = _words([(f"kata{k}", k * 0.5, k * 0.5 + 0.45) for k in range(116)] + [
    ("orang", 58.22, 58.50), ("latihan", 58.50, 58.76), ("Belum", 58.80, 59.04), ("tentu", 59.04, 59.20),
    ("jadi", 59.20, 59.40), ("seperti", 59.40, 59.66), ("itu", 59.66, 59.94),
    ("Sama", 59.94, 60.30), ("seperti", 60.30, 60.58), ("Angkat", 60.58, 61.04), ("beban", 61.04, 61.40),
])
GROQ_END_SEGMENTS = {"segments": [
    {"text": "Ada orang latihan", "start": 56.94, "end": 58.82},
    {"text": "Belum tentu jadi seperti itu", "start": 58.82, "end": 59.98},
    {"text": "Sama seperti", "start": 59.98, "end": 60.66},
    {"text": "Angkat beban", "start": 60.66, "end": 61.42},
]}


def test_the_next_sentence_s_first_words_end_the_clip_before_them():
    # Without the anchor the nearest weak boundary is the segment break inside "Sama seperti | Angkat beban"
    _, b = ce.snap(GROQ_END, GROQ_END_SEGMENTS, t0=1.5, t1=60.44, total=62.0)
    assert b > 59.94
    _, b = ce.snap(GROQ_END, GROQ_END_SEGMENTS, t0=1.5, t1=60.44, total=62.0,
                   anchors={"next": "sama seperti angkat beban"})
    assert b == pytest.approx(59.94)                   # after "itu", before "Sama"


def test_anchors_tolerate_how_whisper_spells_the_words():
    words = _words([("dengan", 47.6, 47.9), ("olahraga", 47.98, 48.40), ("yang", 48.40, 48.58),
                    ("teratur", 48.58, 48.86), ("Simple", 49.00, 49.30), ("Atau", 49.30, 49.74),
                    ("kamu", 49.74, 49.92), ("latihan", 49.92, 50.18), ("boxing", 50.18, 50.48)])
    _, b = ce.snap([{"word": "awal.", "start": 0.0, "end": 0.4}, *words], None, t0=0.0, t1=49.41, total=51.0,
                   anchors={"next": "simpel atau kamu latihan"})
    assert b == pytest.approx(49.00 - 0.02)             # after "teratur": the transcript says "simpel", Whisper "Simple"
    assert ce._find(words, "nah kalau misal imunitasnya", 48.0) is None
    misal = _words([("Nah", 46.92, 47.10), ("kalau", 47.10, 47.22), ("misalnya", 47.22, 47.48),
                    ("imunitasnya", 47.48, 48.24)])
    assert ce._find(misal, "nah kalau misal imunitasnya", 47.0) == 0


def test_the_first_words_start_the_clip_and_a_one_word_anchor_is_ignored():
    words = _words([("Gitu", 1.00, 1.38), ("ya.", 1.38, 1.70), ("Satu-satunya", 1.78, 2.36), ("yang", 2.36, 2.52),
                    ("paling", 2.52, 2.74), ("alami", 2.74, 3.10), ("fisik.", 3.10, 4.52), ("Latihan", 4.52, 4.80)])
    a, _ = ce.snap(words, None, t0=1.40, t1=4.70, total=5.0, anchors={"first": "satu satunya yang paling"})
    assert a == pytest.approx(1.70 + 0.02)              # just after "ya.", before "Satu-satunya"
    assert ce._find(words, "oke", 1.5) is None


def test_a_segment_end_marks_only_its_own_last_word():
    # Segment "Gitu ya." ends at 1.58: "Gitu" ends 0.20 s from it, "ya." 0.12 s. Only "ya." ends the sentence.
    words = _words([("ini", 0.24, 1.00), ("Gitu", 1.00, 1.38), ("ya", 1.38, 1.70), ("Satu", 1.78, 2.36)])
    payload = {"segments": [{"text": "di dunia ini.", "start": 0.0, "end": 0.52},
                            {"text": "Gitu ya.", "start": 0.94, "end": 1.58},
                            {"text": "Satu", "start": 1.78, "end": 2.36}]}
    ends, starts = ce._boundaries(words, payload)
    assert ends[1] == 0 and ends[2] == 2               # "Gitu" is not a sentence end, "ya" is
    assert starts[3] == 2


def test_an_edge_whisper_left_out_is_not_cut_away():
    # The words stop 12 s before the clip's end (Whisper skipped the last stretch): the end stays put
    words = _words([(f"kata{k}.", k * 0.5, k * 0.5 + 0.4) for k in range(70)])   # up to 35 s
    a, b = ce.snap(words, None, t0=1.5, t1=47.9, total=47.92)
    assert b == pytest.approx(47.9)
    assert 1.3 <= a <= 1.5
