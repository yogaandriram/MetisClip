// IPC handlers behind window.metis (frontend/types/metis.d.ts). Every handler checks the sender origin.
import fs from 'node:fs'
import path from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, Notification, shell, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import type { Backend } from './engine'
import type { AppTray } from './tray'
import type { AppUpdater } from './updater'
import { dataRootAvailable, defaultDataRoot, ensureStructure, readBootstrap, validateDataRoot, writeBootstrap } from './data-root'
import { cancelMove, deletePrevious, forgetPrevious, moveDataRoot, planMove, previousRoot } from './data-move'
import { createLogger } from './logger'
import { getPaths, isTrustedUrl } from './paths'
import { getLanguage, isLang, setLanguage, tr } from './i18n'

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
  navigate: 'metis:navigate',
  relaunch: 'metis:relaunch',
  restartBackend: 'metis:restart-backend',
  openLogs: 'metis:open-logs',
  getLanguage: 'metis:get-language',
  setLanguage: 'metis:set-language',
  getCloseToTray: 'metis:get-close-to-tray',
  setCloseToTray: 'metis:set-close-to-tray',
  getUpdateStatus: 'metis:get-update-status',
  checkForUpdates: 'metis:check-for-updates',
  installUpdate: 'metis:install-update',
  setAutoUpdate: 'metis:set-auto-update',
  updateStatus: 'metis:update-status',
  planDataMove: 'metis:plan-data-move',
  moveDataRoot: 'metis:move-data-root',
  cancelDataMove: 'metis:cancel-data-move',
  dataMoveProgress: 'metis:data-move-progress',
  getPreviousDataRoot: 'metis:get-previous-data-root',
  deletePreviousDataRoot: 'metis:delete-previous-data-root',
  forgetPreviousDataRoot: 'metis:forget-previous-data-root',
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
    if (!trusted(e)) throw new Error(tr().ipc.denied)
    return fn(e, ...args)
  })
}

function str(v: unknown, max = 4096): string {
  if (typeof v !== 'string') throw new Error(tr().ipc.notText)
  if (v.length > max) throw new Error(tr().ipc.tooLong)
  return v
}

/** Shown notifications, kept referenced so their click handler survives garbage collection. */
const liveNotifications = new Set<Notification>()

/** A route inside the app for a notification click (e.g. /clips/detail?id=…): no scheme, no other host. */
function appRoute(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 300) return null
  return /^\/(?!\/)[\w\-./?=&%]*$/.test(v) ? v : null
}

function existingAbsPath(v: unknown): string {
  const p = str(v)
  if (!path.isAbsolute(p)) throw new Error(tr().ipc.notAbsolute)
  const resolved = path.resolve(p)
  if (!fs.existsSync(resolved)) throw new Error(tr().ipc.notFound)
  return resolved
}

