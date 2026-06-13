'use client'

import React, { useState, useEffect, useRef } from 'react'
import { ArrowLeft, Play, Pause, Save, Type, RotateCcw, Palette, Sparkles, Check, Loader2, Download, Maximize } from 'lucide-react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useAgent } from '@/contexts/AgentContext'
import { UploadCloud, CheckCircle, Video, Settings, FileAudio, ChevronLeft } from 'lucide-react'
import { presets } from '@/lib/presets'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { SelectField } from '@/components/ui/SelectField'

export default function ClipEditorPage({ params }: { params: { id: string } }) {
  const supabase = createClientComponentClient()
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const { activeAgent } = useAgent()
  
  const [isPlaying, setIsPlaying] = useState(false)
  const [activeWordIndex, setActiveWordIndex] = useState(-1)
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
          if (activeAgent) {
             const { data: bData } = await supabase.from('brand_templates').select('*').eq('agent_id', activeAgent.id).limit(1).single()
             if (bData) {
               defaultTemplate = bData.caption_settings || {}
             }
          }

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

          // Get Thumbnail URL
          if (data.thumbnail_path && !data.thumbnail_path.includes('tmp')) {
            const { data: publicUrlData } = supabase.storage.from('clips').getPublicUrl(data.thumbnail_path)
            setThumbnailUrl(publicUrlData.publicUrl)
          }

          // Get Video URL
          if (data.storage_path && !data.storage_path.includes('tmp')) {
            const { data: publicVideoData } = supabase.storage.from('clips').getPublicUrl(data.storage_path)
            setVideoUrl(publicVideoData.publicUrl)
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
    const num = parseFloat(value)
    if (!isNaN(num)) {
      updated[index][field] = num
      setWords(updated)
    }
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
    const currentTime = videoRef.current.currentTime
    
    // Find active word based on currentTime
    // Since the subtitles are for the segment, the segment's start time in the video is 0!
    // The words array generated by whisper has 'start' and 'end' relative to the clip itself.
    const currentIndex = words.findIndex(w => currentTime >= w.start && currentTime <= w.end)
    setActiveWordIndex(currentIndex)
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
        positionY: positionY
      }

      const res = await fetch(`http://localhost:8000/api/clips/${params.id}/subtitles`, {
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

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDownloading(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      // Hit render endpoint to burn subtitles
      const res = await fetch(`http://localhost:8000/api/clips/${params.id}/render`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      if (!res.ok) {
        throw new Error("Render failed")
      }

      const data = await res.json()
      const subbedVideoUrl = data.url

      if (subbedVideoUrl) {
        const link = document.createElement('a')
        link.href = subbedVideoUrl
        link.setAttribute('download', `metisclip-${params.id}-subbed.mp4`)
        link.target = '_blank'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      }
    } catch (err) {
      console.error("Download render error:", err)
      alert("Terjadi kesalahan saat memproses pembakaran subtitle. Silakan coba lagi.")
    } finally {
      setIsDownloading(false)
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
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      {/* Back navigation */}
      <a href="/clips" style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        color: 'var(--text-dim)',
        textDecoration: 'none',
        marginBottom: '30px',
        fontSize: '15px'
      }}>
        <ArrowLeft size={16} /> Kembali ke Galeri
      </a>

      {/* Editor layout grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '40px', alignItems: 'start' }}>
        
        {/* Left Vertical 9:16 Video Player Preview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div ref={containerRef} className="glass-card-glowing" style={{
            width: '100%',
            aspectRatio: '9 / 16',
            position: 'relative',
            borderRadius: '24px',
            background: '#030305',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            border: '2px solid var(--border-glass-glow)'
          }}>
            {/* Real Video Player */}
            <video
              ref={videoRef}
              src={videoUrl}
              poster={thumbnailUrl || 'https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?q=80&w=1080&auto=format&fit=crop'}
              onTimeUpdate={handleTimeUpdate}
              onEnded={handleVideoEnded}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              controls
              controlsList="nofullscreen"
              playsInline
              style={{
                position: 'absolute',
                top: 0, left: 0, width: '100%', height: '100%',
                objectFit: 'contain'
              }}
            />

            {/* Custom Fullscreen Button */}
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (document.fullscreenElement) {
                  document.exitFullscreen();
                } else {
                  containerRef.current?.requestFullscreen();
                }
              }}
              style={{
                position: 'absolute',
                top: '15px',
                right: '15px',
                zIndex: 20,
                background: 'rgba(0,0,0,0.5)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '8px',
                padding: '8px',
                cursor: 'pointer',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s'
              }}
              title="Toggle Fullscreen"
            >
              <Maximize size={18} />
            </button>

            {/* Active Highlight word rendered on video */}
            <div style={{
              position: 'absolute',
              bottom: `${positionY}px`,
              left: '15%',
              right: '15%',
              width: '70%',
              textAlign: 'center',
              zIndex: 10,
              pointerEvents: 'none'
            }}>
              {/* Dynamic subtitle render window */}
              <div style={{
                fontSize: `${fontSize - 12}px`,
                fontFamily: `'${fontFamily}', var(--font-display)`,
                fontWeight: fontWeight === 'Bold' || fontWeight === 'Black' ? 900 : (fontWeight === 'Medium' ? 500 : 400),
                color: fontColor,
                fontStyle: isItalic ? 'italic' : 'normal',
                textDecoration: isUnderline ? 'underline' : 'none',
                textTransform: isUppercase ? 'uppercase' : 'none',
                WebkitTextStroke: strokeWidth > 0 ? `${strokeWidth}px ${strokeColor}` : 'none',
                textShadow: hasShadow ? `${shadowX}px ${shadowY}px 0px ${shadowColor}` : (strokeWidth === 0 ? '2px 2px 0px #000, -2px -2px 0px #000, -2px 2px 0px #000, 2px -2px 0px #000' : 'none'),
                lineHeight: 1.2
              }}>
                {activeWordIndex !== -1 ? (
                  <>
                    {(() => {
                      const activePreset = presets.find(p => p.id === subtitleStyleMode);
                      if (!activePreset) return null;
                      return activePreset.renderPreview({
                        words,
                        activeWordIndex,
                        config: {
                          fontFamily, fontSize, fontWeight, fontColor, isItalic, isUnderline, isUppercase,
                          strokeColor, strokeWidth, hasShadow, shadowColor, shadowX, shadowY, shadowBlur,
                          highlightColor
                        }
                      });
                    })()}
                  </>
                ) : null}
              </div>
            </div>

          </div>

          {/* Quick styling controls block */}
          <div className="glass-panel" style={{ padding: '20px' }}>
            <h4 style={{ fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '15px' }}>
              <Palette size={16} color="var(--accent)" /> Subtitle Styling
            </h4>
            
            {/* Color selector */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Warna Highlight Aktif</span>
              <div style={{ display: 'flex', gap: '10px' }}>
                {['#06D6A0', '#7C3AED', '#F59E0B', '#EF4444', '#3B82F6'].map((color) => (
                  <button
                    key={color}
                    onClick={() => setHighlightColor(color)}
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: color,
                      border: highlightColor === color ? '2px solid #fff' : '2px solid transparent',
                      cursor: 'pointer',
                      boxShadow: highlightColor === color ? '0 0 10px rgba(255,255,255,0.4)' : 'none'
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Style Mode Selector */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Gaya Animasi</span>
              <div style={{ display: 'flex', gap: '10px' }}>
                {['classic', 'hormozi', 'bouncy', 'neon'].map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setSubtitleStyleMode(mode)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '8px',
                      background: subtitleStyleMode === mode ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                      border: subtitleStyleMode === mode ? '1px solid var(--primary-light)' : '1px solid var(--border-glass)',
                      color: subtitleStyleMode === mode ? '#fff' : 'var(--text-dim)',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 600,
                      textTransform: 'capitalize',
                      transition: 'all 0.2s'
                    }}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            {/* Font slider */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Ukuran Font ({fontSize}px)</span>
              <input
                type="range"
                min="30"
                max="60"
                value={fontSize}
                onChange={(e) => setFontSize(parseInt(e.target.value))}
                style={{ cursor: 'pointer', accentColor: 'var(--primary)' }}
              />
            </div>
            
            {/* Advanced Settings UI */}
            <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--border-glass)' }}>
              <h4 style={{ fontSize: '14px', marginBottom: '15px', color: 'var(--text-primary)' }}>Advanced Font Settings</h4>
              
              <SelectField
                options={[
                  'Acme', 'Alfa Slab One', 'Anton', 'Bangers', 'Bebas Neue', 'Black Ops One',
                  'Bungee', 'Carter One', 'Fredoka', 'Knewave', 'Lilita One', 'Luckiest Guy',
                  'Montserrat', 'Oswald', 'Passion One', 'Paytone One', 'Permanent Marker',
                  'Righteous', 'Roboto', 'Russo One', 'Sigmar One', 'Titan One'
                ].map(f => ({ value: f, label: f }))}
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value)}
                style={{ marginBottom: '15px' }}
              />

              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '15px' }}>
                <label style={{ width: '32px', height: '32px', borderRadius: '50%', background: fontColor, cursor: 'pointer', border: '2px solid rgba(255,255,255,0.2)', overflow: 'hidden' }}>
                  <input type="color" value={fontColor} onChange={(e) => setFontColor(e.target.value)} style={{ opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }} />
                </label>
                <div style={{ flex: 1 }}>
                  <SelectField
                    options={['Light', 'Regular', 'Medium', 'Semi-Bold', 'Bold', 'Black'].map(w => ({ value: w, label: w }))}
                    value={fontWeight}
                    onChange={(e) => setFontWeight(e.target.value)}
                  />
                </div>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-dim)' }}>Decoration</span>
                <div style={{ display: 'flex', gap: '15px' }}>
                  <button onClick={() => setIsItalic(!isItalic)} style={{ background: 'transparent', border: 'none', color: isItalic ? '#fff' : 'var(--text-muted)', fontStyle: 'italic', fontSize: '16px', cursor: 'pointer' }}>I</button>
                  <button onClick={() => setIsUnderline(!isUnderline)} style={{ background: 'transparent', border: 'none', color: isUnderline ? '#fff' : 'var(--text-muted)', textDecoration: 'underline', fontSize: '16px', cursor: 'pointer' }}>U</button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-dim)' }}>Uppercase</span>
                <ToggleSwitch checked={isUppercase} onChange={setIsUppercase} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-dim)' }}>Font stroke</span>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <label style={{ width: '24px', height: '24px', borderRadius: '50%', background: strokeColor, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.2)', overflow: 'hidden' }}>
                    <input type="color" value={strokeColor} onChange={(e) => setStrokeColor(e.target.value)} style={{ opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }} />
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '0 10px', border: '1px solid var(--border-glass)', width: '80px' }}>
                    <input type="number" value={strokeWidth} onChange={(e) => setStrokeWidth(Number(e.target.value))} style={{ background: 'transparent', border: 'none', color: '#fff', width: '30px', padding: '6px 0', outline: 'none' }} />
                    <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>px</span>
                  </div>
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-dim)' }}>Font shadows</span>
                  <ToggleSwitch checked={hasShadow} onChange={setHasShadow} />
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', opacity: hasShadow ? 1 : 0.5, pointerEvents: hasShadow ? 'auto' : 'none' }}>
                  <label style={{ width: '24px', height: '24px', borderRadius: '50%', background: shadowColor, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.2)', overflow: 'hidden', flexShrink: 0 }}>
                    <input type="color" value={shadowColor} onChange={(e) => setShadowColor(e.target.value)} style={{ opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }} />
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '0 8px', border: '1px solid var(--border-glass)' }}>
                    <input type="number" value={shadowX} onChange={(e) => setShadowX(Number(e.target.value))} style={{ background: 'transparent', border: 'none', color: '#fff', width: '25px', padding: '6px 0', outline: 'none' }} />
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>x</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '0 8px', border: '1px solid var(--border-glass)' }}>
                    <input type="number" value={shadowY} onChange={(e) => setShadowY(Number(e.target.value))} style={{ background: 'transparent', border: 'none', color: '#fff', width: '25px', padding: '6px 0', outline: 'none' }} />
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>y</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Interactive Subtitle Transcription Modifier Panel */}
        <div className="glass-card-glowing" style={{ padding: '30px', display: 'flex', flexDirection: 'column', gap: '25px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-glass)', paddingBottom: '20px' }}>
            <div>
              <h2 style={{ fontSize: '22px', fontWeight: 800 }}>Daftar Transkrip Kata</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Edit kata-kata transkrip atau timing timestamps di bawah ini.</p>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                className="btn-secondary" 
                style={{ padding: '10px 20px', fontSize: '14px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-glass)', color: '#fff', borderRadius: '8px', cursor: isDownloading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'background 0.2s', opacity: isDownloading ? 0.7 : 1 }} 
                onClick={handleDownload}
                onMouseOver={(e) => { if(!isDownloading) e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
                onMouseOut={(e) => { if(!isDownloading) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                disabled={isDownloading}
              >
                {isDownloading ? (
                  <>Membakar Subtitle... <Loader2 size={16} className="animate-spin" /></>
                ) : (
                  <>Download <Download size={16} /></>
                )}
              </button>
              <button className="btn-primary" style={{ padding: '10px 20px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={handleSave}>
                {isSaved ? (
                  <>Tersimpan <Check size={16} /></>
                ) : (
                  <>Simpan Perubahan <Save size={16} /></>
                )}
              </button>
            </div>
          </div>

          {/* Subtitle Words List Scrollable Container */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '420px', overflowY: 'auto', paddingRight: '10px' }}>
            {words.map((item, index) => (
              <div
                key={index}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 100px 100px',
                  gap: '15px',
                  alignItems: 'center',
                  background: activeWordIndex === index ? 'rgba(6,214,160,0.06)' : 'rgba(255,255,255,0.01)',
                  border: activeWordIndex === index ? '1px solid rgba(6,214,160,0.3)' : '1px solid var(--border-glass)',
                  padding: '10px 15px',
                  borderRadius: '12px',
                  transition: 'all 0.2s ease'
                }}
              >
                {/* Word Text Input */}
                <input
                  type="text"
                  value={item.word}
                  onChange={(e) => handleWordTextChange(index, e.target.value)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#fff',
                    fontSize: '15px',
                    fontWeight: 600,
                    outline: 'none',
                    width: '100%'
                  }}
                />

                {/* Start Time timestamp input */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Mulai:</span>
                  <input
                    type="text"
                    value={item.start}
                    onChange={(e) => handleWordTimingChange(index, 'start', e.target.value)}
                    style={{
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid var(--border-glass)',
                      borderRadius: '6px',
                      color: 'var(--text-dim)',
                      width: '55px',
                      padding: '4px',
                      textAlign: 'center',
                      fontSize: '12px'
                    }}
                  />
                </div>

                {/* End Time timestamp input */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Selesai:</span>
                  <input
                    type="text"
                    value={item.end}
                    onChange={(e) => handleWordTimingChange(index, 'end', e.target.value)}
                    style={{
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid var(--border-glass)',
                      borderRadius: '6px',
                      color: 'var(--text-dim)',
                      width: '55px',
                      padding: '4px',
                      textAlign: 'center',
                      fontSize: '12px'
                    }}
                  />
                </div>
              </div>
            ))}
          </div>


        </div>

      </div>
    </div>
  )
}
