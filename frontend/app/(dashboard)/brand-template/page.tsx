'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Captions, ChevronDown, Image as ImageIcon, LayoutTemplate, Redo, RefreshCw, RotateCcw, Save, Trash2, Type, Undo } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAgent } from '@/contexts/AgentContext'
import { useEngine } from '@/contexts/EngineContext'
import { Alert, Badge, Button, Card, ConfirmModal, IconButton, InputField, Modal, PageHeader, Skeleton } from '@/components/ui'
import { api, type BrandTemplate } from '@/lib/engine'
import { errorMessage, formatDateTime } from '@/lib/format'
import { tm } from '@/lib/i18n'
import { useT } from '@/lib/i18n/I18nProvider'
import { presets } from '@/lib/presets'
import { resolveCaptionStyle } from '@/lib/presets/defaults'
import { resolveAi } from '@/lib/presets/captions'
import { type LayoutPatch, mergeLayout, resolveLayout } from '@/lib/presets/layout'

import { TemplateConfig, DEFAULT_TEMPLATE_CONFIG, LayoutSettings } from './types'
import { LayoutSettingsPanel, layoutSummary } from './components/LayoutSettingsPanel'
import { CaptionSettingsPanel, presetLabel } from './components/CaptionSettingsPanel'
import { AiSettingsPanel } from './components/AiSettingsPanel'
import { BrandSettingsPanel } from './components/BrandSettingsPanel'
import { TemplatePreviewCanvas } from './components/TemplatePreviewCanvas'
import { TemplateLibraryBar } from './components/TemplateLibraryBar'

type Section = 'layout_settings' | 'caption_settings' | 'ai_settings' | 'brand_settings'
type PanelId = 'caption' | 'ai' | 'overlay' | 'layout'
type NameDialog = { mode: 'create' | 'duplicate' | 'rename'; value: string }

const STORAGE_KEY = 'brandTemplateId'
const NAME_FORM_ID = 'brand-template-name-form'

function readStoredId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function writeStoredId(id: string) {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    /* per-viewer convenience only */
  }
}

function toConfig(tpl: BrandTemplate | null): TemplateConfig {
  const validModes = presets.map((p) => p.id)
  const caption = (tpl?.caption_settings || {}) as Partial<TemplateConfig['caption_settings']>
  const mode = caption.mode && validModes.includes(caption.mode) ? caption.mode : 'popshadow'
  const layout = (tpl?.layout_settings || {}) as Partial<TemplateConfig['layout_settings']>
  // Intro/outro, music and aspect/fit were removed (never applied to clips): drop them from old templates
  const { introUrl: _intro, musicUrl: _music, ...brand } = (tpl?.brand_settings || {}) as Record<string, any>
  return {
    layout_settings: { ...resolveLayout(layout), safeZone: layout.safeZone || DEFAULT_TEMPLATE_CONFIG.layout_settings.safeZone },
    // Caption keeps only what the user set; preset defaults are merged at display time
    caption_settings: { ...(tpl ? caption : { mode: 'popshadow' }), mode } as TemplateConfig['caption_settings'],
    ai_settings: resolveAi(tpl?.ai_settings as Partial<TemplateConfig['ai_settings']> | undefined),
    brand_settings: { ...DEFAULT_TEMPLATE_CONFIG.brand_settings, ...brand },
  }
}

interface SettingsSectionProps {
  id: PanelId
  title: string
  icon: React.ReactNode
  /** Current value, shown in the header so a closed section still says what it is set to */
  summary?: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}

/** A settings card whose header opens and closes it. Closed sections keep their state. */
function SettingsSection({ id, title, icon, summary, open, onToggle, children }: SettingsSectionProps) {
  const bodyId = `brand-template-section-${id}`
  return (
    <Card as="section" padding="sm" aria-labelledby={`${bodyId}-title`}>
      <button
        type="button"
        className="mc-btn mc-btn--ghost mc-btn--block"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={onToggle}
        style={{
          justifyContent: 'space-between',
          height: 'auto',
          minHeight: 52,
          margin: -8,
          width: 'calc(100% + 16px)',
          padding: '8px 12px',
          borderRadius: 'var(--r-md)',
        }}
      >
        <span className="mc-row" style={{ flexShrink: 0 }}>
          {icon}
          <span id={`${bodyId}-title`} className="mc-h3">
            {title}
          </span>
        </span>
        <span className="mc-row mc-gap-8">
          {summary && <span className="mc-caption mc-muted mc-truncate">{summary}</span>}
          <ChevronDown
            size={18}
            aria-hidden="true"
            style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform var(--dur-base) var(--ease-out)' }}
          />
        </span>
      </button>
      <div id={bodyId} hidden={!open} style={{ marginTop: 'var(--s-5)' }}>
        {children}
      </div>
    </Card>
  )
}

