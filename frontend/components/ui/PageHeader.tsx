'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowLeft, CircleHelp, Plus } from 'lucide-react'
import { useShell } from '@/components/shell/ShellContext'
import { normalizePath } from '@/components/shell/NavRail'
import { IconLink } from './IconButton'
import { useT } from '@/lib/i18n/I18nProvider'
import { QUEUE_HREF } from '@/lib/routes'

interface PageHeaderProps {
  title: React.ReactNode
  subtitle?: React.ReactNode
  /** Page-specific actions, placed before the global controls */
  actions?: React.ReactNode
  /** Back button before the title */
  back?: { href: string; label: string }
  /** "+ Klip baru", the jobs pill and Bantuan (default true inside the shell); the campaign is the profile circle */
  showGlobal?: boolean
}

/**
 * The top bar of every screen (DESIGN.md §5.2): title and subtitle on the left,
 * page actions and the global pills on the right.
 */
export function PageHeader({ title, subtitle, actions, back, showGlobal = true }: PageHeaderProps) {
  const t = useT()
  const shell = useShell()
  const pathname = normalizePath(usePathname())
  const global = showGlobal && shell

  return (
    <header className="mc-topbar">
      <div className="mc-topbar__lead">
        {back && <IconLink href={back.href} label={back.label} icon={<ArrowLeft size={18} />} tooltip="bottom" />}
        <div style={{ minWidth: 0 }}>
          <h1 className="mc-topbar__title">{title}</h1>
          {subtitle && <div className="mc-topbar__subtitle">{subtitle}</div>}
        </div>
      </div>
      {(actions || global) && (
        <div className="mc-topbar__actions">
          {actions}
          {global && shell.activeJobs > 0 && (
            <Link href={QUEUE_HREF} className="mc-status-pill">
              <span className="mc-spinner mc-spinner--sm" aria-hidden="true" />
              <span>
                <span className="mc-mono">{shell.activeJobs}</span> {t.ui.runningJobs(shell.activeJobs)}
              </span>
            </Link>
          )}
          {global && pathname !== '/discover' && (
            <div className="mc-pillgroup">
              <Link href="/discover/" className="mc-pillgroup__item mc-pillgroup__item--soft">
                <Plus size={16} aria-hidden="true" />
                {t.ui.newClip}
              </Link>
            </div>
          )}
          {global && pathname !== '/help' && <IconLink href="/help/" label={t.help.open} icon={<CircleHelp size={18} />} tooltip="bottom" />}
        </div>
      )}
    </header>
  )
}

export default PageHeader
