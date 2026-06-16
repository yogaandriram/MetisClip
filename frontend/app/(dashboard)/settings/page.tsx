'use client'

import React, { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Settings, Shield, Key, Sliders, Check, HelpCircle, Video, Bot, Instagram, Smartphone } from 'lucide-react'
import { useAgent } from '@/contexts/AgentContext'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import toast from 'react-hot-toast'
import { GlassCard } from '../../../components/ui/GlassCard'
import { Button } from '../../../components/ui/Button'
import { InputField } from '../../../components/ui/InputField'
import { SelectField } from '../../../components/ui/SelectField'
import { Badge } from '../../../components/ui/Badge'
import { Divider } from '../../../components/ui/Divider'

export default function SettingsPage() {
  const { activeAgent, refreshAgents } = useAgent()
  const supabase = createClientComponentClient()
  const searchParams = useSearchParams()
  const router = useRouter()

  const [channelId, setChannelId] = useState('')
  const [isYoutubeConnected, setIsYoutubeConnected] = useState(false)
  const [isConnectingYt, setIsConnectingYt] = useState(false)

  const [tiktokAccountId, setTiktokAccountId] = useState('')
  const [isTiktokConnected, setIsTiktokConnected] = useState(false)
  const [isConnectingTiktok, setIsConnectingTiktok] = useState(false)

  const [instagramAccountId, setInstagramAccountId] = useState('')
  const [isInstagramConnected, setIsInstagramConnected] = useState(false)
  const [isConnectingInstagram, setIsConnectingInstagram] = useState(false)

  const [defaultDuration, setDefaultDuration] = useState('45-60')
  const [defaultKeywords, setDefaultKeywords] = useState('')
  const [isSaved, setIsSaved] = useState(false)

  // Handle Composio connection callback
  useEffect(() => {
    const connectedApp = searchParams.get('composio_connected')
    if (connectedApp && activeAgent) {
      toast.loading(`Menyinkronkan status ${connectedApp}...`, { id: 'sync' })
      fetch('/api/composio/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: activeAgent.id, appName: connectedApp })
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            toast.success(`Berhasil menyambungkan ${connectedApp}!`, { id: 'sync' })
            checkSocialConnections(activeAgent.id)
          } else {
            toast.error(data.error || 'Gagal menyinkronkan koneksi', { id: 'sync' })
          }
          router.replace('/settings', { scroll: false })
        })
        .catch(err => {
          toast.error('Gagal menyinkronkan dengan server', { id: 'sync' })
          router.replace('/settings', { scroll: false })
        })
    }
  }, [searchParams, activeAgent, router])

  // Load active agent data
  useEffect(() => {
    if (activeAgent) {
      setDefaultDuration(activeAgent.default_duration || '45-60')
      setDefaultKeywords(activeAgent.default_keywords || '')
      checkSocialConnections(activeAgent.id)
    } else {
      setIsYoutubeConnected(false)
      setIsTiktokConnected(false)
      setIsInstagramConnected(false)
      setDefaultKeywords('')
    }
  }, [activeAgent])

  const checkSocialConnections = async (agentId: string) => {
    try {
      const { data: connections, error } = await supabase
        .from('agent_social_connections')
        .select('*')
        .eq('agent_id', agentId)

      if (error) {
        console.error("Gagal mengecek status dari Supabase", error)
        setIsYoutubeConnected(false)
        setIsTiktokConnected(false)
        setIsInstagramConnected(false)
        return
      }

      const yt = connections?.find(c => c.platform.toLowerCase() === 'youtube')
      if (yt) {
        setIsYoutubeConnected(true)
        setChannelId(yt.platform_account_name || yt.platform_account_id || 'Terhubung via Supabase')
      } else {
        setIsYoutubeConnected(false)
        setChannelId('')
      }

      const tt = connections?.find(c => c.platform.toLowerCase() === 'tiktok')
      if (tt) {
        setIsTiktokConnected(true)
        setTiktokAccountId(tt.platform_account_name || tt.platform_account_id || 'Terhubung via Supabase')
      } else {
        setIsTiktokConnected(false)
        setTiktokAccountId('')
      }

      const ig = connections?.find(c => c.platform.toLowerCase() === 'instagram')
      if (ig) {
        setIsInstagramConnected(true)
        setInstagramAccountId(ig.platform_account_name || ig.platform_account_id || 'Terhubung via Supabase')
      } else {
        setIsInstagramConnected(false)
        setInstagramAccountId('')
      }
    } catch (err) {
      console.error("Gagal mengecek status", err)
      setIsYoutubeConnected(false)
      setIsTiktokConnected(false)
      setIsInstagramConnected(false)
    }
  }

  const handleConnect = async (appName: string, setLoading: (b: boolean) => void) => {
    if (!activeAgent) {
      toast.error('Pilih Super Agent terlebih dahulu!')
      return
    }
    
    setLoading(true)
    try {
      const res = await fetch('/api/composio/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: activeAgent.id, appName })
      })
      
      const data = await res.json()
      
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl
      } else {
        toast.error(data.error || `Gagal membuat sesi Composio untuk ${appName}`)
        setLoading(false)
      }
    } catch (err) {
      toast.error('Terjadi kesalahan jaringan')
      setLoading(false)
    }
  }

  const handleDisconnect = async (platform: string, setLoading: (b: boolean) => void) => {
    if (!activeAgent) return;
    
    if (!window.confirm(`Apakah Anda yakin ingin memutus koneksi akun ${platform} ini?`)) return;
    
    setLoading(true);
    try {
      const res = await fetch('/api/composio/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: activeAgent.id, platform })
      });
      
      const data = await res.json();
      if (data.success) {
        toast.success(`Koneksi ${platform} berhasil diputus`);
        checkSocialConnections(activeAgent.id);
      } else {
        toast.error(data.error || `Gagal memutus koneksi ${platform}`);
      }
    } catch (err) {
      toast.error('Terjadi kesalahan saat memutus koneksi');
    }
    setLoading(false);
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeAgent) return

    setIsSaved(true)
    const { error } = await supabase
      .from('super_agents')
      .update({
        default_duration: defaultDuration,
        default_keywords: defaultKeywords
      })
      .eq('id', activeAgent.id)

    if (error) {
      toast.error('Gagal menyimpan pengaturan')
    } else {
      toast.success('Pengaturan Agent disimpan!')
      refreshAgents()
    }

    setTimeout(() => {
      setIsSaved(false)
    }, 2000)
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      {/* Header title */}
      <div style={{ marginBottom: '40px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: '800', marginBottom: '8px' }}>Pengaturan Agent</h1>
        <p style={{ color: 'var(--text-muted)' }}>
          {activeAgent 
            ? <span>Mengatur preferensi untuk <strong>{activeAgent.name}</strong></span> 
            : 'Silakan pilih atau buat Super Agent di menu atas untuk mengatur preferensinya.'}
        </p>
      </div>

      {!activeAgent ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', border: '1px dashed var(--border-glass)', borderRadius: '16px' }}>
          <Bot size={48} color="var(--text-muted)" style={{ marginBottom: '16px', opacity: 0.5 }} />
          <h3 style={{ fontSize: '18px', color: 'var(--text-primary)', marginBottom: '8px' }}>Pilih Super Agent</h3>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Anda harus memilih Super Agent aktif di menu samping untuk mengubah pengaturan integrasi.</p>
        </div>
      ) : (
      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
        
        {/* YouTube OAuth block */}
        <GlassCard glow={true} padding="30px">
          <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Video size={20} color="#FF0000" /> Otorisasi YouTube Channel
          </h3>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
            <div>
              <p style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>Status Akun YouTube</p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {isYoutubeConnected ? `Kanal Terhubung untuk ${activeAgent.name}` : 'Belum terhubung ke channel mana pun.'}
              </p>
            </div>
            
            {isYoutubeConnected ? (
              <div style={{ display: 'flex', gap: '10px' }}>
                <Badge variant="accent" glow={true} icon={<Check size={14} />}>
                  Terhubung
                </Badge>
                <Button variant="danger" size="sm" onClick={() => handleDisconnect('YOUTUBE', setIsConnectingYt)} loading={isConnectingYt}>
                  Putuskan
                </Button>
              </div>
            ) : (
              <Button variant="primary" size="sm" onClick={() => handleConnect('YOUTUBE', setIsConnectingYt)} loading={isConnectingYt}>
                Hubungkan YouTube
              </Button>
            )}
          </div>
        </GlassCard>

        {/* TikTok OAuth block */}
        <GlassCard glow={true} padding="30px">
          <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Smartphone size={20} color="#00f2fe" /> Otorisasi TikTok Account
          </h3>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
            <div>
              <p style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>Status Akun TikTok</p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {isTiktokConnected ? `Akun Terhubung untuk ${activeAgent.name}` : 'Belum terhubung ke akun mana pun.'}
              </p>
            </div>
            
            {isTiktokConnected ? (
              <div style={{ display: 'flex', gap: '10px' }}>
                <Badge variant="accent" glow={true} icon={<Check size={14} />}>
                  Terhubung
                </Badge>
                <Button variant="danger" size="sm" onClick={() => handleDisconnect('TIKTOK', setIsConnectingTiktok)} loading={isConnectingTiktok}>
                  Putuskan
                </Button>
              </div>
            ) : (
              <Button variant="primary" size="sm" onClick={() => handleConnect('TIKTOK', setIsConnectingTiktok)} loading={isConnectingTiktok}>
                Hubungkan TikTok
              </Button>
            )}
          </div>
        </GlassCard>

        {/* Instagram OAuth block */}
        <GlassCard glow={true} padding="30px">
          <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Instagram size={20} color="#E1306C" /> Otorisasi Instagram Account
          </h3>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
            <div>
              <p style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>Status Akun Instagram</p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {isInstagramConnected ? `Akun Terhubung untuk ${activeAgent.name}` : 'Belum terhubung ke akun mana pun.'}
              </p>
            </div>
            
            {isInstagramConnected ? (
              <div style={{ display: 'flex', gap: '10px' }}>
                <Badge variant="accent" glow={true} icon={<Check size={14} />}>
                  Terhubung
                </Badge>
                <Button variant="danger" size="sm" onClick={() => handleDisconnect('INSTAGRAM', setIsConnectingInstagram)} loading={isConnectingInstagram}>
                  Putuskan
                </Button>
              </div>
            ) : (
              <Button variant="primary" size="sm" onClick={() => handleConnect('INSTAGRAM', setIsConnectingInstagram)} loading={isConnectingInstagram}>
                Hubungkan Instagram
              </Button>
            )}
          </div>
        </GlassCard>

        {/* Global AI defaults config */}
        <GlassCard glow={true} padding="30px">
          <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Sliders size={20} color="var(--accent)" /> Parameter Default AI
          </h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <SelectField
              label="Default Durasi Clip"
              value={defaultDuration}
              onChange={(e) => setDefaultDuration(e.target.value)}
              options={[
                { value: '30-45', label: '30 - 45 Detik (TikTok)' },
                { value: '45-60', label: '45 - 60 Detik (Instagram/Shorts)' },
                { value: '60-75', label: '60 - 75 Detik (Medium)' }
              ]}
            />

            <InputField
              label="Default Keyword"
              value={defaultKeywords}
              onChange={(e) => setDefaultKeywords(e.target.value)}
            />
          </div>
        </GlassCard>



        {/* Action button */}
        <Divider />
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button type="submit" variant="primary" loading={isSaved} icon={isSaved ? <Check size={18} /> : undefined}>
            {isSaved ? 'Tersimpan' : 'Simpan Kredensial'}
          </Button>
        </div>

      </form>
      )}
    </div>
  )
}
