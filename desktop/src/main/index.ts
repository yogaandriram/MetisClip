// MetisClip Electron main process: lifecycle, single instance, window, mongod + engine sidecars.
import fs from 'node:fs'
import path from 'node:path'
import { app, BrowserWindow, screen, session, shell } from 'electron'
import { configureUserData, entryUrl, getPaths, isTrustedUrl } from './paths'
import { createLogger, initLogger } from './logger'
import { registerAppProtocol, registerSchemePrivileges } from './protocol'
import { Backend } from './engine'
import { registerIpc } from './ipc'
import { dataRootAvailable, dataRootOverride, ensureStructure, readBootstrap } from './data-root'
import { loadWindowState, MIN_HEIGHT, MIN_WIDTH, trackWindowState } from './window-state'

configureUserData()
registerSchemePrivileges()

const log = createLogger('main')
const backend = new Backend()
let mainWindow: BrowserWindow | null = null
let cleanedUp = false
let quitting = false

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** Built-in Indonesian error page (shown when the UI itself cannot be loaded). */
function errorPage(detail: string): string {
  const logs = getPaths().logsDir
  const retry = entryUrl('/')
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>MetisClip</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<style>
  /* Same tokens as frontend/styles/tokens.css: canvas mist, surface card, ink text and buttons. */
  body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#ECFAE5;color:#16240F;
       font-family:"Segoe UI",system-ui,sans-serif}
  .card{max-width:640px;padding:32px 36px;border-radius:28px;background:#F9FDF6}
  h1{font-size:22px;font-weight:600;margin:0 0 12px} p{line-height:1.6;color:#465F3A;margin:8px 0}
  code{display:block;margin:12px 0;padding:10px 14px;border-radius:12px;background:#ECFAE5;color:#16240F;font-family:Consolas,monospace;
       font-size:12px;white-space:pre-wrap;word-break:break-all}
  .row{display:flex;gap:12px;margin-top:24px}
  button{font:inherit;font-weight:600;height:44px;padding:0 22px;border-radius:999px;border:0;cursor:pointer;background:#16240F;color:#F9FDF6}
  button:hover{background:#293D1F}
  button.secondary{background:transparent;color:#16240F;box-shadow:inset 0 0 0 1px #6D8D5E}
  button.secondary:hover{background:#DDF6D2}
  button:focus-visible{outline:2px solid #16240F;outline-offset:3px}
</style></head><body><div class="card">
  <h1>Tampilan MetisClip tidak bisa dimuat</h1>
  <p>Terjadi masalah saat membuka antarmuka aplikasi.</p>
  <code>${escapeHtml(detail)}</code>
  <p>Detail tersimpan di folder log:</p>
  <code>${escapeHtml(logs)}</code>
  <div class="row">
    <button id="retry">Coba lagi</button>
    <button id="logs" class="secondary">Buka folder log</button>
  </div>
</div>
<script>
  document.getElementById('retry').onclick = function () { location.href = ${JSON.stringify(retry)} };
  document.getElementById('logs').onclick = function () { window.metis && window.metis.openPath(${JSON.stringify(logs)}) };
</script></body></html>`
}

function showErrorPage(win: BrowserWindow, detail: string): void {
  log.error(`UI gagal dimuat: ${detail}`)
  void win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(errorPage(detail)))
}

function createWindow(): BrowserWindow {
  const p = getPaths()
  const state = loadWindowState(p.windowStateFile)
  const wa = screen.getPrimaryDisplay().workAreaSize
  // 1280×720 minimum (§9.3), but never larger than a small screen's work area (e.g. 1366×768 at 125 %).
  const minWidth = Math.min(MIN_WIDTH, wa.width)
  const minHeight = Math.min(MIN_HEIGHT, wa.height)

  const win = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: Math.min(state.width, Math.max(minWidth, wa.width)),
    height: Math.min(state.height, Math.max(minHeight, wa.height)),
    minWidth,
    minHeight,
    show: false,
    title: 'MetisClip',
    backgroundColor: '#ECFAE5', // --mist, the UI canvas (frontend/styles/tokens.css)
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      additionalArguments: [`--metis-app-version=${app.getVersion()}`, `--metis-packaged=${app.isPackaged ? 1 : 0}`],
    },
  })
  win.setMenu(null)
  if (state.maximized) win.maximize()
  trackWindowState(win, p.windowStateFile)

  win.once('ready-to-show', () => {
    win.show()
    if (p.isDev && process.env.METISCLIP_DEVTOOLS === '1') win.webContents.openDevTools({ mode: 'detach' })
  })

  const wc = win.webContents
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url) && !isTrustedUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  wc.on('will-navigate', (e, url) => {
    if (isTrustedUrl(url)) return
    e.preventDefault()
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    log.warn(`navigasi diblokir: ${url}`)
  })
  wc.on('will-attach-webview', (e) => e.preventDefault())
  wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3 /* ERR_ABORTED: superseded navigation */) return
    if (url.startsWith('data:')) return
    showErrorPage(win, `${desc} (${code}) saat memuat ${url}`)
  })
  wc.on('render-process-gone', (_e, details) => {
    log.error(`renderer berhenti: ${details.reason} (exit ${details.exitCode})`)
    if (details.reason !== 'clean-exit' && !win.isDestroyed()) showErrorPage(win, `Renderer berhenti: ${details.reason}`)
  })
  wc.on('console-message', (e) => {
    const level = (e as unknown as { level?: string | number }).level
    if (level === 'error' || level === 3) log.warn(`[renderer] ${(e as unknown as { message: string }).message}`)
  })
  if (p.isDev) {
    wc.on('before-input-event', (_e, input) => {
      if (input.type === 'keyDown' && (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i'))) {
        wc.toggleDevTools()
      }
    })
  }

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  const url = entryUrl('/')
  log.info(`memuat UI: ${url}`)
  void win.loadURL(url)
  return win
}

function hardenSession(): void {
  const ses = session.defaultSession
  ses.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'clipboard-sanitized-write' || permission === 'fullscreen'))
  ses.setPermissionCheckHandler((_wc, permission) => permission === 'clipboard-sanitized-write' || permission === 'fullscreen')
}

function startBackend(): void {
  const root = readBootstrap()
  if (!root) {
    log.info('belum ada folder data (first run): menunggu setDataRoot() dari UI')
    return
  }
  if (dataRootOverride()) {
    log.info(`METISCLIP_DATA_ROOT_OVERRIDE: memakai ${root} (bootstrap.json tidak disentuh)`)
    ensureStructure(root)
  }
  if (!dataRootAvailable(root)) {
    backend.fail(`Folder data tidak ditemukan: ${root}. Sambungkan kembali drive-nya lalu coba lagi, atau pilih lokasi lain.`)
    return
  }
  void backend.start(root)
}

// ---- verification hooks (documented in desktop/README.md) ----------------------------------

let screenshotDone: Promise<void> = Promise.resolve()

function setupVerificationHooks(win: BrowserWindow): void {
  const shot = process.env.METISCLIP_SCREENSHOT
  if (shot) {
    const delay = Number(process.env.METISCLIP_SCREENSHOT_DELAY_MS || 5000)
    const route = process.env.METISCLIP_SCREENSHOT_ROUTE
    screenshotDone = new Promise<void>((resolve) => {
      win.webContents.once('did-finish-load', async () => {
        try {
          if (route) {
            log.info(`[hook] screenshot: navigasi ke ${route}`)
            await win.loadURL(entryUrl(route))
          }
          await new Promise((r) => setTimeout(r, delay))
          const scrollTo = process.env.METISCLIP_SCREENSHOT_SCROLL
          if (scrollTo) {
            await win.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(scrollTo)})?.scrollIntoView({ block: 'start' })`)
            await new Promise((r) => setTimeout(r, 500))
          }
          if (!win.isVisible()) win.show()
          let img: Electron.NativeImage | null = null
          for (let attempt = 1; attempt <= 4 && !img; attempt++) {
            try {
              win.webContents.invalidate()
              await new Promise((r) => setTimeout(r, 250))
              const shotImg = await win.webContents.capturePage()
              if (!shotImg.isEmpty()) img = shotImg
            } catch (e) {
              log.warn(`[hook] capturePage percobaan ${attempt} gagal: ${(e as Error).message}`)
              await new Promise((r) => setTimeout(r, 1000))
            }
          }
          if (!img) throw new Error('capturePage tidak menghasilkan gambar')
          const out = path.resolve(shot)
          fs.mkdirSync(path.dirname(out), { recursive: true })
          fs.writeFileSync(out, img.toPNG())
          const size = img.getSize()
          log.info(`[hook] screenshot ${size.width}x${size.height} disimpan: ${out} (url ${win.webContents.getURL().slice(0, 120)})`)
        } catch (e) {
          log.error('[hook] screenshot gagal:', e)
        }
        resolve()
      })
    })
  }
  const autoquit = Number(process.env.METISCLIP_AUTOQUIT_MS || 0)
  if (autoquit > 0) {
    log.info(`[hook] autoquit dalam ${autoquit} ms`)
    setTimeout(() => {
      void screenshotDone.then(() => {
        log.info(`[hook] autoquit: status engine ${JSON.stringify(backend.getStatus().state)}, pids ${JSON.stringify(backend.pids())}`)
        app.quit()
      })
    }, autoquit)
  }
}

