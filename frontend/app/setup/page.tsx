'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, FolderOpen, HardDrive, Info, KeyRound, Bot, ShieldCheck, Cpu, RefreshCw, Video, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { api, getEngineInfo, type SecretName, type SystemCheck } from '@/lib/engine'
import { errorMessage, formatBytes } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { GlassCard } from '@/components/ui/GlassCard'
import { Skeleton } from '@/components/ui/Skeleton'
import { Spinner } from '@/components/ui/Spinner'
import { Badge } from '@/components/ui/Badge'
import { SecretField } from '@/components/settings/SecretField'
import { LlmFields, DEFAULT_LLM_MODEL, type LlmValue } from '@/components/settings/LlmFields'
import { AgentForm, toAgentInput } from '@/components/agents/AgentForm'

const STEPS = [
  { id: 'welcome', label: 'Selamat datang', icon: Video },
  { id: 'data', label: 'Lokasi data', icon: HardDrive },
  { id: 'keys', label: 'API key', icon: KeyRound },
  { id: 'check', label: 'Cek sistem', icon: Cpu },
  { id: 'agent', label: 'Super Agent', icon: Bot },
] as const

type StepId = (typeof STEPS)[number]['id']

export default function SetupPage() {
  const router = useRouter()
  const [step, setStep] = useState<StepId>('welcome')
  const index = STEPS.findIndex((s) => s.id === step)
  const next = () => setStep(STEPS[Math.min(index + 1, STEPS.length - 1)].id)
  const back = () => setStep(STEPS[Math.max(index - 1, 0)].id)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-deep)', padding: '40px 20px', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: '820px', display: 'flex', flexDirection: 'column', gap: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              background: 'linear-gradient(135deg, var(--primary), var(--accent))',
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 15px var(--primary-glow)',
            }}
          >
            <Video size={18} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 800 }}>MetisClip</div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Pengaturan awal</div>
          </div>
        </div>

        <ol style={{ display: 'flex', gap: '8px', listStyle: 'none', flexWrap: 'wrap' }}>
          {STEPS.map((s, i) => {
            const Icon = s.icon
            const done = i < index
            const current = i === index
            return (
              <li
                key={s.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: current ? 700 : 500,
                  color: current ? 'var(--text-primary)' : done ? 'var(--accent)' : 'var(--text-muted)',
                  background: current ? 'var(--bg-glass-active)' : 'transparent',
                  border: `1px solid ${current ? 'var(--border-glass)' : 'transparent'}`,
                }}
              >
                {done ? <CheckCircle2 size={15} /> : <Icon size={15} />}
                {i + 1}. {s.label}
              </li>
            )
          })}
        </ol>

        <GlassCard glow hoverEffect={false} padding="32px">
          {step === 'welcome' && <WelcomeStep onNext={next} />}
          {step === 'data' && <DataStep onNext={next} onBack={back} />}
          {step === 'keys' && <KeysStep onNext={next} onBack={back} />}
          {step === 'check' && <CheckStep onNext={next} onBack={back} />}
          {step === 'agent' && <AgentStep onBack={back} onDone={() => router.replace('/dashboard/')} />}
        </GlassCard>
      </div>
    </div>
  )
}

function StepTitle({ title, subtitle }: { title: string; subtitle?: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '24px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '8px' }}>{title}</h1>
      {subtitle && <p style={{ color: 'var(--text-dim)', lineHeight: 1.6, fontSize: '14px' }}>{subtitle}</p>}
    </div>
  )
}

function StepActions({ onBack, children }: { onBack?: () => void; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginTop: '28px', paddingTop: '20px', borderTop: '1px solid var(--border-glass)', flexWrap: 'wrap' }}>
      <div>
        {onBack && (
          <Button variant="secondary" size="sm" onClick={onBack} icon={<ArrowLeft size={14} />}>
            Kembali
          </Button>
        )}
      </div>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>{children}</div>
    </div>
  )
}

