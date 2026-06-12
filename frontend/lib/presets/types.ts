import React from 'react';

export interface PresetConfig {
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  fontColor: string;
  isItalic: boolean;
  isUnderline: boolean;
  isUppercase: boolean;
  strokeColor: string;
  strokeWidth: number;
  hasShadow: boolean;
  shadowColor: string;
  shadowX: number;
  shadowY: number;
  shadowBlur: number;
  highlightColor: string;
}

export interface RenderPreviewProps {
  words: { word: string; start: number; end: number }[];
  activeWordIndex: number;
  config: Partial<PresetConfig>;
}

export interface SubtitlePreset {
  id: string;
  name: string;
  
  // Returns the default configuration properties when this preset is selected
  getDefaultConfig: (baseHighlightColor?: string) => Partial<PresetConfig>;
  
  // Renders the preview inside the video player (Clip Editor)
  renderPreview: (props: RenderPreviewProps) => React.ReactNode;
  
  // Renders the button design inside the Brand Template page
  renderButton: (isSelected: boolean, onClick: () => void) => React.ReactNode;
}
