import React from 'react';
import { SubtitlePreset } from './types';

export const minimalpillPreset: SubtitlePreset = {
  id: 'minimalpill',
  name: 'minimalpill',
  getDefaultConfig: (baseHighlightColor?: string) => ({
    fontFamily: 'Inter',
    fontWeight: 'Medium',
    isUppercase: false,
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
        fontFamily: 'Inter, sans-serif',
        fontSize: '18px',
        fontWeight: 'Medium',
        textTransform: "none"
      }}
    >
      minimalpill
    </button>
  ),
  renderPreview: ({ words, activeWordIndex, config }) => (
    <span style={{ color: config.highlightColor, background: 'rgba(0,0,0,0.8)', padding: '6px 20px', borderRadius: '30px' }}>
        {words[activeWordIndex].word}
      </span>
  )
};
