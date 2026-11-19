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
    /** Human readable detail in the UI language, e.g. why the engine failed */
    message?: string
    /** Present when state === 'ready' */
    info?: MetisEngineInfo
  }

  interface MetisDataRootCheck {
    /** false when there is at least one blocking problem */
    ok: boolean
    /** Normalised absolute path that was checked */
    path: string
    /** Blocking problems (in the UI language) */
    problems: string[]
    /** Non-blocking warnings (in the UI language) */
    warnings: string[]
    freeBytes: number
    totalBytes: number
    /** true when the folder already contains a MetisClip database (reuse) */
    existingData: boolean
  }

  /** Checking a destination for the data folder (nothing is changed) */
  interface MetisDataMovePlan {
    ok: boolean
    /** The data folder in use now */
    source: string
    /** Normalised destination */
    target: string
    /** Blocking problems and warnings, in the UI language (also what still runs in the engine) */
    problems: string[]
    warnings: string[]
    /** Bytes and files to copy (the cache is not copied) */
    bytes: number
    files: number
    /** Free space on the destination drive */
    freeBytes: number
  }

  type MetisDataMovePhase = 'stopping' | 'copying' | 'verifying' | 'starting' | 'reverting' | 'done'

  interface MetisDataMoveProgress {
    phase: MetisDataMovePhase
    doneBytes: number
    totalBytes: number
    doneFiles: number
    totalFiles: number
  }

  interface MetisDataMoveResult {
    ok: boolean
    /** Why it failed, in the UI language; MetisClip then keeps using the old folder */
    error?: string
    cancelled?: boolean
    newRoot?: string
    oldRoot?: string
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
    /** Runtime versions of the desktop shell */
    readonly versions?: { electron: string; chrome: string; node: string }
    /** 'x64' */
    readonly arch?: string
    /** Windows build, e.g. "10.0.26200" */
    readonly osVersion?: string
    /** UI language saved by the main process ('id' | 'en'), read when the window loaded */
    readonly language: string
    /** Saves the UI language: main uses it for its own screens and dialogs and passes it to the engine */
    setLanguage(lang: string): Promise<void>
    /** Closing the window keeps MetisClip running in the tray (Pengaturan → Aplikasi; saved by main at once) */
    getCloseToTray(): Promise<boolean>
    setCloseToTray(on: boolean): Promise<void>

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
    /** Checks a destination for moving the data folder ("Pindahkan Lokasi Data") */
    planDataMove(path: string): Promise<MetisDataMovePlan>
    /**
     * Moves the data folder: stops the engine and MongoDB, copies, verifies, starts on the copy and saves
     * the new location. Resolves when done; the old folder stays until deletePreviousDataRoot().
     */
    moveDataRoot(path: string): Promise<MetisDataMoveResult>
    /** Stops a running move while it copies (the copy is removed, the old folder stays in use) */
    cancelDataMove(): Promise<void>
    /** Returns an unsubscribe function */
    onDataMoveProgress(cb: (progress: MetisDataMoveProgress) => void): () => void
    /** The folder the data was moved away from, while it still exists */
    getPreviousDataRoot(): Promise<{ path: string; bytes: number } | null>
    /** Deletes that folder (after the user confirmed) */
    deletePreviousDataRoot(): Promise<{ ok: boolean; error?: string; freedBytes?: number }>
    /** Keeps that folder and stops offering to delete it */
    forgetPreviousDataRoot(): Promise<void>

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