export function registerIpc(backend: Backend, tray: AppTray, updater: AppUpdater, restartToInstall: () => Promise<void>): void {
  handle(CH.getEngineInfo, async () => {
    try {
      const info = await backend.waitReady()
      return { ok: true, info }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  handle(CH.getEngineStatus, () => backend.getStatus())

  // "Coba lagi" on the engine error screen. In the error state waitReady() rejects at once, so the
  // backend (mongod + engine) is started again from scratch; any other state just keeps going.
  handle(CH.restartBackend, async () => {
    if (backend.getStatus().state !== 'error') return { ok: true }
    const root = readBootstrap()
    if (!root) return { ok: false, error: tr().engine.failed }
    if (!dataRootAvailable(root)) {
      backend.fail(tr().dataRootMissing(root))
      return { ok: false, error: tr().dataRootMissing(root) }
    }
    log.info('UI meminta backend dimulai ulang setelah error')
    return backend.start(root)
  })

  // The log folder, also while the engine (which reports logs_dir) is down
  handle(CH.openLogs, async () => {
    const error = await shell.openPath(getPaths().logsDir)
    return error ? { ok: false, error } : { ok: true }
  })

  handle(CH.getDataRoot, () => readBootstrap())

  handle(CH.getDefaultDataRoot, () => defaultDataRoot())

  handle(CH.validateDataRoot, (_e, p: unknown) => validateDataRoot(str(p)))

  handle(CH.setDataRoot, async (_e, p: unknown) => {
    const check = await validateDataRoot(str(p))
    if (!check.ok) return { ok: false, error: check.problems.join(' ') }
    try {
      ensureStructure(check.path)
      if (!dataRootAvailable(check.path)) return { ok: false, error: tr().dataRoot.cannotCreate }
      writeBootstrap(check.path)
    } catch (e) {
      return { ok: false, error: tr().dataRoot.setupFailed((e as Error).message) }
    }
    log.info(`setDataRoot: ${check.path} (data lama: ${check.existingData})`)
    return backend.start(check.path)
  })

  // Moving the data folder (data-move.ts); progress goes out on CH.dataMoveProgress
  handle(CH.planDataMove, (_e, p: unknown) => planMove(backend, str(p)))
  handle(CH.moveDataRoot, (_e, p: unknown) => moveDataRoot(backend, str(p)))
  handle(CH.cancelDataMove, () => cancelMove())
  handle(CH.getPreviousDataRoot, () => previousRoot(backend))
  handle(CH.deletePreviousDataRoot, () => deletePrevious(backend))
  handle(CH.forgetPreviousDataRoot, () => forgetPrevious(backend))

  handle(CH.selectFolder, async (e, opts?: { title?: string; defaultPath?: string }) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const options: Electron.OpenDialogOptions = {
      title: typeof opts?.title === 'string' ? opts.title : tr().ipc.chooseFolder,
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
      title: typeof opts?.title === 'string' ? opts.title : tr().ipc.chooseFile,
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
      return { ok: false, error: tr().ipc.blockedExecutable }
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
    if (!['https:', 'http:', 'mailto:'].includes(url.protocol)) throw new Error(tr().ipc.httpOnly)
    await shell.openExternal(url.toString())
  })

  // Windows notification (a job or an export finished or failed, §9.3), only while the window is in the
  // background: in front, the in-app toast says it. A click brings MetisClip back on `route`.
  ipcMain.on(CH.notify, (e, title: unknown, body: unknown, route: unknown) => {
    if (!trusted(e) || typeof title !== 'string') return
    const win = BrowserWindow.fromWebContents(e.sender)
    if (win && win.isVisible() && win.isFocused()) return
    if (!Notification.isSupported()) return
    const target = appRoute(route)
    const n = new Notification({ title: title.slice(0, 200), body: typeof body === 'string' && body ? body.slice(0, 1000) : undefined })
    liveNotifications.add(n)
    if (liveNotifications.size > 20) liveNotifications.delete(liveNotifications.values().next().value!)
    const drop = () => liveNotifications.delete(n)
    n.on('click', () => {
      drop()
      if (!win || win.isDestroyed()) return
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
      if (target) win.webContents.send(CH.navigate, target)
    })
    n.on('close', drop)
    n.on('failed', (_ev, error) => {
      drop()
      log.warn(`notifikasi gagal: ${error}`)
    })
    n.on('show', () => log.info(`notifikasi ditampilkan: ${title.slice(0, 80)}`))
    n.show()
  })

  // Read once by the preload when a window loads (sync, so the first paint is in the right language)
  ipcMain.on(CH.getLanguage, (e) => {
    e.returnValue = trusted(e) ? getLanguage() : 'id'
  })

  handle(CH.setLanguage, async (_e, lang: unknown) => {
    if (!isLang(lang)) throw new Error(tr().ipc.notText)
    if (!setLanguage(lang)) return
    log.info(`bahasa tampilan: ${lang}`)
    tray.refresh()
    await backend.applyLanguage(lang)
  })

  // Pengaturan → Aplikasi: closing the window keeps MetisClip running in the tray (preferences.json)
  handle(CH.getCloseToTray, () => tray.closeToTray)
  handle(CH.setCloseToTray, (_e, on: unknown) => {
    if (typeof on !== 'boolean') throw new Error(tr().ipc.notText)
    tray.setCloseToTray(on)
  })

  // App updates (updater.ts): status, "Periksa sekarang", "Mulai ulang dan pasang", the automatic switch
  handle(CH.getUpdateStatus, () => updater.getStatus())
  handle(CH.checkForUpdates, () => updater.check('manual'))
  handle(CH.installUpdate, () => restartToInstall())
  handle(CH.setAutoUpdate, (_e, on: unknown) => {
    if (typeof on !== 'boolean') throw new Error(tr().ipc.notText)
    updater.setAuto(on)
  })
  updater.on('status', (status) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(CH.updateStatus, status)
    }
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
