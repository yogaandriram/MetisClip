'use client'

import React, { useCallback, useEffect, useId, useState } from 'react'
import { AppWindow, Cpu, Download, FolderOpen, HardDrive, KeyRound, Mic, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import { Alert, Button, Card, CardHeader, Field, IconButton, InputField, LanguageSwitch, PageHeader, SelectField, Skeleton, ToggleSwitch } from '@/components/ui'
import { LlmSection } from '@/components/settings/LlmFields'
import { WhisperSection } from '@/components/settings/WhisperFields'
import { useEngine } from '@/contexts/EngineContext'
import { api, type EncoderSetting, type ResourceStatus, type SecretName, type Settings } from '@/lib/engine'
import { errorMessage } from '@/lib/format'
import { isDesktop } from '@/lib/media'
import { getLang, localeTag, tm } from '@/lib/i18n'
import { useT } from '@/lib/i18n/I18nProvider'
import { useUpdateStatus } from '@/lib/updates'
import { useUnsavedGuard } from '@/components/shell/UnsavedGuard'

const ENCODERS: EncoderSetting[] = ['auto', 'libx264', 'h264_nvenc', 'h264_qsv', 'h264_amf']

/** Fixed choices for "Keep RAM free for other apps" (0 = automatic, backend/core/resources.py) */
const RESERVE_GB = [1, 1.5, 2, 3, 4, 6]

const gbLabel = (mb: number) => (mb / 1024).toLocaleString(localeTag(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })

const gbNumber = (gb: number) => gb.toLocaleString(localeTag())

/** A folder or file path shown read-only, with "Change…" and "Open in Explorer" next to it. */
function PathField({
  label,
  hint,
  value,
  placeholder,
  onPick,
  onOpen,
}: {
  label: string
  hint?: string
  value: string | null
  placeholder?: string
  onPick?: () => void
  onOpen?: () => void
}) {
  const t = useT()
  const id = useId()
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <div className="mc-row mc-gap-8">
        <InputField
          id={id}
          readOnly
          mono
          value={value || ''}
          placeholder={placeholder || '-'}
          containerClassName="mc-grow"
          aria-describedby={hint ? `${id}-hint` : undefined}
        />
        {onPick && (
          <Button type="button" variant="secondary" onClick={onPick}>
            {t.common.change}
          </Button>
        )}
        {onOpen && <IconButton variant="outline" label={t.common.openInExplorer} icon={<FolderOpen size={16} />} onClick={onOpen} disabled={!value} />}
      </div>
    </Field>
  )
}

function SettingsSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="mc-stack">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={68} radius="md" />
      ))}
    </div>
  )
}

const headerIcon = (Icon: React.ElementType) => <Icon size={18} aria-hidden="true" />

/** "Keep running in the tray": a shell setting, saved by the main process at once (preferences.json). */
function TraySwitch() {
  const m = useT().settings.app
  const [on, setOn] = useState<boolean | null>(null)

  useEffect(() => {
    window.metis
      ?.getCloseToTray()
      .then(setOn)
      .catch(() => setOn(false))
  }, [])

  if (on === null) return <Skeleton height={48} radius="md" />
  return (
    <ToggleSwitch
      label={m.tray}
      hint={m.trayHint}
      checked={on}
      onChange={async (v) => {
        setOn(v)
        try {
          await window.metis!.setCloseToTray(v)
        } catch (err) {
          setOn(!v)
          toast.error(errorMessage(err, m.trayFailed))
        }
      }}
    />
  )
}

/** "Perbarui MetisClip otomatis" (main/updater.ts, preferences.json); hidden in a development build. */
function AutoUpdateSwitch() {
  const m = useT().settings.app
  const status = useUpdateStatus()
  const [saving, setSaving] = useState<boolean | null>(null)

  if (!status) return <Skeleton height={48} radius="md" />
  if (status.phase === 'unsupported') return null
  return (
    <ToggleSwitch
      label={m.autoUpdate}
      hint={m.autoUpdateHint}
      checked={saving ?? status.auto}
      onChange={async (v) => {
        setSaving(v)
        try {
          await window.metis!.setAutoUpdate(v)
        } catch (err) {
          toast.error(errorMessage(err, m.autoUpdateFailed))
        } finally {
          setSaving(null)
        }
      }}
    />
  )
}

