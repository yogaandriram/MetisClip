import React from 'react';

/**
 * Subtitle presets are shared by the clip editor, the Brand Template preview and the Remotion
 * render (render-engine/src/SubtitleOverlay.tsx). They must stay pure functions of `time`:
 * no CSS @keyframes, no transitions, no timers. Remotion screenshots every frame independently,
 * so anything driven by wall-clock time would look different in the exported video.
 *
 * Units: sizes are in `em` of the caption font size. `fontSize`, `strokeWidth`, shadow offsets and
 * `letterSpacing` in the config are "design px" (the same scale as `fontSize`), converted with
 * `px / fontSize` em, so the caption looks identical at every canvas width (300 px preview,
 * editor, 1080 px render).
 */
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

/** One subtitle word. `keyword` and `emoji` are set by the AI subtitle settings (or by hand). */
export interface CaptionWord {
  word: string;
  start: number;
  end: number;
  keyword?: boolean;
  emoji?: string | null;
  confidence?: number;
}

export interface RenderPreviewProps {
  /** Words of the caption group (page) that is on screen now. */
  words: CaptionWord[];
  /** Index in `words` of the word being spoken (the last one that has started). */
  activeWordIndex: number;
  /** Caption time in seconds (playback time minus the sync offset). Drives every animation. */
  time: number;
  config: Partial<PresetConfig>;
}

export interface SubtitlePreset {
  id: string;
  name: string;
  /** Maximum words shown together. 1 = one word at a time. */
  wordsPerPage: number;

  // Returns the default configuration properties when this preset is selected
  getDefaultConfig: (baseHighlightColor?: string) => Partial<PresetConfig>;

  // Renders the caption group for the current frame (editor, Brand Template preview and render)
  renderPreview: (props: RenderPreviewProps) => React.ReactNode;

  // Renders the preset picker button (UI only; may use CSS animations)
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
