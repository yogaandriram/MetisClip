'use client'

import React from 'react'
import { Copy, MoreHorizontal, Pencil, Plus, Star, Trash2 } from 'lucide-react'
import type { BrandTemplate, Campaign } from '@/lib/engine'
import { Button, Card, Dropdown, iconButtonClass } from '@/components/ui'
import type { Messages } from '@/lib/i18n'
import { useT } from '@/lib/i18n/I18nProvider'

interface TemplateLibraryBarProps {
  templates: BrandTemplate[]
  selected: BrandTemplate | null
  activeCampaign: Campaign | null
  settingDefault: boolean
  onSelect: (id: string) => void
  onCreate: () => void
  onDuplicate: () => void
  onRename: () => void
  onDelete: () => void
  onMakeDefault: () => void
}

function usageText(tpl: BrandTemplate, t: Messages): string {
  const campaigns = tpl.used_by_campaigns || []
  const parts: string[] = []
  if (tpl.is_default) parts.push(t.brand.library.isDefault)
  if (campaigns.length) parts.push(t.brand.library.usedBy(campaigns.map((c) => c.name).join(', ')))
  parts.push(t.brand.library.clipCount(tpl.clip_count ?? 0))
  return parts.join(' · ')
}

/** The template a campaign's clips use: its own, else the default template. */
export function campaignTemplateId(campaign: Campaign, templates: BrandTemplate[]): string | null {
  if (campaign.brand_template_id && templates.some((tpl) => tpl.id === campaign.brand_template_id)) return campaign.brand_template_id
  return templates.find((tpl) => tpl.is_default)?.id ?? null
}

/** Template library: pick, create, duplicate, rename, delete; use it for the active campaign. */
export const TemplateLibraryBar: React.FC<TemplateLibraryBarProps> = ({
  templates,
  selected,
  activeCampaign,
  settingDefault,
  onSelect,
  onCreate,
  onDuplicate,
  onRename,
  onDelete,
  onMakeDefault,
}) => {
  const t = useT()
  const usedByActive = !!(activeCampaign && selected && campaignTemplateId(activeCampaign, templates) === selected.id)
  const onlyOne = templates.length <= 1

  return (
    <section className="mc-stack mc-gap-12" aria-labelledby="brand-template-library-title">
      <div className="mc-row mc-row--between">
        <h2 id="brand-template-library-title" className="mc-h3">
          {t.brand.library.heading} <span className="mc-mono mc-muted">{templates.length}</span>
        </h2>
        <Button variant="accent" size="sm" onClick={onCreate} icon={<Plus size={16} aria-hidden="true" />}>
          {t.brand.library.create}
        </Button>
      </div>

      <ul className="mc-stack mc-gap-8" style={{ listStyle: 'none' }}>
        {templates.map((tpl) => {
          const isSelected = tpl.id === selected?.id
          const text = (
            <>
              <p className="mc-label mc-truncate" title={tpl.name}>
                {tpl.name}
              </p>
              <p className="mc-caption mc-muted" style={{ marginTop: 2 }}>
                {usageText(tpl, t)}
              </p>
            </>
          )

          if (!isSelected) {
            return (
              <li key={tpl.id}>
                <Card padding="sm" onClick={() => onSelect(tpl.id)}>
                  {text}
                </Card>
              </li>
            )
          }

          return (
            <li key={tpl.id}>
              <Card padding="sm" selected aria-current="true">
                <div className="mc-row mc-row--top mc-gap-8">
                  <div className="mc-grow">{text}</div>
                  <Dropdown
                    align="right"
                    width={240}
                    triggerLabel={t.brand.library.actions}
                    triggerClassName={iconButtonClass({ variant: 'ghost', size: 'sm', tooltip: false })}
                    trigger={<MoreHorizontal size={16} aria-hidden="true" />}
                    items={[
                      { id: 'duplicate', label: t.common.duplicate, icon: Copy, onClick: onDuplicate },
                      { id: 'rename', label: t.common.rename, icon: Pencil, onClick: onRename },
                      {
                        id: 'delete',
                        label: onlyOne ? t.brand.library.deleteLast : t.brand.library.delete,
                        icon: Trash2,
                        danger: true,
                        disabled: onlyOne,
                        onClick: onlyOne ? undefined : onDelete,
                      },
                    ]}
                  />
                </div>

                {activeCampaign && (
                  <div style={{ marginTop: 'var(--s-3)' }}>
                    {usedByActive ? (
                      <p className="mc-row mc-gap-8 mc-caption mc-moss">
                        <Star size={14} aria-hidden="true" />
                        <span className="mc-truncate">{t.brand.library.usedFor(activeCampaign.name)}</span>
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
                        <span className="mc-truncate">{t.brand.library.useFor(activeCampaign.name)}</span>
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
