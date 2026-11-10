'use client'

import React, { useEffect, useState } from 'react'
import { HexAlphaColorPicker } from 'react-colorful'
import { useFloating, useClick, useInteractions, useDismiss, offset, flip, shift } from '@floating-ui/react'

interface ColorPickerProps {
  color: string
  onChange: (color: string) => void
  label?: string
}

// These are subtitle (video content) colors, not UI colors, so they are not limited to the UI palette.
const DEFAULT_SWATCHES = ['#FFFFFF', '#000000', '#FFD700', '#00FFCC', '#FF00FF', '#FF3366', '#33CCFF', '#00FF66']
const STORAGE_KEY = 'aiautoclip_recent_colors'

function readRecent(): string[] {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    const list = saved ? JSON.parse(saved) : null
    return Array.isArray(list) ? list.filter((c) => typeof c === 'string') : DEFAULT_SWATCHES
  } catch {
    return DEFAULT_SWATCHES
  }
}

/** Swatch button that opens a color popover. Used for caption colors (content). */
export function ColorPicker({ color, onChange, label }: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [recent, setRecent] = useState<string[]>(DEFAULT_SWATCHES)

  useEffect(() => setRecent(readRecent()), [])

  useEffect(() => {
    if (isOpen || !color || recent.includes(color)) return
    const next = [color, ...recent].slice(0, 16)
    setRecent(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* recent colors are a convenience only */
    }
  }, [isOpen, color, recent])

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement: 'bottom-end',
    middleware: [offset(8), flip(), shift({ padding: 8 })],
  })
  const { getReferenceProps, getFloatingProps } = useInteractions([useClick(context), useDismiss(context)])

  return (
    <div className="mc-row mc-row--between" style={{ width: '100%' }}>
      {label && <span className="mc-label">{label}</span>}
      <button
        type="button"
        ref={refs.setReference}
        {...getReferenceProps()}
        aria-label={label ? `${label}: ${color}` : `Warna ${color}`}
        className="mc-tip mc-tip--end"
        data-tip={color}
        style={{
          width: 36,
          height: 36,
          marginLeft: 'auto',
          borderRadius: 'var(--r-full)',
          border: 0,
          background: color,
          boxShadow: 'inset 0 0 0 1px var(--line-input), 0 0 0 3px var(--surface)',
          cursor: 'pointer',
        }}
      />
      {isOpen && (
        <div ref={refs.setFloating} className="mc-popover" style={{ ...floatingStyles, padding: 12, maxHeight: 'none', overflow: 'visible' }} {...getFloatingProps()}>
          <HexAlphaColorPicker color={color} onChange={onChange} />
          <input
            type="text"
            className="mc-input mc-input--sm mc-input--mono"
            value={color}
            aria-label="Kode warna"
            onChange={(e) => onChange(e.target.value)}
            style={{ marginTop: 12 }}
          />
          <div className="mc-caption mc-muted" style={{ margin: '12px 0 8px' }}>
            Terakhir dipakai
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 20px)', gap: 6 }}>
            {recent.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Pakai ${c}`}
                onClick={() => onChange(c)}
                style={{
                  width: 20,
                  height: 20,
                  padding: 0,
                  border: 0,
                  borderRadius: 'var(--r-full)',
                  background: c,
                  cursor: 'pointer',
                  boxShadow: c === color ? '0 0 0 2px var(--surface), 0 0 0 4px var(--ink)' : 'inset 0 0 0 1px var(--line-input)',
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default ColorPicker
