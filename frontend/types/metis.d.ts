// Contract for the Electron preload bridge (`window.metis`).
// Implemented by desktop/src/preload/index.ts. See docs/desktop-contract.md §4.

export {}

declare global {
  type MetisEngineState = 'idle' | 'starting' | 'ready' | 'restarting' | 'error' | 'stopped'

  interface MetisEngineInfo {
    /** e.g. "http://127.0.0.1:53817" (no trailing slash) */
    baseUrl: string
    /** Per-launch session token; send as `Authorization: Bearer <token>` or `?token=` */
    token: string
  }

  interface MetisEngineStatus {
    state: MetisEngineState
    /** Human readable (Bahasa Indonesia) detail, e.g. why the engine failed */
    message?: string
    /** Present when state === 'ready' */
    info?: MetisEngineInfo
  }

  interface MetisDataRootCheck {
    /** false when there is at least one blocking problem */
    ok: boolean
    /** Normalised absolute path that was checked */
    path: string
    /** Blocking problems (Bahasa Indonesia) */
    problems: string[]
    /** Non-blocking warnings (Bahasa Indonesia) */
    warnings: string[]
    freeBytes: number
    totalBytes: number
    /** true when the folder already contains a MetisClip database (reuse) */
    existingData: boolean
  }

  interface MetisFileFilter {
    name: string
    extensions: string[]
  }

  interface MetisBridge {
    readonly isDesktop: true
    readonly platform: string
    readonly appVersion: string
    readonly isPackaged: boolean

    /** Resolves once the engine is ready (waits while starting / during first-run setup). Rejects on fatal error. */
    getEngineInfo(): Promise<MetisEngineInfo>
    getEngineStatus(): Promise<MetisEngineStatus>
    /** Returns an unsubscribe function */
    onEngineStatus(cb: (status: MetisEngineStatus) => void): () => void

    /** Current data root from bootstrap.json, or null on first run */
    getDataRoot(): Promise<string | null>
    /** Suggested default, e.g. C:\Users\<name>\MetisClip */
    getDefaultDataRoot(): Promise<string>
    validateDataRoot(path: string): Promise<MetisDataRootCheck>
    /** First run (or after recovery): writes bootstrap.json, starts mongod + engine, resolves when ready */
    setDataRoot(path: string): Promise<{ ok: boolean; error?: string }>

    selectFolder(opts?: { title?: string; defaultPath?: string }): Promise<string | null>
    selectFile(opts?: { title?: string; defaultPath?: string; filters?: MetisFileFilter[] }): Promise<string | null>
    /** Absolute path of a File dropped onto the page ('' when it has none, e.g. dragged from a browser) */
    pathForFile(file: File): string
    /** Opens a folder or a media file with the default app. Refuses executables. */
    openPath(absPath: string): Promise<{ ok: boolean; error?: string }>
    showItemInFolder(absPath: string): Promise<void>
    openExternal(url: string): Promise<void>
    notify(title: string, body?: string): void
    relaunch(): void
  }

  interface Window {
    metis?: MetisBridge
  }
}