function Notice({ tone, children }: { tone: 'info' | 'warning' | 'danger' | 'success'; children: React.ReactNode }) {
  const color = tone === 'danger' ? 'var(--danger)' : tone === 'warning' ? 'var(--warning)' : tone === 'success' ? 'var(--accent)' : 'var(--primary)'
  const Icon = tone === 'danger' ? XCircle : tone === 'warning' ? AlertTriangle : tone === 'success' ? CheckCircle2 : Info
  return (
    <div style={{ display: 'flex', gap: '10px', padding: '12px 14px', borderRadius: '10px', border: `1px solid ${color}`, background: 'rgba(255,255,255,0.02)', fontSize: '13px', lineHeight: 1.6 }}>
      <Icon size={16} color={color} style={{ flexShrink: 0, marginTop: '2px' }} />
      <div style={{ color: 'var(--text-primary)' }}>{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function WelcomeStep({ onNext }: { onNext: () => void }) {
  const [accepted, setAccepted] = useState(false)
  return (
    <>
      <StepTitle
        title="Selamat datang di MetisClip"
        subtitle="MetisClip mencari video panjang (podcast, interview) di YouTube, memilih momen yang berpotensi viral dengan AI, lalu memotongnya menjadi klip vertikal 9:16 dengan subtitle yang bisa diedit. Semua data dan video disimpan di komputer Anda sendiri."
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <Notice tone="warning">
          <strong>Hak cipta adalah tanggung jawab Anda.</strong> Video sumber di YouTube dimiliki kreatornya. Sebelum mengunggah klip, pastikan Anda punya izin dari pemilik
          konten atau penggunaan Anda termasuk penggunaan wajar (fair use) — misalnya dengan atribusi dan transformasi yang jelas — serta mematuhi Ketentuan Layanan YouTube dan
          platform tujuan. MetisClip tidak memberikan hak apa pun atas konten pihak ketiga.
        </Notice>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '14px', cursor: 'pointer', lineHeight: 1.5 }}>
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} style={{ marginTop: '3px', accentColor: 'var(--primary)' }} />
          Saya memahami dan bertanggung jawab atas konten yang saya klip dan unggah menggunakan MetisClip.
        </label>
      </div>
      <StepActions>
        <Button variant="primary" onClick={onNext} disabled={!accepted} icon={<ArrowRight size={16} />}>
          Mulai pengaturan
        </Button>
      </StepActions>
    </>
  )
}

// ---------------------------------------------------------------------------

function DataStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const desktop = typeof window !== 'undefined' && !!window.metis
  const [loading, setLoading] = useState(true)
  const [currentRoot, setCurrentRoot] = useState<string | null>(null)
  const [path, setPath] = useState('')
  const [check, setCheck] = useState<MetisDataRootCheck | null>(null)
  const [validating, setValidating] = useState(false)
  const [applying, setApplying] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const validate = useCallback(async (p: string) => {
    if (!window.metis || !p) return
    setValidating(true)
    try {
      setCheck(await window.metis.validateDataRoot(p))
    } catch (err) {
      setCheck(null)
      setError(errorMessage(err))
    } finally {
      setValidating(false)
    }
  }, [])

  useEffect(() => {
    if (!window.metis) {
      setLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const root = await window.metis!.getDataRoot()
        if (cancelled) return
        setCurrentRoot(root)
        if (!root) {
          const def = await window.metis!.getDefaultDataRoot()
          if (cancelled) return
          setPath(def)
          await validate(def)
        }
      } catch (err) {
        if (!cancelled) setError(errorMessage(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [validate])

  const choose = async () => {
    if (!window.metis) return
    const picked = await window.metis.selectFolder({ title: 'Pilih folder data MetisClip', defaultPath: path || undefined })
    if (picked) {
      setPath(picked)
      setError(null)
      await validate(picked)
    }
  }

  const apply = async () => {
    if (!window.metis || !check?.ok) return
    setApplying(true)
    setError(null)
    setStatus('Menyiapkan folder data…')
    const unsubscribe = window.metis.onEngineStatus((s) => {
      if (s.message) setStatus(s.message)
      else if (s.state === 'starting') setStatus('Menyalakan database & engine…')
    })
    try {
      const res = await window.metis.setDataRoot(check.path)
      if (!res.ok) {
        setError(res.error || 'Gagal memakai folder ini.')
        return
      }
      setStatus('Menghubungkan ke engine…')
      await getEngineInfo()
      await api.health()
      toast.success('Folder data siap dipakai')
      onNext()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      unsubscribe()
      setApplying(false)
      setStatus(null)
    }
  }

  const continueExisting = async () => {
    setApplying(true)
    setError(null)
    setStatus('Menghubungkan ke engine…')
    try {
      await getEngineInfo()
      await api.health()
      onNext()
    } catch (err) {
      setError(
        window.metis
          ? errorMessage(err)
          : `${errorMessage(err)}. Jalankan engine secara manual dan atur NEXT_PUBLIC_ENGINE_URL / NEXT_PUBLIC_ENGINE_TOKEN (lihat frontend/.env.example).`
      )
    } finally {
      setApplying(false)
      setStatus(null)
    }
  }

  if (loading) {
    return (
      <>
        <StepTitle title="Lokasi data" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Skeleton height={48} />
          <Skeleton height={80} />
        </div>
      </>
    )
  }

  if (!desktop) {
    return (
      <>
        <StepTitle title="Lokasi data" subtitle="Database, video sumber, dan klip disimpan di satu folder di komputer Anda." />
        <Notice tone="info">
          Pemilihan folder data hanya tersedia di aplikasi desktop MetisClip. Halaman ini sedang dibuka di browser biasa (mode pengembang): engine memakai folder dari
          variabel <code className="mc-mono">METISCLIP_DATA_ROOT</code> saat dijalankan manual.
        </Notice>
        {error && (
          <div style={{ marginTop: '14px' }}>
            <Notice tone="danger">{error}</Notice>
          </div>
        )}
        <StepActions onBack={onBack}>
          <Button variant="primary" onClick={continueExisting} loading={applying} icon={<ArrowRight size={16} />}>
            Lanjut (mode pengembang)
          </Button>
        </StepActions>
      </>
    )
  }

  if (currentRoot) {
    return (
      <>
        <StepTitle title="Lokasi data" subtitle="Folder data sudah diatur sebelumnya." />
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', borderRadius: '12px', border: '1px solid var(--border-glass)', background: 'rgba(255,255,255,0.02)' }}>
          <FolderOpen size={18} color="var(--accent)" />
          <span className="mc-mono" style={{ fontSize: '13px', wordBreak: 'break-all' }}>
            {currentRoot}
          </span>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '10px' }}>Memindahkan folder data dapat dilakukan nanti dari menu Sistem.</p>
        {status && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '14px', fontSize: '13px', color: 'var(--text-dim)' }}>
            <Spinner size="sm" /> {status}
          </div>
        )}
        {error && (
          <div style={{ marginTop: '14px' }}>
            <Notice tone="danger">{error}</Notice>
          </div>
        )}
        <StepActions onBack={onBack}>
          <Button variant="primary" onClick={continueExisting} loading={applying} icon={<ArrowRight size={16} />}>
            Lanjut
          </Button>
        </StepActions>
      </>
    )
  }

  return (
    <>
      <StepTitle
        title="Di mana MetisClip menyimpan data?"
        subtitle="Database, video sumber, cache, dan semua klip akan disimpan di folder ini. Pilih drive dengan ruang kosong yang cukup — satu video podcast bisa memakan beberapa GB."
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'stretch' }}>
          <div
            className="mc-mono"
            style={{
              flex: 1,
              padding: '12px 14px',
              borderRadius: '12px',
              border: '1px solid var(--border-glass)',
              background: 'rgba(0,0,0,0.25)',
              fontSize: '13px',
              wordBreak: 'break-all',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {path || '-'}
          </div>
          <Button variant="secondary" onClick={choose} disabled={applying} icon={<FolderOpen size={16} />}>
            Pilih folder…
          </Button>
        </div>

        {validating ? (
          <Skeleton height={60} />
        ) : (
          check && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-dim)' }}>
                Ruang kosong: <strong style={{ color: 'var(--text-primary)' }}>{formatBytes(check.freeBytes)}</strong> dari {formatBytes(check.totalBytes)}
              </div>
              {check.problems.map((p) => (
                <Notice key={p} tone="danger">
                  {p}
                </Notice>
              ))}
              {check.warnings.map((w) => (
                <Notice key={w} tone="warning">
                  {w}
                </Notice>
              ))}
              {check.existingData && <Notice tone="success">Folder ini sudah berisi data MetisClip — folder data yang sudah ada akan dipakai (tidak ada yang dihapus).</Notice>}
              {check.ok && !check.existingData && check.problems.length === 0 && <Notice tone="info">Folder akan dibuat (atau dipakai) dan diisi struktur data MetisClip.</Notice>}
            </div>
          )
        )}

        {status && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'var(--text-dim)' }}>
            <Spinner size="sm" /> {status}
          </div>
        )}
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
      <StepActions onBack={applying ? undefined : onBack}>
        <Button variant="primary" onClick={apply} loading={applying} disabled={!check?.ok || validating} icon={<ArrowRight size={16} />}>
          Gunakan folder ini
        </Button>
      </StepActions>
    </>
  )
}

