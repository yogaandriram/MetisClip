'use client'

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  Download,
  Film,
  FolderOpen,
  Keyboard,
  Maximize,
  Palette,
  Pause,
  PenLine,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  ScanText,
  Scissors,
  Star,
  Trash2,
  Type,
  Undo2,
  UserRound,
  X,
  XCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { presets } from '@/lib/presets'
import { CaptionLayer } from '@/lib/presets/CaptionLayer'
import { LogoOverlay } from '@/lib/presets/BrandOverlay'
import { LayoutStage } from '@/lib/presets/LayoutStage'
import {
  type DuoTop,
  type FrameRatio,
  type LayoutMode,
  type LayoutPatch,
  type ZoomStyle,
  LAYOUT_LIMITS,
  companionStart,
  companionTime,
  mergeLayout,
  resolveLayout,
  type Scene,
  SCENE_VIEWS,
  type SceneView,
  scenePlan,
  sourceAspect,
  usesScenes,
  usesSource,
  viewSeconds,
} from '@/lib/presets/layout'
import { type CaptionStyle, BASE_CAPTION_STYLE, getPreset, presetSwitch, resolveCaptionStyle } from '@/lib/presets/defaults'
import {
  type AiCaptionSettings,
  type Segment,
  DEFAULT_AI_SETTINGS,
  computeKeepSegments,
  isCut,
  isFiller,
  keptDuration,
  nextKeptTime,
  outputTimeAt,
  resolveAi,
} from '@/lib/presets/captions'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Chip,
  ColorPicker,
  ConfirmModal,
  Divider,
  Dropdown,
  EmptyState,
  Field,
  IconButton,
  InputField,
  Kbd,
  KeyValueList,
  Modal,
  PageHeader,
  ProgressBar,
  ScoreBadge,
  SelectField,
  Skeleton,
  Slider,
  Spinner,
  Stage,
  ChoiceChips,
  TextAreaField,
  ToggleSwitch,
  Tooltip,
} from '@/components/ui'
import { cx } from '@/lib/cx'
import { CaptionPositionControls } from '@/components/captions/CaptionPositionControls'
import { SUPPORTED_FONTS, FONT_WEIGHTS_MAP } from '@/lib/constants'
import { useEngine } from '@/contexts/EngineContext'
import { useEngineEvents } from '@/hooks/useEngineEvents'
import { api, type BrandTemplate, type ClipDetail, type RenderJob, type SubtitleWord } from '@/lib/engine'
import { assetUrl, isDesktop, mediaUrl } from '@/lib/media'
import { RENDER_STATUS, errorMessage, formatClock } from '@/lib/format'
import { useI18n, useT } from '@/lib/i18n/I18nProvider'
import { tm } from '@/lib/i18n'

// Style model: lib/presets/defaults.ts (shared with the Brand Template page and the render).
// `ai` is the clip's AI subtitle settings (brand ai_settings unless overridden; saved in subtitle_style.ai).
/** templateId: the brand template in effect (null = built-in defaults); layout: the clip's override
 * of the template layout (lib/presets/layout.ts, saved as layout_style); title: the clip's hook text,
 * shown above the video by the podcast layout */
type Snapshot = {
  words: SubtitleWord[]
  style: CaptionStyle
  ai: AiCaptionSettings
  templateId: string | null
  layout: LayoutPatch
  title: string
}

// Option ids; their labels are in the `editor` dictionary (looked up while rendering)
const LAYOUT_MODES: LayoutMode[] = ['full', 'podcast', 'card', 'split', 'duo', 'auto']
const VIEWS: SceneView[] = ['duo', 'full', 'framed']
const FULL_OR_FRAMED: ('full' | 'framed')[] = ['full', 'framed']
const DUO_TOPS: DuoTop[] = ['left', 'right']
const ZOOM_STYLES: ZoomStyle[] = ['keywords', 'sentences']
const RATIOS: FrameRatio[] = ['source', '16:9', '4:3', '1:1', '4:5']

/** Caption style keys that differ from the template (all keys when the preset differs), so later
 * template edits still reach the clip for everything it did not change. */
function styleOverrides(style: CaptionStyle, tpl: BrandTemplate | null): Record<string, any> {
  const base = resolveCaptionStyle(tpl?.caption_settings || {})
  if (style.mode !== base.mode) return { ...style }
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(style)) if ((base as Record<string, any>)[k] !== v) out[k] = v
  return out
}

function aiOverrides(ai: AiCaptionSettings, tpl: BrandTemplate | null): Partial<AiCaptionSettings> {
  const base = resolveAi(tpl?.ai_settings)
  const out: Partial<AiCaptionSettings> = {}
  for (const k of Object.keys(ai) as (keyof AiCaptionSettings)[]) if (ai[k] !== base[k]) out[k] = ai[k]
  return out
}

/** `C:\a\b\clip.mp4` → [`C:\a\b`, `clip.mp4`] (Windows or POSIX separators). */
function splitPath(p: string): [string, string] {
  const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'))
  return i < 0 ? ['', p] : [p.slice(0, i), p.slice(i + 1)]
}

const isTypingTarget = (t: EventTarget | null) => {
  const el = t as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

// ---------------------------------------------------------------------------

export default function ClipDetailPage() {
  return (
    <Suspense fallback={<EditorSkeleton />}>
      <ClipEditor />
    </Suspense>
  )
}

const BACK_HREF = '/clips/'

/** Full-height editor below the shell padding (16 top + 48 bottom), so only the columns scroll. */
const PAGE_STYLE: React.CSSProperties = { height: 'calc(100vh - 64px)', minHeight: 640, display: 'flex', flexDirection: 'column' }
const GRID_STYLE: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(300px, 360px) minmax(320px, 1fr) minmax(300px, 360px)',
  gap: 20,
  flex: 1,
  minHeight: 0,
}
const COLUMN_STYLE: React.CSSProperties = { display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }
const COLUMN_BODY: React.CSSProperties = { flex: 1, minHeight: 0, overflowY: 'auto' }

function EditorSkeleton() {
  const t = useT()
  return (
    <div style={PAGE_STYLE}>
      <PageHeader title={t.editor.title} back={{ href: BACK_HREF, label: t.editor.back }} />
      <div style={GRID_STYLE}>
        <Skeleton height="100%" radius="lg" />
        <Skeleton height="100%" radius="lg" />
        <Skeleton height="100%" radius="lg" />
      </div>
    </div>
  )
}

