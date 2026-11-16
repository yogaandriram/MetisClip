"""Text in an image with the OCR engine built into Windows 10/11 (Windows.Media.Ocr), for campaign brief
screenshots when the LLM cannot read images (a text-only model, DeepSeek, an offline router).

It runs in Windows PowerShell 5.1 through WinRT, so nothing is installed or downloaded. The OCR
languages are the ones Windows has for the user's display languages (English is nearly always there;
Indonesian text in Latin script reads well with it). The script goes in as -EncodedCommand and the
image path through an environment variable, so paths with spaces or non-ASCII characters are safe.
"""
from __future__ import annotations

import base64
import logging
import os
import shutil
import sys
from pathlib import Path

from backend.core import procs

logger = logging.getLogger(__name__)

MAX_SIDE = 4000  # below Windows OCR's MaxImageDimension (10000), and faster

_SCRIPT = r"""
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, [Type]$type) {
    $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
    $task.Wait(-1) | Out-Null
    $task.Result
}
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if ($null -eq $engine) { Write-Error 'no OCR language'; exit 3 }
$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($env:METISCLIP_OCR_IMAGE)) ([Windows.Storage.StorageFile])
$stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
try {
    $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
    foreach ($line in $result.Lines) { [Console]::Out.WriteLine($line.Text) }
} finally { $stream.Dispose() }
"""


class OcrUnavailable(Exception):
    pass


def _powershell() -> str | None:
    if sys.platform != "win32":
        return None
    root = os.environ.get("SystemRoot") or r"C:\Windows"
    exe = Path(root) / "System32" / "WindowsPowerShell" / "v1.0" / "powershell.exe"
    return str(exe) if exe.is_file() else shutil.which("powershell.exe")


def available() -> bool:
    return _powershell() is not None


def _prepared(image: Path, work_dir: Path) -> Path:
    """A PNG copy no larger than MAX_SIDE (BitmapDecoder cannot read WEBP everywhere)."""
    from PIL import Image

    work_dir.mkdir(parents=True, exist_ok=True)
    out = work_dir / f"ocr-{os.getpid()}-{abs(hash(str(image))) % 10**8}.png"
    with Image.open(image) as im:
        im.seek(0)
        img = im.convert("RGB")
    img.thumbnail((MAX_SIDE, MAX_SIDE))
    img.save(out, "PNG")
    return out


def read_image(image: Path, work_dir: Path, *, cancel: procs.CancelToken | None = None,
               timeout: float = 60.0) -> str:
    """The text lines of an image ('' when it has none). Raises OcrUnavailable when Windows OCR is
    missing or fails."""
    exe = _powershell()
    if exe is None:
        raise OcrUnavailable("Windows OCR is only available on Windows")
    png = _prepared(image, work_dir)
    env = {**os.environ, "METISCLIP_OCR_IMAGE": str(png)}
    encoded = base64.b64encode(_SCRIPT.encode("utf-16-le")).decode("ascii")
    try:
        res = procs.run([exe, "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
                         "-EncodedCommand", encoded], env=env, cancel=cancel, timeout=timeout, check=False)
    except procs.Cancelled:
        raise
    except Exception as exc:
        raise OcrUnavailable(str(exc)) from exc
    finally:
        png.unlink(missing_ok=True)
    if res.returncode != 0:
        err = (res.stderr or b"").decode("utf-8", "replace").strip().splitlines()
        logger.warning("Windows OCR failed (%s): %s", res.returncode, err[-1:] or "")
        raise OcrUnavailable((err[-1] if err else f"exit {res.returncode}")[:300])
    text = (res.stdout or b"").decode("utf-8", "replace")
    return "\n".join(line.rstrip() for line in text.splitlines() if line.strip())