// ---------------------------------------------------------------------------

const SECRET_INFO: { name: SecretName; label: string; description: React.ReactNode }[] = [
  {
    name: 'llm_api_key',
    label: 'API key LLM',
    description: 'Dipakai untuk menganalisis transkrip dan memilih momen viral (endpoint OpenAI-compatible di atas).',
  },
  {
    name: 'groq_api_key',
    label: 'API key Groq (Whisper)',
    description: 'Dipakai untuk transkripsi suara per kata (subtitle). Bisa dibuat gratis di console.groq.com.',
  },
  {
    name: 'youtube_api_key',
    label: 'API key YouTube Data v3',
    description: 'Dipakai untuk pencarian video berdasarkan keyword. Tidak wajib jika Anda hanya memakai link YouTube langsung.',
  },
]

function KeysStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [configured, setConfigured] = useState<Record<SecretName, boolean>>({ llm_api_key: false, groq_api_key: false, youtube_api_key: false })
  const [values, setValues] = useState<Record<SecretName, string>>({ llm_api_key: '', groq_api_key: '', youtube_api_key: '' })
  const [llm, setLlm] = useState<LlmValue>({ preset: '9router', base_url: '', model: DEFAULT_LLM_MODEL })
  const [savedLlm, setSavedLlm] = useState<string>('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [s, st] = await Promise.all([api.secrets.status(), api.settings.get()])
      setConfigured(s.secrets)
      setLlm(st.settings.llm)
      setSavedLlm(JSON.stringify(st.settings.llm))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const saveLlm = async () => {
    if (JSON.stringify(llm) === savedLlm) return
    const { settings } = await api.settings.update({ llm })
    setSavedLlm(JSON.stringify(settings.llm))
  }

  const saveAndNext = async () => {
    setSaving(true)
    try {
      await saveLlm()
      for (const { name } of SECRET_INFO) {
        const v = values[name].trim()
        if (v) await api.secrets.set(name, v)
      }
      onNext()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <>
        <StepTitle title="API key" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Skeleton height={70} />
          <Skeleton height={70} />
          <Skeleton height={70} />
        </div>
      </>
    )
  }

  if (error) {
    return (
      <>
        <StepTitle title="API key" />
        <Notice tone="danger">{error}</Notice>
        <StepActions onBack={onBack}>
          <Button variant="secondary" onClick={load} icon={<RefreshCw size={16} />}>
            Coba lagi
          </Button>
        </StepActions>
      </>
    )
  }

  return (
    <>
      <StepTitle
        title="Hubungkan layanan AI"
        subtitle="API key disimpan aman di Windows Credential Manager, bukan di file biasa, dan tidak pernah ditampilkan kembali. Anda bisa melewati langkah ini dan mengisinya nanti di Pengaturan."
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <LlmFields value={llm} onChange={setLlm} />
        {SECRET_INFO.map((s) => (
          <SecretField
            key={s.name}
            name={s.name}
            label={s.label}
            description={s.description}
            configured={configured[s.name]}
            value={values[s.name]}
            onChange={(v) => setValues((prev) => ({ ...prev, [s.name]: v }))}
            onConfiguredChange={(c) => setConfigured((prev) => ({ ...prev, [s.name]: c }))}
            beforeTest={s.name === 'llm_api_key' ? saveLlm : undefined}
            allowRemove={false}
          />
        ))}
      </div>
      <StepActions onBack={onBack}>
        <Button variant="secondary" onClick={onNext} disabled={saving}>
          Lewati untuk sekarang
        </Button>
        <Button variant="primary" onClick={saveAndNext} loading={saving} icon={<ArrowRight size={16} />}>
          Simpan & lanjut
        </Button>
      </StepActions>
    </>
  )
}

