// Typed client for the local MetisClip engine (FastAPI sidecar).
// This file is the source of truth for request/response shapes — the engine
// (backend/) must match it. See docs/desktop-contract.md §6.
import { tm, type Lang } from './i18n'

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export type ISODate = string

/** How the AI made a template: its status, why it chose what it did, and what is left to the user. */
export type TemplateDesignStatus = 'running' | 'done' | 'failed' | 'basic' | 'skipped'

/** Something the AI could not do for the template (worded by the frontend, `brand.design.notes`). */
export interface TemplateDesignNote {
  kind: 'logo' | 'credit_layout' | 'credit_smart' | 'subtitles_forbidden' | 'visual_rules' | string
  params: Record<string, string | number>
}

export interface TemplateDesign {
  status: TemplateDesignStatus
  /** Made with the campaign: designed again when its brief changes, until the user edits it */
  auto: boolean
  edited: boolean
  message: string
  provider: string | null
  model: string | null
  reasons: { part: 'caption' | 'layout' | 'colors' | 'zoom' | 'subtitles'; text: string; quote: string }[]
  notes: TemplateDesignNote[]
  at: ISODate | null
}

/** A named brand template of one campaign (every campaign holds one or more, one of them its default). */
export interface BrandTemplate {
  id: string
  name: string
  brand_settings: Record<string, any>
  caption_settings: Record<string, any>
  layout_settings: Record<string, any>
  ai_settings: Record<string, any>
  /** The campaign it belongs to */
  campaign_id: string | null
  /** The AI design (null: made by hand or before AI designs) */
  design: TemplateDesign | null
  created_at: ISODate | null
  updated_at: ISODate | null
  campaign_name?: string
  /** Its campaign's default template */
  is_default?: boolean
  /** Clips that use this template */
  clip_count?: number
}

export type BrandTemplateInput = Partial<Pick<BrandTemplate, 'name' | 'brand_settings' | 'caption_settings' | 'layout_settings' | 'ai_settings'>>

// ---------------------------------------------------------------------------
// Campaigns (backend/services/campaigns.py, models/documents.py Brief)
// ---------------------------------------------------------------------------

export type BriefRuleType = 'must' | 'must_not' | 'prefer'
/** selection: choosing moments · visual: how the video looks · post: the post text · manual: checked by hand */
export type BriefRuleStage = 'selection' | 'visual' | 'post' | 'manual'
export type BriefRequirement = 'required' | 'optional' | 'forbidden'

export interface BriefRule {
  id: string
  text: string
  type: BriefRuleType
  stage: BriefRuleStage
  /** Where the brief says so, e.g. "[2] Wajib sebut Tokopedia" */
  source: string
}

export interface Brief {
  summary: string
  platforms: string[]
  /** YYYY-MM-DD or null */
  deadline: string | null
  allowed_sources: string[]
  /** Topics / moments to look for (judged by the AI) */
  focus: string[]
  /** Words or names that must be heard in the clip (checked in the transcript) */
  must_include: string[]
  /** Words that must not be heard (checked in the transcript) */
  banned_words: string[]
  /** Topics to stay away from (judged by the AI) */
  avoid: string[]
  tone: string
  audience: string
  language: string
  duration: { min: number | null; max: number | null }
  /** Clips the campaign wants in total (0 = no target) */
  clips_target: number
  /** Clips per source video (0 = no limit) */
  max_per_video: number
  visual: { subtitles: BriefRequirement; logo: BriefRequirement; credit: BriefRequirement; notes: string[] }
  post: { hashtags: string[]; mentions: string[]; cta: string; disclosure: string; caption_rules: string[] }
  rules: BriefRule[]
  payout: string
  submission: string
  /** What the brief leaves unclear */
  questions: string[]
}

export type CampaignSourceKind = 'text' | 'file' | 'image'

/** One piece of the brief as the user gave it */
export interface CampaignSource {
  id: string
  kind: CampaignSourceKind
  name: string
  /** Relative to the data root (fileUrl) */
  path: string | null
  mime: string | null
  size: number
  /** Typed text, or the text read from the file */
  text: string
  pages: number
  /** Scanned PDF pages rendered to PNG */
  images: string[]
  added_at: ISODate
}

export type CampaignParseStatus = 'idle' | 'running' | 'done' | 'failed'

export interface CampaignDraft {
  brief: Brief
  name: string
  client: string
  /** Pieces the AI could not read */
  unreadable: string[]
  at: ISODate
}

