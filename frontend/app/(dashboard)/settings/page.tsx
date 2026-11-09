'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { Bot, KeyRound, Cpu, HardDrive, FolderOpen, Save, AppWindow } from 'lucide-react'
import toast from 'react-hot-toast'
import { GlassCard } from '@/components/ui/GlassCard'
import { Button } from '@/components/ui/Button'
import { InputField } from '@/components/ui/InputField'
import { SelectField } from '@/components/ui/SelectField'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { Skeleton } from '@/components/ui/Skeleton'
import { PageHeader } from '@/components/ui/PageHeader'
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

function Card({ icon: Icon, color, title, subtitle, children }: { icon: React.ElementType; color: string; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <GlassCard glow hoverEffect={false} padding="28px">
      <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: subtitle ? '6px' : '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Icon size={20} color={color} /> {title}
      </h3>
      {subtitle && <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: 1.5 }}>{subtitle}</p>}
      {children}
    </GlassCard>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px', padding: '12px 0', borderBottom: '1px solid var(--border-glass)' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '14px', fontWeight: 600 }}>{label}</div>
        {hint && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.5 }}>{hint}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  )
}

function PathRow({ label, hint, value, onPick, onOpen, placeholder }: { label: string; hint?: string; value: string | null; onPick?: () => void; onOpen?: () => void; placeholder?: string }) {
  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border-glass)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div>
        <div style={{ fontSize: '14px', fontWeight: 600 }}>{label}</div>
        {hint && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{hint}</div>}
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <div className="mc-mono" style={{ flex: 1, fontSize: '12px', padding: '10px 12px', borderRadius: '8px', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--border-glass)', wordBreak: 'break-all', color: value ? 'var(--text-primary)' : 'var(--text-muted)' }}>
          {value || placeholder || '-'}
        </div>
        {onPick && (
          <Button type="button" variant="secondary" size="sm" onClick={onPick}>
            Ubah…
          </Button>
        )}
        {onOpen && (
          <button type="button" className="mc-icon-button" onClick={onOpen} title="Buka di Explorer">
            <FolderOpen size={15} />
          </button>
        )}
      </div>
    </div>
  )
}