export default function BrandTemplatePage() {
  const t = useT()
  const { activeAgent, isAgentLoading, refreshAgents } = useAgent()
  const { epoch } = useEngine()

  const [templates, setTemplates] = useState<BrandTemplate[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [config, setConfig] = useState<TemplateConfig>(() => toConfig(null))
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [openPanels, setOpenPanels] = useState<Record<PanelId, boolean>>({ caption: true, ai: true, overlay: false, layout: false })
  const [confirmDefaults, setConfirmDefaults] = useState(false)
  // Ratio of the template's sample video (the preview frame uses it like a clip's source)
  const [sampleAspect, setSampleAspect] = useState(16 / 9)
  const savedRef = useRef<string>('')

  const [history, setHistory] = useState<TemplateConfig[]>([config])
  const [historyIndex, setHistoryIndex] = useState(0)

  // Library actions
  const [nameDialog, setNameDialog] = useState<NameDialog | null>(null)
  const [nameBusy, setNameBusy] = useState(false)
  const [discardThen, setDiscardThen] = useState<(() => void) | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [settingDefault, setSettingDefault] = useState(false)

  const selected = templates.find((x) => x.id === selectedId) || null
  const hasChanges = !!selected && JSON.stringify(config) !== savedRef.current

  const applyTemplate = useCallback((tpl: BrandTemplate) => {
    const next = toConfig(tpl)
    savedRef.current = JSON.stringify(next)
    setConfig(next)
    setHistory([next])
    setHistoryIndex(0)
    setSelectedId(tpl.id)
    writeStoredId(tpl.id)
  }, [])

  /** Reload the library; open `preferId`, else the active agent's default, else the last one used. */
  const loadAll = useCallback(
    async (preferId?: string | null) => {
      setLoaded(false)
      setLoadError(null)
      try {
        const { brand_templates } = await api.brandTemplates.list()
        setTemplates(brand_templates)
        const wanted = [preferId, activeAgent?.default_brand_template_id, readStoredId()]
        const tpl = wanted.map((id) => id && brand_templates.find((x) => x.id === id)).find(Boolean) || brand_templates[0]
        if (tpl) applyTemplate(tpl)
      } catch (err) {
        setLoadError(errorMessage(err, tm().brand.page.loadFailed))
      } finally {
        setLoaded(true)
      }
    },
    // The agent only decides the first template shown; switching agents later keeps the open template
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applyTemplate],
  )

  // First load once the agents are known (the active agent's default is opened first). Later agent
  // refreshes (e.g. "Jadikan default") must not reload the editor and drop unsaved changes.
  const initRef = useRef(false)
  useEffect(() => {
    if (isAgentLoading || initRef.current) return
    initRef.current = true
    loadAll(null)
  }, [isAgentLoading, loadAll])

  // A link to /brand-template/#layout (e.g. from the clip editor) opens that section and scrolls to it.
  // Read once the library has loaded: by then a client-side navigation has committed the URL.
  useEffect(() => {
    const id = window.location.hash.slice(1)
    if (!loaded || !Object.prototype.hasOwnProperty.call(openPanels, id)) return
    setOpenPanels((open) => ({ ...open, [id]: true }))
    requestAnimationFrame(() => document.getElementById(`brand-template-section-${id}-title`)?.scrollIntoView({ block: 'start' }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

  // Engine restarted: refresh names and usage only
  const epochRef = useRef(epoch)
  useEffect(() => {
    if (epoch === epochRef.current) return
    epochRef.current = epoch
    if (initRef.current) refreshList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epoch])

  /** Refresh names and usage counts without touching the open editor state. */
  const refreshList = async () => {
    try {
      const { brand_templates } = await api.brandTemplates.list()
      setTemplates(brand_templates)
      return brand_templates
    } catch {
      return templates
    }
  }

  /** Run `action` now, or after the user agrees to drop unsaved changes. */
  const guard = (action: () => void) => {
    if (hasChanges) setDiscardThen(() => action)
    else action()
  }

  const selectTemplate = (id: string) => {
    if (id === selectedId) return
    guard(() => {
      const tpl = templates.find((x) => x.id === id)
      if (tpl) applyTemplate(tpl)
    })
  }

  const save = async () => {
    if (!selected || isSaving) return
    setIsSaving(true)
    try {
      const { brand_template } = await api.brandTemplates.update(selected.id, {
        layout_settings: config.layout_settings as unknown as Record<string, any>,
        caption_settings: config.caption_settings as unknown as Record<string, any>,
        ai_settings: config.ai_settings as unknown as Record<string, any>,
        brand_settings: config.brand_settings as unknown as Record<string, any>,
      })
      savedRef.current = JSON.stringify(config)
      setTemplates((list) => list.map((x) => (x.id === brand_template.id ? brand_template : x)))
      toast.success(t.brand.toasts.saved(brand_template.name))
    } catch (err) {
      toast.error(errorMessage(err, t.brand.toasts.saveFailed))
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

  const submitName = async () => {
    if (!nameDialog || nameBusy) return
    const name = nameDialog.value.trim()
    if (!name) return
    setNameBusy(true)
    try {
      if (nameDialog.mode === 'rename' && selected) {
        const { brand_template } = await api.brandTemplates.update(selected.id, { name })
        setTemplates((list) => list.map((x) => (x.id === brand_template.id ? brand_template : x)))
        toast.success(t.brand.toasts.renamed)
      } else {
        const copyFrom = nameDialog.mode === 'duplicate' ? selected?.id : undefined
        const { brand_template } = await api.brandTemplates.create(name, copyFrom)
        await refreshList()
        applyTemplate(brand_template)
        toast.success(copyFrom ? t.brand.toasts.duplicated : t.brand.toasts.created)
      }
      setNameDialog(null)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setNameBusy(false)
    }
  }

  const deleteSelected = async () => {
    if (!selected) return
    setDeleting(true)
    try {
      await api.brandTemplates.remove(selected.id)
      const list = await refreshList()
      await refreshAgents()
      const next = list.find((x) => x.id === activeAgent?.default_brand_template_id) || list[0]
      if (next) applyTemplate(next)
      toast.success(t.brand.toasts.deleted(selected.name))
      setConfirmDelete(false)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setDeleting(false)
    }
  }

  const makeDefault = async () => {
    if (!activeAgent || !selected) return
    setSettingDefault(true)
    try {
      await api.agents.update(activeAgent.id, { default_brand_template_id: selected.id })
      await Promise.all([refreshAgents(), refreshList()])
      toast.success(t.brand.toasts.madeDefault(activeAgent.name, selected.name))
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSettingDefault(false)
    }
  }

  const updateConfig = <K extends Section>(section: K, updates: Partial<TemplateConfig[K]>, replace = false) => {
    const next = { ...config, [section]: replace ? updates : { ...(config[section] as object), ...updates } } as TemplateConfig
    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push(next)
    if (newHistory.length > 50) newHistory.shift()
    setHistory(newHistory)
    setHistoryIndex(newHistory.length - 1)
    setConfig(next)
  }

  /** Layout sections are nested: merge the patch into the full layout, keep the safe-zone guide. */
  const updateLayout = (patch: LayoutPatch & { safeZone?: LayoutSettings['safeZone'] }) => {
    const current = config.layout_settings
    const next: LayoutSettings = { ...resolveLayout(mergeLayout(current, patch)), safeZone: patch.safeZone ?? current.safeZone }
    updateConfig('layout_settings', next, true)
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

  const togglePanel = (id: PanelId) => setOpenPanels((open) => ({ ...open, [id]: !open[id] }))

  // Same resolution as the clip editor and the render (base ⊕ preset defaults ⊕ saved settings)
  const mergedCaptionSettings = resolveCaptionStyle(config.caption_settings)
  const activePreset = presets.find((p) => p.id === mergedCaptionSettings.mode)
  const aiOnCount = [config.ai_settings.fillerWords, config.ai_settings.pauses, config.ai_settings.keywords, config.ai_settings.emojis].filter(Boolean).length

  const nameTitle =
    nameDialog?.mode === 'rename' ? t.brand.nameDialog.renameTitle : nameDialog?.mode === 'duplicate' ? t.brand.nameDialog.duplicateTitle : t.brand.nameDialog.createTitle

  return (
    <>
      <PageHeader
        title={t.brand.page.title}
        subtitle={t.brand.page.subtitle}
        actions={
          <>
            <IconButton label={t.brand.page.undo} tooltip="bottom" icon={<Undo size={18} aria-hidden="true" />} onClick={handleUndo} disabled={historyIndex <= 0} />
            <IconButton label={t.brand.page.redo} tooltip="bottom" icon={<Redo size={18} aria-hidden="true" />} onClick={handleRedo} disabled={historyIndex >= history.length - 1} />
            <IconButton
              label={t.brand.page.reload}
              tooltip="bottom"
              icon={<RefreshCw size={18} aria-hidden="true" className={!loaded ? 'animate-spin' : undefined} />}
              onClick={() => guard(() => loadAll(selectedId))}
            />
            <Button variant="primary" onClick={save} loading={isSaving} disabled={!hasChanges} icon={<Save size={16} aria-hidden="true" />}>
              {t.common.save}
            </Button>
          </>
        }
      />

      {!loaded && !selected ? (
        <div style={{ display: 'grid', gridTemplateColumns: '300px minmax(0, 1fr) 348px', gap: 'var(--s-5)', alignItems: 'start' }}>
          <Skeleton height={320} radius="lg" />
          <Skeleton height={610} radius="lg" />
          <Skeleton height={620} radius="lg" />
        </div>
      ) : loadError ? (
        <Alert
          tone="error"
          title={t.brand.page.loadErrorTitle}
          action={
            <Button variant="secondary" size="sm" onClick={() => loadAll(selectedId)}>
              {t.common.retry}
            </Button>
          }
        >
          {loadError}
        </Alert>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '300px minmax(0, 1fr) auto', gap: 'var(--s-5)', alignItems: 'start' }}>
          <TemplateLibraryBar
            templates={templates}
            selected={selected}
            activeAgent={activeAgent}
            settingDefault={settingDefault}
            onSelect={selectTemplate}
            onCreate={() => guard(() => setNameDialog({ mode: 'create', value: t.brand.nameDialog.defaultName(templates.length + 1) }))}
            onDuplicate={() => selected && guard(() => setNameDialog({ mode: 'duplicate', value: t.brand.nameDialog.copyName(selected.name).slice(0, 80) }))}
            onRename={() => selected && setNameDialog({ mode: 'rename', value: selected.name })}
            onDelete={() => setConfirmDelete(true)}
            onMakeDefault={makeDefault}
          />

          <div className="mc-stack">
            <div className="mc-row mc-row--between mc-row--top">
              <div className="mc-grow">
                <h2 className="mc-h2 mc-truncate" title={selected?.name}>
                  {selected?.name || t.brand.page.untitled}
                </h2>
                <div className="mc-row mc-gap-8 mc-row--wrap" style={{ marginTop: 'var(--s-1)' }}>
                  {hasChanges ? (
                    <Badge tone="warning" size="sm">
                      {t.brand.page.unsaved}
                    </Badge>
                  ) : (
                    selected?.updated_at && <span className="mc-caption mc-muted">{t.brand.page.savedAt(formatDateTime(selected.updated_at))}</span>
                  )}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDefaults(true)} icon={<RotateCcw size={16} aria-hidden="true" />} disabled={!selected}>
                {t.brand.page.resetDefaults}
              </Button>
            </div>

            <SettingsSection
              id="caption"
              title={t.brand.sections.caption}
              icon={<Type size={20} aria-hidden="true" />}
              summary={`${activePreset ? `${presetLabel(activePreset.name)} · ` : ''}${mergedCaptionSettings.fontFamily} ${mergedCaptionSettings.fontSize}`}
              open={openPanels.caption}
              onToggle={() => togglePanel('caption')}
            >
              <CaptionSettingsPanel
                caption={mergedCaptionSettings}
                emoji={config.ai_settings.emojis}
                updateCaption={(updates, replace) => updateConfig('caption_settings', updates, replace)}
              />
            </SettingsSection>

            <SettingsSection
              id="ai"
              title={t.brand.sections.ai}
              icon={<Captions size={20} aria-hidden="true" />}
              summary={t.brand.summary.aiOn(aiOnCount, 4)}
              open={openPanels.ai}
              onToggle={() => togglePanel('ai')}
            >
              <AiSettingsPanel ai={config.ai_settings} updateAi={(updates) => updateConfig('ai_settings', updates)} />
            </SettingsSection>

            <SettingsSection
              id="overlay"
              title={t.brand.sections.overlay}
              icon={<ImageIcon size={20} aria-hidden="true" />}
              summary={config.brand_settings.overlayUrl ? t.brand.summary.logoSet : t.brand.summary.noLogo}
              open={openPanels.overlay}
              onToggle={() => togglePanel('overlay')}
            >
              {selected && (
                <BrandSettingsPanel templateId={selected.id} brand={config.brand_settings} updateBrand={(updates) => updateConfig('brand_settings', updates)} />
              )}
            </SettingsSection>

            <SettingsSection
              id="layout"
              title={t.brand.sections.layout}
              icon={<LayoutTemplate size={20} aria-hidden="true" />}
              summary={layoutSummary(config.layout_settings, t)}
              open={openPanels.layout}
              onToggle={() => togglePanel('layout')}
            >
              {selected && (
                <LayoutSettingsPanel
                  templateId={selected.id}
                  layout={config.layout_settings}
                  caption={mergedCaptionSettings}
                  emoji={config.ai_settings.emojis}
                  keywordsOn={config.ai_settings.keywords}
                  brandLogoUrl={config.brand_settings.overlayUrl || ''}
                  aspect={sampleAspect}
                  updateLayout={updateLayout}
                  updateCaption={(updates) => updateConfig('caption_settings', updates)}
                />
              )}
            </SettingsSection>
          </div>

          <div style={{ position: 'sticky', top: 'var(--s-4)' }}>
            <TemplatePreviewCanvas
              caption={mergedCaptionSettings}
              ai={config.ai_settings}
              brandSettings={config.brand_settings}
              layoutSettings={config.layout_settings}
              onSampleAspect={setSampleAspect}
              onUpdateLayout={updateLayout}
              onUpdateBrand={(updates) => updateConfig('brand_settings', updates)}
              onUpdateCaption={(updates) => updateConfig('caption_settings', updates)}
            />
          </div>
        </div>
      )}

      <Modal
        isOpen={!!nameDialog}
        onClose={() => !nameBusy && setNameDialog(null)}
        title={nameTitle}
        busy={nameBusy}
        footer={
          <>
            <Button variant="ghost" onClick={() => setNameDialog(null)} disabled={nameBusy}>
              {t.common.cancel}
            </Button>
            <Button type="submit" form={NAME_FORM_ID} variant="primary" loading={nameBusy} disabled={!nameDialog?.value.trim()}>
              {nameDialog?.mode === 'rename' ? t.brand.nameDialog.saveName : t.brand.nameDialog.create}
            </Button>
          </>
        }
      >
        <form
          id={NAME_FORM_ID}
          onSubmit={(e) => {
            e.preventDefault()
            submitName()
          }}
        >
          <InputField
            label={t.brand.nameDialog.label}
            value={nameDialog?.value || ''}
            onChange={(e) => nameDialog && setNameDialog({ ...nameDialog, value: e.target.value })}
            maxLength={80}
            data-autofocus
            onFocus={(e) => e.currentTarget.select()}
            placeholder={t.brand.nameDialog.placeholder}
            hint={nameDialog?.mode === 'duplicate' ? t.brand.nameDialog.duplicateHint(selected?.name || '') : undefined}
          />
        </form>
      </Modal>

      <ConfirmModal
        isOpen={!!discardThen}
        title={t.brand.discard.title}
        message={t.brand.discard.message(selected?.name || t.brand.discard.thisTemplate)}
        confirmLabel={t.brand.discard.confirm}
        danger
        onConfirm={() => {
          const action = discardThen
          setDiscardThen(null)
          action?.()
        }}
        onClose={() => setDiscardThen(null)}
      />

      <ConfirmModal
        isOpen={confirmDelete}
        title={t.brand.deleteDialog.title(selected?.name || '')}
        message={
          <div className="mc-stack mc-gap-8">
            {(selected?.used_by_agents || []).length > 0 && (
              <p>{t.brand.deleteDialog.defaultFor((selected?.used_by_agents || []).map((a) => a.name).join(', '))}</p>
            )}
            <p>{t.brand.deleteDialog.body(selected?.clip_count || 0)}</p>
          </div>
        }
        confirmLabel={t.brand.deleteDialog.confirm}
        confirmIcon={<Trash2 size={16} aria-hidden="true" />}
        danger
        loading={deleting}
        onConfirm={deleteSelected}
        onClose={() => setConfirmDelete(false)}
      />

      <ConfirmModal
        isOpen={confirmDefaults}
        title={t.brand.defaultsDialog.title}
        message={t.brand.defaultsDialog.message}
        confirmLabel={t.brand.defaultsDialog.confirm}
        onConfirm={resetToDefaults}
        onClose={() => setConfirmDefaults(false)}
      />
    </>
  )
}
