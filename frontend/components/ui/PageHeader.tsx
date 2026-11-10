'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowLeft, Plus } from 'lucide-react'
import { useShell } from '@/components/shell/ShellContext'
import { normalizePath } from '@/components/shell/NavRail'
import { AgentSwitcher } from './AgentSwitcher'
import { IconLink } from './IconButton'

interface PageHeaderProps {
  title: React.ReactNode
  subtitle?: React.ReactNode
  /** Page-specific actions, placed before the global controls */
  actions?: React.ReactNode
  /** Back button before the title */
  back?: { href: string; label: string }
  /** Agent switcher, "+ Klip baru" and the jobs pill (default true inside the shell) */
  showGlobal?: boolean
}

/**
 * The top bar of every screen (DESIGN.md §5.2): title and subtitle on the left,
 * page actions and the global pills on the right.
 */
export function PageHeader({ title, subtitle, actions, back, showGlobal = true }: PageHeaderProps) {
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
            <Link href="/jobs/" className="mc-status-pill">
              <span className="mc-spinner mc-spinner--sm" aria-hidden="true" />
              <span>
                <span className="mc-mono">{shell.activeJobs}</span> proses berjalan
              </span>
            </Link>
          )}
          {global && (
            <div className="mc-pillgroup">
              <AgentSwitcher />
              {pathname !== '/discover' && (
                <Link href="/discover/" className="mc-pillgroup__item mc-pillgroup__item--soft">
                  <Plus size={16} aria-hidden="true" />
                  Klip baru
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </header>
  )
}

export default PageHeader
