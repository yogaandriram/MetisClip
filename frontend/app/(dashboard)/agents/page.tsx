'use client'

import React, { useState } from 'react'
import { Plus, Bot, Trash2, Edit2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAgent } from '@/contexts/AgentContext'
import { GlassCard } from '@/components/ui/GlassCard'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { Modal } from '@/components/ui/Modal'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { AgentForm, toAgentInput, type AgentFormValue } from '@/components/agents/AgentForm'
import { api, type Agent } from '@/lib/engine'
import { CLIP_DURATION_OPTIONS, errorMessage, formatDate } from '@/lib/format'

export default function AgentsPage() {
  const { agents, refreshAgents, activeAgent, setActiveAgent, isAgentLoading } = useAgent()
  const [isCreating, setIsCreating] = useState(false)
  const [editing, setEditing] = useState<Agent | null>(null)
  const [toDelete, setToDelete] = useState<Agent | null>(null)
  const [deleteFiles, setDeleteFiles] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const create = async (value: AgentFormValue) => {
    try {
      const { agent } = await api.agents.create(toAgentInput(value))
      toast.success(`Super Agent "${agent.name}" dibuat`)
      setIsCreating(false)
      const list = await refreshAgents()
      const fresh = list.find((a) => a.id === agent.id)
      if (fresh && (!activeAgent || agents.length === 0)) setActiveAgent(fresh)
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal membuat agent'))
    }
  }

  const update = async (value: AgentFormValue) => {
    if (!editing) return
    try {
      await api.agents.update(editing.id, toAgentInput(value))
      toast.success('Agent diperbarui')
      setEditing(null)
      await refreshAgents()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const remove = async () => {
    if (!toDelete) return
    setDeleting(true)
    try {
      await api.agents.remove(toDelete.id, deleteFiles)
      toast.success('Super Agent dihapus')
      if (activeAgent?.id === toDelete.id) setActiveAgent(null)
      setToDelete(null)
      await refreshAgents()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setDeleting(false)
    }
  }

  const durationLabel = (v: string) => CLIP_DURATION_OPTIONS.find((o) => o.value === v)?.label.split(' (')[0] || v

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto' }}>
      <PageHeader
        title="Super Agent"
        subtitle="Setiap agent adalah profil kerja terpisah (niche, keyword, brand template, dan clip sendiri)."
        actions={
          <Button variant={isCreating ? 'secondary' : 'primary'} icon={isCreating ? <X size={16} /> : <Plus size={16} />} onClick={() => setIsCreating(!isCreating)}>
            {isCreating ? 'Batal' : 'Buat agent baru'}
          </Button>
        }
      />

      {isCreating && (
        <GlassCard glow hoverEffect={false} padding="28px" style={{ marginBottom: '32px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Bot size={20} color="var(--primary)" /> Konfigurasi agent baru
          </h3>
          <AgentForm submitLabel="Simpan agent" onSubmit={create} onCancel={() => setIsCreating(false)} />
        </GlassCard>
      )}

      {isAgentLoading && agents.length === 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} height={200} />
          ))}
        </div>
      ) : agents.length === 0 ? (
        !isCreating && (
          <EmptyState
            icon={Bot}
            title="Belum ada Super Agent"
            description="Buat agent pertama Anda untuk mulai mencari video dan menghasilkan clip."
            action={
              <Button size="sm" icon={<Plus size={14} />} onClick={() => setIsCreating(true)}>
                Buat agent
              </Button>
            }
          />
        )
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
          {agents.map((agent) => {
            const isActive = activeAgent?.id === agent.id
            return (
              <GlassCard key={agent.id} hoverEffect={false} padding="24px" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <div
                      style={{
                        background: 'rgba(24, 86, 255, 0.1)',
                        width: '40px',
                        height: '40px',
                        borderRadius: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--primary)',
                        border: '1px solid rgba(24, 86, 255, 0.25)',
                      }}
                    >
                      <Bot size={20} />
                    </div>
                    {isActive && (
                      <Badge variant="primary" glow>
                        Aktif
                      </Badge>
                    )}
                  </div>
                  <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '6px' }}>{agent.name}</h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px', lineHeight: 1.5 }}>{agent.niche || 'Tanpa deskripsi niche'}</p>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <Badge variant="muted" glow={false}>
                      {durationLabel(agent.default_duration)}
                    </Badge>
                    {agent.default_keywords && (
                      <Badge variant="muted" glow={false}>
                        {agent.default_keywords.length > 28 ? `${agent.default_keywords.slice(0, 28)}…` : agent.default_keywords}
                      </Badge>
                    )}
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '12px' }}>Dibuat {formatDate(agent.created_at)}</p>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
                  <Button
                    variant={isActive ? 'primary' : 'secondary'}
                    size="sm"
                    style={{ flex: 1, justifyContent: 'center' }}
                    disabled={isActive}
                    onClick={() => {
                      setActiveAgent(agent)
                      toast.success(`Beralih ke ${agent.name}`)
                    }}
                  >
                    {isActive ? 'Sedang aktif' : 'Pilih agent'}
                  </Button>
                  <button className="mc-icon-button" title="Ubah agent" onClick={() => setEditing(agent)}>
                    <Edit2 size={15} />
                  </button>
                  <button
                    className="mc-icon-button"
                    title="Hapus agent"
                    style={{ color: 'var(--danger)' }}
                    onClick={() => {
                      setDeleteFiles(false)
                      setToDelete(agent)
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </GlassCard>
            )
          })}
        </div>
      )}

      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title="Ubah Super Agent">
        {editing && (
          <AgentForm
            key={editing.id}
            submitLabel="Simpan perubahan"
            initial={{
              name: editing.name,
              niche: editing.niche || '',
              default_duration: editing.default_duration || '45-60',
              default_keywords: editing.default_keywords || '',
              default_video_type: editing.default_video_types?.[0] || 'podcast',
            }}
            onSubmit={update}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>

      <ConfirmModal
        isOpen={!!toDelete}
        title={`Hapus "${toDelete?.name || ''}"?`}
        message="Agent beserta job, clip, dan brand template-nya akan dihapus dari database. Tindakan ini tidak bisa dibatalkan."
        confirmLabel="Hapus agent"
        danger
        loading={deleting}
        onConfirm={remove}
        onClose={() => setToDelete(null)}
      >
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '14px', cursor: 'pointer', lineHeight: 1.5 }}>
          <input type="checkbox" checked={deleteFiles} onChange={(e) => setDeleteFiles(e.target.checked)} style={{ marginTop: '3px', accentColor: 'var(--danger)' }} />
          <span>
            Hapus juga file video agent ini dari folder data
            <br />
            <small style={{ color: 'var(--text-muted)' }}>Jika tidak dicentang, file video tetap ada di folder library.</small>
          </span>
        </label>
      </ConfirmModal>
    </div>
  )
}
