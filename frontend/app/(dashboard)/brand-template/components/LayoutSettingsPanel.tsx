import React from 'react';
import { ChoiceChips, Field } from '@/components/ui';
import { LayoutSettings, SAFE_ZONE_OPTIONS, SafeZone } from '../types';

interface LayoutSettingsPanelProps {
  layout: LayoutSettings;
  updateLayout: (updates: Partial<LayoutSettings>) => void;
}

export const LayoutSettingsPanel: React.FC<LayoutSettingsPanelProps> = ({ layout, updateLayout }) => {
  return (
    <Field
      label="Platform"
      hint="Garis bantu area tombol & teks platform di preview, supaya caption dan logo tidak tertutup. Tidak ikut dirender."
    >
      <ChoiceChips<SafeZone>
        ariaLabel="Safe zone platform"
        options={SAFE_ZONE_OPTIONS}
        value={layout.safeZone || 'none'}
        onChange={(safeZone) => updateLayout({ safeZone })}
      />
    </Field>
  );
};
