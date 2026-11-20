"""Third-party licenses of everything MetisClip ships, for the "Lisensi pihak ketiga" screen and the repository.

Run with the engine's venv from the repository root (scripts/build-desktop.ps1 runs it before packaging):

    venv\\Scripts\\python.exe scripts\\gen-licenses.py [--out frontend\\out]

Writes frontend/public/third-party/licenses.json (committed; the UI shows it from Sistem -> Tentang MetisClip)
and THIRD_PARTY_NOTICES.md (committed; the summary on GitHub). With --out it also writes the JSON into that
static export, so an installer always carries the list of the build it was made from.

Sources, all read from what the build ships:
- programs shipped as their own executables: the license files next to them in desktop/resources/bin
  (fetched with pinned SHA256 by fetch-binaries.ps1), Chrome Headless Shell's own license, Electron's,
  and the texts kept in licenses/ (GPLv3 for FFmpeg, the Remotion License, which its npm packages leave out);
- the engine: the Python runtime, the PyInstaller bootloader and every package backend/requirements.txt pulls
  in that the frozen engine contains;
- the UI, the render worker and the desktop shell: their production npm dependencies (npm ls --omit=dev).
The output is sorted and has no timestamps, so a run on unchanged dependencies leaves the files unchanged.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.metadata as md
import json
import re
import subprocess
import sys
from pathlib import Path

from packaging.markers import default_environment
from packaging.requirements import Requirement

REPO = Path(__file__).resolve().parent.parent
BIN = REPO / "desktop" / "resources" / "bin"
LICENSES = REPO / "licenses"
JSON_OUT = REPO / "frontend" / "public" / "third-party" / "licenses.json"
MD_OUT = REPO / "THIRD_PARTY_NOTICES.md"

# Packages the frozen engine leaves out (backend/metisclip-engine.spec excludes, and the dev tools)
ENGINE_SKIP = {"yt-dlp", "imageio-ffmpeg", "pytest", "pyinstaller", "sounddevice"}
LICENSE_FILE = re.compile(r"(^|[-_.])(licen[cs]e|copying|notice|copyright)([-_.]|$)", re.I)
MAX_TEXT = 400_000  # one text; the largest real one (OpenCV's third-party list) is about 150 KB

# License texts kept in licenses/ for Python packages whose wheels carry none (fetched from the release's tag)
PYTHON_FALLBACK = {"protobuf": "protobuf-LICENSE", "flatbuffers": "flatbuffers-LICENSE"}

MIT = """MIT License

