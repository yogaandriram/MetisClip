import React from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Dropdown } from '@/components/ui/Dropdown';
import { ChevronDown } from 'lucide-react';
import { LayoutSettings } from '../types';
import { ASPECT_RATIOS, LAYOUT_FITS } from '@/lib/constants';

interface LayoutSettingsPanelProps {
  layout: LayoutSettings;
  updateLayout: (updates: Partial<LayoutSettings>) => void;
}

export const LayoutSettingsPanel: React.FC<LayoutSettingsPanelProps> = ({ layout, updateLayout }) => {
  return (
    <GlassCard padding="20px" style={{ width: '300px' }}>
      <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px' }}>Layout</h3>
      
      <div style={{ marginBottom: '20px' }}>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '10px' }}>Aspect ratio:</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          {ASPECT_RATIOS.map(ar => (
            <button
              key={ar}
              onClick={() => updateLayout({ aspect: ar })}
              style={{
                padding: '8px',
                borderRadius: '8px',
                background: layout.aspect === ar ? 'var(--bg-glass-active)' : 'transparent',
                border: `1px solid ${layout.aspect === ar ? 'var(--primary)' : 'var(--border-glass)'}`,
                color: layout.aspect === ar ? 'var(--text-primary)' : 'var(--text-muted)',
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
          {LAYOUT_FITS.map(l => (
            <button
              key={l}
              onClick={() => updateLayout({ fit: l })}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                background: layout.fit === l ? '#fff' : 'transparent',
                color: layout.fit === l ? '#000' : 'var(--text-primary)',
                border: '1px solid var(--border-glass)',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: layout.fit === l ? 600 : 400
              }}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: '20px' }}>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '10px' }}>Platform Safe Zone</p>
        <Dropdown 
          width="100%"
          trigger={
            <div style={{ 
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
              background: 'rgba(255,255,255,0.05)', padding: '10px 12px', 
              borderRadius: '8px', border: '1px solid var(--border-glass)',
              cursor: 'pointer'
            }}>
              <span style={{ fontSize: '13px', textTransform: 'capitalize' }}>{layout.safeZone || 'None'}</span>
              <ChevronDown size={16} color="var(--text-muted)" />
            </div>
          }
          items={[
            { id: 'none', label: 'None', onClick: () => updateLayout({ safeZone: 'none' }) },
            { id: 'tiktok', label: 'TikTok', onClick: () => updateLayout({ safeZone: 'tiktok' }) },
            { id: 'reels', label: 'IG Reels', onClick: () => updateLayout({ safeZone: 'reels' }) },
            { id: 'shorts', label: 'YT Shorts', onClick: () => updateLayout({ safeZone: 'shorts' }) }
          ]}
        />
      </div>
    </GlassCard>
  );
};
