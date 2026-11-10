'use client'

import React, { useCallback, useEffect, useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ArrowLeft, ArrowRight, Check, FolderOpen, Plus, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { api, getEngineInfo, type SecretName, type SystemCheck } from '@/lib/engine'
import { errorMessage, formatBytes } from '@/lib/format'
import { Alert, Badge, Blob, Button, Card, Divider, Field, InputField, Logo, Skeleton, Spinner, WizardSteps } from '@/components/ui'
import { SecretField } from '@/components/settings/SecretField'
import { LlmSection, type LlmValue } from '@/components/settings/LlmFields'
import { AgentForm, toAgentInput } from '@/components/agents/AgentForm'

const STEPS = [
  { id: 'welcome', label: 'Selamat datang' },
  { id: 'data', label: 'Lokasi data' },
  { id: 'keys', label: 'API key' },
  { id: 'check', label: 'Cek sistem' },
  { id: 'agent', label: 'Super Agent' },
] as const

type StepId = (typeof STEPS)[number]['id']

export default function SetupPage() {
  const router = useRouter()
  const [step, setStep] = useState<StepId>('welcome')
  const index = STEPS.findIndex((s) => s.id === step)
  const next = () => setStep(STEPS[Math.min(index + 1, STEPS.length - 1)].id)
  const back = () => setStep(STEPS[Math.max(index - 1, 0)].id)

  return (
    <main style={{ minHeight: '100vh', padding: '48px 16px', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
      <Card padding="lg" style={{ width: '100%', maxWidth: 720, borderRadius: 'var(--r-xl)' }}>
        <div className="mc-stack mc-gap-32">
          <WizardSteps steps={STEPS.map((s) => s.label)} current={index} />
          <div className="mc-stack mc-gap-24">
            {step === 'welcome' && <WelcomeStep onNext={next} />}
            {step === 'data' && <DataStep onNext={next} onBack={back} />}
            {step === 'keys' && <KeysStep onNext={next} onBack={back} />}
            {step === 'check' && <CheckStep onNext={next} onBack={back} />}
            {step === 'agent' && <AgentStep onBack={back} onDone={() => router.replace('/dashboard/')} />}
          </div>
        </div>
      </Card>
    </main>
  )
}

function StepTitle({ title, subtitle }: { title: string; subtitle?: React.ReactNode }) {
  return (
    <div className="mc-stack mc-gap-8">
      <h1 className="mc-h1">{title}</h1>
      {subtitle && <p className="mc-body-lg mc-muted">{subtitle}</p>}
    </div>
  )
}

function StepActions({ onBack, children }: { onBack?: () => void; children: React.ReactNode }) {
  return (
    <div className="mc-stack mc-gap-20">
      <Divider />
      <div className="mc-row mc-row--between mc-row--wrap">
        <div>
          {onBack && (
            <Button variant="ghost" size="lg" onClick={onBack} icon={<ArrowLeft size={16} aria-hidden="true" />}>
              Kembali
            </Button>
          )}
        </div>
        <div className="mc-row mc-row--wrap">{children}</div>
      </div>
    </div>
  )
}

function StatusLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="mc-row mc-gap-8 mc-muted" role="status">
      <Spinner size="sm" />
      {children}
    </div>
  )
}

function HealthBadge({ ok }: { ok: boolean }) {
  return ok ? (
    <Badge tone="success" size="sm" icon={<Check size={14} aria-hidden="true" />}>
      Siap
    </Badge>
  ) : (
    <Badge tone="error" size="sm" icon={<AlertTriangle size={14} aria-hidden="true" />}>
      Bermasalah
    </Badge>
  )
}

// ---------------------------------------------------------------------------

function WelcomeStep({ onNext }: { onNext: () => void }) {
  const [accepted, setAccepted] = useState(false)
  return (
    <>
      <Card tone="dew" style={{ minHeight: 220, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 24 }}>
        <Blob />
        <div className="mc-card__body">
          <Logo />
        </div>
        <div className="mc-card__body mc-stack mc-gap-4" style={{ maxWidth: '60%' }}>
          <span className="mc-label mc-moss">Pengaturan awal</span>
          <h1 className="mc-h1">Selamat datang di MetisClip</h1>
        </div>
      </Card>
      <p className="mc-body-lg mc-muted">
        MetisClip mencari video panjang (podcast, interview) di YouTube, memilih momen yang berpotensi viral dengan AI, lalu memotongnya menjadi klip vertikal 9:16 dengan
        subtitle yang bisa diedit. Semua data dan video disimpan di komputer Anda sendiri.
      </p>
      <Alert tone="warning" title="Hak cipta adalah tanggung jawab Anda">
        Video sumber di YouTube dimiliki kreatornya. Sebelum mengunggah klip, pastikan Anda punya izin dari pemilik konten atau penggunaan Anda termasuk penggunaan wajar (fair
        use) — misalnya dengan atribusi dan transformasi yang jelas — serta mematuhi Ketentuan Layanan YouTube dan platform tujuan. MetisClip tidak memberikan hak apa pun atas
        konten pihak ketiga.
      </Alert>
      <label className="mc-row mc-row--top mc-gap-12" style={{ cursor: 'pointer' }}>
        <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} style={{ marginTop: 1 }} />
        <span>Saya memahami dan bertanggung jawab atas konten yang saya klip dan unggah menggunakan MetisClip.</span>
      </label>
      <StepActions>
        <Button variant="primary" size="lg" onClick={onNext} disabled={!accepted} iconRight={<ArrowRight size={16} aria-hidden="true" />}>
          Mulai pengaturan
        </Button>
      </StepActions>
    </>
  )
}

