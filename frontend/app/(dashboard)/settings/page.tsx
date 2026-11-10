'use client'

import React, { useCallback, useEffect, useId, useState } from 'react'
import { AppWindow, Cpu, Download, FolderOpen, HardDrive, KeyRound, Mic, Save, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import { Alert, Button, Card, CardHeader, Field, IconButton, InputField, PageHeader, SelectField, Skeleton, ToggleSwitch } from '@/components/ui'
import { SecretField } from '@/components/settings/SecretField'
import { LlmSection } from '@/components/settings/LlmFields'
import { AgentForm, toAgentInput, type AgentFormValue } from '@/components/agents/AgentForm'
import { useAgent } from '@/contexts/AgentContext'
import { useEngine } from '@/contexts/EngineContext'
import { api, type EncoderSetting, type SecretName, type Settings } from '@/lib/engine'
import { errorMessage } from '@/lib/format'
import { isDesktop } from '@/lib/media'

const ENCODER_LABELS: Record<EncoderSetting, string> = {
  auto: 'Otomatis (pilih yang tercepat)',
  libx264: 'CPU (libx264)',
  h264_nvenc: 'NVIDIA (NVENC)',
  h264_qsv: 'Intel Quick Sync',
  h264_amf: 'AMD (AMF)',
}

const SECRETS: { name: SecretName; label: string; description: string }[] = [
  { name: 'groq_api_key', label: 'API key Groq (Whisper)', description: 'Untuk subtitle per kata dan transkrip video yang di-upload.' },
]

/** A folder or file path shown read-only, with "Ubah…" and "Buka di Explorer" next to it. */
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
            Ubah…
          </Button>
        )}
        {onOpen && <IconButton variant="outline" label="Buka di Explorer" icon={<FolderOpen size={16} />} onClick={onOpen} disabled={!value} />}
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