export interface Campaign {
  id: string
  name: string
  client: string
  status: 'active' | 'archived'
  /** Its default brand template (one of its own templates) */
  brand_template_id: string | null
  /** Missing in list responses (see source_count) */
  sources?: CampaignSource[]
  source_count?: number
  brief: Brief
  /** The last "understand the brief" result, waiting for review (missing in list responses) */
  draft?: CampaignDraft | null
  /** List responses only: a draft is waiting for review */
  has_draft?: boolean
  parse: { status: CampaignParseStatus; message?: string; provider?: string; model?: string; used_ocr?: boolean; used_vision?: boolean; at?: ISODate }
  version: number
  clip_count: number
  exported_count: number
  created_at: ISODate
  updated_at: ISODate
}

export interface CampaignInput {
  name?: string
  client?: string
  status?: 'active' | 'archived'
  /** Make one of its own templates the default */
  brand_template_id?: string
  /** A reviewed brief: replaces the current one (version + 1) and clears the draft */
  brief?: Brief
}

export type BriefCheckStatus = 'ok' | 'fail' | 'warn' | 'manual' | 'ai' | 'info'
export type BriefCheckKind =
  | 'fit' | 'duration' | 'required_words' | 'banned_words' | 'subtitles' | 'logo' | 'credit'
  | 'post_copy' | 'hashtags' | 'mentions' | 'disclosure' | 'deadline' | 'rule'

/** One line of a clip's brief checklist (backend/services/brief_check.py); worded by the frontend */
export interface BriefCheckItem {
  id: string
  kind: BriefCheckKind
  status: BriefCheckStatus
  params: Record<string, any>
}

export interface BriefCheckSummary {
  ok: number
  fail: number
  warn: number
  ai: number
  info: number
  manual_open: number
  manual_done: number
  ready: boolean
}

export interface BriefCheck {
  campaign_id: string
  version: number
  items: BriefCheckItem[]
  summary: BriefCheckSummary
}

/** Text for posting a campaign clip (MetisClip never posts; the user copies it) */
export interface PostCopy {
  title: string
  caption: string
  hashtags: string[]
  mentions: string[]
  disclosure: string
  generated_at?: ISODate | null
  /** ai: written by the LLM · basic: from the brief without the LLM · edited: changed by the user */
  source?: 'ai' | 'basic' | 'edited'
}

export type JobStatus = 'pending' | 'running' | 'interrupted' | 'cancelled' | 'completed' | 'failed'
export type JobStep = 'discovery' | 'analysis' | 'processing'

export interface JobError {
  step: string
  message: string
  at: ISODate
}

export interface Job {
  id: string
  source: {
    /** 'url' | 'local_file'. Databases from before the keyword search was removed may hold other types. */
    type: string
    youtube_url: string | null
    local_file_path: string | null
  }
  config: {
    clip_duration: string
    max_clips_per_video: number
    /** The automatic layout by content for its clips (null or missing: each campaign's brand template) */
    smart_layout?: boolean | null
    /** Moments the user chose (seconds of the video), for a manual job */
    manual_ranges?: ClipRange[]
  }
  /** 'ai': the Analyzer chose the moments; 'manual': the user did; 'recut': an existing clip cut again */
  kind: JobKind
  /** A recut's clip */
  recut_clip_id: string | null
  /** Campaigns the clips are made for (the brief snapshot stays in the engine) */
  campaign_ids: string[]
  campaigns: { id: string; name: string; version: number }[]
  /** Extra instructions for this video only */
  note: string
  status: JobStatus
  current_step: JobStep | null
  progress_pct: number
  total_scenes: number
  processed_scenes: number
  /** Completed jobs only: clips that failed; resuming the job processes just those */
  failed_clips: number
  errors: JobError[]
  /** What a running job does or waits for now (its last job.progress message, in the UI language); null otherwise */
  activity: { message: string; at: ISODate } | null
  created_at: ISODate
  started_at: ISODate | null
  finished_at: ISODate | null
}

export type JobKind = 'ai' | 'manual' | 'recut'

/** A moment in seconds of the source video */
export interface ClipRange {
  start: number
  end: number
}

/** A YouTube playlist's videos (POST /api/jobs/playlist): at most 50, private and deleted ones left out */
export interface PlaylistInfo {
  playlist_id: string
  title: string
  channel: string
  entries: { youtube_id: string; youtube_url: string; title: string; duration_seconds: number | null; channel: string }[]
  /** The playlist has more videos than the 50 listed */
  more: boolean
}

