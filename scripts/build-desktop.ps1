<#
.SYNOPSIS
  Production build of MetisClip Desktop -> desktop\dist\MetisClip-Setup-<version>.exe

.DESCRIPTION
  1. frontend      : npm ci + next build (output: 'export')          -> frontend\out
  2. render-engine : npm ci + npm run build (Remotion bundle + worker) -> render-engine\build, render-engine\dist
                     then stages the runtime (production node_modules + Chrome Headless Shell)
                                                                       -> desktop\.stage\render-engine
  3. engine        : scripts\build-engine.ps1 (PyInstaller onedir)     -> backend\dist\metisclip-engine
  4. binaries      : scripts\fetch-binaries.ps1 when a pinned binary is missing -> desktop\resources\bin
  5. desktop       : npm ci + tsc + electron-builder (NSIS, or --dir with -Pack)

  Fails fast on the first error.

.EXAMPLE
  .\scripts\build-desktop.ps1                 # full build, NSIS installer
  .\scripts\build-desktop.ps1 -Pack           # unpacked app in desktop\dist\win-unpacked (no installer)
  .\scripts\build-desktop.ps1 -Pack -NoInstall -SkipEngine   # quick re-pack with existing node_modules/engine
#>
[CmdletBinding()]
param(
  [switch]$Pack,          # electron-builder --dir instead of the NSIS installer
  [switch]$NoInstall,     # skip `npm ci` (reuse existing node_modules)
  [switch]$SkipFrontend,  # reuse existing frontend\out
  [switch]$SkipEngine     # reuse existing backend\dist\metisclip-engine
)

$ErrorActionPreference = 'Stop'
$Repo     = Split-Path -Parent $PSScriptRoot
$Frontend = Join-Path $Repo 'frontend'
$Render   = Join-Path $Repo 'render-engine'
$Desktop  = Join-Path $Repo 'desktop'
$Stage    = Join-Path $Desktop '.stage\render-engine'
$started  = Get-Date

function Step([string]$Text) { Write-Host ''; Write-Host "==> $Text" -ForegroundColor Cyan }

# Run a native command in a directory; throw on a non-zero exit code. Native stderr must not become
# a terminating error in Windows PowerShell 5.1, so the preference is relaxed around the call.
function Invoke-Native([string]$Dir, [string]$Exe, [string[]]$Arguments) {
  Push-Location $Dir
  $prev = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    Write-Host ("   [{0}] {1} {2}" -f (Split-Path -Leaf $Dir), $Exe, ($Arguments -join ' ')) -ForegroundColor DarkGray
    & $Exe @Arguments 2>&1 | ForEach-Object { "$_" }
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $prev
    Pop-Location
  }
  if ($code -ne 0) { throw ("'{0} {1}' failed in {2} (exit {3})" -f $Exe, ($Arguments -join ' '), $Dir, $code) }
}

function Npm-Install([string]$Dir) {
  if ($NoInstall -and (Test-Path (Join-Path $Dir 'node_modules'))) { Write-Host "   npm install skipped ($Dir)"; return }
  if (Test-Path (Join-Path $Dir 'package-lock.json')) { Invoke-Native $Dir 'npm.cmd' @('ci', '--no-audit', '--no-fund') }
  else { Invoke-Native $Dir 'npm.cmd' @('install', '--no-audit', '--no-fund') }
}

function Assert-Path([string]$Path, [string]$What) {
  if (-not (Test-Path -LiteralPath $Path)) { throw "$What not found: $Path" }
}

# ---- 0. prerequisites -------------------------------------------------------------------------
Step 'Checking prerequisites'
foreach ($cmd in 'node', 'npm.cmd') {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw "$cmd is not on PATH (install Node.js 20+)" }
}
Write-Host ("   node {0}" -f (& node --version))

# ---- 1. frontend ----------------------------------------------------------------------------------
if ($SkipFrontend) {
  Step 'Frontend: skipped (-SkipFrontend)'
} else {
  Step 'Frontend: next build (static export)'
  Npm-Install $Frontend
  Invoke-Native $Frontend 'npm.cmd' @('run', 'build')
}
Assert-Path (Join-Path $Frontend 'out\index.html') 'Static UI (frontend\out\index.html)'

# ---- 2. render-engine -------------------------------------------------------------------------------
Step 'Render engine: Remotion bundle + render worker'
Npm-Install $Render
Invoke-Native $Render 'npm.cmd' @('run', 'build')
Assert-Path (Join-Path $Render 'build\index.html') 'Remotion bundle'
Assert-Path (Join-Path $Render 'dist\render.js') 'Render worker'

