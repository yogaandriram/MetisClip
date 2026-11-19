// App updates (§10.4): electron-updater, fed by the GitHub Releases of the open-source repository
// (electron-builder.yml `publish`, which electron-builder writes into resources\app-update.yml).
//
// "Perbarui MetisClip otomatis" (Pengaturan → Aplikasi, preferences.json `auto_update`, on by default):
// a check 90 s after start and every 6 hours; a new version downloads in the background. "Periksa sekarang"
// (Sistem → Tentang) checks and downloads whatever the switch says.
//
// The installer never runs while the engine and MongoDB are up: electron-updater's own install-on-quit is
// off, and index.ts calls installPending() only after it stopped both. The NSIS installer then runs silently
// (and opens MetisClip again after "Mulai ulang dan pasang"). A Windows shutdown or logoff never installs.
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { autoUpdater, type NsisUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater'
import { createLogger } from './logger'
import { getPaths } from './paths'
import { readPrefs, writePrefs } from './preferences'

const log = createLogger('updater')

/** The repository of electron-builder.yml `publish` (release pages for "Lihat catatan rilis"). */
export const RELEASES_URL = 'https://github.com/yogaandriram/MetisClip/releases'

const FIRST_CHECK_MS = 90_000
const CHECK_EVERY_MS = 6 * 3600_000

export type UpdatePhase = 'unsupported' | 'idle' | 'checking' | 'latest' | 'downloading' | 'ready' | 'error'
export type UpdateErrorKind = 'offline' | 'noRelease' | 'corrupt' | 'signature' | 'disk' | 'other'

export interface UpdateStatus {
  phase: UpdatePhase
  /** The automatic check is on */
  auto: boolean
  /** This app's version */
  current: string
  /** The newer version while it downloads or waits to be installed */
  version?: string
  percent?: number
  transferred?: number
  total?: number
  /** Last check that reached the feed (ISO time) */
  checkedAt?: string
  error?: { kind: UpdateErrorKind; detail: string }
  /** The release page of `version` */
  releaseUrl?: string
}

/** A QA hook (desktop/README.md): a local generic feed instead of GitHub; loopback http only. */
function feedHook(): string | null {
  const raw = process.env.METISCLIP_UPDATE_FEED
  if (!raw) return null
  try {
    const u = new URL(raw)
    if (u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)) return u.toString()
  } catch {
    // reported below
  }
  log.warn(`METISCLIP_UPDATE_FEED diabaikan (hanya http://127.0.0.1:<port>/): ${raw}`)
  return null
}

/** Sorts an electron-updater error into what the UI can explain (frontend about.update.errors). */
export function classifyError(err: unknown): { kind: UpdateErrorKind; detail: string } {
  const e = err as { message?: string; code?: string } | null
  const message = String(e?.message ?? err ?? '')
  const detail = message.split(/\r?\n/)[0].slice(0, 300)
  const code = String(e?.code ?? '')
  let kind: UpdateErrorKind = 'other'
  if (code === 'ERR_UPDATER_INVALID_SIGNATURE') kind = 'signature'
  else if (/sha512 checksum mismatch|checksum mismatch/i.test(message)) kind = 'corrupt'
  else if (/ENOSPC|not enough space|disk full/i.test(message)) kind = 'disk'
  else if (code === 'ERR_UPDATER_LATEST_VERSION_NOT_FOUND' || /\b404\b|Unable to find latest version|Cannot find latest\.yml|No published versions/i.test(message)) kind = 'noRelease'
  else if (/net::ERR_(INTERNET_DISCONNECTED|NAME_NOT_RESOLVED|NAME_RESOLUTION_FAILED|CONNECTION_|NETWORK_|TIMED_OUT|ADDRESS_UNREACHABLE|PROXY_)|ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|socket hang up/i.test(message)) kind = 'offline'
  return { kind, detail }
}

export class AppUpdater extends EventEmitter {
  private readonly updater = autoUpdater as NsisUpdater
  private readonly supported: boolean
  private status: UpdateStatus
  private firstTimer: NodeJS.Timeout | null = null
  private everyTimer: NodeJS.Timeout | null = null
  private lastProgressAt = 0
  private restartAfterInstall = false
  private installStarted = false

  constructor() {
    super()
    const prefs = readPrefs()
    this.supported = this.configure()
    const checkedAt = typeof prefs.update_checked_at === 'string' ? prefs.update_checked_at : undefined
    this.status = {
      phase: this.supported ? 'idle' : 'unsupported',
      auto: prefs.auto_update !== false,
      current: app.getVersion(),
      checkedAt,
    }
  }

  private configure(): boolean {
    const u = this.updater
    u.autoDownload = false
    u.autoInstallOnAppQuit = false // index.ts installs, after the engine and MongoDB stopped
    u.allowDowngrade = false
    u.allowPrerelease = false
    u.disableWebInstaller = true // the full NSIS installer is published, never the web installer
    u.logger = {
      info: (m?: unknown) => log.info(String(m)),
      warn: (m?: unknown) => log.warn(String(m)),
      error: (m?: unknown) => log.error(String(m)),
      debug: (m: string) => log.debug(m),
    }

    const hook = feedHook()
    if (hook) {
      // An own config file: the generic feed, and a cache folder apart from a real install's
      const file = path.join(getPaths().appDataDir, 'update-feed.yml')
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, `provider: generic\nurl: ${JSON.stringify(hook)}\nupdaterCacheDirName: metisclip-desktop-updater-qa\n`)
      u.updateConfigPath = file
      u.forceDevUpdateConfig = true
      log.info(`[hook] feed update: ${hook}`)
    } else if (!app.isPackaged) {
      log.info('build pengembangan: pembaruan aplikasi tidak diperiksa')
      return false
    } else if (!fs.existsSync(path.join(process.resourcesPath, 'app-update.yml'))) {
      log.warn('app-update.yml tidak ada di resources: pembaruan aplikasi tidak diperiksa')
      return false
    }

