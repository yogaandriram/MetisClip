// Folder resolution for packaged vs dev builds (docs/desktop-contract.md §1).
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

export interface AppPaths {
  isDev: boolean
  /** <repo> in dev, null when packaged */
  repoRoot: string | null
  /** %APPDATA%\MetisClip (or MetisClip-Dev) */
  appDataDir: string
  logsDir: string
  bootstrapFile: string
  windowStateFile: string
  binDir: string
  mongodExe: string
  renderDir: string
  /** Static UI folder served on app://metisclip/ (null in dev unless METISCLIP_UI_DIR is set) */
  uiDir: string | null
  /** Dev URL for `next dev` (null when the static UI is served) */
  devUrl: string | null
  engine: { command: string; args: string[]; cwd: string }
  /** Chrome Headless Shell for Remotion, if found */
  browserPath: string | null
}

let cached: AppPaths | null = null

/** Must run before app 'ready' so userData is redirected in dev. */
export function configureUserData(): void {
  // METISCLIP_USERDATA_DIR: isolated userData for tests (first-run flow, E2E of dev or packaged builds)
  const override = process.env.METISCLIP_USERDATA_DIR
  const name = app.isPackaged ? 'MetisClip' : 'MetisClip-Dev'
  app.setPath('userData', override ? path.resolve(override) : path.join(app.getPath('appData'), name))
}

function firstExisting(candidates: Array<string | null | undefined>): string | null {
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c
  }
  return null
}

export function getPaths(): AppPaths {
  if (cached) return cached
  const isDev = !app.isPackaged
  const appDataDir = app.getPath('userData')
  const logsDir = path.join(appDataDir, 'logs')
  // In dev, app.getAppPath() is <repo>\desktop (where package.json lives).
  const repoRoot = isDev ? path.resolve(app.getAppPath(), '..') : null
  const resources = process.resourcesPath

  const binDir = isDev ? path.join(repoRoot!, 'desktop', 'resources', 'bin') : path.join(resources, 'bin')
  const renderDir = isDev ? path.join(repoRoot!, 'render-engine') : path.join(resources, 'render-engine')

  let uiDir: string | null = null
  let devUrl: string | null = null
  if (process.env.METISCLIP_UI_DIR) {
    uiDir = path.resolve(process.env.METISCLIP_UI_DIR)
  } else if (isDev) {
    devUrl = (process.env.METISCLIP_DEV_URL || 'http://localhost:3000').replace(/\/+$/, '')
  } else {
    uiDir = path.join(resources, 'ui')
  }

  let engine: AppPaths['engine']
  if (isDev && process.env.METISCLIP_ENGINE_CMD) {
    // Dev-only verification hook: run a different engine command (e.g. a stub); args as a JSON array in METISCLIP_ENGINE_ARGS.
    const args = process.env.METISCLIP_ENGINE_ARGS ? (JSON.parse(process.env.METISCLIP_ENGINE_ARGS) as string[]) : []
    engine = { command: process.env.METISCLIP_ENGINE_CMD, args, cwd: repoRoot || path.dirname(process.env.METISCLIP_ENGINE_CMD) }
  } else if (isDev) {
    engine = {
      command: path.join(repoRoot!, 'venv', 'Scripts', 'python.exe'),
      args: ['-m', 'backend.run'],
      cwd: repoRoot!,
    }
  } else {
    const engineDir = path.join(resources, 'engine')
    engine = { command: path.join(engineDir, 'metisclip-engine.exe'), args: [], cwd: engineDir }
  }

  const browserPath = firstExisting([
    process.env.METISCLIP_BROWSER_PATH,
    // packaged layout (see scripts/build-desktop.ps1): <render-engine>\browser\chrome-headless-shell.exe
    path.join(renderDir, 'browser', 'chrome-headless-shell.exe'),
    // dev layout: downloaded by `npx remotion browser ensure`
    path.join(renderDir, 'node_modules', '.remotion', 'chrome-headless-shell', 'win64', 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'),
  ])

  cached = {
    isDev,
    repoRoot,
    appDataDir,
    logsDir,
    bootstrapFile: path.join(appDataDir, 'bootstrap.json'),
    windowStateFile: path.join(appDataDir, 'window-state.json'),
    binDir,
    mongodExe: path.join(binDir, 'mongod.exe'),
    renderDir,
    uiDir,
    devUrl,
    engine,
    browserPath,
  }
  return cached
}

/** The URL the main window loads. */
export function entryUrl(route = '/'): string {
  const p = getPaths()
  const r = route.startsWith('/') ? route : `/${route}`
  if (p.devUrl) return p.devUrl + r
  return `app://metisclip${r}`
}

/**
 * true for URLs of our own UI (app://metisclip/… or the dev server). Note: Node's URL reports
 * origin "null" for custom schemes, so app:// is matched on protocol + host.
 */
export function isTrustedUrl(url: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.protocol === 'app:' && u.host === 'metisclip') return true
  const p = getPaths()
  return !!p.devUrl && u.origin === new URL(p.devUrl).origin
}
