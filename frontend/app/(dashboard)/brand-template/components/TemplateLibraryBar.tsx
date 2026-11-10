'use client'

import React from 'react'
import { Copy, MoreHorizontal, Pencil, Plus, Star, Trash2 } from 'lucide-react'
import type { Agent, BrandTemplate } from '@/lib/engine'
import { Button, Card, Dropdown, iconButtonClass } from '@/components/ui'

interface TemplateLibraryBarProps {
  templates: BrandTemplate[]
  selected: BrandTemplate | null
  activeAgent: Agent | null
  settingDefault: boolean
  onSelect: (id: string) => void
  onCreate: () => void
  onDuplicate: () => void
  onRename: () => void
  onDelete: () => void
  onMakeDefault: () => void
}

function usageText(t: BrandTemplate): string {
  const agents = t.used_by_agents || []
  const parts: string[] = []
  if (agents.length) parts.push(`Default ${agents.map((a) => a.name).join(', ')}`)
  parts.push(`${t.clip_count ?? 0} clip`)
  return parts.join(' · ')
}

/** Template library: pick, create, duplicate, rename, delete; make it the active agent's default. */
export const TemplateLibraryBar: React.FC<TemplateLibraryBarProps> = ({
  templates,
  selected,
  activeAgent,
  settingDefault,
  onSelect,
  onCreate,
  onDuplicate,
  onRename,
  onDelete,
  onMakeDefault,
}) => {
  const isAgentDefault = !!(activeAgent && selected && activeAgent.default_brand_template_id === selected.id)
  const onlyOne = templates.length <= 1

  return (
    <section className="mc-stack mc-gap-12" aria-labelledby="brand-template-library-title">
      <div className="mc-row mc-row--between">
        <h2 id="brand-template-library-title" className="mc-h3">
          Template <span className="mc-mono mc-muted">{templates.length}</span>
        </h2>
        <Button variant="accent" size="sm" onClick={onCreate} icon={<Plus size={16} aria-hidden="true" />}>
          Baru
        </Button>
      </div>

      <ul className="mc-stack mc-gap-8" style={{ listStyle: 'none' }}>
        {templates.map((t) => {
          const isSelected = t.id === selected?.id
          const text = (
            <>
              <p className="mc-label mc-truncate" title={t.name}>
                {t.name}
              </p>
              <p className="mc-caption mc-muted" style={{ marginTop: 2 }}>
                {usageText(t)}
              </p>
            </>
          )

          if (!isSelected) {
            return (
              <li key={t.id}>
                <Card padding="sm" onClick={() => onSelect(t.id)}>
                  {text}
                </Card>
              </li>
            )
          }

          return (
            <li key={t.id}>
              <Card padding="sm" selected aria-current="true">
                <div className="mc-row mc-row--top mc-gap-8">
                  <div className="mc-grow">{text}</div>
                  <Dropdown
                    align="right"
                    width={240}
                    triggerLabel="Aksi template"
                    triggerClassName={iconButtonClass({ variant: 'ghost', size: 'sm', tooltip: false })}
                    trigger={<MoreHorizontal size={16} aria-hidden="true" />}
                    items={[
                      { id: 'duplicate', label: 'Duplikat', icon: Copy, onClick: onDuplicate },
                      { id: 'rename', label: 'Ganti nama', icon: Pencil, onClick: onRename },
                      {
                        id: 'delete',
                        label: onlyOne ? 'Hapus (minimal 1 template)' : 'Hapus template',
                        icon: Trash2,
                        danger: true,
                        disabled: onlyOne,
                        onClick: onlyOne ? undefined : onDelete,
                      },
                    ]}
                  />
                </div>

                {activeAgent && (
                  <div style={{ marginTop: 'var(--s-3)' }}>
                    {isAgentDefault ? (
                      <p className="mc-row mc-gap-8 mc-caption mc-moss">
                        <Star size={14} aria-hidden="true" />
                        <span className="mc-truncate">Default {activeAgent.name}</span>
                      </p>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        block
                        onClick={onMakeDefault}
                        loading={settingDefault}
                        icon={<Star size={16} aria-hidden="true" />}
                      >
                        <span className="mc-truncate">Jadikan default {activeAgent.name}</span>
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export default TemplateLibraryBar
