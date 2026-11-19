// Engine sidecar (docs/desktop-contract.md §3) and the Backend orchestrator that owns
// mongod + engine as one unit and exposes the MetisEngineStatus state machine to the UI.
import { spawn, type ChildProcess } from 'node:child_process'
import crypto from 'node:crypto'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import { addSecret, createLogger } from './logger'
import { MongodManager } from './mongod'
import { getPaths } from './paths'
import { killTree, onLines, sleep, waitExit } from './procs'
import { ensureStructure } from './data-root'
import { getLanguage, tr, type Lang } from './i18n'

const log = createLogger('engine')

const READY_TIMEOUT_MS = 60000
const SHUTDOWN_WAIT_MS = 15000
const MAX_CRASH_RESTARTS = 3
const CRASH_WINDOW_MS = 5 * 60 * 1000
const BACKOFF_MS = [1000, 3000, 10000]

export type EngineState = 'idle' | 'starting' | 'ready' | 'restarting' | 'error' | 'stopped'
export interface EngineInfo {
  baseUrl: string
  token: string
}
export interface EngineStatus {
  state: EngineState
  message?: string
  info?: EngineInfo
}

// ---------------------------------------------------------------------------------------------
// One engine process
// ---------------------------------------------------------------------------------------------

class EngineProcess {
  child: ChildProcess | null = null
  port = 0
  readonly token = crypto.randomBytes(32).toString('hex')
  private stderrTail: string[] = []
  stopping = false

  constructor(
    private env: NodeJS.ProcessEnv,
    private onUnexpectedExit: (code: number | null, tail: string[]) => void,
  ) {
    addSecret(this.token)
  }

  get baseUrl(): string {
    return `http://127.0.0.1:${this.port}`
  }

  get running(): boolean {
    return !!this.child && this.child.exitCode === null && this.child.signalCode === null
  }

  start(): Promise<void> {
    const p = getPaths()
    const { command, args, cwd } = p.engine
    if (!fs.existsSync(command)) {
      return Promise.reject(
        new Error(
          p.isDev ? tr().engine.venvMissing(command) : tr().engine.exeMissing(command),
        ),
      )
    }
    const env: NodeJS.ProcessEnv = { ...process.env, ...this.env, METISCLIP_TOKEN: this.token }
    delete env.ELECTRON_RUN_AS_NODE
    log.info(`start: ${command} ${args.join(' ')} (cwd ${cwd})`)
    const child = spawn(command, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    this.child = child

    onLines(child.stderr, (line) => {
      this.stderrTail.push(line)
      if (this.stderrTail.length > 200) this.stderrTail.shift()
      if (p.isDev) {
        try {
          process.stdout.write(`[engine] ${line}\n`)
        } catch {
          // no console
        }
      }
    })

    return new Promise<void>((resolve, reject) => {
      let settled = false
      const finish = (err?: Error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (err) reject(err)
        else resolve()
      }
      const timer = setTimeout(
        () => finish(new Error(tr().engine.readyTimeout(READY_TIMEOUT_MS / 1000, this.tailHint()))),
        READY_TIMEOUT_MS,
      )
      onLines(child.stdout, (line) => {
        const t = line.trim()
        if (!t.startsWith('{')) {
          if (t) log.debug(`[stdout] ${t}`)
          return
        }
        let msg: { event?: string; port?: number; version?: string; message?: string }
        try {
          msg = JSON.parse(t)
        } catch {
          log.debug(`[stdout] ${t}`)
          return
        }
        if (msg.event === 'ready' && typeof msg.port === 'number') {
          this.port = msg.port
          log.info(`ready line: port ${msg.port}, versi ${msg.version ?? '?'} (pid ${child.pid})`)
          finish()
        } else if (msg.event === 'fatal') {
          log.error(`fatal: ${msg.message}`)
          finish(new Error(msg.message || tr().engine.startFailed))
        }
      })
      child.once('error', (err) => finish(err))
      child.on('exit', (code, signal) => {
        log.info(`exit (code ${code}${signal ? `, ${signal}` : ''}, pid ${child.pid})`)
        if (!settled) {
          this.dumpTail('engine berhenti sebelum siap')
          finish(new Error(tr().engine.exitedAtStart(code, this.tailHint())))
          return
        }
        if (!this.stopping) this.onUnexpectedExit(code, [...this.stderrTail])
      })
    })
  }

  private tailHint(): string {
    const last = this.stderrTail.filter((l) => l.trim()).slice(-1)[0]
    return last ? tr().engine.lastMessage(last.slice(0, 300)) : ''
  }

  dumpTail(reason: string): void {
    if (!this.stderrTail.length) return
    log.error(`${reason}; stderr terakhir:\n  ${this.stderrTail.slice(-40).join('\n  ')}`)
  }

  async health(): Promise<{ status?: string; version?: string; mongo?: boolean }> {
    const res = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) throw new Error(`/health HTTP ${res.status}`)
    return (await res.json()) as { status?: string; version?: string; mongo?: boolean }
  }