Copyright (c) {holder}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
"""

# Short names for license declarations that spell the license out
ALIASES = {
    "mit license": "MIT", "the mit license": "MIT", "mit": "MIT",
    "bsd license": "BSD", "bsd": "BSD", "bsd-3-clause": "BSD-3-Clause", "bsd 3-clause": "BSD-3-Clause",
    "apache 2.0": "Apache-2.0", "apache-2.0": "Apache-2.0", "apache license 2.0": "Apache-2.0",
    "apache software license": "Apache-2.0", "apache license, version 2.0": "Apache-2.0",
    "python software foundation license": "PSF-2.0", "psf": "PSF-2.0", "mozilla public license 2.0 (mpl 2.0)": "MPL-2.0",
    "isc license (iscl)": "ISC", "the unlicense (unlicense)": "Unlicense",
}


class Texts:
    """License texts, stored once each (many packages carry the same MIT text)."""

    def __init__(self) -> None:
        self.by_id: dict[str, str] = {}

    def add(self, text: str) -> str:
        text = text.replace("\r\n", "\n").strip()
        if len(text) > MAX_TEXT:
            text = text[:MAX_TEXT] + "\n[...]"
        tid = hashlib.sha256(text.encode("utf-8")).hexdigest()[:12]
        self.by_id[tid] = text
        return tid

    def add_file(self, path: Path) -> str | None:
        try:
            raw = path.read_bytes()
        except OSError:
            return None
        if b"\0" in raw[:4096]:
            return None
        text = raw.decode("utf-8", errors="replace")
        return self.add(text) if text.strip() else None


def short_license(value: str | None) -> str:
    value = (value or "").strip()
    if not value or value.upper() == "UNKNOWN":
        return ""
    if "\n" in value or len(value) > 80:  # a whole license text in the License field
        first = value.strip().splitlines()[0].strip()
        return ALIASES.get(first.lower(), first[:60])
    return ALIASES.get(value.lower(), value)


def component(name, version, license_, url, texts, note_key=None) -> dict:
    c = {"name": name, "version": version or "", "license": license_ or "", "url": url or "", "texts": sorted(set(texts))}
    if note_key:
        c["note"] = note_key
    return c


# ---------------------------------------------------------------- programs shipped as their own executables

def bin_versions() -> dict:
    try:
        return json.loads((BIN / "versions.json").read_text(encoding="utf-8-sig"))
    except (OSError, ValueError):
        return {}


def require(path: Path, what: str) -> Path:
    if not path.is_file():
        sys.exit(f"gen-licenses: {what} not found: {path} (run scripts\\fetch-binaries.ps1 / the render-engine setup first)")
    return path


def chrome_dir() -> tuple[Path, str]:
    """The Chrome Headless Shell the installer ships (extracted by build-desktop.ps1), else the development copy
    from `npm run browser:ensure`. Returns its folder and version."""
    for c in sorted((REPO / "desktop" / ".cache").glob("chrome-headless-shell-*/chrome-headless-shell-win64"), reverse=True):
        if (c / "LICENSE.headless_shell").is_file():
            return c, c.parent.name.removeprefix("chrome-headless-shell-")
    dev = REPO / "render-engine" / "node_modules" / ".remotion" / "chrome-headless-shell"
    if (dev / "win64" / "chrome-headless-shell-win64" / "LICENSE.headless_shell").is_file():
        version = dev / "VERSION"
        return dev / "win64" / "chrome-headless-shell-win64", version.read_text(encoding="utf-8").strip() if version.is_file() else ""
    sys.exit("gen-licenses: Chrome Headless Shell not found (npm run browser:ensure in render-engine, or build-desktop.ps1)")


def ffmpeg_version() -> str:
    exe = BIN / "ffmpeg.exe"
    try:
        out = subprocess.run([str(exe), "-hide_banner", "-version"], capture_output=True, text=True, timeout=30,
                             creationflags=0x08000000 if sys.platform == "win32" else 0).stdout
        m = re.match(r"ffmpeg version (\S+)", out)
        return m.group(1) if m else ""
    except OSError:
        return ""


def programs(t: Texts) -> list[dict]:
    v = bin_versions()
    out = []
    mongo = [t.add_file(require(BIN / f, "MongoDB license")) for f in ("mongod-LICENSE-Community.txt", "mongod-MPL-2", "mongod-THIRD-PARTY-NOTICES")]
    out.append(component("MongoDB Community Server", v.get("mongod"), "SSPL-1.0", "https://www.mongodb.com", mongo))
    require(BIN / "ffmpeg.exe", "ffmpeg.exe")
    out.append(component("FFmpeg (gyan.dev essentials build)", ffmpeg_version(), "GPL-3.0-or-later", "https://ffmpeg.org",
                         [t.add_file(require(LICENSES / "GPL-3.0.txt", "GPLv3 text"))], note_key="ffmpeg"))
    out.append(component("yt-dlp", v.get("yt-dlp"), "Unlicense", "https://github.com/yt-dlp/yt-dlp",
                         [t.add_file(require(BIN / "yt-dlp-LICENSE", "yt-dlp license"))]))
    out.append(component("Deno", v.get("deno"), "MIT", "https://deno.com",
                         [t.add_file(require(BIN / "deno-LICENSE.md", "Deno license"))]))
    out.append(component("whisper.cpp", v.get("whisper"), "MIT", "https://github.com/ggml-org/whisper.cpp",
                         [t.add_file(require(BIN / "whisper" / "LICENSE", "whisper.cpp license"))]))
    chrome, chrome_version = chrome_dir()
    out.append(component("Chrome Headless Shell", chrome_version,
                         "BSD-3-Clause and others", "https://developer.chrome.com/blog/chrome-headless-shell",
                         [t.add_file(chrome / "LICENSE.headless_shell")]))
    electron = REPO / "desktop" / "node_modules" / "electron"
    ev = json.loads((electron / "package.json").read_text(encoding="utf-8"))["version"]
    out.append(component("Electron", ev, "MIT", "https://www.electronjs.org",
                         [t.add_file(require(electron / "dist" / "LICENSE", "Electron license"))], note_key="electron"))
    return [c for c in out if c]


# ---------------------------------------------------------------- the engine (Python)

def _requirement_names() -> list[str]:
    names = []
    for line in (REPO / "backend" / "requirements.txt").read_text(encoding="utf-8").splitlines():
        line = line.split("#", 1)[0].strip()
        if line:
            names.append(Requirement(line).name)
    return names


def _norm(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def engine_closure() -> list[md.Distribution]:
    env = default_environment()
    env["extra"] = ""
    seen: dict[str, md.Distribution] = {}
    todo = [n for n in _requirement_names() if _norm(n) not in ENGINE_SKIP]
    while todo:
        name = _norm(todo.pop())
        if name in seen or name in ENGINE_SKIP:
            continue
        try:
            dist = md.distribution(name)
        except md.PackageNotFoundError:
            continue
        seen[name] = dist
        for spec in dist.requires or []:
            req = Requirement(spec)
            if req.marker is None or req.marker.evaluate(env):
                todo.append(req.name)
    return sorted(seen.values(), key=lambda d: _norm(d.metadata["Name"]))


def python_license(dist: md.Distribution) -> str:
    """License-Expression, else a short License field, else the trove classifiers. Many packages put the whole
    license text (or its copyright line) in the License field; that is not a name, so the classifiers win then."""
    meta = dist.metadata
    expression = short_license(meta.get("License-Expression"))
    if expression:
        return expression
    field = (meta.get("License") or "").strip()
    if field and "\n" not in field and len(field) <= 40 and not re.match(r"(copyright|=|-)", field, re.I) \
            and field.upper() != "UNKNOWN":
        return ALIASES.get(field.lower(), field)
    found = [c.split("::")[-1].strip() for c in meta.get_all("Classifier") or [] if c.startswith("License ::")]
    if found:
        return ", ".join(ALIASES.get(f.lower(), f) for f in found)
    return short_license(field)


def python_url(dist: md.Distribution) -> str:
    """The project's home or source page (Project-URL labels vary; changelogs and issue trackers are skipped)."""
    meta = dist.metadata
    urls = {}
    for entry in meta.get_all("Project-URL") or []:
        label, _, url = entry.partition(",")
        urls[label.strip().lower()] = url.strip()
    for label in ("homepage", "home", "source", "source code", "repository", "github", "documentation"):
        if urls.get(label):
            return urls[label]
    return meta.get("Home-page") or next((u for l, u in urls.items() if not re.search(r"change|issue|release|track", l)), "")


