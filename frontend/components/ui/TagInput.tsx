'use client'

import React, { useId, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { cx } from '@/lib/cx'
import { useT } from '@/lib/i18n/I18nProvider'
import { Field } from './Field'

interface TagInputProps {
  value: string[]
  onChange: (value: string[]) => void
  label?: React.ReactNode
  hint?: React.ReactNode
  error?: React.ReactNode
  placeholder?: string
  /** Cleans one typed item, e.g. adds "#" to a hashtag; return '' to drop it */
  normalize?: (item: string) => string
  /** Also split typed or pasted text at commas (always at new lines and on Enter) */
  splitOnComma?: boolean
  maxItems?: number
  maxLength?: number
  disabled?: boolean
  className?: string
  style?: React.CSSProperties
  id?: string
}

const tidy = (item: string) => item.split(/\s+/).filter(Boolean).join(' ')

/**
 * A list of short texts edited as tags: type and press Enter (or a comma) to add, Backspace on an
 * empty field removes the last one, pasting several lines adds them all. Duplicates are ignored
 * (case-insensitive). Text still being typed is added when the field loses focus.
 */
export function TagInput({
  value,
  onChange,
  label,
  hint,
  error,
  placeholder,
  normalize,
  splitOnComma = true,
  maxItems = 40,
  maxLength = 300,
  disabled,
  className,
  style,
  id,
}: TagInputProps) {
  const t = useT()
  const autoId = useId()
  const inputId = id || autoId
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState('')

  const add = (raw: string[]) => {
    const seen = new Set(value.map((v) => v.toLowerCase()))
    const next = [...value]
    for (const piece of raw) {
      const cleaned = tidy(piece).slice(0, maxLength)
      const item = normalize ? normalize(cleaned) : cleaned
      if (!item || seen.has(item.toLowerCase()) || next.length >= maxItems) continue
      seen.add(item.toLowerCase())
      next.push(item)
    }
    if (next.length !== value.length) onChange(next)
  }

  const split = (text: string) => text.split(splitOnComma ? /[\n,;]+/ : /\n+/)

  const commit = () => {
    if (!draft.trim()) return
    add(split(draft))
    setDraft('')
  }

  const remove = (index: number) => {
    onChange(value.filter((_, i) => i !== index))
    inputRef.current?.focus()
  }

  const full = value.length >= maxItems

  return (
    <Field label={label} hint={hint} error={error} htmlFor={inputId} className={className} style={style}>
      <div
        className={cx('mc-tags', disabled && 'mc-tags--disabled', error && 'mc-tags--invalid')}
        onMouseDown={(e) => {
          // A click on the empty area of the box focuses the text field
          if (e.target === e.currentTarget) {
            e.preventDefault()
            inputRef.current?.focus()
          }
        }}
      >
        {value.map((item, i) => (
          <span key={`${item}-${i}`} className="mc-tags__item">
            <span className="mc-tags__text" title={item}>
              {item}
            </span>
            {!disabled && (
              <button type="button" className="mc-tags__remove" aria-label={t.ui.tags.remove(item)} onClick={() => remove(i)}>
                <X size={12} aria-hidden="true" />
              </button>
            )}
          </span>
        ))}
        <input
          ref={inputRef}
          id={inputId}
          className={value.length && !full ? 'mc-tags__input mc-tags__input--after' : 'mc-tags__input'}
          value={draft}
          disabled={disabled || full}
          placeholder={full ? t.ui.tags.full(maxItems) : value.length ? '' : placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          maxLength={maxLength}
          onChange={(e) => {
            const text = e.target.value
            if (splitOnComma && /[,;]/.test(text)) {
              add(split(text).slice(0, -1))
              setDraft(split(text).slice(-1)[0] || '')
            } else {
              setDraft(text)
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            } else if (e.key === 'Backspace' && !draft && value.length) {
              e.preventDefault()
              onChange(value.slice(0, -1))
            }
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text')
            if (!(splitOnComma ? /[\n,;]/ : /\n/).test(text)) return
            e.preventDefault()
            add(split(draft + text))
            setDraft('')
          }}
          onBlur={commit}
        />
      </div>
    </Field>
  )
}

export default TagInput
