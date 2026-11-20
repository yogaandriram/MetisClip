'use client'

import React, { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, LocateFixed, Merge, MoreHorizontal, Plus, Replace, Search, Split, Star, Trash2, TriangleAlert, Type, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { Alert, Badge, Button, Dropdown, EmptyState, IconButton, InputField, iconButtonClass } from '@/components/ui'
import { type AiCaptionSettings, isFiller } from '@/lib/presets/captions'
import type { SubtitleWord } from '@/lib/engine'
import { cx } from '@/lib/cx'
import { useT } from '@/lib/i18n/I18nProvider'
import { type WordProblem, canSplit, fixWordTimes, mergeWithNext, replaceInWords, splitWord } from '@/lib/wordEdit'

interface WordPanelProps {
  words: SubtitleWord[]
  setWords: (words: SubtitleWord[], key?: string) => void
  ai: AiCaptionSettings
  /** The caption offset in seconds (word time + offset = video time) */
  offsetS: number
  /** The word being spoken at the playhead (-1: none) */
  activeIndex: number
  isPlaying: boolean
  /** The clip's length in seconds (0: unknown) */
  duration: number
  /** wordProblems() of the words, one entry per word */
  problems: (WordProblem[] | null)[]
  find: string
  onFindChange: (find: string) => void
  /** findWords() of the words for `find` */
  matches: number[]
  onSeek: (videoTime: number) => void
  /** The search field, focused by Ctrl+F */
  findRef: React.RefObject<HTMLInputElement>
  /** The column's scroll body (flex: 1, overflow auto) */
  bodyStyle: React.CSSProperties
}

const TYPING = (el: Element | null) => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable)

/**
 * The clip editor's subtitle words: find & replace, a list that follows the playhead, and per word its text,
 * times, keyword mark, emoji, split, merge, insert and delete. Words with impossible times are marked and
 * can be fixed at once. Renders the tools row and the scroll body of the left column.
 */