def python_texts(dist: md.Distribution, t: Texts) -> list[str]:
    """License files of a distribution: by name, and everything under .dist-info/licenses (PEP 639)."""
    ids = []
    for f in dist.files or []:
        parts = [p.lower() for p in Path(str(f)).parts]
        in_licenses = any(p.endswith(".dist-info") for p in parts) and "licenses" in parts
        if (in_licenses or LICENSE_FILE.search(parts[-1])) and not parts[-1].endswith((".py", ".pyc", ".pyi")):
            tid = t.add_file(Path(dist.locate_file(f)))
            if tid:
                ids.append(tid)
    return ids


def engine(t: Texts) -> list[dict]:
    import PyInstaller

    out = [component("Python", ".".join(map(str, sys.version_info[:3])), "PSF-2.0", "https://www.python.org",
                     [t.add_file(require(Path(sys.base_prefix) / "LICENSE.txt", "Python license"))])]
    pyi = md.distribution("pyinstaller")
    out.append(component("PyInstaller bootloader", pyi.version, "GPL-2.0-or-later WITH Bootloader-exception",
                         "https://pyinstaller.org", python_texts(pyi, t)))
    for dist in engine_closure():
        ids = python_texts(dist, t)
        kept = PYTHON_FALLBACK.get(_norm(dist.metadata["Name"]))
        if not ids and kept:
            ids = [t.add_file(require(LICENSES / kept, f"{kept} (licenses/)"))]
        out.append(component(dist.metadata["Name"], dist.version, python_license(dist), python_url(dist), ids))
    return out


