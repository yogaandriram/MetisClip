// app://metisclip/ → static Next.js export (docs/desktop-contract.md §5).
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { net, protocol } from 'electron'
import { createLogger } from './logger'

const log = createLogger('protocol')

export const APP_SCHEME = 'app'
export const APP_HOST = 'metisclip'

/** Must be called before app 'ready'. */
export function registerSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
    },
  ])
}

/**
 * CSP for the packaged UI. The engine port changes per launch (and on engine restart), so
 * 127.0.0.1 is allowed on any port; nothing else on the network except https images (YouTube thumbnails).
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https: http://127.0.0.1:*",
  "media-src 'self' blob: data: http://127.0.0.1:*",
  "connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:*",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.avif': 'image/avif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.wasm': 'application/wasm',
}

function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile()
  } catch {
    return false
  }
}

/** Resolution: "/" suffix → index.html; file → it; p/index.html; p.html; else 404.html. */
export function resolveUiFile(uiDir: string, urlPath: string): { file: string | null; status: number } {
  let rel: string
  try {
    rel = decodeURIComponent(urlPath)
  } catch {
    return { file: null, status: 400 }
  }
  if (rel.includes('\0')) return { file: null, status: 400 }
  const root = path.resolve(uiDir)
  const inside = (p: string) => p === root || p.startsWith(root + path.sep)
  const join = (r: string) => path.resolve(root, '.' + path.posix.normalize('/' + r.replace(/\\/g, '/')))

  const candidates: string[] = []
  if (rel.endsWith('/')) {
    candidates.push(join(rel + 'index.html'))
  } else {
    candidates.push(join(rel), join(rel + '/index.html'), join(rel + '.html'))
  }
  for (const c of candidates) {
    if (inside(c) && isFile(c)) return { file: c, status: 200 }
  }
  const notFound = path.join(root, '404.html')
  return { file: isFile(notFound) ? notFound : null, status: 404 }
}

export function registerAppProtocol(uiDir: string): void {
  if (!fs.existsSync(path.join(uiDir, 'index.html'))) {
    log.error(`UI tidak ditemukan: ${path.join(uiDir, 'index.html')}`)
  }
  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url)
    if (url.host !== APP_HOST) return new Response('Not found', { status: 404 })
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 })

    const { file, status } = resolveUiFile(uiDir, url.pathname)
    if (!file) {
      log.warn(`404 ${url.pathname}`)
      return new Response('Not found', { status: status === 400 ? 400 : 404, headers: { 'content-type': 'text/plain' } })
    }
    if (status === 404) log.warn(`404 ${url.pathname} → 404.html`)

    const upstream = await net.fetch(pathToFileURL(file).toString())
    const headers = new Headers()
    const ext = path.extname(file).toLowerCase()
    headers.set('content-type', MIME[ext] || upstream.headers.get('content-type') || 'application/octet-stream')
    headers.set('x-content-type-options', 'nosniff')
    if (ext === '.html') {
      headers.set('content-security-policy', CSP)
      headers.set('cache-control', 'no-cache')
    }
    return new Response(request.method === 'HEAD' ? null : upstream.body, { status, headers })
  })
  log.info(`app://${APP_HOST}/ → ${uiDir}`)
}