export default function SettingsPage() {
  const { activeAgent, refreshAgents } = useAgent()
  const { epoch, systemInfo, refreshSystemInfo } = useEngine()
  const desktop = isDesktop()

  const [settings, setSettings] = useState<Settings | null>(null)
  const [savedSettings, setSavedSettings] = useState('')
  const [encoders, setEncoders] = useState<string[]>([])
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
      setLoadError(errorMessage(err, 'Gagal memuat pengaturan'))
    }
    api.system
      .check()
      .then((c) => setEncoders(c.encoders))
      .catch(() => setEncoders([]))
  }, [])

  useEffect(() => {
    load()
  }, [load, epoch])

  const dirty = settings ? JSON.stringify(settings) !== savedSettings : false

  const patch = <K extends keyof Settings>(key: K, value: Settings[K]) => setSettings((s) => (s ? { ...s, [key]: value } : s))

  const saveSettings = async () => {
    if (!settings) return
    setSaving(true)
    try {
      const { settings: next } = await api.settings.update(settings)
      setSettings(next)
      setSavedSettings(JSON.stringify(next))
      refreshSystemInfo()
      toast.success('Pengaturan disimpan')
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal menyimpan pengaturan'))
    } finally {
      setSaving(false)
    }
  }

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

  const saveAgent = async (value: AgentFormValue) => {
    if (!activeAgent) return
    try {
      await api.agents.update(activeAgent.id, toAgentInput(value))
      await refreshAgents()
      toast.success('Pengaturan agent disimpan')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const pickFolder = async (title: string, current: string | undefined) => (window.metis ? window.metis.selectFolder({ title, defaultPath: current }) : null)

  const openFolder = async (path: string | undefined | null) => {
    if (!window.metis || !path) return
    const res = await window.metis.openPath(path)
    if (!res.ok) toast.error(res.error || 'Folder tidak dapat dibuka')
  }

  const encoderOptions = (['auto', 'libx264', 'h264_nvenc', 'h264_qsv', 'h264_amf'] as EncoderSetting[])
    .filter((e) => e === 'auto' || e === 'libx264' || encoders.includes(e) || settings?.processing.encoder === e)
    .map((e) => ({ value: e, label: ENCODER_LABELS[e] }))

  return (
    <>
      <PageHeader title="Pengaturan" subtitle="Preferensi agent, API key, pemrosesan video, dan penyimpanan lokal." />

      <div className="mc-stack mc-gap-20" style={{ maxWidth: 760 }}>
        <Card>
          <CardHeader
            size="sm"
            icon={headerIcon(Users)}
            title={activeAgent ? `Super Agent: ${activeAgent.name}` : 'Super Agent'}
            subtitle="Nilai default untuk job baru dari agent ini."
          />
          {activeAgent ? (
            <AgentForm
              key={activeAgent.id}
              submitLabel="Simpan agent"
              initial={{
                name: activeAgent.name,
                niche: activeAgent.niche || '',
                default_duration: activeAgent.default_duration || '45-60',
                default_brand_template_id: activeAgent.default_brand_template_id || '',
              }}
              onSubmit={saveAgent}
            />
          ) : (
            <p className="mc-muted">Pilih atau buat Super Agent lewat pemilih agent di kanan atas.</p>
          )}
        </Card>

        {loadError && (
          <Alert
            tone="error"
            title="Pengaturan tidak dapat dimuat"
            action={
              <Button variant="secondary" size="sm" onClick={load}>
                Coba lagi
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
            title="Model AI (LLM)"
            subtitle="API key disimpan di Windows Credential Manager. Klik ikon mata untuk melihat key yang tersimpan."
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

        <Card>
          <CardHeader size="sm" icon={headerIcon(Mic)} title="Transkripsi (Whisper)" />
          {!settings || !secrets ? (
            <SettingsSkeleton />
          ) : (
            <div className="mc-stack mc-gap-20">
              {SECRETS.map((s) => (
                <SecretField
                  key={s.name}
                  name={s.name}
                  label={s.label}
                  description={s.description}
                  configured={secrets[s.name]}
                  value={secretValues[s.name] || ''}
                  onChange={(v) => setSecretValues((prev) => ({ ...prev, [s.name]: v }))}
                  onConfiguredChange={(c) => setSecrets((prev) => (prev ? { ...prev, [s.name]: c } : prev))}
                />
              ))}
              <InputField
                label="Model Whisper (Groq)"
                value={settings.whisper.model}
                onChange={(e) => patch('whisper', { ...settings.whisper, model: e.target.value })}
                placeholder="whisper-large-v3-turbo"
                spellCheck={false}
                mono
              />
            </div>
          )}
        </Card>

        <Card>
          <CardHeader size="sm" icon={headerIcon(Cpu)} title="Pemrosesan video" subtitle="Atur seberapa banyak sumber daya komputer yang dipakai." />
          {!settings ? (
            <SettingsSkeleton rows={3} />
          ) : (
            <div className="mc-stack mc-gap-20">
              <div className="mc-grid">
                <InputField
                  containerClassName="mc-col-6"
                  type="number"
                  min={1}
                  max={16}
                  label="Worker pemrosesan paralel"
                  hint="Jumlah clip yang dipotong bersamaan. Naikkan jika CPU kuat."
                  value={settings.processing.max_workers}
                  mono
                  onChange={(e) => patch('processing', { ...settings.processing, max_workers: Math.max(1, parseInt(e.target.value) || 1) })}
                />
                <InputField
                  containerClassName="mc-col-6"
                  type="number"
                  min={1}
                  max={4}
                  label="Render paralel"
                  hint="Jumlah render subtitle (Remotion) yang berjalan bersamaan."
                  value={settings.render.concurrency}
                  mono
                  onChange={(e) => patch('render', { concurrency: Math.max(1, parseInt(e.target.value) || 1) })}
                />
              </div>
              <SelectField
                label="Encoder video"
                hint={encoders.length ? `Terdeteksi: ${encoders.join(', ')}` : 'Encoder hardware dipakai jika tersedia.'}
                value={settings.processing.encoder}
                options={encoderOptions}
                onChange={(e) => patch('processing', { ...settings.processing, encoder: e.target.value as EncoderSetting })}
              />
            </div>
          )}
        </Card>

        <Card>
          <CardHeader size="sm" icon={headerIcon(Download)} title="Unduhan YouTube (yt-dlp)" />
          {!settings ? (
            <SettingsSkeleton rows={1} />
          ) : (
            <div className="mc-stack mc-gap-12">
              <PathField
                label="File cookies YouTube (opsional)"
                hint="Dipakai yt-dlp jika YouTube meminta verifikasi. Format cookies.txt (Netscape)."
                value={settings.ytdlp.cookies_file}
                placeholder="Tidak dipakai"
                onPick={
                  desktop
                    ? async () => {
                        const f = await window.metis!.selectFile({ title: 'Pilih file cookies.txt', filters: [{ name: 'Cookies', extensions: ['txt'] }] })
                        if (f) patch('ytdlp', { ...settings.ytdlp, cookies_file: f })
                      }
                    : undefined
                }
              />
              {settings.ytdlp.cookies_file && (
                <div>
                  <button type="button" className="mc-link" onClick={() => patch('ytdlp', { ...settings.ytdlp, cookies_file: null })}>
                    Jangan pakai file cookies
                  </button>
                </div>
              )}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader size="sm" icon={headerIcon(HardDrive)} title="Penyimpanan lokal" />
          {!settings ? (
            <SettingsSkeleton rows={3} />
          ) : (
            <div className="mc-stack mc-gap-20">
              <PathField
                label="Folder data"
                hint="Database, video sumber, cache, dan clip. Pindahkan lewat menu Sistem."
                value={systemInfo?.data_root || null}
                onOpen={desktop ? () => openFolder(systemInfo?.data_root) : undefined}
              />
              <PathField
                label="Folder ekspor"
                hint="Tujuan default saat mengekspor clip."
                value={settings.export_dir}
                onPick={
                  desktop
                    ? async () => {
                        const dir = await pickFolder('Pilih folder ekspor', settings.export_dir)
                        if (dir) patch('export_dir', dir)
                      }
                    : undefined
                }
                onOpen={desktop ? () => openFolder(settings.export_dir) : undefined}
              />
              <div className="mc-grid">
                <InputField
                  containerClassName="mc-col-6"
                  type="number"
                  min={1}
                  max={500}
                  label="Batas cache (GB)"
                  hint="Video sumber sementara dihapus otomatis jika melebihi batas ini."
                  value={settings.cache_limit_gb}
                  mono
                  onChange={(e) => patch('cache_limit_gb', Math.max(1, Number(e.target.value) || 1))}
                />
                <InputField
                  containerClassName="mc-col-6"
                  type="number"
                  min={0.25}
                  max={8}
                  step={0.25}
                  label="Cache MongoDB (GB)"
                  hint="Memori untuk database. Berlaku setelah aplikasi dimulai ulang."
                  value={settings.db.wiredtiger_cache_gb}
                  mono
                  onChange={(e) => patch('db', { wiredtiger_cache_gb: Math.max(0.25, Number(e.target.value) || 0.25) })}
                />
              </div>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader size="sm" icon={headerIcon(AppWindow)} title="Aplikasi" />
          {!settings ? (
            <SettingsSkeleton />
          ) : (
            <div className="mc-stack mc-gap-20">
              <ToggleSwitch
                label="Tetap berjalan di tray saat ditutup"
                hint="Job yang berjalan tidak terhenti ketika jendela ditutup."
                checked={settings.app.close_to_tray}
                onChange={(v) => patch('app', { ...settings.app, close_to_tray: v })}
              />
              <ToggleSwitch label="Pembaruan otomatis" checked={settings.app.auto_update} onChange={(v) => patch('app', { ...settings.app, auto_update: v })} />
            </div>
          )}
        </Card>

        {settings && (
          <div style={{ position: 'sticky', bottom: 16, zIndex: 5 }}>
            <Card padding="sm" className="mc-row mc-row--end mc-gap-16" style={{ boxShadow: 'var(--shadow-1)' }}>
              {dirty && (
                <span className="mc-label" role="status">
                  Ada perubahan yang belum disimpan
                </span>
              )}
              <Button variant="primary" onClick={saveSettings} loading={saving} disabled={!dirty} icon={<Save size={16} aria-hidden="true" />}>
                Simpan pengaturan
              </Button>
            </Card>
          </div>
        )}
      </div>
    </>
  )
}