  async requestShutdown(): Promise<boolean> {
    if (!this.running || !this.port) return false
    try {
      const res = await fetch(`${this.baseUrl}/internal/shutdown`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}` },
        signal: AbortSignal.timeout(5000),
      })
      log.info(`/internal/shutdown → HTTP ${res.status}`)
      return res.ok
    } catch (e) {
      log.warn(`/internal/shutdown gagal: ${(e as Error).message}`)
      return false
    }
  }

  async kill(): Promise<void> {
    this.stopping = true
    if (!this.running) return
    log.warn(`paksa berhenti (taskkill /T) pid ${this.child?.pid}`)
    await killTree(this.child?.pid)
    await waitExit(this.child, 5000)
  }
}

// ---------------------------------------------------------------------------------------------
// Backend orchestrator
// ---------------------------------------------------------------------------------------------

export class Backend extends EventEmitter {
  private status: EngineStatus = { state: 'idle' }
  private mongod: MongodManager | null = null
  private engine: EngineProcess | null = null
  private engineCrashes: number[] = []
  private stopping = false
  private startPromise: Promise<{ ok: boolean; error?: string }> | null = null
  dataRoot: string | null = null
  /** The folder the data was just moved away from: the engine points stored paths at the new one */
  movedFrom: string | null = null

  getStatus(): EngineStatus {
    return { ...this.status }
  }

  private setStatus(state: EngineState, message?: string, info?: EngineInfo): void {
    this.status = { state, ...(message ? { message } : {}), ...(info ? { info } : {}) }
    log.info(`status → ${state}${message ? `: ${message}` : ''}${info ? ` (${info.baseUrl})` : ''}`)
    this.emit('status', this.getStatus())
  }

  /** Error state without starting anything (e.g. data folder missing at startup). */
  fail(message: string): void {
    this.setStatus('error', message)
  }

  /** Resolves with engine info when ready; waits through idle/starting/restarting; rejects on error/stopped. */
  waitReady(): Promise<EngineInfo> {
    const s = this.status
    if (s.state === 'ready' && s.info) return Promise.resolve(s.info)
    if (s.state === 'error') return Promise.reject(new Error(s.message || tr().engine.failed))
    if (s.state === 'stopped') return Promise.reject(new Error(tr().engine.appClosing))
    return new Promise((resolve, reject) => {
      const onStatus = (st: EngineStatus) => {
        if (st.state === 'ready' && st.info) {
          this.off('status', onStatus)
          resolve(st.info)
        } else if (st.state === 'error' || st.state === 'stopped') {
          this.off('status', onStatus)
          reject(new Error(st.message || (st.state === 'stopped' ? tr().engine.appClosing : tr().engine.failed)))
        }
      }
      this.on('status', onStatus)
    })
  }

  start(dataRoot: string): Promise<{ ok: boolean; error?: string }> {
    if (this.startPromise && this.dataRoot === dataRoot) return this.startPromise
    this.startPromise = this.doStart(dataRoot).finally(() => {
      this.startPromise = null
    })
    return this.startPromise
  }

  private async doStart(dataRoot: string): Promise<{ ok: boolean; error?: string }> {
    if (this.status.state === 'ready' && this.dataRoot === dataRoot) return { ok: true }
    if (this.mongod || this.engine) await this.stop('restart')
    this.stopping = false
    this.dataRoot = dataRoot
    this.engineCrashes = []
    const p = getPaths()
    try {
      this.setStatus('starting', tr().engine.preparingDb)
      ensureStructure(dataRoot)
      this.mongod = new MongodManager({
        exe: p.mongodExe,
        dataRoot,
        logsDir: p.logsDir,
        onFatal: (msg) => {
          if (this.stopping) return
          this.setStatus('error', msg)
          void this.engine?.kill()
        },
        onRestarted: (port, portChanged) => {
          if (this.stopping) return
          log.warn(`mongod dimulai ulang di port ${port}${portChanged ? ' (port berubah, engine dimulai ulang)' : ''}`)
          if (portChanged) void this.restartEngine(tr().engine.dbPortChanged)
        },
      })
      await this.mongod.start()
      this.setStatus('starting', tr().engine.startingEngine)
      const info = await this.spawnEngine()
      this.setStatus('ready', undefined, info)
      return { ok: true }
    } catch (e) {
      const msg = (e as Error).message
      log.error(`start gagal: ${msg}`)
      await this.forceStopAll()
      this.setStatus('error', msg)
      return { ok: false, error: msg }
    }
  }

  private engineEnv(): NodeJS.ProcessEnv {
    const p = getPaths()
    const env: NodeJS.ProcessEnv = {
      METISCLIP_ENV: p.isDev ? 'dev' : 'production',
      METISCLIP_DATA_ROOT: this.dataRoot!,
      METISCLIP_APPDATA_DIR: p.appDataDir,
      METISCLIP_BIN_DIR: p.binDir,
      METISCLIP_MONGO_PORT: String(this.mongod?.port ?? ''),
      METISCLIP_NODE_PATH: process.execPath,
      METISCLIP_RENDER_DIR: p.renderDir,
      // lets the engine's parent watchdog follow Electron (in dev the direct parent is the venv launcher)
      METISCLIP_PARENT_PID: String(process.pid),
      PYTHONIOENCODING: 'utf-8',
      // UI language for the engine's own messages (backend/core/i18n.py)
      METISCLIP_LANG: getLanguage(),
    }
    if (p.browserPath) env.METISCLIP_BROWSER_PATH = p.browserPath
    if (p.isDev) env.PYTHONUNBUFFERED = '1'
    if (this.movedFrom) env.METISCLIP_MOVED_FROM = this.movedFrom
    return env
  }

  private async spawnEngine(): Promise<EngineInfo> {
    const p = getPaths()
    const extra = this.engineEnv()
    const proc = new EngineProcess(extra, (code, tail) => void this.onEngineCrash(proc, code, tail))
    if (!p.isDev) {
      // dev-only overrides must never leak into a packaged engine from the user's environment
      for (const k of ['METISCLIP_PORT', 'MONGODB_URI']) delete process.env[k]
    }
    this.engine = proc
    try {
      await proc.start()
    } catch (e) {
      await proc.kill()
      throw e
    }
    // /health check (includes a MongoDB ping)
    let lastErr = ''
    for (let i = 0; i < 10; i++) {
      try {
        const h = await proc.health()
        if (h.status === 'ok') {
          log.info(`/health ok (versi ${h.version ?? '?'}, mongo ${h.mongo})`)
          return { baseUrl: proc.baseUrl, token: proc.token }
        }
        lastErr = `status ${h.status}`
      } catch (e) {
        lastErr = (e as Error).message
      }
      await sleep(500)
    }
    await proc.kill()
    throw new Error(tr().engine.unhealthy(lastErr))
  }

  private async onEngineCrash(proc: EngineProcess, code: number | null, tail: string[]): Promise<void> {
    if (proc !== this.engine || this.stopping) return
    log.error(`engine berhenti tak terduga (exit ${code}); stderr terakhir:\n  ${tail.slice(-40).join('\n  ')}`)
    await this.restartEngine(tr().engine.crashed(code))
  }

  private async restartEngine(reason: string): Promise<void> {
    const now = Date.now()
    this.engineCrashes = this.engineCrashes.filter((t) => now - t < CRASH_WINDOW_MS)
    if (this.engineCrashes.length >= MAX_CRASH_RESTARTS) {
      this.setStatus('error', tr().engine.gaveUp(reason, MAX_CRASH_RESTARTS))
      return
    }
    const attempt = this.engineCrashes.length
    this.engineCrashes.push(now)
    this.setStatus('restarting', tr().engine.restarting(reason))
    if (this.engine) await this.engine.kill()
    await sleep(BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)])
    if (this.stopping) return
    try {
      if (!this.mongod?.running) throw new Error(tr().engine.mongoNotRunning)
      const info = await this.spawnEngine()
      this.setStatus('ready', undefined, info)
    } catch (e) {
      log.error(`restart engine gagal: ${(e as Error).message}`)
      if (!this.stopping) await this.restartEngine(tr().engine.restartFailed((e as Error).message))
    }
  }

  private async forceStopAll(): Promise<void> {
    await this.engine?.kill()
    await this.mongod?.forceStop()
    this.engine = null
    this.mongod = null
  }

  /** Graceful shutdown: engine → /internal/shutdown (it also shuts mongod down); force-kill leftovers after 15 s. */
  async stop(reason: 'quit' | 'restart' = 'quit'): Promise<void> {
    this.stopping = true
    const engine = this.engine
    const mongod = this.mongod
    const t0 = Date.now()
    if (engine) engine.stopping = true
    mongod?.markStopping()
    if (engine?.running) {
      const accepted = await engine.requestShutdown()
      if (accepted) {
        const [engineExited, mongodExited] = await Promise.all([
          waitExit(engine.child, SHUTDOWN_WAIT_MS),
          mongod ? mongod.waitForExit(SHUTDOWN_WAIT_MS) : Promise.resolve(true),
        ])
        log.info(`shutdown: engine ${engineExited ? 'keluar' : 'TIDAK keluar'}, mongod ${mongodExited ? 'keluar' : 'TIDAK keluar'} (${Date.now() - t0} ms)`)
      }
    }
    await engine?.kill()
    if (mongod?.running) {
      // engine dead or did not stop mongod in time: force (journal recovery on next start)
      await mongod.forceStop()
    }
    this.engine = null
    this.mongod = null
    log.info(`backend berhenti (${reason}, ${Date.now() - t0} ms)`)
    if (reason === 'quit') this.setStatus('stopped')
  }

  /**
   * Stops mongod and the engine for maintenance (moving the data folder). The UI keeps its pages and
   * shows `message` until start() runs again.
   */
  async pause(message: string): Promise<void> {
    this.setStatus('restarting', message)
    await this.stop('restart')
  }

  /** GET a JSON route of the running engine (checks made by the main process). */
  async engineGet<T>(route: string): Promise<T> {
    const engine = this.engine
    if (this.status.state !== 'ready' || !engine?.running || !engine.port) throw new Error(tr().engine.failed)
    const res = await fetch(`${engine.baseUrl}${route}`, {
      headers: { Authorization: `Bearer ${engine.token}` },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`${route}: HTTP ${res.status}`)
    return (await res.json()) as T
  }

  /**
   * Tells the running engine the new UI language (PUT /api/settings app.language). A later engine
   * start gets it as METISCLIP_LANG, so a failure here only delays the engine's messages.
   */
  async applyLanguage(lang: Lang): Promise<void> {
    const engine = this.engine
    if (this.status.state !== 'ready' || !engine?.running || !engine.port) return
    try {
      const res = await fetch(`${engine.baseUrl}/api/settings`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${engine.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ app: { language: lang } }),
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) log.warn(`bahasa engine tidak diperbarui: HTTP ${res.status}`)
    } catch (e) {
      log.warn(`bahasa engine tidak diperbarui: ${(e as Error).message}`)
    }
  }

  /** PIDs of the processes we own (for verification logs). */
  pids(): { engine?: number; mongod?: number } {
    return { engine: this.engine?.child?.pid, mongod: this.mongod?.pid }
  }
}