$BrowserSrc = Join-Path $Render 'node_modules\.remotion\chrome-headless-shell\win64\chrome-headless-shell-win64'
if (-not (Test-Path (Join-Path $BrowserSrc 'chrome-headless-shell.exe'))) {
  Invoke-Native $Render 'npx.cmd' @('remotion', 'browser', 'ensure')
}
Assert-Path (Join-Path $BrowserSrc 'chrome-headless-shell.exe') 'Chrome Headless Shell'

Step 'Render engine: staging runtime -> desktop\.stage\render-engine'
if (Test-Path $Stage) { Remove-Item -LiteralPath $Stage -Recurse -Force }
New-Item -ItemType Directory -Force $Stage | Out-Null
Copy-Item -LiteralPath (Join-Path $Render 'package.json') -Destination $Stage
Copy-Item -LiteralPath (Join-Path $Render 'package-lock.json') -Destination $Stage
Copy-Item -LiteralPath (Join-Path $Render 'dist') -Destination $Stage -Recurse
Copy-Item -LiteralPath (Join-Path $Render 'build') -Destination $Stage -Recurse
# production dependencies only: @remotion/renderer (+ compositor-win32-x64-msvc), remotion, react, react-dom
Invoke-Native $Stage 'npm.cmd' @('ci', '--omit=dev', '--no-audit', '--no-fund')
Assert-Path (Join-Path $Stage 'node_modules\@remotion\compositor-win32-x64-msvc') 'Remotion compositor (win32-x64)'
# Chrome Headless Shell at <render-engine>\browser\chrome-headless-shell.exe (found by render.js and main)
Copy-Item -LiteralPath $BrowserSrc -Destination (Join-Path $Stage 'browser') -Recurse
Remove-Item -LiteralPath (Join-Path $Stage 'browser\debug.log') -Force -ErrorAction SilentlyContinue
$stageMb = [math]::Round(((Get-ChildItem -LiteralPath $Stage -Recurse -File | Measure-Object Length -Sum).Sum / 1MB), 1)
Write-Host "   staged render-engine: $stageMb MB"

# ---- 3. engine ----------------------------------------------------------------------------------------
$EngineExe = Join-Path $Repo 'backend\dist\metisclip-engine\metisclip-engine.exe'
if ($SkipEngine) {
  Step 'Engine: skipped (-SkipEngine)'
} else {
  Step 'Engine: PyInstaller (scripts\build-engine.ps1)'
  $buildEngine = Join-Path $PSScriptRoot 'build-engine.ps1'
  Assert-Path $buildEngine 'scripts\build-engine.ps1'
  & $buildEngine
}
Assert-Path $EngineExe 'Engine executable'

# ---- 4. binaries ----------------------------------------------------------------------------------------
Step 'Binaries'
$Bins = 'mongod.exe', 'yt-dlp.exe', 'deno.exe', 'whisper\whisper-cli.exe'
if (@($Bins | Where-Object { -not (Test-Path (Join-Path $Desktop "resources\bin\$_")) }).Count -gt 0) {
  & (Join-Path $PSScriptRoot 'fetch-binaries.ps1')
}
foreach ($b in $Bins) { Assert-Path (Join-Path $Desktop "resources\bin\$b") $b }
Write-Host ('   {0} present' -f ($Bins -join ', '))

# ---- 5. desktop -------------------------------------------------------------------------------------------
Step 'Desktop: Electron main + electron-builder'
Npm-Install $Desktop
Invoke-Native $Desktop 'npm.cmd' @('run', 'build:main')
$target = if ($Pack) { 'dir' } else { 'nsis' }
Invoke-Native $Desktop 'npx.cmd' @('electron-builder', '--win', $target, '--x64', '--config', 'electron-builder.yml')

$elapsed = [math]::Round(((Get-Date) - $started).TotalMinutes, 1)
Write-Host ''
if ($Pack) {
  $out = Join-Path $Desktop 'dist\win-unpacked\MetisClip.exe'
  Assert-Path $out 'Unpacked app'
  Write-Host "Done in $elapsed min: $out" -ForegroundColor Green
} else {
  $installer = Get-ChildItem -LiteralPath (Join-Path $Desktop 'dist') -Filter 'MetisClip-Setup-*.exe' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $installer) { throw 'Installer not produced in desktop\dist' }
  Write-Host ("Done in {0} min: {1} ({2} MB)" -f $elapsed, $installer.FullName, [math]::Round($installer.Length / 1MB, 1)) -ForegroundColor Green
}
