// Preload (sandboxed): exposes exactly the MetisBridge interface from frontend/types/metis.d.ts.
// Only 'electron' may be required here (sandbox), so channel names are duplicated from main/ipc.ts.
import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'

const CH = {
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
  startDrag: 'metis:start-drag',
  openExternal: 'metis:open-external',
  notify: 'metis:notify',
  navigate: 'metis:navigate',
  relaunch: 'metis:relaunch',
  restartBackend: 'metis:restart-backend',
  openLogs: 'metis:open-logs',
  setUnsaved: 'metis:set-unsaved',
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

function arg(name: string): string | undefined {
  const prefix = `--${name}=`
  const hit = process.argv.find((a) => a.startsWith(prefix))
  return hit ? hit.slice(prefix.length) : undefined
}

/** ipcRenderer.invoke wraps errors as "Error invoking remote method ...: Error: msg"; keep only msg. */
async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  try {
    return (await ipcRenderer.invoke(channel, ...args)) as T
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
  }
}

function initialLanguage(): string {
  try {
    const lang = ipcRenderer.sendSync(CH.getLanguage)
    return typeof lang === 'string' ? lang : 'id'
  } catch {
    return 'id'
  }
}

type EngineInfo = { baseUrl: string; token: string }
type MoveProgress = { phase: string; doneBytes: number; totalBytes: number; doneFiles: number; totalFiles: number }
type EngineStatus = { state: string; message?: string; info?: EngineInfo }

const bridge = {
  isDesktop: true as const,
  platform: process.platform,
  appVersion: arg('metis-app-version') || '0.0.0',
  isPackaged: arg('metis-packaged') === '1',
  /** For "Salin info sistem": the shell's runtime and the Windows build (available to a sandboxed preload) */
  versions: { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node },
  arch: process.arch,
  osVersion: (() => {
    try {
      return process.getSystemVersion()
    } catch {
      return ''
    }
  })(),
  /** UI language saved by main; read synchronously so the first paint already uses it */
  language: initialLanguage(),
  setLanguage: (lang: string) => invoke<void>(CH.setLanguage, lang),
  /** Closing the window keeps MetisClip running in the tray (saved by main at once) */
  getCloseToTray: () => invoke<boolean>(CH.getCloseToTray),
  setCloseToTray: (on: boolean) => invoke<void>(CH.setCloseToTray, on),
  /** App updates from GitHub Releases (main/updater.ts) */
  getUpdateStatus: () => invoke(CH.getUpdateStatus),
  checkForUpdates: () => invoke(CH.checkForUpdates),
  installUpdate: () => invoke<void>(CH.installUpdate),
  setAutoUpdate: (on: boolean) => invoke<void>(CH.setAutoUpdate, on),
  onUpdateStatus(cb: (status: unknown) => void): () => void {
    if (typeof cb !== 'function') return () => undefined
    const listener = (_e: IpcRendererEvent, status: unknown) => cb(status)
    ipcRenderer.on(CH.updateStatus, listener)
    return () => {
      ipcRenderer.removeListener(CH.updateStatus, listener)
    }
  },

  async getEngineInfo(): Promise<EngineInfo> {
    const r = await invoke<{ ok: boolean; info?: EngineInfo; error?: string }>(CH.getEngineInfo)
    if (r.ok && r.info) return r.info
    throw new Error(r.error || 'Engine tidak tersedia')
  },
  getEngineStatus: () => invoke<EngineStatus>(CH.getEngineStatus),
  onEngineStatus(cb: (status: EngineStatus) => void): () => void {
    if (typeof cb !== 'function') return () => undefined
    const listener = (_e: IpcRendererEvent, status: EngineStatus) => cb(status)
    ipcRenderer.on(CH.engineStatus, listener)
    return () => {
      ipcRenderer.removeListener(CH.engineStatus, listener)
    }
  },

  getDataRoot: () => invoke<string | null>(CH.getDataRoot),
  getDefaultDataRoot: () => invoke<string>(CH.getDefaultDataRoot),
  validateDataRoot: (path: string) => invoke(CH.validateDataRoot, path),
  setDataRoot: (path: string) => invoke<{ ok: boolean; error?: string }>(CH.setDataRoot, path),
  planDataMove: (path: string) => invoke(CH.planDataMove, path),
  moveDataRoot: (path: string) => invoke(CH.moveDataRoot, path),
  cancelDataMove: () => invoke<void>(CH.cancelDataMove),
  onDataMoveProgress(cb: (progress: MoveProgress) => void): () => void {
    if (typeof cb !== 'function') return () => undefined
    const listener = (_e: IpcRendererEvent, progress: MoveProgress) => cb(progress)
    ipcRenderer.on(CH.dataMoveProgress, listener)
    return () => {
      ipcRenderer.removeListener(CH.dataMoveProgress, listener)
    }
  },
  getPreviousDataRoot: () => invoke(CH.getPreviousDataRoot),
  deletePreviousDataRoot: () => invoke(CH.deletePreviousDataRoot),
  forgetPreviousDataRoot: () => invoke<void>(CH.forgetPreviousDataRoot),

  selectFolder: (opts?: { title?: string; defaultPath?: string }) => invoke<string | null>(CH.selectFolder, opts ?? {}),
  selectFile: (opts?: { title?: string; defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) =>
    invoke<string | null>(CH.selectFile, opts ?? {}),
  /** Absolute path of a File dropped onto the page ('' when it has none, e.g. dragged from a browser). */
  pathForFile(file: File): string {
    try {
      return webUtils.getPathForFile(file) || ''
    } catch {
      return ''
    }
  },
  openPath: (absPath: string) => invoke<{ ok: boolean; error?: string }>(CH.openPath, absPath),
  showItemInFolder: (absPath: string) => invoke<void>(CH.showItemInFolder, absPath),
  /** Drags clips' final videos out of the window (call it in dragstart, after preventDefault) */
  startDrag(items: Array<{ path: string; name: string }>): void {
    ipcRenderer.send(CH.startDrag, Array.isArray(items) ? items.map((i) => ({ path: String(i?.path ?? ''), name: String(i?.name ?? '') })) : [])
  },
  openExternal: (url: string) => invoke<void>(CH.openExternal, url),
  /** Windows notification while the window is in the background; a click opens the app on opts.route */
  notify(title: string, body?: string, opts?: { route?: string }): void {
    ipcRenderer.send(CH.notify, title, body, opts?.route)
  },
  onNavigate(cb: (route: string) => void): () => void {
    if (typeof cb !== 'function') return () => undefined
    const listener = (_e: IpcRendererEvent, route: string) => cb(route)
    ipcRenderer.on(CH.navigate, listener)
    return () => {
      ipcRenderer.removeListener(CH.navigate, listener)
    }
  },
  relaunch(): void {
    ipcRenderer.send(CH.relaunch)
  },
  /** Starts mongod and the engine again after they gave up (the engine error screen's "Coba lagi") */
  restartBackend: () => invoke<{ ok: boolean; error?: string }>(CH.restartBackend),
  openLogs: () => invoke<{ ok: boolean; error?: string }>(CH.openLogs),
  /** The open page has unsaved edits: closing or quitting asks first (index.ts) */
  setUnsavedChanges(dirty: boolean): void {
    ipcRenderer.send(CH.setUnsaved, dirty === true)
  },
}

contextBridge.exposeInMainWorld('metis', bridge)