/** Exactly one source: YouTube link(s), or a video file on this PC (used in place, never copied). */
export interface JobCreate {
  youtube_url?: string
  /** Several YouTube links: one job per video (the same video once), with the same settings; at most 50 */
  youtube_urls?: string[]
  /** Absolute path; the engine checks that it is a readable video with sound */
  local_file_path?: string
  /** '30-45' | '45-60' | '60-75' | '75-90', or a custom 'lo-hi' between 10 and 180 seconds (at least 5 apart) */
  clip_duration?: string
  max_clips?: number
  /** 1 to 5 active campaigns (required): each brief guides the choice, and each campaign gets its own clips */
  campaign_ids: string[]
  note?: string
  /** Turns the automatic layout by content on or off for the job's clips; null or missing follows the brand templates */
  smart_layout?: boolean | null
  /** Moments the user chose (5 to 180 s each, at most 20): the Analyzer is skipped, each becomes a clip per campaign */
  manual_ranges?: ClipRange[]
  /** Move those edges to the nearest sentence boundary (default true) */
  snap_edges?: boolean
}

export interface SubtitleWord {
  word: string
  start: number
  end: number
  confidence?: number
  /** AI subtitle settings: highlighted keyword (editable per word) */
  keyword?: boolean
  /** AI subtitle settings: emoji shown above the caption from this word on */
  emoji?: string | null
}

/** Brand template ai_settings (clip override in subtitle_style.ai) */
export interface AiSubtitleSettings {
  fillerWords: boolean
  pauses: boolean
  keywords: boolean
  emojis: boolean
}

export type ClipStatus = 'processing' | 'ready' | 'rendering' | 'exported' | 'failed'

export interface ClipFiles {
  /** Paths relative to the data root (forward slashes), or null */
  raw: string | null
  final: string | null
  thumbnail: string | null
  /** The clip in the source video's own ratio (podcast layout); null for clips made before it was kept */
  source?: string | null
  /** Face scan of source (duo and auto layouts); null for clips made before it was kept */
  faces?: string | null
}

export interface Clip {
  id: string
  job_id: string | null
  source_video_id: string | null
  youtube_id: string | null
  start_time: number
  end_time: number
  duration_seconds: number
  viral_score: number
  hook_text: string
  tags: string[]
  /** 'ai': chosen and scored by the Analyzer; 'manual': a moment the user chose (no score) */
  origin: 'ai' | 'manual'
  rationale: string
  status: ClipStatus
  files: ClipFiles
  /** Only from GET /api/clips/{id}: the list leaves the words out (see `word_count`) */
  subtitle_data?: { clip_id: string; words: SubtitleWord[] }
  /** Only in the list: how many subtitle words the clip has */
  word_count?: number
  /** Only in the list: the source video's title (an upload's file name), '' when unknown */
  source_title?: string
  /** Per-clip override of the brand caption settings ({} = inherit) */
  subtitle_style: Record<string, any>
  /** Per-clip override of the brand layout_settings ({} = inherit; lib/presets/layout.ts) */
  layout_style?: Record<string, any>
  /** Size of files.source */
  source_width?: number | null
  source_height?: number | null
  /** The clip's brand template (null = its campaign's template) */
  brand_template_id: string | null
  /** The campaign the clip was made for, how well it fits that brief (0-100) and why */
  campaign_id?: string | null
  brief_fit?: number | null
  brief_reason?: string
  post_copy?: PostCopy | null
  /** Brief rules the user ticked: {rule id: true} */
  brief_manual?: Record<string, boolean>
  /** List responses only, for campaign clips */
  campaign_name?: string
  brief_summary?: BriefCheckSummary | null
  created_at: ISODate
  updated_at: ISODate
}

/** Same shape as SceneData in lib/presets/layout.ts. */
export interface ClipScenes {
  width: number
  height: number
  shots: Array<{
    start: number
    end: number
    kind: 'duo' | 'solo' | 'group' | 'none'
    faces: Array<{ x: number; y: number; h: number }>
  }>
}

/** Same shape as ContentProfile in lib/presets/layout.ts: what the clip shows as a whole. */
export interface ClipContent {
  kind: 'vertical' | 'speaker' | 'duo' | 'screen' | 'mixed'
  solo: number
  duo: number
  other: number
}

