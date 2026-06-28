'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { Undo, Redo, RefreshCw, Layout, Type, Image as ImageIcon, Video, Music, ChevronDown, Plus, Edit2, Trash2, Check, X } from 'lucide-react'
import { useAgent } from '@/contexts/AgentContext'
import toast from 'react-hot-toast'
import { Button } from '../../../components/ui/Button'
import { GlassCard } from '../../../components/ui/GlassCard'
import { Dropdown } from '../../../components/ui/Dropdown'

import { TemplateConfig, DEFAULT_TEMPLATE_CONFIG } from './types'
import { LayoutSettingsPanel } from './components/LayoutSettingsPanel'
import { CaptionSettingsPanel } from './components/CaptionSettingsPanel'
import { AiSettingsPanel } from './components/AiSettingsPanel'
import { BrandSettingsPanel } from './components/BrandSettingsPanel'
import { TemplatePreviewCanvas } from './components/TemplatePreviewCanvas'
import { presets } from '@/lib/presets'

import { useDebounce } from '@/hooks/useDebounce'

export default function BrandTemplatePage() {
  const { activeAgent, isAgentLoading } = useAgent()
  const supabase = createClientComponentClient({
    options: {
      global: {
        fetch: (url, options) => fetch(url, { ...options, cache: 'no-store' }),
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    }
  })
  
  const [templates, setTemplates] = useState<any[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  
  // Unified Settings State
  const [config, setConfig] = useState<TemplateConfig>(DEFAULT_TEMPLATE_CONFIG)
  const [isSaving, setIsSaving] = useState(false)
  const lastLoadedConfigRef = useRef<string>('')
  
  // Template Management State
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')

  // Undo/Redo History State
  const [history, setHistory] = useState<TemplateConfig[]>([DEFAULT_TEMPLATE_CONFIG])
  const [historyIndex, setHistoryIndex] = useState(0)
  
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (activeAgent) {
      setIsLoading(true)
      fetchTemplates().finally(() => setIsLoading(false))
    } else {
      setTemplates([])
      setSelectedTemplateId('')
      setIsLoading(false)
    }
  }, [activeAgent])

  // Warn user if they try to leave before auto-save completes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const currentStr = JSON.stringify(config);
      if (currentStr !== lastLoadedConfigRef.current) {
        e.preventDefault();
        e.returnValue = ''; // Shows standard browser warning
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [config]);

  const hasChanges = JSON.stringify(config) !== lastLoadedConfigRef.current;

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
        layout_settings: DEFAULT_TEMPLATE_CONFIG.layout_settings,
        caption_settings: DEFAULT_TEMPLATE_CONFIG.caption_settings,
        ai_settings: DEFAULT_TEMPLATE_CONFIG.ai_settings,
        brand_settings: DEFAULT_TEMPLATE_CONFIG.brand_settings
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
    const validModes = ['auraglow', 'kineticbox', 'lumina', 'popshadow', 'typewriter', 'neonpulse', 'slideupfade', 'cinematicbar', 'hologram', 'glitch', 'staggerfade', 'elasticscale'];
    let safeMode = tpl.caption_settings?.mode || 'popshadow';
    if (!validModes.includes(safeMode)) {
      safeMode = 'popshadow';
    }

    const newConfig = {
      layout_settings: { ...DEFAULT_TEMPLATE_CONFIG.layout_settings, ...(tpl.layout_settings || {}) },
      caption_settings: { 
        ...DEFAULT_TEMPLATE_CONFIG.caption_settings, 
        ...(tpl.caption_settings || {}),
        mode: safeMode
      },
      ai_settings: { ...DEFAULT_TEMPLATE_CONFIG.ai_settings, ...(tpl.ai_settings || {}) },
      brand_settings: { ...DEFAULT_TEMPLATE_CONFIG.brand_settings, ...(tpl.brand_settings || {}) }
    }
    lastLoadedConfigRef.current = JSON.stringify(newConfig)
    setConfig(newConfig)
    setHistory([newConfig])
    setHistoryIndex(0)
  }

  const handleSelectTemplate = (tId: string) => {
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
      layout_settings: config.layout_settings,
      caption_settings: config.caption_settings,
      ai_settings: config.ai_settings,
      brand_settings: config.brand_settings
    }
    
    const { data: newDoc, error } = await supabase
      .from('brand_templates')
      .insert(newData)
      .select()
      .single()
      
    if (!error && newDoc) {
      setTemplates([...templates, newDoc])
      setSelectedTemplateId(newDoc.id)
      applyTemplateData(newDoc)
      toast.success('Template baru dibuat')
    }
  }

  const manualSaveTemplate = async () => {
    if (isSaving || !selectedTemplateId) return;
    setIsSaving(true)
    const updateData = {
      layout_settings: config.layout_settings,
      caption_settings: config.caption_settings,
      ai_settings: config.ai_settings,
      brand_settings: config.brand_settings
    }
    
    const { data, error } = await supabase
      .from('brand_templates')
      .update(updateData)
      .eq('id', selectedTemplateId)
      .select()
      
    if (!error && data && data.length > 0) {
      setTemplates(prev => prev.map(t => t.id === selectedTemplateId ? { ...t, ...updateData } : t))
      lastLoadedConfigRef.current = JSON.stringify(config)
      toast.success('Pengaturan berhasil disimpan')
    } else {
      console.error("Save failed or 0 rows updated", error, data);
      toast.error('Gagal menyimpan. Pastikan Anda memiliki akses ke template ini.')
    }
    setIsSaving(false)
  }

  const handleRenameTemplate = async () => {
    if (!selectedTemplateId || !renameValue.trim()) {
      setIsRenaming(false);
      return;
    }
    
    setIsSaving(true);
    const { error } = await supabase
      .from('brand_templates')
      .update({ name: renameValue })
      .eq('id', selectedTemplateId);
      
    if (error) {
      toast.error('Gagal mengganti nama template');
    } else {
      toast.success('Nama template diperbarui');
      // Update local state
      setTemplates(templates.map(t => t.id === selectedTemplateId ? { ...t, name: renameValue } : t));
    }
    
    setIsRenaming(false);
    setIsSaving(false);
  }

  const handleDeleteTemplate = async () => {
    if (!selectedTemplateId) return;
    
    if (!window.confirm('Apakah Anda yakin ingin menghapus template ini?')) return;
    
    setIsSaving(true);
    const { error } = await supabase
      .from('brand_templates')
      .delete()
      .eq('id', selectedTemplateId);
      
    if (error) {
      toast.error('Gagal menghapus template');
    } else {
      toast.success('Template berhasil dihapus');
      const updatedTemplates = templates.filter(t => t.id !== selectedTemplateId);
      setTemplates(updatedTemplates);
      if (updatedTemplates.length > 0) {
        handleSelectTemplate(updatedTemplates[0].id);
      } else {
        setSelectedTemplateId('');
        setConfig(DEFAULT_TEMPLATE_CONFIG);
        setHistory([DEFAULT_TEMPLATE_CONFIG]);
        setHistoryIndex(0);
      }
    }
    setIsSaving(false);
  }

  const updateConfig = <K extends 'layout_settings' | 'caption_settings' | 'ai_settings' | 'brand_settings'>(section: K, updates: Partial<TemplateConfig[K]>, replace: boolean = false) => {
    setConfig(prev => {
      const newConfig = {
        ...prev,
        [section]: replace ? updates : { ...(prev[section] as object), ...updates }
      }
      
      const newHistory = history.slice(0, historyIndex + 1)
      newHistory.push(newConfig)
      if (newHistory.length > 50) newHistory.shift()
      
      setHistory(newHistory)
      setHistoryIndex(newHistory.length - 1)
      
      return newConfig
    })
  }

  const handleUndo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1)
      setConfig(history[historyIndex - 1])
    }
  }

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1)
      setConfig(history[historyIndex + 1])
    }
  }

  const activeCaptionPreset = presets.find(p => p.id === config.caption_settings?.mode) || presets[0];
  const mergedCaptionSettings = { ...activeCaptionPreset.getDefaultConfig(), ...config.caption_settings };

  const renderActiveMenuContent = () => {
    if (activeMenu === 'layout') {
      return (
        <LayoutSettingsPanel 
          layout={config.layout_settings} 
          updateLayout={(updates) => updateConfig('layout_settings', updates)} 
        />
      )
    }

    if (activeMenu === 'caption') {
      return (
        <CaptionSettingsPanel 
          caption={mergedCaptionSettings} 
          updateCaption={(updates, replace) => updateConfig('caption_settings', updates, replace)} 
        />
      )
    }

    if (activeMenu === 'overlay' || activeMenu === 'intro' || activeMenu === 'music') {
      return (
        <BrandSettingsPanel 
          brand={config.brand_settings}
          updateBrand={(updates) => updateConfig('brand_settings', updates)}
          activeTab={activeMenu as 'overlay' | 'intro' | 'music'}
        />
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
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ width: '250px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isRenaming ? (
              <div style={{ display: 'flex', flex: 1, alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '12px', border: '1px solid var(--primary)' }}>
                <input 
                  type="text" 
                  value={renameValue} 
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRenameTemplate()}
                  autoFocus
                  style={{ background: 'transparent', border: 'none', color: 'white', outline: 'none', width: '100%', fontSize: '14px' }}
                />
                <button onClick={handleRenameTemplate} style={{ background: 'transparent', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: '4px' }}><Check size={16} /></button>
                <button onClick={() => setIsRenaming(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}><X size={16} /></button>
              </div>
            ) : (
              <>
                <Dropdown 
                  width="100%"
                  trigger={
                    <div style={{ 
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                      background: 'rgba(255,255,255,0.05)', padding: '10px 16px', 
                      borderRadius: '12px', border: '1px solid var(--border-glass)'
                    }}>
                      <span style={{ fontSize: '14px', fontWeight: 600 }}>
                        {selectedTemplateId 
                          ? templates.find(t => t.id === selectedTemplateId)?.name || 'Unnamed Template'
                          : 'Select a template...'}
                      </span>
                      <span style={{ transform: 'rotate(90deg)', fontSize: '12px', color: 'var(--text-muted)' }}>{'>'}</span>
                    </div>
                  }
                  items={[
                    ...templates.map(t => ({
                      id: t.id,
                      label: t.name || 'Unnamed Template',
                      onClick: () => handleSelectTemplate(t.id)
                    })),
                    {
                      id: 'new',
                      label: '+ Create new template',
                      onClick: createNewTemplate
                    }
                  ]}
                />
                {selectedTemplateId && (
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button 
                      onClick={() => { setRenameValue(templates.find(t => t.id === selectedTemplateId)?.name || ''); setIsRenaming(true); }}
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-glass)', borderRadius: '8px', padding: '8px', color: 'var(--text-muted)', cursor: 'pointer' }}
                      title="Rename"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button 
                      onClick={handleDeleteTemplate}
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-glass)', borderRadius: '8px', padding: '8px', color: '#ff4d4d', cursor: 'pointer' }}
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button 
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              title="Undo Changes (Kembali ke sebelumnya)"
              style={{ background: 'transparent', border: 'none', color: historyIndex > 0 ? '#fff' : 'var(--text-muted)', cursor: historyIndex > 0 ? 'pointer' : 'not-allowed', opacity: historyIndex > 0 ? 1 : 0.5 }}
            >
              <Undo size={20} />
            </button>
            <button 
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              title="Redo Changes (Maju ke sesudahnya)"
              style={{ background: 'transparent', border: 'none', color: historyIndex < history.length - 1 ? '#fff' : 'var(--text-muted)', cursor: historyIndex < history.length - 1 ? 'pointer' : 'not-allowed', opacity: historyIndex < history.length - 1 ? 1 : 0.5 }}
            >
              <Redo size={20} />
            </button>
            <button 
              onClick={() => {
                setIsLoading(true);
                fetchTemplates().finally(() => setIsLoading(false));
              }}
              title="Refresh Data dari Database"
              style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', marginLeft: '10px' }}
            >
              <RefreshCw size={20} className={isLoading ? "animate-spin" : ""} />
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', minWidth: '120px', justifyContent: 'flex-end' }}>
            <Button 
              onClick={manualSaveTemplate} 
              disabled={!hasChanges || isSaving || !selectedTemplateId}
              variant="primary"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </div>

      {isAgentLoading ? (
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : !activeAgent ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <p>Please select a Super Agent first.</p>
        </div>
      ) : isLoading ? (
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div style={{ display: 'flex', flex: 1, gap: '10px' }}>
          {/* Left Sidebar */}
          <GlassCard style={{ width: '300px', height: '610px', padding: '20px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '20px' }}>Setting</h2>
            
            <div style={{ marginBottom: '24px' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', paddingLeft: '8px' }}>Style</p>
              <MenuItem id="layout" icon={Layout} label="Clip layout settings" value={config.layout_settings.aspect} />
              <MenuItem id="caption" icon={Type} label="Caption" value={`${mergedCaptionSettings.fontFamily} ${mergedCaptionSettings.fontSize}`} />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', paddingLeft: '8px' }}>Brand</p>
              <MenuItem id="overlay" icon={ImageIcon} label="Overlay (logo, CTA)" value={config.brand_settings.overlayUrl ? '1 Selected' : ''} />
              <MenuItem id="intro" icon={Video} label="Intro/outro" value={config.brand_settings.introUrl ? '1 Selected' : ''} />
              <MenuItem id="music" icon={Music} label="Music" value={config.brand_settings.musicUrl ? '1 Selected' : ''} />
            </div>

            <div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', paddingLeft: '8px' }}>AI</p>
              <AiSettingsPanel 
                ai={config.ai_settings} 
                updateAi={(updates) => updateConfig('ai_settings', updates)} 
              />
            </div>
          </GlassCard>

          {/* Active Popover/Submenu */}
          {activeMenu && renderActiveMenuContent()}

          {/* Center Canvas */}
          <TemplatePreviewCanvas 
            caption={mergedCaptionSettings} 
            aiEmojis={config.ai_settings.emojis} 
            brandSettings={config.brand_settings}
            layoutSettings={config.layout_settings}
            onUpdateBrand={(updates) => updateConfig('brand_settings', updates)}
          />
        </div>
      )}
    </div>
  )
}