    u.on('checking-for-update', () => this.set({ phase: 'checking', error: undefined }))
    u.on('update-not-available', () => this.set({ phase: 'latest', version: undefined, error: undefined, ...this.checked() }))
    u.on('update-available', (info: UpdateInfo) => {
      log.info(`versi baru tersedia: ${info.version}`)
      this.set({ phase: 'downloading', version: info.version, percent: 0, transferred: 0, total: undefined, error: undefined, releaseUrl: releaseUrl(info.version), ...this.checked() })
      this.updater.downloadUpdate().catch((err) => this.fail(err))
    })
    u.on('download-progress', (p: ProgressInfo) => {
      const now = Date.now()
      if (now - this.lastProgressAt < 1000 && p.percent < 100) return
      this.lastProgressAt = now
      this.set({ phase: 'downloading', percent: Math.round(p.percent), transferred: p.transferred, total: p.total })
    })
    u.on('update-downloaded', (info: UpdateInfo) => {
      log.info(`versi ${info.version} siap dipasang`)
      this.set({ phase: 'ready', version: info.version, percent: 100, error: undefined, releaseUrl: releaseUrl(info.version), ...this.checked() })
    })
    u.on('error', (err) => this.fail(err))
    return true
  }

  private checked(): { checkedAt: string } {
    const checkedAt = new Date().toISOString()
    try {
      writePrefs({ update_checked_at: checkedAt })
    } catch (e) {
      log.warn(`waktu pemeriksaan tidak tersimpan: ${(e as Error).message}`)
    }
    return { checkedAt }
  }

  private fail(err: unknown): void {
    // A failed check or download leaves an already downloaded version ready to install
    if (this.status.phase === 'ready') return
    const error = classifyError(err)
    log.warn(`pembaruan gagal (${error.kind}): ${error.detail}`)
    this.set({ phase: 'error', error, percent: undefined })
  }

  private set(patch: Partial<UpdateStatus>): void {
    this.status = { ...this.status, ...patch }
    this.emit('status', this.getStatus())
  }

  getStatus(): UpdateStatus {
    return { ...this.status }
  }

  /** Starts the automatic checks (called once the app is ready). */
  start(): void {
    this.schedule()
  }

  private schedule(): void {
    if (this.firstTimer) clearTimeout(this.firstTimer)
    if (this.everyTimer) clearInterval(this.everyTimer)
    this.firstTimer = this.everyTimer = null
    if (!this.supported || !this.status.auto) return
    this.firstTimer = setTimeout(() => void this.check('auto'), FIRST_CHECK_MS)
    this.everyTimer = setInterval(() => void this.check('auto'), CHECK_EVERY_MS)
  }

  setAuto(on: boolean): void {
    if (on === this.status.auto) return
    writePrefs({ auto_update: on })
    log.info(`pembaruan otomatis ${on ? 'aktif' : 'nonaktif'}`)
    this.set({ auto: on })
    this.schedule()
  }

  /** Checks the feed now; a newer version starts downloading. Busy states are left alone. */
  async check(from: 'auto' | 'manual'): Promise<UpdateStatus> {
    if (!this.supported) return this.getStatus()
    if (['checking', 'downloading', 'ready'].includes(this.status.phase)) return this.getStatus()
    log.info(`memeriksa pembaruan (${from === 'auto' ? 'otomatis' : 'manual'})`)
    this.set({ phase: 'checking', error: undefined })
    try {
      await this.updater.checkForUpdates()
    } catch (err) {
      // electron-updater usually reported it already through its 'error' event
      if (this.status.phase !== 'error') this.fail(err)
    }
    return this.getStatus()
  }

  /** A downloaded version waits for the next quit (or "Mulai ulang dan pasang"). */
  get pending(): boolean {
    return this.status.phase === 'ready'
  }

  /** "Mulai ulang dan pasang": the next quit opens MetisClip again after installing. */
  requestRestart(): void {
    this.restartAfterInstall = true
  }

  /**
   * Starts the installer for a downloaded version, silently. Call it only once the engine and MongoDB
   * have stopped: the installer closes MetisClip.exe and replaces the files in the install folder.
   */
  installPending(): boolean {
    if (!this.pending || this.installStarted) return false
    this.installStarted = true
    const runAfter = this.restartAfterInstall
    log.info(`memasang versi ${this.status.version}${runAfter ? ', lalu membuka MetisClip lagi' : ' saat keluar'}`)
    try {
      const started = this.updater.install(true, runAfter)
      if (!started) log.warn('installer pembaruan tidak dapat dijalankan')
      return started
    } catch (e) {
      log.error('installer pembaruan gagal dijalankan:', e)
      return false
    }
  }

  stop(): void {
    if (this.firstTimer) clearTimeout(this.firstTimer)
    if (this.everyTimer) clearInterval(this.everyTimer)
    this.firstTimer = this.everyTimer = null
  }
}

function releaseUrl(version: string): string {
  return `${RELEASES_URL}/tag/v${encodeURIComponent(version)}`
}
