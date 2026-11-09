// Typed client for the local MetisClip engine (FastAPI sidecar).
// This file is the source of truth for request/response shapes — the engine
// (backend/) must match it. See docs/desktop-contract.md §6.

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export type ISODate = string

export interface Agent {
  id: string
  name: string
  niche: string | null
  default_duration: string
  /** Comma-separated, as entered in the UI */
  default_keywords: string | null
  default_video_types: string[]
  timezone: string
  created_at: ISODate
}

export interface AgentInput {
  name: string
  niche?: string | null
  default_duration?: string
  default_keywords?: string | null
  default_video_types?: string[]
  timezone?: string
}

export interface BrandTemplate {
  agent_id: string
  brand_settings: Record<string, any>
  caption_settings: Record<string, any>
  layout_settings: Record<string, any>
  ai_settings: Record<string, any>
  updated_at: ISODate | null
}

export type BrandTemplateInput = Partial<Pick<BrandTemplate, 'brand_settings' | 'caption_settings' | 'layout_settings' | 'ai_settings'>>

export type JobStatus = 'pending' | 'running' | 'interrupted' | 'cancelled' | 'completed' | 'failed'
export type JobStep = 'discovery' | 'analysis' | 'processing'

export interface JobError {
  step: string
  message: string
  at: ISODate
}

export interface Job {
  id: string
  agent_id: string | null
  source: {
    type: 'keyword' | 'url' | 'local_file'
    keywords: string[]
    youtube_url: string | null
    local_file_path: string | null
  }
  config: {
    video_types: string[]
    min_duration_minutes: number
    min_views: number
    clip_duration: string
    max_clips_per_video: number
  }
  status: JobStatus
  current_step: JobStep | null
  progress_pct: number
  total_scenes: number
  processed_scenes: number
  errors: JobError[]
  created_at: ISODate
  started_at: ISODate | null
  finished_at: ISODate | null
}

export interface JobCreate {
  agent_id: string
  source_type: 'keyword' | 'url'
  keywords?: string[]
  youtube_url?: string | null
  video_types?: string[]
  /** '30-45' | '45-60' | '60-75' | '75-90' */
  clip_duration?: string
  max_clips?: number
}

export interface SubtitleWord {
  word: string
  start: number
  end: number
  confidence?: number
}

export type ClipStatus = 'processing' | 'ready' | 'rendering' | 'exported' | 'failed'

export interface ClipFiles {
  /** Paths relative to the data root (forward slashes), or null */
  raw: string | null
  final: string | null
  thumbnail: string | null
}

export interface Clip {
  id: string
  agent_id: string | null
  job_id: string | null
  source_video_id: string | null
  youtube_id: string | null
  start_time: number
  end_time: number
  duration_seconds: number
  viral_score: number
  hook_text: string
  tags: string[]
  rationale: string
  status: ClipStatus
  files: ClipFiles
  subtitle_data: { clip_id: string; words: SubtitleWord[] }
  /** Per-clip override of the brand caption settings ({} = inherit) */
  subtitle_style: Record<string, any>
  created_at: ISODate
  updated_at: ISODate
}

export interface ClipDetail {
  clip: Clip
  /** brand caption_settings merged with clip.subtitle_style */
  effective_style: Record<string, any>
  brand_template: BrandTemplate | null
}

export interface SubtitleUpdate {
  words?: SubtitleWord[]
  style?: Record<string, any>
  reset_style?: boolean
}

export type RenderStatus = 'queued' | 'rendering' | 'completed' | 'failed' | 'cancelled'

export interface RenderJob {
  id: string
  clip_id: string
  status: RenderStatus
  progress_pct: number
  /** Absolute path of the rendered file when completed */
  output_path: string | null
  error: string | null
  created_at: ISODate
  finished_at: ISODate | null
}

export interface ExportResult {
  dest_dir: string
  exported: { clip_id: string; path: string }[]
  skipped: { clip_id: string; reason: string }[]
}

export type LlmPreset = '9router' | 'groq' | 'custom'
export type EncoderSetting = 'auto' | 'libx264' | 'h264_nvenc' | 'h264_qsv' | 'h264_amf'

export interface Settings {
  export_dir: string
  cache_limit_gb: number
  llm: { preset: LlmPreset; base_url: string; model: string }
  whisper: { provider: 'groq'; model: string }
  processing: { max_workers: number; encoder: EncoderSetting }
  render: { concurrency: number }
  ytdlp: { player_client: string; cookies_file: string | null }
  db: { wiredtiger_cache_gb: number }
  app: { close_to_tray: boolean; auto_update: boolean; language: 'id' }
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] }

