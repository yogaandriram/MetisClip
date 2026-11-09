import subprocess
import sys
import threading
import time

import pytest

from backend.core import procs
from backend.core.paths import PathOutsideRoot, get_paths, slugify


def test_relative_roundtrip_with_spaces_and_unicode(paths):
    f = paths.library_dir / "agen ü" / "clip 1" / "raw.mp4"
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_bytes(b"x")
    rel = paths.to_relative(f)
    assert rel == "library/agen ü/clip 1/raw.mp4"
    assert paths.from_relative(rel) == f.resolve()


@pytest.mark.parametrize("bad", ["../x", "library/../../x", "C:/Windows/win.ini", "/etc/passwd", "", "\\\\server\\share"])
def test_from_relative_rejects_escape(paths, bad):
    with pytest.raises(PathOutsideRoot):
        paths.from_relative(bad)


def test_to_relative_rejects_outside(paths, tmp_path):
    with pytest.raises(PathOutsideRoot):
        paths.to_relative(tmp_path / "outside.txt")


def test_slugify():
    assert slugify("Podcast Bisnis & Startup") == "podcast-bisnis-startup"
    assert slugify("Kesehatan Ibu ü") == "kesehatan-ibu-u"
    assert slugify("!!!") == "agent"


def test_run_captures_and_raises():
    res = procs.run([sys.executable, "-c", "print('hi')"])
    assert res.stdout.decode().strip() == "hi"
    with pytest.raises(procs.ProcessError):
        procs.run([sys.executable, "-c", "import sys; sys.exit(3)"])


def test_rejects_string_command():
    with pytest.raises(TypeError):
        procs.popen("echo hi")  # type: ignore[arg-type]


def test_cancel_kills_child_tree():
    token = procs.CancelToken()
    # The child spawns a grandchild; both must die on cancel
    code = ("import subprocess, sys, time; "
            "subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)']); time.sleep(60)")
    threading.Timer(1.0, token.cancel).start()
    t0 = time.monotonic()
    with pytest.raises(procs.Cancelled):
        procs.run([sys.executable, "-c", code], cancel=token, timeout=30)
    assert time.monotonic() - t0 < 15


def test_cancelled_token_refuses_new_process():
    token = procs.CancelToken()
    token.cancel()
    with pytest.raises(procs.Cancelled):
        procs.popen([sys.executable, "-c", "pass"], cancel=token)
