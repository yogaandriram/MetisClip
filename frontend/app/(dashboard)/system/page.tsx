'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Archive, Check, ChevronRight, Copy, Cpu, Database, FolderInput, FolderOpen, HardDrive, Info, Lock, MemoryStick, RefreshCw, RotateCcw, Trash2, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import { Alert, Badge, Button, ButtonLink, Card, CardHeader, ConfirmModal, EmptyState, IconButton, KeyValueList, PageHeader, ProgressRow, Skeleton } from '@/components/ui'
import { MoveDataModal } from '@/components/system/MoveDataModal'
import { useEngine } from '@/contexts/EngineContext'
import { useEngineEvents } from '@/hooks/useEngineEvents'
import { api, type BackupInfo, type ResourceStatus, type ResourceTask, type StorageInfo, type SystemCheck } from '@/lib/engine'
import { errorMessage, formatBytes, formatDateTime } from '@/lib/format'
import { isDesktop } from '@/lib/media'
import { localeTag, tm } from '@/lib/i18n'
import { useI18n, useT } from '@/lib/i18n/I18nProvider'
import { copyWhenReady, supportText } from '@/lib/supportInfo'

const headerIcon = (Icon: React.ElementType) => <Icon size={18} aria-hidden="true" />

const gb = (mb: number) => `${(mb / 1024).toLocaleString(localeTag(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} GB`

/** RAM, the reserve, and the heavy steps the RAM guard runs or holds back (backend/core/resources.py). */
function RamCard({ ram, error }: { ram: ResourceStatus | null; error: string | null }) {
  const t = useT()
  const m = t.system.ram
  const task = (job: ResourceTask, i: number) => (
    <li key={`${job.kind}-${i}`} className="mc-row mc-row--between mc-gap-8">
      <span className="mc-caption">{job.label || job.kind}</span>
      <span className="mc-mono mc-caption">{gb(job.need_mb)}</span>
    </li>
  )
  const used = ram ? ram.total_mb - ram.available_mb : 0
  return (
    <Card>
      <CardHeader size="sm" icon={headerIcon(MemoryStick)} title={m.title} />
      {error ? (
        <Alert tone="error" title={m.loadFailed}>
          {error}
        </Alert>
      ) : !ram ? (
        <Skeleton height={96} radius="md" />
      ) : (
        <div className="mc-stack mc-gap-12">
          <ProgressRow label={m.used} value={`${gb(used)} / ${gb(ram.total_mb)}`} percent={pct(used, ram.total_mb)} highlight />
          <div className="mc-row mc-row--wrap mc-gap-8">
            <Badge tone={ram.auto ? 'success' : 'neutral'} size="sm">
              {ram.auto ? m.saverOn : m.saverOff}
            </Badge>
            {ram.auto && (
              <Badge tone="neutral" size="sm">
                {m.reserve(gb(ram.reserve_mb))}
              </Badge>
            )}
          </div>
          {!ram.auto && <p className="mc-caption mc-muted">{m.saverOffNote}</p>}
          {ram.running.length > 0 && (
            <div className="mc-stack mc-gap-4">
              <span className="mc-label">{m.running}</span>
              <ul className="mc-stack mc-gap-4" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {ram.running.map(task)}
              </ul>
            </div>
          )}
          {ram.waiting.length > 0 && (
            <div className="mc-stack mc-gap-4">
              <span className="mc-label">{m.waiting}</span>
              <ul className="mc-stack mc-gap-4" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {ram.waiting.map(task)}
              </ul>
            </div>
          )}
          {ram.auto && !ram.running.length && !ram.waiting.length && <p className="mc-caption mc-muted">{m.idle}</p>}
        </div>
      )}
    </Card>
  )
}

function HealthBadge({ ok }: { ok: boolean }) {
  const t = useT()
  return ok ? (
    <Badge tone="success" size="sm" icon={<Check size={14} aria-hidden="true" />}>
      {t.system.health.ok}
    </Badge>
  ) : (
    <Badge tone="error" size="sm" icon={<AlertTriangle size={14} aria-hidden="true" />}>
      {t.system.health.problem}
    </Badge>
  )
}