// ---------------------------------------------------------------------------

function CheckStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [check, setCheck] = useState<SystemCheck | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setCheck(await api.system.check())
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    run()
  }, [run])

  const failed = check?.items.filter((i) => !i.ok).length || 0

  return (
    <>
      <StepTitle title="Pemeriksaan sistem" subtitle="Memastikan semua komponen (database, FFmpeg, yt-dlp, renderer) siap dipakai di komputer ini." />
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height={44} />
          ))}
        </div>
      ) : error ? (
        <Notice tone="danger">{error}</Notice>
      ) : (
        check && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {check.items.map((item) => (
              <div
                key={item.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-glass)',
                  background: 'rgba(255,255,255,0.02)',
                }}
              >
                {item.ok ? <CheckCircle2 size={18} color="var(--accent)" /> : <XCircle size={18} color="var(--danger)" />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600 }}>{item.label}</div>
                  {item.detail && <div style={{ fontSize: '12px', color: 'var(--text-muted)', wordBreak: 'break-word' }}>{item.detail}</div>}
                </div>
                {item.version && (
                  <span className="mc-mono" style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                    {item.version}
                  </span>
                )}
              </div>
            ))}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px', fontSize: '12px', color: 'var(--text-dim)' }}>
              <Badge variant="muted" glow={false}>
                {check.cpu_count} core CPU
              </Badge>
              <Badge variant="muted" glow={false}>
                RAM {check.ram_gb.toLocaleString('id-ID', { maximumFractionDigits: 1 })} GB
              </Badge>
              <Badge variant="muted" glow={false}>
                Encoder: {check.encoders.length ? check.encoders.join(', ') : 'libx264'}
              </Badge>
            </div>
            {failed > 0 && <Notice tone="warning">{failed} komponen bermasalah. Anda tetap bisa melanjutkan, tetapi sebagian fitur mungkin gagal sampai masalahnya diperbaiki.</Notice>}
          </div>
        )
      )}
      <StepActions onBack={onBack}>
        <Button variant="secondary" onClick={run} loading={loading} icon={<RefreshCw size={16} />}>
          Periksa ulang
        </Button>
        <Button variant="primary" onClick={onNext} disabled={loading} icon={<ArrowRight size={16} />}>
          Lanjut
        </Button>
      </StepActions>
    </>
  )
}

// ---------------------------------------------------------------------------

function AgentStep({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const [existing, setExisting] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    api.agents
      .list()
      .then(({ agents }) => {
        setExisting(agents.length)
        setShowForm(agents.length === 0)
      })
      .catch((err) => setError(errorMessage(err)))
  }, [])

  const create = async (value: Parameters<typeof toAgentInput>[0]) => {
    try {
      const { agent } = await api.agents.create(toAgentInput(value))
      try {
        window.localStorage.setItem('activeAgentId', agent.id)
      } catch {
        /* not remembered */
      }
      toast.success(`Super Agent "${agent.name}" dibuat`)
      onDone()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <>
      <StepTitle
        title="Buat Super Agent pertama"
        subtitle="Super Agent adalah profil kerja untuk satu niche/channel: keyword default, durasi klip, dan brand template sendiri. Anda bisa membuat lebih dari satu nanti."
      />
      {error ? (
        <Notice tone="danger">{error}</Notice>
      ) : existing === null ? (
        <Skeleton height={160} />
      ) : (
        <>
          {existing > 0 && (
            <div style={{ marginBottom: '18px' }}>
              <Notice tone="success">Anda sudah punya {existing} Super Agent di folder data ini.</Notice>
            </div>
          )}
          {showForm ? (
            <AgentForm submitLabel="Buat & mulai" onSubmit={create} onCancel={existing > 0 ? () => setShowForm(false) : undefined} />
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setShowForm(true)} icon={<Bot size={14} />}>
              Buat Super Agent baru
            </Button>
          )}
        </>
      )}
      <StepActions onBack={onBack}>
        {existing !== null && existing > 0 && (
          <Button variant="primary" onClick={onDone} icon={<ShieldCheck size={16} />}>
            Masuk ke Beranda
          </Button>
        )}
      </StepActions>
    </>
  )
}
