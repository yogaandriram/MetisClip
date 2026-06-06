'use client'

import React, { useState, useRef, useEffect } from 'react'
import { ChevronDown, Plus, Bot, Settings } from 'lucide-react'
import { useAgent } from '@/contexts/AgentContext'

export function AgentSwitcher() {
  const { activeAgent, agents } = useAgent()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={dropdownRef} style={{ position: 'relative', marginBottom: '40px' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: '12px 16px',
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid var(--border-glass)',
          borderRadius: '12px',
          color: '#fff',
          cursor: 'pointer',
          transition: 'var(--transition-fast)'
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            background: 'linear-gradient(135deg, var(--primary), var(--accent))',
            width: '28px',
            height: '28px',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 10px var(--primary-glow)'
          }}>
            <Bot size={14} color="#fff" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Super Agent
            </span>
            <span style={{ fontSize: '14px', fontWeight: 600 }}>
              {activeAgent ? activeAgent.name : 'Pilih Agent'}
            </span>
          </div>
        </div>
        <ChevronDown size={16} color="var(--text-muted)" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: '0.2s' }} />
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: '8px',
          background: 'rgba(15, 15, 20, 0.95)',
          backdropFilter: 'blur(20px)',
          border: '1px solid var(--border-glass)',
          borderRadius: '12px',
          padding: '8px',
          zIndex: 100,
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
        }}>
          {agents.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
              {agents.map(agent => (
                <button
                  key={agent.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: activeAgent?.id === agent.id ? 'rgba(255,255,255,0.05)' : 'transparent',
                    border: 'none',
                    color: '#fff',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: '13px'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                  onMouseLeave={(e) => {
                    if (activeAgent?.id !== agent.id) {
                      e.currentTarget.style.background = 'transparent'
                    } else {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                    }
                  }}
                >
                  <Bot size={14} color="var(--text-muted)" />
                  {agent.name}
                </button>
              ))}
            </div>
          ) : (
            <div style={{ padding: '12px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
              Belum ada agent
            </div>
          )}
          
          <div style={{ height: '1px', background: 'var(--border-glass)', margin: '4px 0 8px 0' }} />
          
          <a
            href="/agents"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '10px',
              borderRadius: '8px',
              background: 'rgba(113, 59, 237, 0.1)',
              color: 'var(--primary)',
              textDecoration: 'none',
              fontSize: '13px',
              fontWeight: 600
            }}
          >
            <Settings size={14} />
            Kelola Super Agents
          </a>
        </div>
      )}
    </div>
  )
}
