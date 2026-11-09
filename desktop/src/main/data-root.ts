// Data folder: bootstrap.json, validation (§1 of docs/desktop-contract.md) and folder structure.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { app } from 'electron'
import { getPaths } from './paths'
import { powershell } from './procs'
import { createLogger } from './logger'

const log = createLogger('data-root')

export const SUBFOLDERS = ['db', 'library', 'exports', 'cache', 'backups', '.metisclip']

const GB = 1024 ** 3
const MIN_OK_BYTES = 15 * GB
const MIN_BLOCK_BYTES = 2 * GB
const MAX_PATH_OK = 60

export interface DataRootCheck {
  ok: boolean
  path: string
  problems: string[]
  warnings: string[]
  freeBytes: number
  totalBytes: number
  existingData: boolean
}

interface Bootstrap {
  data_root: string
  created_at: string
}

/** METISCLIP_DATA_ROOT_OVERRIDE: verification hook, use this folder without touching bootstrap.json. */
export function dataRootOverride(): string | null {
  const v = process.env.METISCLIP_DATA_ROOT_OVERRIDE
  return v ? path.resolve(v) : null
}

export function readBootstrap(): string | null {
  const override = dataRootOverride()
  if (override) return override
  const file = getPaths().bootstrapFile
  try {
    const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
    const data = JSON.parse(raw) as Partial<Bootstrap>
    if (typeof data.data_root === 'string' && path.isAbsolute(data.data_root)) return path.normalize(data.data_root)
    log.warn(`bootstrap.json tanpa data_root yang valid: ${file}`)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') log.error(`gagal membaca ${file}:`, e)
  }
  return null
}

export function writeBootstrap(dataRoot: string): void {
  if (dataRootOverride()) {
    log.info(`METISCLIP_DATA_ROOT_OVERRIDE aktif: bootstrap.json tidak ditulis (${dataRoot})`)
    return
  }
  const file = getPaths().bootstrapFile
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const body: Bootstrap = { data_root: dataRoot, created_at: new Date().toISOString() }
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(body, null, 2), 'utf8')
  fs.renameSync(tmp, file)
  log.info(`bootstrap.json ditulis: ${dataRoot}`)
}

export function defaultDataRoot(): string {
  return path.join(os.homedir(), 'MetisClip')
}

export function hasExistingData(root: string): boolean {
  return fs.existsSync(path.join(root, 'db', 'WiredTiger'))
}

export function ensureStructure(root: string): void {
  fs.mkdirSync(root, { recursive: true })
  for (const sub of SUBFOLDERS) fs.mkdirSync(path.join(root, sub), { recursive: true })
}

/** true when the data root folder (its drive) is reachable right now */
export function dataRootAvailable(root: string): boolean {
  try {
    return fs.statSync(root).isDirectory()
  } catch {
    return false
  }
}

function nearestExisting(p: string): string | null {
  let cur = p
  for (;;) {
    if (fs.existsSync(cur)) return cur
    const parent = path.dirname(cur)
    if (parent === cur) return null
    cur = parent
  }
}

const CLOUD_SEGMENTS = ['onedrive', 'dropbox', 'google drive', 'my drive', 'googledrive', 'icloud drive', 'iclouddrive']

function cloudSyncReason(p: string): string | null {
  const lower = p.toLowerCase()
  const roots = [process.env.OneDrive, process.env.OneDriveConsumer, process.env.OneDriveCommercial].filter(Boolean) as string[]
  for (const r of roots) {
    const rl = path.resolve(r).toLowerCase()
    if (lower === rl || lower.startsWith(rl + path.sep)) return 'OneDrive'
  }
  const segments = lower.split(/[\\/]+/)
  for (const seg of segments) {
    if (seg === 'onedrive' || seg.startsWith('onedrive - ')) return 'OneDrive'
    if (CLOUD_SEGMENTS.includes(seg)) return seg === 'dropbox' ? 'Dropbox' : seg.includes('icloud') ? 'iCloud Drive' : 'Google Drive'
  }
  return null
}

interface DriveInfo {
  type: string
  ready: boolean
  free: number
  total: number
}

async function driveInfo(root: string): Promise<DriveInfo | null> {
  if (!/^[A-Za-z]:\\$/.test(root)) return null
  const r = await powershell(
    `$d = New-Object System.IO.DriveInfo('${root}'); ` +
      `[Console]::Out.Write(('{0}|{1}|{2}|{3}' -f $d.DriveType, $d.IsReady, $(if ($d.IsReady) { $d.AvailableFreeSpace } else { 0 }), $(if ($d.IsReady) { $d.TotalSize } else { 0 })))`,
    10000,
  )
  const m = /^(\w+)\|(True|False)\|(\d+)\|(\d+)/.exec(r.stdout.trim())
  if (!m) {
    log.warn(`DriveInfo gagal untuk ${root}: ${r.stderr.trim() || r.stdout.trim()}`)
    return null
  }
  return { type: m[1], ready: m[2] === 'True', free: Number(m[3]), total: Number(m[4]) }
}

async function statfsInfo(p: string): Promise<{ free: number; total: number } | null> {
  try {
    const s = await fs.promises.statfs(p)
    return { free: s.bavail * s.bsize, total: s.blocks * s.bsize }
  } catch {
    return null
  }
}

