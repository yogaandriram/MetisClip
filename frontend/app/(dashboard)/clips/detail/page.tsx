'use client'

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  Play,
  Pause,
  Save,
  Type,
  RotateCcw,
  Palette,
  Check,
  Loader2,
  Download,
  Maximize,
  Trash2,
  Plus,
  ChevronDown,
  Undo2,
  Redo2,
  FolderOpen,
  AlertCircle,
  Flame,
  Keyboard,
  CheckCircle2,
  XCircle,
  Sparkles,
  Star,
  Scissors,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { presets } from '@/lib/presets'
import { CaptionLayer } from '@/lib/presets/CaptionLayer'
import { LogoOverlay } from '@/lib/presets/BrandOverlay'
import { type CaptionStyle, BASE_CAPTION_STYLE, getPreset, presetSwitch, resolveCaptionStyle } from '@/lib/presets/defaults'
import { type AiCaptionSettings, DEFAULT_AI_SETTINGS, computeKeepSegments, isCut, isFiller, keptDuration, nextKeptTime, resolveAi } from '@/lib/presets/captions'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { Dropdown } from '@/components/ui/Dropdown'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { Skeleton } from '@/components/ui/Skeleton'
import { SUPPORTED_FONTS, FONT_WEIGHTS_MAP } from '@/lib/constants'
import { useEngine } from '@/contexts/EngineContext'
import { useEngineEvents } from '@/hooks/useEngineEvents'
import { api, type ClipDetail, type RenderJob, type SubtitleWord } from '@/lib/engine'
import { assetUrl, isDesktop, mediaUrl } from '@/lib/media'
import { RENDER_STATUS, errorMessage, formatClock } from '@/lib/format'

// Style model: lib/presets/defaults.ts (shared with the Brand Template page and the render).
// `ai` is the clip's AI subtitle settings (brand ai_settings unless overridden; saved in subtitle_style.ai).
type Snapshot = { words: SubtitleWord[]; style: CaptionStyle; ai: AiCaptionSettings }

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

