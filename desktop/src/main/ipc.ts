// IPC handlers behind window.metis (frontend/types/metis.d.ts). Every handler checks the sender origin.
import fs from 'node:fs'
import path from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, Notification, shell, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import type { Backend } from './engine'
import { dataRootAvailable, defaultDataRoot, ensureStructure, readBootstrap, validateDataRoot, writeBootstrap } from './data-root'
import { createLogger } from './logger'
import { isTrustedUrl } from './paths'

const log = createLogger('ipc')

const BLOCKED_EXT = new Set(['.exe', '.bat', '.cmd', '.com', '.ps1', '.vbs', '.js', '.msi', '.lnk', '.scr',
  // also refuse other script/installer types Windows would execute
  '.vbe', '.jse', '.wsf', '.wsh', '.hta', '.pif', '.cpl', '.msc', '.reg', '.url', '.appref-ms', '.jar', '.psm1', '.msp'])

export const CH = {
  getEngineInfo: 'metis:get-engine-info',
  getEngineStatus: 'metis:get-engine-status',
  engineStatus: 'metis:engine-status',
  getDataRoot: 'metis:get-data-root',
  getDefaultDataRoot: 'metis:get-default-data-root',
  validateDataRoot: 'metis:validate-data-root',
  setDataRoot: 'metis:set-data-root',
  selectFolder: 'metis:select-folder',
  selectFile: 'metis:select-file',
  openPath: 'metis:open-path',
  showItemInFolder: 'metis:show-item-in-folder',
  openExternal: 'metis:open-external',
  notify: 'metis:notify',
  relaunch: 'metis:relaunch',
} as const

function trusted(e: IpcMainInvokeEvent | IpcMainEvent): boolean {
  const url = e.senderFrame?.url || ''
  if (url.startsWith('data:text/html')) return true // built-in error page
  if (isTrustedUrl(url)) return true
  log.warn(`IPC ditolak dari ${url || '<unknown>'}`)
  return false
}

function handle<T>(channel: string, fn: (e: IpcMainInvokeEvent, ...args: any[]) => Promise<T> | T): void {
  ipcMain.handle(channel, async (e, ...args) => {
    if (!trusted(e)) throw new Error('Akses ditolak')
    return fn(e, ...args)
  })
}

function str(v: unknown, max = 4096): string {
  if (typeof v !== 'string') throw new Error('Argumen harus berupa teks')
  if (v.length > max) throw new Error('Argumen terlalu panjang')
  return v
}

function existingAbsPath(v: unknown): string {
  const p = str(v)
  if (!path.isAbsolute(p)) throw new Error('Path harus absolut')
  const resolved = path.resolve(p)
  if (!fs.existsSync(resolved)) throw new Error('File atau folder tidak ditemukan')
  return resolved
}

export function registerIpc(backend: Backend): void {
  handle(CH.getEngineInfo, async () => {
    try {
      const info = await backend.waitReady()
      return { ok: true, info }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  handle(CH.getEngineStatus, () => backend.getStatus())

  handle(CH.getDataRoot, () => readBootstrap())

  handle(CH.getDefaultDataRoot, () => defaultDataRoot())

  handle(CH.validateDataRoot, (_e, p: unknown) => validateDataRoot(str(p)))

  handle(CH.setDataRoot, async (_e, p: unknown) => {
    const check = await validateDataRoot(str(p))
    if (!check.ok) return { ok: false, error: check.problems.join(' ') }
    try {
      ensureStructure(check.path)
      if (!dataRootAvailable(check.path)) return { ok: false, error: 'Folder data tidak bisa dibuat.' }
      writeBootstrap(check.path)
    } catch (e) {
      return { ok: false, error: `Gagal menyiapkan folder data: ${(e as Error).message}` }
    }
    log.info(`setDataRoot: ${check.path} (data lama: ${check.existingData})`)
    return backend.start(check.path)
  })

  handle(CH.selectFolder, async (e, opts?: { title?: string; defaultPath?: string }) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const options: Electron.OpenDialogOptions = {
      title: typeof opts?.title === 'string' ? opts.title : 'Pilih folder',
      defaultPath: typeof opts?.defaultPath === 'string' ? opts.defaultPath : undefined,
      properties: ['openDirectory', 'createDirectory', 'dontAddToRecent'],
    }
    const r = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    return r.canceled || !r.filePaths[0] ? null : r.filePaths[0]
  })

  handle(CH.selectFile, async (e, opts?: { title?: string; defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const filters = Array.isArray(opts?.filters)
      ? opts!.filters
          .filter((f) => f && typeof f.name === 'string' && Array.isArray(f.extensions))
          .map((f) => ({ name: f.name, extensions: f.extensions.filter((x) => typeof x === 'string').map((x) => x.replace(/^\./, '')) }))
      : undefined
    const options: Electron.OpenDialogOptions = {
      title: typeof opts?.title === 'string' ? opts.title : 'Pilih file',
      defaultPath: typeof opts?.defaultPath === 'string' ? opts.defaultPath : undefined,
      filters,
      properties: ['openFile', 'dontAddToRecent'],
    }
    const r = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    return r.canceled || !r.filePaths[0] ? null : r.filePaths[0]
  })

  handle(CH.openPath, async (_e, p: unknown) => {
    let target: string
    try {
      target = existingAbsPath(p)
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
    const stat = fs.statSync(target)
    if (stat.isFile() && BLOCKED_EXT.has(path.extname(target).toLowerCase())) {
      log.warn(`openPath ditolak (executable): ${target}`)
      return { ok: false, error: 'File program/skrip tidak boleh dibuka dari aplikasi.' }
    }
    const err = await shell.openPath(target)
    return err ? { ok: false, error: err } : { ok: true }
  })

  handle(CH.showItemInFolder, (_e, p: unknown) => {
    try {
      shell.showItemInFolder(existingAbsPath(p))
    } catch (err) {
      log.warn(`showItemInFolder: ${(err as Error).message}`)
    }
  })

  handle(CH.openExternal, async (_e, u: unknown) => {
    const url = new URL(str(u))
    if (!['https:', 'http:', 'mailto:'].includes(url.protocol)) throw new Error('Hanya tautan http(s) yang boleh dibuka')
    await shell.openExternal(url.toString())
  })

  ipcMain.on(CH.notify, (e, title: unknown, body: unknown) => {
    if (!trusted(e) || typeof title !== 'string') return
    if (!Notification.isSupported()) return
    new Notification({ title: title.slice(0, 200), body: typeof body === 'string' ? body.slice(0, 1000) : undefined }).show()
  })

  ipcMain.on(CH.relaunch, (e) => {
    if (!trusted(e)) return
    log.info('relaunch diminta oleh UI')
    app.relaunch()
    app.quit()
  })

  backend.on('status', (status) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(CH.engineStatus, status)
    }
  })
}
