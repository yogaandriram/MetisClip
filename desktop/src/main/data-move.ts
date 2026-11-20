// Moving the data folder ("Pindahkan Lokasi Data"): stop the engine and mongod, copy,
// verify (file count and sizes, then mongod and the engine must start on the copy), save the new
// location in bootstrap.json, keep running there. The old folder stays until the user deletes it.
// Any failure before the new location is saved goes back to the old folder and removes the copy.
import fs from 'node:fs'
import path from 'node:path'
import { BrowserWindow } from 'electron'
import type { Backend } from './engine'
import { hasExistingData, pathsOverlap, readPreviousDataRoot, validateDataRoot, writeBootstrap } from './data-root'
import { createLogger } from './logger'
import { getLanguage, tr } from './i18n'

const log = createLogger('data-move')

export const PROGRESS_CHANNEL = 'metis:data-move-progress'

const GB = 1024 ** 3
/** Free space left on the destination after the copy */
const RESERVE_BYTES = 2 * GB
/** Not copied: the engine purges it anyway (segment downloads, render props, intermediates) */
const SKIP_TOP = new Set(['cache'])

export interface MovePlan {
  ok: boolean
  source: string
  target: string
  problems: string[]
  warnings: string[]
  /** Bytes to copy (hard-linked clip files once) and the number of files */
  bytes: number
  files: number
  freeBytes: number
}

export type MovePhase = 'stopping' | 'copying' | 'verifying' | 'starting' | 'reverting' | 'done'

export interface MoveProgress {
  phase: MovePhase
  doneBytes: number
  totalBytes: number
  doneFiles: number
  totalFiles: number
}

export interface MoveResult {
  ok: boolean
  error?: string
  cancelled?: boolean
  newRoot?: string
  oldRoot?: string
}

interface FileEntry {
  rel: string
  size: number
  mtimeMs: number
  /** dev:ino of a file with more than one hard link (campaign clips share their files) */
  link: string | null
}

interface Manifest {
  dirs: string[]
  files: FileEntry[]
  /** Bytes on disk (each hard-linked file once) */
  bytes: number
}

class Cancelled extends Error {}

let moving = false
let cancelRequested = false
/** The previous folder of a move made in this session (bootstrap.json is not written under the override hook) */
let sessionPrevious: string | null = null

function gbText(bytes: number): string {
  const tag = getLanguage() === 'id' ? 'id-ID' : 'en-GB'
  return `${(bytes / GB).toLocaleString(tag, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} GB`
}

/** Every folder and file under `root` (not following links or junctions), skipping SKIP_TOP. */
async function scan(root: string): Promise<Manifest> {
  const out: Manifest = { dirs: [], files: [], bytes: 0 }
  const seen = new Set<string>()
  const walk = async (rel: string): Promise<void> => {
    const entries = await fs.promises.readdir(path.join(root, rel), { withFileTypes: true })
    for (const e of entries) {
      const childRel = rel ? path.join(rel, e.name) : e.name
      if (!rel && SKIP_TOP.has(e.name.toLowerCase())) continue
      if (e.isSymbolicLink()) {
        log.warn(`dilewati (link/junction): ${childRel}`)
        continue
      }
      if (e.isDirectory()) {
        out.dirs.push(childRel)
        await walk(childRel)
      } else if (e.isFile()) {
        const st = await fs.promises.stat(path.join(root, childRel), { bigint: true })
        const link = st.nlink > 1n ? `${st.dev}:${st.ino}` : null
        const size = Number(st.size)
        if (!link || !seen.has(link)) out.bytes += size
        if (link) seen.add(link)
        out.files.push({ rel: childRel, size, mtimeMs: Number(st.mtimeMs), link })
      }
    }
  }
  await walk('')
  return out
}

function broadcast(p: MoveProgress): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(PROGRESS_CHANNEL, p)
  }
}

