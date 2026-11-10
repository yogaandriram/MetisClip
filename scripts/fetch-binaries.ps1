<#
.SYNOPSIS
  Downloads the pinned third-party binaries MetisClip Desktop ships with and
  places them in desktop\resources\bin (gitignored).

.DESCRIPTION
  - mongod.exe (MongoDB Community Server, only the server binary + license files)
  - yt-dlp.exe (standalone build, self-updatable at runtime)
  - deno.exe   (JavaScript runtime used by recent yt-dlp for YouTube)
  - whisper\   (whisper.cpp CPU build: whisper-cli.exe, its ggml DLLs and the MIT license) for
                local speech-to-text. The GGML models are not bundled; the engine downloads one
                on first use into <DATA_ROOT>\models\whisper.

  Every download is verified against a pinned SHA256 before extraction.
  FFmpeg is not downloaded here: the engine uses the ffmpeg binary that ships
  with the imageio-ffmpeg Python package (collected by PyInstaller), and
  Remotion bundles its own compositor.

.EXAMPLE
  .\scripts\fetch-binaries.ps1
  .\scripts\fetch-binaries.ps1 -Force      # re-download even if present
#>
[CmdletBinding()]
param(
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # Invoke-WebRequest is very slow with the progress bar on PS 5.1
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Root   = Split-Path -Parent $PSScriptRoot
$BinDir = Join-Path $Root 'desktop\resources\bin'
$TmpDir = Join-Path $env:TEMP ('metisclip-fetch-' + [guid]::NewGuid().ToString('N'))

# ---- Pinned versions -------------------------------------------------------
$Pins = @(
  @{
    Name    = 'mongod'
    Version = '8.0.34'
    Url     = 'https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-8.0.34.zip'
    Sha256  = '6b021a0864494e4decf278b36477a29eb36072432773e4e62c2f42c302630db0'
    Kind    = 'zip'
    # Files to take from the archive (matched by file name anywhere in it)
    Take    = @('mongod.exe', 'LICENSE-Community.txt', 'MPL-2', 'THIRD-PARTY-NOTICES')
    Target  = 'mongod.exe'
  },
  @{
    Name    = 'yt-dlp'
    Version = '2026.10.26'
    Url     = 'https://github.com/yt-dlp/yt-dlp/releases/download/2026.10.26/yt-dlp.exe'
    Sha256  = 'f5389d3698ecde4ef06f4e6b1ce0294fe9ac1396228c8990b8d3416d6d177a7d'
    Kind    = 'exe'
    Target  = 'yt-dlp.exe'
  },
  @{
    Name    = 'deno'
    Version = '2.9.8'
    Url     = 'https://github.com/denoland/deno/releases/download/v2.9.8/deno-x86_64-pc-windows-msvc.zip'
    Sha256  = 'cba84b26e0df5ae7f74fc66b86a95b866872a86292ebd84fa1e959927edd93bf'
    Kind    = 'zip'
    Take    = @('deno.exe')
    Target  = 'deno.exe'
  },
  @{
    # Release tag b5454 = whisper.cpp 1.9.5. CPU x64 build: ggml picks the best ggml-cpu-*.dll for the
    # CPU at runtime (sse42 .. alderlake). The BLAS and CUDA builds were measured or judged not worth
    # their size (BLAS: no faster end to end; CUDA: 285-685 MB, NVIDIA only).
    Name    = 'whisper'
    Version = '1.9.5'
    Url     = 'https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip'
    Sha256  = '6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb'
    Kind    = 'zip'
    Take    = @('whisper-cli.exe', 'whisper.dll', 'ggml.dll', 'ggml-base.dll',
                'ggml-cpu-x64.dll', 'ggml-cpu-sse42.dll', 'ggml-cpu-sandybridge.dll', 'ggml-cpu-haswell.dll',
                'ggml-cpu-skylakex.dll', 'ggml-cpu-cannonlake.dll', 'ggml-cpu-cascadelake.dll',
                'ggml-cpu-icelake.dll', 'ggml-cpu-alderlake.dll')
    Subdir  = 'whisper'          # files keep their names inside bin\whisper
    Target  = 'whisper\whisper-cli.exe'
    Extra   = @(
      @{ Url = 'https://raw.githubusercontent.com/ggml-org/whisper.cpp/b5454/LICENSE'
         Sha256 = '94f29bbed6a22c35b992c5c6ebf0e7c92f13b836b90f36f461c9cf2f0f1d010d'
         Dest = 'whisper\LICENSE' }
    )
  }
)

function Get-Sha256([string]$Path) {
  (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
}

New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
New-Item -ItemType Directory -Force -Path $TmpDir | Out-Null

$manifest = [ordered]@{}
$manifestPath = Join-Path $BinDir 'versions.json'
if (Test-Path $manifestPath) {
  try { (Get-Content $manifestPath -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $manifest[$_.Name] = $_.Value } } catch {}
}

try {
  foreach ($p in $Pins) {
    $targetPath = Join-Path $BinDir $p.Target
    $current = $manifest[$p.Name]
    if (-not $Force -and (Test-Path $targetPath) -and $current -eq $p.Version) {
      Write-Host ("[skip] {0} {1} already present" -f $p.Name, $p.Version)
      continue
    }

    $fileName = Split-Path -Leaf $p.Url
    $download = Join-Path $TmpDir $fileName
    Write-Host ("[get ] {0} {1}" -f $p.Name, $p.Version)
    Invoke-WebRequest -Uri $p.Url -OutFile $download -UseBasicParsing

    $hash = Get-Sha256 $download
    if ($hash -ne $p.Sha256.ToLowerInvariant()) {
      throw ("SHA256 mismatch for {0}: expected {1}, got {2}" -f $fileName, $p.Sha256, $hash)
    }
    Write-Host ("[ ok ] sha256 verified for {0}" -f $fileName)

    if ($p.Kind -eq 'exe') {
      Copy-Item -LiteralPath $download -Destination $targetPath -Force
    }
    else {
      $extract = Join-Path $TmpDir ($p.Name + '-x')
      Expand-Archive -LiteralPath $download -DestinationPath $extract -Force
      $destDir = $BinDir
      if ($p.Subdir) {
        $destDir = Join-Path $BinDir $p.Subdir
        if (Test-Path $destDir) { Remove-Item -LiteralPath $destDir -Recurse -Force }
        New-Item -ItemType Directory -Force -Path $destDir | Out-Null
      }
      foreach ($want in $p.Take) {
        $found = Get-ChildItem -LiteralPath $extract -Recurse -File | Where-Object { $_.Name -eq $want } | Select-Object -First 1
        if (-not $found) {
          if ($want -like '*.exe') { throw ("{0} not found inside {1}" -f $want, $fileName) }
          Write-Warning ("{0} not found inside {1} (skipped)" -f $want, $fileName)
          continue
        }
        $dest = $want
        if (-not $p.Subdir -and $want -notlike '*.exe') { $dest = ('{0}-{1}' -f $p.Name, $want) }   # e.g. mongod-LICENSE-Community.txt
        Copy-Item -LiteralPath $found.FullName -Destination (Join-Path $destDir $dest) -Force
      }
    }

    foreach ($x in @($p.Extra)) {
      if (-not $x) { continue }
      $xFile = Join-Path $TmpDir ([guid]::NewGuid().ToString('N'))
      Invoke-WebRequest -Uri $x.Url -OutFile $xFile -UseBasicParsing
      $xHash = Get-Sha256 $xFile
      if ($xHash -ne $x.Sha256.ToLowerInvariant()) {
        throw ("SHA256 mismatch for {0}: expected {1}, got {2}" -f $x.Url, $x.Sha256, $xHash)
      }
      Copy-Item -LiteralPath $xFile -Destination (Join-Path $BinDir $x.Dest) -Force
    }

    $manifest[$p.Name] = $p.Version
    Write-Host ("[done] {0} -> {1}" -f $p.Name, $targetPath)
  }

  ($manifest | ConvertTo-Json) | Set-Content -LiteralPath $manifestPath -Encoding UTF8
  Write-Host ''
  Write-Host ("Binaries ready in {0}" -f $BinDir)
  Get-ChildItem -LiteralPath $BinDir | Select-Object Name, @{n='MB';e={[math]::Round($_.Length / 1MB, 1)}} | Format-Table -AutoSize
}
finally {
  if (Test-Path $TmpDir) { Remove-Item -LiteralPath $TmpDir -Recurse -Force -ErrorAction SilentlyContinue }
}
