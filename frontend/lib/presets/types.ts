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
  letterSpacing: number;
  lineHeight: number;
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

// Helper to generate a perfect rounded stroke using text-shadow in em units for responsiveness
// This avoids the ugly sharp miter spikes caused by -webkit-text-stroke on thick fonts
export const generateRoundedStroke = (width: number, color: string, baseFontSize: number = 36) => {
  if (width <= 0) return 'none';
  let shadows = [];
  const emWidth = width / baseFontSize;
  for (let angle = 0; angle < 360; angle += 15) {
    const rad = angle * Math.PI / 180;
    const x = (Math.cos(rad) * emWidth).toFixed(3);
    const y = (Math.sin(rad) * emWidth).toFixed(3);
    shadows.push(`${x}em ${y}em 0px ${color}`);
  }
  // Add inner layers to ensure it's fully solid
  if (width > 2) {
    for (let r = width - 1; r > 0; r -= 1.5) {
      const emR = r / baseFontSize;
      for (let angle = 0; angle < 360; angle += 30) {
        const rad = angle * Math.PI / 180;
        const x = (Math.cos(rad) * emR).toFixed(3);
        const y = (Math.sin(rad) * emR).toFixed(3);
        shadows.push(`${x}em ${y}em 0px ${color}`);
      }
    }
  }
  return shadows.join(', ');
};
