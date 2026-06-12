import React, { useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { BrandSettings } from '../types';
import { UploadCloud, FileVideo, Music, Image as ImageIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

interface BrandSettingsPanelProps {
  brand: BrandSettings;
  updateBrand: (updates: Partial<BrandSettings>) => void;
  activeTab: 'overlay' | 'intro' | 'music';
}

export const BrandSettingsPanel: React.FC<BrandSettingsPanelProps> = ({ brand, updateBrand, activeTab }) => {
  const [isUploading, setIsUploading] = useState(false);
  const supabase = createClientComponentClient();

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: keyof BrandSettings) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Simulate validation
    const maxSize = type === 'sampleVideoUrl' || type === 'introUrl' ? 10 * 1024 * 1024 : 5 * 1024 * 1024; // 10MB video, 5MB image/audio
    if (file.size > maxSize) {
      toast.error(`File too large. Maximum size is ${maxSize / (1024 * 1024)}MB`);
      return;
    }

    setIsUploading(true);
    const toastId = toast.loading('Uploading...');

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${type}_${Date.now()}.${fileExt}`;
      const filePath = `brand_assets/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('brand_assets')
        .upload(filePath, file);

      if (uploadError) {
        throw uploadError;
      }

      const { data } = supabase.storage.from('brand_assets').getPublicUrl(filePath);
      
      updateBrand({ [type]: data.publicUrl });
      toast.success('Upload complete!', { id: toastId });
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.message || 'Failed to upload file', { id: toastId });
    } finally {
      setIsUploading(false);
    }
  };

  const renderUploader = (title: string, description: string, accept: string, typeKey: keyof BrandSettings, icon: any) => {
    const Icon = icon;
    const currentUrl = brand[typeKey];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <h4 style={{ fontSize: '15px', fontWeight: 600 }}>{title}</h4>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{description}</p>
        
        {currentUrl ? (
          <div style={{ padding: '12px', background: 'var(--bg-glass)', borderRadius: '8px', border: '1px solid var(--primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
              <Icon size={18} color="var(--primary)" />
              <span style={{ fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Asset Selected
              </span>
            </div>
            <button 
              onClick={() => updateBrand({ [typeKey]: '' })}
              style={{ background: 'transparent', border: 'none', color: '#ff4d4d', cursor: 'pointer', fontSize: '12px' }}
            >
              Remove
            </button>
          </div>
        ) : (
          <label style={{ 
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '30px 20px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', 
            border: '1px dashed var(--border-glass)', cursor: isUploading ? 'wait' : 'pointer',
            transition: 'all 0.2s', opacity: isUploading ? 0.5 : 1
          }}>
            <UploadCloud size={28} color="var(--text-muted)" style={{ marginBottom: '10px' }} />
            <span style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center' }}>
              Click to upload<br/><small>({accept})</small>
            </span>
            <input 
              type="file" 
              accept={accept} 
              style={{ display: 'none' }} 
              onChange={(e) => handleUpload(e, typeKey)}
              disabled={isUploading}
            />
          </label>
        )}
      </div>
    );
  };

  return (
    <GlassCard padding="20px" style={{ width: '300px', height: '610px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, textTransform: 'capitalize' }}>{activeTab.replace('_', ' ')}</h3>
      </div>

      {activeTab === 'overlay' && renderUploader('Watermark / Logo', 'Upload a PNG logo to overlay on all your clips.', 'image/png,image/jpeg', 'overlayUrl', ImageIcon)}
      {activeTab === 'intro' && renderUploader('Intro / Outro', 'Upload a short video clip to prepend/append to your videos.', 'video/mp4,video/quicktime', 'introUrl', FileVideo)}
      {activeTab === 'music' && renderUploader('Background Music', 'Upload an audio file for background music.', 'audio/mpeg,audio/wav', 'musicUrl', Music)}
      
      <div style={{ marginTop: '40px', paddingTop: '20px', borderTop: '1px solid var(--border-glass)' }}>
        {renderUploader('Brand Video Sample', 'Upload a 3-5s background video for this preview canvas.', 'video/mp4', 'sampleVideoUrl', FileVideo)}
      </div>
    </GlassCard>
  );
};
