import React from 'react';
import { SubtitlePreset } from './types';

export const cinematicPreset: SubtitlePreset = {
  id: 'cinematic',
  name: 'CINEMATIC',
  getDefaultConfig: (baseHighlightColor?: string) => ({
    fontFamily: 'Montserrat',
    fontWeight: 'Light',
    isUppercase: true,
    fontColor: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 0,
    hasShadow: false,
    shadowColor: '#000000',
    shadowX: 0,
    shadowY: 0,
    shadowBlur: 0,
    highlightColor: baseHighlightColor || '#FFFFFF'
  }),
  renderButton: (isSelected: boolean, onClick: () => void) => (
    <button
      onClick={onClick}
      style={{
        padding: '20px',
        borderRadius: '12px',
        background: isSelected ? 'rgba(255,255,255,0.05)' : 'transparent',
        border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--border-glass)'}`,
        color: '#fff',
        cursor: 'pointer',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '80px',
        fontFamily: 'Montserrat, sans-serif',
        fontSize: '18px',
        fontWeight: 'Light',
        textTransform: "uppercase"
      }}
    >
      CINEMATIC
    </button>
  ),
  renderPreview: ({ words, activeWordIndex, config }) => (
    <span style={{ display: 'inline-flex', gap: '8px', alignItems: 'center', letterSpacing: '6px' }}>
        <span style={{ color: config.fontColor }}>{words[activeWordIndex - 1]?.word}</span>
        <span style={{ color: config.highlightColor }}>{words[activeWordIndex].word}</span>
        <span style={{ color: config.fontColor }}>{words[activeWordIndex + 1]?.word}</span>
      </span>
  )
};
