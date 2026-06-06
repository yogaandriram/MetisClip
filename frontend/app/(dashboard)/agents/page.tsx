'use client'

import React, { useState } from 'react'
import { Plus, Bot, Trash2, Edit2 } from 'lucide-react'
import { useAgent } from '@/contexts/AgentContext'
import { GlassCard } from '@/components/ui/GlassCard'
import { Button } from '@/components/ui/Button'
import { InputField } from '@/components/ui/InputField'
import { SelectField } from '@/components/ui/SelectField'
import { Badge } from '@/components/ui/Badge'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import toast from 'react-hot-toast'

export default function AgentsPage() {
  const { agents, refreshAgents, activeAgent, setActiveAgent } = useAgent()
  const supabase = createClientComponentClient()
  
  const [isCreating, setIsCreating] = useState(false)
  const [loading, setLoading] = useState(false)
  const [newAgent, setNewAgent] = useState({ name: '', niche: '', defaultDuration: '45-60', defaultKeywords: '' })

  const handleCreateAgent = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Tidak ada sesi user aktif")

      const { data, error } = await supabase
        .from('super_agents')
        .insert([
          {
            user_id: user.id,
            name: newAgent.name,
            niche: newAgent.niche,
            default_duration: newAgent.defaultDuration,
            default_keywords: newAgent.defaultKeywords
          }
        ])
        .select()
        .single()

      if (error) throw error

      toast.success('Super Agent berhasil dibuat!')
      setIsCreating(false)
      setNewAgent({ name: '', niche: '', defaultDuration: '45-60', defaultKeywords: '' })
      refreshAgents()
      
      // Automatically switch to the newly created agent if it's the first one
      if (agents.length === 0 && data) {
        setActiveAgent(data)
      }
    } catch (error: any) {
      toast.error(`Gagal membuat agent: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteAgent = async (agentId: string) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus Super Agent ini secara permanen? Semua data yang terhubung akan hilang.')) return

    try {
      const { error } = await supabase
        .from('super_agents')
        .delete()
        .eq('id', agentId)

      if (error) throw error
      
      toast.success('Super Agent berhasil dihapus')
      if (activeAgent?.id === agentId) {
        setActiveAgent(null)
      }
      refreshAgents()
    } catch (error: any) {
      toast.error(`Gagal menghapus agent: ${error.message}`)
    }
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: '800', marginBottom: '8px' }}>Manajemen Super Agent</h1>
          <p style={{ color: 'var(--text-muted)' }}>Kelola berbagai profil (niche) yang masing-masing beroperasi secara independen.</p>
        </div>
        <Button 
          variant="primary" 
          icon={<Plus size={18} />}
          onClick={() => setIsCreating(!isCreating)}
        >
          {isCreating ? 'Batal' : 'Buat Agent Baru'}
        </Button>
      </div>

      {isCreating && (
        <GlassCard glow style={{ marginBottom: '40px', padding: '30px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Bot size={20} color="var(--primary)" /> Konfigurasi Agent Baru
          </h3>
          <form onSubmit={handleCreateAgent} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <InputField
                label="Nama Agent"
                placeholder="Misal: AI Tech Bot"
                value={newAgent.name}
                onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })}
                required
              />
              <InputField
                label="Fokus Niche"
                placeholder="Misal: Berita AI, Motivasi Bisnis"
                value={newAgent.niche}
                onChange={(e) => setNewAgent({ ...newAgent, niche: e.target.value })}
              />
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <SelectField
                label="Default Durasi (Detik)"
                value={newAgent.defaultDuration}
                onChange={(e) => setNewAgent({ ...newAgent, defaultDuration: e.target.value })}
                options={[
                  { value: '30-45', label: '30 - 45 Detik' },
                  { value: '45-60', label: '45 - 60 Detik (Disarankan)' },
                  { value: '60-75', label: '60 - 75 Detik' }
                ]}
              />
              <InputField
                label="Default Keyword Pencarian"
                placeholder="Misal: AI startup, ChatGPT tips"
                value={newAgent.defaultKeywords}
                onChange={(e) => setNewAgent({ ...newAgent, defaultKeywords: e.target.value })}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
              <Button type="submit" variant="primary" loading={loading}>
                Simpan Agent
              </Button>
            </div>
          </form>
        </GlassCard>
      )}

      {/* Agents List */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
        {agents.map((agent) => (
          <GlassCard key={agent.id} style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{
                  background: 'rgba(113, 59, 237, 0.1)',
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--primary)',
                  border: '1px solid rgba(113, 59, 237, 0.2)'
                }}>
                  <Bot size={20} />
                </div>
                {activeAgent?.id === agent.id && (
                  <Badge variant="primary" glow={true}>
                    Aktif
                  </Badge>
                )}
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '6px' }}>{agent.name}</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.5 }}>
                {agent.niche || 'Tidak ada deskripsi niche'}
              </p>
            </div>
            
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <Button
                variant={activeAgent?.id === agent.id ? "primary" : "secondary"}
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => {
                  setActiveAgent(agent)
                  toast.success(`Beralih ke ${agent.name}`)
                }}
              >
                Pilih Agent
              </Button>
              <Button
                variant="danger"
                style={{ padding: '0 15px' }}
                onClick={() => handleDeleteAgent(agent.id)}
              >
                <Trash2 size={16} />
              </Button>
            </div>
          </GlassCard>
        ))}
      </div>
      
      {agents.length === 0 && !isCreating && (
        <div style={{ textAlign: 'center', padding: '60px 20px', border: '1px dashed var(--border-glass)', borderRadius: '16px' }}>
          <Bot size={48} color="var(--text-muted)" style={{ marginBottom: '16px', opacity: 0.5 }} />
          <h3 style={{ fontSize: '18px', color: 'var(--text-primary)', marginBottom: '8px' }}>Belum Ada Super Agent</h3>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Buat agen pertama Anda untuk mulai mengatur jadwal dan mengunggah video.</p>
        </div>
      )}
    </div>
  )
}
