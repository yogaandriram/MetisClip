'use client'

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  Download,
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
  X,
  XCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { presets } from '@/lib/presets'
import { CaptionLayer } from '@/lib/presets/CaptionLayer'
import { LogoOverlay } from '@/lib/presets/BrandOverlay'
import { type CaptionStyle, BASE_CAPTION_STYLE, getPreset, presetSwitch, resolveCaptionStyle } from '@/lib/presets/defaults'
import { type AiCaptionSettings, type Segment, DEFAULT_AI_SETTINGS, computeKeepSegments, isCut, isFiller, keptDuration, nextKeptTime, resolveAi } from '@/lib/presets/captions'
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
  IconButton,
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
  ToggleSwitch,
  Tooltip,
} from '@/components/ui'
import { cx } from '@/lib/cx'
import { SUPPORTED_FONTS, FONT_WEIGHTS_MAP } from '@/lib/constants'
import { useEngine } from '@/contexts/EngineContext'
import { useEngineEvents } from '@/hooks/useEngineEvents'
import { api, type BrandTemplate, type ClipDetail, type RenderJob, type SubtitleWord } from '@/lib/engine'
import { assetUrl, isDesktop, mediaUrl } from '@/lib/media'
import { RENDER_STATUS, errorMessage, formatClock } from '@/lib/format'

// Style model: lib/presets/defaults.ts (shared with the Brand Template page and the render).
// `ai` is the clip's AI subtitle settings (brand ai_settings unless overridden; saved in subtitle_style.ai).
/** templateId: the brand template in effect (null = built-in defaults) */
type Snapshot = { words: SubtitleWord[]; style: CaptionStyle; ai: AiCaptionSettings; templateId: string | null }

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

const BACK = { href: '/clips/', label: 'Kembali ke Hasil Clip' }

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

const SHORTCUTS: [string, string][] = [
  ['Spasi', 'Putar / jeda'],
  ['← / →', 'Mundur / maju 0,1 detik'],
  ['Shift + ← / →', 'Mundur / maju 1 detik'],
  ['Ctrl + S', 'Simpan'],
  ['Ctrl + Z', 'Undo'],
  ['Ctrl + Y', 'Redo'],
  ['Ctrl + E', 'Ekspor video'],
]

function EditorSkeleton() {
  return (
    <div style={PAGE_STYLE}>
      <PageHeader title="Editor klip" back={BACK} />
      <div style={GRID_STYLE}>
        <Skeleton height="100%" radius="lg" />
        <Skeleton height="100%" radius="lg" />
        <Skeleton height="100%" radius="lg" />
      </div>
    </div>
  )
}

