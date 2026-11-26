"""The uninstaller helper (desktop/build-resources/uninstall-data.ps1).

It runs in Windows PowerShell 5.1 against temporary folders and a throwaway Credential Manager service,
through the same test hooks the uninstaller honors, so the real data and keys are never reached.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import uuid
from pathlib import Path

import pytest

from backend.core.secrets import PUBLIC_SECRETS

pytestmark = pytest.mark.skipif(sys.platform != "win32", reason="Windows uninstaller")

SCRIPT = Path(__file__).resolve().parents[2] / "desktop" / "build-resources" / "uninstall-data.ps1"
POWERSHELL = Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32" / "WindowsPowerShell" / "v1.0" / "powershell.exe"


def _run(*args: str, env: dict[str, str]) -> None:
    subprocess.run(
        [str(POWERSHELL), "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", str(SCRIPT), *args],
        env={**os.environ, **env}, check=True, capture_output=True, timeout=60,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )


def _info(tmp_path: Path, env: dict[str, str], nsis_language: str = "1033") -> dict[str, str]:
    out = tmp_path / "info.ini"
    _run("-Out", str(out), "-NsisLanguage", nsis_language, env=env)
    raw = out.read_bytes()
    assert raw.startswith(b"\xff\xfe"), "UTF-16 LE with a BOM, so ReadINIStr reads non-ASCII paths"
    lines = raw.decode("utf-16").splitlines()
    assert lines[0] == "[data]"
    return dict(line.split("=", 1) for line in lines[1:] if line)


def _data_folder(root: Path, marker: str = ".metisclip") -> Path:
    for part in ("db", "library/c1", "exports", "cache", "backups", "models"):
        (root / part).mkdir(parents=True, exist_ok=True)
    if marker == ".metisclip":
        (root / ".metisclip").mkdir()
        (root / ".metisclip" / "db-credentials.json").write_text("{}")
    else:
        (root / "db" / "WiredTiger").write_text("WiredTiger")
    (root / "library" / "c1" / "raw.mp4").write_bytes(b"\0" * (3 * 1024 * 1024))
    (root / "cache" / "big.bin").write_bytes(b"\0" * (5 * 1024 * 1024))  # emptied anyway: not in the size
    return root


def _hooks(tmp_path: Path, bootstrap: dict | None, language: str | None = None) -> dict[str, str]:
    userdata = tmp_path / "userdata"
    userdata.mkdir(exist_ok=True)
    if bootstrap is not None:
        (userdata / "bootstrap.json").write_text(json.dumps(bootstrap), encoding="utf-8")
    if language:
        (userdata / "preferences.json").write_text(json.dumps({"language": language}), encoding="utf-8")
    return {"METISCLIP_USERDATA_DIR": str(userdata), "METISCLIP_TOOLS_DIR": str(tmp_path / "tools" / "bin")}


def test_key_names_match_the_engine():
    names = re.search(r"\$KeyNames = @\(([^)]*)\)", SCRIPT.read_text(encoding="ascii")).group(1)
    assert tuple(re.findall(r"'([^']+)'", names)) == PUBLIC_SECRETS


def test_finds_the_data_folders_and_their_sizes(tmp_path):
    root = _data_folder(tmp_path / "Data ü" / "MetisClip")  # spaces and non-ASCII, like real user paths
    previous = _data_folder(tmp_path / "Old" / "MetisClip", marker="db")
    env = _hooks(tmp_path, {"data_root": str(root), "previous_data_root": str(previous)}, language="id")

    info = _info(tmp_path, env)

    assert info["lang"] == "id"
    assert info["appdata"] == env["METISCLIP_USERDATA_DIR"]
    assert info["tools"] == env["METISCLIP_TOOLS_DIR"]
    assert info["root"] == str(root)
    assert info["root_size"] == "3 MB"  # the cache is left out
    assert info["previous"] == str(previous)
    # nothing was changed
    assert (root / "cache" / "big.bin").exists()


def test_language_falls_back_to_the_installer_language(tmp_path):
    root = _data_folder(tmp_path / "MetisClip")
    (root / "library" / "c1" / "raw.mp4").write_bytes(b"\0" * (1536 * 1024))  # 1.5 MB, shown rounded
    env = _hooks(tmp_path, {"data_root": str(root)})
    assert _info(tmp_path, env, "1057")["lang"] == "id"
    info = _info(tmp_path, env, "1033")
    assert info["lang"] == "en" and info["root_size"] == "2 MB"


@pytest.mark.parametrize("case", ["not_metisclip", "relative", "drive", "missing", "no_bootstrap", "profile"])
def test_offers_nothing_but_a_metisclip_data_folder(tmp_path, case):
    plain = tmp_path / "Videos"
    (plain / "db").mkdir(parents=True)  # a db folder alone is not enough
    data_root = {
        "not_metisclip": str(plain),
        "relative": "MetisClip",
        "drive": str(tmp_path)[:3],
        "missing": str(tmp_path / "gone" / "MetisClip"),
        "profile": os.environ["USERPROFILE"],
    }.get(case)
    env = _hooks(tmp_path, None if case == "no_bootstrap" else {"data_root": data_root})

    info = _info(tmp_path, env)

    assert "root" not in info and "previous" not in info
    assert info["appdata"]  # logs and tools are still removed


def test_a_broken_bootstrap_file_only_skips_the_question(tmp_path):
    env = _hooks(tmp_path, None)
    (Path(env["METISCLIP_USERDATA_DIR"]) / "bootstrap.json").write_text("{not json", encoding="utf-8")
    info = _info(tmp_path, env)
    assert "root" not in info and info["lang"] == "en"


def test_deletes_the_saved_api_keys(tmp_path):
    keyring = pytest.importorskip("keyring")
    service = f"MetisClip-UninstallTest-{uuid.uuid4().hex[:8]}"
    other = f"{service}-Other"
    try:
        # two keys, so keyring stores one of them under the compound "<name>@<service>" target
        keyring.set_password(service, "groq_api_key", "gsk-test")
        keyring.set_password(service, "openai_api_key", "sk-test")
        keyring.set_password(other, "openai_api_key", "keep")

        _run("-DeleteKeys", env={"METISCLIP_KEYRING_SERVICE": service})

        assert keyring.get_password(service, "groq_api_key") is None
        assert keyring.get_password(service, "openai_api_key") is None
        assert keyring.get_password(other, "openai_api_key") == "keep"
    finally:
        for svc, name in ((service, "groq_api_key"), (service, "openai_api_key"), (other, "openai_api_key")):
            try:
                keyring.delete_password(svc, name)
            except Exception:
                pass