/** Try to create the folder and a temp file in it; removes whatever it created. */
function writableCheck(target: string): string | null {
  const created: string[] = []
  try {
    let cur = target
    const missing: string[] = []
    while (!fs.existsSync(cur)) {
      missing.unshift(cur)
      const parent = path.dirname(cur)
      if (parent === cur) break
      cur = parent
    }
    for (const dir of missing) {
      fs.mkdirSync(dir)
      created.push(dir)
    }
    const probe = path.join(target, `.metisclip-write-test-${process.pid}-${Date.now()}`)
    fs.writeFileSync(probe, 'ok')
    fs.unlinkSync(probe)
    return null
  } catch (e) {
    return (e as Error).message
  } finally {
    for (const dir of created.reverse()) {
      try {
        fs.rmdirSync(dir)
      } catch {
        // not empty or locked: leave it
      }
    }
  }
}

export async function validateDataRoot(input: string): Promise<DataRootCheck> {
  const problems: string[] = []
  const warnings: string[] = []
  const raw = (input || '').trim()
  const result: DataRootCheck = {
    ok: false,
    path: raw,
    problems,
    warnings,
    freeBytes: 0,
    totalBytes: 0,
    existingData: false,
  }

  if (!raw || !path.win32.isAbsolute(raw) || !/^[A-Za-z]:[\\/]/.test(raw)) {
    problems.push('Path harus berupa folder lengkap di drive lokal, misalnya D:\\MetisClip.')
    return result
  }
  const p = path.resolve(raw)
  result.path = p
  const root = path.parse(p).root.toUpperCase()

  if (p.toUpperCase() === root) {
    problems.push('Pilih atau buat sebuah folder, jangan langsung akar drive (misalnya D:\\MetisClip, bukan D:\\).')
  }

  // Not inside cloud-sync folders (resolve junctions / redirected known folders when the path exists)
  let real = p
  const existing = nearestExisting(p)
  if (existing) {
    try {
      const r = fs.realpathSync.native(existing)
      real = path.join(r, path.relative(existing, p))
    } catch {
      // keep p
    }
  }
  const cloud = cloudSyncReason(p) || cloudSyncReason(real)
  if (cloud) {
    problems.push(`Folder ini ada di dalam ${cloud}. Aplikasi sinkronisasi cloud bisa merusak file database, pilih folder lain (misalnya D:\\MetisClip).`)
  }

  const winDir = (process.env.SystemRoot || process.env.windir || 'C:\\Windows').toLowerCase()
  const lower = p.toLowerCase()
  if (lower === winDir || lower.startsWith(winDir + '\\')) problems.push('Folder sistem Windows tidak boleh dipakai.')
  if (app.isPackaged) {
    const appDir = path.dirname(process.execPath).toLowerCase()
    if (lower === appDir || lower.startsWith(appDir + '\\')) {
      problems.push('Jangan simpan data di dalam folder instalasi aplikasi (akan terhapus saat update/uninstall).')
    }
  }

  // Drive type and free space
  const info = await driveInfo(root)
  if (info) {
    if (info.type === 'NoRootDirectory') problems.push(`Drive ${root} tidak ditemukan.`)
    else if (!info.ready) problems.push(`Drive ${root} tidak siap atau tidak terpasang.`)
    else if (info.type === 'Removable') problems.push(`Drive ${root} adalah drive lepas-pasang (flashdisk/kartu memori). Pilih drive lokal tetap.`)
    else if (info.type === 'Network') problems.push(`Drive ${root} adalah drive jaringan. Database harus berada di drive lokal.`)
    else if (info.type === 'CDRom') problems.push(`Drive ${root} adalah drive CD/DVD.`)
    else if (info.type === 'Ram') problems.push(`Drive ${root} adalah RAM disk (isinya hilang saat restart).`)
    else if (info.type !== 'Fixed') warnings.push(`Jenis drive ${root} tidak dikenali (${info.type}).`)
    result.freeBytes = info.free
    result.totalBytes = info.total
  } else if (existing) {
    const s = await statfsInfo(existing)
    if (s) {
      result.freeBytes = s.free
      result.totalBytes = s.total
    }
    warnings.push(`Jenis drive ${root} tidak bisa diperiksa.`)
  } else {
    problems.push(`Drive ${root} tidak ditemukan.`)
  }

  if (existing && fs.existsSync(p) && !fs.statSync(p).isDirectory()) {
    problems.push('Path tersebut adalah file, bukan folder.')
  }

  if (problems.length === 0) {
    const err = writableCheck(p)
    if (err) problems.push(`Folder tidak bisa ditulisi (${err}). Pilih folder lain yang bisa Anda ubah.`)
  }

  if (result.totalBytes > 0) {
    const freeGb = (result.freeBytes / GB).toFixed(1)
    if (result.freeBytes < MIN_BLOCK_BYTES) problems.push(`Ruang kosong di ${root} hanya ${freeGb} GB. Minimal 2 GB, disarankan 15 GB atau lebih.`)
    else if (result.freeBytes < MIN_OK_BYTES) warnings.push(`Ruang kosong di ${root} ${freeGb} GB. Disarankan minimal 15 GB untuk video dan database.`)
  }

  if (p.length > MAX_PATH_OK) warnings.push(`Path cukup panjang (${p.length} karakter). Path pendek (maks. 60) lebih aman, misalnya D:\\MetisClip.`)

  result.existingData = hasExistingData(p)
  if (!result.existingData && fs.existsSync(p)) {
    try {
      const entries = fs.readdirSync(p).filter((n) => !SUBFOLDERS.includes(n))
      if (entries.length > 0) warnings.push('Folder ini tidak kosong. File yang sudah ada tidak akan diubah.')
    } catch {
      // ignore
    }
  }

  result.ok = problems.length === 0
  return result
}