/** Checks a destination without changing anything: the UI shows the problems, warnings and sizes. */
export async function planMove(backend: Backend, raw: string): Promise<MovePlan> {
  const source = backend.dataRoot || ''
  const plan: MovePlan = { ok: false, source, target: raw, problems: [], warnings: [], bytes: 0, files: 0, freeBytes: 0 }
  const m = tr().dataMove
  if (moving) {
    plan.problems.push(m.busyRunning)
    return plan
  }
  if (!source || backend.getStatus().state !== 'ready') {
    plan.problems.push(m.notReady)
    return plan
  }
  const check = await validateDataRoot(raw)
  plan.target = check.path
  plan.freeBytes = check.freeBytes
  plan.problems.push(...check.problems)
  plan.warnings.push(...check.warnings.filter((w) => w !== tr().dataRoot.notEmpty))

  const overlap = path.isAbsolute(check.path) ? pathsOverlap(check.path, source) : null
  if (overlap === 'same') plan.problems.push(m.sameFolder)
  else if (overlap === 'inside') plan.problems.push(m.insideCurrent)
  else if (overlap === 'contains') plan.problems.push(m.containsCurrent)
  else if (check.existingData) plan.problems.push(m.hasData)
  else if (fs.existsSync(check.path)) {
    try {
      if (fs.readdirSync(check.path).length > 0) plan.problems.push(m.notEmpty)
    } catch {
      // validateDataRoot already reported why the folder can't be read
    }
  }

  const manifest = await scan(source)
  plan.bytes = manifest.bytes
  plan.files = manifest.files.length
  if (check.totalBytes > 0 && check.freeBytes < manifest.bytes + RESERVE_BYTES) {
    plan.problems.push(m.noSpace(gbText(manifest.bytes + RESERVE_BYTES), gbText(check.freeBytes)))
  }

  try {
    const activity = await backend.engineGet<{ busy: boolean; message: string | null }>('/api/system/activity')
    if (activity.busy && activity.message) plan.problems.push(activity.message)
  } catch (e) {
    log.warn(`cek aktivitas engine gagal: ${(e as Error).message}`)
    plan.problems.push(m.notReady)
  }
  plan.ok = plan.problems.length === 0
  return plan
}

async function copyAll(source: string, target: string, manifest: Manifest): Promise<void> {
  const progress: MoveProgress = {
    phase: 'copying',
    doneBytes: 0,
    totalBytes: manifest.bytes,
    doneFiles: 0,
    totalFiles: manifest.files.length,
  }
  broadcast(progress)
  fs.mkdirSync(target, { recursive: true })
  for (const dir of manifest.dirs) fs.mkdirSync(path.join(target, dir), { recursive: true })
  const linked = new Map<string, string>()
  let lastSent = 0
  for (const f of manifest.files) {
    if (cancelRequested) throw new Cancelled()
    const src = path.join(source, f.rel)
    const dst = path.join(target, f.rel)
    const first = f.link ? linked.get(f.link) : undefined
    let copied = false
    if (first) {
      try {
        await fs.promises.link(first, dst) // another campaign's clip shares this file: keep sharing it
      } catch {
        copied = true
      }
    } else {
      copied = true
    }
    if (copied) {
      await fs.promises.copyFile(src, dst, fs.constants.COPYFILE_EXCL)
      // Backups are listed and rotated by their time; keep every file's
      await fs.promises.utimes(dst, new Date(), new Date(f.mtimeMs))
      if (f.link && !first) linked.set(f.link, dst)
      if (!first) progress.doneBytes += f.size
    }
    progress.doneFiles += 1
    const now = Date.now()
    if (now - lastSent > 200) {
      lastSent = now
      broadcast({ ...progress })
    }
  }
  broadcast({ ...progress })
}

