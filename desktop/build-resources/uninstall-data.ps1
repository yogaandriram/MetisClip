# MetisClip uninstaller helper, run by build-resources\installer.nsh (customUnInstall; CLAUDE.md section 10.2).
# ASCII only: Windows PowerShell 5.1 reads a script without a BOM in the ANSI code page.
#
#   -Out <file.ini>  Writes what the uninstaller needs as a UTF-16 INI file (read with ReadINIStr): the UI
#                    language, the app data and tools folders, and the data folder and the one left from
#                    before a data move (each only when it really is a MetisClip data folder), with their
#                    sizes. Changes nothing.
#   -DeleteKeys      Deletes the API keys MetisClip saved in Windows Credential Manager.
#
# It honors the app's and the engine's test hooks, so an uninstall test never reaches the real data:
# METISCLIP_USERDATA_DIR (app data), METISCLIP_TOOLS_DIR (updatable tools), METISCLIP_KEYRING_SERVICE.
param(
  [string]$Out = '',
  [string]$NsisLanguage = '',
  [switch]$DeleteKeys
)

# backend/core/secrets.py PUBLIC_SECRETS (backend/tests/test_uninstaller.py keeps the two equal)
$KeyNames = @('openai_api_key', 'anthropic_api_key', 'gemini_api_key', 'xai_api_key', 'deepseek_api_key', 'qwen_api_key', 'llm_api_key', 'groq_api_key')

# What a data folder holds (CLAUDE.md section 6.1). Only these are deleted; the folder itself only when empty.
$Parts = @('db', 'library', 'exports', 'cache', 'backups', 'models', '.metisclip')

if ($DeleteKeys) {
  $service = if ($env:METISCLIP_KEYRING_SERVICE) { $env:METISCLIP_KEYRING_SERVICE } else { 'MetisClip' }
  # keyring keeps the newest key under the service name itself and the older ones as "<name>@<service>"
  $targets = @($service) + @($KeyNames | ForEach-Object { "$_@$service" })
  foreach ($target in $targets) {
    & "$env:SystemRoot\System32\cmdkey.exe" "/delete:$target" 2>&1 | Out-Null
  }
  exit 0
}

function Read-Json([string]$Path) {
  try {
    if (Test-Path -LiteralPath $Path -PathType Leaf) {
      return Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
    }
  } catch {}
  return $null
}

# A folder MetisClip made: a full local path, not a whole drive, not the user profile or a folder holding
# it, with its engine-private folder or its database. Anything else is never offered for deletion.
function Get-DataFolder($Path) {
  if (-not ($Path -is [string]) -or $Path -notmatch '^[A-Za-z]:\\') { return '' }
  try { $full = [IO.Path]::GetFullPath($Path).TrimEnd('\') } catch { return '' }
  if ($full.Length -le 2) { return '' }
  $profileDir = [Environment]::GetFolderPath('UserProfile').TrimEnd('\')
  if ($profileDir -and ($profileDir -eq $full -or $profileDir.StartsWith($full + '\', [StringComparison]::OrdinalIgnoreCase))) { return '' }
  if (-not (Test-Path -LiteralPath $full -PathType Container)) { return '' }
  $marked = (Test-Path -LiteralPath (Join-Path $full '.metisclip') -PathType Container) -or
            (Test-Path -LiteralPath (Join-Path $full 'db\WiredTiger') -PathType Leaf)
  if ($marked) { return $full }
  return ''
}

# The size the user would get back (the cache is emptied either way)
function Get-DataSize([string]$Root) {
  $total = [long]0
  foreach ($part in $Parts) {
    if ($part -eq 'cache') { continue }
    $dir = Join-Path $Root $part
    if (Test-Path -LiteralPath $dir) {
      Get-ChildItem -LiteralPath $dir -Recurse -File -Force -ErrorAction SilentlyContinue | ForEach-Object { $total += $_.Length }
    }
  }
  return $total
}

function Format-Size([long]$Bytes, [string]$Lang) {
  $culture = [Globalization.CultureInfo]::GetCultureInfo($(if ($Lang -eq 'id') { 'id-ID' } else { 'en-GB' }))
  if ($Bytes -ge 1GB) { return ($Bytes / 1GB).ToString('0.0', $culture) + ' GB' }
  if ($Bytes -ge 1MB) { return [math]::Round($Bytes / 1MB).ToString('0', $culture) + ' MB' }
  return [math]::Max(1, [math]::Round($Bytes / 1KB)).ToString('0', $culture) + ' KB'
}

$lang = if ($NsisLanguage -eq '1057') { 'id' } else { 'en' }
$lines = @()
try {
  $appData = if ($env:METISCLIP_USERDATA_DIR) { [IO.Path]::GetFullPath($env:METISCLIP_USERDATA_DIR) }
             else { Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'MetisClip' }
  $tools = if ($env:METISCLIP_TOOLS_DIR) { [IO.Path]::GetFullPath($env:METISCLIP_TOOLS_DIR) }
           else { Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'MetisClip' }
  $prefs = Read-Json (Join-Path $appData 'preferences.json')
  if ($prefs -and ($prefs.language -eq 'id' -or $prefs.language -eq 'en')) { $lang = $prefs.language }

  $boot = Read-Json (Join-Path $appData 'bootstrap.json')
  $root = if ($boot) { Get-DataFolder $boot.data_root } else { '' }
  $previous = if ($boot) { Get-DataFolder $boot.previous_data_root } else { '' }
  if ($previous -and $previous -eq $root) { $previous = '' }

  $lines += "appdata=$appData", "tools=$tools"
  if ($root) { $lines += "root=$root", ("root_size=" + (Format-Size (Get-DataSize $root) $lang)) }
  if ($previous) { $lines += "previous=$previous", ("previous_size=" + (Format-Size (Get-DataSize $previous) $lang)) }
} catch {
  # Without the paths the uninstaller only removes the app; nothing is asked or deleted
  $lines = @()
}

if ($Out) {
  # A UTF-16 file with a BOM: GetPrivateProfileStringW then reads non-ASCII paths correctly
  [IO.File]::WriteAllLines($Out, [string[]](@('[data]', "lang=$lang") + $lines), (New-Object Text.UnicodeEncoding($false, $true)))
}
exit 0
