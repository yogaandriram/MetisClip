'use client'

import React from 'react'
import { Copy, MoreHorizontal, Pencil, Plus, Sparkles, Star, Trash2, Wand2 } from 'lucide-react'
import type { BrandTemplate, Campaign } from '@/lib/engine'
import { Badge, Button, Card, Dropdown, Spinner, buttonClass, iconButtonClass } from '@/components/ui'
import type { Messages } from '@/lib/i18n'
import { useT } from '@/lib/i18n/I18nProvider'

interface TemplateLibraryBarProps {
  campaign: Campaign
  templates: BrandTemplate[]
  selected: BrandTemplate | null
  settingDefault: boolean
  creatingAi: boolean
  onSelect: (id: string) => void
  onCreate: () => void
  onCreateAi: () => void
  onDuplicate: () => void
  onRename: () => void
  onRedesign: () => void
  onDelete: () => void
  onMakeDefault: () => void
}

/** The template a campaign's clips use: its default, else its oldest template. */
export function campaignTemplateId(campaign: Campaign, templates: BrandTemplate[]): string | null {
  if (campaign.brand_template_id && templates.some((tpl) => tpl.id === campaign.brand_template_id)) return campaign.brand_template_id
  return templates.find((tpl) => tpl.campaign_id === campaign.id)?.id ?? null
}

function metaText(tpl: BrandTemplate, t: Messages): string {
  const parts: string[] = []
  if (tpl.design?.status === 'running') parts.push(t.brand.library.aiRunning)
  else if (tpl.design?.status === 'done') parts.push(t.brand.library.aiMade)
  parts.push(t.brand.library.clipCount(tpl.clip_count ?? 0))
  return parts.join(' · ')
}

/** The active campaign's templates: pick, create (by hand or with the AI), duplicate, rename, delete; make one the default. */
export const TemplateLibraryBar: React.FC<TemplateLibraryBarProps> = ({
  campaign,
  templates,
  selected,
  settingDefault,
  creatingAi,
  onSelect,
  onCreate,
  onCreateAi,
  onDuplicate,
  onRename,
  onRedesign,
  onDelete,
  onMakeDefault,
}) => {
  const t = useT()
  const defaultId = campaignTemplateId(campaign, templates)
  const onlyOne = templates.length <= 1

  return (
    <section className="mc-stack mc-gap-12" aria-labelledby="brand-template-library-title">
      <div className="mc-row mc-row--between">
        <h2 id="brand-template-library-title" className="mc-h3">
          {t.brand.library.heading} <span className="mc-mono mc-muted">{templates.length}</span>
        </h2>
        <Dropdown
          align="right"
          width={240}
          triggerLabel={t.brand.library.createMenu}
          triggerClassName={buttonClass({ variant: 'accent', size: 'sm' })}
          trigger={
            <>
              {creatingAi ? <Spinner size="sm" /> : <Plus size={16} aria-hidden="true" />}
              <span>{t.brand.library.create}</span>
            </>
          }
          items={[
            { id: 'ai', label: t.brand.library.createAi, icon: Sparkles, onClick: onCreateAi, disabled: creatingAi },
            { id: 'blank', label: t.brand.library.createBlank, icon: Plus, onClick: onCreate },
          ]}
        />
      </div>

      <ul className="mc-stack mc-gap-8" style={{ listStyle: 'none' }}>
        {templates.map((tpl) => {
          const isSelected = tpl.id === selected?.id
          const isDefault = tpl.id === defaultId
          const text = (
            <>
              <div className="mc-row mc-gap-8">
                <p className="mc-label mc-truncate mc-grow" title={tpl.name}>
                  {tpl.name}
                </p>
                {isDefault && (
                  <Badge tone="accent" size="sm">
                    {t.brand.library.isDefault}
                  </Badge>
                )}
              </div>
              <p className="mc-caption mc-muted mc-row mc-gap-8" style={{ marginTop: 2 }}>
                {tpl.design?.status === 'running' && <Spinner size="sm" />}
                <span className="mc-truncate">{metaText(tpl, t)}</span>
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
                  <div className="mc-grow" style={{ minWidth: 0 }}>
                    {text}
                  </div>
                  <Dropdown
                    align="right"
                    width={260}
                    triggerLabel={t.brand.library.actions}
                    triggerClassName={iconButtonClass({ variant: 'ghost', size: 'sm', tooltip: false })}
                    trigger={<MoreHorizontal size={16} aria-hidden="true" />}
                    items={[
                      {
                        id: 'redesign',
                        label: t.brand.library.redesign,
                        icon: Wand2,
                        disabled: tpl.design?.status === 'running',
                        onClick: onRedesign,
                      },
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

                <div style={{ marginTop: 'var(--s-3)' }}>
                  {isDefault ? (
                    <p className="mc-row mc-gap-8 mc-caption mc-moss">
                      <Star size={14} aria-hidden="true" />
                      <span className="mc-truncate">{t.brand.library.defaultFor(campaign.name)}</span>
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
                      {t.brand.library.makeDefault}
                    </Button>
                  )}
                </div>
              </Card>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export default TemplateLibraryBar
