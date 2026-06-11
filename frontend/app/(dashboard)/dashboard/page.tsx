'use client'

import React from 'react'
import { Download, Youtube, Instagram, Share2, Activity, Play, CheckCircle, AlertCircle } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { Badge } from '@/components/ui/Badge'

export default function DashboardOverview() {
  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '30px' }}>
      <div>
        <h1 style={{ fontSize: '32px', fontWeight: 800, marginBottom: '8px' }}>Beranda</h1>
        <p style={{ color: 'var(--text-dim)', fontSize: '16px' }}>
          Ringkasan aktivitas agentic AI dan status akun MetisClip Anda.
        </p>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
        <GlassCard glow={true}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '15px' }}>
            <span style={{ color: 'var(--text-dim)', fontWeight: 500 }}>Total Download</span>
            <div style={{ 
              background: 'rgba(6, 214, 160, 0.1)', 
              padding: '8px', 
              borderRadius: '8px',
              color: 'var(--success)'
            }}>
              <Download size={20} />
            </div>
          </div>
          <div style={{ fontSize: '36px', fontWeight: 800 }}>1,248</div>
          <div style={{ fontSize: '12px', color: 'var(--success)', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Activity size={12} />
            <span>+12% dari minggu lalu</span>
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
          <div style={{ fontSize: '36px', fontWeight: 800 }}>42</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
            Bulan ini
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
          <div style={{ fontSize: '36px', fontWeight: 800 }}>384</div>
          <div style={{ fontSize: '12px', color: 'var(--success)', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Activity size={12} />
            <span>Rata-rata 9 clip/video</span>
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
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>@YogaAndrian</p>
            </div>
            <Badge variant="success" icon={<CheckCircle size={12} style={{ marginRight: '4px' }} />}>
              Tersambung
            </Badge>
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
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>@yoga.clips</p>
            </div>
            <Badge variant="success" icon={<CheckCircle size={12} style={{ marginRight: '4px' }} />}>
              Tersambung
            </Badge>
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
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Belum ditautkan</p>
            </div>
            <Badge variant="warning" icon={<AlertCircle size={12} style={{ marginRight: '4px' }} />}>
              Terputus
            </Badge>
          </GlassCard>

        </div>
      </div>

    </div>
  )
}
