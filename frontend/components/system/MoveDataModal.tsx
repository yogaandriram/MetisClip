'use client'

import React, { useEffect, useState } from 'react'
import { FolderOpen, FolderInput, X } from 'lucide-react'
import { Alert, Button, InputField, Modal, ProgressBar } from '@/components/ui'
import { errorMessage, formatBytes } from '@/lib/format'
import { localeTag } from '@/lib/i18n'
import { useT } from '@/lib/i18n/I18nProvider'

type Step = 'choose' | 'moving' | 'done' | 'failed'

/** The picked folder itself when it is named MetisClip, else a MetisClip folder inside it. */
function targetFor(picked: string): string {
  const trimmed = picked.replace(/[\\/]+$/, '')
  const name = trimmed.split(/[\\/]/).pop() || ''
  return name.toLowerCase() === 'metisclip' ? trimmed : `${trimmed}\\MetisClip`
}

/**
 * "Pindahkan lokasi data": choose and check a destination, then the main process
 * stops the engine and MongoDB, copies, verifies and starts MetisClip from the copy. The old folder stays.
 */
export function MoveDataModal({ isOpen, current, onClose, onMoved }: {
  isOpen: boolean
  /** The data folder in use now */
  current: string
  onClose: () => void
  /** After a successful move (the page reloads its storage data and the old-folder notice) */
  onMoved: () => void
}) {
  const t = useT()
  const m = t.system.move
  const [step, setStep] = useState<Step>('choose')
  const [target, setTarget] = useState('')
  const [plan, setPlan] = useState<MetisDataMovePlan | null>(null)
  const [checking, setChecking] = useState(false)
  const [progress, setProgress] = useState<MetisDataMoveProgress | null>(null)
  const [result, setResult] = useState<MetisDataMoveResult | null>(null)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setStep('choose')
    setTarget('')
    setPlan(null)
    setProgress(null)
    setResult(null)
    setCancelling(false)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !window.metis) return
    return window.metis.onDataMoveProgress(setProgress)
  }, [isOpen])

  const check = async (path: string) => {
    if (!window.metis || !path.trim()) return
    setChecking(true)
    setPlan(null)
    try {
      setPlan(await window.metis.planDataMove(path.trim()))
    } catch (err) {
      setPlan({ ok: false, source: current, target: path, problems: [errorMessage(err)], warnings: [], bytes: 0, files: 0, freeBytes: 0 })
    } finally {
      setChecking(false)
    }
  }

  const choose = async () => {
    if (!window.metis) return
    const picked = await window.metis.selectFolder({ title: m.chooseTitle })
    if (!picked) return
    const next = targetFor(picked)
    setTarget(next)
    void check(next)
  }

  const start = async () => {
    if (!window.metis || !plan?.ok) return
    setStep('moving')
    setProgress(null)
    try {
      const res = await window.metis.moveDataRoot(plan.target)
      setResult(res)
      setStep(res.ok ? 'done' : 'failed')
      if (res.ok) onMoved()
    } catch (err) {
      setResult({ ok: false, error: errorMessage(err) })
      setStep('failed')
    }
  }

  const cancel = async () => {
    setCancelling(true)
    await window.metis?.cancelDataMove()
  }

  const num = (n: number) => n.toLocaleString(localeTag())
  // Cleared whenever the destination changes, so it always belongs to the current input
  const planFor = checking ? null : plan
  const canStart = step === 'choose' && !!planFor?.ok && !checking
  const percent = progress && progress.phase === 'copying' && progress.totalBytes > 0 ? (progress.doneBytes / progress.totalBytes) * 100 : null
  const canCancel = step === 'moving' && (!progress || progress.phase === 'stopping' || progress.phase === 'copying')

  const footer =
    step === 'choose' ? (
      <>
        <Button variant="ghost" onClick={onClose}>
          {t.common.cancel}
        </Button>
        <Button variant="primary" icon={<FolderInput size={16} aria-hidden="true" />} onClick={start} disabled={!canStart}>
          {m.start}
        </Button>
      </>
    ) : step === 'moving' ? (
      canCancel ? (
        <Button variant="secondary" icon={<X size={16} aria-hidden="true" />} onClick={cancel} loading={cancelling}>
          {m.cancel}
        </Button>
      ) : undefined
    ) : (
      <Button variant="primary" onClick={onClose} data-autofocus>
        {m.close}
      </Button>
    )

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={m.title} size="md" busy={step === 'moving'} footer={footer}>
      {step === 'choose' && (
        <div className="mc-stack mc-gap-16">
          <p className="mc-muted">{m.intro}</p>
          <div className="mc-stack mc-gap-4">
            <span className="mc-label">{m.current}</span>
            <span className="mc-mono mc-caption" style={{ overflowWrap: 'anywhere' }}>
              {current}
            </span>
          </div>
          <InputField
            label={m.target}
            hint={m.targetHint}
            value={target}
            mono
            placeholder="D:\MetisClip"
            spellCheck={false}
            onChange={(e) => {
              setTarget(e.target.value)
              setPlan(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void check(target)
            }}
          />
          <div className="mc-row mc-row--wrap mc-gap-8">
            <Button variant="secondary" size="sm" icon={<FolderOpen size={16} aria-hidden="true" />} onClick={choose} disabled={checking}>
              {m.choose}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => check(target)} disabled={!target.trim()} loading={checking}>
              {m.check}
            </Button>
          </div>

          {checking && <p className="mc-caption mc-muted" role="status">{m.checking}</p>}
          {planFor && !checking && (
            <Alert tone={planFor.ok ? 'success' : 'error'} title={planFor.ok ? m.ready : m.notReady}>
              <div className="mc-stack mc-gap-8">
                {planFor.problems.length > 0 && (
                  <ul className="mc-stack mc-gap-4" style={{ margin: 0, paddingLeft: 18 }}>
                    {planFor.problems.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                )}
                {planFor.ok && (
                  <span className="mc-mono mc-caption" style={{ overflowWrap: 'anywhere' }}>
                    {planFor.target}
                  </span>
                )}
                {planFor.files > 0 && <span>{m.size(formatBytes(planFor.bytes), num(planFor.files))}</span>}
                {planFor.freeBytes > 0 && <span>{m.free(formatBytes(planFor.freeBytes))}</span>}
                {planFor.warnings.map((w) => (
                  <span key={w} className="mc-caption">
                    {w}
                  </span>
                ))}
              </div>
            </Alert>
          )}
          {planFor?.ok && <p className="mc-caption mc-muted">{m.pauseNote}</p>}
        </div>
      )}

      {step === 'moving' && (
        <div className="mc-stack mc-gap-12" aria-live="polite">
          <span className="mc-label">{m.phase[progress?.phase || 'stopping']}</span>
          <ProgressBar value={percent} label={m.phase[progress?.phase || 'stopping']} />
          {progress && progress.totalFiles > 0 && (
            <span className="mc-caption mc-muted mc-mono">
              {m.progress(formatBytes(progress.doneBytes), formatBytes(progress.totalBytes), num(progress.doneFiles), num(progress.totalFiles))}
            </span>
          )}
          <p className="mc-caption mc-muted">{m.pauseNote}</p>
        </div>
      )}

      {step === 'done' && result?.ok && (
        <Alert tone="success" title={m.doneTitle}>
          <div className="mc-stack mc-gap-8">
            <span style={{ overflowWrap: 'anywhere' }}>{m.doneBody(result.newRoot || '')}</span>
            {result.oldRoot && <span style={{ overflowWrap: 'anywhere' }}>{m.oldKept(result.oldRoot)}</span>}
          </div>
        </Alert>
      )}

      {step === 'failed' && (
        <Alert tone={result?.cancelled ? 'info' : 'error'} title={m.failedTitle}>
          <span style={{ overflowWrap: 'anywhere' }}>{result?.error}</span>
        </Alert>
      )}
    </Modal>
  )
}
