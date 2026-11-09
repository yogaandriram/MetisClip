'use client'

import React, { useEffect, useRef, useState } from 'react'
import { CheckCircle2, XCircle, KeyRound } from 'lucide-react'
import toast from 'react-hot-toast'
import { api, type SecretName } from '@/lib/engine'
import { errorMessage } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { InputField } from '@/components/ui/InputField'

interface SecretFieldProps {
  name: SecretName
  label: string
  description?: React.ReactNode
  /** Whether a value is stored in the engine's secret store */
  configured: boolean
  /** Controlled input value: a new key being typed, or the stored key while it is shown */
  value: string
  onChange: (value: string) => void
  /** Called after a successful save/remove with the new configured state */
  onConfiguredChange: (configured: boolean) => void
  /** Called before "Tes" (e.g. to persist related settings such as the LLM base URL) */
  beforeTest?: () => Promise<void>
  allowRemove?: boolean
}

/** API key input. The stored key stays hidden until the user clicks the eye icon. */
export function SecretField({ name, label, description, configured, value, onChange, onConfiguredChange, beforeTest, allowRemove = true }: SecretFieldProps) {
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [visible, setVisible] = useState(false)
  // The stored key fetched for the eye icon (null while hidden)
  const [revealed, setRevealed] = useState<string | null>(null)
  const [revealing, setRevealing] = useState(false)

  // Leaving the field (provider switch, page change) drops a shown key from the parent's form state
  const live = useRef({ value, revealed, onChange })
  live.current = { value, revealed, onChange }
  useEffect(
    () => () => {
      const l = live.current
      if (l.revealed !== null && l.value === l.revealed) l.onChange('')
    },
    [],
  )

  const hide = () => {
    setVisible(false)
    if (revealed !== null && value === revealed) onChange('')
    setRevealed(null)
  }

  const toggleVisible = async () => {
    if (revealing) return
    if (visible) return hide()
    if (configured && !value.trim()) {
      setRevealing(true)
      try {
        const { value: stored } = await api.secrets.reveal(name)
        setRevealed(stored)
        onChange(stored)
      } catch (err) {
        toast.error(errorMessage(err))
        return
      } finally {
        setRevealing(false)
      }
    }
    setVisible(true)
  }

  const reset = () => {
    setVisible(false)
    setRevealed(null)
    onChange('')
  }

  const save = async () => {
    if (!value.trim()) return
    setSaving(true)
    try {
      await api.secrets.set(name, value.trim())
      reset()
      onConfiguredChange(true)
      setResult(null)
      toast.success(`${label} disimpan`)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const test = async () => {
    setTesting(true)
    setResult(null)
    try {
      if (beforeTest) await beforeTest()
      setResult(await api.secrets.test(name, value.trim() || undefined))
    } catch (err) {
      setResult({ ok: false, message: errorMessage(err) })
    } finally {
      setTesting(false)
    }
  }

  const remove = async () => {
    setRemoving(true)
    try {
      await api.secrets.remove(name)
      reset()
      onConfiguredChange(false)
      setResult(null)
      toast.success(`${label} dihapus`)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-dim)' }}>{label}</span>
        {configured ? (
          <Badge variant="accent" glow={false}>
            Tersimpan
          </Badge>
        ) : (
          <Badge variant="muted" glow={false}>
            Belum diisi
          </Badge>
        )}
      </div>
      {description && <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, marginTop: '-4px' }}>{description}</p>}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch' }}>
        <InputField
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={configured ? '•••••••• (klik ikon mata untuk melihat, atau isi untuk mengganti)' : 'Tempel API key di sini'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          icon={<KeyRound size={16} />}
          containerStyle={{ flex: 1 }}
          className={visible ? 'mc-mono' : undefined}
          revealed={visible}
          onRevealToggle={toggleVisible}
        />
        <Button type="button" variant="secondary" size="sm" onClick={test} loading={testing} disabled={!configured && !value.trim()}>
          Tes
        </Button>
        <Button type="button" variant="primary" size="sm" onClick={save} loading={saving} disabled={!value.trim() || value.trim() === revealed}>
          Simpan
        </Button>
        {allowRemove && configured && (
          <Button type="button" variant="danger" size="sm" onClick={remove} loading={removing}>
            Hapus
          </Button>
        )}
      </div>
      {result && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13px', color: result.ok ? 'var(--accent)' : 'var(--danger)' }}>
          {result.ok ? <CheckCircle2 size={16} style={{ flexShrink: 0 }} /> : <XCircle size={16} style={{ flexShrink: 0 }} />}
          <span style={{ wordBreak: 'break-word' }}>{result.message || (result.ok ? 'Berhasil' : 'Gagal')}</span>
        </div>
      )}
    </div>
  )
}

export default SecretField
