'use client'

import React from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button, IconButton } from '@/components/ui'
import type { ClipRange } from '@/lib/engine'
import { formatClockTenths, parseClock } from '@/lib/format'
import { useT } from '@/lib/i18n/I18nProvider'
import { MOMENT_MAX_S, MOMENT_MIN_S } from './RecutDialog'

/** The engine's limit on moments per job (agents/nodes/manual.py MAX_RANGES) */
export const MAX_MOMENTS = 20

/** One row as typed: kept as text so a half-typed time is not lost */
export interface MomentRow {
  key: number
  start: string
  end: string
}

let nextKey = 1
export const newMomentRow = (start = '', end = ''): MomentRow => ({ key: nextKey++, start, end })

export type MomentProblem = 'time' | 'order' | 'length' | null

/** What is wrong with a row (null: it is a valid moment) and its range when the times parse. */
export function checkMoment(row: MomentRow): { problem: MomentProblem; range: ClipRange | null } {
  const start = parseClock(row.start)
  const end = parseClock(row.end)
  if (start === null || end === null) return { problem: 'time', range: null }
  const range = { start: Math.round(start * 100) / 100, end: Math.round(end * 100) / 100 }
  if (range.end <= range.start) return { problem: 'order', range }
  const length = range.end - range.start
  if (length < MOMENT_MIN_S || length > MOMENT_MAX_S) return { problem: 'length', range }
  return { problem: null, range }
}

/** The ranges to send, or null while any row is not a valid moment (or there is none). */
export function momentRanges(rows: MomentRow[]): ClipRange[] | null {
  if (rows.length === 0) return null
  const out: ClipRange[] = []
  for (const row of rows) {
    const { problem, range } = checkMoment(row)
    if (problem || !range) return null
    out.push(range)
  }
  return out
}

interface MomentsEditorProps {
  rows: MomentRow[]
  onChange: (rows: MomentRow[]) => void
  /** Show each row's problem (after the user tried to start) */
  showErrors?: boolean
}

/** "Pilih momen sendiri" on Cari Video: start and end of every moment in the source video. */
export function MomentsEditor({ rows, onChange, showErrors = false }: MomentsEditorProps) {
  const t = useT()
  const m = t.discover.form.moments
  const set = (key: number, patch: Partial<MomentRow>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  return (
    <div className="mc-stack mc-gap-12">
      <ol className="mc-stack mc-gap-12" style={{ margin: 0, padding: 0, listStyle: 'none' }} aria-label={m.listAria}>
        {rows.map((row, i) => {
          const { problem, range } = checkMoment(row)
          const touched = row.start.trim() !== '' && row.end.trim() !== ''
          const shown = problem && (showErrors || (touched && problem !== 'time')) ? problem : null
          const errorId = `moment-${row.key}-error`
          return (
            <li key={row.key} className="mc-stack mc-gap-4">
              <div className="mc-row mc-row--wrap mc-gap-12" style={{ alignItems: 'flex-end' }}>
                <span className="mc-label" style={{ minWidth: 72, paddingBottom: 12 }}>
                  {m.row(i + 1)}
                </span>
                {(['start', 'end'] as const).map((edge) => (
                  <label key={edge} className="mc-stack mc-gap-4" style={{ width: 132 }}>
                    <span className="mc-caption">{edge === 'start' ? m.start : m.end}</span>
                    <input
                      className="mc-input mc-mono"
                      value={row[edge]}
                      placeholder={edge === 'start' ? '12:30' : '13:15'}
                      inputMode="decimal"
                      spellCheck={false}
                      autoComplete="off"
                      aria-invalid={shown ? true : undefined}
                      aria-describedby={shown ? errorId : undefined}
                      onChange={(e) => set(row.key, { [edge]: e.target.value })}
                      onBlur={() => {
                        const v = parseClock(row[edge])
                        if (v !== null) set(row.key, { [edge]: formatClockTenths(v) })
                      }}
                    />
                  </label>
                ))}
                <span className="mc-caption mc-muted mc-mono" style={{ paddingBottom: 12, minWidth: 64 }}>
                  {range && range.end > range.start ? m.length(Math.round((range.end - range.start) * 10) / 10) : ''}
                </span>
                <div style={{ paddingBottom: 4 }}>
                  <IconButton
                    label={m.remove(i + 1)}
                    icon={<Trash2 size={16} aria-hidden="true" />}
                    size="sm"
                    variant="ghost"
                    disabled={rows.length === 1}
                    onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
                  />
                </div>
              </div>
              {shown && (
                <span id={errorId} className="mc-field__error" role="alert">
                  {shown === 'time' ? m.badTime : shown === 'order' ? m.badOrder : m.badLength(MOMENT_MIN_S, MOMENT_MAX_S)}
                </span>
              )}
            </li>
          )
        })}
      </ol>
      <div className="mc-row mc-row--wrap mc-gap-12">
        <Button
          variant="secondary"
          size="sm"
          icon={<Plus size={16} aria-hidden="true" />}
          disabled={rows.length >= MAX_MOMENTS}
          onClick={() => onChange([...rows, newMomentRow()])}
        >
          {m.add}
        </Button>
        <span className="mc-caption mc-muted">{m.count(rows.length, MAX_MOMENTS)}</span>
      </div>
    </div>
  )
}