export function WordPanel({
  words,
  setWords,
  ai,
  offsetS,
  activeIndex,
  isPlaying,
  duration,
  problems,
  find,
  onFindChange,
  matches,
  onSeek,
  findRef,
  bodyStyle,
}: WordPanelProps) {
  const m = useT().editor
  const w = m.words
  const bodyRef = useRef<HTMLDivElement>(null)
  const [follow, setFollow] = useState(true)
  const [replaceOpen, setReplaceOpen] = useState(false)
  const [replacement, setReplacement] = useState('')
  // Where "next match" goes from: the last match it showed
  const matchCursor = useRef(-1)
  const matchSet = new Set(matches)
  const problemCount = problems.filter(Boolean).length
  const firstProblem = problems.findIndex(Boolean)

  /** Scroll a word's card into the visible part of the list (only the list scrolls, never the page). */
  const reveal = (index: number, smooth: boolean) => {
    const body = bodyRef.current
    const card = body?.querySelector<HTMLElement>(`[data-word="${index}"]`)
    if (!body || !card) return
    const b = body.getBoundingClientRect()
    const c = card.getBoundingClientRect()
    if (c.top >= b.top + 8 && c.bottom <= b.bottom - 8) return
    body.scrollTo({ top: body.scrollTop + (c.top - b.top) - b.height * 0.3, behavior: smooth ? 'smooth' : 'auto' })
  }

  // Follow the playhead, except while the user types in the list
  useEffect(() => {
    if (!follow || activeIndex < 0) return
    const focused = document.activeElement
    if (bodyRef.current?.contains(focused) && TYPING(focused)) return
    reveal(activeIndex, isPlaying)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, follow])

  useEffect(() => {
    matchCursor.current = -1
  }, [find])

  const jump = (index: number) => {
    const word = words[index]
    if (!word) return
    onSeek(word.start + offsetS)
    reveal(index, false)
  }

  const stepMatch = (dir: 1 | -1) => {
    if (!matches.length) return
    const from = matchCursor.current >= 0 ? matchCursor.current : activeIndex
    let pos = dir === 1 ? matches.findIndex((i) => i > from) : matches.length - 1 - [...matches].reverse().findIndex((i) => i < from)
    if (pos < 0 || pos >= matches.length) pos = dir === 1 ? 0 : matches.length - 1
    matchCursor.current = matches[pos]
    jump(matches[pos])
  }

  const replaceAll = () => {
    const res = replaceInWords(words, find, replacement)
    if (!res.changed) return
    setWords(res.words)
    toast.success(w.replaced(res.changed))
  }

  const fixTimes = () => {
    setWords(fixWordTimes(words, duration))
    toast.success(w.fixed)
  }

  const edit = (index: number, patch: Partial<SubtitleWord>, key?: string) =>
    setWords(
      words.map((x, i) => (i === index ? { ...x, ...patch } : x)),
      key,
    )

  if (words.length === 0) {
    return (
      <div ref={bodyRef} style={{ ...bodyStyle, padding: '4px 12px 16px' }}>
        <EmptyState
          icon={Type}
          title={m.noSubtitles}
          description={m.noSubtitlesBody}
          action={
            <Button variant="secondary" size="sm" icon={<Plus size={16} />} onClick={() => setWords([{ word: m.firstWordText, start: 0, end: 0.5 }])}>
              {m.addWord}
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <>
      <div className="mc-stack mc-gap-8" style={{ padding: '12px 20px 8px' }}>
        <div className="mc-row mc-gap-4">
          <InputField
            ref={findRef}
            containerClassName="mc-grow"
            inputSize="sm"
            icon={<Search size={16} />}
            aria-label={w.find}
            placeholder={w.findPlaceholder}
            value={find}
            onChange={(e) => onFindChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                stepMatch(e.shiftKey ? -1 : 1)
              } else if (e.key === 'Escape' && find) {
                e.preventDefault()
                onFindChange('')
              }
            }}
            action={
              find ? (
                <IconButton size="sm" variant="ghost" tooltip={false} label={w.clearFind} icon={<X size={14} />} onClick={() => onFindChange('')} />
              ) : undefined
            }
          />
          <IconButton
            size="sm"
            variant={replaceOpen ? 'ink' : 'surface'}
            tooltip="end"
            label={w.replaceToggle}
            aria-pressed={replaceOpen}
            icon={<Replace size={16} />}
            onClick={() => setReplaceOpen((v) => !v)}
          />
          <IconButton
            size="sm"
            variant={follow ? 'ink' : 'surface'}
            tooltip="end"
            label={follow ? w.follow : w.followOff}
            aria-pressed={follow}
            icon={<LocateFixed size={16} />}
            onClick={() => setFollow((v) => !v)}
          />
        </div>
        {find.trim() && (
          <div className="mc-row mc-gap-4">
            <span className="mc-caption mc-muted mc-grow" role="status">
              {w.matches(matches.length)}
            </span>
            <IconButton size="sm" variant="ghost" tooltip="end" label={w.prevMatch} icon={<ChevronUp size={16} />} disabled={!matches.length} onClick={() => stepMatch(-1)} />
            <IconButton size="sm" variant="ghost" tooltip="end" label={w.nextMatch} icon={<ChevronDown size={16} />} disabled={!matches.length} onClick={() => stepMatch(1)} />
          </div>
        )}
        {replaceOpen && (
          <div className="mc-row mc-gap-4">
            <InputField
              containerClassName="mc-grow"
              inputSize="sm"
              aria-label={w.replaceWith}
              placeholder={w.replacePlaceholder}
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && matches.length) {
                  e.preventDefault()
                  replaceAll()
                }
              }}
            />
            <Button size="sm" variant="secondary" disabled={!find.trim() || !matches.length} onClick={replaceAll}>
              {w.replaceAll(matches.length)}
            </Button>
          </div>
        )}
        {problemCount > 0 && (
          // The column is narrow: the buttons go under the text, not beside it
          <Alert tone="warning">
            {w.problems(problemCount)}
            <span className="mc-row mc-gap-4" style={{ marginTop: 8 }}>
              <Button size="sm" variant="secondary" onClick={fixTimes}>
                {w.fix}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => jump(firstProblem)}>
                {w.showProblem}
              </Button>
            </span>
          </Alert>
        )}
      </div>

      <div ref={bodyRef} style={{ ...bodyStyle, padding: '4px 12px 16px' }}>
        <div className="mc-stack mc-gap-8">
          {words.map((item, index) => {
            const active = activeIndex === index
            const filler = ai.fillerWords && isFiller(item.word)
            const keyword = !!item.keyword && ai.keywords
            const issues = problems[index]
            const parts = item.word.trim().split(/\s+/).filter(Boolean).length
            return (
              <div
                key={index}
                data-word={index}
                className={cx(
                  'mc-card',
                  'mc-card--pad-none',
                  active ? 'mc-card--leaf' : 'mc-card--dew',
                  active && 'mc-card--selected',
                  matchSet.has(index) && 'mc-word--match',
                )}
                aria-current={active || undefined}
                onClick={(e) => {
                  if (!TYPING(e.target as Element)) onSeek(item.start + offsetS)
                }}
                style={{ padding: '10px 10px 10px 12px', borderRadius: 'var(--r-md)', cursor: 'pointer' }}
              >
                <div className="mc-row mc-gap-4">
                  <input
                    type="text"
                    className="mc-input mc-input--sm mc-grow"
                    aria-label={m.wordAria(index + 1)}
                    aria-invalid={issues?.includes('empty') || undefined}
                    value={item.word}
                    onChange={(e) => edit(index, { word: e.target.value }, `word-${index}`)}
                    style={{
                      padding: '0 12px',
                      fontWeight: active || item.keyword ? 600 : 400,
                      color: filler ? 'var(--text-subtle)' : keyword ? 'var(--moss)' : undefined,
                      textDecoration: filler ? 'line-through' : undefined,
                    }}
                  />
                  {filler && (
                    <Badge tone="quiet" size="sm" title={m.fillerTitle}>
                      {m.fillerBadge}
                    </Badge>
                  )}
                  <IconButton
                    size="sm"
                    variant={item.keyword ? 'ink' : 'surface'}
                    tooltip="end"
                    label={item.keyword ? m.keywordOn : m.keywordOff}
                    aria-pressed={!!item.keyword}
                    icon={<Star size={16} fill={item.keyword ? 'currentColor' : 'none'} />}
                    onClick={(e) => {
                      e.stopPropagation()
                      edit(index, { keyword: !item.keyword })
                    }}
                  />
                  <IconButton
                    size="sm"
                    tooltip="end"
                    label={m.deleteWord}
                    icon={<Trash2 size={16} />}
                    onClick={(e) => {
                      e.stopPropagation()
                      setWords(words.filter((_, i) => i !== index))
                    }}
                  />
                </div>
                <div className="mc-row mc-gap-4" style={{ marginTop: 8 }}>
                  <TimeInput label={m.wordStart(index + 1)} value={item.start} invalid={!!issues?.some((p) => p !== 'empty')} onCommit={(v) => edit(index, { start: v }, `start-${index}`)} />
                  <span className="mc-caption mc-muted" aria-hidden="true">
                    –
                  </span>
                  <TimeInput label={m.wordEnd(index + 1)} value={item.end} invalid={!!issues?.includes('short')} onCommit={(v) => edit(index, { end: v }, `end-${index}`)} />
                  <input
                    type="text"
                    className="mc-input mc-input--sm"
                    value={item.emoji || ''}
                    placeholder={m.emojiPlaceholder}
                    aria-label={m.emojiAria(index + 1)}
                    title={m.emojiTitle}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      const v = Array.from(e.target.value.trim()).slice(-2).join('')
                      edit(index, { emoji: v || null }, `emoji-${index}`)
                    }}
                    style={{ width: 64, padding: '0 8px', textAlign: 'center' }}
                  />
                  <span className="mc-grow" />
                  {/* The menu's own clicks must not seek the video */}
                  <span onClick={(e) => e.stopPropagation()}>
                    <Dropdown
                      align="right"
                      width={250}
                      trigger={<MoreHorizontal size={16} />}
                      triggerLabel={w.more(index + 1)}
                      triggerClassName={iconButtonClass({ size: 'sm', tooltip: false })}
                      items={[
                        {
                          id: 'insert',
                          label: m.insertWord,
                          icon: Plus,
                          onClick: () => {
                            const next = [...words]
                            next.splice(index + 1, 0, { word: m.insertedWordText, start: item.end, end: item.end + 0.5 })
                            setWords(next)
                          },
                        },
                        {
                          id: 'split',
                          label: canSplit(item) ? w.split(parts) : w.splitHint,
                          icon: Split,
                          disabled: !canSplit(item),
                          onClick: () => setWords(splitWord(words, index)),
                        },
                        ...(index < words.length - 1
                          ? [{ id: 'merge', label: w.merge(words[index + 1].word.trim()), icon: Merge, onClick: () => setWords(mergeWithNext(words, index)) }]
                          : []),
                      ]}
                    />
                  </span>
                </div>
                {issues && (
                  <p className="mc-row mc-gap-4 mc-caption" style={{ marginTop: 8, color: 'var(--text-muted)' }}>
                    <TriangleAlert size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
                    {issues.map((p) => w.problem[p]).join(' · ')}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

/** Seconds input (2 decimals) committed on every valid value. */
function TimeInput({ value, onCommit, label, invalid }: { value: number; onCommit: (v: number) => void; label: string; invalid?: boolean }) {
  const [text, setText] = useState(value.toFixed(2))
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setText(Number(value).toFixed(2))
  }, [value])
  return (
    <input
      type="number"
      className="mc-input mc-input--sm mc-input--mono"
      aria-label={label}
      aria-invalid={invalid || undefined}
      step={0.05}
      min={0}
      value={text}
      onClick={(e) => e.stopPropagation()}
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false
        setText(Number(value).toFixed(2))
      }}
      onChange={(e) => {
        setText(e.target.value)
        const n = parseFloat(e.target.value)
        if (isFinite(n) && n >= 0) onCommit(Math.round(n * 1000) / 1000)
      }}
      style={{ width: 80, padding: '0 8px 0 12px' }}
    />
  )
}
