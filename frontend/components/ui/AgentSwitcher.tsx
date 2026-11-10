'use client'

import React, { useCallback, useRef, useState } from 'react'
import Link from 'next/link'
import { Check, ChevronDown, Users } from 'lucide-react'
import { useAgent } from '@/contexts/AgentContext'
import { useDismiss } from '@/hooks/useDismiss'
import { Avatar } from './Avatar'

/** Active workspace as a pill in the top bar, with a popover to switch or manage workspaces. */
export function AgentSwitcher() {
  const { activeAgent, agents, setActiveAgent, isAgentLoading } = useAgent()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(root, open, close)

  const name = activeAgent ? activeAgent.name : isAgentLoading ? 'Memuat workspace…' : 'Pilih workspace'

  return (
    <div ref={root} className="mc-popover-anchor">
      <button
        type="button"
        className="mc-pillgroup__item"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Workspace aktif: ${name}. Ganti workspace`}
        onClick={() => setOpen((v) => !v)}
        style={{ paddingLeft: activeAgent ? 6 : 16 }}
      >
        {activeAgent && <Avatar name={activeAgent.name} seed={activeAgent.id} size={28} />}
        <span className="mc-truncate" style={{ maxWidth: 200 }}>
          {name}
        </span>
        <ChevronDown size={16} aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform var(--dur-base) var(--ease-out)' }} />
      </button>

      {open && (
        <div role="menu" className="mc-popover mc-popover--end" style={{ width: 280 }}>
          <div className="mc-menu-label">Workspace</div>
          {agents.length > 0 ? (
            agents.map((agent) => {
              const selected = activeAgent?.id === agent.id
              return (
                <button
                  key={agent.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  className="mc-menu-item"
                  onClick={() => {
                    setActiveAgent(agent)
                    close()
                  }}
                >
                  <Avatar name={agent.name} seed={agent.id} size={28} />
                  <span className="mc-grow mc-truncate">{agent.name}</span>
                  {selected && <Check size={16} aria-hidden="true" />}
                </button>
              )
            })
          ) : (
            <div className="mc-menu-label">Belum ada workspace. Buat satu untuk mulai.</div>
          )}
          <div className="mc-menu-sep" role="separator" />
          <Link href="/agents/" role="menuitem" className="mc-menu-item" onClick={close}>
            <Users size={16} aria-hidden="true" />
            Kelola workspace
          </Link>
        </div>
      )}
    </div>
  )
}

export default AgentSwitcher
