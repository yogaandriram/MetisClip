// Bundled mongod lifecycle (docs/desktop-contract.md §2): free port, orphan-lock recovery,
// TCP readiness, crash restart, forced stop as last resort (graceful shutdown is sent by the engine).
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createLogger } from './logger'
import { freePort, isAlive, killTree, onLines, portIsFree, processExePath, sleep, tcpConnect, waitExit } from './procs'

const log = createLogger('mongod')

const READY_TIMEOUT_MS = 30000
const MAX_START_ATTEMPTS = 3
const MAX_CRASH_RESTARTS = 3
const CRASH_WINDOW_MS = 5 * 60 * 1000

export interface MongodOptions {
  exe: string
  dataRoot: string
  logsDir: string
  cacheSizeGb?: number
  /** called when mongod died and could not be brought back */
  onFatal: (message: string) => void
  /** called when mongod was restarted after a crash; portChanged → the engine must be restarted */
  onRestarted: (port: number, portChanged: boolean) => void
}

export class MongodManager {
  private child: ChildProcess | null = null
  private stopping = false
  private crashTimes: number[] = []
  port = 0

  constructor(private opts: MongodOptions) {}

  get pid(): number | undefined {
    return this.child?.pid
  }

  get running(): boolean {
    return !!this.child && this.child.exitCode === null && this.child.signalCode === null
  }

  private get dbPath(): string {
    return path.join(this.opts.dataRoot, 'db')
  }

  private get logPath(): string {
    return path.join(this.opts.logsDir, 'mongod.log')
  }

  /** Kill a leftover mongod (from a crashed session) that still holds <db>\mongod.lock — only if it is OUR exe. */
  async recoverOrphan(): Promise<void> {
    const lockFile = path.join(this.dbPath, 'mongod.lock')
    let content = ''
    try {
      content = fs.readFileSync(lockFile, 'utf8').trim()
    } catch {
      return
    }
    if (!content) return
    const pid = Number.parseInt(content, 10)
    if (!Number.isInteger(pid) || pid <= 0) return
    if (pid === this.child?.pid) return
    if (!isAlive(pid)) {
      log.info(`mongod.lock berisi PID ${pid} yang sudah mati (shutdown tidak bersih); journal recovery akan berjalan`)
      return
    }
    const exe = await processExePath(pid)
    const ours = path.resolve(this.opts.exe).toLowerCase()
    if (!exe) {
      log.warn(`mongod.lock dipegang PID ${pid}, path executable tidak bisa dibaca; tidak dihentikan`)
      return
    }
    if (path.resolve(exe).toLowerCase() !== ours) {
      log.warn(`mongod.lock dipegang PID ${pid} (${exe}) yang bukan mongod milik MetisClip; tidak dihentikan`)
      return
    }
    log.warn(`mongod yatim (PID ${pid}) masih memegang ${lockFile}; dihentikan`)
    await killTree(pid)
    for (let i = 0; i < 50 && isAlive(pid); i++) await sleep(200)
    if (isAlive(pid)) log.error(`mongod yatim PID ${pid} belum berhenti`)
    else log.info(`mongod yatim PID ${pid} sudah berhenti`)
  }

  /** Start mongod and resolve with the port once it accepts TCP connections. */
  async start(preferredPort?: number): Promise<number> {
    if (!fs.existsSync(this.opts.exe)) {
      throw new Error(`mongod.exe tidak ditemukan di ${this.opts.exe}. Jalankan scripts\\fetch-binaries.ps1 (dev) atau instal ulang aplikasi.`)
    }
    fs.mkdirSync(this.dbPath, { recursive: true })
    fs.mkdirSync(this.opts.logsDir, { recursive: true })
    this.stopping = false
    await this.recoverOrphan()

    let lastError = ''
    for (let attempt = 1; attempt <= MAX_START_ATTEMPTS; attempt++) {
      let port: number
      if (attempt === 1 && preferredPort && (await portIsFree(preferredPort))) port = preferredPort
      else port = await freePort()
      try {
        this.stopping = false
        await this.spawnOnce(port)
        this.port = port
        return port
      } catch (e) {
        lastError = (e as Error).message
        log.warn(`percobaan ${attempt}/${MAX_START_ATTEMPTS} gagal: ${lastError}`)
        await this.forceStop()
        if (attempt < MAX_START_ATTEMPTS) await this.recoverOrphan()
      }
    }
    throw new Error(`MongoDB gagal dijalankan: ${lastError}`)
  }

