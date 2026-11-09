// Preload (sandboxed): exposes exactly the MetisBridge interface from frontend/types/metis.d.ts.
// Only 'electron' may be required here (sandbox), so channel names are duplicated from main/ipc.ts.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

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
  openExternal: 'metis:open-external',
  notify: 'metis:notify',
  relaunch: 'metis:relaunch',
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

type EngineInfo = { baseUrl: string; token: string }
type EngineStatus = { state: string; message?: string; info?: EngineInfo }

const bridge = {
  isDesktop: true as const,
  platform: process.platform,
  appVersion: arg('metis-app-version') || '0.0.0',
  isPackaged: arg('metis-packaged') === '1',

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

  selectFolder: (opts?: { title?: string; defaultPath?: string }) => invoke<string | null>(CH.selectFolder, opts ?? {}),
  selectFile: (opts?: { title?: string; defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) =>
    invoke<string | null>(CH.selectFile, opts ?? {}),
  openPath: (absPath: string) => invoke<{ ok: boolean; error?: string }>(CH.openPath, absPath),
  showItemInFolder: (absPath: string) => invoke<void>(CH.showItemInFolder, absPath),
  openExternal: (url: string) => invoke<void>(CH.openExternal, url),
  notify(title: string, body?: string): void {
    ipcRenderer.send(CH.notify, title, body)
  },
  relaunch(): void {
    ipcRenderer.send(CH.relaunch)
  },
}

contextBridge.exposeInMainWorld('metis', bridge)
