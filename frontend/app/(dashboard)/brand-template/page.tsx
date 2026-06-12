'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { Undo, Redo, Layout, Type, Image as ImageIcon, Video, Music, ChevronDown, Plus, Edit2, Trash2, Check, X } from 'lucide-react'
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

import { useDebounce } from '@/hooks/useDebounce'

export default function BrandTemplatePage() {
  const { activeAgent } = useAgent()
  const supabase = createClientComponentClient()
  
  const [templates, setTemplates] = useState<any[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  
  // Unified Settings State
  const [config, setConfig] = useState<TemplateConfig>(DEFAULT_TEMPLATE_CONFIG)
  const debouncedConfig = useDebounce(config, 1000)
  const [isSaving, setIsSaving] = useState(false)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  
  // Template Management State
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')

  // Undo/Redo History State
  const [history, setHistory] = useState<TemplateConfig[]>([DEFAULT_TEMPLATE_CONFIG])
  const [historyIndex, setHistoryIndex] = useState(0)

  useEffect(() => {
    if (activeAgent) {
      fetchTemplates()
    } else {
      setTemplates([])
      setSelectedTemplateId('')
    }
  }, [activeAgent])

  useEffect(() => {
    if (isInitialLoad) {
      setIsInitialLoad(false);
      return;
    }
    
    if (selectedTemplateId) {
      autoSaveTemplate(debouncedConfig);
    }
  }, [debouncedConfig])

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
      handleSelectTemplate(data[0].id)
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
        handleSelectTemplate(newDoc.id)
      }
    }
  }

  const applyTemplateData = (tpl: any) => {
    setIsInitialLoad(true); // Prevent auto-save immediately on load
    const newConfig = {
      layout_settings: tpl.layout_settings || DEFAULT_TEMPLATE_CONFIG.layout_settings,
      caption_settings: tpl.caption_settings || DEFAULT_TEMPLATE_CONFIG.caption_settings,
      ai_settings: tpl.ai_settings || DEFAULT_TEMPLATE_CONFIG.ai_settings,
      brand_settings: tpl.brand_settings || DEFAULT_TEMPLATE_CONFIG.brand_settings
    }
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
      handleSelectTemplate(newDoc.id)
      toast.success('Template baru dibuat')
    }
  }

  const autoSaveTemplate = async (currentConfig: TemplateConfig) => {
    setIsSaving(true)
    const updateData = {
      layout_settings: currentConfig.layout_settings,
      caption_settings: currentConfig.caption_settings,
      ai_settings: currentConfig.ai_settings,
      brand_settings: currentConfig.brand_settings
    }
    
    const { error } = await supabase
      .from('brand_templates')
      .update(updateData)
      .eq('id', selectedTemplateId)
      
    if (!error) {
      setTemplates(prev => prev.map(t => t.id === selectedTemplateId ? { ...t, ...updateData } : t))
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

  const updateConfig = <K extends 'layout_settings' | 'caption_settings' | 'ai_settings' | 'brand_settings'>(section: K, updates: Partial<TemplateConfig[K]>) => {
    setConfig(prev => {
      const newConfig = {
        ...prev,
        [section]: { ...(prev[section] as object), ...updates }
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
          caption={config.caption_settings} 
          updateCaption={(updates) => updateConfig('caption_settings', updates)} 
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
              style={{ background: 'transparent', border: 'none', color: historyIndex > 0 ? '#fff' : 'var(--text-muted)', cursor: historyIndex > 0 ? 'pointer' : 'not-allowed', opacity: historyIndex > 0 ? 1 : 0.5 }}
            >
              <Undo size={20} />
            </button>
            <button 
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              style={{ background: 'transparent', border: 'none', color: historyIndex < history.length - 1 ? '#fff' : 'var(--text-muted)', cursor: historyIndex < history.length - 1 ? 'pointer' : 'not-allowed', opacity: historyIndex < history.length - 1 ? 1 : 0.5 }}
            >
              <Redo size={20} />
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', minWidth: '80px', justifyContent: 'flex-end' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              {isSaving ? 'Saving...' : 'Saved'}
            </span>
          </div>
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
              <MenuItem id="layout" icon={Layout} label="Clip layout settings" value={config.layout_settings.aspect} />
              <MenuItem id="caption" icon={Type} label="Caption" value={`${config.caption_settings.fontFamily} ${config.caption_settings.fontSize}`} />
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
            caption={config.caption_settings} 
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
