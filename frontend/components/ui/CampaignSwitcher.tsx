'use client'

import React, { useCallback, useRef, useState } from 'react'
import Link from 'next/link'
import { Check, ChevronDown, Megaphone } from 'lucide-react'
import { useCampaign } from '@/contexts/CampaignContext'
import { useDismiss } from '@/hooks/useDismiss'
import { Avatar } from './Avatar'
import { useT } from '@/lib/i18n/I18nProvider'

/** The active campaign as a pill in the top bar, with a popover to switch or manage campaigns. */
export function CampaignSwitcher() {
  const { activeCampaign, activeCampaigns, setActiveCampaign, isCampaignLoading } = useCampaign()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(root, open, close)

  const t = useT()
  const m = t.ui.campaignSwitcher
  const name = activeCampaign ? activeCampaign.name : isCampaignLoading ? m.loading : m.choose

  return (
    <div ref={root} className="mc-popover-anchor">
      <button
        type="button"
        className="mc-pillgroup__item"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={m.active(name)}
        onClick={() => setOpen((v) => !v)}
        style={{ paddingLeft: activeCampaign ? 6 : 16 }}
      >
        {activeCampaign && <Avatar name={activeCampaign.name} seed={activeCampaign.id} size={28} />}
        <span className="mc-truncate" style={{ maxWidth: 200 }}>
          {name}
        </span>
        <ChevronDown size={16} aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform var(--dur-base) var(--ease-out)' }} />
      </button>

      {open && (
        <div role="menu" className="mc-popover mc-popover--end" style={{ width: 280 }}>
          <div className="mc-menu-label">{m.heading}</div>
          {activeCampaigns.length > 0 ? (
            activeCampaigns.map((campaign) => {
              const selected = activeCampaign?.id === campaign.id
              return (
                <button
                  key={campaign.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  className="mc-menu-item"
                  onClick={() => {
                    setActiveCampaign(campaign.id)
                    close()
                  }}
                >
                  <Avatar name={campaign.name} seed={campaign.id} size={28} />
                  <span className="mc-grow mc-truncate">{campaign.name}</span>
                  {selected && <Check size={16} aria-hidden="true" />}
                </button>
              )
            })
          ) : (
            <div className="mc-menu-label">{m.empty}</div>
          )}
          <div className="mc-menu-sep" role="separator" />
          <Link href="/campaigns/" role="menuitem" className="mc-menu-item" onClick={close}>
            <Megaphone size={16} aria-hidden="true" />
            {m.manage}
          </Link>
        </div>
      )}
    </div>
  )
}

export default CampaignSwitcher