export interface ClipDetail {
  clip: Clip
  /** brand caption_settings merged with clip.subtitle_style */
  effective_style: Record<string, any>
  /** brand ai_settings merged with clip.subtitle_style.ai */
  effective_ai: AiSubtitleSettings
  /** brand layout_settings merged with clip.layout_style (without safeZone) */
  effective_layout?: Record<string, any>
  /** YouTube channel of the source video ('' for uploads), for the layout credit */
  channel?: string
  /** The shots of the clip's face scan (duo and auto layouts); null before the scan */
  scenes?: ClipScenes | null
  /** What the clip shows, for "Layout otomatis sesuai konten"; null before the face scan */
  content?: ClipContent | null
  /** The template in effect (the clip's own choice, else its campaign's, else the default); null = built-in */
  brand_template: BrandTemplate | null
  /** The clip's campaign (without its brief material) and its checklist; null without one */
  campaign?: Campaign | null
  brief_check?: BriefCheck | null
  /** A recut of this clip that is pending or running; null otherwise */
  recut_job?: Job | null
  /** The video the clip was cut from (null when unknown) */
  source_video?: SourceVideoInfo | null
}

export interface SourceVideoInfo {
  title: string
  channel: string
  /** The YouTube watch link, or null for an uploaded file */
  youtube_url: string | null
  file_path: string | null
  duration_seconds: number | null
}

export interface SubtitleUpdate {
  words?: SubtitleWord[]
  style?: Record<string, any>
  reset_style?: boolean
  /** Per-clip layout override (replaces the stored one) / back to the template's layout */
  layout?: Record<string, any>
  reset_layout?: boolean
  /** The clip's title (podcast layout header) */
  hook_text?: string
  /** Switch the clip's brand template (null = follow its campaign's template) */
  brand_template_id?: string | null
}

export type RenderStatus = 'queued' | 'rendering' | 'completed' | 'failed' | 'cancelled'

export interface RenderJob {
  id: string
  clip_id: string
  status: RenderStatus
  progress_pct: number
  /** Absolute path of the rendered file in the library (<clip>\final.mp4) when completed */
  output_path: string | null
  /** The copy in the export folder (Pengaturan → Folder ekspor), made when the render finishes */
  exported_path?: string | null
  /** The export folder used for that copy */
  export_dir?: string | null
  /** Why the copy failed (the render itself still completed) */
  export_error?: string | null
  error: string | null
  created_at: ISODate
  finished_at: ISODate | null
  /** Live status from render.progress, e.g. while it waits for free RAM (not stored) */
  message?: string | null
}

export interface ExportResult {
  dest_dir: string
  exported: { clip_id: string; path: string }[]
  skipped: { clip_id: string; reason: string }[]
}

/** LLM providers (backend/core/llm_providers.py); labels and key links live in lib/llmProviders.ts */
export type LlmProvider = 'openai' | 'anthropic' | 'gemini' | 'xai' | 'deepseek' | 'qwen' | 'openai_compatible'
export type EncoderSetting = 'auto' | 'libx264' | 'h264_nvenc' | 'h264_qsv' | 'h264_amf'
export type WhisperProvider = 'auto' | 'local' | 'groq'
/** Local Whisper models (backend/agents/tools/whisper_local.py MODELS) */
export type WhisperModelId = 'small' | 'large-v3-turbo'
export type WhisperLocalModelSetting = 'auto' | WhisperModelId

export interface Settings {
  export_dir: string
  cache_limit_gb: number
  /** base_url is only used by the OpenAI-compatible provider; models holds the chosen model per provider */
  llm: { provider: LlmProvider; base_url: string; models: Record<LlmProvider, string> }
  /** provider: auto = Groq while a key is set and Groq answers, else local; model = the Groq model */
  whisper: { provider: WhisperProvider; model: string; local_model: WhisperLocalModelSetting }
  processing: { max_workers: number; encoder: EncoderSetting }
  render: { concurrency: number }
  /** RAM guard (backend/core/resources.py): auto = heavy steps wait for free RAM; reserve_gb 0 = automatic */
  resources: { auto: boolean; reserve_gb: number }
  /** auto_update: check for a new yt-dlp once a day */
  ytdlp: { player_client: string; cookies_file: string | null; auto_update: boolean }
  /** post_text: a campaign clip's export gets a .txt with its post text next to the video */
  export: { post_text: boolean }
  db: { wiredtiger_cache_gb: number }
  /** language: the UI language, mirrored for the engine's own messages (lib/i18n) */
  /** The engine's copy of the UI language; closing to the tray is a shell setting (window.metis) */
  app: { language: Lang }
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] }

