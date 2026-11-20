'use client'

import React, { useEffect, useState } from 'react'
import { Scissors } from 'lucide-react'
import toast from 'react-hot-toast'
import { Alert, Button, Modal, ToggleSwitch } from '@/components/ui'
import { api, type Clip, type Job } from '@/lib/engine'
import { errorMessage, formatClockTenths, parseClock } from '@/lib/format'
import { useT } from '@/lib/i18n/I18nProvider'

/** The engine's limits for a moment (agents/nodes/manual.py) */
export const MOMENT_MIN_S = 5
export const MOMENT_MAX_S = 180
const NUDGES = [-5, -1, -0.5, 0.5, 1, 5]

interface RecutDialogProps {
  isOpen: boolean
  clip: Clip
  /** Length of the source video, when known (the end cannot go past it) */
  sourceDuration?: number | null
  /** The editor has unsaved edits: they are saved first (false stops the recut) */
  saveFirst?: () => Promise<boolean>
  onClose: () => void
  onStarted: (job: Job) => void
}

/** A time field for one edge: typed as m:ss.d (or seconds), nudged with the buttons below it. */
function EdgeField({ label, value, onChange, invalid }: { label: string; value: number; onChange: (v: number) => void; invalid?: boolean }) {
  const t = useT()
  const m = t.editor.recut
  const [text, setText] = useState(formatClockTenths(value))
  const [bad, setBad] = useState(false)
  useEffect(() => {
    setText(formatClockTenths(value))
    setBad(false)
  }, [value])
  const commit = () => {
    const v = parseClock(text)
    if (v === null) setBad(true)
    else onChange(Math.round(v * 10) / 10)
  }
  const id = `recut-${label}`
  return (
    <div className="mc-stack mc-gap-8">
      <label className="mc-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="mc-input mc-mono"
        value={text}
        inputMode="decimal"
        spellCheck={false}
        autoComplete="off"
        aria-invalid={bad || invalid || undefined}
        aria-describedby={bad ? `${id}-error` : undefined}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          }
        }}
      />
      {bad && (
        <span id={`${id}-error`} className="mc-caption" role="alert">
          {m.badTime}
        </span>
      )}
      <div className="mc-row mc-row--wrap mc-gap-4" role="group" aria-label={m.nudgeGroup(label)}>
        {NUDGES.map((d) => (
          <Button key={d} variant="secondary" size="sm" onClick={() => onChange(Math.max(0, Math.round((value + d) * 10) / 10))}>
            {m.nudge(d)}
          </Button>
        ))}
      </div>
    </div>
  )
}

/**
 * Cut a clip again at new edges in its source video (CLAUDE.md §5.2, "Manual clips and recuts"). The engine runs it as a
 * one-moment job: new download, face tracking and Whisper; the clip keeps its style, template, title and
 * the words the user edited.
 */
export function RecutDialog({ isOpen, clip, sourceDuration, saveFirst, onClose, onStarted }: RecutDialogProps) {
  const t = useT()
  const m = t.editor.recut
  const [start, setStart] = useState(clip.start_time)
  const [end, setEnd] = useState(clip.end_time)
  const [snap, setSnap] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setStart(Math.round(clip.start_time * 10) / 10)
    setEnd(Math.round(clip.end_time * 10) / 10)
  }, [isOpen, clip.start_time, clip.end_time])

  const length = end - start
  const problem =
    end <= start
      ? m.endBeforeStart
      : length < MOMENT_MIN_S || length > MOMENT_MAX_S
        ? m.lengthRange(MOMENT_MIN_S, MOMENT_MAX_S)
        : sourceDuration && start >= sourceDuration
          ? m.pastEnd(formatClockTenths(sourceDuration))
          : null
  const unchanged = Math.abs(start - clip.start_time) < 0.05 && Math.abs(end - clip.end_time) < 0.05
  const dStart = clip.start_time - start // > 0: longer at the start
  const dEnd = end - clip.end_time

  const submit = async () => {
    if (problem || unchanged || busy) return
    setBusy(true)
    try {
      if (saveFirst && !(await saveFirst())) return
      const { job } = await api.clips.recut(clip.id, { start, end: sourceDuration ? Math.min(end, sourceDuration) : end, snap_edges: snap })
      toast.success(m.started)
      onStarted(job)
      onClose()
    } catch (err) {
      toast.error(errorMessage(err, m.failed))
    } finally {
      setBusy(false)
    }
  }

  const footer = (
    <>
      <Button variant="ghost" onClick={onClose} disabled={busy}>
        {t.common.cancel}
      </Button>
      <Button variant="primary" icon={<Scissors size={16} aria-hidden="true" />} onClick={submit} loading={busy} disabled={!!problem || unchanged}>
        {saveFirst ? m.saveAndStart : m.start}
      </Button>
    </>
  )

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={m.title} size="md" busy={busy} footer={footer}>
      <div className="mc-stack mc-gap-20">
        <p className="mc-muted">{m.intro}</p>
        <div className="mc-grid">
          <div className="mc-col-6">
            <EdgeField label={m.startLabel} value={start} onChange={setStart} invalid={!!problem} />
          </div>
          <div className="mc-col-6">
            <EdgeField label={m.endLabel} value={end} onChange={(v) => setEnd(sourceDuration ? Math.min(v, sourceDuration) : v)} invalid={!!problem} />
          </div>
        </div>
        <div className="mc-stack mc-gap-4" aria-live="polite">
          <span>
            {m.newLength(formatClockTenths(Math.max(0, length)), formatClockTenths(clip.end_time - clip.start_time))}
          </span>
          {!unchanged && <span className="mc-caption mc-muted">{m.change(dStart, dEnd)}</span>}
          {sourceDuration ? <span className="mc-caption mc-muted">{m.sourceLength(formatClockTenths(sourceDuration))}</span> : null}
        </div>
        {problem && <Alert tone="error">{problem}</Alert>}
        <ToggleSwitch label={m.snap} hint={m.snapHint} checked={snap} onChange={setSnap} />
        <Alert tone="info">{m.keeps}</Alert>
      </div>
    </Modal>
  )
}
