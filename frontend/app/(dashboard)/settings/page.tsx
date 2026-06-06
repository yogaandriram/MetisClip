'use client'

import React, { useState, useEffect } from 'react'
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
  const [apiKey, setApiKey] = useState('')
  const [isSaved, setIsSaved] = useState(false)

  // Load active agent data
  useEffect(() => {
    if (activeAgent) {
      setDefaultDuration(activeAgent.default_duration || '45-60')
      setDefaultKeywords(activeAgent.default_keywords || '')
      setApiKey(activeAgent.groq_api_key || '')
      checkSocialConnections(activeAgent.id)
    } else {
      setIsYoutubeConnected(false)
      setIsTiktokConnected(false)
      setIsInstagramConnected(false)
      setDefaultKeywords('')
      setApiKey('')
    }
  }, [activeAgent])

  const checkSocialConnections = async (agentId: string) => {
    try {
      const platforms = ['YOUTUBE', 'TIKTOK', 'INSTAGRAM']
      
      for (const platform of platforms) {
        const res = await fetch(`/api/composio/status?agentId=${agentId}&appName=${platform}`)
        const data = await res.json()

        if (platform === 'YOUTUBE') {
          setIsYoutubeConnected(data.isConnected)
          setChannelId(data.isConnected ? (data.connectedAccountId || 'Terhubung via Composio') : '')
        } else if (platform === 'TIKTOK') {
          setIsTiktokConnected(data.isConnected)
          setTiktokAccountId(data.isConnected ? (data.connectedAccountId || 'Terhubung via Composio') : '')
        } else if (platform === 'INSTAGRAM') {
          setIsInstagramConnected(data.isConnected)
          setInstagramAccountId(data.isConnected ? (data.connectedAccountId || 'Terhubung via Composio') : '')
        }
      }
    } catch (err) {
      console.error("Gagal mengecek status Composio", err)
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

  const handleDisconnectYoutube = async () => {
    // For Composio, you can call their API to remove an entity connection
    // For now, we will just simulate disconnection or you could hit an API endpoint to delete it.
    toast.error('Fitur pemutusan koneksi harus dilakukan via Dasbor Composio saat ini')
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeAgent) return

    setIsSaved(true)
    const { error } = await supabase
      .from('super_agents')
      .update({
        default_duration: defaultDuration,
        default_keywords: defaultKeywords,
        groq_api_key: apiKey
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
                <Badge variant="success" glow={true} icon={<Check size={14} />}>
                  Terhubung
                </Badge>
                <Button variant="danger" size="sm" onClick={handleDisconnectYoutube}>
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
                <Badge variant="success" glow={true} icon={<Check size={14} />}>
                  Terhubung
                </Badge>
                <Button variant="danger" size="sm" onClick={handleDisconnectYoutube}>
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
                <Badge variant="success" glow={true} icon={<Check size={14} />}>
                  Terhubung
                </Badge>
                <Button variant="danger" size="sm" onClick={handleDisconnectYoutube}>
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

        {/* Credentials and API Keys */}
        <GlassCard glow={true} padding="30px">
          <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Key size={20} color="var(--warning)" /> Kunci API Kustom (Opsional)
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '20px' }}>
            Untuk menggunakan jatah quota Anda sendiri, Anda dapat memasukkan kunci API kustom Anda di bawah. Secara default sistem menggunakan serverless cluster bersama kami.
          </p>

          <InputField
            label="Groq API Key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="gsk_••••••••••••••••••••"
          />
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
