'use client'

import React from 'react'
import { Check, ChevronDown, Copy, Layers, MoreHorizontal, Pencil, Plus, Star, Trash2 } from 'lucide-react'
import type { Agent, BrandTemplate } from '@/lib/engine'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Dropdown } from '@/components/ui/Dropdown'

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
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
      <Dropdown
        width="340px"
        trigger={
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              minWidth: '260px',
              maxWidth: '420px',
              padding: '9px 14px',
              borderRadius: '10px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--border-glass)',
            }}
            title="Pilih brand template"
          >
            <Layers size={16} color="var(--primary)" />
            <span style={{ flex: 1, fontSize: '14px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selected?.name || 'Pilih template'}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{templates.length} template</span>
            <ChevronDown size={14} color="var(--text-muted)" />
          </div>
        }
        items={templates.map((t) => ({
          id: t.id,
          label: (
            <span style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '230px' }}>{t.name}</span>
                {t.id === selected?.id && <Check size={14} color="var(--accent)" />}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{usageText(t)}</span>
            </span>
          ),
          onClick: () => onSelect(t.id),
        }))}
      />

      <Button variant="secondary" size="sm" onClick={onCreate} icon={<Plus size={14} />}>
        Baru
      </Button>

      <Dropdown
        width="200px"
        trigger={
          <button className="mc-icon-button" title="Aksi template" disabled={!selected}>
            <MoreHorizontal size={16} />
          </button>
        }
        items={[
          { id: 'duplicate', label: 'Duplikat', icon: Copy, onClick: onDuplicate },
          { id: 'rename', label: 'Ganti nama', icon: Pencil, onClick: onRename },
          {
            id: 'delete',
            label: onlyOne ? 'Hapus (minimal 1 template)' : 'Hapus',
            icon: Trash2,
            danger: !onlyOne,
            onClick: onlyOne ? undefined : onDelete,
          },
        ]}
      />

      {selected && (
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{usageText(selected)}</span>
      )}

      {activeAgent && selected && (
        <div style={{ marginLeft: 'auto' }}>
          {isAgentDefault ? (
            <Badge variant="accent" glow={false}>
              <Star size={12} style={{ marginRight: '4px', verticalAlign: '-1px' }} />
              Default {activeAgent.name}
            </Badge>
          ) : (
            <Button variant="secondary" size="sm" onClick={onMakeDefault} loading={settingDefault} icon={<Star size={14} />}>
              Jadikan default {activeAgent.name}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

export default TemplateLibraryBar