function EditorSkeleton() {
  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <Skeleton height={48} />
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr 330px', gap: '20px' }}>
        <Skeleton height={600} />
        <Skeleton height={600} />
        <Skeleton height={600} />
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
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [resetting, setResetting] = useState(false)
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
      const { clip } = await api.clips.updateSubtitles(clipId, { words: cleanWords, style: { ...present.style, ai: { ...present.ai } } })
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

  const resetToTemplate = async () => {
    setResetting(true)
    try {
      await api.clips.updateSubtitles(clipId, { reset_style: true })
      applyDetail(await api.clips.get(clipId))
      toast.success('Gaya dikembalikan ke Brand Template')
      setConfirmReset(false)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setResetting(false)
    }
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

  const goBack = () => {
    if (dirty) setConfirmLeave(true)
    else router.push('/clips/')
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
      <div style={{ maxWidth: '600px', margin: '80px auto', textAlign: 'center' }}>
        <AlertCircle size={44} color="var(--danger)" style={{ margin: '0 auto 16px' }} />
        <h1 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '8px' }}>Clip tidak dapat dibuka</h1>
        <p style={{ color: 'var(--text-dim)', marginBottom: '24px' }}>{loadError}</p>
        <Button variant="secondary" onClick={() => router.push('/clips/')} icon={<ArrowLeft size={16} />}>
          Kembali ke galeri
        </Button>
      </div>
    )
  }

  if (!detail || !present) return <EditorSkeleton />

  const clip = detail.clip
  const brand = detail.brand_template?.brand_settings || null
  const overlaySrc = brand?.overlayUrl ? assetUrl(brand.overlayUrl) : ''
  const keywordCount = words.filter((w) => w.keyword).length
  const emojiCount = words.filter((w) => w.emoji).length
  const cutSeconds = cutActive ? Math.max(0, sourceDuration - keptDuration(segments)) : 0
  const renderActive = !!render && (render.status === 'queued' || render.status === 'rendering')
  const canUndo = history.current.past.length > 0
  const canRedo = history.current.future.length > 0
  const smallInput: React.CSSProperties = { background: 'rgba(0,0,0,0.4)', border: '1px solid transparent', borderRadius: '4px', color: 'var(--text-dim)', width: '56px', padding: '2px 4px', textAlign: 'center', fontSize: '11px', outline: 'none' }
  const numberBox: React.CSSProperties = { display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', padding: '0 6px', border: '1px solid var(--border-glass)' }

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', height: 'calc(100vh - 80px)', minHeight: '640px', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '18px', paddingBottom: '14px', borderBottom: '1px solid var(--border-glass)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
          <Button variant="secondary" size="sm" onClick={goBack} icon={<ArrowLeft size={14} />}>
            Kembali
          </Button>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '17px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '420px' }}>{clip.hook_text || 'Editor Klip'}</h1>
              <Badge variant="accent" glow={false} icon={<Flame size={11} />}>
                {Math.round(clip.viral_score)}
              </Badge>
              {dirty && (
                <Badge variant="warning" glow={false}>
                  Belum disimpan
                </Badge>
              )}
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {formatClock(clip.duration_seconds)} · {words.length} kata
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="mc-icon-button" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
            <Undo2 size={16} />
          </button>
          <button className="mc-icon-button" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)">
            <Redo2 size={16} />
          </button>
          <button className="mc-icon-button" onClick={() => setShowShortcuts(true)} title="Pintasan keyboard">
            <Keyboard size={16} />
          </button>
          <Button variant="secondary" size="sm" onClick={() => setConfirmReset(true)} icon={<RotateCcw size={14} />}>
            Reset ke template
          </Button>
          <Button variant="secondary" size="sm" onClick={() => save()} loading={saving} icon={justSaved ? <Check size={14} /> : <Save size={14} />}>
            {justSaved ? 'Tersimpan' : 'Simpan'}
          </Button>
          <Button variant="primary" size="sm" onClick={startRender} icon={renderActive ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}>
            {renderActive ? `Render ${Math.round(render?.progress_pct || 0)}%` : 'Ekspor video'}
          </Button>
        </div>
      </div>

      {/* 3 columns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 300px) minmax(280px, 1fr) minmax(260px, 330px)', gap: '18px', flex: 1, minHeight: 0 }}>
        {/* Captions */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
          <style>{`
            .word-card .add-word-btn { opacity: 0; pointer-events: none; }
            .word-card:hover .add-word-btn, .word-card:focus-within .add-word-btn { opacity: 1; pointer-events: auto; }
          `}</style>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-glass)', background: 'rgba(0,0,0,0.2)' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Type size={16} color="var(--primary)" /> Caption
            </h2>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Edit teks dan timing (detik). Klik kartu untuk melompat.</p>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
            {words.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', padding: '20px 0' }}>
                Belum ada subtitle.
                <div style={{ marginTop: '12px' }}>
                  <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => setWords([{ word: 'Teks', start: 0, end: 0.5 }])}>
                    Tambah kata
                  </Button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {words.map((item, index) => {
                  const active = activeWordIndex === index
                  const filler = ai.fillerWords && isFiller(item.word)
                  return (
                    <div
                      key={index}
                      className="word-card"
                      onClick={(e) => {
                        if (!isTypingTarget(e.target)) seekTo(item.start + style.offsetTime / 1000)
                      }}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        background: active ? 'rgba(7, 202, 107, 0.08)' : 'rgba(255,255,255,0.02)',
                        opacity: filler ? 0.55 : 1,
                        border: active ? '1px solid rgba(7, 202, 107, 0.35)' : '1px solid var(--border-glass)',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        position: 'relative',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                        <input
                          type="text"
                          value={item.word}
                          onChange={(e) => setWords(words.map((w, i) => (i === index ? { ...w, word: e.target.value } : w)), `word-${index}`)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: item.keyword && ai.keywords ? style.highlightColor : active ? '#fff' : 'var(--text-primary)',
                            fontSize: '14px',
                            fontWeight: active || item.keyword ? 700 : 500,
                            textDecoration: filler ? 'line-through' : 'none',
                            outline: 'none',
                            width: '100%',
                          }}
                        />
                        {filler && (
                          <span title="Kata pengisi: disembunyikan dari subtitle dan dipotong dari video" style={{ fontSize: '9px', color: 'var(--warning)', border: '1px solid rgba(232,149,88,0.4)', borderRadius: '4px', padding: '1px 4px', whiteSpace: 'nowrap' }}>
                            pengisi
                          </span>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setWords(words.map((w, i) => (i === index ? { ...w, keyword: !w.keyword } : w)))
                          }}
                          title={item.keyword ? 'Kata kunci (klik untuk hapus sorotan)' : 'Jadikan kata kunci (disorot)'}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', color: item.keyword ? 'var(--warning)' : 'var(--text-muted)', opacity: item.keyword ? 1 : 0.5 }}
                        >
                          <Star size={13} fill={item.keyword ? 'currentColor' : 'none'} />
                        </button>
                        <button
                          onClick={() => setWords(words.filter((_, i) => i !== index))}
                          style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '2px', opacity: 0.75, display: 'flex' }}
                          title="Hapus kata"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '8px' }}>
                        <TimeInput value={item.start} style={smallInput} onCommit={(v) => setWords(words.map((w, i) => (i === index ? { ...w, start: v } : w)), `start-${index}`)} />
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>–</span>
                        <TimeInput value={item.end} style={smallInput} onCommit={(v) => setWords(words.map((w, i) => (i === index ? { ...w, end: v } : w)), `end-${index}`)} />
                        <input
                          type="text"
                          value={item.emoji || ''}
                          placeholder="emoji"
                          title="Emoji di atas subtitle mulai kata ini (kosongkan untuk menghapus)"
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            const v = Array.from(e.target.value.trim()).slice(-2).join('')
                            setWords(words.map((w, i) => (i === index ? { ...w, emoji: v || null } : w)), `emoji-${index}`)
                          }}
                          style={{ ...smallInput, width: '42px', opacity: item.emoji ? 1 : 0.5 }}
                        />
                      </div>
                      <div style={{ position: 'absolute', bottom: '-14px', left: '50%', transform: 'translateX(-50%)', zIndex: 5 }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            const next = [...words]
                            next.splice(index + 1, 0, { word: 'Baru', start: item.end, end: item.end + 0.5 })
                            setWords(next)
                          }}
                          className="add-word-btn"
                          title="Sisipkan kata"
                          style={{ background: 'var(--primary)', border: 'none', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', cursor: 'pointer', boxShadow: '0 2px 5px rgba(0,0,0,0.5)' }}
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Preview */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, background: '#0a0a0c', borderRadius: '16px', border: '1px solid var(--border-glass)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(0,0,0,0.4)', borderBottom: '1px solid var(--border-glass)' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Preview (9:16)</span>
            <button
              onClick={() => containerRef.current?.requestFullscreen().catch(() => undefined)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', display: 'flex' }}
              title="Layar penuh"
            >
              <Maximize size={14} />
            </button>
          </div>

          <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '18px', overflow: 'hidden' }}>
            <div
              ref={containerRef}
              onClick={togglePlay}
              style={{
                height: '100%',
                maxWidth: '100%',
                aspectRatio: '9 / 16',
                position: 'relative',
                containerType: 'inline-size',
                borderRadius: '12px',
                background: '#000',
                overflow: 'hidden',
                boxShadow: '0 0 30px rgba(0,0,0,0.5)',
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
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px', padding: '20px', textAlign: 'center' }}>
                  File video belum tersedia (clip masih diproses).
                </div>
              )}

              <LogoOverlay src={overlaySrc} brand={brand} />

              {/* Same component as the Remotion render (lib/presets/CaptionLayer.tsx): preview == render */}
              <CaptionLayer words={words} time={currentTime} style={style} ai={ai} />
            </div>
          </div>

          <div style={{ padding: '14px 18px', borderTop: '1px solid var(--border-glass)', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <button
              onClick={togglePlay}
              title="Putar/jeda (Spasi)"
              style={{ background: 'var(--primary)', border: 'none', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', cursor: 'pointer', flexShrink: 0 }}
            >
              {isPlaying ? <Pause size={20} /> : <Play size={20} style={{ marginLeft: '3px' }} />}
            </button>
            <span className="mc-mono" style={{ fontSize: '12px', color: 'var(--text-dim)', minWidth: '84px' }}>
              {formatClock(currentTime)} / {formatClock(duration || clip.duration_seconds)}
            </span>
            {cutActive && (
              <span
                title="Bagian yang dipotong (kata pengisi / jeda hening) dilewati saat diputar dan tidak ada di hasil ekspor"
                style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--warning)', whiteSpace: 'nowrap' }}
              >
                <Scissors size={12} /> −{cutSeconds.toFixed(1)} dtk
              </span>
            )}
            <input
              type="range"
              min={0}
              max={duration || clip.duration_seconds || 100}
              step={0.01}
              value={currentTime}
              onChange={(e) => seekTo(parseFloat(e.target.value))}
              style={{ flex: 1, cursor: 'pointer', accentColor: 'var(--primary)' }}
            />
          </div>
        </div>

        {/* Inspector */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-glass)', background: 'rgba(0,0,0,0.2)' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Palette size={16} color="var(--warning)" /> Properti
            </h2>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Perubahan di sini hanya berlaku untuk clip ini.</p>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '18px' }}>
            <Section title="GAYA ANIMASI">
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                Setiap preset punya font bawaan sendiri. Memilih preset mengganti pengaturan font ke bawaannya.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {presets.map((preset) => (
                  <React.Fragment key={preset.id}>
                    {preset.renderButton(style.mode === preset.id, () => setStyle(presetSwitch(style, preset.id)))}
                  </React.Fragment>
                ))}
              </div>
            </Section>

            <Section title="AI SUBTITLE" divider>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                Default dari Brand Template. Perubahan di sini hanya untuk clip ini dan ikut ke hasil ekspor.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <ToggleSwitch label="Hapus kata pengisi (eh, hmm)" checked={ai.fillerWords} onChange={(v) => setAi({ fillerWords: v })} />
                <ToggleSwitch label="Hapus jeda hening" checked={ai.pauses} onChange={(v) => setAi({ pauses: v })} />
                <ToggleSwitch label="Sorot kata kunci (AI)" checked={ai.keywords} onChange={(v) => setAi({ keywords: v })} />
                <ToggleSwitch label="Emoji otomatis (AI)" checked={ai.emojis} onChange={(v) => setAi({ emojis: v })} />
              </div>
              {(ai.keywords || ai.emojis) && (
                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {ai.keywords && `${keywordCount} kata kunci`}
                    {ai.keywords && ai.emojis && ' · '}
                    {ai.emojis && `${emojiCount} emoji`} (bisa diubah per kata di daftar caption)
                  </span>
                  <Button variant="secondary" size="sm" loading={enriching} onClick={enrich} icon={<Sparkles size={14} />}>
                    {keywordCount + emojiCount > 0 ? 'Analisis ulang dengan AI' : 'Analisis dengan AI'}
                  </Button>
                </div>
              )}
            </Section>

            <Section
              title="TAMPILAN FONT"
              divider
              action={
                <button
                  type="button"
                  onClick={() => setStyle(presetSwitch(style, style.mode))}
                  title={`Kembalikan font ke bawaan preset ${getPreset(style.mode).name}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '11px', cursor: 'pointer', padding: 0 }}
                >
                  <RotateCcw size={12} /> Bawaan preset
                </button>
              }
            >
              <div style={{ marginBottom: '14px' }}>
                <Dropdown
                  width="100%"
                  trigger={
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.05)', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border-glass)', cursor: 'pointer' }}>
                      <span style={{ fontSize: '14px', fontFamily: `'${style.fontFamily}'` }}>{style.fontFamily}</span>
                      <ChevronDown size={16} color="var(--text-muted)" />
                    </div>
                  }
                  items={SUPPORTED_FONTS.map((f) => ({
                    id: f,
                    label: <span style={{ fontFamily: `'${f}'`, fontSize: '15px' }}>{f}</span>,
                    onClick: () => {
                      const available = FONT_WEIGHTS_MAP[f] || ['Regular']
                      const weight = available.includes(style.fontWeight) ? style.fontWeight : available.includes('Regular') ? 'Regular' : available[0]
                      setStyle({ fontFamily: f, fontWeight: weight })
                    },
                  }))}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', marginBottom: '14px' }}>
                <ColorSwatch label="Warna font" value={style.fontColor} onChange={(v) => setStyle({ fontColor: v }, 'fontColor')} size={32} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Ketebalan</span>
                  <Dropdown
                    width="100%"
                    trigger={
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-glass)', cursor: 'pointer', height: '32px' }}>
                        <span style={{ fontSize: '13px' }}>{style.fontWeight}</span>
                        <ChevronDown size={14} color="var(--text-muted)" />
                      </div>
                    }
                    items={(FONT_WEIGHTS_MAP[style.fontFamily] || ['Regular']).map((w) => ({ id: w, label: w, onClick: () => setStyle({ fontWeight: w }) }))}
                  />
                </div>
              </div>

              <RangeRow label={`Ukuran font (${style.fontSize}px)`} min={20} max={80} value={style.fontSize} onChange={(v) => setStyle({ fontSize: v }, 'fontSize')} />
              <RangeRow label={`Posisi vertikal (Y: ${style.positionY})`} min={10} max={400} value={style.positionY} onChange={(v) => setStyle({ positionY: v }, 'positionY')} />
              <RangeRow
                label="Sinkronisasi suara (delay)"
                hint={`${style.offsetTime} ms`}
                min={-1000}
                max={1000}
                step={50}
                value={style.offsetTime}
                onChange={(v) => setStyle({ offsetTime: v }, 'offsetTime')}
                note="Geser ke kanan jika subtitle muncul terlalu cepat."
              />
            </Section>

            <Section title="HIGHLIGHT & DEKORASI" divider>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Warna highlight</span>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '8px 0 14px', alignItems: 'center' }}>
                {['#07CA6B', '#1856FF', '#E89558', '#EA2143', '#3B82F6', '#EC4899', '#FFE800'].map((color) => (
                  <button
                    key={color}
                    onClick={() => setStyle({ highlightColor: color })}
                    title={color}
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      background: color,
                      border: style.highlightColor.toLowerCase() === color.toLowerCase() ? '2px solid #fff' : '1px solid rgba(255,255,255,0.1)',
                      cursor: 'pointer',
                    }}
                  />
                ))}
                <ColorSwatch value={style.highlightColor} onChange={(v) => setStyle({ highlightColor: v }, 'highlightColor')} size={24} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>Format tambahan</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <ToggleChip active={style.isItalic} onClick={() => setStyle({ isItalic: !style.isItalic })} style={{ fontStyle: 'italic' }} title="Miring">
                    I
                  </ToggleChip>
                  <ToggleChip active={style.isUnderline} onClick={() => setStyle({ isUnderline: !style.isUnderline })} style={{ textDecoration: 'underline' }} title="Garis bawah">
                    U
                  </ToggleChip>
                  <ToggleChip active={style.isUppercase} onClick={() => setStyle({ isUppercase: !style.isUppercase })} style={{ fontWeight: 700, fontSize: '12px' }} title="Huruf kapital">
                    TT
                  </ToggleChip>
                </div>
              </div>
            </Section>

            <Section title="GARIS LUAR & BAYANGAN">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>Garis luar (stroke)</span>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <ColorSwatch value={style.strokeColor} onChange={(v) => setStyle({ strokeColor: v }, 'strokeColor')} size={20} />
                  <div style={numberBox}>
                    <NumberInput value={style.strokeWidth} min={0} max={20} onChange={(v) => setStyle({ strokeWidth: v }, 'strokeWidth')} />
                    <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>px</span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>Bayangan (shadow)</span>
                <ToggleSwitch checked={style.hasShadow} onChange={(v) => setStyle({ hasShadow: v })} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', opacity: style.hasShadow ? 1 : 0.3, pointerEvents: style.hasShadow ? 'auto' : 'none', background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Warna</span>
                  <ColorSwatch value={style.shadowColor} onChange={(v) => setStyle({ shadowColor: v }, 'shadowColor')} size={20} />
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(
                    [
                      ['X', 'shadowX'],
                      ['Y', 'shadowY'],
                      ['B', 'shadowBlur'],
                    ] as const
                  ).map(([label, key]) => (
                    <div key={key} style={{ ...numberBox, flex: 1 }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '10px', marginRight: '4px' }}>{label}:</span>
                      <NumberInput value={style[key]} min={key === 'shadowBlur' ? 0 : -50} max={50} onChange={(v) => setStyle({ [key]: v } as Partial<CaptionStyle>, key)} />
                    </div>
                  ))}
                </div>
              </div>
            </Section>
          </div>
        </div>
      </div>

      {/* Render / export modal */}
      <Modal isOpen={renderOpen} onClose={() => setRenderOpen(false)} title="Ekspor video">
        {render ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {render.status === 'completed' ? (
                <CheckCircle2 size={22} color="var(--accent)" />
              ) : render.status === 'failed' || render.status === 'cancelled' ? (
                <XCircle size={22} color="var(--danger)" />
              ) : (
                <Loader2 size={22} color="var(--primary)" className="animate-spin" />
              )}
              <span style={{ fontWeight: 600 }}>{RENDER_STATUS[render.status]}</span>
            </div>
            {renderActive && (
              <>
                <ProgressBar progress={render.progress_pct} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-muted)' }}>
                  <span>{Math.round(render.progress_pct)}% selesai</span>
                  <button className="mc-link-button" style={{ color: 'var(--danger)' }} onClick={cancelRender}>
                    Batalkan render
                  </button>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Anda boleh menutup jendela ini; render tetap berjalan di latar belakang.</p>
              </>
            )}
            {render.status === 'failed' && render.error && <p style={{ fontSize: '13px', color: 'var(--danger)', wordBreak: 'break-word' }}>{render.error}</p>}
            {render.status === 'completed' && (
              <>
                {render.output_path && (
                  <div className="mc-mono" style={{ fontSize: '12px', color: 'var(--text-dim)', wordBreak: 'break-all', padding: '10px 12px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)' }}>
                    {render.output_path}
                  </div>
                )}
                {exportedPath && (
                  <p style={{ fontSize: '13px', color: 'var(--accent)', wordBreak: 'break-all' }}>
                    Disalin ke: <span className="mc-mono">{exportedPath}</span>
                  </p>
                )}
                {isDesktop() ? (
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<FolderOpen size={14} />}
                      onClick={() => {
                        const p = exportedPath || render.output_path
                        if (p) window.metis?.showItemInFolder(p)
                      }}
                    >
                      Buka folder
                    </Button>
                    <Button variant="secondary" size="sm" loading={exporting} onClick={() => exportClip(false)}>
                      Salin ke folder ekspor
                    </Button>
                    <Button variant="primary" size="sm" icon={<Download size={14} />} loading={exporting} onClick={() => exportClip(true)}>
                      Ekspor ke…
                    </Button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button variant="primary" size="sm" loading={exporting} onClick={() => exportClip(false)}>
                      Salin ke folder ekspor
                    </Button>
                  </div>
                )}
              </>
            )}
            {(render.status === 'failed' || render.status === 'cancelled') && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button variant="primary" size="sm" onClick={() => startRender()}>
                  Coba render lagi
                </Button>
              </div>
            )}
          </div>
        ) : (
          <Skeleton height={60} />
        )}
      </Modal>

      <Modal isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} title="Pintasan keyboard">
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 18px', fontSize: '14px' }}>
          {[
            ['Spasi', 'Putar / jeda'],
            ['← / →', 'Mundur / maju 0,1 detik'],
            ['Shift + ← / →', 'Mundur / maju 1 detik'],
            ['Ctrl + S', 'Simpan'],
            ['Ctrl + Z', 'Undo'],
            ['Ctrl + Y', 'Redo'],
            ['Ctrl + E', 'Ekspor video'],
          ].map(([k, v]) => (
            <React.Fragment key={k}>
              <kbd className="mc-mono" style={{ padding: '2px 8px', borderRadius: '6px', border: '1px solid var(--border-glass)', background: 'rgba(255,255,255,0.04)', fontSize: '12px', whiteSpace: 'nowrap' }}>
                {k}
              </kbd>
              <span style={{ color: 'var(--text-dim)' }}>{v}</span>
            </React.Fragment>
          ))}
        </div>
      </Modal>

      <ConfirmModal
        isOpen={confirmReset}
        title="Kembalikan ke Brand Template?"
        message="Semua pengaturan gaya khusus untuk clip ini akan dihapus dan clip kembali mengikuti Brand Template agent. Teks & timing subtitle tidak berubah."
        confirmLabel="Reset gaya"
        danger
        loading={resetting}
        onConfirm={resetToTemplate}
        onClose={() => setConfirmReset(false)}
      />

      <ConfirmModal
        isOpen={confirmLeave}
        title="Perubahan belum disimpan"
        message="Simpan perubahan subtitle sebelum keluar dari editor?"
        confirmLabel="Simpan & keluar"
        cancelLabel="Batal"
        loading={saving}
        onConfirm={async () => {
          if (await save(true)) router.push('/clips/')
        }}
        onClose={() => setConfirmLeave(false)}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
          <button className="mc-link-button" style={{ color: 'var(--danger)' }} onClick={() => router.push('/clips/')}>
            Keluar tanpa menyimpan
          </button>
        </div>
      </ConfirmModal>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Small inspector controls
// ---------------------------------------------------------------------------

function Section({ title, divider, action, children }: { title: string; divider?: boolean; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '22px', paddingBottom: divider ? '22px' : 0, borderBottom: divider ? '1px solid var(--border-glass)' : 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '12px' }}>
        <h3 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.5px' }}>{title}</h3>
        {action}
      </div>
      {children}
    </div>
  )
}

function RangeRow({
  label,
  hint,
  note,
  min,
  max,
  step = 1,
  value,
  onChange,
}: {
  label: string
  hint?: string
  note?: string
  min: number
  max: number
  step?: number
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{label}</span>
        {hint && <span style={{ fontSize: '11px', color: value === 0 ? 'var(--text-dim)' : 'var(--primary)' }}>{hint}</span>}
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ cursor: 'pointer', accentColor: 'var(--primary)', width: '100%' }} />
      {note && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{note}</span>}
    </div>
  )
}

function ColorSwatch({ label, value, onChange, size }: { label?: string; value: string; onChange: (v: string) => void; size: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {label && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{label}</span>}
      <label style={{ width: `${size}px`, height: `${size}px`, borderRadius: size > 24 ? '8px' : '4px', background: value, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.25)', overflow: 'hidden', display: 'block' }}>
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff'} onChange={(e) => onChange(e.target.value)} style={{ opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }} />
      </label>
    </div>
  )
}

function ToggleChip({ active, onClick, style, title, children }: { active: boolean; onClick: () => void; style?: React.CSSProperties; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: active ? 'rgba(255,255,255,0.12)' : 'transparent',
        border: `1px solid ${active ? 'var(--primary)' : 'var(--border-glass)'}`,
        borderRadius: '4px',
        padding: '4px 8px',
        color: '#fff',
        fontSize: '14px',
        cursor: 'pointer',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

/** Number input that tolerates an empty/partial value while typing. */
function NumberInput({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(String(value))
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setText(String(value))
  }, [value])
  return (
    <input
      type="number"
      value={text}
      min={min}
      max={max}
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false
        setText(String(value))
      }}
      onChange={(e) => {
        setText(e.target.value)
        const n = Number(e.target.value)
        if (e.target.value !== '' && isFinite(n)) onChange(Math.max(min, Math.min(max, n)))
      }}
      style={{ background: 'transparent', border: 'none', color: '#fff', width: '100%', minWidth: '28px', padding: '4px 0', outline: 'none', fontSize: '12px' }}
    />
  )
}

/** Seconds input (2 decimals) committed on every valid value. */
function TimeInput({ value, onCommit, style }: { value: number; onCommit: (v: number) => void; style: React.CSSProperties }) {
  const [text, setText] = useState(value.toFixed(2))
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setText(Number(value).toFixed(2))
  }, [value])
  return (
    <input
      type="number"
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
      style={style}
    />
  )
}