/** null when the copy holds every file of the manifest at its size, else what differs. */
async function verifyCopy(target: string, manifest: Manifest): Promise<string | null> {
  const m = tr().dataMove
  const copy = await scan(target)
  const sizes = new Map(copy.files.map((f) => [f.rel.toLowerCase(), f.size]))
  for (const f of manifest.files) {
    const size = sizes.get(f.rel.toLowerCase())
    if (size === undefined) return m.verifyMissing(f.rel)
    if (size !== f.size) return m.verifySize(f.rel)
  }
  if (copy.files.length !== manifest.files.length) return m.verifyCount(copy.files.length, manifest.files.length)
  return null
}

/** Removes what the move created at `target` (the whole folder when it did not exist before). */
async function removeCopy(target: string, createdTarget: boolean): Promise<void> {
  try {
    if (createdTarget) {
      await fs.promises.rm(target, { recursive: true, force: true, maxRetries: 3 })
    } else {
      for (const name of await fs.promises.readdir(target)) {
        await fs.promises.rm(path.join(target, name), { recursive: true, force: true, maxRetries: 3 })
      }
    }
    log.info(`salinan dihapus: ${target}`)
  } catch (e) {
    log.warn(`salinan tidak bisa dihapus seluruhnya (${target}): ${(e as Error).message}`)
  }
}

let running: Promise<MoveResult> | null = null
let quitRequested = false

export function moveDataRoot(backend: Backend, raw: string): Promise<MoveResult> {
  if (running) return Promise.resolve({ ok: false, error: tr().dataMove.busyRunning })
  running = doMove(backend, raw).finally(() => {
    running = null
  })
  return running
}

async function doMove(backend: Backend, raw: string): Promise<MoveResult> {
  const plan = await planMove(backend, raw)
  if (!plan.ok) return { ok: false, error: plan.problems.join(' ') }
  const m = tr().dataMove
  const source = plan.source
  const target = plan.target
  const createdTarget = !fs.existsSync(target)
  moving = true
  cancelRequested = false
  // Every step throws a message for the user; the old folder stays untouched throughout
  let stage: 'copy' | 'start' | 'save' = 'copy'
  log.info(`pindah folder data: ${source} -> ${target} (${plan.files} file, ${plan.bytes} byte)`)
  try {
    broadcast({ phase: 'stopping', doneBytes: 0, totalBytes: plan.bytes, doneFiles: 0, totalFiles: plan.files })
    await backend.pause(m.banner)
    let manifest: Manifest
    try {
      // Scanned again now that nothing writes to the folder any more
      manifest = await scan(source)
      await copyAll(source, target, manifest)
    } catch (e) {
      if (e instanceof Cancelled) throw e
      throw new Error(m.copyFailed((e as Error).message))
    }
    const all = { doneBytes: manifest.bytes, totalBytes: manifest.bytes, doneFiles: manifest.files.length, totalFiles: manifest.files.length }

    broadcast({ phase: 'verifying', ...all })
    const diff = await verifyCopy(target, manifest)
    if (diff) throw new Error(m.verifyFailed(diff))
    if (cancelRequested) throw new Cancelled()

    stage = 'start'
    broadcast({ phase: 'starting', ...all })
    backend.movedFrom = source
    const started = await backend.start(target)
    if (!started.ok) throw new Error(m.startFailed(started.error || ''))

    stage = 'save'
    try {
      writeBootstrap(target, source)
    } catch (e) {
      throw new Error(m.saveFailed((e as Error).message))
    }
    sessionPrevious = source
    log.info(`folder data dipindah ke ${target}; folder lama tetap ada sampai dihapus pengguna: ${source}`)
    broadcast({ phase: 'done', ...all })
    return { ok: true, newRoot: target, oldRoot: source }
  } catch (e) {
    const cancelled = e instanceof Cancelled
    const reason = cancelled ? m.cancelled : (e as Error).message
    log.error(`pindah folder data gagal (${stage}): ${cancelled ? 'dibatalkan' : reason}`)
    broadcast({ phase: 'reverting', doneBytes: 0, totalBytes: plan.bytes, doneFiles: 0, totalFiles: plan.files })
    backend.movedFrom = null
    if (stage !== 'copy') await backend.stop('restart')
    await removeCopy(target, createdTarget)
    if (!quitRequested) {
      const back = await backend.start(source)
      if (!back.ok) log.error(`kembali ke folder lama gagal: ${back.error}`)
    }
    return { ok: false, cancelled, error: reason, oldRoot: source }
  } finally {
    moving = false
    cancelRequested = false
  }
}