export default function SettingsPage() {
  const t = useT()
  const m = t.settings
  const { epoch, systemInfo, refreshSystemInfo } = useEngine()
  const desktop = isDesktop()

  const [settings, setSettings] = useState<Settings | null>(null)
  const [savedSettings, setSavedSettings] = useState('')
  const [encoders, setEncoders] = useState<string[]>([])
  const [ram, setRam] = useState<ResourceStatus | null>(null)
  const [secrets, setSecrets] = useState<Record<SecretName, boolean> | null>(null)
  const [secretValues, setSecretValues] = useState<Partial<Record<SecretName, string>>>({})
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const [s, sec] = await Promise.all([api.settings.get(), api.secrets.status()])
      setSettings(s.settings)
      setSavedSettings(JSON.stringify(s.settings))
      setSecrets(sec.secrets)
    } catch (err) {
      setLoadError(errorMessage(err, tm().settings.loadFailed))
    }
    api.system
      .check()
      .then((c) => setEncoders(c.encoders))
      .catch(() => setEncoders([]))
    api.system
      .resources()
      .then(setRam)
      .catch(() => setRam(null))
  }, [])

  useEffect(() => {
    load()
  }, [load, epoch])

  const dirty = settings ? JSON.stringify(settings) !== savedSettings : false

  const patch = <K extends keyof Settings>(key: K, value: Settings[K]) => setSettings((s) => (s ? { ...s, [key]: value } : s))

  const saveSettings = async (): Promise<boolean> => {
    if (!settings) return false
    setSaving(true)
    try {
      const { settings: next } = await api.settings.update({ ...settings, app: { ...settings.app, language: getLang() } })
      setSettings(next)
      setSavedSettings(JSON.stringify(next))
      refreshSystemInfo()
      toast.success(m.saved)
      return true
    } catch (err) {
      toast.error(errorMessage(err, m.saveFailed))
      return false
    } finally {
      setSaving(false)
    }
  }

  useUnsavedGuard(dirty, saveSettings)

  const saveLlmOnly = async () => {
    if (!settings) return
    const { settings: next } = await api.settings.update({ llm: settings.llm })
    setSettings((s) => (s ? { ...s, llm: next.llm } : s))
    setSavedSettings((prev) => {
      try {
        return JSON.stringify({ ...JSON.parse(prev), llm: next.llm })
      } catch {
        return prev
      }
    })
  }

  const pickFolder = async (title: string, current: string | undefined) => (window.metis ? window.metis.selectFolder({ title, defaultPath: current }) : null)

  const openFolder = async (path: string | undefined | null) => {
    if (!window.metis || !path) return
    const res = await window.metis.openPath(path)
    if (!res.ok) toast.error(res.error || m.folderOpenFailed)
  }

  const encoderOptions = ENCODERS.filter((e) => e === 'auto' || e === 'libx264' || encoders.includes(e) || settings?.processing.encoder === e).map((e) => ({
    value: e,
    label: m.processing.encoders[e],
  }))

  const reserveOptions = [
    { value: '0', label: ram ? m.processing.reserveAuto(gbLabel(ram.auto_reserve_mb)) : t.common.auto },
    ...RESERVE_GB.filter((gb) => !ram || gb * 1024 < ram.total_mb / 2).map((gb) => ({ value: String(gb), label: `${gbNumber(gb)} GB` })),
  ]
  if (settings && settings.resources.reserve_gb && !reserveOptions.some((o) => o.value === String(settings.resources.reserve_gb))) {
    reserveOptions.push({ value: String(settings.resources.reserve_gb), label: `${gbNumber(settings.resources.reserve_gb)} GB` })
  }

  return (
    <>
      <PageHeader title={m.title} subtitle={m.subtitle} />

      <div className="mc-stack mc-gap-20" style={{ maxWidth: 760 }}>
        {loadError && (
          <Alert
            tone="error"
            title={m.loadErrorTitle}
            action={
              <Button variant="secondary" size="sm" onClick={load}>
                {t.common.retry}
              </Button>
            }
          >
            {loadError}
          </Alert>
        )}

        <Card>
          <CardHeader
            size="sm"
            icon={headerIcon(KeyRound)}
            title={m.llmCard.title}
            subtitle={m.llmCard.subtitle}
          />
          {!settings || !secrets ? (
            <SettingsSkeleton rows={3} />
          ) : (
            <LlmSection
              value={settings.llm}
              onChange={(llm) => patch('llm', llm)}
              secrets={secrets}
              onSecretConfigured={(name, c) => setSecrets((prev) => (prev ? { ...prev, [name]: c } : prev))}
              persist={saveLlmOnly}
            />
          )}
        </Card>

        <Card id="transkripsi">
          <CardHeader
            size="sm"
            icon={headerIcon(Mic)}
            title={m.transcriptionCard.title}
            subtitle={m.transcriptionCard.subtitle}
          />
          {!settings || !secrets ? (
            <SettingsSkeleton rows={3} />
          ) : (
            <WhisperSection
              value={settings.whisper}
              onChange={(whisper) => patch('whisper', whisper)}
              groqConfigured={secrets.groq_api_key}
              groqValue={secretValues.groq_api_key || ''}
              onGroqValue={(v) => setSecretValues((prev) => ({ ...prev, groq_api_key: v }))}
              onGroqConfigured={(c) => setSecrets((prev) => (prev ? { ...prev, groq_api_key: c } : prev))}
            />
          )}
        </Card>

        <Card id="pemrosesan">
          <CardHeader size="sm" icon={headerIcon(Cpu)} title={m.processing.title} subtitle={m.processing.subtitle} />
          {!settings ? (
            <SettingsSkeleton rows={3} />
          ) : (
            <div className="mc-stack mc-gap-20">
              <div className="mc-grid">
                <InputField
                  containerClassName="mc-col-6"
                  type="number"
                  min={1}
                  max={8}
                  label={m.processing.workers}
                  hint={m.processing.workersHint}
                  value={settings.processing.max_workers}
                  mono
                  onChange={(e) => patch('processing', { ...settings.processing, max_workers: Math.max(1, parseInt(e.target.value) || 1) })}
                />
                <InputField
                  containerClassName="mc-col-6"
                  type="number"
                  min={1}
                  max={4}
                  label={m.processing.renders}
                  hint={m.processing.rendersHint}
                  value={settings.render.concurrency}
                  mono
                  onChange={(e) => patch('render', { concurrency: Math.max(1, parseInt(e.target.value) || 1) })}
                />
              </div>
              <SelectField
                label={m.processing.encoder}
                hint={encoders.length ? `${m.processing.encoderHint} ${m.processing.encoderDetected(encoders.join(', '))}` : m.processing.encoderHint}
                value={settings.processing.encoder}
                options={encoderOptions}
                onChange={(e) => patch('processing', { ...settings.processing, encoder: e.target.value as EncoderSetting })}
              />
              <ToggleSwitch
                label={m.processing.ramSaver}
                hint={m.processing.ramSaverHint}
                checked={settings.resources.auto}
                onChange={(v) => patch('resources', { ...settings.resources, auto: v })}
              />
              <SelectField
                label={m.processing.reserve}
                hint={ram ? m.processing.reserveHint(gbLabel(ram.total_mb), gbLabel(ram.available_mb)) : m.processing.reserveHintBasic}
                value={String(settings.resources.reserve_gb || 0)}
                options={reserveOptions}
                disabled={!settings.resources.auto}
                onChange={(e) => patch('resources', { ...settings.resources, reserve_gb: Number(e.target.value) })}
              />
            </div>
          )}
        </Card>

        <Card>
          <CardHeader size="sm" icon={headerIcon(Download)} title={m.ytdlp.title} />
          {!settings ? (
            <SettingsSkeleton rows={1} />
          ) : (
            <div className="mc-stack mc-gap-12">
              <ToggleSwitch
                label={m.ytdlp.autoUpdate}
                hint={m.ytdlp.autoUpdateHint}
                checked={settings.ytdlp.auto_update ?? true}
                onChange={(v) => patch('ytdlp', { ...settings.ytdlp, auto_update: v })}
              />
              <PathField
                label={m.ytdlp.cookies}
                hint={m.ytdlp.cookiesHint}
                value={settings.ytdlp.cookies_file}
                placeholder={m.ytdlp.notUsed}
                onPick={
                  desktop
                    ? async () => {
                        const f = await window.metis!.selectFile({ title: m.ytdlp.pickCookies, filters: [{ name: 'Cookies', extensions: ['txt'] }] })
                        if (f) patch('ytdlp', { ...settings.ytdlp, cookies_file: f })
                      }
                    : undefined
                }
              />
              {settings.ytdlp.cookies_file && (
                <div>
                  <button type="button" className="mc-link" onClick={() => patch('ytdlp', { ...settings.ytdlp, cookies_file: null })}>
                    {m.ytdlp.stopCookies}
                  </button>
                </div>
              )}
              <InputField
                label={m.ytdlp.playerClient}
                hint={m.ytdlp.playerClientHint}
                placeholder="default"
                value={settings.ytdlp.player_client === 'default' ? '' : settings.ytdlp.player_client}
                mono
                spellCheck={false}
                autoComplete="off"
                maxLength={80}
                onChange={(e) => patch('ytdlp', { ...settings.ytdlp, player_client: e.target.value.trim() || 'default' })}
              />
            </div>
          )}
        </Card>

        <Card>
          <CardHeader size="sm" icon={headerIcon(HardDrive)} title={m.storage.title} />
          {!settings ? (
            <SettingsSkeleton rows={3} />
          ) : (
            <div className="mc-stack mc-gap-20">
              <PathField
                label={m.storage.dataFolder}
                hint={m.storage.dataFolderHint}
                value={systemInfo?.data_root || null}
                onOpen={desktop ? () => openFolder(systemInfo?.data_root) : undefined}
              />
              <PathField
                label={m.storage.exportFolder}
                hint={m.storage.exportFolderHint}
                value={settings.export_dir}
                onPick={
                  desktop
                    ? async () => {
                        const dir = await pickFolder(m.storage.pickExport, settings.export_dir)
                        if (dir) patch('export_dir', dir)
                      }
                    : undefined
                }
                onOpen={desktop ? () => openFolder(settings.export_dir) : undefined}
              />
              <ToggleSwitch
                label={m.storage.postText}
                hint={m.storage.postTextHint}
                checked={settings.export?.post_text ?? true}
                onChange={(v) => patch('export', { ...settings.export, post_text: v })}
              />
              <div className="mc-grid">
                <InputField
                  containerClassName="mc-col-6"
                  type="number"
                  min={1}
                  max={500}
                  label={m.storage.cacheLimit}
                  hint={m.storage.cacheLimitHint}
                  value={settings.cache_limit_gb}
                  mono
                  onChange={(e) => patch('cache_limit_gb', Math.max(1, Number(e.target.value) || 1))}
                />
                <InputField
                  containerClassName="mc-col-6"
                  type="number"
                  min={0.25}
                  max={4}
                  step={0.25}
                  label={m.storage.mongoCache}
                  hint={m.storage.mongoCacheHint}
                  value={settings.db.wiredtiger_cache_gb}
                  mono
                  onChange={(e) => patch('db', { wiredtiger_cache_gb: Math.min(4, Math.max(0.25, Number(e.target.value) || 0.25)) })}
                />
              </div>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader size="sm" icon={headerIcon(AppWindow)} title={m.app.title} />
          {/* Both apply and save at once, outside the Save button below */}
          <div className="mc-stack mc-gap-20">
            <LanguageSwitch withLabel />
            {desktop && <TraySwitch />}
            {desktop && <AutoUpdateSwitch />}
          </div>
        </Card>

        {settings && (
          <div style={{ position: 'sticky', bottom: 16, zIndex: 5 }}>
            <Card padding="sm" className="mc-row mc-row--end mc-gap-16" style={{ boxShadow: 'var(--shadow-1)' }}>
              {dirty && (
                <span className="mc-label" role="status">
                  {m.unsaved}
                </span>
              )}
              <Button variant="primary" onClick={saveSettings} loading={saving} disabled={!dirty} icon={<Save size={16} aria-hidden="true" />}>
                {m.saveAll}
              </Button>
            </Card>
          </div>
        )}
      </div>
    </>
  )
}