// ---------------------------------------------------------------------------

function DataStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const desktop = typeof window !== 'undefined' && !!window.metis
  const pathId = useId()
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
        <div className="mc-stack mc-gap-12">
          <Skeleton height={44} radius="full" />
          <Skeleton height={80} radius="md" />
        </div>
      </>
    )
  }

  if (!desktop) {
    return (
      <>
        <StepTitle title="Lokasi data" subtitle="Database, video sumber, dan klip disimpan di satu folder di komputer Anda." />
        <Alert tone="info">
          Pemilihan folder data hanya tersedia di aplikasi desktop MetisClip. Halaman ini sedang dibuka di browser biasa (mode pengembang): engine memakai folder dari variabel{' '}
          <code className="mc-mono">METISCLIP_DATA_ROOT</code> saat dijalankan manual.
        </Alert>
        {error && <Alert tone="error">{error}</Alert>}
        <StepActions onBack={onBack}>
          <Button variant="primary" size="lg" onClick={continueExisting} loading={applying} iconRight={<ArrowRight size={16} aria-hidden="true" />}>
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
        <InputField
          label="Folder data"
          hint="Memindahkan folder data dapat dilakukan nanti dari menu Sistem."
          readOnly
          mono
          value={currentRoot}
          icon={<FolderOpen size={18} aria-hidden="true" />}
        />
        {status && <StatusLine>{status}</StatusLine>}
        {error && <Alert tone="error">{error}</Alert>}
        <StepActions onBack={onBack}>
          <Button variant="primary" size="lg" onClick={continueExisting} loading={applying} iconRight={<ArrowRight size={16} aria-hidden="true" />}>
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
      <Field label="Folder data" htmlFor={pathId}>
        <div className="mc-row mc-gap-8">
          <InputField id={pathId} readOnly mono value={path} placeholder="-" containerClassName="mc-grow" />
          <Button variant="secondary" onClick={choose} disabled={applying} icon={<FolderOpen size={16} aria-hidden="true" />}>
            Pilih folder…
          </Button>
        </div>
      </Field>

      {validating ? (
        <Skeleton height={60} radius="md" />
      ) : (
        check && (
          <div className="mc-stack mc-gap-12">
            <p>
              <span className="mc-muted">Ruang kosong: </span>
              <span className="mc-label">{formatBytes(check.freeBytes)}</span>
              <span className="mc-muted"> dari {formatBytes(check.totalBytes)}</span>
            </p>
            {check.problems.map((p) => (
              <Alert key={p} tone="error">
                {p}
              </Alert>
            ))}
            {check.warnings.map((w) => (
              <Alert key={w} tone="warning">
                {w}
              </Alert>
            ))}
            {check.existingData && <Alert tone="success">Folder ini sudah berisi data MetisClip — folder data yang sudah ada akan dipakai (tidak ada yang dihapus).</Alert>}
            {check.ok && !check.existingData && check.problems.length === 0 && <Alert tone="info">Folder akan dibuat (atau dipakai) dan diisi struktur data MetisClip.</Alert>}
          </div>
        )
      )}

      {status && <StatusLine>{status}</StatusLine>}
      {error && <Alert tone="error">{error}</Alert>}
      <StepActions onBack={applying ? undefined : onBack}>
        <Button variant="primary" size="lg" onClick={apply} loading={applying} disabled={!check?.ok || validating} iconRight={<ArrowRight size={16} aria-hidden="true" />}>
          Gunakan folder ini
        </Button>
      </StepActions>
    </>
  )
}

// ---------------------------------------------------------------------------

const SECRET_INFO: { name: SecretName; label: string; description: React.ReactNode }[] = [
  {
    name: 'groq_api_key',
    label: 'API key Groq (Whisper)',
    description: 'Dipakai untuk subtitle per kata dan transkrip video yang Anda upload. Bisa dibuat gratis di console.groq.com.',
  },
]

function KeysStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [configured, setConfigured] = useState<Record<SecretName, boolean> | null>(null)
  const [values, setValues] = useState<Partial<Record<SecretName, string>>>({})
  const [llm, setLlm] = useState<LlmValue | null>(null)
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
    if (!llm || JSON.stringify(llm) === savedLlm) return
    const { settings } = await api.settings.update({ llm })
    setSavedLlm(JSON.stringify(settings.llm))
  }

  const saveAndNext = async () => {
    setSaving(true)
    try {
      await saveLlm()
      for (const { name } of SECRET_INFO) {
        const v = (values[name] || '').trim()
        if (v) await api.secrets.set(name, v)
      }
      onNext()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (loading || (!error && (!llm || !configured))) {
    return (
      <>
        <StepTitle title="API key" />
        <div className="mc-stack">
          <Skeleton height={70} radius="md" />
          <Skeleton height={70} radius="md" />
          <Skeleton height={70} radius="md" />
        </div>
      </>
    )
  }

  if (error) {
    return (
      <>
        <StepTitle title="API key" />
        <Alert tone="error">{error}</Alert>
        <StepActions onBack={onBack}>
          <Button variant="secondary" size="lg" onClick={load} icon={<RefreshCw size={16} aria-hidden="true" />}>
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
        subtitle="API key disimpan aman di Windows Credential Manager, bukan di file biasa, dan bisa dilihat lagi lewat ikon mata. Anda bisa melewati langkah ini dan mengisinya nanti di Pengaturan."
      />
      <LlmSection
        value={llm!}
        onChange={setLlm}
        secrets={configured!}
        onSecretConfigured={(name, c) => setConfigured((prev) => (prev ? { ...prev, [name]: c } : prev))}
        persist={saveLlm}
        allowRemove={false}
      />
      <Divider />
      <h2 className="mc-h3">Transkripsi</h2>
      {SECRET_INFO.map((s) => (
        <SecretField
          key={s.name}
          name={s.name}
          label={s.label}
          description={s.description}
          configured={configured![s.name]}
          value={values[s.name] || ''}
          onChange={(v) => setValues((prev) => ({ ...prev, [s.name]: v }))}
          onConfiguredChange={(c) => setConfigured((prev) => (prev ? { ...prev, [s.name]: c } : prev))}
          allowRemove={false}
        />
      ))}
      <StepActions onBack={onBack}>
        <Button variant="secondary" size="lg" onClick={onNext} disabled={saving}>
          Lewati untuk sekarang
        </Button>
        <Button variant="primary" size="lg" onClick={saveAndNext} loading={saving} iconRight={<ArrowRight size={16} aria-hidden="true" />}>
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
        <div className="mc-stack mc-gap-8">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height={48} radius="md" />
          ))}
        </div>
      ) : error ? (
        <Alert tone="error">{error}</Alert>
      ) : (
        check && (
          <div className="mc-stack mc-gap-20">
            <div className="mc-table-wrap">
              <table className="mc-table">
                <thead>
                  <tr>
                    <th scope="col">Komponen</th>
                    <th scope="col">Versi</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {check.items.map((item) => (
                    <tr key={item.key}>
                      <td>
                        <div className="mc-label">{item.label}</div>
                        {item.detail && (
                          <div className="mc-caption mc-muted" style={{ overflowWrap: 'anywhere' }}>
                            {item.detail}
                          </div>
                        )}
                      </td>
                      <td className="mc-mono mc-caption">{item.version || '-'}</td>
                      <td>
                        <HealthBadge ok={item.ok} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mc-row mc-row--wrap mc-gap-8">
              <Badge tone="neutral" size="sm">
                {check.cpu_count} core CPU
              </Badge>
              <Badge tone="neutral" size="sm">
                RAM {check.ram_gb.toLocaleString('id-ID', { maximumFractionDigits: 1 })} GB
              </Badge>
              <Badge tone="neutral" size="sm">
                Encoder: {check.encoders.length ? check.encoders.join(', ') : 'libx264'}
              </Badge>
            </div>
            {failed > 0 && (
              <Alert tone="warning">{failed} komponen bermasalah. Anda tetap bisa melanjutkan, tetapi sebagian fitur mungkin gagal sampai masalahnya diperbaiki.</Alert>
            )}
          </div>
        )
      )}
      <StepActions onBack={onBack}>
        <Button variant="secondary" size="lg" onClick={run} loading={loading} icon={<RefreshCw size={16} aria-hidden="true" />}>
          Periksa ulang
        </Button>
        <Button variant="primary" size="lg" onClick={onNext} disabled={loading} iconRight={<ArrowRight size={16} aria-hidden="true" />}>
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
        subtitle="Super Agent adalah profil kerja untuk satu niche/channel: durasi klip default dan brand template sendiri. Anda bisa membuat lebih dari satu nanti."
      />
      {error ? (
        <Alert tone="error">{error}</Alert>
      ) : existing === null ? (
        <Skeleton height={160} radius="md" />
      ) : (
        <>
          {existing > 0 && <Alert tone="success">Anda sudah punya {existing} Super Agent di folder data ini.</Alert>}
          {showForm ? (
            <AgentForm submitLabel="Buat & mulai" onSubmit={create} onCancel={existing > 0 ? () => setShowForm(false) : undefined} />
          ) : (
            <div>
              <Button variant="secondary" onClick={() => setShowForm(true)} icon={<Plus size={16} aria-hidden="true" />}>
                Buat Super Agent baru
              </Button>
            </div>
          )}
        </>
      )}
      <StepActions onBack={onBack}>
        {existing !== null && existing > 0 && (
          <Button variant="primary" size="lg" onClick={onDone} iconRight={<ArrowRight size={16} aria-hidden="true" />}>
            Masuk ke Beranda
          </Button>
        )}
      </StepActions>
    </>
  )
}