export function cancelMove(): void {
  if (moving) {
    cancelRequested = true
    log.info('pembatalan pindah folder data diminta')
  }
}

/** On quit during a move: stop copying, remove the copy, and let the quit stop the rest. */
export async function settleMoveForQuit(): Promise<void> {
  if (!running) return
  quitRequested = true
  cancelRequested = true
  log.info('aplikasi ditutup saat folder data dipindah: penyalinan dihentikan')
  await running.catch(() => undefined)
}

/** The folder the data was moved away from, while it still holds MetisClip data and is not in use. */
export async function previousRoot(backend: Backend): Promise<{ path: string; bytes: number } | null> {
  const prev = sessionPrevious || readPreviousDataRoot()
  if (!prev || moving) return null
  if (!hasExistingData(prev)) return null
  if (backend.dataRoot && pathsOverlap(prev, backend.dataRoot)) return null
  try {
    const manifest = await scan(prev)
    let cache = 0
    try {
      cache = (await scanAll(path.join(prev, 'cache'))).bytes
    } catch {
      // no cache folder
    }
    return { path: prev, bytes: manifest.bytes + cache }
  } catch {
    return null
  }
}

async function scanAll(root: string): Promise<{ bytes: number }> {
  let bytes = 0
  const walk = async (dir: string): Promise<void> => {
    for (const e of await fs.promises.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isSymbolicLink()) continue
      if (e.isDirectory()) await walk(p)
      else if (e.isFile()) bytes += (await fs.promises.stat(p)).size
    }
  }
  await walk(root)
  return { bytes }
}

/** Forgets the previous folder without deleting it (the user keeps it). */
export function forgetPrevious(backend: Backend): void {
  sessionPrevious = null
  if (backend.dataRoot && readPreviousDataRoot()) writeBootstrap(backend.dataRoot, null)
  log.info('folder data lama disimpan pengguna; tidak ditawarkan lagi untuk dihapus')
}

/** Deletes the previous folder after the user confirmed it. */
export async function deletePrevious(backend: Backend): Promise<{ ok: boolean; error?: string; freedBytes?: number }> {
  const m = tr().dataMove
  const prev = sessionPrevious || readPreviousDataRoot()
  if (!prev || !fs.existsSync(prev)) {
    forgetPrevious(backend)
    return { ok: false, error: m.previousGone }
  }
  if (moving || !backend.dataRoot || pathsOverlap(prev, backend.dataRoot)) return { ok: false, error: m.previousInUse }
  if (!hasExistingData(prev)) return { ok: false, error: m.previousGone }
  const info = await previousRoot(backend)
  const errors: string[] = []
  for (const name of await fs.promises.readdir(prev)) {
    try {
      await fs.promises.rm(path.join(prev, name), { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
    } catch (e) {
      errors.push((e as Error).message)
    }
  }
  if (errors.length) {
    log.warn(`folder lama tidak terhapus seluruhnya (${prev}): ${errors.join('; ')}`)
    return { ok: false, error: m.deleteFailed(errors[0]) }
  }
  try {
    await fs.promises.rmdir(prev)
  } catch {
    // the folder itself may be in use by Explorer; its contents are gone
  }
  sessionPrevious = null
  writeBootstrap(backend.dataRoot, null)
  log.info(`folder data lama dihapus atas permintaan pengguna: ${prev}`)
  return { ok: true, freedBytes: info?.bytes ?? 0 }
}
