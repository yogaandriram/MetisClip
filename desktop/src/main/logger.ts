// main.log in <userData>\logs with simple size-based rotation (main.log → main.1.log → … main.3.log).
// Secrets (session token, Mongo URIs with passwords, bearer headers) are redacted before writing.
import fs from 'node:fs'
import path from 'node:path'

const MAX_BYTES = 5 * 1024 * 1024
const KEEP = 3

let logFile: string | null = null
let size = 0
let echo = true
const secrets: string[] = []
const early: string[] = []

const PATTERNS: Array<[RegExp, string]> = [
  [/(token=)[^&\s"']+/gi, '$1***'],
  [/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1***'],
  [/(mongodb:\/\/[^:/\s]+:)[^@\s]+(@)/gi, '$1***$2'],
]

export function addSecret(value: string): void {
  if (value && value.length >= 6 && !secrets.includes(value)) secrets.push(value)
}

function redact(text: string): string {
  let out = text
  for (const [re, rep] of PATTERNS) out = out.replace(re, rep)
  for (const s of secrets) out = out.split(s).join('***')
  return out
}

function rotate(): void {
  if (!logFile) return
  try {
    for (let i = KEEP - 1; i >= 1; i--) {
      const from = logFile.replace(/\.log$/, `.${i}.log`)
      const to = logFile.replace(/\.log$/, `.${i + 1}.log`)
      if (fs.existsSync(from)) fs.renameSync(from, to)
    }
    fs.renameSync(logFile, logFile.replace(/\.log$/, '.1.log'))
  } catch {
    // rotation is best effort (file may be locked by an editor)
  }
  size = 0
}

function write(line: string): void {
  if (echo) {
    try {
      process.stdout.write(line)
    } catch {
      // no console (packaged GUI app)
    }
  }
  if (!logFile) {
    early.push(line)
    return
  }
  try {
    if (size + line.length > MAX_BYTES) rotate()
    fs.appendFileSync(logFile, line, 'utf8')
    size += Buffer.byteLength(line)
  } catch {
    // never crash because of logging
  }
}

export function initLogger(logsDir: string, opts: { echo: boolean }): string {
  fs.mkdirSync(logsDir, { recursive: true })
  logFile = path.join(logsDir, 'main.log')
  echo = opts.echo
  try {
    size = fs.statSync(logFile).size
  } catch {
    size = 0
  }
  const pending = early.splice(0)
  for (const l of pending) write(l)
  return logFile
}

function fmt(level: string, scope: string, args: unknown[]): string {
  const msg = args
    .map((a) => {
      if (a instanceof Error) return a.stack || a.message
      if (typeof a === 'string') return a
      try {
        return JSON.stringify(a)
      } catch {
        return String(a)
      }
    })
    .join(' ')
  return `${new Date().toISOString()} ${level.padEnd(5)} [${scope}] ${redact(msg)}\n`
}

export interface Logger {
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
  debug(...args: unknown[]): void
}

export function createLogger(scope: string): Logger {
  return {
    info: (...a) => write(fmt('INFO', scope, a)),
    warn: (...a) => write(fmt('WARN', scope, a)),
    error: (...a) => write(fmt('ERROR', scope, a)),
    debug: (...a) => {
      if (process.env.METISCLIP_DEBUG) write(fmt('DEBUG', scope, a))
    },
  }
}
