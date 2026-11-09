// Small Windows process helpers shared by mongod.ts and engine.ts.
import { execFile, type ChildProcess } from 'node:child_process'
import net from 'node:net'

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Run a command (no shell) and collect stdout. Never throws: returns code + output. */
export function run(
  cmd: string,
  args: string[],
  timeoutMs = 15000,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { windowsHide: true, timeout: timeoutMs, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => {
        // err.code is the exit code (number) for a non-zero exit, or a string such as 'ENOENT' when spawning failed
        const raw: unknown = err ? (err as { code?: unknown }).code : 0
        resolve({ code: typeof raw === 'number' ? raw : err ? 1 : 0, stdout: stdout || '', stderr: stderr || '' })
      },
    )
  })
}

/** PowerShell one-liner (no profile). Arguments must already be safe (caller validates). */
export function powershell(script: string, timeoutMs = 15000) {
  return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], timeoutMs)
}

export async function killTree(pid: number | undefined): Promise<void> {
  if (!pid) return
  if (process.platform === 'win32') {
    await run('taskkill.exe', ['/PID', String(pid), '/T', '/F'], 10000)
  } else {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // already gone
    }
  }
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/** Executable path of a running process (same user), or null. */
export async function processExePath(pid: number): Promise<string | null> {
  if (!Number.isInteger(pid) || pid <= 0) return null
  const r = await powershell(
    `$p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if ($p) { [Console]::Out.Write($p.Path) }`,
  )
  const out = r.stdout.trim()
  if (out) return out
  // Fallback for processes where .Path is empty (e.g. elevated): CIM
  const r2 = await powershell(
    `$p = Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" -ErrorAction SilentlyContinue; if ($p) { [Console]::Out.Write($p.ExecutablePath) }`,
  )
  return r2.stdout.trim() || null
}

/** Wait for a child to exit, up to timeoutMs. Resolves true if it exited. */
export function waitExit(child: ChildProcess | null, timeoutMs: number): Promise<boolean> {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true)
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      child.off('exit', onExit)
      resolve(false)
    }, timeoutMs)
    const onExit = () => {
      clearTimeout(t)
      resolve(true)
    }
    child.once('exit', onExit)
  })
}

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      srv.close(() => resolve(port))
    })
  })
}

export function portIsFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.unref()
    srv.once('error', () => resolve(false))
    srv.listen(port, '127.0.0.1', () => srv.close(() => resolve(true)))
  })
}

export function tcpConnect(port: number, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect({ host: '127.0.0.1', port })
    const done = (ok: boolean) => {
      sock.removeAllListeners()
      sock.destroy()
      resolve(ok)
    }
    sock.setTimeout(timeoutMs, () => done(false))
    sock.once('connect', () => done(true))
    sock.once('error', () => done(false))
  })
}

/** Split a stream into lines and call cb for each. */
export function onLines(stream: NodeJS.ReadableStream | null | undefined, cb: (line: string) => void): void {
  if (!stream) return
  let buf = ''
  stream.setEncoding?.('utf8')
  stream.on('data', (chunk: string | Buffer) => {
    buf += chunk.toString()
    let idx: number
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).replace(/\r$/, '')
      buf = buf.slice(idx + 1)
      cb(line)
    }
    if (buf.length > 64 * 1024) {
      cb(buf)
      buf = ''
    }
  })
  stream.on('end', () => {
    if (buf) cb(buf)
    buf = ''
  })
}