/** One key per LLM provider (llm_api_key = OpenAI-compatible endpoint), plus Groq Whisper */
export type LlmSecretName = 'openai_api_key' | 'anthropic_api_key' | 'gemini_api_key' | 'xai_api_key' | 'deepseek_api_key' | 'qwen_api_key' | 'llm_api_key'
export type SecretName = LlmSecretName | 'groq_api_key'

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
  /** The daily yt-dlp update check: its switch, the last successful check and the last attempt (ISO, UTC) */
  ytdlp_update?: { auto: boolean; checked_at?: string | null; attempted_at?: string | null; ok?: boolean; message?: string | null }
  encoders: string[]
  cpu_count: number
  ram_gb: number
}

/** POST /api/system/update-ytdlp (409 while yt-dlp is downloading) */
export interface YtdlpUpdateResult {
  ok: boolean
  updated: boolean
  version: string | null
  message: string
}

export interface StorageInfo {
  data_root: string
  /** Who may open the data folder: only this Windows account (plus SYSTEM and Administrators), or more (§6.1) */
  access?: 'private' | 'shared' | 'unknown'
  drive_free_bytes: number
  drive_total_bytes: number
  db_bytes: number
  library_bytes: number
  cache_bytes: number
  backups_bytes: number
  /** <DATA_ROOT>\models (local Whisper models) */
  models_bytes: number
  per_campaign: { campaign_id: string; name: string; bytes: number }[]
}

export interface WhisperModelDownload {
  status: 'downloading' | 'failed' | 'cancelled'
  progress: number
  error: string | null
}

export interface WhisperModelInfo {
  id: WhisperModelId
  label: string
  description: string
  size_bytes: number
  installed: boolean
  download: WhisperModelDownload | null
}

/** GET /api/whisper/status */
export interface WhisperStatus {
  provider: WhisperProvider
  groq_key_set: boolean
  local: {
    /** whisper-cli.exe is bundled */
    available: boolean
    version: string | null
    busy: boolean
    threads: number
    model_setting: WhisperLocalModelSetting
    /** The model each task uses with the current setting */
    transcript_model: WhisperModelId
    subtitle_model: WhisperModelId
    /** What the "auto" setting picks on this PC */
    auto_models: { transcript: WhisperModelId; subtitle: WhisperModelId }
    models_dir: string
  }
  models: WhisperModelInfo[]
  cpu_cores: number
  cpu_threads: number
  ram_gb: number
}

export interface BackupInfo {
  name: string
  path: string
  size_bytes: number
  created_at: ISODate
}

/** What still runs in the engine; moving the data folder and restoring a backup wait for it */
export interface ActivityStatus {
  busy: boolean
  items: Array<{ kind: 'jobs' | 'renders' | 'parses' | 'designs' | 'downloads'; count: number }>
  /** One sentence in the UI language naming what still runs, or null */
  message: string | null
}

export interface RestoreResult {
  restored: { name: string; created_at: ISODate | null; collections: number; documents: number; schema_version: number }
  /** The backup of the state before the restore (a restore can be undone with it) */
  safety_backup: BackupInfo
}

/** Same shape as the old Next.js /api/dashboard/stats route */
/** GET /api/system/resources: RAM and the heavy steps the RAM guard runs or holds back */
export interface ResourceTask {
  kind: 'clip' | 'render' | 'whisper' | string
  label: string
  need_mb: number
}

export interface ResourceStatus {
  auto: boolean
  total_mb: number
  available_mb: number
  /** RAM kept free for Windows and other apps (the setting, or the automatic value) */
  reserve_mb: number
  auto_reserve_mb: number
  running: ResourceTask[]
  waiting: ResourceTask[]
}

export interface DashboardStats {
  videosProcessed: number
  clipsGenerated: number
  /** Clips waiting for an export (status ready) */
  clipsReady: number
  potentialViews: number
}

