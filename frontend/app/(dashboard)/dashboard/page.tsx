'use client'

import React, { useState, useEffect } from 'react'
import { Download, Youtube, Instagram, Share2, Activity, Play, CheckCircle, AlertCircle, Eye } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { Badge } from '@/components/ui/Badge'
import { useAgent } from '@/contexts/AgentContext'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export default function DashboardOverview() {
  const { activeAgent } = useAgent()
  const supabase = createClientComponentClient()

  // Social Connections State
  const [youtubeAccount, setYoutubeAccount] = useState<string | null>(null)
  const [tiktokAccount, setTiktokAccount] = useState<string | null>(null)
  const [instagramAccount, setInstagramAccount] = useState<string | null>(null)

  // Stats State
  const [stats, setStats] = useState({
    videosProcessed: 0,
    clipsGenerated: 0,
    potentialViews: 0
  })
  const [isLoadingStats, setIsLoadingStats] = useState(false)

  useEffect(() => {
    if (activeAgent) {
      checkSocialConnections(activeAgent.id)
      fetchStats(activeAgent.id)
    } else {
      setYoutubeAccount(null)
      setTiktokAccount(null)
      setInstagramAccount(null)
      setStats({ videosProcessed: 0, clipsGenerated: 0, potentialViews: 0 })
    }
  }, [activeAgent])

  const checkSocialConnections = async (agentId: string) => {
    try {
      const { data: connections, error } = await supabase
        .from('agent_social_connections')
        .select('*')
        .eq('agent_id', agentId)

      if (error) {
        console.error("Gagal mengecek status sosial", error)
        return
      }

      const yt = connections?.find(c => c.platform.toLowerCase() === 'youtube')
      setYoutubeAccount(yt ? (yt.platform_account_name || yt.platform_account_id) : null)

      const tt = connections?.find(c => c.platform.toLowerCase() === 'tiktok')
      setTiktokAccount(tt ? (tt.platform_account_name || tt.platform_account_id) : null)

      const ig = connections?.find(c => c.platform.toLowerCase() === 'instagram')
      setInstagramAccount(ig ? (ig.platform_account_name || ig.platform_account_id) : null)

    } catch (err) {
      console.error("Gagal mengecek status", err)
    }
  }

  const fetchStats = async (agentId: string) => {
    setIsLoadingStats(true)
    try {
      const res = await fetch(`/api/dashboard/stats?agentId=${agentId}`)
      const data = await res.json()
      if (!data.error) {
        setStats({
          videosProcessed: data.videosProcessed || 0,
          clipsGenerated: data.clipsGenerated || 0,
          potentialViews: data.potentialViews || 0
        })
      }
    } catch (err) {
      console.error("Gagal fetch stats", err)
    }
    setIsLoadingStats(false)
  }

  // Helper formatting function
  const formatNumber = (num: number) => {
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k'
    return num.toString()
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '30px' }}>
      <div>
        <h1 style={{ fontSize: '32px', fontWeight: 800, marginBottom: '8px' }}>Beranda</h1>
        <p style={{ color: 'var(--text-dim)', fontSize: '16px' }}>
          {activeAgent 
            ? `Ringkasan aktivitas dan status akun untuk ${activeAgent.name}.`
            : 'Ringkasan aktivitas agentic AI. Pilih Super Agent terlebih dahulu.'}
        </p>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', opacity: isLoadingStats ? 0.5 : 1 }}>
        <GlassCard glow={true}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '15px' }}>
            <span style={{ color: 'var(--text-dim)', fontWeight: 500 }}>Potensi Views</span>
            <div style={{ 
              background: 'rgba(6, 214, 160, 0.1)', 
              padding: '8px', 
              borderRadius: '8px',
              color: 'var(--success)'
            }}>
              <Eye size={20} />
            </div>
          </div>
          <div style={{ fontSize: '36px', fontWeight: 800 }}>{formatNumber(stats.potentialViews)}</div>
          <div style={{ fontSize: '12px', color: 'var(--success)', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Activity size={12} />
            <span>Berdasarkan klip dihasilkan</span>
          </div>
        </GlassCard>

        <GlassCard glow={true}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '15px' }}>
            <span style={{ color: 'var(--text-dim)', fontWeight: 500 }}>Video Diproses</span>
            <div style={{ 
              background: 'rgba(124, 58, 237, 0.1)', 
              padding: '8px', 
              borderRadius: '8px',
              color: 'var(--primary)'
            }}>
              <Play size={20} />
            </div>
          </div>
          <div style={{ fontSize: '36px', fontWeight: 800 }}>{stats.videosProcessed}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
            Total jobs
          </div>
        </GlassCard>

        <GlassCard glow={true}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '15px' }}>
            <span style={{ color: 'var(--text-dim)', fontWeight: 500 }}>Clip Dihasilkan</span>
            <div style={{ 
              background: 'rgba(234, 33, 67, 0.1)', 
              padding: '8px', 
              borderRadius: '8px',
              color: 'var(--danger)'
            }}>
              <Share2 size={20} />
            </div>
          </div>
          <div style={{ fontSize: '36px', fontWeight: 800 }}>{stats.clipsGenerated}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>Total klip vertikal</span>
          </div>
        </GlassCard>
      </div>

      {/* Social Media Connections */}
      <div>
        <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '20px' }}>Status Akun Sosial Media</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
          
          <GlassCard style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div style={{
              width: '50px',
              height: '50px',
              borderRadius: '12px',
              background: 'rgba(255, 0, 0, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Youtube size={24} color="#FF0000" />
            </div>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>YouTube Shorts</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                {youtubeAccount || 'Belum ditautkan'}
              </p>
            </div>
            {youtubeAccount ? (
              <Badge variant="accent" icon={<CheckCircle size={12} style={{ marginRight: '4px' }} />}>
                Tersambung
              </Badge>
            ) : (
              <Badge variant="warning" icon={<AlertCircle size={12} style={{ marginRight: '4px' }} />}>
                Terputus
              </Badge>
            )}
          </GlassCard>

          <GlassCard style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div style={{
              width: '50px',
              height: '50px',
              borderRadius: '12px',
              background: 'rgba(0, 0, 0, 0.2)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#fff' }}>
                <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>TikTok</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                {tiktokAccount || 'Belum ditautkan'}
              </p>
            </div>
            {tiktokAccount ? (
              <Badge variant="accent" icon={<CheckCircle size={12} style={{ marginRight: '4px' }} />}>
                Tersambung
              </Badge>
            ) : (
              <Badge variant="warning" icon={<AlertCircle size={12} style={{ marginRight: '4px' }} />}>
                Terputus
              </Badge>
            )}
          </GlassCard>

          <GlassCard style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div style={{
              width: '50px',
              height: '50px',
              borderRadius: '12px',
              background: 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)',
              opacity: 0.8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Instagram size={24} color="#fff" />
            </div>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Instagram Reels</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                {instagramAccount || 'Belum ditautkan'}
              </p>
            </div>
            {instagramAccount ? (
              <Badge variant="accent" icon={<CheckCircle size={12} style={{ marginRight: '4px' }} />}>
                Tersambung
              </Badge>
            ) : (
              <Badge variant="warning" icon={<AlertCircle size={12} style={{ marginRight: '4px' }} />}>
                Terputus
              </Badge>
            )}
          </GlassCard>

        </div>
      </div>

    </div>
  )
}