function ClipEditor() {
  const t = useT()
  const m = t.editor
  const { locale } = useI18n()
  const router = useRouter()
  const params = useSearchParams()
  const clipId = params.get('id') || ''
  const { epoch, systemInfo } = useEngine()

  const videoRef = useRef<HTMLVideoElement>(null)
  /** Blurred copy of the source behind the podcast frame (muted, follows videoRef) */
  const bgRef = useRef<HTMLVideoElement>(null)
  const timeRef = useRef(0)
  // Companion video (split layout): its element and where this clip's loop starts
  const compRef = useRef<HTMLVideoElement>(null)
  const compLoop = useRef({ start: 0, duration: 0 })
  // The two panels of the duo layout (source.mp4, muted, follow videoRef)
  const duoTopRef = useRef<HTMLVideoElement>(null)
  const duoBottomRef = useRef<HTMLVideoElement>(null)
  // The podcast frame of the auto layout (source.mp4, muted, follows videoRef)
  const framedRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [detail, setDetail] = useState<ClipDetail | null>(null)
  const [templates, setTemplates] = useState<BrandTemplate[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [present, setPresent] = useState<Snapshot | null>(null)
  const [savedJson, setSavedJson] = useState('')
  const history = useRef<{ past: Snapshot[]; future: Snapshot[]; lastKey: string | null; lastAt: number }>({ past: [], future: [], lastKey: null, lastAt: 0 })

  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  /** Where to go after the unsaved-changes prompt (null = no prompt) */
  const [leaveTo, setLeaveTo] = useState<string | null>(null)
  const [showShortcuts, setShowShortcuts] = useState(false)

  const [render, setRender] = useState<RenderJob | null>(null)
  const [renderOpen, setRenderOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportedPath, setExportedPath] = useState<string | null>(null)

  // ---- loading ------------------------------------------------------------

  const applyDetail = useCallback((d: ClipDetail) => {
    const snap: Snapshot = {
      words: (d.clip.subtitle_data?.words || []).map((w) => ({ ...w })),
      style: resolveCaptionStyle(d.effective_style || {}),
      ai: resolveAi(d.effective_ai),
      templateId: d.brand_template?.id ?? null,
      layout: (d.clip.layout_style || {}) as LayoutPatch,
      title: d.clip.hook_text || '',
    }
    setDetail(d)
    setPresent(snap)
    setSavedJson(JSON.stringify(snap))
    history.current = { past: [], future: [], lastKey: null, lastAt: 0 }
  }, [])

  useEffect(() => {
    if (!clipId) {
      setLoadError(tm().editor.noIdInUrl)
      return
    }
    let cancelled = false
    setLoadError(null)
    api.clips
      .get(clipId)
      .then((d) => {
        if (!cancelled) applyDetail(d)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(errorMessage(err, tm().editor.notFound))
      })
    api.brandTemplates
      .list()
      .then(({ brand_templates }) => {
        if (!cancelled) setTemplates(brand_templates)
      })
      .catch(() => undefined)
    // Re-attach to a render that is still running for this clip
    api.renderJobs
      .list({ clip_id: clipId })
      .then(({ render_jobs }) => {
        const running = render_jobs.find((r) => r.status === 'queued' || r.status === 'rendering')
        if (!cancelled && running) setRender(running)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
    // epoch: reload after an engine restart only if nothing is loaded yet
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipId, applyDetail])

  useEffect(() => {
    if (epoch > 1 && !detail && clipId) api.clips.get(clipId).then(applyDetail).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epoch])

  useEngineEvents((e) => {
    if (e.type === 'render.progress' && e.clip_id === clipId) {
      setRender((prev) =>
        prev && prev.id === e.id ? { ...prev, status: e.status, progress_pct: e.progress_pct, message: e.message ?? null } : prev || null,
      )
    } else if (e.type === 'render.status' && e.clip_id === clipId) {
      setRender((prev) =>
        prev && prev.id === e.id
          ? {
              ...prev,
              status: e.status,
              output_path: e.output_path ?? prev.output_path,
              exported_path: e.exported_path ?? prev.exported_path,
              export_dir: e.export_dir ?? prev.export_dir,
              export_error: e.export_error ?? prev.export_error,
              error: e.error ?? prev.error,
            }
          : prev,
      )
      if (e.status === 'completed') {
        if (e.exported_path) {
          const [folder] = splitPath(e.exported_path)
          toast.success(
            <span>
              {m.renderDoneSavedIn}{' '}
              <span className="mc-mono" style={{ wordBreak: 'break-all' }}>
                {folder}
              </span>
            </span>,
            { duration: 6000 },
          )
          window.metis?.notify('MetisClip', m.notifyRenderSavedIn(folder))
        } else if (e.export_error) {
          toast.error(m.renderDoneNotCopied(e.export_error), { duration: 8000 })
          window.metis?.notify('MetisClip', m.notifyRenderDone)
        } else {
          toast.success(m.renderDone)
          window.metis?.notify('MetisClip', m.notifyRenderDone)
        }
        // Refresh clip (files.final / updated_at) without touching unsaved edits
        api.clips
          .get(clipId)
          .then((d) => setDetail(d))
          .catch(() => undefined)
      } else if (e.status === 'failed') {
        toast.error(e.error || t.status.render.failed)
      }
    } else if (e.type === 'clip.deleted' && e.id === clipId) {
      toast.error(m.clipDeleted)
      router.push('/clips/')
    }
  })

  // ---- history ------------------------------------------------------------

  const update = (next: Snapshot, coalesceKey?: string) => {
    if (!present) return
    const h = history.current
    const now = Date.now()
    if (!(coalesceKey && coalesceKey === h.lastKey && now - h.lastAt < 800)) {
      h.past.push(present)
      if (h.past.length > 100) h.past.shift()
    }
    h.future = []
    h.lastKey = coalesceKey ?? null
    h.lastAt = now
    setPresent(next)
  }

  const undo = () => {
    const h = history.current
    if (!present || h.past.length === 0) return
    const prev = h.past.pop()!
    h.future.push(present)
    h.lastKey = null
    setPresent(prev)
  }

  const redo = () => {
    const h = history.current
    if (!present || h.future.length === 0) return
    const next = h.future.pop()!
    h.past.push(present)
    h.lastKey = null
    setPresent(next)
  }

  const setStyle = (patch: Partial<CaptionStyle>, key?: string) => {
    if (present) update({ ...present, style: { ...present.style, ...patch } }, key)
  }

  const setWords = (words: SubtitleWord[], key?: string) => {
    if (present) update({ ...present, words }, key)
  }

  const setAi = (patch: Partial<AiCaptionSettings>) => {
    if (present) update({ ...present, ai: { ...present.ai, ...patch } })
  }
  const setLayout = (patch: LayoutPatch, key?: string) => {
    if (present) update({ ...present, layout: mergeLayout(present.layout, patch) }, key)
  }

  const setTitle = (title: string) => {
    if (present) update({ ...present, title }, 'title')
  }


  const dirty = present ? JSON.stringify(present) !== savedJson : false

  // ---- playback -----------------------------------------------------------

  // Kept ranges when filler words / silent pauses are cut (same computation as the render)
  const words = present?.words || []
  const style = present?.style || BASE_CAPTION_STYLE
  const ai = present?.ai || DEFAULT_AI_SETTINGS
  const sourceDuration = duration || detail?.clip.duration_seconds || 0
  const segments = useMemo(
    () => computeKeepSegments(words, sourceDuration, ai, style.offsetTime / 1000),
    [words, sourceDuration, ai, style.offsetTime],
  )
  const cutActive = isCut(segments, sourceDuration)
  const segmentsRef = useRef(segments)
  segmentsRef.current = cutActive ? segments : []

  useEffect(() => {
    if (!isPlaying) return
    let raf = 0
    const tick = () => {
      const v = videoRef.current
      if (v) {
        const segs = segmentsRef.current
        if (segs.length) {
          // Preview the cut: jump over removed filler words and pauses
          const next = nextKeptTime(segs, v.currentTime)
          if (next === null) v.pause()
          else if (next > v.currentTime + 0.01) v.currentTime = next
        }
        setCurrentTime(v.currentTime)
        timeRef.current = v.currentTime
        const bg = bgRef.current
        if (bg && Math.abs(bg.currentTime - v.currentTime) > 0.25) bg.currentTime = v.currentTime
        syncCompanion(v.currentTime)
        syncDuo(v.currentTime)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isPlaying])

  /** Keep the duo panels and the auto frame on the clip's time (tighter than the blurred background). */
  function syncDuo(t: number, force = false) {
    for (const d of [duoTopRef.current, duoBottomRef.current, framedRef.current]) {
      if (d && (force || Math.abs(d.currentTime - t) > 0.12)) d.currentTime = t
    }
  }
  const playDuo = (play: boolean) => {
    for (const d of [duoTopRef.current, duoBottomRef.current, framedRef.current]) {
      if (!d) continue
      if (play) d.play().catch(() => undefined)
      else d.pause()
    }
  }

  /** Keep the companion loop at the clip's output time (it runs on through cut pauses, like the render). */
  function syncCompanion(sourceTime: number, force = false) {
    const c = compRef.current
    const { start, duration: loop } = compLoop.current
    if (!c || !(loop > 0)) return
    const target = companionTime(start, loop, outputTimeAt(segmentsRef.current, sourceTime))
    if (force || Math.abs(c.currentTime - target) > 0.3) c.currentTime = target
  }

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) v.play().catch(() => undefined)
    else v.pause()
  }

  const seekTo = (t: number) => {
    const v = videoRef.current
    if (!v) return
    const clamped = Math.max(0, Math.min(t, v.duration || duration || t))
    v.currentTime = clamped
    if (bgRef.current) bgRef.current.currentTime = clamped
    timeRef.current = clamped
    syncCompanion(clamped, true)
    syncDuo(clamped, true)
    setCurrentTime(clamped)
  }

  const adjustedTime = currentTime - style.offsetTime / 1000
  const activeWordIndex = useMemo(() => words.findIndex((w) => adjustedTime >= w.start && adjustedTime <= w.end), [words, adjustedTime])

  // ---- actions ------------------------------------------------------------

  const save = async (silent = false): Promise<boolean> => {
    if (!present || !clipId) return false
    setSaving(true)
    try {
      const cleanWords = present.words
        .filter((w) => w.word.trim() !== '')
        .map((w) => ({ ...w, start: Number(w.start) || 0, end: Math.max(Number(w.end) || 0, Number(w.start) || 0) }))
      const tpl = templateById(present.templateId)
      const aiDiff = aiOverrides(present.ai, tpl)
      const saved = savedJson ? (JSON.parse(savedJson) as Snapshot) : null
      const savedTemplateId = saved ? saved.templateId : null
      const title = present.title.replace(/\s+/g, ' ').trim()
      const { clip } = await api.clips.updateSubtitles(clipId, {
        words: cleanWords,
        style: { ...styleOverrides(present.style, tpl), ...(Object.keys(aiDiff).length ? { ai: aiDiff } : {}) },
        layout: present.layout as Record<string, any>,
        ...(title !== (saved?.title ?? '') ? { hook_text: title } : {}),
        ...(present.templateId !== savedTemplateId ? { brand_template_id: present.templateId } : {}),
      })
      const snap = { ...present, words: cleanWords, title }
      setDetail((d) => (d ? { ...d, clip } : d))
      setPresent(snap)
      setSavedJson(JSON.stringify(snap))
      if (!silent) {
        setJustSaved(true)
        setTimeout(() => setJustSaved(false), 2000)
        toast.success(m.changesSaved)
      }
      return true
    } catch (err) {
      toast.error(errorMessage(err, m.saveFailed))
      return false
    } finally {
      setSaving(false)
    }
  }

  /** The template with this id: from the library, else the one the clip was loaded with. */
  const templateById = (id: string | null): BrandTemplate | null =>
    (id && templates.find((tpl) => tpl.id === id)) || (detail?.brand_template && detail.brand_template.id === id ? detail.brand_template : null)

  /** Switch the clip's template: its caption style, logo and AI settings apply (sync offset kept). */
  const chooseTemplate = (id: string) => {
    if (!present || id === present.templateId) return
    const tpl = templateById(id)
    if (!tpl) return
    const style = resolveCaptionStyle(tpl.caption_settings || {})
    update({ ...present, templateId: id, style: { ...style, offsetTime: present.style.offsetTime }, ai: resolveAi(tpl.ai_settings), layout: {} })
    toast.success(m.usingTemplate(tpl.name))
  }

  /** Drop this clip's style and AI overrides (undoable; saved with Simpan). */
  const resetToTemplate = () => {
    if (!present) return
    const tpl = templateById(present.templateId)
    update({ ...present, style: resolveCaptionStyle(tpl?.caption_settings || {}), ai: resolveAi(tpl?.ai_settings), layout: {} })
    setConfirmReset(false)
    toast.success(m.styleReset(tpl?.name || m.builtIn))
  }

  const [enriching, setEnriching] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  /** Speaker names the AI found in the video title, channel and words (null = not asked yet) */
  const [speakerIdeas, setSpeakerIdeas] = useState<{ name: string; role: string }[] | null>(null)
  const suggestSpeaker = async () => {
    if (!clipId || suggesting) return
    setSuggesting(true)
    try {
      const { speakers } = await api.clips.suggestSpeaker(clipId)
      setSpeakerIdeas(speakers)
      if (!speakers.length) toast(m.speakerNoneFound)
    } catch (err) {
      toast.error(errorMessage(err, m.speakerSuggestFailed))
    } finally {
      setSuggesting(false)
    }
  }
  /** Fetch the original-ratio video for a clip made before the podcast layout (for the preview). */
  const prepareSource = async () => {
    if (!clipId || preparing) return
    setPreparing(true)
    const id = toast.loading(m.preparingSource)
    try {
      const { clip } = await api.clips.prepareSource(clipId)
      // Only the source fields: unsaved edits stay as they are
      setDetail((d) =>
        d ? { ...d, clip: { ...d.clip, files: clip.files, source_width: clip.source_width, source_height: clip.source_height } } : d,
      )
      toast.success(m.sourceReady, { id })
    } catch (err) {
      toast.error(errorMessage(err, m.sourceFailed), { id })
    } finally {
      setPreparing(false)
    }
  }
  const [analyzing, setAnalyzing] = useState(false)
  /** Face scan for the duo and auto layouts, for a clip made before it was kept (fetches source.mp4 too). */
  const prepareFaces = async () => {
    if (!clipId || analyzing) return
    setAnalyzing(true)
    const id = toast.loading(m.analyzingFaces)
    try {
      const { clip, scenes } = await api.clips.prepareFaces(clipId)
      // Only the scan fields: unsaved edits stay as they are
      setDetail((d) =>
        d ? { ...d, scenes, clip: { ...d.clip, files: clip.files, source_width: clip.source_width, source_height: clip.source_height } } : d,
      )
      toast.success(m.facesDone(scenes?.shots.length || 0), { id })
    } catch (err) {
      toast.error(errorMessage(err, m.facesFailed), { id })
    } finally {
      setAnalyzing(false)
    }
  }
  const enrich = async () => {
    if (!present || !clipId || enriching) return
    if (!present.ai.keywords && !present.ai.emojis) {
      toast.error(m.enableAiFirst)
      return
    }
    // The engine works on the saved words: save pending edits first
    if (dirty && !(await save(true))) return
    setEnriching(true)
    try {
      const res = await api.clips.enrichSubtitles(clipId, { keywords: present.ai.keywords, emojis: present.ai.emojis })
      const nextWords = (res.clip.subtitle_data?.words || []).map((w) => ({ ...w }))
      setDetail((d) => (d ? { ...d, clip: res.clip } : d))
      const snap = { ...present, words: nextWords }
      update(snap)
      setSavedJson(JSON.stringify(snap))
      toast.success(m.aiMarked(present.ai.keywords ? res.keywords : null, present.ai.emojis ? res.emojis : null))
    } catch (err) {
      toast.error(errorMessage(err, m.aiFailed))
    } finally {
      setEnriching(false)
    }
  }

  const startRender = async () => {
    if (!clipId) return
    if (render && (render.status === 'queued' || render.status === 'rendering')) {
      setRenderOpen(true)
      return
    }
    if (dirty && !(await save(true))) return
    setExportedPath(null)
    try {
      const { render_job } = await api.clips.render(clipId)
      setRender(render_job)
      setRenderOpen(true)
    } catch (err) {
      toast.error(errorMessage(err, m.renderStartFailed))
    }
  }

  const cancelRender = async () => {
    if (!render) return
    try {
      setRender((await api.renderJobs.cancel(render.id)).render_job)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const exportClip = async (pickFolder: boolean) => {
    let dest: string | undefined
    if (pickFolder) {
      if (!window.metis) return
      const picked = await window.metis.selectFolder({ title: m.exportDialogTitle, defaultPath: systemInfo?.export_dir })
      if (!picked) return
      dest = picked
    }
    setExporting(true)
    try {
      const res = await api.clips.export([clipId], dest)
      if (res.exported.length > 0) {
        setExportedPath(res.exported[0].path)
        toast.success(m.clipExported)
      } else {
        toast.error(res.skipped[0]?.reason || m.cannotExport)
      }
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setExporting(false)
    }
  }

  const leave = (to: string) => {
    if (dirty) setLeaveTo(to)
    else router.push(to)
  }

  // ---- keyboard shortcuts -------------------------------------------------

  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => undefined)
  keyHandler.current = (e: KeyboardEvent) => {
    const ctrl = e.ctrlKey || e.metaKey
    const key = e.key.toLowerCase()
    if (ctrl && key === 's') {
      e.preventDefault()
      if (!saving) save()
      return
    }
    if (ctrl && key === 'e') {
      e.preventDefault()
      startRender()
      return
    }
    if (isTypingTarget(e.target)) return
    if (ctrl && key === 'z' && !e.shiftKey) {
      e.preventDefault()
      undo()
    } else if (ctrl && (key === 'y' || (key === 'z' && e.shiftKey))) {
      e.preventDefault()
      redo()
    } else if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault()
      togglePlay()
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      const step = e.shiftKey ? 1 : 0.1
      seekTo((videoRef.current?.currentTime || 0) + (e.key === 'ArrowLeft' ? -step : step))
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandler.current(e)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ---- render -------------------------------------------------------------

  const back = { href: BACK_HREF, label: m.back }

  if (loadError && !detail) {
    return (
      <>
        <PageHeader title={m.title} back={back} />
        <Alert
          tone="error"
          title={m.loadErrorTitle}
          style={{ maxWidth: 760 }}
          action={
            <Button variant="secondary" size="sm" onClick={() => router.push('/clips/')} icon={<ArrowLeft size={16} />}>
              {m.backToGallery}
            </Button>
          }
        >
          {loadError}
        </Alert>
      </>
    )
  }

  if (!detail || !present) return <EditorSkeleton />

  const clip = detail.clip
  const activeTemplate = templateById(present.templateId)
  const brand = activeTemplate?.brand_settings || null
  const agentDefaultId = templates.find((t) => (t.used_by_agents || []).some((a) => a.id === clip.agent_id))?.id || null
  const overlaySrc = brand?.overlayUrl ? assetUrl(brand.overlayUrl) : ''
  // Layout: template ⊕ this clip's override. Podcast shows source.mp4; until it exists, the clip stays full
  const layout = resolveLayout(activeTemplate?.layout_settings, present.layout)
  const hasSource = !!clip.files.source
  // Podcast and card show source.mp4; until it exists the preview stays full
  const sourceView = usesSource(layout.mode) && hasSource
  const split = layout.mode === 'split'
  // Duo and auto: a view per scene of the face scan; needs the source and the scan
  const sceneData = detail.scenes || null
  const scenesView = usesScenes(layout.mode) && hasSource && !!sceneData
  const plan = scenePlan(sceneData, layout)
  const companionSrc = split ? assetUrl(layout.companion.videoUrl) : ''
  compLoop.current = { start: companionStart(clip.id, layout.companion.duration), duration: layout.companion.duration }
  const aspect = sourceAspect(clip.source_width, clip.source_height)
  const layoutOverridden = Object.keys(present.layout).length > 0
  const keywordCount = words.filter((w) => w.keyword).length
  const emojiCount = words.filter((w) => w.emoji).length
  const cutSeconds = cutActive ? Math.max(0, sourceDuration - keptDuration(segments)) : 0
  const renderActive = !!render && (render.status === 'queued' || render.status === 'rendering')
  /** The finished file outside the library: a copy from "Ekspor ke…", else the automatic one in the export folder */
  const savedPath = render?.status === 'completed' ? exportedPath || render.exported_path || null : null
  const [savedFolder, savedName] = savedPath ? splitPath(savedPath) : ['', '']
  const canUndo = history.current.past.length > 0
  const canRedo = history.current.future.length > 0
  const fontWeights = FONT_WEIGHTS_MAP[style.fontFamily] || ['Regular']
  const weightOptions = (fontWeights.includes(style.fontWeight) ? fontWeights : [style.fontWeight, ...fontWeights]).map((w) => ({ value: w, label: w }))
  const fullOrFramedOptions = FULL_OR_FRAMED.map((value) => ({ value, label: m.views[value] }))
  const shortcuts: [string, string][] = [
    [m.shortcuts.spaceKey, m.shortcuts.playPause],
    ['← / →', m.shortcuts.step],
    ['Shift + ← / →', m.shortcuts.stepLong],
    ['Ctrl + S', m.shortcuts.save],
    ['Ctrl + Z', m.shortcuts.undo],
    ['Ctrl + Y', m.shortcuts.redo],
    ['Ctrl + E', m.shortcuts.export],
  ]

  /** Header links (back, "+ Klip baru", the jobs pill) ask first while there are unsaved edits. */
  const guardHeaderLinks = (e: React.MouseEvent) => {
    if (!dirty) return
    const href = (e.target as Element).closest('a[href]')?.getAttribute('href')
    if (!href || !href.startsWith('/')) return
    e.preventDefault()
    e.stopPropagation()
    setLeaveTo(href)
  }

  const saveState = saving ? (
    <span className="mc-row mc-gap-4 mc-caption">
      <Spinner size="sm" /> {t.common.saving}
    </span>
  ) : dirty ? (
    <Badge tone="neutral" size="sm" icon={<PenLine size={14} aria-hidden="true" />}>
      {m.unsaved}
    </Badge>
  ) : (
    <span className="mc-row mc-gap-4 mc-caption">
      <Check size={14} aria-hidden="true" /> {t.common.saved}
    </span>
  )

  const renderFooter = !render ? undefined : renderActive ? (
    <Button variant="secondary" icon={<X size={16} />} onClick={cancelRender}>
      {m.cancelRender}
    </Button>
  ) : render.status === 'completed' ? (
    isDesktop() ? (
      <>
        <Button
          variant="secondary"
          icon={<FolderOpen size={16} />}
          onClick={() => {
            const p = savedPath || render.output_path
            if (p) window.metis?.showItemInFolder(p)
          }}
        >
          {t.common.openFolder}
        </Button>
        {!savedPath && (
          <Button variant="secondary" loading={exporting} onClick={() => exportClip(false)}>
            {render.export_error ? m.retryCopy : m.copyToExportFolder}
          </Button>
        )}
        <Button variant="primary" icon={<Download size={16} />} loading={exporting} onClick={() => exportClip(true)}>
          {m.exportTo}
        </Button>
      </>
    ) : !savedPath ? (
      <Button variant="primary" loading={exporting} onClick={() => exportClip(false)}>
        {m.copyToExportFolder}
      </Button>
    ) : undefined
  ) : render.status === 'failed' || render.status === 'cancelled' ? (
    <Button variant="primary" onClick={() => startRender()}>
      {m.retryRender}
    </Button>
  ) : undefined

  return (
    <div style={PAGE_STYLE}>
      <div onClickCapture={guardHeaderLinks}>
        <PageHeader
          back={back}
          title={
            <span className="mc-truncate" style={{ display: 'block' }} title={clip.hook_text || undefined}>
              {clip.hook_text || m.title}
            </span>
          }
          subtitle={
            <span className="mc-row mc-row--wrap mc-gap-8">
              <ScoreBadge score={clip.viral_score} size="sm" />
              <span>
                <span className="mc-mono">{formatClock(clip.duration_seconds)}</span> · {m.wordCount(words.length)}
              </span>
              <span aria-live="polite">{saveState}</span>
            </span>
          }
          actions={
            <>
              <Button variant="secondary" onClick={() => save()} loading={saving} icon={justSaved ? <Check size={16} /> : <Save size={16} />}>
                {justSaved ? t.common.saved : t.common.save}
              </Button>
              <Button variant="primary" onClick={startRender} icon={renderActive ? <Spinner size="sm" /> : <Download size={16} />}>
                {renderActive ? m.renderProgress(Math.round(render?.progress_pct || 0)) : m.export}
              </Button>
            </>
          }
        />
      </div>

      <div style={GRID_STYLE}>
        {/* Word editor */}
        <Card as="section" padding="none" aria-label={m.captionTitle} style={COLUMN_STYLE}>
          <div style={{ padding: '20px 20px 0' }}>
            <CardHeader size="sm" icon={<Type size={18} />} title={m.captionTitle} subtitle={m.captionSubtitle} />
          </div>
          <div style={{ ...COLUMN_BODY, padding: '4px 12px 16px' }}>
            {words.length === 0 ? (
              <EmptyState
                icon={Type}
                title={m.noSubtitles}
                description={m.noSubtitlesBody}
                action={
                  <Button variant="secondary" size="sm" icon={<Plus size={16} />} onClick={() => setWords([{ word: m.firstWordText, start: 0, end: 0.5 }])}>
                    {m.addWord}
                  </Button>
                }
              />
            ) : (
              <div className="mc-stack mc-gap-8">
                {words.map((item, index) => {
                  const active = activeWordIndex === index
                  const filler = ai.fillerWords && isFiller(item.word)
                  const keyword = !!item.keyword && ai.keywords
                  return (
                    <div
                      key={index}
                      className={cx('mc-card', 'mc-card--pad-none', active ? 'mc-card--leaf' : 'mc-card--dew', active && 'mc-card--selected')}
                      aria-current={active || undefined}
                      onClick={(e) => {
                        if (!isTypingTarget(e.target)) seekTo(item.start + style.offsetTime / 1000)
                      }}
                      style={{ padding: '10px 10px 10px 12px', borderRadius: 'var(--r-md)', cursor: 'pointer' }}
                    >
                      <div className="mc-row mc-gap-4">
                        <input
                          type="text"
                          className="mc-input mc-input--sm mc-grow"
                          aria-label={m.wordAria(index + 1)}
                          value={item.word}
                          onChange={(e) => setWords(words.map((w, i) => (i === index ? { ...w, word: e.target.value } : w)), `word-${index}`)}
                          style={{
                            padding: '0 12px',
                            fontWeight: active || item.keyword ? 600 : 400,
                            color: filler ? 'var(--text-subtle)' : keyword ? 'var(--moss)' : undefined,
                            textDecoration: filler ? 'line-through' : undefined,
                          }}
                        />
                        {filler && (
                          <Badge tone="quiet" size="sm" title={m.fillerTitle}>
                            {m.fillerBadge}
                          </Badge>
                        )}
                        <IconButton
                          size="sm"
                          variant={item.keyword ? 'ink' : 'surface'}
                          tooltip="end"
                          label={item.keyword ? m.keywordOn : m.keywordOff}
                          aria-pressed={!!item.keyword}
                          icon={<Star size={16} fill={item.keyword ? 'currentColor' : 'none'} />}
                          onClick={(e) => {
                            e.stopPropagation()
                            setWords(words.map((w, i) => (i === index ? { ...w, keyword: !w.keyword } : w)))
                          }}
                        />
                        <IconButton
                          size="sm"
                          tooltip="end"
                          label={m.deleteWord}
                          icon={<Trash2 size={16} />}
                          onClick={() => setWords(words.filter((_, i) => i !== index))}
                        />
                      </div>
                      <div className="mc-row mc-gap-4" style={{ marginTop: 8 }}>
                        <TimeInput
                          label={m.wordStart(index + 1)}
                          value={item.start}
                          onCommit={(v) => setWords(words.map((w, i) => (i === index ? { ...w, start: v } : w)), `start-${index}`)}
                        />
                        <span className="mc-caption mc-muted" aria-hidden="true">
                          –
                        </span>
                        <TimeInput
                          label={m.wordEnd(index + 1)}
                          value={item.end}
                          onCommit={(v) => setWords(words.map((w, i) => (i === index ? { ...w, end: v } : w)), `end-${index}`)}
                        />
                        <input
                          type="text"
                          className="mc-input mc-input--sm"
                          value={item.emoji || ''}
                          placeholder={m.emojiPlaceholder}
                          aria-label={m.emojiAria(index + 1)}
                          title={m.emojiTitle}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            const v = Array.from(e.target.value.trim()).slice(-2).join('')
                            setWords(words.map((w, i) => (i === index ? { ...w, emoji: v || null } : w)), `emoji-${index}`)
                          }}
                          style={{ width: 64, padding: '0 8px', textAlign: 'center' }}
                        />
                        <span className="mc-grow" />
                        <IconButton
                          size="sm"
                          tooltip="end"
                          label={m.insertWord}
                          icon={<Plus size={16} />}
                          onClick={(e) => {
                            e.stopPropagation()
                            const next = [...words]
                            next.splice(index + 1, 0, { word: m.insertedWordText, start: item.end, end: item.end + 0.5 })
                            setWords(next)
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </Card>

        {/* Preview */}
        <Stage style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
          <div className="mc-row mc-gap-4">
            <IconButton variant="ghost" size="sm" label={m.undo} icon={<Undo2 size={16} />} onClick={undo} disabled={!canUndo} />
            <IconButton variant="ghost" size="sm" label={m.redo} icon={<Redo2 size={16} />} onClick={redo} disabled={!canRedo} />
            <IconButton variant="ghost" size="sm" label={m.shortcuts.title} icon={<Keyboard size={16} />} onClick={() => setShowShortcuts(true)} />
            <span className="mc-grow" />
            {cutActive && (
              <Tooltip label={m.cutTooltip} placement="end">
                <span className="mc-row mc-gap-4 mc-caption mc-muted">
                  <Scissors size={14} aria-hidden="true" /> {m.cutSeconds(cutSeconds.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }))}
                </span>
              </Tooltip>
            )}
            <IconButton
              variant="ghost"
              size="sm"
              tooltip="end"
              label={m.fullscreen}
              icon={<Maximize size={16} />}
              onClick={() => containerRef.current?.requestFullscreen().catch(() => undefined)}
            />
          </div>

          <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div
              ref={containerRef}
              onClick={togglePlay}
              style={{
                height: '100%',
                maxWidth: '100%',
                aspectRatio: '9 / 16',
                position: 'relative',
                containerType: 'inline-size',
                borderRadius: 'var(--r-md)',
                background: 'var(--ink-soft)',
                overflow: 'hidden',
                cursor: 'pointer',
              }}
            >
              {clip.files.raw ? (
                // Same layout component as the Remotion render (lib/presets/LayoutStage.tsx): preview == render
                <LayoutStage
                  layout={sourceView || split || scenesView ? layout : { ...layout, mode: 'full' }}
                  scenes={scenesView ? sceneData : null}
                  aspect={aspect}
                  title={present.title}
                  channel={detail.channel}
                  backgroundImageUrl={assetUrl(layout.background.imageUrl)}
                  avatarUrl={assetUrl(layout.card.avatarUrl)}
                  fullFit="contain"
                  time={currentTime}
                  words={words}
                  offsetMs={style.offsetTime}
                  renderVideo={(role, videoStyle, hidden) =>
                    role === 'duoTop' || role === 'duoBottom' || role === 'framed' ? (
                      <video
                        ref={role === 'duoTop' ? duoTopRef : role === 'duoBottom' ? duoBottomRef : framedRef}
                        src={mediaUrl(clip.id, 'source')}
                        muted
                        playsInline
                        preload="auto"
                        aria-hidden="true"
                        onLoadedMetadata={(e) => {
                          e.currentTarget.currentTime = timeRef.current
                          if (videoRef.current && !videoRef.current.paused) e.currentTarget.play().catch(() => undefined)
                        }}
                        style={{ ...videoStyle, visibility: hidden ? 'hidden' : undefined }}
                      />
                    ) : role === 'companion' ? (
                      companionSrc ? (
                        <video
                          key={companionSrc}
                          ref={compRef}
                          src={companionSrc}
                          loop
                          muted
                          playsInline
                          preload="auto"
                          aria-hidden="true"
                          onLoadedMetadata={(e) => {
                            syncCompanion(timeRef.current, true)
                            if (videoRef.current && !videoRef.current.paused) e.currentTarget.play().catch(() => undefined)
                          }}
                          style={videoStyle}
                        />
                      ) : (
                        <div
                          className="mc-caption"
                          style={{ ...videoStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, textAlign: 'center', color: 'var(--on-ink)', background: 'var(--ink-soft)' }}
                        >
                          {m.companionNotUploaded}
                        </div>
                      )
                    ) : role === 'main' ? (
                      <video
                        key={sourceView ? 'source' : 'raw'}
                        ref={videoRef}
                        src={sourceView ? mediaUrl(clip.id, 'source') : mediaUrl(clip.id, 'raw', clip.updated_at)}
                        poster={!sourceView && clip.files.thumbnail ? mediaUrl(clip.id, 'thumbnail', clip.updated_at) : undefined}
                        onLoadedMetadata={(e) => {
                          const v = e.currentTarget
                          setDuration(v.duration || clip.duration_seconds)
                          // Switching between raw and source keeps the playhead
                          if (timeRef.current > 0 && timeRef.current < (v.duration || Infinity)) v.currentTime = timeRef.current
                          setIsPlaying(!v.paused)
                        }}
                        onTimeUpdate={() => {
                          if (isPlaying) return
                          const t = videoRef.current?.currentTime || 0
                          timeRef.current = t
                          setCurrentTime(t)
                        }}
                        onPlay={() => {
                          setIsPlaying(true)
                          bgRef.current?.play().catch(() => undefined)
                          compRef.current?.play().catch(() => undefined)
                          syncDuo(videoRef.current?.currentTime || 0, true)
                          playDuo(true)
                        }}
                        onPause={() => {
                          setIsPlaying(false)
                          bgRef.current?.pause()
                          compRef.current?.pause()
                          playDuo(false)
                          syncDuo(videoRef.current?.currentTime || 0, true)
                        }}
                        onEnded={() => setIsPlaying(false)}
                        playsInline
                        preload="auto"
                        // Duo and auto modes: out of sight in other views' scenes, still playing (it carries the sound)
                        style={{ ...videoStyle, visibility: hidden ? 'hidden' : undefined }}
                      />
                    ) : (
                      <video
                        ref={bgRef}
                        src={mediaUrl(clip.id, 'source')}
                        muted
                        playsInline
                        preload="auto"
                        aria-hidden="true"
                        onLoadedMetadata={(e) => {
                          e.currentTarget.currentTime = timeRef.current
                        }}
                        style={videoStyle}
                      />
                    )
                  }
                />
              ) : (
                <div
                  className="mc-caption mc-muted"
                  style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, textAlign: 'center' }}
                >
                  {m.videoNotReady}
                </div>
              )}

              <LogoOverlay src={overlaySrc} brand={brand} />

              {/* Same component as the Remotion render (lib/presets/CaptionLayer.tsx): preview == render */}
              <CaptionLayer words={words} time={currentTime} style={style} ai={ai} />
            </div>
          </div>

          <div className="mc-row mc-gap-12">
            <IconButton
              variant="accent"
              label={isPlaying ? m.pause : m.play}
              icon={isPlaying ? <Pause size={18} /> : <Play size={18} />}
              onClick={togglePlay}
            />
            <span className="mc-mono" style={{ whiteSpace: 'nowrap' }}>
              {formatClock(currentTime)} <span className="mc-muted">/ {formatClock(sourceDuration)}</span>
            </span>
            <Timeline time={currentTime} duration={sourceDuration} segments={segments} onSeek={seekTo} />
          </div>
        </Stage>

        {/* Style panel */}
        <Card as="section" padding="none" aria-label={m.propsTitle} style={COLUMN_STYLE}>
          <div style={{ padding: '20px 20px 0' }}>
            <CardHeader size="sm" icon={<Palette size={18} />} title={m.propsTitle} subtitle={m.propsSubtitle} />
          </div>

          <div className="mc-stack mc-gap-24" style={{ ...COLUMN_BODY, padding: '4px 20px 20px' }}>
            <PanelSection
              title="Brand Template"
              action={
                <button type="button" className="mc-link" onClick={() => leave('/brand-template/')}>
                  {m.manageTemplates}
                </button>
              }
            >
              <SelectField
                aria-label={m.templateSelect}
                hint={m.templateHint}
                value={present.templateId || ''}
                options={[
                  ...(present.templateId ? [] : [{ value: '', label: m.builtInTemplate }]),
                  ...(templates.length ? templates : activeTemplate ? [activeTemplate] : []).map((tpl) => ({
                    value: tpl.id,
                    label: tpl.id === agentDefaultId ? m.workspaceDefault(tpl.name) : tpl.name,
                  })),
                ]}
                onChange={(e) => e.target.value && chooseTemplate(e.target.value)}
              />
              <div>
                <Button variant="ghost" size="sm" onClick={() => setConfirmReset(true)} icon={<RotateCcw size={16} />}>
                  {m.resetToTemplate}
                </Button>
              </div>
            </PanelSection>

            <Divider />

            <PanelSection
              title={m.layoutTitle}
              action={
                layoutOverridden ? (
                  <button type="button" className="mc-link" onClick={() => update({ ...present, layout: {} })}>
                    {m.followTemplate}
                  </button>
                ) : (
                  <button type="button" className="mc-link" onClick={() => leave('/brand-template/#layout')}>
                    {m.adjustStyle}
                  </button>
                )
              }
            >
              <ChoiceChips<LayoutMode>
                ariaLabel={m.videoView}
                size="sm"
                options={LAYOUT_MODES.map((value) => ({ value, label: m.layoutModes[value] }))}
                value={layout.mode}
                onChange={(mode) => setLayout({ mode })}
              />
              <p className="mc-caption mc-muted">{m.layoutHints[layout.mode]}</p>
              {usesScenes(layout.mode) && (
                <>
                  {!sceneData ? (
                    <Alert
                      tone="info"
                      title={m.facesMissingTitle}
                      icon={<Film size={18} aria-hidden="true" />}
                      action={
                        <Button size="sm" variant="secondary" loading={analyzing} onClick={prepareFaces}>
                          {m.analyzeNow}
                        </Button>
                      }
                    >
                      {m.facesMissingBody}
                    </Alert>
                  ) : layout.mode === 'duo' && !plan.some((s) => s.view === 'duo') ? (
                    <Alert tone="info" title={m.noDuoTitle}>
                      {m.noDuoBody}
                    </Alert>
                  ) : (
                    <SceneStrip plan={plan} duration={sourceDuration} time={currentTime} onSeek={seekTo} />
                  )}
                  {layout.mode === 'auto' && (
                    <>
                      <Field label={m.autoSolo}>
                        <ChoiceChips<'full' | 'framed'>
                          ariaLabel={m.autoSoloAria}
                          size="sm"
                          options={fullOrFramedOptions}
                          value={layout.auto.solo}
                          onChange={(solo) => setLayout({ auto: { solo } })}
                        />
                      </Field>
                      <Field label={m.autoDuo}>
                        <ChoiceChips<SceneView>
                          ariaLabel={m.autoDuoAria}
                          size="sm"
                          options={VIEWS.map((value) => ({ value, label: m.views[value] }))}
                          value={layout.auto.duo}
                          onChange={(duo) => setLayout({ auto: { duo } })}
                        />
                      </Field>
                      <Field label={m.autoGroup} hint={m.autoGroupHint}>
                        <ChoiceChips<'full' | 'framed'>
                          ariaLabel={m.autoGroupAria}
                          size="sm"
                          options={fullOrFramedOptions}
                          value={layout.auto.group}
                          onChange={(group) => setLayout({ auto: { group } })}
                        />
                      </Field>
                      <Field label={m.autoNone} hint={m.autoNoneHint}>
                        <ChoiceChips<'full' | 'framed'>
                          ariaLabel={m.autoNoneAria}
                          size="sm"
                          options={fullOrFramedOptions}
                          value={layout.auto.none}
                          onChange={(none) => setLayout({ auto: { none } })}
                        />
                      </Field>
                    </>
                  )}
                  {(layout.mode === 'duo' || layout.auto.duo === 'duo') && (
                    <>
                      <Field label={m.topPanel} hint={m.topPanelHint}>
                        <ChoiceChips<DuoTop>
                          ariaLabel={m.topPanelAria}
                          size="sm"
                          options={DUO_TOPS.map((value) => ({ value, label: m.duoTop[value] }))}
                          value={layout.duo.top}
                          onChange={(top) => setLayout({ duo: { top } })}
                        />
                      </Field>
                      <Slider
                        label={m.faceSize}
                        min={LAYOUT_LIMITS.faceSize.min}
                        max={LAYOUT_LIMITS.faceSize.max}
                        step={0.01}
                        value={layout.duo.faceSize}
                        format={(v) => `${Math.round(v * 100)}%`}
                        hint={m.faceSizeHint}
                        onChange={(faceSize) => setLayout({ duo: { faceSize } }, 'duo-face')}
                      />
                      <Slider
                        label={m.topPanelHeight}
                        min={LAYOUT_LIMITS.split.min}
                        max={LAYOUT_LIMITS.split.max}
                        step={0.01}
                        value={layout.duo.split}
                        format={(v) => `${Math.round(v * 100)}%`}
                        onChange={(splitShare) => setLayout({ duo: { split: splitShare } }, 'duo-split')}
                      />
                    </>
                  )}
                </>
              )}
              {(usesSource(layout.mode) || (layout.mode === 'auto' && plan.some((s) => s.view === 'framed'))) && (
                <>
                  {layout.mode === 'auto' && <span className="mc-label">{m.views.framed}</span>}
                  {usesSource(layout.mode) && !hasSource && (
                    <Alert
                      tone="info"
                      title={m.sourceMissingTitle}
                      icon={<Film size={18} aria-hidden="true" />}
                      action={
                        <Button size="sm" variant="secondary" loading={preparing} onClick={prepareSource}>
                          {m.prepareNow}
                        </Button>
                      }
                    >
                      {m.sourceMissingBody}
                    </Alert>
                  )}
                  {layout.header.enabled && layout.header.source === 'title' ? (
                    <TextAreaField
                      label={layout.mode === 'card' ? m.postText : m.titleAbove}
                      value={present.title}
                      maxLength={300}
                      rows={3}
                      onChange={(e) => setTitle(e.target.value)}
                      hint={m.titleHint}
                    />
                  ) : (
                    <p className="mc-caption mc-muted">
                      {layout.header.enabled ? m.titleFixed : m.titleOff}
                    </p>
                  )}
                  <Field label={m.videoRatio}>
                    <ChoiceChips<FrameRatio>
                      ariaLabel={m.videoRatio}
                      size="sm"
                      options={RATIOS.map((value) => ({ value, label: value === 'source' ? m.ratioSource : value }))}
                      value={layout.frame.ratio}
                      onChange={(ratio) => setLayout({ frame: { ratio } })}
                    />
                  </Field>
                  <Slider
                    label={layout.mode === 'card' ? m.cardPosition : m.videoPosition}
                    min={LAYOUT_LIMITS.frameY.min}
                    max={LAYOUT_LIMITS.frameY.max}
                    value={layout.frame.y}
                    format={(v) => `${Math.round(v)}px`}
                    onChange={(y) => setLayout({ frame: { y } }, 'frame-y')}
                  />
                  {layout.frame.ratio !== 'source' && (
                    <Slider
                      label={m.focusX}
                      min={0}
                      max={1}
                      step={0.05}
                      value={layout.frame.focusX}
                      format={(v) => `${Math.round(v * 100)}%`}
                      onChange={(focusX) => setLayout({ frame: { focusX } }, 'frame-focus')}
                    />
                  )}
                </>
              )}
              {split && (
                <>
                  {!layout.companion.videoUrl && (
                    <Alert
                      tone="info"
                      title={m.companionMissingTitle}
                      icon={<Film size={18} aria-hidden="true" />}
                      action={
                        <Button size="sm" variant="secondary" onClick={() => leave('/brand-template/#layout')}>
                          {m.uploadInBrand}
                        </Button>
                      }
                    >
                      {m.companionMissingBody}
                    </Alert>
                  )}
                  <Slider
                    label={m.speakerFocusY}
                    min={0}
                    max={1}
                    step={0.05}
                    value={layout.companion.focusY}
                    format={(v) => `${Math.round(v * 100)}%`}
                    hint={m.speakerFocusHint}
                    onChange={(focusY) => setLayout({ companion: { focusY } }, 'companion-focus')}
                  />
                  <Slider
                    label={m.speakerHeight}
                    min={LAYOUT_LIMITS.split.min}
                    max={LAYOUT_LIMITS.split.max}
                    step={0.01}
                    value={layout.companion.split}
                    format={(v) => `${Math.round(v * 100)}%`}
                    onChange={(splitShare) => setLayout({ companion: { split: splitShare } }, 'companion-split')}
                  />
                </>
              )}
              <ToggleSwitch
                label={m.zoom}
                hint={m.zoomHint}
                checked={layout.zoom.enabled}
                onChange={(enabled) => setLayout({ zoom: { enabled } })}
              />
              {layout.zoom.enabled && (
                <>
                  <ChoiceChips<ZoomStyle>
                    ariaLabel={m.zoomWhen}
                    size="sm"
                    options={ZOOM_STYLES.map((value) => ({ value, label: m.zoomStyles[value] }))}
                    value={layout.zoom.style}
                    onChange={(zoomStyle) => setLayout({ zoom: { style: zoomStyle } })}
                  />
                  {layout.zoom.style === 'keywords' && keywordCount === 0 && (
                    <p className="mc-caption mc-muted">
                      {m.noKeywordsForZoom(m.zoomStyles.sentences)}
                    </p>
                  )}
                </>
              )}
            </PanelSection>

            <Divider />

            <PanelSection title={m.speakerTitle}>
              <ToggleSwitch
                label={m.showSpeaker}
                hint={m.showSpeakerHint}
                checked={layout.speaker.enabled}
                onChange={(enabled) => setLayout({ speaker: { enabled } })}
              />
              {layout.speaker.enabled && (
                <>
                  <InputField
                    label={m.speakerName}
                    value={layout.speaker.name}
                    maxLength={60}
                    placeholder={m.speakerNamePlaceholder}
                    onChange={(e) => setLayout({ speaker: { name: e.target.value } }, 'speaker-name')}
                  />
                  <InputField
                    label={m.speakerRole}
                    value={layout.speaker.role}
                    maxLength={60}
                    placeholder={m.speakerRolePlaceholder}
                    onChange={(e) => setLayout({ speaker: { role: e.target.value } }, 'speaker-role')}
                  />
                  <div>
                    <Button variant="secondary" size="sm" loading={suggesting} onClick={suggestSpeaker} icon={<UserRound size={16} />}>
                      {m.suggestWithAi}
                    </Button>
                  </div>
                  {speakerIdeas && speakerIdeas.length > 0 && (
                    <Field label={m.aiSuggestions} hint={m.aiSuggestionsHint}>
                      <div className="mc-row mc-gap-8" style={{ flexWrap: 'wrap' }}>
                        {speakerIdeas.map((idea) => (
                          <Chip
                            key={`${idea.name}|${idea.role}`}
                            size="sm"
                            selected={layout.speaker.name === idea.name && layout.speaker.role === idea.role}
                            onClick={() => setLayout({ speaker: { name: idea.name, role: idea.role } })}
                          >
                            {idea.role ? `${idea.name} · ${idea.role}` : idea.name}
                          </Chip>
                        ))}
                      </div>
                    </Field>
                  )}
                  {!layout.speaker.name.trim() && <p className="mc-caption mc-muted">{m.speakerEmpty}</p>}
                </>
              )}
            </PanelSection>

            <Divider />

            <PanelSection title={m.animationTitle}>
              <p className="mc-caption mc-muted">{m.animationHint}</p>
              <div role="group" aria-label={m.presetGroup} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {presets.map((preset) => {
                  const selected = style.mode === preset.id
                  return (
                    // Preset art is subtitle content (made for video), so it sits on an ink tile; the ring marks the choice.
                    <div
                      key={preset.id}
                      className={cx('mc-card', 'mc-card--pad-none', selected && 'mc-card--selected')}
                      style={{ display: 'grid', padding: 4, borderRadius: 'var(--r-md)' }}
                    >
                      <div className="mc-card mc-card--ink mc-card--pad-none" style={{ display: 'grid', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
                        {preset.renderButton(selected, () => setStyle(presetSwitch(style, preset.id)))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </PanelSection>

            <Divider />

            <PanelSection title={m.aiTitle}>
              <p className="mc-caption mc-muted">{m.aiHint}</p>
              <ToggleSwitch label={m.fillerToggle} checked={ai.fillerWords} onChange={(v) => setAi({ fillerWords: v })} />
              <ToggleSwitch label={m.pausesToggle} checked={ai.pauses} onChange={(v) => setAi({ pauses: v })} />
              <ToggleSwitch label={m.keywordsToggle} checked={ai.keywords} onChange={(v) => setAi({ keywords: v })} />
              <ToggleSwitch label={m.emojisToggle} checked={ai.emojis} onChange={(v) => setAi({ emojis: v })} />
              {(ai.keywords || ai.emojis) && (
                <div className="mc-stack mc-gap-8">
                  <span className="mc-caption mc-muted">
                    {ai.keywords && m.keywordCount(keywordCount)}
                    {ai.keywords && ai.emojis && ' · '}
                    {ai.emojis && m.emojiCount(emojiCount)} {m.editablePerWord}
                  </span>
                  <div>
                    <Button variant="secondary" size="sm" loading={enriching} onClick={enrich} icon={<ScanText size={16} />}>
                      {keywordCount + emojiCount > 0 ? m.reanalyze : m.analyze}
                    </Button>
                  </div>
                </div>
              )}
            </PanelSection>

            <Divider />

            <PanelSection
              title={m.fontTitle}
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<RotateCcw size={16} />}
                  title={m.presetDefaultTitle(getPreset(style.mode).name)}
                  onClick={() => setStyle(presetSwitch(style, style.mode))}
                >
                  {m.presetDefault}
                </Button>
              }
            >
              <div className="mc-field">
                <span className="mc-field__label">{m.font}</span>
                <Dropdown
                  width="100%"
                  triggerClassName="mc-input"
                  triggerLabel={m.fontTrigger(style.fontFamily)}
                  trigger={
                    <span className="mc-row mc-row--between" style={{ width: '100%' }}>
                      <span className="mc-truncate" style={{ fontFamily: `'${style.fontFamily}'` }}>
                        {style.fontFamily}
                      </span>
                      <ChevronDown size={16} aria-hidden="true" />
                    </span>
                  }
                  items={SUPPORTED_FONTS.map((f) => ({
                    id: f,
                    label: <span style={{ fontFamily: `'${f}'`, fontSize: 15 }}>{f}</span>,
                    selected: f === style.fontFamily,
                    onClick: () => {
                      const available = FONT_WEIGHTS_MAP[f] || ['Regular']
                      const weight = available.includes(style.fontWeight) ? style.fontWeight : available.includes('Regular') ? 'Regular' : available[0]
                      setStyle({ fontFamily: f, fontWeight: weight })
                    },
                  }))}
                />
              </div>
              <SelectField label={m.weight} value={style.fontWeight} options={weightOptions} onChange={(e) => setStyle({ fontWeight: e.target.value })} />
              <ColorPicker label={m.fontColor} color={style.fontColor} onChange={(v) => setStyle({ fontColor: v }, 'fontColor')} />
              <Slider label={m.fontSize} min={20} max={80} value={style.fontSize} format={(v) => `${v}px`} onChange={(v) => setStyle({ fontSize: v }, 'fontSize')} />
              <Slider
                label={m.sync}
                hint={m.syncHint}
                min={-1000}
                max={1000}
                step={50}
                value={style.offsetTime}
                format={(v) => `${v} ms`}
                onChange={(v) => setStyle({ offsetTime: v }, 'offsetTime')}
              />
            </PanelSection>

            <Divider />

            <PanelSection title={m.positionTitle}>
              <CaptionPositionControls style={style} emoji={ai.emojis} onChange={(patch, key) => setStyle(patch, key)} />
            </PanelSection>

            <Divider />

            <PanelSection title={m.highlightTitle}>
              <ColorPicker label={m.highlightColor} color={style.highlightColor} onChange={(v) => setStyle({ highlightColor: v }, 'highlightColor')} />
              <div className="mc-field">
                <span className="mc-field__label">{m.extraFormat}</span>
                <div role="group" aria-label={m.extraFormat} className="mc-row mc-row--wrap mc-gap-8">
                  <Chip size="sm" selected={style.isItalic} onClick={() => setStyle({ isItalic: !style.isItalic })}>
                    {m.italic}
                  </Chip>
                  <Chip size="sm" selected={style.isUnderline} onClick={() => setStyle({ isUnderline: !style.isUnderline })}>
                    {m.underline}
                  </Chip>
                  <Chip size="sm" selected={style.isUppercase} onClick={() => setStyle({ isUppercase: !style.isUppercase })}>
                    {m.uppercase}
                  </Chip>
                </div>
              </div>
            </PanelSection>

            <Divider />

            <PanelSection title={m.strokeTitle}>
              <ColorPicker label={m.strokeColor} color={style.strokeColor} onChange={(v) => setStyle({ strokeColor: v }, 'strokeColor')} />
              <Slider label={m.strokeWidth} min={0} max={20} value={style.strokeWidth} format={(v) => `${v}px`} onChange={(v) => setStyle({ strokeWidth: v }, 'strokeWidth')} />
              <ToggleSwitch label={m.shadow} checked={style.hasShadow} onChange={(v) => setStyle({ hasShadow: v })} />
              {style.hasShadow && (
                <>
                  <ColorPicker label={m.shadowColor} color={style.shadowColor} onChange={(v) => setStyle({ shadowColor: v }, 'shadowColor')} />
                  <Slider label={m.shadowX} min={-50} max={50} value={style.shadowX} format={(v) => `${v}px`} onChange={(v) => setStyle({ shadowX: v }, 'shadowX')} />
                  <Slider label={m.shadowY} min={-50} max={50} value={style.shadowY} format={(v) => `${v}px`} onChange={(v) => setStyle({ shadowY: v }, 'shadowY')} />
                  <Slider label={m.blur} min={0} max={50} value={style.shadowBlur} format={(v) => `${v}px`} onChange={(v) => setStyle({ shadowBlur: v }, 'shadowBlur')} />
                </>
              )}
            </PanelSection>
          </div>
        </Card>
      </div>

      {/* Render / export modal */}
      <Modal isOpen={renderOpen} onClose={() => setRenderOpen(false)} title={m.exportTitle} size="md" footer={renderFooter}>
        {render ? (
          <div className="mc-stack">
            <div className="mc-row mc-gap-12">
              {render.status === 'completed' ? (
                <CheckCircle2 size={20} aria-hidden="true" />
              ) : render.status === 'failed' || render.status === 'cancelled' ? (
                <XCircle size={20} aria-hidden="true" />
              ) : (
                <Spinner />
              )}
              <span className="mc-label">{RENDER_STATUS[render.status]}</span>
            </div>
            {renderActive && (
              <>
                <ProgressBar value={render.progress_pct} label={m.renderProgressLabel} showValue />
                {render.message && (
                  <p className="mc-caption" role="status">
                    {render.message}
                  </p>
                )}
                <p className="mc-caption mc-muted">{m.canClose}</p>
              </>
            )}
            {render.status === 'failed' && render.error && (
              <Alert tone="error" style={{ wordBreak: 'break-word' }}>
                {render.error}
              </Alert>
            )}
            {savedPath && (
              <Alert tone="success" title={exportedPath ? m.copiedToFolder : m.savedInExportFolder}>
                <span className="mc-mono" style={{ display: 'block', wordBreak: 'break-all' }}>
                  {savedFolder}
                </span>
                <span className="mc-caption" style={{ display: 'block', wordBreak: 'break-all' }}>
                  {savedName}
                </span>
              </Alert>
            )}
            {savedPath && !exportedPath && (
              <p className="mc-caption mc-muted">{m.changeFolderHint}</p>
            )}
            {render.status === 'completed' && !savedPath && render.export_error && (
              <Alert tone="error" title={m.notCopiedTitle} style={{ wordBreak: 'break-word' }}>
                {render.export_error}
              </Alert>
            )}
            {render.status === 'completed' && !savedPath && render.output_path && (
              <Card tone="dew" padding="sm">
                <span className="mc-mono mc-caption" style={{ wordBreak: 'break-all' }}>
                  {render.output_path}
                </span>
              </Card>
            )}
          </div>
        ) : (
          <Skeleton height={60} radius="md" />
        )}
      </Modal>

      <Modal isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} title={m.shortcuts.title}>
        <KeyValueList items={shortcuts.map(([k, v]) => ({ id: k, key: v, value: <Kbd>{k}</Kbd> }))} />
      </Modal>

      <ConfirmModal
        isOpen={confirmReset}
        title={m.resetConfirmTitle}
        message={m.resetConfirmBody(activeTemplate?.name || m.builtIn)}
        confirmLabel={m.resetConfirm}
        confirmIcon={<RotateCcw size={16} />}
        danger
        onConfirm={resetToTemplate}
        onClose={() => setConfirmReset(false)}
      />

      <ConfirmModal
        isOpen={!!leaveTo}
        title={m.unsavedTitle}
        message={m.unsavedBody}
        confirmLabel={m.saveAndLeave}
        confirmIcon={<Save size={16} />}
        cancelLabel={t.common.cancel}
        loading={saving}
        onConfirm={async () => {
          if (await save(true)) router.push(leaveTo || '/clips/')
        }}
        onClose={() => setLeaveTo(null)}
      >
        <div>
          <Button variant="danger" size="sm" icon={<Trash2 size={16} />} onClick={() => router.push(leaveTo || '/clips/')}>
            {m.leaveWithoutSaving}
          </Button>
        </div>
      </ConfirmModal>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Small editor parts
// ---------------------------------------------------------------------------

function PanelSection({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mc-stack mc-gap-12">
      <div className="mc-row mc-row--between mc-gap-8">
        <h3 className="mc-body-lg mc-label">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

/**
 * Scrub track on the stage (DESIGN.md §8.17): kept ranges in ink-line, cut ranges (fillers, pauses)
 * leave the darker track visible, the playhead is a white line. ← / → seek via the editor shortcuts.
 */
function Timeline({ time, duration, segments, onSeek }: { time: number; duration: number; segments: Segment[]; onSeek: (t: number) => void }) {
  const m = useT().editor
  const track = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const pct = (t: number) => (duration > 0 ? Math.min(100, Math.max(0, (t / duration) * 100)) : 0)
  const seekAt = (clientX: number) => {
    const el = track.current
    if (!el || !(duration > 0)) return
    const r = el.getBoundingClientRect()
    onSeek(((clientX - r.left) / r.width) * duration)
  }
  return (
    <div
      ref={track}
      role="slider"
      tabIndex={0}
      aria-label={m.timeline}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration * 100) / 100}
      aria-valuenow={Math.round(time * 100) / 100}
      aria-valuetext={m.timeOf(formatClock(time), formatClock(duration))}
      className="mc-grow"
      onPointerDown={(e) => {
        dragging.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        seekAt(e.clientX)
      }}
      onPointerMove={(e) => {
        if (dragging.current) seekAt(e.clientX)
      }}
      onPointerUp={() => {
        dragging.current = false
      }}
      onPointerCancel={() => {
        dragging.current = false
      }}
      style={{ position: 'relative', height: 40, borderRadius: 'var(--r-sm)', background: 'var(--ink-soft)', overflow: 'hidden', cursor: 'pointer', touchAction: 'none' }}
    >
      {segments.map((s) => (
        <span
          key={`${s.start}-${s.end}`}
          aria-hidden="true"
          style={{ position: 'absolute', top: 0, bottom: 0, left: `${pct(s.start)}%`, width: `${pct(s.end) - pct(s.start)}%`, background: 'var(--ink-line)' }}
        />
      ))}
      <span aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0, left: `${pct(time)}%`, width: 2, marginLeft: -1, background: 'var(--on-ink)' }}>
        <span style={{ position: 'absolute', top: 2, left: '50%', width: 10, height: 10, marginLeft: -5, borderRadius: 'var(--r-full)', background: 'var(--on-ink)' }} />
      </span>
    </div>
  )
}

/** Scene strip colors: distinct greens, the darkest for the panels */
const VIEW_COLORS: Record<SceneView, string> = { full: 'var(--leaf-strong)', duo: 'var(--moss)', framed: 'var(--sage)' }

/**
 * The clip's scenes (duo and auto layouts) as a strip, one block per scene in its view's color, with
 * the playhead; a block seeks to its scene. The legend says how long each view is on screen.
 */
function SceneStrip({ plan, duration, time, onSeek }: { plan: Scene[]; duration: number; time: number; onSeek: (t: number) => void }) {
  const m = useT().editor
  const total = duration > 0 ? duration : plan.length ? plan[plan.length - 1].end : 0
  const pct = (t: number) => (total > 0 ? Math.min(100, Math.max(0, (t / total) * 100)) : 0)
  const seconds = viewSeconds(plan)
  const shown = SCENE_VIEWS.filter((v) => seconds[v] > 0)
  return (
    <div className="mc-stack mc-gap-8">
      <span className="mc-label">{m.scenes}</span>
      <div style={{ position: 'relative', height: 28 }}>
        {plan.map((s, i) => (
          <button
            key={`${s.start}-${i}`}
            type="button"
            title={`${m.views[s.view]} · ${formatClock(s.start)}–${formatClock(s.end)}`}
            aria-label={m.sceneAria(i + 1, m.views[s.view], formatClock(s.start), formatClock(s.end))}
            onClick={() => onSeek(s.start + 0.01)}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${pct(s.start)}%`,
              width: `calc(${pct(s.end) - pct(s.start)}% - 2px)`,
              minWidth: 2,
              padding: 0,
              border: 0,
              borderRadius: 'var(--r-xs)',
              background: VIEW_COLORS[s.view],
              boxShadow: 'inset 0 0 0 1px var(--line-input)', // the light views stay visible on the card
              cursor: 'pointer',
            }}
          />
        ))}
        <span
          aria-hidden="true"
          style={{ position: 'absolute', top: -3, bottom: -3, left: `${pct(time)}%`, width: 2, marginLeft: -1, borderRadius: 1, background: 'var(--ink)', pointerEvents: 'none' }}
        />
      </div>
      <div className="mc-row mc-gap-12" style={{ flexWrap: 'wrap' }}>
        {shown.map((v) => (
          <span key={v} className="mc-row mc-gap-4 mc-caption">
            <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: VIEW_COLORS[v], boxShadow: 'inset 0 0 0 1px var(--line-input)' }} />
            {m.viewSeconds(m.views[v], Math.round(seconds[v]))}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Seconds input (2 decimals) committed on every valid value. */
function TimeInput({ value, onCommit, label }: { value: number; onCommit: (v: number) => void; label: string }) {
  const [text, setText] = useState(value.toFixed(2))
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setText(Number(value).toFixed(2))
  }, [value])
  return (
    <input
      type="number"
      className="mc-input mc-input--sm mc-input--mono"
      aria-label={label}
      step={0.05}
      min={0}
      value={text}
      onClick={(e) => e.stopPropagation()}
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false
        setText(Number(value).toFixed(2))
      }}
      onChange={(e) => {
        setText(e.target.value)
        const n = parseFloat(e.target.value)
        if (isFinite(n) && n >= 0) onCommit(Math.round(n * 1000) / 1000)
      }}
      style={{ width: 80, padding: '0 8px 0 12px' }}
    />
  )
}
