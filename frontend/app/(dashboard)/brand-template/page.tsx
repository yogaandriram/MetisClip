'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Undo, Redo, RefreshCw, Layout, Type, Image as ImageIcon, RotateCcw, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAgent } from '@/contexts/AgentContext'
import { useEngine } from '@/contexts/EngineContext'
import { Button } from '@/components/ui/Button'
import { GlassCard } from '@/components/ui/GlassCard'
import { Skeleton } from '@/components/ui/Skeleton'
import { Badge } from '@/components/ui/Badge'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { NoAgentState } from '@/components/NoAgentState'
import { api, type BrandTemplate } from '@/lib/engine'
import { errorMessage, formatDateTime } from '@/lib/format'
import { presets } from '@/lib/presets'
import { resolveCaptionStyle } from '@/lib/presets/defaults'
import { resolveAi } from '@/lib/presets/captions'

import { TemplateConfig, DEFAULT_TEMPLATE_CONFIG } from './types'
import { LayoutSettingsPanel } from './components/LayoutSettingsPanel'
import { CaptionSettingsPanel } from './components/CaptionSettingsPanel'
import { AiSettingsPanel } from './components/AiSettingsPanel'
import { BrandSettingsPanel } from './components/BrandSettingsPanel'
import { TemplatePreviewCanvas } from './components/TemplatePreviewCanvas'

type Section = 'layout_settings' | 'caption_settings' | 'ai_settings' | 'brand_settings'

function toConfig(tpl: BrandTemplate | null): TemplateConfig {
  const validModes = presets.map((p) => p.id)
  const caption = (tpl?.caption_settings || {}) as Partial<TemplateConfig['caption_settings']>
  const mode = caption.mode && validModes.includes(caption.mode) ? caption.mode : 'popshadow'
  const layout = (tpl?.layout_settings || {}) as Partial<TemplateConfig['layout_settings']>
  // Intro/outro, music and aspect/fit were removed (never applied to clips): drop them from old templates
  const { introUrl: _intro, musicUrl: _music, ...brand } = (tpl?.brand_settings || {}) as Record<string, any>
  return {
    layout_settings: { safeZone: layout.safeZone || DEFAULT_TEMPLATE_CONFIG.layout_settings.safeZone },
    // Caption keeps only what the user set; preset defaults are merged at display time
    caption_settings: { ...(tpl ? caption : { mode: 'popshadow' }), mode } as TemplateConfig['caption_settings'],
    ai_settings: resolveAi(tpl?.ai_settings as Partial<TemplateConfig['ai_settings']> | undefined),
    brand_settings: { ...DEFAULT_TEMPLATE_CONFIG.brand_settings, ...brand },
  }
}