export type SecretName = 'llm_api_key' | 'groq_api_key' | 'youtube_api_key'

export interface SystemInfo {
  version: string
  env: 'dev' | 'production'
  data_root: string
  library_dir: string
  export_dir: string
  /** %APPDATA%\MetisClip\logs (engine.log, render.log, mongod.log, main.log) */
  logs_dir: string
  mongo: { ok: boolean; version: string | null }
}

export interface SystemCheckItem {
  key: string
  label: string
  ok: boolean
  version?: string | null
  detail?: string | null
}

export interface SystemCheck {
  items: SystemCheckItem[]
  encoders: string[]
  cpu_count: number
  ram_gb: number
}

/** POST /api/system/update-ytdlp (409 while a job is running) */
export interface YtdlpUpdateResult {
  ok: boolean
  updated: boolean
  version: string | null
  message: string
}

export interface StorageInfo {
  data_root: string
  drive_free_bytes: number
  drive_total_bytes: number
  db_bytes: number
  library_bytes: number
  cache_bytes: number
  backups_bytes: number
  per_agent: { agent_id: string; name: string; bytes: number }[]
}

export interface BackupInfo {
  name: string
  path: string
  size_bytes: number
  created_at: ISODate
}

/** Same shape as the old Next.js /api/dashboard/stats route */
export interface DashboardStats {
  videosProcessed: number
  clipsGenerated: number
  potentialViews: number
}

export type EngineEvent =
  | {
      type: 'job.progress'
      id: string
      agent_id: string | null
      status: JobStatus
      current_step: JobStep | null
      progress_pct: number
      total_scenes: number
      processed_scenes: number
      message?: string
    }
  | { type: 'job.status'; id: string; agent_id: string | null; status: JobStatus; error?: string | null }
  | { type: 'clip.created'; id: string; job_id: string | null; agent_id: string | null }
  | { type: 'clip.updated'; id: string }
  | { type: 'clip.deleted'; id: string }
  | { type: 'render.progress'; id: string; clip_id: string; status: RenderStatus; progress_pct: number }
  | { type: 'render.status'; id: string; clip_id: string; status: RenderStatus; output_path?: string | null; error?: string | null }
  | { type: 'system.notice'; level: 'info' | 'warning' | 'error'; message: string }

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

export class EngineError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'EngineError'
  }
}

let cachedInfo: MetisEngineInfo | null = null
let bridgeSubscribed = false

function subscribeBridge() {
  if (bridgeSubscribed || typeof window === 'undefined' || !window.metis) return
  bridgeSubscribed = true
  window.metis.onEngineStatus((s) => {
    if (s.state === 'ready' && s.info) cachedInfo = s.info
    else if (s.state !== 'ready') cachedInfo = null
  })
}

/** Resolves the engine base URL + token (waits for Electron to finish starting it). */
export async function getEngineInfo(): Promise<MetisEngineInfo> {
  if (cachedInfo) return cachedInfo
  if (typeof window !== 'undefined' && window.metis) {
    subscribeBridge()
    cachedInfo = await window.metis.getEngineInfo()
    return cachedInfo
  }
  // Browser dev fallback (next dev opened in a normal browser, engine started by hand)
  cachedInfo = {
    baseUrl: (process.env.NEXT_PUBLIC_ENGINE_URL || 'http://127.0.0.1:8000').replace(/\/$/, ''),
    token: process.env.NEXT_PUBLIC_ENGINE_TOKEN || 'dev-token',
  }
  return cachedInfo
}

/** Synchronous access for URL helpers. Null until getEngineInfo() has resolved once. */
export function getEngineInfoSync(): MetisEngineInfo | null {
  return cachedInfo
}

function requireInfo(): MetisEngineInfo {
  if (!cachedInfo) throw new EngineError(0, 'Engine belum siap')
  return cachedInfo
}

type Query = Record<string, string | number | boolean | null | undefined>

