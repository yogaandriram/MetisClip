'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { Undo, Redo, Layout, Type, Image as ImageIcon, Video, Music, Wand2, Settings, MessageSquare, ListVideo, Sparkles, ChevronDown } from 'lucide-react'
import { useAgent } from '@/contexts/AgentContext'
import toast from 'react-hot-toast'
import { Button } from '../../../components/ui/Button'
import { ToggleSwitch } from '../../../components/ui/ToggleSwitch'
import { Tabs } from '../../../components/ui/Tabs'
import { SelectField } from '../../../components/ui/SelectField'
import { GlassCard } from '../../../components/ui/GlassCard'
import { Dropdown } from '../../../components/ui/Dropdown'

export default function BrandTemplatePage() {
  const { activeAgent } = useAgent()
  const supabase = createClientComponentClient()
  
  const [templates, setTemplates] = useState<any[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  
  // Settings State
  const [layoutAspect, setLayoutAspect] = useState('9:16')
  const [layoutFit, setLayoutFit] = useState('Fill')
  const [subtitleStyleMode, setSubtitleStyleMode] = useState('popart')
  const [highlightColor, setHighlightColor] = useState('#06D6A0')
  const [captionTab, setCaptionTab] = useState('presets')
  const [fontFamily, setFontFamily] = useState('Bangers')
  const [fontSize, setFontSize] = useState(50)
  const [fontWeight, setFontWeight] = useState('Bold')
  const [fontColor, setFontColor] = useState('#FFFFFF')
  const [isItalic, setIsItalic] = useState(false)
  const [isUnderline, setIsUnderline] = useState(false)
  const [isUppercase, setIsUppercase] = useState(false)
  const [strokeColor, setStrokeColor] = useState('#000000')
  const [strokeWidth, setStrokeWidth] = useState(0)
  const [hasShadow, setHasShadow] = useState(false)
  const [shadowColor, setShadowColor] = useState('#000000')
  const [shadowX, setShadowX] = useState(0)
  const [shadowY, setShadowY] = useState(0)
  const [shadowBlur, setShadowBlur] = useState(0)

  const [aiFillerWords, setAiFillerWords] = useState(false)
  const [aiPauses, setAiPauses] = useState(false)
  const [aiKeywords, setAiKeywords] = useState(true)
  const [aiEmojis, setAiEmojis] = useState(true)

  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (activeAgent) {
      fetchTemplates()
    } else {
      setTemplates([])
      setSelectedTemplateId('')
    }
  }, [activeAgent])

  const fetchTemplates = async () => {
    if (!activeAgent) return
    const { data, error } = await supabase
      .from('brand_templates')
      .select('*')
      .eq('agent_id', activeAgent.id)
      
    if (error) {
      toast.error('Gagal mengambil template')
      return
    }
    
    if (data && data.length > 0) {
      setTemplates(data)
      setSelectedTemplateId(data[0].id)
      applyTemplateData(data[0])
    } else {
      // Create default
      const defaultData = {
        name: 'Preset template 1',
        agent_id: activeAgent.id,
        user_id: activeAgent.user_id,
        layout_settings: { aspect: '9:16', fit: 'Fill' },
        caption_settings: { preset: 'TO GET STARTED' },
        ai_settings: { fillerWords: false, pauses: false, keywords: true, emojis: true }
      }
      
      const { data: newDoc, error: createErr } = await supabase
        .from('brand_templates')
        .insert(defaultData)
        .select()
        .single()
        
      if (!createErr && newDoc) {
        setTemplates([newDoc])
        setSelectedTemplateId(newDoc.id)
        applyTemplateData(newDoc)
      }
    }
  }

  const applyTemplateData = (tpl: any) => {
    setLayoutAspect(tpl.layout_settings?.aspect || '9:16')
    setLayoutFit(tpl.layout_settings?.fit || 'Fill')
    setSubtitleStyleMode(tpl.caption_settings?.mode || 'popart')
    setHighlightColor(tpl.caption_settings?.highlightColor || '#06D6A0')
    setFontFamily(tpl.caption_settings?.fontFamily || 'Bangers')
    setFontSize(tpl.caption_settings?.fontSize || 50)
    setFontWeight(tpl.caption_settings?.fontWeight || 'Bold')
    setFontColor(tpl.caption_settings?.fontColor || '#FFFFFF')
    setIsItalic(tpl.caption_settings?.isItalic || false)
    setIsUnderline(tpl.caption_settings?.isUnderline || false)
    setIsUppercase(tpl.caption_settings?.isUppercase || false)
    setStrokeColor(tpl.caption_settings?.strokeColor || '#000000')
    setStrokeWidth(tpl.caption_settings?.strokeWidth || 0)
    setHasShadow(tpl.caption_settings?.hasShadow || false)
    setShadowColor(tpl.caption_settings?.shadowColor || '#000000')
    setShadowX(tpl.caption_settings?.shadowX || 0)
    setShadowY(tpl.caption_settings?.shadowY || 0)
    setShadowBlur(tpl.caption_settings?.shadowBlur || 0)
    
    setAiFillerWords(tpl.ai_settings?.fillerWords || false)
    setAiPauses(tpl.ai_settings?.pauses || false)
    setAiKeywords(tpl.ai_settings?.keywords ?? true)
    setAiEmojis(tpl.ai_settings?.emojis ?? true)
  }

  const handleTemplateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const tId = e.target.value
    if (tId === 'create_new') {
      createNewTemplate()
      return
    }
    setSelectedTemplateId(tId)
    const tpl = templates.find(t => t.id === tId)
    if (tpl) applyTemplateData(tpl)
  }

  const createNewTemplate = async () => {
    if (!activeAgent) return
    const newName = `Preset template ${templates.length + 1}`
    const newData = {
      name: newName,
      agent_id: activeAgent.id,
      user_id: activeAgent.user_id,
      layout_settings: { aspect: layoutAspect, fit: layoutFit },
      caption_settings: { 
        mode: subtitleStyleMode,
        fontFamily, fontSize, fontWeight, fontColor, isItalic, isUnderline, isUppercase,
        strokeColor, strokeWidth, hasShadow, shadowColor, shadowX, shadowY, shadowBlur,
        highlightColor
      },
      ai_settings: { fillerWords: aiFillerWords, pauses: aiPauses, keywords: aiKeywords, emojis: aiEmojis }
    }
    
    const { data: newDoc, error } = await supabase
      .from('brand_templates')
      .insert(newData)
      .select()
      .single()
      
    if (!error && newDoc) {
      setTemplates([...templates, newDoc])
      setSelectedTemplateId(newDoc.id)
      toast.success('Template baru dibuat')
    }
  }

  const saveTemplate = async () => {
    if (!selectedTemplateId) return
    setIsLoading(true)
    const updateData = {
      layout_settings: { aspect: layoutAspect, fit: layoutFit },
      caption_settings: { 
        mode: subtitleStyleMode,
        fontFamily, fontSize, fontWeight, fontColor, isItalic, isUnderline, isUppercase,
        strokeColor, strokeWidth, hasShadow, shadowColor, shadowX, shadowY, shadowBlur,
        highlightColor
      },
      ai_settings: { fillerWords: aiFillerWords, pauses: aiPauses, keywords: aiKeywords, emojis: aiEmojis }
    }
    
    const { error } = await supabase
      .from('brand_templates')
      .update(updateData)
      .eq('id', selectedTemplateId)
      
    if (error) {
      toast.error('Gagal menyimpan template')
    } else {
      toast.success('Template disimpan!')
      // Update local state
      setTemplates(templates.map(t => t.id === selectedTemplateId ? { ...t, ...updateData } : t))
    }
    setIsLoading(false)
  }

  const renderActiveMenuContent = () => {
    if (activeMenu === 'layout') {
      return (
        <GlassCard padding="20px" style={{ width: '300px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px' }}>Layout</h3>
          
          <div style={{ marginBottom: '20px' }}>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '10px' }}>Aspect ratio:</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {['9:16', '1:1', '16:9', '4:5'].map(ar => (
                <button
                  key={ar}
                  onClick={() => setLayoutAspect(ar)}
                  style={{
                    padding: '8px',
                    borderRadius: '8px',
                    background: layoutAspect === ar ? 'var(--bg-glass-active)' : 'transparent',
                    border: `1px solid ${layoutAspect === ar ? 'var(--primary)' : 'var(--border-glass)'}`,
                    color: layoutAspect === ar ? 'var(--text-primary)' : 'var(--text-muted)',
                    cursor: 'pointer'
                  }}
                >
                  {ar}
                </button>
              ))}
            </div>
          </div>
          
          <div>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '10px' }}>Layout</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {['Fill', 'Fit', 'Three', 'Four', 'Split'].map(l => (
                <button
                  key={l}
                  onClick={() => setLayoutFit(l)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    background: layoutFit === l ? '#fff' : 'transparent',
                    color: layoutFit === l ? '#000' : 'var(--text-primary)',
                    border: '1px solid var(--border-glass)',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: layoutFit === l ? 600 : 400
                  }}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        </GlassCard>
      )
    }

    if (activeMenu === 'caption') {
      return (
        <GlassCard padding="20px" style={{ width: '380px', height: '610px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexShrink: 0 }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Caption</h3>
          </div>
          
          <Tabs 
            tabs={[
              { id: 'presets', label: 'Presets' },
              { id: 'font', label: 'Font' },
              { id: 'effects', label: 'Effects' }
            ]}
            activeTab={captionTab}
            onChange={setCaptionTab}
            style={{ marginBottom: '20px', width: '100%', justifyContent: 'center' }}
          />

          {captionTab === 'presets' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              {['popart', 'glitch', 'cinematic', 'retro', 'typewriter', 'boldbox', 'outlineonly', '3dblock', 'minimalpill', 'marker', 'vaporwave', 'impactful'].map(p => {
                let btnStyle: React.CSSProperties = { 
                  fontSize: '14px', 
                  fontWeight: 800, 
                  color: subtitleStyleMode === p ? highlightColor : 'var(--text-primary)',
                  display: 'inline-block',
                  transition: 'all 0.2s ease'
                }
                switch (p) {
                  case 'popart':
                    btnStyle = { ...btnStyle, fontFamily: "'Luckiest Guy', var(--font-display)", textTransform: 'uppercase', WebkitTextStroke: '1px #000', textShadow: '2px 2px 0 #000', transform: subtitleStyleMode === p ? 'scale(1.1) rotate(-2deg)' : 'none' }
                    break
                  case 'glitch':
                    btnStyle = { ...btnStyle, fontFamily: "'Black Ops One', var(--font-display)", textShadow: subtitleStyleMode === p ? `2px 0 0 #0ff, -2px 0 0 #f00` : 'none' }
                    break
                  case 'cinematic':
                    btnStyle = { ...btnStyle, fontFamily: "'Montserrat', var(--font-display)", letterSpacing: '4px', fontWeight: 400, textTransform: 'uppercase', color: subtitleStyleMode === p ? '#FDE047' : 'var(--text-primary)' }
                    break
                  case 'retro':
                    btnStyle = { ...btnStyle, fontFamily: "'Knewave', var(--font-display)", fontStyle: 'italic', textShadow: subtitleStyleMode === p ? `0 0 10px #ff00ff, 0 0 20px #ff00ff` : 'none' }
                    break
                  case 'typewriter':
                    btnStyle = { ...btnStyle, fontFamily: "'JetBrains Mono', monospace", fontWeight: 'normal', color: subtitleStyleMode === p ? '#4ade80' : 'var(--text-primary)' }
                    break
                  case 'boldbox':
                    btnStyle = { ...btnStyle, fontFamily: "'Anton', var(--font-display)", textTransform: 'uppercase', background: subtitleStyleMode === p ? highlightColor : '#000', color: subtitleStyleMode === p ? '#000' : '#fff', padding: '2px 8px' }
                    break
                  case 'outlineonly':
                    btnStyle = { ...btnStyle, fontFamily: "'Bebas Neue', var(--font-display)", fontSize: '18px', color: subtitleStyleMode === p ? highlightColor : 'transparent', WebkitTextStroke: `1px ${subtitleStyleMode === p ? 'transparent' : '#fff'}` }
                    break
                  case '3dblock':
                    btnStyle = { ...btnStyle, fontFamily: "'Titan One', var(--font-display)", color: subtitleStyleMode === p ? highlightColor : '#fff', textShadow: subtitleStyleMode === p ? `1px 1px 0 #000, 2px 2px 0 #000, 3px 3px 0 #000` : `1px 1px 0 #000`, transform: subtitleStyleMode === p ? 'translateY(-3px)' : 'none' }
                    break
                  case 'minimalpill':
                    btnStyle = { ...btnStyle, fontFamily: "'Plus Jakarta Sans', var(--font-sans)", fontSize: '13px', background: 'rgba(0,0,0,0.5)', padding: '4px 12px', borderRadius: '20px', color: subtitleStyleMode === p ? highlightColor : '#fff' }
                    break
                  case 'marker':
                    btnStyle = { ...btnStyle, fontFamily: "'Permanent Marker', var(--font-display)", transform: 'rotate(-2deg)', background: subtitleStyleMode === p ? highlightColor : 'transparent', color: subtitleStyleMode === p ? '#000' : '#fff', padding: '2px 6px' }
                    break
                  case 'vaporwave':
                    btnStyle = { ...btnStyle, fontFamily: "'Righteous', var(--font-display)", color: subtitleStyleMode === p ? '#c084fc' : '#fff', textShadow: subtitleStyleMode === p ? `2px 2px 4px #2dd4bf` : 'none' }
                    break
                  case 'impactful':
                    btnStyle = { ...btnStyle, fontFamily: "'Oswald', var(--font-display)", textTransform: 'uppercase', fontWeight: 900, background: subtitleStyleMode === p ? '#dc2626' : 'transparent', padding: '0 6px' }
                    break
                }

                const handlePresetSelect = () => {
                  setSubtitleStyleMode(p)
                  switch(p) {
                    case 'popart': setFontFamily('Luckiest Guy'); setHighlightColor('#FFD700'); setIsUppercase(true); setStrokeWidth(2); setStrokeColor('#000000'); setHasShadow(true); setShadowColor('#000000'); setShadowX(4); setShadowY(4); setShadowBlur(0); break;
                    case 'glitch': setFontFamily('Black Ops One'); setHighlightColor('#00FFFF'); setIsUppercase(true); setStrokeWidth(0); setHasShadow(false); break;
                    case 'cinematic': setFontFamily('Montserrat'); setHighlightColor('#FDE047'); setIsUppercase(true); setFontWeight('Regular'); setStrokeWidth(0); setHasShadow(false); break;
                    case 'retro': setFontFamily('Knewave'); setHighlightColor('#FF00FF'); setIsItalic(true); setStrokeWidth(0); setHasShadow(false); break;
                    case 'typewriter': setFontFamily('Roboto'); setHighlightColor('#4ade80'); setIsUppercase(false); setFontWeight('Regular'); setStrokeWidth(0); setHasShadow(false); break;
                    case 'boldbox': setFontFamily('Anton'); setHighlightColor('#FFD700'); setIsUppercase(true); setStrokeWidth(0); setHasShadow(false); break;
                    case 'outlineonly': setFontFamily('Bebas Neue'); setHighlightColor('#06D6A0'); setIsUppercase(true); setStrokeWidth(2); setStrokeColor('#FFFFFF'); setHasShadow(false); break;
                    case '3dblock': setFontFamily('Titan One'); setHighlightColor('#FFD700'); setIsUppercase(true); setStrokeWidth(0); setHasShadow(true); setShadowColor('#000000'); setShadowX(4); setShadowY(4); setShadowBlur(0); break;
                    case 'minimalpill': setFontFamily('Plus Jakarta Sans'); setHighlightColor('#06D6A0'); setIsUppercase(false); setFontWeight('Medium'); setStrokeWidth(0); setHasShadow(false); break;
                    case 'marker': setFontFamily('Permanent Marker'); setHighlightColor('#FFFF00'); setIsUppercase(true); setStrokeWidth(0); setHasShadow(false); break;
                    case 'vaporwave': setFontFamily('Righteous'); setHighlightColor('#c084fc'); setIsUppercase(true); setStrokeWidth(0); setHasShadow(true); setShadowColor('#2dd4bf'); setShadowX(3); setShadowY(3); setShadowBlur(5); break;
                    case 'impactful': setFontFamily('Oswald'); setHighlightColor('#dc2626'); setIsUppercase(true); setFontWeight('Black'); setStrokeWidth(0); setHasShadow(true); setShadowColor('#000000'); setShadowX(2); setShadowY(2); setShadowBlur(0); break;
                  }
                }
                
                return (
                <button
                  key={p}
                  onClick={handlePresetSelect}
                  style={{
                    height: '80px',
                    borderRadius: '12px',
                    background: subtitleStyleMode === p ? 'var(--bg-glass-active)' : 'rgba(255,255,255,0.05)',
                    border: `2px solid ${subtitleStyleMode === p ? 'var(--primary)' : 'transparent'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                    cursor: 'pointer'
                  }}
                >
                  <span style={btnStyle}>
                    {p}
                  </span>
                </button>
              )})}
            </div>
          )}

          {captionTab === 'font' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600 }}>Font settings</span>
                  <span style={{ transform: 'rotate(180deg)' }}>^</span>
                </div>
                
                <Dropdown
                  width="100%"
                  trigger={
                    <div style={{ 
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                      background: 'rgba(255,255,255,0.05)', padding: '10px 14px', 
                      borderRadius: '10px', border: '1px solid var(--border-glass)',
                      marginBottom: '15px'
                    }}>
                      <span style={{ fontSize: '14px' }}>{fontFamily}</span>
                      <ChevronDown size={16} color="var(--text-muted)" />
                    </div>
                  }
                  items={[
                    'Acme', 'Alfa Slab One', 'Anton', 'Bangers', 'Bebas Neue', 'Black Ops One',
                    'Bungee', 'Carter One', 'Fredoka', 'Knewave', 'Lilita One', 'Luckiest Guy',
                    'Montserrat', 'Oswald', 'Passion One', 'Paytone One', 'Permanent Marker',
                    'Righteous', 'Roboto', 'Russo One', 'Sigmar One', 'Titan One'
                  ].map(f => ({
                    id: f,
                    label: f,
                    onClick: () => setFontFamily(f)
                  }))}
                />

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <label style={{ width: '32px', height: '32px', borderRadius: '50%', background: fontColor, cursor: 'pointer', border: '2px solid rgba(255,255,255,0.2)', overflow: 'hidden' }}>
                    <input type="color" value={fontColor} onChange={(e) => setFontColor(e.target.value)} style={{ opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }} />
                  </label>
                  
                  <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '0 10px', border: '1px solid var(--border-glass)', width: '90px' }}>
                    <input type="number" value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} style={{ background: 'transparent', border: 'none', color: '#fff', width: '40px', padding: '8px 0', outline: 'none' }} />
                    <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>px</span>
                  </div>

                  <div style={{ flex: 1 }}>
                    <Dropdown
                      width="100%"
                      trigger={
                        <div style={{ 
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                          background: 'rgba(255,255,255,0.05)', padding: '8px 12px', 
                          borderRadius: '8px', border: '1px solid var(--border-glass)' 
                        }}>
                          <span style={{ fontSize: '13px' }}>{fontWeight}</span>
                          <ChevronDown size={14} color="var(--text-muted)" />
                        </div>
                      }
                      items={['Light', 'Regular', 'Medium', 'Semi-Bold', 'Bold', 'Black'].map(w => ({
                        id: w,
                        label: w,
                        onClick: () => setFontWeight(w)
                      }))}
                    />
                  </div>
                </div>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-dim)' }}>Decoration</span>
                <div style={{ display: 'flex', gap: '15px' }}>
                  <button onClick={() => setIsItalic(!isItalic)} style={{ background: 'transparent', border: 'none', color: isItalic ? '#fff' : 'var(--text-muted)', fontStyle: 'italic', fontSize: '16px', cursor: 'pointer' }}>I</button>
                  <button onClick={() => setIsUnderline(!isUnderline)} style={{ background: 'transparent', border: 'none', color: isUnderline ? '#fff' : 'var(--text-muted)', textDecoration: 'underline', fontSize: '16px', cursor: 'pointer' }}>U</button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-dim)' }}>Uppercase</span>
                <ToggleSwitch checked={isUppercase} onChange={setIsUppercase} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                  <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '0 8px', border: '1px solid var(--border-glass)' }}>
                    <input type="number" value={shadowBlur} onChange={(e) => setShadowBlur(Number(e.target.value))} style={{ background: 'transparent', border: 'none', color: '#fff', width: '25px', padding: '6px 0', outline: 'none' }} />
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>blur</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {captionTab === 'effects' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-dim)' }}>Highlight Color (Active word)</span>
                <label style={{ width: '32px', height: '32px', borderRadius: '50%', background: highlightColor, cursor: 'pointer', border: '2px solid rgba(255,255,255,0.2)', overflow: 'hidden' }}>
                  <input type="color" value={highlightColor} onChange={(e) => setHighlightColor(e.target.value)} style={{ opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }} />
                </label>
              </div>
            </div>
          )}

        </GlassCard>
      )
    }
    
    return null
  }

  const MenuItem = ({ icon: Icon, label, value, id }: any) => {
    const isActive = activeMenu === id
    return (
      <div 
        onClick={() => setActiveMenu(isActive ? null : id)}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          cursor: 'pointer',
          borderRadius: '8px',
          background: isActive ? 'var(--bg-glass-active)' : 'transparent',
          marginBottom: '4px',
          transition: 'all 0.2s'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Icon size={18} color="var(--text-muted)" />
          <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>{label}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{value}</span>
          <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{'>'}</span>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '20px', borderBottom: '1px solid var(--border-glass)', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 800 }}>Brand template</h1>
          <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Quickly setup your video template</span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ width: '250px' }}>
            <Dropdown 
              width="250px"
              trigger={
                <div style={{ 
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                  background: 'rgba(255,255,255,0.05)', padding: '10px 16px', 
                  borderRadius: '12px', border: '1px solid var(--border-glass)'
                }}>
                  <span style={{ fontSize: '14px', fontWeight: 600 }}>
                    {templates.find(t => t.id === selectedTemplateId)?.name || 'Pilih Template'}
                  </span>
                  <ChevronDown size={16} color="var(--text-muted)" />
                </div>
              }
              items={[
                ...templates.map(t => ({
                  id: t.id,
                  label: t.name,
                  onClick: () => {
                    setSelectedTemplateId(t.id)
                    applyTemplateData(t)
                  }
                })),
                {
                  id: 'create_new',
                  label: '+ Create new template',
                  onClick: createNewTemplate
                }
              ]}
            />
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><Undo size={20} /></button>
            <button style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><Redo size={20} /></button>
          </div>
          <Button variant="primary" onClick={saveTemplate} loading={isLoading}>
            Save template
          </Button>
        </div>
      </div>

      {!activeAgent ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <p>Please select a Super Agent first.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flex: 1, gap: '10px' }}>
          {/* Left Sidebar */}
          <GlassCard style={{ width: '300px', height: '610px', padding: '20px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '20px' }}>Setting</h2>
            
            <div style={{ marginBottom: '24px' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', paddingLeft: '8px' }}>Style</p>
              <MenuItem id="layout" icon={Layout} label="Clip layout settings" value={layoutAspect} />
              <MenuItem id="caption" icon={Type} label="Caption" value="Bangers 40" />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', paddingLeft: '8px' }}>Brand</p>
              <MenuItem id="overlay" icon={ImageIcon} label="Overlay (logo, CTA)" value="" />
              <MenuItem id="intro_outro" icon={Video} label="Intro/outro" value="" />
              <MenuItem id="music" icon={Music} label="Music" value="" />
            </div>

            <div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', paddingLeft: '8px' }}>AI</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', padding: '8px' }}>
                <ToggleSwitch label="Remove filler words" checked={aiFillerWords} onChange={setAiFillerWords} />
                <ToggleSwitch label="Remove pauses" checked={aiPauses} onChange={setAiPauses} />
                <ToggleSwitch label="AI keywords highlighter" checked={aiKeywords} onChange={setAiKeywords} />
                <ToggleSwitch label="AI emojis" checked={aiEmojis} onChange={setAiEmojis} />
              </div>
            </div>
          </GlassCard>

          {/* Active Popover/Submenu */}
          {activeMenu && renderActiveMenuContent()}

          {/* Center Canvas */}
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: '16px', position: 'relative' }}>
             {/* Mock Mobile Screen */}
             <div style={{ 
               width: '300px', 
               height: '533px', 
               background: '#1A1A2E', 
               borderRadius: '16px',
               border: '4px solid #333',
               position: 'relative',
               overflow: 'hidden',
               display: 'flex',
               flexDirection: 'column',
               justifyContent: 'center',
               alignItems: 'center'
             }}>
               {/* Mock Video Content */}
               <img src="https://images.unsplash.com/photo-1594909122845-11baa439b7bf?q=80&w=300&h=533&auto=format&fit=crop" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }} alt="Mock preview" />
               
               {/* Overlay elements */}
               <div style={{ position: 'absolute', top: '20px', left: '20px', background: 'rgba(0,0,0,0.5)', padding: '4px 8px', borderRadius: '12px', fontSize: '10px' }}>Demo</div>
               <div style={{ position: 'absolute', top: '20px', right: '0', width: '100%', textAlign: 'center', fontFamily: 'var(--font-display)', color: '#A855F7', fontWeight: 800, fontSize: '24px', textShadow: '2px 2px 0px #000' }}>SaveHerSpace</div>
               
               {/* Mock Caption */}
               <div style={{ position: 'absolute', bottom: '80px', width: '80%', textAlign: 'center' }}>
                 <div style={{ 
                    fontFamily: `'${fontFamily}', var(--font-display)`,
                    fontSize: `${fontSize * 0.5}px`, 
                    fontStyle: isItalic ? 'italic' : 'normal',
                    textDecoration: isUnderline ? 'underline' : 'none',
                    textTransform: isUppercase ? 'uppercase' : 'none',
                    WebkitTextStroke: strokeWidth > 0 ? `${strokeWidth}px ${strokeColor}` : 'none',
                    textShadow: hasShadow ? `${shadowX}px ${shadowY}px 0px ${shadowColor}` : (strokeWidth === 0 ? '2px 2px 0px #000, -2px -2px 0px #000, -2px 2px 0px #000, 2px -2px 0px #000' : 'none'),
                    fontWeight: fontWeight === 'Bold' || fontWeight === 'Black' ? 900 : (fontWeight === 'Medium' ? 500 : 400),
                    lineHeight: 1.2,
                    display: 'flex',
                    justifyContent: 'center',
                    gap: '8px'
                 }}>
                    {subtitleStyleMode === 'popart' && (
                      <>
                        <span style={{ color: fontColor, transform: 'rotate(-2deg)' }}>POPART</span>
                        <span style={{ color: highlightColor, transform: 'scale(1.2) rotate(-4deg)', display: 'inline-block' }}>CAPTIONS</span>
                      </>
                    )}
                    {subtitleStyleMode === 'glitch' && (
                      <>
                        <span style={{ color: fontColor }}>GLITCH</span>
                        <span style={{ color: highlightColor, textShadow: `2px 0 0 #0ff, -2px 0 0 #f00`, transform: 'skewX(-10deg)', display: 'inline-block' }}>CAPTIONS</span>
                      </>
                    )}
                    {subtitleStyleMode === 'cinematic' && (
                      <>
                        <span style={{ color: fontColor, letterSpacing: '6px' }}>CINEMATIC</span>
                        <span style={{ color: highlightColor, letterSpacing: '6px' }}>CAPTIONS</span>
                      </>
                    )}
                    {subtitleStyleMode === 'retro' && (
                      <>
                        <span style={{ color: fontColor }}>RETRO</span>
                        <span style={{ color: highlightColor, textShadow: `0 0 10px ${highlightColor}, 0 0 20px ${highlightColor}` }}>CAPTIONS</span>
                      </>
                    )}
                    {subtitleStyleMode === 'typewriter' && (
                      <>
                        <span style={{ color: fontColor }}>TYPEWRITER</span>
                        <span style={{ color: highlightColor }}>CAPTIONS_</span>
                      </>
                    )}
                    {subtitleStyleMode === 'boldbox' && (
                      <>
                        <span style={{ color: '#fff', background: '#000', padding: '2px 8px' }}>BOLDBOX</span>
                        <span style={{ color: '#000', background: highlightColor, padding: '2px 8px' }}>CAPTIONS</span>
                      </>
                    )}
                    {subtitleStyleMode === 'outlineonly' && (
                      <>
                        <span style={{ color: 'transparent', WebkitTextStroke: `2px ${fontColor}` }}>OUTLINE</span>
                        <span style={{ color: highlightColor, WebkitTextStroke: '2px transparent' }}>CAPTIONS</span>
                      </>
                    )}
                    {subtitleStyleMode === '3dblock' && (
                      <>
                        <span style={{ color: fontColor }}>3DBLOCK</span>
                        <span style={{ color: highlightColor, transform: 'translateY(-4px)', display: 'inline-block' }}>CAPTIONS</span>
                      </>
                    )}
                    {subtitleStyleMode === 'minimalpill' && (
                      <>
                        <span style={{ color: fontColor, background: 'rgba(0,0,0,0.5)', padding: '6px 16px', borderRadius: '30px' }}>MINIMAL</span>
                        <span style={{ color: highlightColor, background: 'rgba(0,0,0,0.8)', padding: '6px 16px', borderRadius: '30px' }}>CAPTIONS</span>
                      </>
                    )}
                    {subtitleStyleMode === 'marker' && (
                      <>
                        <span style={{ color: fontColor }}>MARKER</span>
                        <span style={{ color: '#000', background: highlightColor, padding: '4px 10px', transform: 'rotate(-3deg)', display: 'inline-block' }}>CAPTIONS</span>
                      </>
                    )}
                    {subtitleStyleMode === 'vaporwave' && (
                      <>
                        <span style={{ color: fontColor }}>VAPOR</span>
                        <span style={{ color: highlightColor }}>CAPTIONS</span>
                      </>
                    )}
                    {subtitleStyleMode === 'impactful' && (
                      <>
                        <span style={{ color: fontColor }}>IMPACTFUL</span>
                        <span style={{ color: '#fff', background: highlightColor, padding: '0 8px' }}>CAPTIONS</span>
                      </>
                    )}
                 </div>
                 {aiEmojis && <div style={{ fontSize: '30px', marginTop: '10px' }}>🥰</div>}
               </div>

               {/* Mock Timeline */}
               <div style={{ position: 'absolute', bottom: '15px', width: '90%', height: '4px', background: 'rgba(255,255,255,0.3)', borderRadius: '2px' }}>
                 <div style={{ width: '30%', height: '100%', background: 'var(--primary)', borderRadius: '2px' }} />
               </div>
               <div style={{ position: 'absolute', bottom: '10px', left: '15px' }}>
                 <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
               </div>
             </div>
          </div>
        </div>
      )}
    </div>
  )
}
