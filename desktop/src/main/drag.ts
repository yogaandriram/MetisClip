// Dragging clips out of the gallery into Explorer or another app.
// The renderer names each clip's final.mp4 and the name it has in the export folder. A hard link under
// <DATA_ROOT>\cache\drag\<time>\ gives the file that name without copying it (the cache is on the same
// drive as the library); the engine clears the cache at its next start and older drags go after an hour.
import fs from 'node:fs'
import path from 'node:path'
import { nativeImage, type NativeImage } from 'electron'
import { createLogger } from './logger'

const log = createLogger('drag')

/** At most this many clips in one drag (the gallery's selection can hold more) */
export const MAX_DRAG_FILES = 50
const KEEP_MS = 60 * 60 * 1000
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i

export interface DragItem {
  path: string
  name: string
}

/** A file name Windows accepts, ending in .mp4 (the engine's export name, cleaned again here). */
export function safeDragName(value: unknown): string {
  let name = typeof value === 'string' ? value : ''
  name = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim().slice(0, 150).replace(/[. ]+$/, '')
  if (!/\.mp4$/i.test(name)) name = name ? `${name}.mp4` : ''
  if (!name || name.toLowerCase() === '.mp4') return 'MetisClip.mp4'
  return RESERVED.test(name) ? `MetisClip ${name}` : name
}

/** The final.mp4 files under <dataRoot>\library that the renderer asked for; anything else is dropped. */
export function checkDragItems(dataRoot: string, items: unknown): { source: string; name: string }[] {
  if (!Array.isArray(items)) return []
  // Real paths on both sides: the engine reports long names ("Nama Pengguna"), a saved data folder may hold
  // the 8.3 form ("NAMAPE~1") or go through a junction
  let library: string
  try {
    library = fs.realpathSync.native(path.resolve(dataRoot, 'library'))
  } catch {
    return []
  }
  const out: { source: string; name: string }[] = []
  for (const item of items.slice(0, MAX_DRAG_FILES)) {
    const p = (item as Partial<DragItem> | null)?.path
    if (typeof p !== 'string' || !path.isAbsolute(p)) continue
    let source: string
    try {
      source = fs.realpathSync.native(path.resolve(p))
    } catch {
      continue
    }
    const rel = path.relative(library, source)
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) continue
    if (path.basename(source).toLowerCase() !== 'final.mp4') continue
    if (!fs.statSync(source, { throwIfNoEntry: false })?.isFile()) continue
    out.push({ source, name: safeDragName((item as Partial<DragItem>).name) })
  }
  return out
}

/** Hard links with the readable names (the file itself when a link is not possible, e.g. on exFAT). */
export function linkDragFiles(dataRoot: string, files: { source: string; name: string }[], now = Date.now()): string[] {
  const base = path.join(dataRoot, 'cache', 'drag')
  removeOldDrags(base, now)
  const dir = path.join(base, String(now))
  const used = new Set<string>()
  return files.map(({ source, name }) => {
    let target = name
    for (let n = 2; used.has(target.toLowerCase()); n++) target = name.replace(/\.mp4$/i, ` (${n}).mp4`)
    used.add(target.toLowerCase())
    try {
      fs.mkdirSync(dir, { recursive: true })
      const link = path.join(dir, target)
      fs.linkSync(source, link)
      return link
    } catch (err) {
      log.warn(`hard link gagal, file asli diseret: ${(err as Error).message}`)
      return source
    }
  })
}

function removeOldDrags(base: string, now: number): void {
  let entries: string[]
  try {
    entries = fs.readdirSync(base)
  } catch {
    return
  }
  for (const entry of entries) {
    const at = Number(entry)
    if (Number.isFinite(at) && now - at < KEEP_MS) continue
    try {
      fs.rmSync(path.join(base, entry), { recursive: true, force: true })
    } catch {
      // still open in another app: the next drag or the engine's start removes it
    }
  }
}

/** The clip's thumbnail next to its final.mp4, small, else the app icon. */
export function dragIcon(source: string, fallback: string): NativeImage {
  for (const file of ['thumb.jpg', 'cover.jpg']) {
    const img = nativeImage.createFromPath(path.join(path.dirname(source), file))
    if (!img.isEmpty()) return img.resize({ width: 72 })
  }
  const icon = nativeImage.createFromPath(fallback)
  return icon.isEmpty() ? icon : icon.resize({ width: 48 })
}