function qs(query?: Query): string {
  if (!query) return ''
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue
    p.set(k, String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

async function request<T>(method: string, path: string, opts: { query?: Query; body?: any; form?: FormData } = {}): Promise<T> {
  const info = await getEngineInfo()
  const headers: Record<string, string> = { Authorization: `Bearer ${info.token}` }
  let body: BodyInit | undefined
  if (opts.form) {
    body = opts.form
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }
  let res: Response
  try {
    res = await fetch(`${info.baseUrl}${path}${qs(opts.query)}`, { method, headers, body, cache: 'no-store' })
  } catch {
    throw new EngineError(0, 'Tidak dapat terhubung ke engine MetisClip')
  }
  if (!res.ok) {
    let detail = `Permintaan gagal (HTTP ${res.status})`
    try {
      const data = await res.json()
      if (typeof data?.detail === 'string') detail = data.detail
      else if (Array.isArray(data?.detail)) detail = data.detail.map((d: any) => d?.msg).filter(Boolean).join('; ') || detail
    } catch {
      /* not JSON */
    }
    throw new EngineError(res.status, detail)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

// ---------------------------------------------------------------------------
// URL helpers (require getEngineInfo() to have resolved once)
// ---------------------------------------------------------------------------

/** URL for a clip media file. `version` busts the browser cache (use clip.updated_at). */
export function clipMediaUrl(clipId: string, kind: 'raw' | 'final' | 'thumbnail', version?: string | number): string {
  const info = requireInfo()
  return `${info.baseUrl}/api/clips/${encodeURIComponent(clipId)}/media/${kind}${qs({ token: info.token, v: version })}`
}

/** URL for any file under the data root, given its relative path. */
export function fileUrl(relativePath: string): string {
  const info = requireInfo()
  const clean = relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
  const encoded = clean.split('/').map(encodeURIComponent).join('/')
  return `${info.baseUrl}/api/files/${encoded}${qs({ token: info.token })}`
}

/** Turns an `asset://<relative path>` value into a URL; returns other values unchanged. */
export function resolveAsset(value: string | null | undefined): string {
  if (!value) return ''
  if (value.startsWith('asset://')) return fileUrl(value.slice('asset://'.length))
  return value
}

/** Absolute filesystem path for a data-root-relative path (for Explorer actions). */
export function toAbsolutePath(dataRoot: string, relativePath: string): string {
  const root = dataRoot.replace(/[\\/]+$/, '')
  return `${root}\\${relativePath.replace(/\//g, '\\')}`
}

// ---------------------------------------------------------------------------
// Events (WebSocket with auto-reconnect)
// ---------------------------------------------------------------------------

type EventHandler = (e: EngineEvent) => void
const handlers = new Set<EventHandler>()
let socket: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectDelay = 1000

async function connectSocket() {
  if (typeof window === 'undefined' || socket || handlers.size === 0) return
  let info: MetisEngineInfo
  try {
    info = await getEngineInfo()
  } catch {
    scheduleReconnect()
    return
  }
  const wsUrl = `${info.baseUrl.replace(/^http/, 'ws')}/ws/events${qs({ token: info.token })}`
  const ws = new WebSocket(wsUrl)
  socket = ws
  ws.onopen = () => {
    reconnectDelay = 1000
  }
  ws.onmessage = (msg) => {
    try {
      const event = JSON.parse(msg.data) as EngineEvent
      handlers.forEach((h) => {
        try {
          h(event)
        } catch (err) {
          console.error('[engine] event handler failed', err)
        }
      })
    } catch {
      /* ignore malformed */
    }
  }
  ws.onclose = () => {
    if (socket === ws) socket = null
    // The engine may have restarted on a new port: drop the cached info so it is re-resolved
    cachedInfo = null
    scheduleReconnect()
  }
  ws.onerror = () => {
    try {
      ws.close()
    } catch {
      /* noop */
    }
  }
}

function scheduleReconnect() {
  if (reconnectTimer || handlers.size === 0) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connectSocket()
  }, reconnectDelay)
  reconnectDelay = Math.min(reconnectDelay * 2, 10000)
}

/** Subscribe to engine events. Returns an unsubscribe function. */
export function subscribeEvents(handler: EventHandler): () => void {
  handlers.add(handler)
  connectSocket()
  return () => {
    handlers.delete(handler)
    if (handlers.size === 0 && socket) {
      const s = socket
      socket = null
      s.close()
    }
  }
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export const api = {
  health: () => request<{ status: string; version: string; mongo: boolean }>('GET', '/health'),

  system: {
    info: () => request<SystemInfo>('GET', '/api/system/info'),
    check: () => request<SystemCheck>('GET', '/api/system/check'),
    storage: () => request<StorageInfo>('GET', '/api/system/storage'),
    backup: () => request<{ backup: BackupInfo }>('POST', '/api/system/backup'),
    backups: () => request<{ backups: BackupInfo[] }>('GET', '/api/system/backups'),
    updateYtdlp: () => request<YtdlpUpdateResult>('POST', '/api/system/update-ytdlp'),
  },

  settings: {
    get: () => request<{ settings: Settings }>('GET', '/api/settings'),
    update: (patch: DeepPartial<Settings>) => request<{ settings: Settings }>('PUT', '/api/settings', { body: patch }),
  },

  secrets: {
    status: () => request<{ secrets: Record<SecretName, boolean> }>('GET', '/api/secrets'),
    set: (name: SecretName, value: string) => request<{ ok: true }>('PUT', `/api/secrets/${name}`, { body: { value } }),
    remove: (name: SecretName) => request<{ ok: true }>('DELETE', `/api/secrets/${name}`),
    /** Tests `value` if given, otherwise the stored secret */
    test: (name: SecretName, value?: string) => request<{ ok: boolean; message: string }>('POST', `/api/secrets/${name}/test`, { body: value ? { value } : {} }),
  },

  agents: {
    list: () => request<{ agents: Agent[] }>('GET', '/api/agents'),
    create: (input: AgentInput) => request<{ agent: Agent }>('POST', '/api/agents', { body: input }),
    update: (id: string, patch: Partial<AgentInput>) => request<{ agent: Agent }>('PUT', `/api/agents/${id}`, { body: patch }),
    remove: (id: string, deleteFiles = false) => request<{ ok: true }>('DELETE', `/api/agents/${id}`, { query: { delete_files: deleteFiles } }),
    getBrandTemplate: (id: string) => request<{ brand_template: BrandTemplate | null }>('GET', `/api/agents/${id}/brand-template`),
    updateBrandTemplate: (id: string, patch: BrandTemplateInput) =>
      request<{ brand_template: BrandTemplate }>('PUT', `/api/agents/${id}/brand-template`, { body: patch }),
    /** Uploads a brand asset; store the returned `value` (asset://…) in brand_settings */
    uploadBrandAsset: (id: string, file: File, kind: string) => {
      const form = new FormData()
      form.append('file', file)
      form.append('kind', kind)
      return request<{ value: string; path: string }>('POST', `/api/agents/${id}/brand-assets`, { form })
    },
  },

  jobs: {
    list: (query: { agent_id?: string; status?: JobStatus; limit?: number } = {}) => request<{ jobs: Job[] }>('GET', '/api/jobs', { query }),
    get: (id: string) => request<{ job: Job }>('GET', `/api/jobs/${id}`),
    create: (input: JobCreate) => request<{ job: Job }>('POST', '/api/jobs', { body: input }),
    cancel: (id: string) => request<{ job: Job }>('POST', `/api/jobs/${id}/cancel`),
    resume: (id: string) => request<{ job: Job }>('POST', `/api/jobs/${id}/resume`),
    remove: (id: string) => request<{ ok: true }>('DELETE', `/api/jobs/${id}`),
  },

  clips: {
    list: (query: { agent_id?: string; job_id?: string; status?: ClipStatus } = {}) => request<{ clips: Clip[] }>('GET', '/api/clips', { query }),
    get: (id: string) => request<ClipDetail>('GET', `/api/clips/${id}`),
    updateSubtitles: (id: string, update: SubtitleUpdate) => request<{ clip: Clip }>('PUT', `/api/clips/${id}/subtitles`, { body: update }),
    remove: (id: string, deleteFiles = true) => request<{ ok: true }>('DELETE', `/api/clips/${id}`, { query: { delete_files: deleteFiles } }),
    render: (id: string) => request<{ render_job: RenderJob }>('POST', `/api/clips/${id}/render`),
    export: (clipIds: string[], destDir?: string) => request<ExportResult>('POST', '/api/clips/export', { body: { clip_ids: clipIds, dest_dir: destDir } }),
  },

  renderJobs: {
    list: (query: { clip_id?: string; status?: RenderStatus } = {}) => request<{ render_jobs: RenderJob[] }>('GET', '/api/render-jobs', { query }),
    get: (id: string) => request<{ render_job: RenderJob }>('GET', `/api/render-jobs/${id}`),
    cancel: (id: string) => request<{ render_job: RenderJob }>('POST', `/api/render-jobs/${id}/cancel`),
  },

  dashboard: {
    stats: (agentId: string) => request<DashboardStats>('GET', '/api/dashboard/stats', { query: { agent_id: agentId } }),
  },
}
