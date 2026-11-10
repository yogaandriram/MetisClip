'use client'

import React, { useEffect, useId, useRef, useState } from 'react'
import { AlertTriangle, Check, KeyRound, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { api, type SecretName } from '@/lib/engine'
import { errorMessage } from '@/lib/format'
import { Badge, Button, ConfirmModal, InputField } from '@/components/ui'

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
  const inputId = useId()
  const descriptionId = `${inputId}-description`
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
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
      setConfirmRemove(false)
    }
  }

  return (
    <div className="mc-stack mc-gap-8">
      <div className="mc-row mc-row--between">
        <label htmlFor={inputId} className="mc-label">
          {label}
        </label>
        {configured ? (
          <Badge tone="success" size="sm" icon={<Check size={14} aria-hidden="true" />}>
            Tersimpan
          </Badge>
        ) : (
          <Badge tone="quiet" size="sm">
            Belum diisi
          </Badge>
        )}
      </div>
      {description && (
        <p id={descriptionId} className="mc-caption mc-muted">
          {description}
        </p>
      )}
      <div className="mc-row mc-gap-8">
        <InputField
          id={inputId}
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={configured ? '•••••••• (klik ikon mata untuk melihat, atau isi untuk mengganti)' : 'Tempel API key di sini'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          icon={<KeyRound size={18} aria-hidden="true" />}
          containerClassName="mc-grow"
          mono={visible}
          revealed={visible}
          onRevealToggle={toggleVisible}
          aria-describedby={description ? descriptionId : undefined}
        />
        <Button type="button" variant="secondary" size="sm" onClick={test} loading={testing} disabled={!configured && !value.trim()}>
          Tes
        </Button>
        <Button type="button" variant="primary" size="sm" onClick={save} loading={saving} disabled={!value.trim() || value.trim() === revealed}>
          Simpan
        </Button>
        {allowRemove && configured && (
          <Button type="button" variant="danger" size="sm" icon={<Trash2 size={16} aria-hidden="true" />} onClick={() => setConfirmRemove(true)} disabled={removing}>
            Hapus key
          </Button>
        )}
      </div>
      {result && (
        <div className="mc-row mc-row--top mc-gap-8" role="status">
          <Badge
            tone={result.ok ? 'success' : 'error'}
            size="sm"
            icon={result.ok ? <Check size={14} aria-hidden="true" /> : <AlertTriangle size={14} aria-hidden="true" />}
          >
            {result.ok ? 'Berhasil' : 'Gagal'}
          </Badge>
          {result.message && (
            <span className="mc-caption" style={{ paddingTop: 4, overflowWrap: 'anywhere' }}>
              {result.message}
            </span>
          )}
        </div>
      )}
      <ConfirmModal
        isOpen={confirmRemove}
        danger
        title={`Hapus ${label}?`}
        message="Key dihapus dari Windows Credential Manager. Fitur yang memakainya berhenti bekerja sampai Anda mengisi key baru."
        confirmLabel="Hapus key"
        confirmIcon={<Trash2 size={16} aria-hidden="true" />}
        loading={removing}
        onConfirm={remove}
        onClose={() => setConfirmRemove(false)}
      />
    </div>
  )
}

export default SecretField
