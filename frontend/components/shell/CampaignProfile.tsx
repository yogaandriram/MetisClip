'use client'

import React, { useCallback, useRef, useState } from 'react'
import Link from 'next/link'
import { Check, ChevronRight, Megaphone, Plus } from 'lucide-react'
import { useCampaign } from '@/contexts/CampaignContext'
import { useEngine } from '@/contexts/EngineContext'
import { useDismiss } from '@/hooks/useDismiss'
import { Avatar } from '@/components/ui/Avatar'
import { LogoMark } from '@/components/ui/Logo'
import { campaignHref, isBriefEmpty, shownClient } from '@/lib/brief'
import { cx } from '@/lib/cx'
import { useT } from '@/lib/i18n/I18nProvider'

/** Opens the create dialog on the campaign library (campaigns/page.tsx reads `?new=1`). */
export const NEW_CAMPAIGN_HREF = '/campaigns/?new=1'

/**
 * The active campaign as a profile circle at the top of the shell, where the logo was (DESIGN.md §5.2).
 * Its menu shows the active campaign, switches to another one and leads to the campaign library.
 * Without a campaign (first load, empty library) the circle shows the MetisClip mark.
 */
export function CampaignProfile({ pathname }: { pathname: string }) {
  const { activeCampaign, activeCampaigns, setActiveCampaign, isCampaignLoading } = useCampaign()
  const { systemInfo } = useEngine()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(root, open, close)

  const t = useT()
  const m = t.shell.campaignMenu
  const onCampaigns = pathname === '/campaigns' || pathname.startsWith('/campaigns/')
  const others = activeCampaigns.filter((c) => c.id !== activeCampaign?.id)
  const version = typeof window !== 'undefined' && window.metis ? window.metis.appVersion : systemInfo?.version
  const label = activeCampaign ? m.button(activeCampaign.name) : isCampaignLoading ? m.loading : m.buttonEmpty
  const meta = activeCampaign
    ? [shownClient(activeCampaign), isBriefEmpty(activeCampaign.brief) ? m.plain : m.briefed].filter(Boolean).join(' · ')
    : ''

  return (
    <div ref={root} className="mc-profile">
      <button
        type="button"
        className={cx('mc-profile__button', 'mc-tip', 'mc-tip--right', onCampaigns && 'is-current')}
        data-tip={activeCampaign ? activeCampaign.name : label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
      >
        {activeCampaign ? (
          <Avatar name={activeCampaign.name} seed={activeCampaign.id} size={52} />
        ) : (
          <LogoMark size={26} />
        )}
      </button>

      {open && (
        <div role="menu" aria-label={m.label} className="mc-popover mc-profile__menu">
          {activeCampaign ? (
            <Link href={campaignHref(activeCampaign.id)} role="menuitem" className="mc-profile__current" onClick={close}>
              <Avatar name={activeCampaign.name} seed={activeCampaign.id} size={44} />
              <span className="mc-profile__who">
                <span className="mc-menu-label mc-profile__kicker">{m.active}</span>
                <span className="mc-profile__name mc-truncate">{activeCampaign.name}</span>
                {meta && <span className="mc-caption mc-muted mc-truncate">{meta}</span>}
              </span>
              <ChevronRight size={16} aria-hidden="true" />
            </Link>
          ) : (
            <div className="mc-menu-label">{isCampaignLoading ? m.loading : m.empty}</div>
          )}

          {others.length > 0 && (
            <>
              <div className="mc-menu-sep" role="separator" />
              <div className="mc-menu-label">{m.switchTo}</div>
              {others.map((campaign) => (
                <button
                  key={campaign.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={false}
                  className="mc-menu-item"
                  onClick={() => {
                    setActiveCampaign(campaign.id)
                    close()
                  }}
                >
                  <Avatar name={campaign.name} seed={campaign.id} size={28} />
                  <span className="mc-grow mc-truncate">{campaign.name}</span>
                </button>
              ))}
            </>
          )}

          <div className="mc-menu-sep" role="separator" />
          <Link href={NEW_CAMPAIGN_HREF} role="menuitem" className="mc-menu-item" onClick={close}>
            <Plus size={16} aria-hidden="true" />
            {m.create}
          </Link>
          <Link
            href="/campaigns/"
            role="menuitem"
            aria-current={pathname === '/campaigns' ? 'page' : undefined}
            className="mc-menu-item"
            onClick={close}
          >
            <Megaphone size={16} aria-hidden="true" />
            <span className="mc-grow">{m.manage}</span>
            {pathname === '/campaigns' && <Check size={16} aria-hidden="true" />}
          </Link>

          <div className="mc-menu-sep" role="separator" />
          <div className="mc-profile__brand">
            <span className="mc-profile__brand-mark" aria-hidden="true">
              <LogoMark size={12} />
            </span>
            MetisClip{version ? ` v${version}` : ''}
          </div>
        </div>
      )}
    </div>
  )
}

export default CampaignProfile