export default function BrandTemplatePage() {
  const { activeAgent } = useAgent()
  const { epoch } = useEngine()

  const [config, setConfig] = useState<TemplateConfig>(() => toConfig(null))
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  const [confirmDefaults, setConfirmDefaults] = useState(false)
  const savedRef = useRef<string>('')

  const [history, setHistory] = useState<TemplateConfig[]>([config])
  const [historyIndex, setHistoryIndex] = useState(0)

  const load = useCallback(async (agentId: string) => {
    setLoaded(false)
    setLoadError(null)
    try {
      const { brand_template } = await api.agents.getBrandTemplate(agentId)
      const next = toConfig(brand_template)
      savedRef.current = brand_template ? JSON.stringify(next) : ''
      setConfig(next)
      setHistory([next])
      setHistoryIndex(0)
      setUpdatedAt(brand_template?.updated_at || null)
      setIsNew(!brand_template)
    } catch (err) {
      setLoadError(errorMessage(err, 'Gagal memuat brand template'))
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    if (activeAgent) load(activeAgent.id)
  }, [activeAgent, load, epoch])

  const hasChanges = JSON.stringify(config) !== savedRef.current

  const save = async () => {
    if (!activeAgent || isSaving) return
    setIsSaving(true)
    try {
      const { brand_template } = await api.agents.updateBrandTemplate(activeAgent.id, {
        layout_settings: config.layout_settings as unknown as Record<string, any>,
        caption_settings: config.caption_settings as unknown as Record<string, any>,
        ai_settings: config.ai_settings as unknown as Record<string, any>,
        brand_settings: config.brand_settings as unknown as Record<string, any>,
      })
      savedRef.current = JSON.stringify(config)
      setUpdatedAt(brand_template.updated_at)
      setIsNew(false)
      toast.success('Brand template disimpan. Clip baru & render berikutnya memakai pengaturan ini.')
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal menyimpan brand template'))
    } finally {
      setIsSaving(false)
    }
  }

  // Ctrl+S
  const saveRef = useRef(save)
  saveRef.current = save
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        saveRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const updateConfig = <K extends Section>(section: K, updates: Partial<TemplateConfig[K]>, replace = false) => {
    const next = { ...config, [section]: replace ? updates : { ...(config[section] as object), ...updates } } as TemplateConfig
    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push(next)
    if (newHistory.length > 50) newHistory.shift()
    setHistory(newHistory)
    setHistoryIndex(newHistory.length - 1)
    setConfig(next)
  }

  const handleUndo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1)
      setConfig(history[historyIndex - 1])
    }
  }

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1)
      setConfig(history[historyIndex + 1])
    }
  }

  const resetToDefaults = () => {
    const next = toConfig(null)
    const newHistory = [...history.slice(0, historyIndex + 1), next]
    setHistory(newHistory)
    setHistoryIndex(newHistory.length - 1)
    setConfig(next)
    setConfirmDefaults(false)
  }

  if (!activeAgent) {
    return (
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '30px', fontWeight: 800, marginBottom: '24px' }}>Brand Template</h1>
        <NoAgentState what="Brand Template" />
      </div>
    )
  }

  // Same resolution as the clip editor and the render (base ⊕ preset defaults ⊕ saved settings)
  const mergedCaptionSettings = resolveCaptionStyle(config.caption_settings)
  const SAFE_ZONE_LABEL: Record<string, string> = { none: 'Tidak ada', tiktok: 'TikTok', reels: 'IG Reels', shorts: 'YT Shorts' }

  const renderActiveMenuContent = () => {
    if (activeMenu === 'layout') {
      return <LayoutSettingsPanel layout={config.layout_settings} updateLayout={(updates) => updateConfig('layout_settings', updates)} />
    }
    if (activeMenu === 'caption') {
      return <CaptionSettingsPanel caption={mergedCaptionSettings} updateCaption={(updates, replace) => updateConfig('caption_settings', updates, replace)} />
    }
    if (activeMenu === 'overlay') {
      return <BrandSettingsPanel agentId={activeAgent.id} brand={config.brand_settings} updateBrand={(updates) => updateConfig('brand_settings', updates)} />
    }
    return null
  }

  const MenuItem = ({ icon: Icon, label, value, id }: { icon: React.ElementType; label: string; value: string; id: string }) => {
    const isActive = activeMenu === id
    return (
      <div
        onClick={() => setActiveMenu(isActive ? null : id)}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          cursor: 'pointer',
          borderRadius: '8px',
          background: isActive ? 'var(--bg-glass-active)' : 'transparent',
          marginBottom: '4px',
          transition: 'all 0.2s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Icon size={18} color="var(--text-muted)" />
          <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>{label}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{value}</span>
          <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{'>'}</span>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', paddingBottom: '20px', borderBottom: '1px solid var(--border-glass)', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px', flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 800 }}>Brand Template</h1>
          <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Gaya default clip untuk {activeAgent.name}</span>
          {isNew ? (
            <Badge variant="warning" glow={false}>
              Belum pernah disimpan
            </Badge>
          ) : (
            updatedAt && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Disimpan {formatDateTime(updatedAt)}</span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button className="mc-icon-button" onClick={handleUndo} disabled={historyIndex <= 0} title="Undo">
            <Undo size={16} />
          </button>
          <button className="mc-icon-button" onClick={handleRedo} disabled={historyIndex >= history.length - 1} title="Redo">
            <Redo size={16} />
          </button>
          <button className="mc-icon-button" onClick={() => load(activeAgent.id)} title="Muat ulang dari database">
            <RefreshCw size={16} className={!loaded ? 'animate-spin' : ''} />
          </button>
          <Button variant="secondary" size="sm" onClick={() => setConfirmDefaults(true)} icon={<RotateCcw size={14} />}>
            Default
          </Button>
          <Button variant="primary" size="sm" onClick={save} loading={isSaving} disabled={!hasChanges && !isNew} icon={<Save size={14} />}>
            Simpan
          </Button>
        </div>
      </div>

      {!loaded ? (
        <div style={{ display: 'flex', gap: '10px' }}>
          <Skeleton width={300} height={610} />
          <Skeleton width={300} height={533} style={{ margin: '0 auto' }} />
        </div>
      ) : loadError ? (
        <GlassCard hoverEffect={false} padding="20px" style={{ border: '1px solid var(--danger)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ flex: 1 }}>{loadError}</span>
          <button className="mc-link-button" onClick={() => load(activeAgent.id)}>
            Coba lagi
          </button>
        </GlassCard>
      ) : (
        <div style={{ display: 'flex', flex: 1, gap: '10px' }}>
          <GlassCard hoverEffect={false} style={{ width: '300px', height: '610px', padding: '20px', flexShrink: 0 }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '20px' }}>Pengaturan</h2>

            <div style={{ marginBottom: '24px' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', paddingLeft: '8px' }}>Gaya</p>
              <MenuItem id="layout" icon={Layout} label="Safe zone" value={SAFE_ZONE_LABEL[config.layout_settings.safeZone || 'none'] || ''} />
              <MenuItem id="caption" icon={Type} label="Caption" value={`${mergedCaptionSettings.fontFamily} ${mergedCaptionSettings.fontSize}`} />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', paddingLeft: '8px' }}>Brand</p>
              <MenuItem id="overlay" icon={ImageIcon} label="Overlay (logo, CTA)" value={config.brand_settings.overlayUrl ? '1 dipilih' : ''} />
            </div>

            <div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', paddingLeft: '8px' }}>AI subtitle</p>
              <AiSettingsPanel ai={config.ai_settings} updateAi={(updates) => updateConfig('ai_settings', updates)} />
            </div>
          </GlassCard>

          {activeMenu && renderActiveMenuContent()}

          <TemplatePreviewCanvas
            caption={mergedCaptionSettings}
            ai={config.ai_settings}
            brandSettings={config.brand_settings}
            layoutSettings={config.layout_settings}
            onUpdateBrand={(updates) => updateConfig('brand_settings', updates)}
          />
        </div>
      )}

      <ConfirmModal
        isOpen={confirmDefaults}
        title="Kembalikan ke pengaturan default?"
        message="Semua pengaturan di halaman ini diganti dengan nilai bawaan MetisClip. Perubahan baru tersimpan setelah Anda klik Simpan (bisa di-undo)."
        confirmLabel="Pakai default"
        onConfirm={resetToDefaults}
        onClose={() => setConfirmDefaults(false)}
      />
    </div>
  )
}
