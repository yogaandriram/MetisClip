'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, XCircle, RefreshCw, FolderOpen, Database, HardDrive, Archive, Info, Cpu } from 'lucide-react'
import toast from 'react-hot-toast'
import { GlassCard } from '@/components/ui/GlassCard'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { PageHeader } from '@/components/ui/PageHeader'
import { useEngine } from '@/contexts/EngineContext'
import { api, type BackupInfo, type StorageInfo, type SystemCheck } from '@/lib/engine'
import { errorMessage, formatBytes, formatDateTime } from '@/lib/format'
import { isDesktop } from '@/lib/media'

function Section({ icon: Icon, title, actions, children }: { icon: React.ElementType; title: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <GlassCard glow hoverEffect={false} padding="26px">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '18px', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Icon size={20} color="var(--primary)" /> {title}
        </h2>
        {actions && <div style={{ display: 'flex', gap: '8px' }}>{actions}</div>}
      </div>
      {children}
    </GlassCard>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: '14px', borderRadius: '12px', border: '1px solid var(--border-glass)', background: 'rgba(255,255,255,0.02)' }}>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>{label}</div>
      <div style={{ fontSize: '18px', fontWeight: 700 }}>{value}</div>
    </div>
  )
}

export default function SystemPage() {
  const { epoch, systemInfo, refreshSystemInfo } = useEngine()
  const desktop = isDesktop()
  const [check, setCheck] = useState<SystemCheck | null>(null)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [storage, setStorage] = useState<StorageInfo | null>(null)
  const [storageError, setStorageError] = useState<string | null>(null)
  const [backups, setBackups] = useState<BackupInfo[] | null>(null)
  const [backingUp, setBackingUp] = useState(false)
  const [updatingYtdlp, setUpdatingYtdlp] = useState(false)

  const runCheck = useCallback(async () => {
    setChecking(true)
    setCheckError(null)
    try {
      setCheck(await api.system.check())
    } catch (err) {
      setCheckError(errorMessage(err))
    } finally {
      setChecking(false)
    }
  }, [])

  const loadStorage = useCallback(async () => {
    setStorageError(null)
    try {
      setStorage(await api.system.storage())
    } catch (err) {
      setStorageError(errorMessage(err))
    }
    api.system
      .backups()
      .then(({ backups }) => setBackups([...backups].sort((a, b) => b.created_at.localeCompare(a.created_at))))
      .catch(() => setBackups([]))
  }, [])

  useEffect(() => {
    runCheck()
    loadStorage()
    refreshSystemInfo()
  }, [runCheck, loadStorage, refreshSystemInfo, epoch])

  const backupNow = async () => {
    setBackingUp(true)
    try {
      const { backup } = await api.system.backup()
      setBackups((prev) => [backup, ...(prev || [])])
      toast.success('Backup database selesai')
      loadStorage()
    } catch (err) {
      toast.error(errorMessage(err, 'Backup gagal'))
    } finally {
      setBackingUp(false)
    }
  }

  const updateYtdlp = async () => {
    setUpdatingYtdlp(true)
    try {
      const res = await api.system.updateYtdlp()
      if (res.ok) toast.success(res.message)
      else toast.error(res.message)
      if (res.updated) runCheck()
    } catch (err) {
      toast.error(errorMessage(err, 'Update yt-dlp gagal'))
    } finally {
      setUpdatingYtdlp(false)
    }
  }

  const open = async (path: string | null | undefined) => {
    if (!window.metis || !path) return
    const res = await window.metis.openPath(path)
    if (!res.ok) toast.error(res.error || 'Folder tidak dapat dibuka')
  }

  const usedPct = storage && storage.drive_total_bytes > 0 ? ((storage.drive_total_bytes - storage.drive_free_bytes) / storage.drive_total_bytes) * 100 : 0

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <PageHeader
        title="Sistem"
        subtitle="Status komponen, penggunaan disk, dan backup database lokal."
        actions={
          desktop && systemInfo ? (
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button variant="secondary" size="sm" icon={<FolderOpen size={14} />} onClick={() => open(systemInfo.logs_dir)}>
                Buka folder log
              </Button>
              <Button variant="secondary" size="sm" icon={<FolderOpen size={14} />} onClick={() => open(systemInfo.data_root)}>
                Buka folder data
              </Button>
            </div>
          ) : undefined
        }
      />

      <Section icon={Info} title="Informasi">
        {!systemInfo ? (
          <Skeleton height={80} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
            <Stat label="Versi aplikasi" value={desktop ? `v${window.metis!.appVersion}` : '-'} />
            <Stat label="Versi engine" value={`v${systemInfo.version}${systemInfo.env === 'dev' ? ' (dev)' : ''}`} />
            <Stat label="MongoDB" value={systemInfo.mongo.ok ? `OK${systemInfo.mongo.version ? ` · ${systemInfo.mongo.version}` : ''}` : 'Bermasalah'} />
            <Stat label="Folder library" value={systemInfo.library_dir.split(/[\\/]/).slice(-2).join('\\') || '-'} />
          </div>
        )}
      </Section>

      <Section
        icon={Cpu}
        title="Pemeriksaan komponen"
        actions={
          <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={runCheck} loading={checking}>
            Periksa ulang
          </Button>
        }
      >
        {checkError ? (
          <p style={{ color: 'var(--danger)', fontSize: '14px' }}>{checkError}</p>
        ) : !check ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} height={42} />
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {check.items.map((item) => (
              <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border-glass)' }}>
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
                {item.key === 'ytdlp' && (
                  <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={updateYtdlp} loading={updatingYtdlp}>
                    Update yt-dlp
                  </Button>
                )}
              </div>
            ))}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
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
          </div>
        )}
      </Section>

      <Section icon={HardDrive} title="Penyimpanan">
        {storageError ? (
          <p style={{ color: 'var(--danger)', fontSize: '14px' }}>{storageError}</p>
        ) : !storage ? (
          <Skeleton height={180} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div>
              <div className="mc-mono" style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '10px', wordBreak: 'break-all' }}>
                {storage.data_root}
              </div>
              <ProgressBar progress={usedPct} animated={false} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                <span>Ruang kosong drive: {formatBytes(storage.drive_free_bytes)}</span>
                <span>Total: {formatBytes(storage.drive_total_bytes)}</span>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
              <Stat label="Database" value={formatBytes(storage.db_bytes)} />
              <Stat label="Library (clip & sumber)" value={formatBytes(storage.library_bytes)} />
              <Stat label="Cache" value={formatBytes(storage.cache_bytes)} />
              <Stat label="Backup" value={formatBytes(storage.backups_bytes)} />
            </div>
            {storage.per_agent.length > 0 && (
              <div>
                <h3 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-dim)', marginBottom: '10px' }}>PER SUPER AGENT</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {[...storage.per_agent]
                    .sort((a, b) => b.bytes - a.bytes)
                    .map((a) => (
                      <div key={a.agent_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.02)' }}>
                        <span>{a.name}</span>
                        <span className="mc-mono" style={{ color: 'var(--text-dim)' }}>
                          {formatBytes(a.bytes)}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Section>

      <Section
        icon={Database}
        title="Backup database"
        actions={
          <Button variant="primary" size="sm" icon={<Archive size={14} />} onClick={backupNow} loading={backingUp}>
            Backup sekarang
          </Button>
        }
      >
        {backups === null ? (
          <Skeleton height={90} />
        ) : backups.length === 0 ? (
          <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Belum ada backup. Backup menyimpan salinan database (bukan file video) di folder data.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {backups.map((b) => (
              <div key={b.path} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border-glass)' }}>
                <Archive size={16} color="var(--text-muted)" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {formatDateTime(b.created_at)} · {formatBytes(b.size_bytes)}
                  </div>
                </div>
                {desktop && (
                  <button className="mc-icon-button" title="Tampilkan di Explorer" onClick={() => window.metis!.showItemInFolder(b.path)}>
                    <FolderOpen size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}
