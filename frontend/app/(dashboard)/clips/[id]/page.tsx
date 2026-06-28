'use client'

import React, { useState, useEffect, useRef } from 'react'
import { ArrowLeft, Play, Pause, Save, Type, RotateCcw, Palette, Sparkles, Check, Loader2, Download, Maximize, Trash2, Plus, ChevronDown } from 'lucide-react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useAgent } from '@/contexts/AgentContext'
import { UploadCloud, CheckCircle, Video, Settings, FileAudio, ChevronLeft } from 'lucide-react'
import { presets } from '@/lib/presets'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { SelectField } from '@/components/ui/SelectField'
import { Dropdown } from '@/components/ui/Dropdown'
import { SUPPORTED_FONTS, FONT_WEIGHTS_MAP } from '@/lib/constants'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8002'

export default function ClipEditorPage({ params }: { params: { id: string } }) {
  const supabase = createClientComponentClient()
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const { activeAgent } = useAgent()
  
  const [isPlaying, setIsPlaying] = useState(false)
  const [activeWordIndex, setActiveWordIndex] = useState(-1)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [highlightColor, setHighlightColor] = useState('#06D6A0') // Neon Mint default
  const [fontSize, setFontSize] = useState(46)
  const [fontFamily, setFontFamily] = useState('Montserrat Bold')
  const [subtitleStyleMode, setSubtitleStyleMode] = useState('classic')
  
  // Advanced Styles
  const [fontColor, setFontColor] = useState('#FFFFFF')
  const [isItalic, setIsItalic] = useState(false)
  const [isUnderline, setIsUnderline] = useState(false)
  const [fontWeight, setFontWeight] = useState('Bold')
  const [strokeColor, setStrokeColor] = useState('#000000')
  const [strokeWidth, setStrokeWidth] = useState(0)
  const [hasShadow, setHasShadow] = useState(false)
  const [shadowColor, setShadowColor] = useState('#000000')
  const [shadowX, setShadowX] = useState(0)
  const [shadowY, setShadowY] = useState(0)
  const [shadowBlur, setShadowBlur] = useState(0)
  const [letterSpacing, setLetterSpacing] = useState(0)
  const [lineHeight, setLineHeight] = useState(1.2)
  const [isUppercase, setIsUppercase] = useState(false)
  const [positionY, setPositionY] = useState(80)
  const [offsetTime, setOffsetTime] = useState(0) // ms
  const [brandSettings, setBrandSettings] = useState<any>(null)
  
  const [renderProgress, setRenderProgress] = useState(0)
  const [renderStatus, setRenderStatus] = useState<string>("idle")
  const [isSaved, setIsSaved] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [thumbnailUrl, setThumbnailUrl] = useState('')
  const [videoUrl, setVideoUrl] = useState('')

  const [words, setWords] = useState<any[]>([])

  useEffect(() => {
    async function fetchClip() {
      try {
        const { data, error } = await supabase
          .from('clips')
          .select('*')
          .eq('id', params.id)
          .single()

        if (error) {
          console.error("Error fetching clip:", error)
          setIsLoading(false)
          return
        }

        if (data) {
          // Parse subtitle_data
          if (data.subtitle_data) {
            try {
              const parsedData = typeof data.subtitle_data === 'string' ? JSON.parse(data.subtitle_data) : data.subtitle_data
              if (parsedData.words) {
                setWords(parsedData.words)
              }
            } catch (e) {
              console.error("Failed to parse subtitle_data:", e)
            }
          }

          // Fetch default brand template
          let defaultTemplate: any = {}
          let defaultBrandSettings: any = null
          if (activeAgent) {
             const { data: bData } = await supabase.from('brand_templates').select('*').eq('agent_id', activeAgent.id).limit(1).single()
             if (bData) {
               defaultTemplate = bData.caption_settings || {}
               defaultBrandSettings = bData.brand_settings || null
             }
          }
          setBrandSettings(defaultBrandSettings)

          // Parse subtitle_style
          let mergedStyle = { ...defaultTemplate }
          if (data.subtitle_style) {
            try {
              const parsedStyle = typeof data.subtitle_style === 'string' ? JSON.parse(data.subtitle_style) : data.subtitle_style
              mergedStyle = { ...mergedStyle, ...parsedStyle }
            } catch (e) {
              console.error("Failed to parse subtitle_style:", e)
            }
          }
          
          const hc = mergedStyle.highlightColor || mergedStyle.highlight_color;
          if (hc) setHighlightColor(hc)
          
          const fs = mergedStyle.fontSize || mergedStyle.font_size;
          if (fs) setFontSize(fs)
          
          const ff = mergedStyle.fontFamily || mergedStyle.font_family;
          if (ff) setFontFamily(ff)
          
          if (mergedStyle.mode) setSubtitleStyleMode(mergedStyle.mode)
          
          const fc = mergedStyle.fontColor || mergedStyle.font_color;
          if (fc !== undefined) setFontColor(fc)

          const ii = mergedStyle.isItalic !== undefined ? mergedStyle.isItalic : mergedStyle.is_italic;
          if (ii !== undefined) setIsItalic(ii)

          const iu = mergedStyle.isUnderline !== undefined ? mergedStyle.isUnderline : mergedStyle.is_underline;
          if (iu !== undefined) setIsUnderline(iu)

          const fw = mergedStyle.fontWeight || mergedStyle.font_weight;
          if (fw !== undefined) setFontWeight(fw)

          const sc = mergedStyle.strokeColor || mergedStyle.stroke_color;
          if (sc !== undefined) setStrokeColor(sc)

          const sw = mergedStyle.strokeWidth !== undefined ? mergedStyle.strokeWidth : mergedStyle.stroke_width;
          if (sw !== undefined) setStrokeWidth(sw)

          const hs = mergedStyle.hasShadow !== undefined ? mergedStyle.hasShadow : mergedStyle.has_shadow;
          if (hs !== undefined) setHasShadow(hs)

          const shc = mergedStyle.shadowColor || mergedStyle.shadow_color;
          if (shc !== undefined) setShadowColor(shc)

          const shx = mergedStyle.shadowX !== undefined ? mergedStyle.shadowX : mergedStyle.shadow_x;
          if (shx !== undefined) setShadowX(shx)

          const shy = mergedStyle.shadowY !== undefined ? mergedStyle.shadowY : mergedStyle.shadow_y;
          if (shy !== undefined) setShadowY(shy)

          if (mergedStyle.shadowBlur !== undefined) setShadowBlur(mergedStyle.shadowBlur)
          if (mergedStyle.letterSpacing !== undefined) setLetterSpacing(mergedStyle.letterSpacing)
          if (mergedStyle.lineHeight !== undefined) setLineHeight(mergedStyle.lineHeight)

          const up = mergedStyle.isUppercase !== undefined ? mergedStyle.isUppercase : mergedStyle.is_uppercase;
          if (up !== undefined) setIsUppercase(up)
          
          const py = mergedStyle.positionY !== undefined ? mergedStyle.positionY : mergedStyle.position_y;
          if (py !== undefined) setPositionY(py)

          const ot = mergedStyle.offsetTime !== undefined ? mergedStyle.offsetTime : mergedStyle.offset_time;
          if (ot !== undefined) setOffsetTime(ot)

          // Get Thumbnail URL
          if (data.thumbnail_path && !data.thumbnail_path.includes('tmp')) {
            if (data.thumbnail_path.startsWith('http')) {
              setThumbnailUrl(`${API_URL}/api/clips/proxy-media?url=${encodeURIComponent(data.thumbnail_path)}`)
            } else {
              const { data: publicUrlData } = supabase.storage.from('clips').getPublicUrl(data.thumbnail_path)
              setThumbnailUrl(publicUrlData.publicUrl)
            }
          }

          // Get Video URL
          if (data.storage_path && !data.storage_path.includes('tmp')) {
            if (data.storage_path.startsWith('http')) {
              setVideoUrl(`${API_URL}/api/clips/proxy-media?url=${encodeURIComponent(data.storage_path)}`)
            } else {
              const { data: publicVideoData } = supabase.storage.from('clips').getPublicUrl(data.storage_path)
              setVideoUrl(publicVideoData.publicUrl)
            }
          }
        }
      } catch (err) {
        console.error(err)
      } finally {
        setIsLoading(false)
      }
    }

    if (activeAgent) {
      fetchClip()
    }
  }, [params.id, supabase, activeAgent])

  // Handles text change of specific words
  const handleWordTextChange = (index: number, newText: string) => {
    const updated = [...words]
    updated[index].word = newText
    setWords(updated)
  }

  // Handles word timing change
  const handleWordTimingChange = (index: number, field: 'start' | 'end', value: string) => {
    const updated = [...words]
    updated[index][field] = value === '' ? '' : parseFloat(value)
    setWords(updated)
  }

  const handleDeleteWord = (index: number) => {
    const updated = [...words]
    updated.splice(index, 1)
    setWords(updated)
  }

  const handleAddWord = (index: number) => {
    const updated = [...words]
    const currentWord = updated[index]
    const newWord = {
      word: 'Baru',
      start: currentWord ? currentWord.end : 0,
      end: currentWord ? currentWord.end + 0.5 : 0.5
    }
    updated.splice(index + 1, 0, newWord)
    setWords(updated)
  }

  // Playback simulation showing karaoke active word updates
  const handlePlayToggle = () => {
    if (!videoRef.current) return
    
    if (isPlaying) {
      videoRef.current.pause()
      setIsPlaying(false)
    } else {
      videoRef.current.play()
      setIsPlaying(true)
    }
  }

  const handleTimeUpdate = () => {
    if (!videoRef.current) return
    const currentVidTime = videoRef.current.currentTime
    setCurrentTime(currentVidTime)
    
    // Find active word based on currentTime
    // Apply offset time to shift subtitle synchronization
    const adjustedTime = currentVidTime - (offsetTime / 1000)
    const currentIndex = words.findIndex(w => adjustedTime >= w.start && adjustedTime <= w.end)
    setActiveWordIndex(currentIndex)
  }

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration)
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value)
    if (videoRef.current) {
      videoRef.current.currentTime = newTime
      setCurrentTime(newTime)
    }
  }

  const formatTime = (time: number) => {
    if (isNaN(time)) return '0:00'
    const min = Math.floor(time / 60)
    const sec = Math.floor(time % 60)
    return `${min}:${sec.toString().padStart(2, '0')}`
  }
  
  const handleVideoEnded = () => {
    setIsPlaying(false)
    setActiveWordIndex(-1)
  }

  const [isDownloading, setIsDownloading] = useState(false)

  const handleSave = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const stylePayload = {
        font_family: fontFamily,
        font_size: fontSize,
        highlight_color: highlightColor,
        mode: subtitleStyleMode,
        font_color: fontColor,
        is_italic: isItalic,
        is_underline: isUnderline,
        font_weight: fontWeight,
        stroke_color: strokeColor,
        stroke_width: strokeWidth,
        has_shadow: hasShadow,
        shadow_color: shadowColor,
        shadow_x: shadowX,
        shadow_y: shadowY,
        shadowBlur: shadowBlur,
        letterSpacing: letterSpacing,
        lineHeight: lineHeight,
        is_uppercase: isUppercase,
        positionY: positionY,
        offsetTime: offsetTime
      }

      const res = await fetch(`${API_URL}/api/clips/${params.id}/subtitles`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ words, style: stylePayload })
      })

      if (res.ok) {
        setIsSaved(true)
        setTimeout(() => setIsSaved(false), 2000)
      } else {
        alert("Gagal menyimpan perubahan.")
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleResetTemplate = async () => {
    if (!window.confirm("Yakin ingin membatalkan semua editan desain ini dan mengembalikan ke Template Brand Global?")) return;
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const res = await fetch(`${API_URL}/api/clips/${params.id}/subtitles`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ reset_style: true })
      })

      if (res.ok) {
        alert("Berhasil direset! Halaman akan dimuat ulang.")
        window.location.reload()
      } else {
        alert("Gagal mereset template.")
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDownloading(true)
    setRenderStatus("starting")
    setRenderProgress(0)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const res = await fetch(`${API_URL}/api/clips/${params.id}/render?agent_id=${activeAgent?.id || ''}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      if (!res.ok) {
        throw new Error("Render failed")
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error("No response body")

      const decoder = new TextDecoder()
      let subbedVideoUrl = ""
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const blocks = buffer.split('\n\n')
        buffer = blocks.pop() || '' 

        for (const block of blocks) {
          const lines = block.split('\n')
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const parsed = JSON.parse(line.substring(6))
                if (parsed.status) setRenderStatus(parsed.status)
                if (parsed.progress !== undefined) setRenderProgress(parsed.progress)
                if (parsed.url) subbedVideoUrl = parsed.url
                if (parsed.status === 'error') throw new Error(parsed.message || "Rendering error")
              } catch (e) {
                // Ignore JSON parse errors for incomplete chunks
              }
            }
          }
        }
      }

      if (subbedVideoUrl) {
        try {
          const fileRes = await fetch(subbedVideoUrl)
          const blob = await fileRes.blob()
          const blobUrl = window.URL.createObjectURL(blob)
          
          const link = document.createElement('a')
          link.href = blobUrl
          link.setAttribute('download', `metisclip-${params.id}-subbed.mp4`)
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          
          setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000)
        } catch (downloadErr) {
          console.error("Gagal mendownload otomatis via Blob, fallback ke tab baru:", downloadErr)
          window.open(subbedVideoUrl, '_blank')
        }
      }
    } catch (err) {
      console.error("Download render error:", err)
      alert("Terjadi kesalahan saat memproses pembakaran subtitle. Silakan coba lagi.")
    } finally {
      setIsDownloading(false)
      setTimeout(() => {
        setRenderStatus("idle")
        setRenderProgress(0)
      }, 1000) // delay closing popup so user sees 100% completed state
    }
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <Loader2 size={40} color="var(--primary)" style={{ animation: 'spin 1s linear infinite', marginBottom: '15px' }} />
        <p style={{ color: 'var(--text-dim)' }}>Memuat data editor subtitle...</p>
        <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
      
      {/* 1. Header Global (Top Bar) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '15px', borderBottom: '1px solid var(--border-glass)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <a href="/clips" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-dim)', textDecoration: 'none', fontSize: '14px', background: 'rgba(255,255,255,0.05)', padding: '8px 12px', borderRadius: '8px', transition: 'background 0.2s' }}>
            <ArrowLeft size={16} /> Kembali
          </a>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>Editor Klip</h1>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>ID: {params.id.split('-')[0]}...</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            className="btn-secondary" 
            style={{ padding: '8px 16px', fontSize: '13px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-glass)', color: '#fff', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'background 0.2s' }} 
            onClick={handleResetTemplate}
          >
            Reset Template <RotateCcw size={14} />
          </button>
          <button className="btn-secondary" style={{ padding: '8px 16px', fontSize: '13px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-glass)', color: '#fff', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }} onClick={handleSave}>
            {isSaved ? <><Check size={14} /> Tersimpan</> : <><Save size={14} /> Simpan Draft</>}
          </button>
          <button 
            className="btn-primary" 
            style={{ padding: '8px 20px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', opacity: isDownloading ? 0.7 : 1 }} 
            onClick={handleDownload}
            disabled={isDownloading}
          >
            {isDownloading ? <><Loader2 size={14} className="animate-spin" /> Render...</> : <><Download size={14} /> Ekspor Video</>}
          </button>
        </div>
      </div>

      {/* 2. Main 3-Column Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr 340px', gap: '20px', flex: 1, overflow: 'hidden' }}>
        
        {/* PANEL KIRI: Captions / Transcript */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          <style>{`
            .word-card .add-word-btn { opacity: 0; pointer-events: none; }
            .word-card:hover .add-word-btn { opacity: 1; pointer-events: auto; }
            /* Custom Scrollbar for sleekness */
            ::-webkit-scrollbar { width: 6px; }
            ::-webkit-scrollbar-track { background: transparent; }
            ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
            ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
          `}</style>
          <div style={{ padding: '15px 20px', borderBottom: '1px solid var(--border-glass)', background: 'rgba(0,0,0,0.2)' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}><Type size={16} color="var(--primary)" /> Captions</h2>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>Edit teks dan timing</p>
          </div>
          
          <div style={{ flex: 1, overflowY: 'auto', padding: '15px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {words.map((item, index) => (
                <div
                  key={index}
                  className="word-card"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    background: activeWordIndex === index ? 'rgba(6,214,160,0.08)' : 'rgba(255,255,255,0.02)',
                    border: activeWordIndex === index ? '1px solid rgba(6,214,160,0.3)' : '1px solid var(--border-glass)',
                    padding: '12px',
                    borderRadius: '10px',
                    transition: 'all 0.2s ease',
                    boxShadow: activeWordIndex === index ? '0 0 15px rgba(6,214,160,0.1)' : 'none',
                    position: 'relative'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <input
                      type="text"
                      value={item.word}
                      onChange={(e) => handleWordTextChange(index, e.target.value)}
                      style={{ background: 'transparent', border: 'none', color: activeWordIndex === index ? '#fff' : 'var(--text-primary)', fontSize: '14px', fontWeight: activeWordIndex === index ? 700 : 500, outline: 'none', width: '100%' }}
                    />
                    <button onClick={() => handleDeleteWord(index)} style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', padding: '2px', opacity: 0.7, display: 'flex', alignItems: 'center' }} title="Hapus Kata">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input type="number" step="0.1" value={item.start} onChange={(e) => handleWordTimingChange(index, 'start', e.target.value)} style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid transparent', borderRadius: '4px', color: 'var(--text-dim)', width: '50px', padding: '2px 4px', textAlign: 'center', fontSize: '11px', outline: 'none' }} />
                    </div>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>-</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input type="number" step="0.1" value={item.end} onChange={(e) => handleWordTimingChange(index, 'end', e.target.value)} style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid transparent', borderRadius: '4px', color: 'var(--text-dim)', width: '50px', padding: '2px 4px', textAlign: 'center', fontSize: '11px', outline: 'none' }} />
                    </div>
                  </div>
                  
                  {/* Plus button to add word after this one */}
                  <div style={{ position: 'absolute', bottom: '-15px', left: '50%', transform: 'translateX(-50%)', zIndex: 5 }}>
                    <button onClick={() => handleAddWord(index)} style={{ background: 'var(--primary)', border: 'none', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', cursor: 'pointer', boxShadow: '0 2px 5px rgba(0,0,0,0.5)', transition: 'all 0.2s' }} className="add-word-btn" title="Sisipkan Kata">
                      <Plus size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* PANEL TENGAH: Canvas Preview */}
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0a0a0c', borderRadius: '16px', border: '1px solid var(--border-glass)', overflow: 'hidden', position: 'relative' }}>
          {/* Header Player */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 15px', background: 'rgba(0,0,0,0.4)', borderBottom: '1px solid var(--border-glass)', zIndex: 10 }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Preview Canvas (9:16)</span>
            <button onClick={(e) => { e.preventDefault(); containerRef.current?.requestFullscreen() }} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Fullscreen">
              <Maximize size={14} />
            </button>
          </div>
          
          {/* Wrapper for aspect ratio centering */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', overflow: 'hidden' }}>
            <div ref={containerRef} style={{
              height: '100%',
              aspectRatio: '9 / 16',
              position: 'relative',
              containerType: 'inline-size',
              borderRadius: '12px',
              background: '#000',
              overflow: 'hidden',
              boxShadow: '0 0 30px rgba(0,0,0,0.5)'
            }}>
              {/* Real Video Player */}
              <video
                ref={videoRef}
                src={videoUrl}
                poster={thumbnailUrl}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={handleVideoEnded}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                playsInline
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain' }}
              />

              {/* Overlay Logo */}
              {brandSettings?.overlayUrl && (
                <div style={{ position: 'absolute', top: `${((brandSettings.logoPosition?.y || 15) / 533) * 100}%`, left: `${((brandSettings.logoPosition?.x || 15) / 300) * 100}%`, width: `${((60 * (brandSettings.logoScale || 1)) / 300) * 100}%`, height: 'auto', zIndex: 20, pointerEvents: 'none' }}>
                  <img src={brandSettings.overlayUrl} alt="Brand Overlay" style={{ width: '100%', height: 'auto', display: 'block' }} />
                </div>
              )}

              {/* Active Highlight word rendered on video */}
              <div style={{ position: 'absolute', bottom: `${(positionY / 533) * 100}%`, left: '50%', transform: 'translateX(-50%)', width: '80%', textAlign: 'center', zIndex: 10, pointerEvents: 'none' }}>
                <div style={{
                  fontSize: `calc(${fontSize}cqw / 6)`,
                  fontFamily: `'${fontFamily}', var(--font-display)`,
                  fontWeight: fontWeight === 'Bold' || fontWeight === 'Black' ? 900 : (fontWeight === 'Medium' ? 500 : 400),
                  color: fontColor,
                  fontStyle: isItalic ? 'italic' : 'normal',
                  textDecoration: isUnderline ? 'underline' : 'none',
                  textTransform: isUppercase ? 'uppercase' : 'none',
                  lineHeight: lineHeight
                }}>
                  {activeWordIndex !== -1 ? (
                    <>
                      {(() => {
                        const activePreset = presets.find(p => p.id === subtitleStyleMode);
                        if (!activePreset) return null;
                        return activePreset.renderPreview({
                          words, activeWordIndex,
                          config: { fontFamily, fontSize, fontWeight, fontColor, isItalic, isUnderline, isUppercase, strokeColor, strokeWidth, hasShadow, shadowColor, shadowX, shadowY, shadowBlur, highlightColor }
                        });
                      })()}
                    </>
                  ) : (
                    <>
                      {words.length > 0 && (() => {
                        const activePreset = presets.find(p => p.id === subtitleStyleMode);
                        if (!activePreset) return null;
                        return (
                          <div style={{ opacity: 0.6, pointerEvents: 'none' }}>
                            {activePreset.renderPreview({
                              words, activeWordIndex: 0,
                              config: { fontFamily, fontSize, fontWeight, fontColor, isItalic, isUnderline, isUppercase, strokeColor, strokeWidth, hasShadow, shadowColor, shadowX, shadowY, shadowBlur, highlightColor }
                            })}
                          </div>
                        );
                      })()}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Custom Video Controls */}
          <div style={{ padding: '15px 20px', borderTop: '1px solid var(--border-glass)', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', gap: '15px', zIndex: 10 }}>
            <button onClick={handlePlayToggle} style={{ background: 'var(--primary)', border: 'none', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 0 15px rgba(6,214,160,0.3)' }}>
              {isPlaying ? <Pause size={20} /> : <Play size={20} style={{ marginLeft: '4px' }} />}
            </button>
            <span style={{ fontSize: '12px', color: 'var(--text-dim)', minWidth: '80px', fontFamily: 'monospace' }}>
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
            <input 
              type="range" 
              min="0" 
              max={duration || 100} 
              step="0.01"
              value={currentTime} 
              onChange={handleSeek}
              style={{ flex: 1, cursor: 'pointer', accentColor: 'var(--primary)', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', outline: 'none' }}
            />
          </div>
        </div>

        {/* PANEL KANAN: Inspector / Properties */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          <div style={{ padding: '15px 20px', borderBottom: '1px solid var(--border-glass)', background: 'rgba(0,0,0,0.2)' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}><Palette size={16} color="var(--warning)" /> Properties</h2>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>Desain dan animasi teks</p>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
            
            {/* Animasi Section */}
            <div style={{ marginBottom: '25px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '12px' }}>GAYA ANIMASI</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {presets.map((preset) => {
                  const isSelected = subtitleStyleMode === preset.id;
                  return (
                    <React.Fragment key={preset.id}>
                      {preset.renderButton(isSelected, () => {
                        const pConfig = preset.getDefaultConfig();
                        setSubtitleStyleMode(preset.id);
                        if (pConfig.fontFamily) setFontFamily(pConfig.fontFamily);
                        if (pConfig.fontWeight) setFontWeight(pConfig.fontWeight);
                        if (pConfig.isUppercase !== undefined) setIsUppercase(pConfig.isUppercase);
                        if (pConfig.fontColor) setFontColor(pConfig.fontColor);
                        if (pConfig.strokeColor) setStrokeColor(pConfig.strokeColor);
                        if (pConfig.strokeWidth !== undefined) setStrokeWidth(pConfig.strokeWidth);
                        if (pConfig.hasShadow !== undefined) setHasShadow(pConfig.hasShadow);
                        if (pConfig.shadowColor) setShadowColor(pConfig.shadowColor);
                        if (pConfig.shadowX !== undefined) setShadowX(pConfig.shadowX);
                        if (pConfig.shadowY !== undefined) setShadowY(pConfig.shadowY);
                        if (pConfig.shadowBlur !== undefined) setShadowBlur(pConfig.shadowBlur);
                        if (pConfig.isItalic !== undefined) setIsItalic(pConfig.isItalic);
                        if (pConfig.highlightColor) setHighlightColor(pConfig.highlightColor);
                        if (pConfig.letterSpacing !== undefined) setLetterSpacing(pConfig.letterSpacing);
                        if (pConfig.lineHeight !== undefined) setLineHeight(pConfig.lineHeight);
                      })}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            {/* Font & Basic Colors */}
            <div style={{ marginBottom: '25px', paddingBottom: '25px', borderBottom: '1px solid var(--border-glass)' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '15px' }}>TAMPILAN FONT</h3>
              
              <div style={{ marginBottom: '15px' }}>
                <Dropdown
                  width="100%"
                  trigger={
                    <div style={{ 
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                      background: 'rgba(255,255,255,0.05)', padding: '10px 14px', 
                      borderRadius: '10px', border: '1px solid var(--border-glass)',
                      cursor: 'pointer'
                    }}>
                      <span style={{ fontSize: '14px' }}>{fontFamily}</span>
                      <ChevronDown size={16} color="var(--text-muted)" />
                    </div>
                  }
                  items={SUPPORTED_FONTS.map(f => ({
                    id: f, 
                    label: <span style={{ fontFamily: f, fontSize: '15px' }}>{f}</span>, 
                    onClick: () => {
                      const availableWeights = FONT_WEIGHTS_MAP[f] || ['Regular'];
                      let safeWeight = fontWeight;
                      if (!availableWeights.includes(safeWeight || 'Regular')) {
                        safeWeight = availableWeights.includes('Regular') ? 'Regular' : availableWeights[0];
                      }
                      setFontFamily(f);
                      setFontWeight(safeWeight);
                    }
                  }))}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '15px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Warna Font</span>
                  <label style={{ width: '32px', height: '32px', borderRadius: '8px', background: fontColor, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.2)', overflow: 'hidden', display: 'block' }}>
                    <input type="color" value={fontColor} onChange={(e) => setFontColor(e.target.value)} style={{ opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }} />
                  </label>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Ketebalan</span>
                  <Dropdown
                    width="100%"
                    trigger={
                      <div style={{ 
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                        background: 'rgba(255,255,255,0.05)', padding: '8px 12px', 
                        borderRadius: '8px', border: '1px solid var(--border-glass)',
                        cursor: 'pointer', height: '32px'
                      }}>
                        <span style={{ fontSize: '13px' }}>{fontWeight}</span>
                        <ChevronDown size={14} color="var(--text-muted)" />
                      </div>
                    }
                    items={(FONT_WEIGHTS_MAP[fontFamily || 'Montserrat'] || ['Regular']).map(w => ({
                      id: w, label: w, onClick: () => setFontWeight(w)
                    }))}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Ukuran Font ({fontSize}px)</span>
                <input
                  type="range" min="20" max="80" value={fontSize}
                  onChange={(e) => setFontSize(parseInt(e.target.value))}
                  style={{ cursor: 'pointer', accentColor: 'var(--primary)', width: '100%' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Posisi Vertikal (Y: {positionY})</span>
                <input
                  type="range" min="10" max="400" value={positionY}
                  onChange={(e) => setPositionY(parseInt(e.target.value))}
                  style={{ cursor: 'pointer', accentColor: 'var(--primary)', width: '100%' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Sinkronisasi Suara (Delay)</span>
                  <span style={{ fontSize: '11px', color: offsetTime === 0 ? 'var(--text-dim)' : 'var(--primary)' }}>{offsetTime} ms</span>
                </div>
                <input
                  type="range" min="-1000" max="1000" step="50" value={offsetTime}
                  onChange={(e) => setOffsetTime(parseInt(e.target.value))}
                  style={{ cursor: 'pointer', accentColor: 'var(--primary)', width: '100%' }}
                />
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Geser ke kanan jika subtitle terlalu cepat</span>
              </div>
            </div>

            {/* Colors & Highlights */}
            <div style={{ marginBottom: '25px', paddingBottom: '25px', borderBottom: '1px solid var(--border-glass)' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '15px' }}>HIGHLIGHT & DEKORASI</h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Warna Highlight</span>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {['#06D6A0', '#7C3AED', '#F59E0B', '#EF4444', '#3B82F6', '#EC4899', '#FFFF00'].map((color) => (
                    <button
                      key={color}
                      onClick={() => setHighlightColor(color)}
                      style={{
                        width: '24px', height: '24px', borderRadius: '50%', background: color,
                        border: highlightColor === color ? '2px solid #fff' : '1px solid rgba(255,255,255,0.1)',
                        cursor: 'pointer',
                        boxShadow: highlightColor === color ? `0 0 10px ${color}80` : 'none'
                      }}
                    />
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>Format Tambahan</span>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => setIsItalic(!isItalic)} style={{ background: isItalic ? 'rgba(255,255,255,0.1)' : 'transparent', border: '1px solid var(--border-glass)', borderRadius: '4px', padding: '4px 8px', color: '#fff', fontStyle: 'italic', fontSize: '14px', cursor: 'pointer' }}>I</button>
                  <button onClick={() => setIsUnderline(!isUnderline)} style={{ background: isUnderline ? 'rgba(255,255,255,0.1)' : 'transparent', border: '1px solid var(--border-glass)', borderRadius: '4px', padding: '4px 8px', color: '#fff', textDecoration: 'underline', fontSize: '14px', cursor: 'pointer' }}>U</button>
                  <button onClick={() => setIsUppercase(!isUppercase)} style={{ background: isUppercase ? 'rgba(255,255,255,0.1)' : 'transparent', border: '1px solid var(--border-glass)', borderRadius: '4px', padding: '4px 8px', color: '#fff', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>TT</button>
                </div>
              </div>
            </div>

            {/* Stroke & Shadow */}
            <div>
              <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '15px' }}>GARIS LUAR & BAYANGAN</h3>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>Garis Luar (Stroke)</span>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <label style={{ width: '20px', height: '20px', borderRadius: '4px', background: strokeColor, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.2)', overflow: 'hidden' }}>
                    <input type="color" value={strokeColor} onChange={(e) => setStrokeColor(e.target.value)} style={{ opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }} />
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', padding: '0 6px', border: '1px solid var(--border-glass)' }}>
                    <input type="number" value={strokeWidth} onChange={(e) => setStrokeWidth(Number(e.target.value))} style={{ background: 'transparent', border: 'none', color: '#fff', width: '30px', padding: '4px 0', outline: 'none', fontSize: '12px' }} />
                    <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>px</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>Aktifkan Bayangan (Shadow)</span>
                <ToggleSwitch checked={hasShadow} onChange={setHasShadow} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', opacity: hasShadow ? 1 : 0.3, pointerEvents: hasShadow ? 'auto' : 'none', background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Warna</span>
                  <label style={{ width: '20px', height: '20px', borderRadius: '4px', background: shadowColor, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.2)', overflow: 'hidden' }}>
                    <input type="color" value={shadowColor} onChange={(e) => setShadowColor(e.target.value)} style={{ opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }} />
                  </label>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', padding: '0 6px', border: '1px solid var(--border-glass)', flex: 1 }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '10px', marginRight: '4px' }}>X:</span>
                    <input type="number" value={shadowX} onChange={(e) => setShadowX(Number(e.target.value))} style={{ background: 'transparent', border: 'none', color: '#fff', width: '100%', padding: '4px 0', outline: 'none', fontSize: '12px' }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', padding: '0 6px', border: '1px solid var(--border-glass)', flex: 1 }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '10px', marginRight: '4px' }}>Y:</span>
                    <input type="number" value={shadowY} onChange={(e) => setShadowY(Number(e.target.value))} style={{ background: 'transparent', border: 'none', color: '#fff', width: '100%', padding: '4px 0', outline: 'none', fontSize: '12px' }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', padding: '0 6px', border: '1px solid var(--border-glass)', flex: 1 }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '10px', marginRight: '4px' }}>B:</span>
                    <input type="number" value={shadowBlur} onChange={(e) => setShadowBlur(Number(e.target.value))} style={{ background: 'transparent', border: 'none', color: '#fff', width: '100%', padding: '4px 0', outline: 'none', fontSize: '12px' }} />
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
      {/* Realtime Progress Bar Popup */}
      {renderStatus !== 'idle' && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(8px)',
          zIndex: 9999,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center'
        }}>
          <div style={{
            background: 'rgba(30, 30, 30, 0.8)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '16px',
            padding: '30px',
            width: '350px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px'
          }}>
            <style>{`
              @keyframes custom-spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
              }
            `}</style>
            <Loader2 className="w-12 h-12 text-primary" style={{ animation: 'custom-spin 1s linear infinite' }} />
            <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'white' }}>
              {renderStatus === 'starting' && "Mempersiapkan Data..."}
              {renderStatus === 'rendering' && "Membakar Subtitle..."}
              {renderStatus === 'uploading' && "Menyimpan ke Cloud..."}
              {renderStatus === 'completed' && "Video Selesai!"}
              {renderStatus === 'error' && "Terjadi Kesalahan!"}
            </h3>
            
            <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ 
                width: `${renderProgress}%`, 
                height: '100%', 
                background: 'var(--primary)', 
                transition: 'width 0.3s ease' 
              }}></div>
            </div>
            
            <span style={{ fontSize: '14px', color: 'var(--text-muted)', fontWeight: 500 }}>
              {renderProgress}% Selesai
            </span>
          </div>
        </div>
      )}

    </div>
  )
}