const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0)

/** Under yt-dlp in the component check: the daily update check (backend/agents/tools/ytdlp.py). */
function ytdlpAutoText(u: NonNullable<SystemCheck['ytdlp_update']>): string {
  const m = tm().system.check
  if (!u.auto) return m.ytdlpAutoOff
  if (u.attempted_at && u.ok === false) return m.ytdlpAutoFailed(formatDateTime(u.attempted_at))
  return u.checked_at ? m.ytdlpAuto(formatDateTime(u.checked_at)) : m.ytdlpAutoPending
}

export default function SystemPage() {
  const { t, lang } = useI18n()
  const m = t.system
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
  const [ram, setRam] = useState<ResourceStatus | null>(null)
  const [ramError, setRamError] = useState<string | null>(null)
  const [moveOpen, setMoveOpen] = useState(false)
  const [previous, setPrevious] = useState<{ path: string; bytes: number } | null>(null)
  const [deletePreviousOpen, setDeletePreviousOpen] = useState(false)
  const [deletingPrevious, setDeletingPrevious] = useState(false)
  const [restoreTarget, setRestoreTarget] = useState<BackupInfo | null>(null)
  const [restoreBlocked, setRestoreBlocked] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)

  useEngineEvents((e) => {
    if (e.type !== 'system.resources') return
    const { type: _type, ...status } = e
    setRam(status)
  })

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

  const loadPrevious = useCallback(async () => {
    if (!window.metis) return
    try {
      setPrevious(await window.metis.getPreviousDataRoot())
    } catch {
      setPrevious(null)
    }
  }, [])

  useEffect(() => {
    runCheck()
    loadStorage()
    loadPrevious()
    refreshSystemInfo()
    setRamError(null)
    api.system
      .resources()
      .then(setRam)
      .catch((err) => setRamError(errorMessage(err)))
  }, [runCheck, loadStorage, loadPrevious, refreshSystemInfo, epoch])

  const backupNow = async () => {
    setBackingUp(true)
    try {
      const { backup } = await api.system.backup()
      setBackups((prev) => [backup, ...(prev || [])])
      toast.success(m.backup.done)
      loadStorage()
    } catch (err) {
      toast.error(errorMessage(err, m.backup.failed))
    } finally {
      setBackingUp(false)
    }
  }

  const askRestore = async (b: BackupInfo) => {
    setRestoreTarget(b)
    setRestoreBlocked(null)
    try {
      const activity = await api.system.activity()
      setRestoreBlocked(activity.busy ? activity.message : null)
    } catch (err) {
      setRestoreBlocked(errorMessage(err))
    }
  }

  const restore = async () => {
    if (!restoreTarget) return
    setRestoring(true)
    try {
      await api.system.restoreBackup(restoreTarget.name)
      toast.success(m.backup.restored(formatDateTime(restoreTarget.created_at)))
      // Every page and context loads its data again from the restored database
      setTimeout(() => window.location.reload(), 1200)
    } catch (err) {
      toast.error(errorMessage(err, m.backup.restoreFailed))
      setRestoring(false)
      setRestoreTarget(null)
    }
  }

  const deletePrevious = async () => {
    if (!window.metis) return
    setDeletingPrevious(true)
    try {
      const res = await window.metis.deletePreviousDataRoot()
      if (res.ok) toast.success(m.move.deleted(formatBytes(res.freedBytes ?? 0)))
      else toast.error(res.error || m.move.deleteFailed)
    } catch (err) {
      toast.error(errorMessage(err, m.move.deleteFailed))
    } finally {
      setDeletingPrevious(false)
      setDeletePreviousOpen(false)
      loadPrevious()
    }
  }

  const keepPrevious = async () => {
    await window.metis?.forgetPreviousDataRoot()
    setPrevious(null)
  }

  const updateYtdlp = async () => {
    setUpdatingYtdlp(true)
    try {
      const res = await api.system.updateYtdlp()
      if (res.ok) toast.success(res.message)
      else toast.error(res.message)
      runCheck() // the version, and the time of the last check

    } catch (err) {
      toast.error(errorMessage(err, m.check.updateYtdlpFailed))
    } finally {
      setUpdatingYtdlp(false)
    }
  }

  const open = async (path: string | null | undefined) => {
    if (!window.metis || !path) return
    const res = await window.metis.openPath(path)
    if (!res.ok) toast.error(res.error || m.folderOpenFailed)
  }

  // what this page already loaded, plus the AI and transcription settings (never a key)
  const copySupportInfo = async () => {
    const text = Promise.all([
      api.settings.get().then((r) => r.settings, () => null),
      check ? Promise.resolve(check) : api.system.check().catch(() => null), // still running: wait for it
    ]).then(([settings, checked]) => supportText({ t, lang, systemInfo, check: checked, storage, settings }))
    try {
      await copyWhenReady(text)
      toast.success(t.about.support.copied)
    } catch (err) {
      toast.error(`${t.about.support.copyFailed}: ${errorMessage(err)}`)
    }
  }

  const driveUsed = storage ? storage.drive_total_bytes - storage.drive_free_bytes : 0
  const usedPct = storage && storage.drive_total_bytes > 0 ? (driveUsed / storage.drive_total_bytes) * 100 : 0
  const appTotal = storage ? storage.db_bytes + storage.library_bytes + storage.cache_bytes + storage.backups_bytes + (storage.models_bytes || 0) : 0

  return (
    <>
      <PageHeader
        title={m.title}
        subtitle={m.subtitle}
        actions={
          desktop && systemInfo ? (
            <>
              <Button variant="secondary" size="sm" icon={<Copy size={16} aria-hidden="true" />} onClick={copySupportInfo}>
                {t.about.support.copy}
              </Button>
              <Button variant="secondary" size="sm" icon={<FolderOpen size={16} aria-hidden="true" />} onClick={() => open(systemInfo.logs_dir)}>
                {m.openLogs}
              </Button>
              <Button variant="secondary" size="sm" icon={<FolderOpen size={16} aria-hidden="true" />} onClick={() => open(systemInfo.data_root)}>
                {m.openData}
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
              title={m.check.title}
              action={
                <Button variant="secondary" size="sm" icon={<RefreshCw size={16} aria-hidden="true" />} onClick={runCheck} loading={checking}>
                  {m.check.recheck}
                </Button>
              }
            />
            {checkError ? (
              <Alert tone="error" title={m.check.failed}>
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
                        <th scope="col">{m.check.component}</th>
                        <th scope="col">{m.check.version}</th>
                        <th scope="col">{m.check.status}</th>
                        <th scope="col">
                          <span className="mc-sr-only">{m.check.actions}</span>
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
                            {item.key === 'ytdlp' && check.ytdlp_update && <div className="mc-caption mc-muted">{ytdlpAutoText(check.ytdlp_update)}</div>}
                          </td>
                          <td className="mc-mono mc-caption">{item.version || '-'}</td>
                          <td>
                            <HealthBadge ok={item.ok} />
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {item.key === 'ytdlp' && (
                              <Button variant="secondary" size="sm" icon={<RefreshCw size={16} aria-hidden="true" />} onClick={updateYtdlp} loading={updatingYtdlp}>
                                {m.check.updateYtdlp}
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
                    {m.check.cpuCores(check.cpu_count)}
                  </Badge>
                  <Badge tone="neutral" size="sm">
                    {m.check.ram(check.ram_gb.toLocaleString(localeTag(), { maximumFractionDigits: 1 }))}
                  </Badge>
                  <Badge tone="neutral" size="sm">
                    {m.check.encoders(check.encoders.length ? check.encoders.join(', ') : 'libx264')}
                  </Badge>
                </div>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              size="sm"
              icon={headerIcon(Database)}
              title={m.backup.title}
              action={
                <Button variant="secondary" size="sm" icon={<Archive size={16} aria-hidden="true" />} onClick={backupNow} loading={backingUp}>
                  {m.backup.now}
                </Button>
              }
            />
            {backups === null ? (
              <Skeleton height={96} radius="md" />
            ) : backups.length === 0 ? (
              <EmptyState icon={Archive} title={m.backup.emptyTitle} description={m.backup.emptyDescription} />
            ) : (
              <div className="mc-table-wrap">
                <table className="mc-table mc-table--dense">
                  <thead>
                    <tr>
                      <th scope="col">{m.backup.file}</th>
                      <th scope="col">{m.backup.created}</th>
                      <th scope="col" className="mc-num">
                        {m.backup.size}
                      </th>
                      <th scope="col">
                        <span className="mc-sr-only">{m.check.actions}</span>
                      </th>
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
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <IconButton
                            variant="ghost"
                            size="sm"
                            label={m.backup.restore(b.name)}
                            tooltip="end"
                            icon={<RotateCcw size={16} />}
                            onClick={() => askRestore(b)}
                          />
                          {desktop && (
                            <IconButton
                              variant="ghost"
                              size="sm"
                              label={t.common.showInExplorer}
                              tooltip="end"
                              icon={<FolderOpen size={16} />}
                              onClick={() => window.metis!.showItemInFolder(b.path)}
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="mc-col-5 mc-stack mc-gap-20">
          <RamCard ram={ram} error={ramError} />

          <Card tone="leaf">
            <CardHeader size="sm" icon={headerIcon(HardDrive)} title={m.storage.title} />
            {storageError ? (
              <Alert tone="error" title={m.storage.loadFailed}>
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
                  {(storage.access === 'private' || storage.access === 'shared') && (
                    <div className="mc-row mc-gap-8 mc-caption" style={{ alignItems: 'flex-start' }}>
                      {storage.access === 'private' ? (
                        <Lock size={14} aria-hidden="true" style={{ flex: 'none', marginTop: 3 }} />
                      ) : (
                        <Users size={14} aria-hidden="true" style={{ flex: 'none', marginTop: 3 }} />
                      )}
                      <span>{storage.access === 'private' ? m.storage.accessPrivate : m.storage.accessShared}</span>
                    </div>
                  )}
                  <ProgressRow label={m.storage.driveUsed} value={`${formatBytes(driveUsed)} / ${formatBytes(storage.drive_total_bytes)}`} percent={usedPct} highlight />
                  <div className="mc-caption">{m.storage.driveFree(formatBytes(storage.drive_free_bytes))}</div>
                  {desktop && (
                    <div>
                      <Button variant="secondary" size="sm" icon={<FolderInput size={16} aria-hidden="true" />} onClick={() => setMoveOpen(true)}>
                        {m.move.button}
                      </Button>
                    </div>
                  )}
                </div>

                {previous && (
                  <Alert tone="info" title={m.move.previousTitle}>
                    <div className="mc-stack mc-gap-12">
                      <span style={{ overflowWrap: 'anywhere' }}>{m.move.previousBody(previous.path, formatBytes(previous.bytes))}</span>
                      <div className="mc-row mc-row--wrap mc-gap-8">
                        <Button variant="secondary" size="sm" icon={<Trash2 size={16} aria-hidden="true" />} onClick={() => setDeletePreviousOpen(true)}>
                          {m.move.deletePrevious}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={keepPrevious}>
                          {m.move.keepPrevious}
                        </Button>
                      </div>
                    </div>
                  </Alert>
                )}

                <div className="mc-stack mc-gap-8">
                  <div className="mc-row mc-row--between">
                    <span className="mc-label">{m.storage.usedByApp}</span>
                    <span className="mc-mono mc-caption">{formatBytes(appTotal)}</span>
                  </div>
                  <ProgressRow label={m.storage.database} value={formatBytes(storage.db_bytes)} percent={pct(storage.db_bytes, appTotal)} />
                  <ProgressRow label={m.storage.library} value={formatBytes(storage.library_bytes)} percent={pct(storage.library_bytes, appTotal)} />
                  <ProgressRow label={m.storage.cache} value={formatBytes(storage.cache_bytes)} percent={pct(storage.cache_bytes, appTotal)} />
                  <ProgressRow label={m.storage.backups} value={formatBytes(storage.backups_bytes)} percent={pct(storage.backups_bytes, appTotal)} />
                  <ProgressRow label={m.storage.models} value={formatBytes(storage.models_bytes)} percent={pct(storage.models_bytes, appTotal)} />
                </div>

                {(storage.per_campaign || []).length > 0 && (
                  <div className="mc-stack mc-gap-8">
                    <span className="mc-label">{m.storage.perCampaign}</span>
                    {[...storage.per_campaign]
                      .sort((a, b) => b.bytes - a.bytes)
                      .map((c) => (
                        <ProgressRow key={c.campaign_id} label={c.name} value={formatBytes(c.bytes)} percent={pct(c.bytes, storage.library_bytes)} />
                      ))}
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              size="sm"
              icon={headerIcon(Info)}
              title={m.info.title}
              action={
                <ButtonLink href="/system/about/" variant="ghost" size="sm" iconRight={<ChevronRight size={16} aria-hidden="true" />}>
                  {t.about.open}
                </ButtonLink>
              }
            />
            {!systemInfo ? (
              <Skeleton height={160} radius="md" />
            ) : (
              <KeyValueList
                items={[
                  { id: 'app', key: m.info.appVersion, value: <span className="mc-mono">{desktop ? `v${window.metis!.appVersion}` : '-'}</span> },
                  {
                    id: 'engine',
                    key: m.info.engineVersion,
                    value: (
                      <span className="mc-mono">
                        v{systemInfo.version}
                        {systemInfo.env === 'dev' ? ' (dev)' : ''}
                      </span>
                    ),
                  },
                  {
                    id: 'mongo',
                    key: m.info.mongo,
                    value: (
                      <span className="mc-row mc-gap-8" style={{ justifyContent: 'flex-end' }}>
                        {systemInfo.mongo.ok && systemInfo.mongo.version && <span className="mc-mono">{systemInfo.mongo.version}</span>}
                        <HealthBadge ok={systemInfo.mongo.ok} />
                      </span>
                    ),
                  },
                  { id: 'library', key: m.info.libraryDir, value: <span className="mc-mono mc-caption">{systemInfo.library_dir || '-'}</span> },
                ]}
              />
            )}
          </Card>
        </div>
      </div>

      {desktop && storage && (
        <MoveDataModal
          isOpen={moveOpen}
          current={storage.data_root}
          onClose={() => setMoveOpen(false)}
          onMoved={() => {
            loadStorage()
            loadPrevious()
            refreshSystemInfo()
          }}
        />
      )}

      <ConfirmModal
        isOpen={!!previous && deletePreviousOpen}
        title={m.move.deleteTitle}
        message={previous ? m.move.deleteBody(previous.path) : undefined}
        confirmLabel={m.move.deleteConfirm}
        confirmIcon={<Trash2 size={16} aria-hidden="true" />}
        danger
        loading={deletingPrevious}
        onConfirm={deletePrevious}
        onClose={() => setDeletePreviousOpen(false)}
      />

      <ConfirmModal
        isOpen={!!restoreTarget}
        title={m.backup.restoreTitle}
        confirmLabel={m.backup.restoreConfirm}
        confirmIcon={<RotateCcw size={16} aria-hidden="true" />}
        danger
        loading={restoring}
        confirmDisabled={!!restoreBlocked}
        onConfirm={restore}
        onClose={() => {
          if (!restoring) setRestoreTarget(null)
        }}
      >
        {restoreTarget && (
          <div className="mc-stack mc-gap-12">
            <p>{m.backup.restoreBody(formatDateTime(restoreTarget.created_at))}</p>
            <p className="mc-muted">{m.backup.restoreFiles}</p>
            <p className="mc-muted">{m.backup.restoreSafety}</p>
            {restoreBlocked && (
              <Alert tone="error" title={m.backup.restoreBusy}>
                {restoreBlocked}
              </Alert>
            )}
          </div>
        )}
      </ConfirmModal>
    </>
  )
}
