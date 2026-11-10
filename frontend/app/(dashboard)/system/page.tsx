'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Archive, Check, Cpu, Database, FolderOpen, HardDrive, Info, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { Alert, Badge, Button, Card, CardHeader, EmptyState, IconButton, KeyValueList, PageHeader, ProgressRow, Skeleton } from '@/components/ui'
import { useEngine } from '@/contexts/EngineContext'
import { api, type BackupInfo, type StorageInfo, type SystemCheck } from '@/lib/engine'
import { errorMessage, formatBytes, formatDateTime } from '@/lib/format'
import { isDesktop } from '@/lib/media'

const headerIcon = (Icon: React.ElementType) => <Icon size={18} aria-hidden="true" />

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

const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0)

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

  const driveUsed = storage ? storage.drive_total_bytes - storage.drive_free_bytes : 0
  const usedPct = storage && storage.drive_total_bytes > 0 ? (driveUsed / storage.drive_total_bytes) * 100 : 0
  const appTotal = storage ? storage.db_bytes + storage.library_bytes + storage.cache_bytes + storage.backups_bytes + (storage.models_bytes || 0) : 0

  return (
    <>
      <PageHeader
        title="Sistem"
        subtitle="Status komponen, penggunaan disk, dan backup database lokal."
        actions={
          desktop && systemInfo ? (
            <>
              <Button variant="secondary" size="sm" icon={<FolderOpen size={16} aria-hidden="true" />} onClick={() => open(systemInfo.logs_dir)}>
                Buka folder log
              </Button>
              <Button variant="secondary" size="sm" icon={<FolderOpen size={16} aria-hidden="true" />} onClick={() => open(systemInfo.data_root)}>
                Buka folder data
              </Button>
            </>
          ) : undefined
        }
      />

      <div className="mc-grid" style={{ alignItems: 'start' }}>
        <div className="mc-col-7 mc-stack mc-gap-20">
          <Card>
            <CardHeader
              size="sm"
              icon={headerIcon(Cpu)}
              title="Pemeriksaan komponen"
              action={
                <Button variant="secondary" size="sm" icon={<RefreshCw size={16} aria-hidden="true" />} onClick={runCheck} loading={checking}>
                  Periksa ulang
                </Button>
              }
            />
            {checkError ? (
              <Alert tone="error" title="Pemeriksaan gagal">
                {checkError}
              </Alert>
            ) : !check ? (
              <div className="mc-stack mc-gap-8">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} height={48} radius="md" />
                ))}
              </div>
            ) : (
              <div className="mc-stack mc-gap-20">
                <div className="mc-table-wrap">
                  <table className="mc-table">
                    <thead>
                      <tr>
                        <th scope="col">Komponen</th>
                        <th scope="col">Versi</th>
                        <th scope="col">Status</th>
                        <th scope="col">
                          <span className="mc-sr-only">Aksi</span>
                        </th>
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
                          <td style={{ textAlign: 'right' }}>
                            {item.key === 'ytdlp' && (
                              <Button variant="secondary" size="sm" icon={<RefreshCw size={16} aria-hidden="true" />} onClick={updateYtdlp} loading={updatingYtdlp}>
                                Update yt-dlp
                              </Button>
                            )}
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
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              size="sm"
              icon={headerIcon(Database)}
              title="Backup database"
              action={
                <Button variant="secondary" size="sm" icon={<Archive size={16} aria-hidden="true" />} onClick={backupNow} loading={backingUp}>
                  Backup sekarang
                </Button>
              }
            />
            {backups === null ? (
              <Skeleton height={96} radius="md" />
            ) : backups.length === 0 ? (
              <EmptyState icon={Archive} title="Belum ada backup" description="Backup menyimpan salinan database (bukan file video) di folder data." />
            ) : (
              <div className="mc-table-wrap">
                <table className="mc-table mc-table--dense">
                  <thead>
                    <tr>
                      <th scope="col">File</th>
                      <th scope="col">Dibuat</th>
                      <th scope="col" className="mc-num">
                        Ukuran
                      </th>
                      {desktop && (
                        <th scope="col">
                          <span className="mc-sr-only">Aksi</span>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {backups.map((b) => (
                      <tr key={b.path}>
                        <td className="mc-mono mc-caption" style={{ overflowWrap: 'anywhere' }}>
                          {b.name}
                        </td>
                        <td className="mc-muted" style={{ whiteSpace: 'nowrap' }}>
                          {formatDateTime(b.created_at)}
                        </td>
                        <td className="mc-num">{formatBytes(b.size_bytes)}</td>
                        {desktop && (
                          <td style={{ textAlign: 'right' }}>
                            <IconButton
                              variant="ghost"
                              size="sm"
                              label="Tampilkan di Explorer"
                              tooltip="end"
                              icon={<FolderOpen size={16} />}
                              onClick={() => window.metis!.showItemInFolder(b.path)}
                            />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="mc-col-5 mc-stack mc-gap-20">
          <Card tone="leaf">
            <CardHeader size="sm" icon={headerIcon(HardDrive)} title="Penyimpanan" />
            {storageError ? (
              <Alert tone="error" title="Data penyimpanan tidak dapat dimuat">
                {storageError}
              </Alert>
            ) : !storage ? (
              <div className="mc-stack mc-gap-8">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} height={44} radius="full" />
                ))}
              </div>
            ) : (
              <div className="mc-stack mc-gap-20">
                <div className="mc-stack mc-gap-8">
                  <div className="mc-mono mc-caption" style={{ overflowWrap: 'anywhere' }}>
                    {storage.data_root}
                  </div>
                  <ProgressRow label="Drive terpakai" value={`${formatBytes(driveUsed)} / ${formatBytes(storage.drive_total_bytes)}`} percent={usedPct} highlight />
                  <div className="mc-caption">Ruang kosong drive: {formatBytes(storage.drive_free_bytes)}</div>
                </div>

                <div className="mc-stack mc-gap-8">
                  <div className="mc-row mc-row--between">
                    <span className="mc-label">Dipakai MetisClip</span>
                    <span className="mc-mono mc-caption">{formatBytes(appTotal)}</span>
                  </div>
                  <ProgressRow label="Database" value={formatBytes(storage.db_bytes)} percent={pct(storage.db_bytes, appTotal)} />
                  <ProgressRow label="Library (clip & sumber)" value={formatBytes(storage.library_bytes)} percent={pct(storage.library_bytes, appTotal)} />
                  <ProgressRow label="Cache" value={formatBytes(storage.cache_bytes)} percent={pct(storage.cache_bytes, appTotal)} />
                  <ProgressRow label="Backup" value={formatBytes(storage.backups_bytes)} percent={pct(storage.backups_bytes, appTotal)} />
                  <ProgressRow label="Model Whisper lokal" value={formatBytes(storage.models_bytes)} percent={pct(storage.models_bytes, appTotal)} />
                </div>

                {storage.per_agent.length > 0 && (
                  <div className="mc-stack mc-gap-8">
                    <span className="mc-label">Library per Super Agent</span>
                    {[...storage.per_agent]
                      .sort((a, b) => b.bytes - a.bytes)
                      .map((a) => (
                        <ProgressRow key={a.agent_id} label={a.name} value={formatBytes(a.bytes)} percent={pct(a.bytes, storage.library_bytes)} />
                      ))}
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader size="sm" icon={headerIcon(Info)} title="Informasi" />
            {!systemInfo ? (
              <Skeleton height={160} radius="md" />
            ) : (
              <KeyValueList
                items={[
                  { id: 'app', key: 'Versi aplikasi', value: <span className="mc-mono">{desktop ? `v${window.metis!.appVersion}` : '-'}</span> },
                  {
                    id: 'engine',
                    key: 'Versi engine',
                    value: (
                      <span className="mc-mono">
                        v{systemInfo.version}
                        {systemInfo.env === 'dev' ? ' (dev)' : ''}
                      </span>
                    ),
                  },
                  {
                    id: 'mongo',
                    key: 'MongoDB',
                    value: (
                      <span className="mc-row mc-gap-8" style={{ justifyContent: 'flex-end' }}>
                        {systemInfo.mongo.ok && systemInfo.mongo.version && <span className="mc-mono">{systemInfo.mongo.version}</span>}
                        <HealthBadge ok={systemInfo.mongo.ok} />
                      </span>
                    ),
                  },
                  { id: 'library', key: 'Folder library', value: <span className="mc-mono mc-caption">{systemInfo.library_dir || '-'}</span> },
                ]}
              />
            )}
          </Card>
        </div>
      </div>
    </>
  )
}
