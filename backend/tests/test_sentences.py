import pytest

from backend.agents.tools.sentences import MAX_UNIT_SECONDS, build_units

# The shape of real Indonesian YouTube auto-captions: sentences end mid-line and every line's
# duration runs into the next line.
CAPTIONS = [
    {"text": "iklannya dari dia dong, bukan dari gua.", "start": 300.28, "duration": 2.84},
    {"text": "Di sini kan budget iklannya dari gua.", "start": 301.80, "duration": 2.84},
    {"text": "Makanya gua modelin budget iklannya di", "start": 303.12, "duration": 6.68},
    {"text": "awal series itu di Rp2 juta. Oke. Nah,", "start": 304.64, "duration": 7.16},
    {"text": "kreator udah, prodct udah, lu bisa", "start": 309.80, "duration": 4.80},
    {"text": "ngiklan. Next-nya adalah lu enggak bisa", "start": 311.80, "duration": 7.04},
]


def test_caption_lines_are_regrouped_into_sentences():
    units = build_units(CAPTIONS)
    assert [u.text for u in units] == [
        "iklannya dari dia dong, bukan dari gua.",
        "Di sini kan budget iklannya dari gua.",
        "Makanya gua modelin budget iklannya di awal series itu di Rp2 juta.",
        "Oke.",
        "Nah, kreator udah, prodct udah, lu bisa ngiklan.",
        "Next-nya adalah lu enggak bisa",
    ]
    assert [u.id for u in units] == list(range(len(units)))
    assert [u.complete for u in units] == [True, True, True, True, True, False]


def test_times_are_interpolated_inside_lines_and_stop_at_the_next_line():
    units = build_units(CAPTIONS)
    makanya, oke, nah = units[2], units[3], units[4]
    assert makanya.start == pytest.approx(303.12)
    # "…Rp2 juta." ends partway through the line that starts at 304.64 (which lasts until 309.80)
    assert 304.64 < makanya.end < 309.80
    assert makanya.end == pytest.approx(oke.start, abs=0.01)
    # The line "awal … Nah," ends where the next line starts, not at its own (overlapping) duration
    assert oke.end < nah.start + 0.01 < 309.80
    for a, b in zip(units, units[1:]):
        assert a.start < a.end <= b.start + 0.01


def test_unpunctuated_captions_become_bounded_pieces_split_at_commas():
    lines = [{"text": f"kata{i} kata lagi dan lagi" + ("," if i % 3 == 2 else ""), "start": i * 3.0, "duration": 4.0}
             for i in range(40)]
    units = build_units(lines)
    assert len(units) > 3
    assert all(u.end - u.start <= MAX_UNIT_SECONDS + 3.5 for u in units)
    assert all(u.text.endswith(",") for u in units[:-1])
    assert not any(u.complete for u in units)


def test_a_long_pause_ends_a_unit():
    lines = [{"text": "ini bagian pertama", "start": 0.0, "duration": 2.0},
             {"text": "ini bagian kedua", "start": 5.0, "duration": 2.0}]
    units = build_units(lines)
    assert [u.text for u in units] == ["ini bagian pertama", "ini bagian kedua"]
    assert units[0].end == pytest.approx(2.0) and units[1].start == pytest.approx(5.0)


def test_empty_lines_are_ignored():
    assert build_units([]) == []
    assert build_units([{"text": "  ", "start": 1.0, "duration": 1.0}]) == []
