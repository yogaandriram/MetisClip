import React from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Dropdown } from '@/components/ui/Dropdown';
import { ChevronDown } from 'lucide-react';
import { LayoutSettings } from '../types';

interface LayoutSettingsPanelProps {
  layout: LayoutSettings;
  updateLayout: (updates: Partial<LayoutSettings>) => void;
}

export const LayoutSettingsPanel: React.FC<LayoutSettingsPanelProps> = ({ layout, updateLayout }) => {
  return (
    <GlassCard padding="20px" style={{ width: '300px' }}>
      <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>Safe zone</h3>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Garis bantu area tombol & teks platform di preview, supaya caption dan logo tidak tertutup. Tidak ikut dirender.
      </p>
      <div style={{ marginTop: '20px' }}>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '10px' }}>Platform</p>
        <Dropdown 
          width="100%"
          trigger={
            <div style={{ 
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
              background: 'rgba(255,255,255,0.05)', padding: '10px 12px', 
              borderRadius: '8px', border: '1px solid var(--border-glass)',
              cursor: 'pointer'
            }}>
              <span style={{ fontSize: '13px' }}>{({ none: 'Tidak ada', tiktok: 'TikTok', reels: 'IG Reels', shorts: 'YT Shorts' } as Record<string, string>)[layout.safeZone || 'none']}</span>
              <ChevronDown size={16} color="var(--text-muted)" />
            </div>
          }
          items={[
            { id: 'none', label: 'Tidak ada', onClick: () => updateLayout({ safeZone: 'none' }) },
            { id: 'tiktok', label: 'TikTok', onClick: () => updateLayout({ safeZone: 'tiktok' }) },
            { id: 'reels', label: 'IG Reels', onClick: () => updateLayout({ safeZone: 'reels' }) },
            { id: 'shorts', label: 'YT Shorts', onClick: () => updateLayout({ safeZone: 'shorts' }) }
          ]}
        />
      </div>
    </GlassCard>
  );
};
