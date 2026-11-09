<#
.SYNOPSIS
  Downloads the pinned third-party binaries MetisClip Desktop ships with and
  places them in desktop\resources\bin (gitignored).

.DESCRIPTION
  - mongod.exe (MongoDB Community Server, only the server binary + license files)
  - yt-dlp.exe (standalone build, self-updatable at runtime)
  - deno.exe   (JavaScript runtime used by recent yt-dlp for YouTube)

  Every archive is verified against a pinned SHA256 before extraction.
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
      foreach ($want in $p.Take) {
        $found = Get-ChildItem -LiteralPath $extract -Recurse -File | Where-Object { $_.Name -eq $want } | Select-Object -First 1
        if (-not $found) {
          if ($want -like '*.exe') { throw ("{0} not found inside {1}" -f $want, $fileName) }
          Write-Warning ("{0} not found inside {1} (skipped)" -f $want, $fileName)
          continue
        }
        $dest = $want
        if ($want -notlike '*.exe') { $dest = ('{0}-{1}' -f $p.Name, $want) }   # e.g. mongod-LICENSE-Community.txt
        Copy-Item -LiteralPath $found.FullName -Destination (Join-Path $BinDir $dest) -Force
      }
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
