import React, { useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Tabs } from '@/components/ui/Tabs';
import { Dropdown } from '@/components/ui/Dropdown';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { PremiumColorPicker } from '@/components/ui/PremiumColorPicker';
import { PremiumSlider } from '@/components/ui/PremiumSlider';
import { ChevronDown, Italic, Underline, Type, RotateCcw, ChevronRight } from 'lucide-react';
import { presets } from '@/lib/presets';
import { CaptionSettings } from '../types';
import { SUPPORTED_FONTS, FONT_WEIGHTS_MAP } from '@/lib/constants';

interface CaptionSettingsPanelProps {
  caption: CaptionSettings;
  updateCaption: (updates: Partial<CaptionSettings>) => void;
}

const CollapsibleSection: React.FC<{ title: string; children: React.ReactNode; defaultOpen?: boolean }> = ({ title, children, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: isOpen ? '15px' : '0' }}
      >
        <span style={{ fontSize: '14px', fontWeight: 600 }}>{title}</span>
        <ChevronRight size={16} style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
      </div>
      <div style={{ display: isOpen ? 'block' : 'none' }}>
        {children}
      </div>
    </div>
  );
};

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
        highlightColor: pConfig.highlightColor || caption.highlightColor,
        letterSpacing: pConfig.letterSpacing !== undefined ? pConfig.letterSpacing : caption.letterSpacing,
        lineHeight: pConfig.lineHeight !== undefined ? pConfig.lineHeight : caption.lineHeight
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
              <button
                onClick={() => handlePresetSelect(caption.mode)}
                title="Reset to preset defaults"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--border-glass)',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  fontSize: '12px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
              >
                <RotateCcw size={12} /> Reset
              </button>
            </div>
            {/* Font Family Row */}
            <div style={{ marginBottom: '15px' }}>
              <div style={{ marginBottom: '8px', fontSize: '12px', color: 'var(--text-dim)' }}>Font Family</div>
              <Dropdown
                width="100%"
                trigger={
                  <div style={{ 
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                    background: 'rgba(255,255,255,0.05)', padding: '10px 14px', 
                    borderRadius: '10px', border: '1px solid var(--border-glass)'
                  }}>
                    <span style={{ fontSize: '14px' }}>{caption.fontFamily}</span>
                    <ChevronDown size={16} color="var(--text-muted)" />
                  </div>
                }
                items={SUPPORTED_FONTS.map(f => ({
                  id: f, 
                  label: <span style={{ fontFamily: f, fontSize: '15px' }}>{f}</span>, 
                  onClick: () => {
                    const availableWeights = FONT_WEIGHTS_MAP[f] || ['Regular'];
                    let safeWeight = caption.fontWeight;
                    if (!availableWeights.includes(safeWeight || 'Regular')) {
                      safeWeight = availableWeights.includes('Regular') ? 'Regular' : availableWeights[0];
                    }
                    updateCaption({ fontFamily: f, fontWeight: safeWeight });
                  }
                }))}
              />
            </div>

            {/* Font Weight & Size Row */}
            <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ marginBottom: '8px', fontSize: '12px', color: 'var(--text-dim)' }}>Font Weight</div>
                <Dropdown
                  width="100%"
                  trigger={
                    <div style={{ 
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                      background: 'rgba(255,255,255,0.05)', padding: '10px 14px', 
                      borderRadius: '10px', border: '1px solid var(--border-glass)' 
                    }}>
                      <span style={{ fontSize: '14px' }}>{caption.fontWeight}</span>
                      <ChevronDown size={16} color="var(--text-muted)" />
                    </div>
                  }
                  items={(FONT_WEIGHTS_MAP[caption.fontFamily || 'Montserrat'] || ['Regular']).map(w => ({
                    id: w, label: w, onClick: () => updateCaption({ fontWeight: w })
                  }))}
                />
              </div>
              
              <div style={{ width: '100px' }}>
                <div style={{ marginBottom: '8px', fontSize: '12px', color: 'var(--text-dim)' }}>Size (px)</div>
                <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', padding: '0 12px', border: '1px solid var(--border-glass)', height: '42px' }}>
                  <input type="number" min="10" max="300" value={caption.fontSize} onChange={(e) => updateCaption({ fontSize: Number(e.target.value) })} style={{ background: 'transparent', border: 'none', color: '#fff', width: '100%', outline: 'none', fontSize: '14px' }} />
                </div>
              </div>
            </div>

            {/* Colors Row */}
            <div style={{ display: 'flex', gap: '20px', marginBottom: '5px' }}>
              <div>
                <div style={{ marginBottom: '8px', fontSize: '12px', color: 'var(--text-dim)' }}>Text Color</div>
                <PremiumColorPicker color={caption.fontColor} onChange={(c) => updateCaption({ fontColor: c })} />
              </div>
              <div>
                <div style={{ marginBottom: '8px', fontSize: '12px', color: 'var(--text-dim)' }}>Highlight (Active)</div>
                <PremiumColorPicker color={caption.highlightColor} onChange={(c) => updateCaption({ highlightColor: c })} />
              </div>
            </div>

          </div>
          
          <CollapsibleSection title="Layout & Spacing" defaultOpen={false}>
            <div style={{ marginBottom: '15px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-dim)' }}>Vertical Position</span>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{caption.positionY}px</span>
              </div>
              <PremiumSlider 
                min={0} 
                max={400} 
                value={caption.positionY || 80}
                onChange={(val) => updateCaption({ positionY: val })}
              />
            </div>
            
            {/* Letter Spacing */}
            <div style={{ marginBottom: '15px' }}>
              <div style={{ marginBottom: '8px', fontSize: '13px', color: 'var(--text-dim)' }}>Jarak antar-huruf</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <PremiumSlider 
                  min={-5} max={20} 
                  value={caption.letterSpacing ?? 0}
                  onChange={(val) => updateCaption({ letterSpacing: val })}
                />
                <div style={{ width: '60px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '0 8px', border: '1px solid var(--border-glass)', height: '40px', display: 'flex', alignItems: 'center' }}>
                  <input type="number" min="-5" max="20" value={caption.letterSpacing ?? 0} onChange={(e) => updateCaption({ letterSpacing: Number(e.target.value) })} style={{ background: 'transparent', border: 'none', color: '#fff', width: '100%', outline: 'none', textAlign: 'center', fontSize: '14px' }} />
                </div>
              </div>
            </div>

            {/* Line Height */}
            <div>
              <div style={{ marginBottom: '8px', fontSize: '13px', color: 'var(--text-dim)' }}>Jarak antar-baris</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <PremiumSlider 
                  min={0.5} max={3.0} step={0.1}
                  value={caption.lineHeight ?? 1.2}
                  onChange={(val) => updateCaption({ lineHeight: val })}
                />
                <div style={{ width: '60px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '0 8px', border: '1px solid var(--border-glass)', height: '40px', display: 'flex', alignItems: 'center' }}>
                  <input type="number" min="0.5" max="3.0" step="0.1" value={caption.lineHeight ?? 1.2} onChange={(e) => updateCaption({ lineHeight: Number(e.target.value) })} style={{ background: 'transparent', border: 'none', color: '#fff', width: '100%', outline: 'none', textAlign: 'center', fontSize: '14px' }} />
                </div>
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Advanced Styling" defaultOpen={false}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-dim)' }}>Font stroke</span>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <PremiumColorPicker color={caption.strokeColor} onChange={(c) => updateCaption({ strokeColor: c })} />
                <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '0 10px', border: '1px solid var(--border-glass)', width: '80px' }}>
                  <input type="number" min="0" max="50" value={caption.strokeWidth} onChange={(e) => updateCaption({ strokeWidth: Number(e.target.value) })} style={{ background: 'transparent', border: 'none', color: '#fff', width: '30px', padding: '6px 0', outline: 'none' }} />
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
                  <input type="number" min="-100" max="100" value={caption.shadowX} onChange={(e) => updateCaption({ shadowX: Number(e.target.value) })} style={{ background: 'transparent', border: 'none', color: '#fff', width: '35px', padding: '6px 0', outline: 'none' }} />
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>x</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '0 8px', border: '1px solid var(--border-glass)' }}>
                  <input type="number" min="-100" max="100" value={caption.shadowY} onChange={(e) => updateCaption({ shadowY: Number(e.target.value) })} style={{ background: 'transparent', border: 'none', color: '#fff', width: '35px', padding: '6px 0', outline: 'none' }} />
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>y</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '0 8px', border: '1px solid var(--border-glass)' }}>
                  <input type="number" min="0" max="100" value={caption.shadowBlur} onChange={(e) => updateCaption({ shadowBlur: Number(e.target.value) })} style={{ background: 'transparent', border: 'none', color: '#fff', width: '35px', padding: '6px 0', outline: 'none' }} />
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>blur</span>
                </div>
              </div>
            </div>
          </CollapsibleSection>

        </div>
      )}
    </GlassCard>
  );
};