export type EngineEvent =
  | {
      type: 'job.progress'
      id: string
      campaign_ids?: string[]
      status: JobStatus
      current_step: JobStep | null
      progress_pct: number
      total_scenes: number
      processed_scenes: number
      message?: string
    }
  | {
      type: 'job.status'
      id: string
      campaign_ids?: string[]
      status: JobStatus
      error?: string | null
      /** When it finished: the source video's title, and (completed) how many clips it made */
      title?: string | null
      clips?: number
      /** A recut: the clip it cut again */
      kind?: 'recut'
      clip_id?: string
    }
  | { type: 'clip.created'; id: string; job_id: string | null; campaign_id?: string | null }
  | { type: 'clip.updated'; id: string }
  | { type: 'clip.deleted'; id: string }
  | { type: 'brand_template.updated'; id: string; campaign_id?: string | null; design?: TemplateDesignStatus | null }
  | { type: 'brand_template.deleted'; id: string; campaign_id?: string | null }
  | { type: 'campaign.updated'; id: string }
  | { type: 'campaign.deleted'; id: string }
  | { type: 'campaign.parse'; id: string; status: CampaignParseStatus; message: string }
  | { type: 'render.progress'; id: string; clip_id: string; status: RenderStatus; progress_pct: number; message?: string }
  | {
      type: 'render.status'
      id: string
      clip_id: string
      status: RenderStatus
      output_path?: string | null
      exported_path?: string | null
      export_dir?: string | null
      export_error?: string | null
      error?: string | null
    }
  | { type: 'system.notice'; level: 'info' | 'warning' | 'error'; message: string }
  | ({ type: 'system.resources' } & ResourceStatus)
  | { type: 'whisper.download'; id: WhisperModelId; status: 'downloading' | 'completed' | 'failed' | 'cancelled'; progress: number; message: string | null }

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
  if (!cachedInfo) throw new EngineError(0, tm().shell.engine.notReady)
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
    throw new EngineError(0, tm().shell.engine.cannotConnect)
  }
  if (!res.ok) {
    let detail = tm().shell.engine.requestFailed(res.status)
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
export function clipMediaUrl(clipId: string, kind: 'raw' | 'final' | 'thumbnail' | 'source', version?: string | number): string {
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

/**
 * Whether a job or clip event concerns this campaign. Events without campaign info count, so a page
 * reloads once too often rather than missing a change.
 */
export function eventForCampaign(e: EngineEvent, campaignId: string): boolean {
  if (e.type === 'job.progress' || e.type === 'job.status') return !e.campaign_ids || e.campaign_ids.includes(campaignId)
  if (e.type === 'clip.created') return !e.campaign_id || e.campaign_id === campaignId
  return false
}

type EventHandler = (e: EngineEvent) => void
const handlers = new Set<EventHandler>()
let socket: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectDelay = 1000

// Several components subscribe in the same tick: only one of them may open the socket, or every event
// arrives once per socket (duplicate toasts and refreshes)
let connecting = false

async function connectSocket() {
  if (typeof window === 'undefined' || socket || connecting || handlers.size === 0) return
  connecting = true
  let info: MetisEngineInfo
  try {
    info = await getEngineInfo()
  } catch {
    connecting = false
    scheduleReconnect()
    return
  }
  connecting = false
  if (socket || handlers.size === 0) return
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
    resources: () => request<ResourceStatus>('GET', '/api/system/resources'),
    backup: () => request<{ backup: BackupInfo }>('POST', '/api/system/backup'),
    backups: () => request<{ backups: BackupInfo[] }>('GET', '/api/system/backups'),
    /** Puts the database back as it was in that backup (writes a backup of the current state first) */
    restoreBackup: (name: string) => request<RestoreResult>('POST', `/api/system/backups/${encodeURIComponent(name)}/restore`),
    activity: () => request<ActivityStatus>('GET', '/api/system/activity'),
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
    /** The stored key itself, for the eye icon (status() only says whether one is set) */
    reveal: (name: SecretName) => request<{ value: string }>('POST', `/api/secrets/${name}/reveal`),
    /** Tests `value` if given, otherwise the stored secret */
    test: (name: SecretName, value?: string) => request<{ ok: boolean; message: string }>('POST', `/api/secrets/${name}/test`, { body: value ? { value } : {} }),
  },

  whisper: {
    status: () => request<WhisperStatus>('GET', '/api/whisper/status'),
    /** Starts a background download; progress arrives as whisper.download events */
    download: (id: WhisperModelId) => request<{ ok: true; started: boolean }>('POST', `/api/whisper/models/${id}/download`),
    cancelDownload: (id: WhisperModelId) => request<{ ok: boolean }>('POST', `/api/whisper/models/${id}/cancel`),
    remove: (id: WhisperModelId) => request<{ ok: true }>('DELETE', `/api/whisper/models/${id}`),
  },

  llm: {
    /** Text models the provider offers; uses the unsaved key / base URL from the form when given */
    models: (provider: LlmProvider, opts: { value?: string; base_url?: string } = {}) =>
      request<{ models: string[] }>('POST', '/api/llm/models', { body: { provider, ...(opts.value ? { value: opts.value } : {}), ...(opts.base_url ? { base_url: opts.base_url } : {}) } }),
  },


  brandTemplates: {
    /** One campaign's templates (oldest first), or every campaign's */
    list: (campaignId?: string) =>
      request<{ brand_templates: BrandTemplate[] }>('GET', '/api/brand-templates', { query: campaignId ? { campaign_id: campaignId } : {} }),
    get: (id: string) => request<{ brand_template: BrandTemplate }>('GET', `/api/brand-templates/${id}`),
    /** A new template in a campaign: default settings, a copy of `copy_from` (any campaign's), or designed by the AI (`ai`) */
    create: (input: { campaign_id: string; name?: string; copy_from?: string | null; ai?: boolean; make_default?: boolean }) =>
      request<{ brand_template: BrandTemplate }>('POST', '/api/brand-templates', { body: input }),
    update: (id: string, patch: BrandTemplateInput) =>
      request<{ brand_template: BrandTemplate }>('PUT', `/api/brand-templates/${id}`, { body: patch }),
    /** Design it (again) with the AI in the background; replaces its caption, layout and AI subtitle settings */
    design: (id: string) => request<{ brand_template: BrandTemplate }>('POST', `/api/brand-templates/${id}/design`),
    /** Make it its campaign's default */
    makeDefault: (id: string) => request<{ brand_template: BrandTemplate }>('POST', `/api/brand-templates/${id}/default`),
    /** Its clips follow the campaign's default; refused for a campaign's last template */
    remove: (id: string) => request<{ ok: true }>('DELETE', `/api/brand-templates/${id}`),
    /** Uploads a brand asset; store the returned `value` (asset://…) in brand_settings */
    uploadAsset: (id: string, file: File, kind: string) => {
      const form = new FormData()
      form.append('file', file)
      form.append('kind', kind)
      // kind 'companion' (split layout video) is converted first and also returns its duration
      return request<{ value: string; path: string; duration?: number }>('POST', `/api/brand-templates/${id}/assets`, { form })
    },
  },

  campaigns: {
    list: (query: { status?: 'active' | 'archived' } = {}) => request<{ campaigns: Campaign[] }>('GET', '/api/campaigns', { query }),
    get: (id: string) => request<{ campaign: Campaign }>('GET', `/api/campaigns/${id}`),
    create: (input: CampaignInput & { name: string }) => request<{ campaign: Campaign }>('POST', '/api/campaigns', { body: input }),
    update: (id: string, patch: CampaignInput) => request<{ campaign: Campaign }>('PUT', `/api/campaigns/${id}`, { body: patch }),
    /** Deletes the campaign with its clips; jobs that follow only this campaign go too (files only with deleteFiles) */
    remove: (id: string, deleteFiles = false) => request<{ ok: true }>('DELETE', `/api/campaigns/${id}`, { query: { delete_files: deleteFiles } }),
    addText: (id: string, text: string, name = '') =>
      request<{ campaign: Campaign }>('POST', `/api/campaigns/${id}/sources/text`, { body: { text, name } }),
    /** A document (PDF, DOCX, TXT, MD) or an image (screenshot, also pasted from the clipboard) */
    addFile: (id: string, file: File) => {
      const form = new FormData()
      form.append('file', file)
      return request<{ campaign: Campaign }>('POST', `/api/campaigns/${id}/sources/file`, { form })
    },
    removeSource: (id: string, sourceId: string) => request<{ campaign: Campaign }>('DELETE', `/api/campaigns/${id}/sources/${sourceId}`),
    /** Reads every brief piece with the AI in the background; campaign.parse events, result in `draft` */
    parse: (id: string) => request<{ campaign: Campaign }>('POST', `/api/campaigns/${id}/parse`),
    discardDraft: (id: string) => request<{ campaign: Campaign }>('POST', `/api/campaigns/${id}/draft/discard`),
  },

  jobs: {
    list: (query: { campaign_id?: string; status?: JobStatus; limit?: number } = {}) => request<{ jobs: Job[] }>('GET', '/api/jobs', { query }),
    get: (id: string) => request<{ job: Job }>('GET', `/api/jobs/${id}`),
    /** One job per video: `job` is the first, `jobs` all of them */
    create: (input: JobCreate) => request<{ job: Job; jobs: Job[] }>('POST', '/api/jobs', { body: input }),
    /** "Cari klip lagi": the same video, campaigns and settings; moments the campaigns already have are skipped */
    again: (id: string) => request<{ job: Job }>('POST', `/api/jobs/${id}/again`),
    playlist: (url: string) => request<PlaylistInfo>('POST', '/api/jobs/playlist', { body: { url } }),
    cancel: (id: string) => request<{ job: Job }>('POST', `/api/jobs/${id}/cancel`),
    resume: (id: string) => request<{ job: Job }>('POST', `/api/jobs/${id}/resume`),
    remove: (id: string) => request<{ ok: true }>('DELETE', `/api/jobs/${id}`),
  },

  clips: {
    /** Newest first; `limit` > 0 returns only that many */
    list: (query: { campaign_id?: string; job_id?: string; status?: ClipStatus; limit?: number } = {}) =>
      request<{ clips: Clip[] }>('GET', '/api/clips', { query }),
    get: (id: string) => request<ClipDetail>('GET', `/api/clips/${id}`),
    updateSubtitles: (id: string, update: SubtitleUpdate) => request<{ clip: Clip }>('PUT', `/api/clips/${id}/subtitles`, { body: update }),
    /** One LLM call: mark keywords and/or pick emojis on the saved words (replaces earlier AI marks). */
    enrichSubtitles: (id: string, opts: { keywords: boolean; emojis: boolean }) =>
      request<{ clip: Clip; keywords: number; emojis: number }>('POST', `/api/clips/${id}/subtitles/enrich`, { body: opts }),
    remove: (id: string, deleteFiles = true) => request<{ ok: true }>('DELETE', `/api/clips/${id}`, { query: { delete_files: deleteFiles } }),
    /** Cut the clip again at new edges (seconds of its source video): a one-moment job; style, title and edited words stay */
    recut: (id: string, range: ClipRange & { snap_edges?: boolean }) => request<{ job: Job }>('POST', `/api/clips/${id}/recut`, { body: range }),
    render: (id: string) => request<{ render_job: RenderJob }>('POST', `/api/clips/${id}/render`),
    /** Queue several renders (run one after another); a clip that cannot render now is skipped with the reason */
    renderMany: (clipIds: string[]) =>
      request<{ render_jobs: RenderJob[]; skipped: { clip_id: string; reason: string }[] }>('POST', '/api/clips/render', { body: { clip_ids: clipIds } }),
    removeMany: (clipIds: string[], deleteFiles = true) =>
      request<{ deleted: string[]; missing: string[] }>('POST', '/api/clips/delete', { body: { clip_ids: clipIds, delete_files: deleteFiles } }),
    /** Fetch the clip's original-ratio video again (clips made before the podcast layout). */
    prepareSource: (id: string) => request<{ clip: Clip }>('POST', `/api/clips/${id}/source`),
    /** Face scan for the duo and auto layouts (fetches the source video first when it is missing too) */
    prepareFaces: (id: string) => request<{ clip: Clip; scenes: ClipScenes | null; content: ClipContent | null }>('POST', `/api/clips/${id}/faces`),
    /** Speaker names for the layout's name tag, from the video title, channel and clip words (not saved). */
    suggestSpeaker: (id: string) => request<{ speakers: { name: string; role: string }[] }>('POST', `/api/clips/${id}/speaker/suggest`),
    export: (clipIds: string[], destDir?: string) => request<ExportResult>('POST', '/api/clips/export', { body: { clip_ids: clipIds, dest_dir: destDir } }),
    savePostCopy: (id: string, copy: Pick<PostCopy, 'title' | 'caption' | 'hashtags' | 'mentions' | 'disclosure'>) =>
      request<{ clip: Clip }>('PUT', `/api/clips/${id}/post-copy`, { body: copy }),
    /** Writes the post text again with the AI, following the campaign's current brief */
    generatePostCopy: (id: string) => request<{ clip: Clip }>('POST', `/api/clips/${id}/post-copy/generate`),
    setBriefManual: (id: string, rule: string, checked: boolean) =>
      request<{ clip: Clip; brief_check: BriefCheck | null }>('PUT', `/api/clips/${id}/brief-manual`, { body: { rule, checked } }),
    /** Move the clip to another campaign */
    setCampaign: (id: string, campaignId: string) =>
      request<{ clip: Clip }>('PUT', `/api/clips/${id}/campaign`, { body: { campaign_id: campaignId } }),
  },

  renderJobs: {
    list: (query: { clip_id?: string; status?: RenderStatus } = {}) => request<{ render_jobs: RenderJob[] }>('GET', '/api/render-jobs', { query }),
    get: (id: string) => request<{ render_job: RenderJob }>('GET', `/api/render-jobs/${id}`),
    cancel: (id: string) => request<{ render_job: RenderJob }>('POST', `/api/render-jobs/${id}/cancel`),
  },

  dashboard: {
    stats: (campaignId: string) => request<DashboardStats>('GET', '/api/dashboard/stats', { query: { campaign_id: campaignId } }),
  },
}
