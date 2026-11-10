'use client'

import React, { useEffect, useState } from 'react'
import { Check, Pencil, Plus, Trash2, Users, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAgent } from '@/contexts/AgentContext'
import { useEngine } from '@/contexts/EngineContext'
import { Avatar, Badge, Button, Card, CardHeader, ConfirmModal, EmptyState, IconButton, Modal, PageHeader, Skeleton, Tag } from '@/components/ui'
import { AgentForm, toAgentInput, type AgentFormValue } from '@/components/agents/AgentForm'
import { api, type Agent, type BrandTemplate } from '@/lib/engine'
import { CLIP_DURATION_OPTIONS, errorMessage, formatDate } from '@/lib/format'

export default function AgentsPage() {
  const { agents, refreshAgents, activeAgent, setActiveAgent, isAgentLoading } = useAgent()
  const { epoch } = useEngine()
  const [isCreating, setIsCreating] = useState(false)
  const [editing, setEditing] = useState<Agent | null>(null)
  const [toDelete, setToDelete] = useState<Agent | null>(null)
  const [deleteFiles, setDeleteFiles] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [templates, setTemplates] = useState<BrandTemplate[]>([])

  // Only for showing each agent's default template name on its card
  useEffect(() => {
    let cancelled = false
    api.brandTemplates
      .list()
      .then(({ brand_templates }) => {
        if (!cancelled) setTemplates(brand_templates)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [epoch])

  const create = async (value: AgentFormValue) => {
    try {
      const { agent } = await api.agents.create(toAgentInput(value))
      toast.success(`Workspace "${agent.name}" dibuat`)
      setIsCreating(false)
      const list = await refreshAgents()
      const fresh = list.find((a) => a.id === agent.id)
      if (fresh && (!activeAgent || agents.length === 0)) setActiveAgent(fresh)
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal membuat workspace'))
    }
  }

  const update = async (value: AgentFormValue) => {
    if (!editing) return
    try {
      await api.agents.update(editing.id, toAgentInput(value))
      toast.success('Workspace diperbarui')
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
      toast.success('Workspace dihapus')
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
  // Agents without a default use the oldest template, which the list returns first
  const templateName = (agent: Agent) => (templates.find((t) => t.id === agent.default_brand_template_id) || (agent.default_brand_template_id ? null : templates[0]))?.name

  return (
    <>
      <PageHeader
        title="Workspace"
        subtitle="Setiap workspace adalah ruang kerja terpisah dengan niche, brand template, dan clip sendiri."
        actions={
          <Button variant={isCreating ? 'secondary' : 'accent'} icon={isCreating ? <X size={16} /> : <Plus size={16} />} onClick={() => setIsCreating(!isCreating)}>
            {isCreating ? 'Batal' : 'Buat workspace baru'}
          </Button>
        }
      />

      <div className="mc-stack mc-gap-32">
        {isCreating && (
          <Card style={{ maxWidth: 760 }}>
            <CardHeader title="Workspace baru" icon={<Users size={18} />} />
            <AgentForm submitLabel="Simpan workspace" onSubmit={create} onCancel={() => setIsCreating(false)} />
          </Card>
        )}

        {isAgentLoading && agents.length === 0 ? (
          <div className="mc-grid">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="mc-col-4" height={232} radius="lg" />
            ))}
          </div>
        ) : agents.length === 0 ? (
          !isCreating && (
            <EmptyState
              icon={Users}
              title="Belum ada workspace"
              description="Buat workspace pertama Anda untuk mulai mencari video dan menghasilkan clip."
              action={
                <Button variant="primary" icon={<Plus size={16} />} onClick={() => setIsCreating(true)}>
                  Buat workspace
                </Button>
              }
            />
          )
        ) : (
          <div className="mc-grid">
            {agents.map((agent) => {
              const isActive = activeAgent?.id === agent.id
              const template = templateName(agent)
              return (
                <Card key={agent.id} as="article" selected={isActive} className="mc-col-4 mc-stack mc-gap-16" style={{ justifyContent: 'space-between' }}>
                  <div className="mc-stack mc-gap-16">
                    <div className="mc-row mc-row--between mc-row--top">
                      <div className="mc-row mc-gap-12 mc-grow">
                        <Avatar name={agent.name} seed={agent.id} size={44} />
                        <div className="mc-grow">
                          <h2 className="mc-h3 mc-truncate">{agent.name}</h2>
                          <p className="mc-muted mc-truncate">{agent.niche || 'Tanpa deskripsi niche'}</p>
                        </div>
                      </div>
                      {isActive && (
                        <Badge tone="accent" size="sm" icon={<Check size={14} aria-hidden="true" />}>
                          Aktif
                        </Badge>
                      )}
                    </div>
                    <div className="mc-row mc-row--wrap mc-gap-8">
                      <Tag>{durationLabel(agent.default_duration)}</Tag>
                      {template && <Tag>Template: {template}</Tag>}
                    </div>
                    <p className="mc-caption mc-subtle">Dibuat {formatDate(agent.created_at)}</p>
                  </div>

                  <div className="mc-row mc-gap-8">
                    <Button
                      variant={isActive ? 'primary' : 'secondary'}
                      size="sm"
                      className="mc-grow"
                      disabled={isActive}
                      onClick={() => {
                        setActiveAgent(agent)
                        toast.success(`Beralih ke ${agent.name}`)
                      }}
                    >
                      {isActive ? 'Sedang aktif' : 'Pilih workspace'}
                    </Button>
                    <IconButton label="Ubah workspace" icon={<Pencil size={16} />} variant="outline" size="sm" onClick={() => setEditing(agent)} />
                    <IconButton
                      label="Hapus workspace"
                      icon={<Trash2 size={16} />}
                      variant="outline"
                      size="sm"
                      tooltip="end"
                      onClick={() => {
                        setDeleteFiles(false)
                        setToDelete(agent)
                      }}
                    />
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title="Ubah workspace" size="md">
        {editing && (
          <AgentForm
            key={editing.id}
            submitLabel="Simpan perubahan"
            initial={{
              name: editing.name,
              niche: editing.niche || '',
              default_duration: editing.default_duration || '45-60',
              default_brand_template_id: editing.default_brand_template_id || '',
            }}
            onSubmit={update}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>

      <ConfirmModal
        isOpen={!!toDelete}
        title={`Hapus "${toDelete?.name || ''}"?`}
        message="Workspace beserta job dan clip-nya akan dihapus dari database. Brand template tetap tersimpan di library. Tindakan ini tidak bisa dibatalkan."
        confirmLabel="Hapus workspace"
        confirmIcon={<Trash2 size={16} />}
        danger
        loading={deleting}
        onConfirm={remove}
        onClose={() => setToDelete(null)}
      >
        <label className="mc-row mc-row--top mc-gap-12" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={deleteFiles} onChange={(e) => setDeleteFiles(e.target.checked)} style={{ marginTop: 1 }} />
          <span>
            Hapus juga file video workspace ini dari folder data
            <span className="mc-caption mc-muted" style={{ display: 'block', marginTop: 2 }}>
              Jika tidak dicentang, file video tetap ada di folder library.
            </span>
          </span>
        </label>
      </ConfirmModal>
    </>
  )
}
