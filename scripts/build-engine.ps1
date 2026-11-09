<#
.SYNOPSIS
  Builds the MetisClip engine sidecar with PyInstaller (onedir).
  Output: backend\dist\metisclip-engine\metisclip-engine.exe
  Also places ffmpeg.exe (from imageio-ffmpeg) into desktop\resources\bin when it is missing.
#>
[CmdletBinding()]
param(
  [switch]$SkipSmokeTest
)
$ErrorActionPreference = 'Stop'
$Repo = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $Repo 'venv\Scripts\python.exe'
if (-not (Test-Path $Python)) { throw "venv not found: $Python (python -m venv venv; pip install -r backend\requirements.txt)" }

$Bin = Join-Path $Repo 'desktop\resources\bin'
New-Item -ItemType Directory -Force $Bin | Out-Null

# ffmpeg: the engine prefers bin\ffmpeg.exe; packaged builds do not include imageio-ffmpeg
$Ffmpeg = Join-Path $Bin 'ffmpeg.exe'
if (-not (Test-Path $Ffmpeg)) {
  $src = & $Python -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"
  if (-not $src -or -not (Test-Path $src)) { throw 'imageio-ffmpeg binary not found' }
  Copy-Item $src $Ffmpeg
  Write-Host "ffmpeg.exe copied from imageio-ffmpeg ($src)"
}

Push-Location (Join-Path $Repo 'backend')
try {
  # PyInstaller logs to stderr; in Windows PowerShell 5.1 that must not become a terminating error
  $ErrorActionPreference = 'Continue'
  & $Python -m PyInstaller --noconfirm --clean --distpath dist --workpath build metisclip-engine.spec 2>&1 | ForEach-Object { "$_" }
  $code = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  if ($code -ne 0) { throw "PyInstaller failed ($code)" }
} finally { Pop-Location }

$Exe = Join-Path $Repo 'backend\dist\metisclip-engine\metisclip-engine.exe'
if (-not (Test-Path $Exe)) { throw "Engine exe not produced: $Exe" }
$size = (Get-ChildItem (Split-Path $Exe) -Recurse | Measure-Object Length -Sum).Sum / 1MB
Write-Host ("Engine built: {0} ({1:N0} MB)" -f $Exe, $size)

if (-not $SkipSmokeTest) {
  # Fatal-path smoke test: without a reachable MongoDB the exe must print a JSON fatal line, not crash
  $env:METISCLIP_ENV = 'production'
  $env:METISCLIP_TOKEN = 'smoke'
  $tmp = Join-Path $env:TEMP ("metisclip-smoke-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
  $env:METISCLIP_DATA_ROOT = Join-Path $tmp 'data'
  $env:METISCLIP_APPDATA_DIR = Join-Path $tmp 'appdata'
  $env:METISCLIP_BIN_DIR = $Bin
  $env:METISCLIP_RENDER_DIR = Join-Path $Repo 'render-engine'
  $env:METISCLIP_MONGO_PORT = '1'
  $env:METISCLIP_SECRETS_BACKEND = 'memory'
  try {
    $ErrorActionPreference = 'Continue'
    $line = & $Exe 2>$null | Select-Object -First 1
    $ErrorActionPreference = 'Stop'
    Write-Host "Smoke output: $line"
    if ($line -notmatch '"event":\s*"(fatal|ready)"') { throw 'Engine did not print a ready/fatal line' }
    # Bundle self-test: ffmpeg + MediaPipe face tracking inside the frozen exe
    $ErrorActionPreference = 'Continue'
    $self = & $Exe --selftest 2>$null | Select-Object -First 1
    $ErrorActionPreference = 'Stop'
    Write-Host "Self-test: $self"
    if ($self -notmatch '"ok":\s*true') { throw 'Engine self-test failed (ffmpeg/MediaPipe not usable in the bundle)' }
  } finally {
    foreach ($k in 'METISCLIP_ENV','METISCLIP_TOKEN','METISCLIP_DATA_ROOT','METISCLIP_APPDATA_DIR','METISCLIP_BIN_DIR','METISCLIP_RENDER_DIR','METISCLIP_MONGO_PORT','METISCLIP_SECRETS_BACKEND') {
      Remove-Item "Env:$k" -ErrorAction SilentlyContinue
    }
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
  }
}

Write-Host "build-engine: OK"
exit 0