# ---------------------------------------------------------------- npm (UI, render worker, desktop shell)

def mit_text(pkg: dict) -> str:
    """The MIT License for a package that declares MIT but publishes no license file, with its author as holder."""
    author = pkg.get("author")
    holder = (author.get("name") if isinstance(author, dict) else str(author or "")).split("<")[0].strip()
    holder = holder or f"the authors of {pkg.get('name')}"
    return MIT.format(holder=holder)


def npm_license(pkg: dict) -> str:
    lic = pkg.get("license")
    if isinstance(lic, dict):
        lic = lic.get("type")
    if not lic and isinstance(pkg.get("licenses"), list):
        lic = " OR ".join(str((x or {}).get("type") or "") for x in pkg["licenses"])
    return str(lic or "")


def npm_url(pkg: dict) -> str:
    repo = pkg.get("repository")
    url = repo.get("url") if isinstance(repo, dict) else repo
    url = str(pkg.get("homepage") or url or "")
    url = re.sub(r"^git\+", "", url)
    url = re.sub(r"^git://", "https://", url)
    url = re.sub(r"\.git$", "", url)
    if re.fullmatch(r"[\w.-]+/[\w.-]+", url):  # "owner/repo" shorthand
        url = f"https://github.com/{url}"
    return url


def npm(folder: str, t: Texts) -> list[dict]:
    root = REPO / folder
    res = subprocess.run(["npm.cmd" if sys.platform == "win32" else "npm", "ls", "--omit=dev", "--all", "--parseable"],
                         cwd=root, capture_output=True, text=True)
    paths = [Path(p) for p in res.stdout.splitlines() if p.strip()]
    if not paths:
        sys.exit(f"gen-licenses: npm ls found nothing in {root} (npm install first)\n{res.stderr}")
    out: dict[tuple[str, str], dict] = {}
    for path in paths[1:]:  # the first line is the project itself
        try:
            pkg = json.loads((path / "package.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        name, version = pkg.get("name") or path.name, pkg.get("version") or ""
        ids = [tid for f in sorted(path.iterdir()) if f.is_file() and LICENSE_FILE.search(f.name) for tid in [t.add_file(f)] if tid]
        if name == "remotion" or name.startswith("@remotion/"):
            lic = npm_license(pkg)
            if not ids and "SEE LICENSE" in lic.upper():
                ids = [t.add_file(require(LICENSES / "remotion-LICENSE.md", "Remotion License"))]
                lic = "Remotion License"
            if name.startswith("@remotion/compositor-"):
                out[(name, version)] = component(name, version, lic or "Remotion License", npm_url(pkg),
                                                 ids or [t.add_file(LICENSES / "remotion-LICENSE.md")], note_key="remotion_ffmpeg")
                continue
            if not ids and lic.upper() == "MIT":
                ids = [t.add(mit_text(pkg))]
            out[(name, version)] = component(name, version, lic, npm_url(pkg), ids)
            continue
        lic = npm_license(pkg)
        if not ids and name.startswith("@next/") and (root / "node_modules" / "next" / "license.md").is_file():
            ids = [t.add_file(root / "node_modules" / "next" / "license.md")]  # published from the Next.js repository
        if not ids and lic.upper() == "MIT":
            ids = [t.add(mit_text(pkg))]
        out[(name, version)] = component(name, version, lic, npm_url(pkg), ids)
    return sorted(out.values(), key=lambda c: (c["name"].lower(), c["version"]))


# ---------------------------------------------------------------- output

GROUPS = [
    ("programs", "Programs shipped with MetisClip"),
    ("engine", "Engine (Python)"),
    ("ui", "User interface (npm)"),
    ("render", "Video render (npm)"),
    ("desktop", "Desktop shell (npm)"),
]


def notices_md(groups: list[dict]) -> str:
    lines = [
        "# Third-party notices",
        "",
        "MetisClip itself is licensed under the MIT License (see `LICENSE`). The installer also ships the",
        "third-party software below, each under its own license. The full license texts are in",
        "`frontend/public/third-party/licenses.json`, shown in the app under Sistem → Tentang MetisClip →",
        "Lisensi pihak ketiga. This file is generated by `scripts/gen-licenses.py`; do not edit it by hand.",
        "",
        "## FFmpeg",
        "",
        "`ffmpeg.exe` is the FFmpeg 7.1 essentials build by gyan.dev (the one imageio-ffmpeg 0.6.0 ships), licensed",
        "under the GNU GPL version 3. The installer puts the license text next to it (`bin/ffmpeg-GPL-3.0.txt`, the",
        "same as `licenses/GPL-3.0.txt`). MetisClip runs it as a separate program and does not link to it.",
        "",
        "Corresponding source: FFmpeg 7.1 at https://ffmpeg.org/releases/ffmpeg-7.1.tar.xz. The libraries built into",
        "it and their versions are printed by `ffmpeg -version` and listed at https://www.gyan.dev/ffmpeg/builds/.",
        "",
        "## Remotion",
        "",
        "The video render uses Remotion under the Remotion License (`licenses/remotion-LICENSE.md`). It is free for",
        "individuals, for-profit organizations with up to 3 employees and non-profit organizations; larger companies",
        "that render with MetisClip need a Remotion Company License (https://www.remotion.pro/license).",
        "",
        "`@remotion/compositor-win32-x64-msvc` contains Remotion's own FFmpeg build, which Remotion uses to put the",
        "rendered frames together (configured with `--enable-gpl --enable-nonfree`, libx264 and libfdk-aac).",
        "",
    ]
    for g in groups:
        lines += [f"## {g['title']}", "", "| Component | Version | License |", "|---|---|---|"]
        for c in g["components"]:
            name = f"[{c['name']}]({c['url']})" if c["url"].startswith("http") else c["name"]
            lines.append(f"| {name} | {c['version']} | {c['license'] or 'see its license text'} |")
        lines.append("")
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", help="a static export (frontend\\out) to write third-party/licenses.json into as well")
    args = ap.parse_args()
    sys.stdout.reconfigure(errors="replace")  # a console code page without the path's characters
    t = Texts()
    parts = {"programs": programs(t), "engine": engine(t), "ui": npm("frontend", t),
             "render": npm("render-engine", t), "desktop": npm("desktop", t)}
    groups = [{"id": gid, "title": title, "components": parts[gid]} for gid, title in GROUPS]
    used = {tid for g in groups for c in g["components"] for tid in c["texts"]}
    app = t.add_file(require(REPO / "LICENSE", "MetisClip's own LICENSE"))
    used.add(app)
    data = {"version": 1, "app": {"name": "MetisClip", "license": "MIT", "text": app}, "groups": groups,
            "texts": {k: t.by_id[k] for k in sorted(used)}}
    payload = json.dumps(data, ensure_ascii=False, indent=1, sort_keys=False) + "\n"
    targets = [JSON_OUT] + ([Path(args.out) / "third-party" / "licenses.json"] if args.out else [])
    for target in targets:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(payload.encode("utf-8"))
    MD_OUT.write_bytes((notices_md(groups) + "\n").encode("utf-8"))
    missing = [f"{g['id']}: {c['name']} {c['version']}" for g in groups for c in g["components"] if not c["texts"]]
    count = sum(len(g["components"]) for g in groups)
    print(f"{count} components, {len(used)} distinct texts, {len(payload) / 1024:.0f} KB -> {', '.join(map(str, targets))}")
    if missing:
        print(f"{len(missing)} without a license file (their license is named in the list):")
        for m in missing:
            print("  " + m)


if __name__ == "__main__":
    main()