function ClipEditor() {
  const router = useRouter()
  const params = useSearchParams()
  const clipId = params.get('id') || ''
  const { epoch, systemInfo } = useEngine()

  const videoRef = useRef<HTMLVideoElement>(null)
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
    }
    setDetail(d)
    setPresent(snap)
    setSavedJson(JSON.stringify(snap))
    history.current = { past: [], future: [], lastKey: null, lastAt: 0 }
  }, [])

  useEffect(() => {
    if (!clipId) {
      setLoadError('ID clip tidak ada di alamat halaman.')
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
        if (!cancelled) setLoadError(errorMessage(err, 'Clip tidak ditemukan'))
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
      setRender((prev) => (prev && prev.id === e.id ? { ...prev, status: e.status, progress_pct: e.progress_pct } : prev || null))
    } else if (e.type === 'render.status' && e.clip_id === clipId) {
      setRender((prev) => (prev && prev.id === e.id ? { ...prev, status: e.status, output_path: e.output_path ?? prev.output_path, error: e.error ?? prev.error } : prev))
      if (e.status === 'completed') {
        toast.success('Render selesai')
        window.metis?.notify('MetisClip', 'Render clip selesai')
        // Refresh clip (files.final / updated_at) without touching unsaved edits
        api.clips
          .get(clipId)
          .then((d) => setDetail(d))
          .catch(() => undefined)
      } else if (e.status === 'failed') {
        toast.error(e.error || 'Render gagal')
      }
    } else if (e.type === 'clip.deleted' && e.id === clipId) {
      toast.error('Clip ini dihapus')
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
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isPlaying])

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
      const savedTemplateId = savedJson ? (JSON.parse(savedJson) as Snapshot).templateId : null
      const { clip } = await api.clips.updateSubtitles(clipId, {
        words: cleanWords,
        style: { ...styleOverrides(present.style, tpl), ...(Object.keys(aiDiff).length ? { ai: aiDiff } : {}) },
        ...(present.templateId !== savedTemplateId ? { brand_template_id: present.templateId } : {}),
      })
      const snap = { ...present, words: cleanWords }
      setDetail((d) => (d ? { ...d, clip } : d))
      setPresent(snap)
      setSavedJson(JSON.stringify(snap))
      if (!silent) {
        setJustSaved(true)
        setTimeout(() => setJustSaved(false), 2000)
        toast.success('Perubahan disimpan')
      }
      return true
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal menyimpan perubahan'))
      return false
    } finally {
      setSaving(false)
    }
  }

  /** The template with this id: from the library, else the one the clip was loaded with. */
  const templateById = (id: string | null): BrandTemplate | null =>
    (id && templates.find((t) => t.id === id)) || (detail?.brand_template && detail.brand_template.id === id ? detail.brand_template : null)

  /** Switch the clip's template: its caption style, logo and AI settings apply (sync offset kept). */
  const chooseTemplate = (id: string) => {
    if (!present || id === present.templateId) return
    const tpl = templateById(id)
    if (!tpl) return
    const style = resolveCaptionStyle(tpl.caption_settings || {})
    update({ ...present, templateId: id, style: { ...style, offsetTime: present.style.offsetTime }, ai: resolveAi(tpl.ai_settings) })
    toast.success(`Memakai template "${tpl.name}". Klik Simpan untuk menyimpan.`)
  }

  /** Drop this clip's style and AI overrides (undoable; saved with Simpan). */
  const resetToTemplate = () => {
    if (!present) return
    const tpl = templateById(present.templateId)
    update({ ...present, style: resolveCaptionStyle(tpl?.caption_settings || {}), ai: resolveAi(tpl?.ai_settings) })
    setConfirmReset(false)
    toast.success(`Gaya dikembalikan ke template "${tpl?.name || 'bawaan'}". Klik Simpan untuk menyimpan.`)
  }

  const [enriching, setEnriching] = useState(false)
  const enrich = async () => {
    if (!present || !clipId || enriching) return
    if (!present.ai.keywords && !present.ai.emojis) {
      toast.error('Aktifkan "Sorot kata kunci" atau "Emoji otomatis" dulu')
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
      const parts = []
      if (present.ai.keywords) parts.push(`${res.keywords} kata kunci`)
      if (present.ai.emojis) parts.push(`${res.emojis} emoji`)
      toast.success(`AI menandai ${parts.join(' dan ')}`)
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal menjalankan AI subtitle'))
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
      toast.error(errorMessage(err, 'Gagal memulai render'))
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
      const picked = await window.metis.selectFolder({ title: 'Ekspor clip ke folder', defaultPath: systemInfo?.export_dir })
      if (!picked) return
      dest = picked
    }
    setExporting(true)
    try {
      const res = await api.clips.export([clipId], dest)
      if (res.exported.length > 0) {
        setExportedPath(res.exported[0].path)
        toast.success('Clip diekspor')
      } else {
        toast.error(res.skipped[0]?.reason || 'Clip belum bisa diekspor')
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

  if (loadError && !detail) {
    return (
      <>
        <PageHeader title="Editor klip" back={BACK} />
        <Alert
          tone="error"
          title="Clip tidak dapat dibuka"
          style={{ maxWidth: 760 }}
          action={
            <Button variant="secondary" size="sm" onClick={() => router.push('/clips/')} icon={<ArrowLeft size={16} />}>
              Kembali ke galeri
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
  const keywordCount = words.filter((w) => w.keyword).length
  const emojiCount = words.filter((w) => w.emoji).length
  const cutSeconds = cutActive ? Math.max(0, sourceDuration - keptDuration(segments)) : 0
  const renderActive = !!render && (render.status === 'queued' || render.status === 'rendering')
  const canUndo = history.current.past.length > 0
  const canRedo = history.current.future.length > 0
  const fontWeights = FONT_WEIGHTS_MAP[style.fontFamily] || ['Regular']
  const weightOptions = (fontWeights.includes(style.fontWeight) ? fontWeights : [style.fontWeight, ...fontWeights]).map((w) => ({ value: w, label: w }))

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
      <Spinner size="sm" /> Menyimpan…
    </span>
  ) : dirty ? (
    <Badge tone="neutral" size="sm" icon={<PenLine size={14} aria-hidden="true" />}>
      Belum disimpan
    </Badge>
  ) : (
    <span className="mc-row mc-gap-4 mc-caption">
      <Check size={14} aria-hidden="true" /> Tersimpan
    </span>
  )

  const renderFooter = !render ? undefined : renderActive ? (
    <Button variant="secondary" icon={<X size={16} />} onClick={cancelRender}>
      Batalkan render
    </Button>
  ) : render.status === 'completed' ? (
    isDesktop() ? (
      <>
        <Button
          variant="secondary"
          icon={<FolderOpen size={16} />}
          onClick={() => {
            const p = exportedPath || render.output_path
            if (p) window.metis?.showItemInFolder(p)
          }}
        >
          Buka folder
        </Button>
        <Button variant="secondary" loading={exporting} onClick={() => exportClip(false)}>
          Salin ke folder ekspor
        </Button>
        <Button variant="primary" icon={<Download size={16} />} loading={exporting} onClick={() => exportClip(true)}>
          Ekspor ke…
        </Button>
      </>
    ) : (
      <Button variant="primary" loading={exporting} onClick={() => exportClip(false)}>
        Salin ke folder ekspor
      </Button>
    )
  ) : render.status === 'failed' || render.status === 'cancelled' ? (
    <Button variant="primary" onClick={() => startRender()}>
      Coba render lagi
    </Button>
  ) : undefined

  return (
    <div style={PAGE_STYLE}>
      <div onClickCapture={guardHeaderLinks}>
        <PageHeader
          back={BACK}
          title={
            <span className="mc-truncate" style={{ display: 'block' }} title={clip.hook_text || undefined}>
              {clip.hook_text || 'Editor klip'}
            </span>
          }
          subtitle={
            <span className="mc-row mc-row--wrap mc-gap-8">
              <ScoreBadge score={clip.viral_score} size="sm" />
              <span>
                <span className="mc-mono">{formatClock(clip.duration_seconds)}</span> · {words.length} kata
              </span>
              <span aria-live="polite">{saveState}</span>
            </span>
          }
          actions={
            <>
              <Button variant="secondary" onClick={() => save()} loading={saving} icon={justSaved ? <Check size={16} /> : <Save size={16} />}>
                {justSaved ? 'Tersimpan' : 'Simpan'}
              </Button>
              <Button variant="primary" onClick={startRender} icon={renderActive ? <Spinner size="sm" /> : <Download size={16} />}>
                {renderActive ? `Render ${Math.round(render?.progress_pct || 0)}%` : 'Ekspor'}
              </Button>
            </>
          }
        />
      </div>

      <div style={GRID_STYLE}>
        {/* Word editor */}
        <Card as="section" padding="none" aria-label="Caption" style={COLUMN_STYLE}>
          <div style={{ padding: '20px 20px 0' }}>
            <CardHeader size="sm" icon={<Type size={18} />} title="Caption" subtitle="Edit teks dan timing (detik). Klik kartu untuk melompat." />
          </div>
          <div style={{ ...COLUMN_BODY, padding: '4px 12px 16px' }}>
            {words.length === 0 ? (
              <EmptyState
                icon={Type}
                title="Belum ada subtitle"
                description="Tambahkan kata pertama, lalu atur teks dan waktunya."
                action={
                  <Button variant="secondary" size="sm" icon={<Plus size={16} />} onClick={() => setWords([{ word: 'Teks', start: 0, end: 0.5 }])}>
                    Tambah kata
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
                          aria-label={`Kata ${index + 1}`}
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
                          <Badge tone="quiet" size="sm" title="Kata pengisi: disembunyikan dari subtitle dan dipotong dari video">
                            pengisi
                          </Badge>
                        )}
                        <IconButton
                          size="sm"
                          variant={item.keyword ? 'ink' : 'surface'}
                          tooltip="end"
                          label={item.keyword ? 'Kata kunci (klik untuk hapus sorotan)' : 'Jadikan kata kunci (disorot)'}
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
                          label="Hapus kata"
                          icon={<Trash2 size={16} />}
                          onClick={() => setWords(words.filter((_, i) => i !== index))}
                        />
                      </div>
                      <div className="mc-row mc-gap-4" style={{ marginTop: 8 }}>
                        <TimeInput
                          label={`Mulai kata ${index + 1} (detik)`}
                          value={item.start}
                          onCommit={(v) => setWords(words.map((w, i) => (i === index ? { ...w, start: v } : w)), `start-${index}`)}
                        />
                        <span className="mc-caption mc-muted" aria-hidden="true">
                          –
                        </span>
                        <TimeInput
                          label={`Selesai kata ${index + 1} (detik)`}
                          value={item.end}
                          onCommit={(v) => setWords(words.map((w, i) => (i === index ? { ...w, end: v } : w)), `end-${index}`)}
                        />
                        <input
                          type="text"
                          className="mc-input mc-input--sm"
                          value={item.emoji || ''}
                          placeholder="emoji"
                          aria-label={`Emoji kata ${index + 1}`}
                          title="Emoji di atas subtitle mulai kata ini (kosongkan untuk menghapus)"
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
                          label="Sisipkan kata"
                          icon={<Plus size={16} />}
                          onClick={(e) => {
                            e.stopPropagation()
                            const next = [...words]
                            next.splice(index + 1, 0, { word: 'Baru', start: item.end, end: item.end + 0.5 })
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
            <IconButton variant="ghost" size="sm" label="Undo (Ctrl+Z)" icon={<Undo2 size={16} />} onClick={undo} disabled={!canUndo} />
            <IconButton variant="ghost" size="sm" label="Redo (Ctrl+Y)" icon={<Redo2 size={16} />} onClick={redo} disabled={!canRedo} />
            <IconButton variant="ghost" size="sm" label="Pintasan keyboard" icon={<Keyboard size={16} />} onClick={() => setShowShortcuts(true)} />
            <span className="mc-grow" />
            {cutActive && (
              <Tooltip label="Bagian yang dipotong (kata pengisi / jeda hening) dilewati saat diputar dan tidak ada di hasil ekspor" placement="end">
                <span className="mc-row mc-gap-4 mc-caption mc-muted">
                  <Scissors size={14} aria-hidden="true" /> −{cutSeconds.toFixed(1)} dtk dipotong
                </span>
              </Tooltip>
            )}
            <IconButton
              variant="ghost"
              size="sm"
              tooltip="end"
              label="Layar penuh"
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
                <video
                  ref={videoRef}
                  src={mediaUrl(clip.id, 'raw', clip.updated_at)}
                  poster={clip.files.thumbnail ? mediaUrl(clip.id, 'thumbnail', clip.updated_at) : undefined}
                  onLoadedMetadata={() => setDuration(videoRef.current?.duration || clip.duration_seconds)}
                  onTimeUpdate={() => !isPlaying && setCurrentTime(videoRef.current?.currentTime || 0)}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => setIsPlaying(false)}
                  playsInline
                  preload="auto"
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
                />
              ) : (
                <div
                  className="mc-caption mc-muted"
                  style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, textAlign: 'center' }}
                >
                  File video belum tersedia (clip masih diproses).
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
              label={isPlaying ? 'Jeda (Spasi)' : 'Putar (Spasi)'}
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
        <Card as="section" padding="none" aria-label="Properti" style={COLUMN_STYLE}>
          <div style={{ padding: '20px 20px 0' }}>
            <CardHeader size="sm" icon={<Palette size={18} />} title="Properti" subtitle="Perubahan di sini hanya berlaku untuk clip ini." />
          </div>

          <div className="mc-stack mc-gap-24" style={{ ...COLUMN_BODY, padding: '4px 20px 20px' }}>
            <PanelSection
              title="Brand Template"
              action={
                <button type="button" className="mc-link" onClick={() => leave('/brand-template/')}>
                  Kelola template
                </button>
              }
            >
              <SelectField
                aria-label="Brand Template clip ini"
                hint="Mengganti template memakai gaya caption, logo, dan pengaturan AI dari template itu untuk clip ini."
                value={present.templateId || ''}
                options={[
                  ...(present.templateId ? [] : [{ value: '', label: 'Bawaan MetisClip' }]),
                  ...(templates.length ? templates : activeTemplate ? [activeTemplate] : []).map((t) => ({
                    value: t.id,
                    label: t.id === agentDefaultId ? `${t.name} (default workspace)` : t.name,
                  })),
                ]}
                onChange={(e) => e.target.value && chooseTemplate(e.target.value)}
              />
              <div>
                <Button variant="ghost" size="sm" onClick={() => setConfirmReset(true)} icon={<RotateCcw size={16} />}>
                  Reset ke template
                </Button>
              </div>
            </PanelSection>

            <Divider />

            <PanelSection title="Gaya animasi">
              <p className="mc-caption mc-muted">Setiap preset punya font bawaan sendiri. Memilih preset mengganti pengaturan font ke bawaannya.</p>
              <div role="group" aria-label="Preset animasi" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
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

            <PanelSection title="AI subtitle">
              <p className="mc-caption mc-muted">Default dari Brand Template. Perubahan di sini hanya untuk clip ini dan ikut ke hasil ekspor.</p>
              <ToggleSwitch label="Hapus kata pengisi (eh, hmm)" checked={ai.fillerWords} onChange={(v) => setAi({ fillerWords: v })} />
              <ToggleSwitch label="Hapus jeda hening" checked={ai.pauses} onChange={(v) => setAi({ pauses: v })} />
              <ToggleSwitch label="Sorot kata kunci (AI)" checked={ai.keywords} onChange={(v) => setAi({ keywords: v })} />
              <ToggleSwitch label="Emoji otomatis (AI)" checked={ai.emojis} onChange={(v) => setAi({ emojis: v })} />
              {(ai.keywords || ai.emojis) && (
                <div className="mc-stack mc-gap-8">
                  <span className="mc-caption mc-muted">
                    {ai.keywords && `${keywordCount} kata kunci`}
                    {ai.keywords && ai.emojis && ' · '}
                    {ai.emojis && `${emojiCount} emoji`} (bisa diubah per kata di daftar caption)
                  </span>
                  <div>
                    <Button variant="secondary" size="sm" loading={enriching} onClick={enrich} icon={<ScanText size={16} />}>
                      {keywordCount + emojiCount > 0 ? 'Analisis ulang dengan AI' : 'Analisis dengan AI'}
                    </Button>
                  </div>
                </div>
              )}
            </PanelSection>

            <Divider />

            <PanelSection
              title="Tampilan font"
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<RotateCcw size={16} />}
                  title={`Kembalikan font ke bawaan preset ${getPreset(style.mode).name}`}
                  onClick={() => setStyle(presetSwitch(style, style.mode))}
                >
                  Bawaan preset
                </Button>
              }
            >
              <div className="mc-field">
                <span className="mc-field__label">Font</span>
                <Dropdown
                  width="100%"
                  triggerClassName="mc-input"
                  triggerLabel={`Font: ${style.fontFamily}`}
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
              <SelectField label="Ketebalan" value={style.fontWeight} options={weightOptions} onChange={(e) => setStyle({ fontWeight: e.target.value })} />
              <ColorPicker label="Warna font" color={style.fontColor} onChange={(v) => setStyle({ fontColor: v }, 'fontColor')} />
              <Slider label="Ukuran font" min={20} max={80} value={style.fontSize} format={(v) => `${v}px`} onChange={(v) => setStyle({ fontSize: v }, 'fontSize')} />
              <Slider label="Posisi vertikal (Y)" min={10} max={400} value={style.positionY} onChange={(v) => setStyle({ positionY: v }, 'positionY')} />
              <Slider
                label="Sinkronisasi suara (delay)"
                hint="Geser ke kanan jika subtitle muncul terlalu cepat."
                min={-1000}
                max={1000}
                step={50}
                value={style.offsetTime}
                format={(v) => `${v} ms`}
                onChange={(v) => setStyle({ offsetTime: v }, 'offsetTime')}
              />
            </PanelSection>

            <Divider />

            <PanelSection title="Highlight & dekorasi">
              <ColorPicker label="Warna highlight" color={style.highlightColor} onChange={(v) => setStyle({ highlightColor: v }, 'highlightColor')} />
              <div className="mc-field">
                <span className="mc-field__label">Format tambahan</span>
                <div role="group" aria-label="Format tambahan" className="mc-row mc-row--wrap mc-gap-8">
                  <Chip size="sm" selected={style.isItalic} onClick={() => setStyle({ isItalic: !style.isItalic })}>
                    Miring
                  </Chip>
                  <Chip size="sm" selected={style.isUnderline} onClick={() => setStyle({ isUnderline: !style.isUnderline })}>
                    Garis bawah
                  </Chip>
                  <Chip size="sm" selected={style.isUppercase} onClick={() => setStyle({ isUppercase: !style.isUppercase })}>
                    Huruf kapital
                  </Chip>
                </div>
              </div>
            </PanelSection>

            <Divider />

            <PanelSection title="Garis luar & bayangan">
              <ColorPicker label="Warna garis luar" color={style.strokeColor} onChange={(v) => setStyle({ strokeColor: v }, 'strokeColor')} />
              <Slider label="Tebal garis luar" min={0} max={20} value={style.strokeWidth} format={(v) => `${v}px`} onChange={(v) => setStyle({ strokeWidth: v }, 'strokeWidth')} />
              <ToggleSwitch label="Bayangan (shadow)" checked={style.hasShadow} onChange={(v) => setStyle({ hasShadow: v })} />
              {style.hasShadow && (
                <>
                  <ColorPicker label="Warna bayangan" color={style.shadowColor} onChange={(v) => setStyle({ shadowColor: v }, 'shadowColor')} />
                  <Slider label="Geser X" min={-50} max={50} value={style.shadowX} format={(v) => `${v}px`} onChange={(v) => setStyle({ shadowX: v }, 'shadowX')} />
                  <Slider label="Geser Y" min={-50} max={50} value={style.shadowY} format={(v) => `${v}px`} onChange={(v) => setStyle({ shadowY: v }, 'shadowY')} />
                  <Slider label="Blur" min={0} max={50} value={style.shadowBlur} format={(v) => `${v}px`} onChange={(v) => setStyle({ shadowBlur: v }, 'shadowBlur')} />
                </>
              )}
            </PanelSection>
          </div>
        </Card>
      </div>

      {/* Render / export modal */}
      <Modal isOpen={renderOpen} onClose={() => setRenderOpen(false)} title="Ekspor video" size="md" footer={renderFooter}>
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
                <ProgressBar value={render.progress_pct} label="Progres render" showValue />
                <p className="mc-caption mc-muted">Anda boleh menutup jendela ini; render tetap berjalan di latar belakang.</p>
              </>
            )}
            {render.status === 'failed' && render.error && (
              <Alert tone="error" style={{ wordBreak: 'break-word' }}>
                {render.error}
              </Alert>
            )}
            {render.status === 'completed' && render.output_path && (
              <Card tone="dew" padding="sm">
                <span className="mc-mono mc-caption" style={{ wordBreak: 'break-all' }}>
                  {render.output_path}
                </span>
              </Card>
            )}
            {render.status === 'completed' && exportedPath && (
              <Alert tone="success" title="Disalin ke">
                <span className="mc-mono" style={{ wordBreak: 'break-all' }}>
                  {exportedPath}
                </span>
              </Alert>
            )}
          </div>
        ) : (
          <Skeleton height={60} radius="md" />
        )}
      </Modal>

      <Modal isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} title="Pintasan keyboard">
        <KeyValueList items={SHORTCUTS.map(([k, v]) => ({ id: k, key: v, value: <Kbd>{k}</Kbd> }))} />
      </Modal>

      <ConfirmModal
        isOpen={confirmReset}
        title="Kembalikan ke Brand Template?"
        message={`Gaya caption dan pengaturan AI khusus clip ini diganti dengan template "${activeTemplate?.name || 'bawaan'}". Teks & timing subtitle tidak berubah. Bisa di-undo; tersimpan setelah klik Simpan.`}
        confirmLabel="Reset gaya"
        confirmIcon={<RotateCcw size={16} />}
        danger
        onConfirm={resetToTemplate}
        onClose={() => setConfirmReset(false)}
      />

      <ConfirmModal
        isOpen={!!leaveTo}
        title="Perubahan belum disimpan"
        message="Simpan perubahan subtitle sebelum keluar dari editor?"
        confirmLabel="Simpan & keluar"
        confirmIcon={<Save size={16} />}
        cancelLabel="Batal"
        loading={saving}
        onConfirm={async () => {
          if (await save(true)) router.push(leaveTo || '/clips/')
        }}
        onClose={() => setLeaveTo(null)}
      >
        <div>
          <Button variant="danger" size="sm" icon={<Trash2 size={16} />} onClick={() => router.push(leaveTo || '/clips/')}>
            Keluar tanpa menyimpan
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
      aria-label="Posisi video"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration * 100) / 100}
      aria-valuenow={Math.round(time * 100) / 100}
      aria-valuetext={`${formatClock(time)} dari ${formatClock(duration)}`}
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
