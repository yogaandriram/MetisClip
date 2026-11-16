import React from 'react';
import { ToggleSwitch } from '@/components/ui';
import { useT } from '@/lib/i18n/I18nProvider';
import { AiSettings } from '../types';

interface AiSettingsPanelProps {
  ai: AiSettings;
  updateAi: (updates: Partial<AiSettings>) => void;
}

export const AiSettingsPanel: React.FC<AiSettingsPanelProps> = ({ ai, updateAi }) => {
  const t = useT();
  return (
    <div className="mc-stack">
      <p className="mc-caption mc-muted">{t.brand.ai.intro}</p>
      <ToggleSwitch
        label={t.brand.ai.fillerWords}
        checked={ai.fillerWords}
        onChange={(v) => updateAi({ fillerWords: v })}
      />
      <ToggleSwitch
        label={t.brand.ai.pauses}
        checked={ai.pauses}
        onChange={(v) => updateAi({ pauses: v })}
      />
      <ToggleSwitch
        label={t.brand.ai.keywords}
        checked={ai.keywords}
        onChange={(v) => updateAi({ keywords: v })}
      />
      <ToggleSwitch
        label={t.brand.ai.emojis}
        checked={ai.emojis}
        onChange={(v) => updateAi({ emojis: v })}
      />
    </div>
  );
};