// ---- lifecycle ---------------------------------------------------------------------------------

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  const p = getPaths()
  const logFile = initLogger(p.logsDir, { echo: p.isDev })
  log.info(
    `MetisClip ${app.getVersion()} start (packaged ${app.isPackaged}, electron ${process.versions.electron}, node ${process.versions.node}, pid ${process.pid})`,
  )
  log.info(`log: ${logFile}; userData: ${p.appDataDir}; bin: ${p.binDir}; render: ${p.renderDir}; browser: ${p.browserPath ?? '-'}`)

  app.setAppUserModelId('com.metisclip.desktop')

  app.on('second-instance', () => {
    log.info('instance kedua dibuka; fokus ke jendela')
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    hardenSession()
    if (p.uiDir) registerAppProtocol(p.uiDir)
    registerIpc(backend)
    mainWindow = createWindow()
    setupVerificationHooks(mainWindow)
    // Start mongod + engine once the UI has loaded: spawn() is synchronous and can block the main
    // thread (which also serves app://) for seconds while antivirus scans freshly installed binaries.
    let started = false
    const kick = () => {
      if (started) return
      started = true
      startBackend()
    }
    mainWindow.webContents.once('did-finish-load', kick)
    mainWindow.webContents.once('did-fail-load', kick)
    setTimeout(kick, 3000)
  })

  app.on('window-all-closed', () => app.quit())

  app.on('before-quit', (e) => {
    if (cleanedUp) return
    e.preventDefault()
    if (quitting) return
    quitting = true
    log.info(`quit: menghentikan engine dan MongoDB (pids ${JSON.stringify(backend.pids())})`)
    for (const w of BrowserWindow.getAllWindows()) w.hide()
    backend
      .stop('quit')
      .catch((err) => log.error('stop gagal:', err))
      .finally(() => {
        cleanedUp = true
        log.info('quit: selesai')
        app.quit()
      })
  })

  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      log.info(`${sig} diterima`)
      app.quit()
    })
  }
}
