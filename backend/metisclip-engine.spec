# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for the MetisClip engine sidecar (onedir).
# Build: .\scripts\build-engine.ps1   ->  backend\dist\metisclip-engine\metisclip-engine.exe
#
# Console subsystem on purpose: Electron reads the ready line from stdout and
# spawns the exe with windowsHide, so no console window is shown.
from pathlib import Path

from PyInstaller.utils.hooks import collect_data_files, collect_submodules

REPO = Path(SPECPATH).resolve().parent

hiddenimports = (
    collect_submodules("backend")
    + collect_submodules("uvicorn")
    + collect_submodules("websockets")
    + collect_submodules("keyring.backends")
    + ["win32ctypes.core", "multipart", "python_multipart", "pymongo.srv_resolver"]
)

datas = (
    collect_data_files("mediapipe", includes=["**/*.tflite", "**/*.binarypb", "**/*.txt", "**/*.pbtxt"])
    + collect_data_files("youtube_transcript_api")
    + collect_data_files("certifi")
)

a = Analysis(
    [str(REPO / "backend" / "run.py")],
    pathex=[str(REPO)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=[
        "tkinter", "IPython", "jupyter", "notebook", "pytest", "PyInstaller",
        # dev-only: packaged builds use the standalone yt-dlp.exe and bin\ffmpeg.exe
        "yt_dlp", "imageio_ffmpeg",
        # unused leftovers from the web build
        "boto3", "botocore", "langgraph", "langchain", "langchain_core", "langchain_groq",
        "langchain_openai", "redis", "jwt", "torch", "tensorflow", "sounddevice",
    ],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="metisclip-engine",
    debug=False,
    strip=False,
    upx=False,
    console=True,
    icon=str(REPO / "desktop" / "resources" / "icon.ico") if (REPO / "desktop" / "resources" / "icon.ico").exists() else None,
)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name="metisclip-engine")