  private spawnOnce(port: number): Promise<void> {
    const args = [
      '--dbpath', this.dbPath,
      '--bind_ip', '127.0.0.1',
      '--port', String(port),
      '--auth',
      '--wiredTigerCacheSizeGB', String(this.opts.cacheSizeGb ?? 0.25),
      '--logpath', this.logPath,
      '--logappend',
      '--setParameter', 'diagnosticDataCollectionEnabled=false',
    ]
    log.info(`start: ${this.opts.exe} ${args.join(' ')}`)
    const child = spawn(this.opts.exe, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: path.dirname(this.opts.exe),
    })
    this.child = child
    onLines(child.stdout, (l) => l.trim() && log.info(`[stdout] ${l}`))
    onLines(child.stderr, (l) => l.trim() && log.warn(`[stderr] ${l}`))

    return new Promise<void>((resolve, reject) => {
      let settled = false
      const started = Date.now()
      const onEarlyExit = (code: number | null) => {
        if (settled) return
        settled = true
        reject(new Error(`mongod berhenti saat start (exit ${code}). ${this.lastLogError() || ''}`.trim()))
      }
      child.once('exit', onEarlyExit)
      child.once('error', (err) => {
        if (settled) return
        settled = true
        reject(err)
      })
      const poll = async () => {
        while (!settled) {
          if (await tcpConnect(port, 500)) {
            if (settled) return
            settled = true
            child.off('exit', onEarlyExit)
            child.on('exit', (code, signal) => this.handleExit(child, code, signal))
            log.info(`siap di 127.0.0.1:${port} (pid ${child.pid}, ${Date.now() - started} ms)`)
            resolve()
            return
          }
          if (Date.now() - started > READY_TIMEOUT_MS) {
            settled = true
            reject(new Error(`mongod tidak merespons dalam ${READY_TIMEOUT_MS / 1000} detik`))
            return
          }
          await sleep(200)
        }
      }
      void poll()
    })
  }

  /** Last error/fatal message from mongod.log (JSON log lines), for user-facing diagnostics. */
  private lastLogError(): string | null {
    try {
      const fd = fs.openSync(this.logPath, 'r')
      const size = fs.fstatSync(fd).size
      const len = Math.min(size, 64 * 1024)
      const buf = Buffer.alloc(len)
      fs.readSync(fd, buf, 0, len, size - len)
      fs.closeSync(fd)
      const lines = buf.toString('utf8').split(/\r?\n/).reverse()
      for (const line of lines) {
        if (!line.startsWith('{')) continue
        try {
          const j = JSON.parse(line) as { s?: string; msg?: string; attr?: Record<string, unknown> }
          if (j.s === 'F' || j.s === 'E') {
            const attr = j.attr ? JSON.stringify(j.attr) : ''
            return `${j.msg ?? ''} ${attr}`.trim().slice(0, 400)
          }
        } catch {
          // partial line
        }
      }
    } catch {
      // no log yet
    }
    return null
  }

  private async handleExit(child: ChildProcess, code: number | null, signal: NodeJS.Signals | null): Promise<void> {
    if (child !== this.child) return
    if (this.stopping) {
      log.info(`berhenti (exit ${code}${signal ? `, ${signal}` : ''})`)
      return
    }
    log.error(`berhenti tak terduga (exit ${code}${signal ? `, ${signal}` : ''}). ${this.lastLogError() || ''}`)
    const now = Date.now()
    this.crashTimes = this.crashTimes.filter((t) => now - t < CRASH_WINDOW_MS)
    if (this.crashTimes.length >= MAX_CRASH_RESTARTS) {
      this.opts.onFatal('MongoDB berhenti berulang kali. Buka folder log untuk detailnya.')
      return
    }
    this.crashTimes.push(now)
    const oldPort = this.port
    try {
      await sleep(1000)
      const port = await this.start(oldPort)
      this.opts.onRestarted(port, port !== oldPort)
    } catch (e) {
      this.opts.onFatal((e as Error).message)
    }
  }

  /** Call before asking the engine to shut down, so the expected exit is not treated as a crash. */
  markStopping(): void {
    this.stopping = true
  }

  /** Mark as stopping (graceful shutdown is requested by the engine) and wait for exit. */
  async waitForExit(timeoutMs: number): Promise<boolean> {
    this.stopping = true
    return waitExit(this.child, timeoutMs)
  }

  async forceStop(): Promise<void> {
    this.stopping = true
    const child = this.child
    if (!child || child.exitCode !== null || child.signalCode !== null) return
    log.warn(`paksa berhenti (taskkill) pid ${child.pid}`)
    await killTree(child.pid)
    await waitExit(child, 5000)
  }
}
