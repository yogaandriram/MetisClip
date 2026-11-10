import React from 'react';
import { ToggleSwitch } from '@/components/ui';
import { AiSettings } from '../types';

interface AiSettingsPanelProps {
  ai: AiSettings;
  updateAi: (updates: Partial<AiSettings>) => void;
}

export const AiSettingsPanel: React.FC<AiSettingsPanelProps> = ({ ai, updateAi }) => {
  return (
    <div className="mc-stack">
      <p className="mc-caption mc-muted">
        Dipakai saat clip diproses dan diekspor. Setiap clip bisa mengubahnya di editor clip.
      </p>
      <ToggleSwitch
        label="Hapus kata pengisi (eh, hmm)"
        checked={ai.fillerWords}
        onChange={(v) => updateAi({ fillerWords: v })}
      />
      <ToggleSwitch
        label="Hapus jeda hening"
        checked={ai.pauses}
        onChange={(v) => updateAi({ pauses: v })}
      />
      <ToggleSwitch
        label="Sorot kata kunci (AI)"
        checked={ai.keywords}
        onChange={(v) => updateAi({ keywords: v })}
      />
      <ToggleSwitch
        label="Emoji otomatis (AI)"
        checked={ai.emojis}
        onChange={(v) => updateAi({ emojis: v })}
      />
    </div>
  );
};
