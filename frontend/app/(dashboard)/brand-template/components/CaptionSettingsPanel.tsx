import React, { useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Tabs } from '@/components/ui/Tabs';
import { Dropdown } from '@/components/ui/Dropdown';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { PremiumColorPicker } from '@/components/ui/PremiumColorPicker';
import { ChevronDown } from 'lucide-react';
import { presets } from '@/lib/presets';
import { CaptionSettings } from '../types';
import { SUPPORTED_FONTS, FONT_WEIGHTS } from '@/lib/constants';

interface CaptionSettingsPanelProps {
  caption: CaptionSettings;
  updateCaption: (updates: Partial<CaptionSettings>) => void;
}

export const CaptionSettingsPanel: React.FC<CaptionSettingsPanelProps> = ({ caption, updateCaption }) => {
  const [captionTab, setCaptionTab] = useState('presets');

  const handlePresetSelect = (presetId: string) => {
    const p = presets.find(pr => pr.id === presetId);
    if (p) {
      const pConfig = p.getDefaultConfig();
      updateCaption({
        mode: presetId,
        fontFamily: pConfig.fontFamily || caption.fontFamily,
        fontWeight: pConfig.fontWeight || caption.fontWeight,
        isUppercase: pConfig.isUppercase !== undefined ? pConfig.isUppercase : caption.isUppercase,
        fontColor: pConfig.fontColor || caption.fontColor,
        strokeColor: pConfig.strokeColor || caption.strokeColor,
        strokeWidth: pConfig.strokeWidth !== undefined ? pConfig.strokeWidth : caption.strokeWidth,
        hasShadow: pConfig.hasShadow !== undefined ? pConfig.hasShadow : caption.hasShadow,
        shadowColor: pConfig.shadowColor || caption.shadowColor,
        shadowX: pConfig.shadowX !== undefined ? pConfig.shadowX : caption.shadowX,
        shadowY: pConfig.shadowY !== undefined ? pConfig.shadowY : caption.shadowY,
        shadowBlur: pConfig.shadowBlur !== undefined ? pConfig.shadowBlur : caption.shadowBlur,
        isItalic: pConfig.isItalic !== undefined ? pConfig.isItalic : caption.isItalic,
        highlightColor: pConfig.highlightColor || caption.highlightColor
      });
    } else {
      updateCaption({ mode: presetId });
    }
  };

  return (
    <GlassCard padding="20px" style={{ width: '380px', height: '610px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexShrink: 0 }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Caption</h3>
      </div>
      
      <Tabs 
        tabs={[
          { id: 'presets', label: 'Presets' },
          { id: 'font', label: 'Font' }
        ]}
        activeTab={captionTab}
        onChange={setCaptionTab}
        style={{ marginBottom: '20px', width: '100%', justifyContent: 'center' }}
      />

      {captionTab === 'presets' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
          {presets.map(p => {
            const isSelected = caption.mode === p.id;
            return (
              <React.Fragment key={p.id}>
                {p.renderButton(isSelected, () => handlePresetSelect(p.id))}
              </React.Fragment>
            )
          })}
        </div>
      )}

      {captionTab === 'font' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <span style={{ fontSize: '14px', fontWeight: 600 }}>Font settings</span>
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
                  <span style={{ fontSize: '14px' }}>{caption.fontFamily}</span>
                  <ChevronDown size={16} color="var(--text-muted)" />
                </div>
              }
              items={SUPPORTED_FONTS.map(f => ({
                id: f, label: f, onClick: () => updateCaption({ fontFamily: f })
              }))}
            />

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <PremiumColorPicker color={caption.fontColor} onChange={(c) => updateCaption({ fontColor: c })} />
              
              <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '0 10px', border: '1px solid var(--border-glass)', width: '90px' }}>
                <input type="number" value={caption.fontSize} onChange={(e) => updateCaption({ fontSize: Number(e.target.value) })} style={{ background: 'transparent', border: 'none', color: '#fff', width: '40px', padding: '8px 0', outline: 'none' }} />
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
                      <span style={{ fontSize: '13px' }}>{caption.fontWeight}</span>
                      <ChevronDown size={14} color="var(--text-muted)" />
                    </div>
                  }
                  items={FONT_WEIGHTS.map(w => ({
                    id: w, label: w, onClick: () => updateCaption({ fontWeight: w })
                  }))}
                />
              </div>
            </div>

            <div style={{ marginTop: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-dim)' }}>Vertical Position</span>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{caption.positionY}px</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="400" 
                value={caption.positionY || 80}
                onChange={(e) => updateCaption({ positionY: Number(e.target.value) })}
                style={{ width: '100%', cursor: 'pointer' }}
              />
            </div>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-dim)' }}>Decoration</span>
            <div style={{ display: 'flex', gap: '15px' }}>
              <button onClick={() => updateCaption({ isItalic: !caption.isItalic })} style={{ background: 'transparent', border: 'none', color: caption.isItalic ? '#fff' : 'var(--text-muted)', fontStyle: 'italic', fontSize: '16px', cursor: 'pointer' }}>I</button>
              <button onClick={() => updateCaption({ isUnderline: !caption.isUnderline })} style={{ background: 'transparent', border: 'none', color: caption.isUnderline ? '#fff' : 'var(--text-muted)', textDecoration: 'underline', fontSize: '16px', cursor: 'pointer' }}>U</button>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-dim)' }}>Uppercase</span>
            <ToggleSwitch checked={caption.isUppercase} onChange={(v) => updateCaption({ isUppercase: v })} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-dim)' }}>Font stroke</span>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <PremiumColorPicker color={caption.strokeColor} onChange={(c) => updateCaption({ strokeColor: c })} />
              <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '0 10px', border: '1px solid var(--border-glass)', width: '80px' }}>
                <input type="number" value={caption.strokeWidth} onChange={(e) => updateCaption({ strokeWidth: Number(e.target.value) })} style={{ background: 'transparent', border: 'none', color: '#fff', width: '30px', padding: '6px 0', outline: 'none' }} />
                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>px</span>
              </div>
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-dim)' }}>Font shadows</span>
              <ToggleSwitch checked={caption.hasShadow} onChange={(v) => updateCaption({ hasShadow: v })} />
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', opacity: caption.hasShadow ? 1 : 0.5, pointerEvents: caption.hasShadow ? 'auto' : 'none' }}>
              <PremiumColorPicker color={caption.shadowColor} onChange={(c) => updateCaption({ shadowColor: c })} />
              <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '0 8px', border: '1px solid var(--border-glass)' }}>
                <input type="number" value={caption.shadowX} onChange={(e) => updateCaption({ shadowX: Number(e.target.value) })} style={{ background: 'transparent', border: 'none', color: '#fff', width: '25px', padding: '6px 0', outline: 'none' }} />
                <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>x</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '0 8px', border: '1px solid var(--border-glass)' }}>
                <input type="number" value={caption.shadowY} onChange={(e) => updateCaption({ shadowY: Number(e.target.value) })} style={{ background: 'transparent', border: 'none', color: '#fff', width: '25px', padding: '6px 0', outline: 'none' }} />
                <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>y</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '0 8px', border: '1px solid var(--border-glass)' }}>
                <input type="number" value={caption.shadowBlur} onChange={(e) => updateCaption({ shadowBlur: Number(e.target.value) })} style={{ background: 'transparent', border: 'none', color: '#fff', width: '25px', padding: '6px 0', outline: 'none' }} />
                <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>blur</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '15px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-dim)' }}>Highlight Color (Active word)</span>
            <PremiumColorPicker color={caption.highlightColor} onChange={(c) => updateCaption({ highlightColor: c })} />
          </div>
        </div>
      )}
    </GlassCard>
  );
};
