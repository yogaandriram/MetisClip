import React from 'react';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { AiSettings } from '../types';

interface AiSettingsPanelProps {
  ai: AiSettings;
  updateAi: (updates: Partial<AiSettings>) => void;
}

export const AiSettingsPanel: React.FC<AiSettingsPanelProps> = ({ ai, updateAi }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', padding: '8px' }}>
      <ToggleSwitch 
        label="Remove filler words" 
        checked={ai.fillerWords} 
        onChange={(v) => updateAi({ fillerWords: v })} 
      />
      <ToggleSwitch 
        label="Remove pauses" 
        checked={ai.pauses} 
        onChange={(v) => updateAi({ pauses: v })} 
      />
      <ToggleSwitch 
        label="AI keywords highlighter" 
        checked={ai.keywords} 
        onChange={(v) => updateAi({ keywords: v })} 
      />
      <ToggleSwitch 
        label="AI emojis" 
        checked={ai.emojis} 
        onChange={(v) => updateAi({ emojis: v })} 
      />
    </div>
  );
};
