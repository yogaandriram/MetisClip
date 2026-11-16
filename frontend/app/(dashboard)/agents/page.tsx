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
import { useT } from '@/lib/i18n/I18nProvider'

export default function AgentsPage() {
  const { agents, refreshAgents, activeAgent, setActiveAgent, isAgentLoading } = useAgent()
  const { epoch } = useEngine()
  const t = useT()
  const m = t.workspace.page
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
      toast.success(m.created(agent.name))
      setIsCreating(false)
      const list = await refreshAgents()
      const fresh = list.find((a) => a.id === agent.id)
      if (fresh && (!activeAgent || agents.length === 0)) setActiveAgent(fresh)
    } catch (err) {
      toast.error(errorMessage(err, m.createFailed))
    }
  }

  const update = async (value: AgentFormValue) => {
    if (!editing) return
    try {
      await api.agents.update(editing.id, toAgentInput(value))
      toast.success(m.updated)
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
      toast.success(m.deleted)
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
  const templateName = (agent: Agent) => (templates.find((tpl) => tpl.id === agent.default_brand_template_id) || (agent.default_brand_template_id ? null : templates[0]))?.name

  return (
    <>
      <PageHeader
        title={m.title}
        subtitle={m.subtitle}
        actions={
          <Button variant={isCreating ? 'secondary' : 'accent'} icon={isCreating ? <X size={16} /> : <Plus size={16} />} onClick={() => setIsCreating(!isCreating)}>
            {isCreating ? t.common.cancel : m.createNew}
          </Button>
        }
      />

      <div className="mc-stack mc-gap-32">
        {isCreating && (
          <Card style={{ maxWidth: 760 }}>
            <CardHeader title={m.newTitle} icon={<Users size={18} />} />
            <AgentForm submitLabel={m.saveNew} onSubmit={create} onCancel={() => setIsCreating(false)} />
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
              title={m.emptyTitle}
              description={m.emptyDescription}
              action={
                <Button variant="primary" icon={<Plus size={16} />} onClick={() => setIsCreating(true)}>
                  {m.create}
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
                          <p className="mc-muted mc-truncate">{agent.niche || m.noNiche}</p>
                        </div>
                      </div>
                      {isActive && (
                        <Badge tone="accent" size="sm" icon={<Check size={14} aria-hidden="true" />}>
                          {m.active}
                        </Badge>
                      )}
                    </div>
                    <div className="mc-row mc-row--wrap mc-gap-8">
                      <Tag>{durationLabel(agent.default_duration)}</Tag>
                      {template && <Tag>{m.templateTag(template)}</Tag>}
                    </div>
                    <p className="mc-caption mc-subtle">{m.createdOn(formatDate(agent.created_at))}</p>
                  </div>

                  <div className="mc-row mc-gap-8">
                    <Button
                      variant={isActive ? 'primary' : 'secondary'}
                      size="sm"
                      className="mc-grow"
                      disabled={isActive}
                      onClick={() => {
                        setActiveAgent(agent)
                        toast.success(m.switched(agent.name))
                      }}
                    >
                      {isActive ? m.current : m.choose}
                    </Button>
                    <IconButton label={m.edit} icon={<Pencil size={16} />} variant="outline" size="sm" onClick={() => setEditing(agent)} />
                    <IconButton
                      label={m.delete}
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

      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title={m.editTitle} size="md">
        {editing && (
          <AgentForm
            key={editing.id}
            submitLabel={m.saveChanges}
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
        title={t.workspace.deleteModal.title(toDelete?.name || '')}
        message={t.workspace.deleteModal.message}
        confirmLabel={t.workspace.deleteModal.confirm}
        confirmIcon={<Trash2 size={16} />}
        danger
        loading={deleting}
        onConfirm={remove}
        onClose={() => setToDelete(null)}
      >
        <label className="mc-row mc-row--top mc-gap-12" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={deleteFiles} onChange={(e) => setDeleteFiles(e.target.checked)} style={{ marginTop: 1 }} />
          <span>
            {t.workspace.deleteModal.deleteFiles}
            <span className="mc-caption mc-muted" style={{ display: 'block', marginTop: 2 }}>
              {t.workspace.deleteModal.deleteFilesHint}
            </span>
          </span>
        </label>
      </ConfirmModal>
    </>
  )
}