const numberStyle: React.CSSProperties = { width: '110px' }

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
    <div style={{ maxWidth: '860px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '26px' }}>
      <PageHeader title="Pengaturan" subtitle="Preferensi agent, API key, pemrosesan video, dan penyimpanan lokal." />

      {/* Agent defaults */}
      <Card icon={Bot} color="var(--primary)" title={activeAgent ? `Super Agent: ${activeAgent.name}` : 'Super Agent'} subtitle="Nilai default untuk job baru dari agent ini.">
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
          <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Pilih atau buat Super Agent di menu samping.</p>
        )}
      </Card>

      {loadError && (
        <GlassCard hoverEffect={false} padding="16px 20px" style={{ border: '1px solid var(--danger)', display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span style={{ flex: 1 }}>{loadError}</span>
          <button className="mc-link-button" onClick={load}>
            Coba lagi
          </button>
        </GlassCard>
      )}

      {/* AI keys */}
      <Card icon={KeyRound} color="var(--warning)" title="Layanan AI & API key" subtitle="API key disimpan di Windows Credential Manager dan tidak pernah ditampilkan kembali.">
        {!settings || !secrets ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <Skeleton height={64} />
            <Skeleton height={64} />
            <Skeleton height={64} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
            <LlmSection
              value={settings.llm}
              onChange={(llm) => patch('llm', llm)}
              secrets={secrets}
              onSecretConfigured={(name, c) => setSecrets((prev) => (prev ? { ...prev, [name]: c } : prev))}
              persist={saveLlmOnly}
            />
            <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '18px', fontSize: '14px', fontWeight: 700 }}>Transkripsi</div>
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
            />
          </div>
        )}
      </Card>

      {/* Processing */}
      <Card icon={Cpu} color="var(--accent)" title="Pemrosesan video" subtitle="Atur seberapa banyak sumber daya komputer yang dipakai.">
        {!settings ? (
          <Skeleton height={160} />
        ) : (
          <div>
            <Row label="Worker pemrosesan paralel" hint="Jumlah clip yang dipotong bersamaan. Naikkan jika CPU kuat.">
              <InputField type="number" min={1} max={16} value={settings.processing.max_workers} style={numberStyle} onChange={(e) => patch('processing', { ...settings.processing, max_workers: Math.max(1, parseInt(e.target.value) || 1) })} />
            </Row>
            <Row label="Encoder video" hint={encoders.length ? `Terdeteksi: ${encoders.join(', ')}` : 'Encoder hardware dipakai jika tersedia.'}>
              <SelectField value={settings.processing.encoder} options={encoderOptions} onChange={(e) => patch('processing', { ...settings.processing, encoder: e.target.value as EncoderSetting })} containerStyle={{ width: '240px' }} />
            </Row>
            <Row label="Render paralel" hint="Jumlah render subtitle (Remotion) yang berjalan bersamaan.">
              <InputField type="number" min={1} max={4} value={settings.render.concurrency} style={numberStyle} onChange={(e) => patch('render', { concurrency: Math.max(1, parseInt(e.target.value) || 1) })} />
            </Row>
            <PathRow
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
              <div style={{ paddingTop: '8px' }}>
                <button type="button" className="mc-link-button" style={{ color: 'var(--danger)' }} onClick={() => patch('ytdlp', { ...settings.ytdlp, cookies_file: null })}>
                  Jangan pakai file cookies
                </button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Storage */}
      <Card icon={HardDrive} color="var(--primary)" title="Penyimpanan lokal">
        {!settings ? (
          <Skeleton height={200} />
        ) : (
          <div>
            <PathRow label="Folder data" hint="Database, video sumber, cache, dan clip. Pindahkan lewat menu Sistem." value={systemInfo?.data_root || null} onOpen={desktop ? () => openFolder(systemInfo?.data_root) : undefined} />
            <PathRow
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
            <Row label="Batas cache (GB)" hint="Video sumber sementara dihapus otomatis jika melebihi batas ini.">
              <InputField type="number" min={1} max={500} value={settings.cache_limit_gb} style={numberStyle} onChange={(e) => patch('cache_limit_gb', Math.max(1, Number(e.target.value) || 1))} />
            </Row>
            <Row label="Cache MongoDB (GB)" hint="Memori untuk database. Berlaku setelah aplikasi dimulai ulang.">
              <InputField
                type="number"
                min={0.25}
                max={8}
                step={0.25}
                value={settings.db.wiredtiger_cache_gb}
                style={numberStyle}
                onChange={(e) => patch('db', { wiredtiger_cache_gb: Math.max(0.25, Number(e.target.value) || 0.25) })}
              />
            </Row>
          </div>
        )}
      </Card>

      {/* App */}
      <Card icon={AppWindow} color="var(--text-dim)" title="Aplikasi">
        {!settings ? (
          <Skeleton height={120} />
        ) : (
          <div>
            <Row label="Tetap berjalan di tray saat ditutup" hint="Job yang berjalan tidak terhenti ketika jendela ditutup.">
              <ToggleSwitch checked={settings.app.close_to_tray} onChange={(v) => patch('app', { ...settings.app, close_to_tray: v })} />
            </Row>
            <Row label="Pembaruan otomatis">
              <ToggleSwitch checked={settings.app.auto_update} onChange={(v) => patch('app', { ...settings.app, auto_update: v })} />
            </Row>
          </div>
        )}
      </Card>

      {settings && (
        <div
          style={{
            position: 'sticky',
            bottom: '0',
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: '14px',
            padding: '14px 0',
            background: 'linear-gradient(to top, var(--bg-deep) 70%, transparent)',
          }}
        >
          {dirty && <span style={{ fontSize: '13px', color: 'var(--warning)' }}>Ada perubahan yang belum disimpan</span>}
          <Button variant="primary" onClick={saveSettings} loading={saving} disabled={!dirty} icon={<Save size={16} />}>
            Simpan pengaturan
          </Button>
        </div>
      )}
    </div>
  )
}
