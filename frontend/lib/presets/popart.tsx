import React from 'react';
import { SubtitlePreset } from './types';

export const popartPreset: SubtitlePreset = {
  id: 'popart',
  name: 'POPART',
  getDefaultConfig: (baseHighlightColor?: string) => ({
    fontFamily: 'Luckiest Guy',
    fontWeight: 'Regular',
    isUppercase: true,
    fontColor: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 4,
    hasShadow: true,
    shadowColor: '#000000',
    shadowX: 6,
    shadowY: 6,
    shadowBlur: 0,
    highlightColor: baseHighlightColor || '#FACC15'
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
        fontFamily: 'Luckiest Guy, sans-serif',
        fontSize: '18px',
        fontWeight: 'Regular',
        textTransform: "uppercase"
      }}
    >
      POPART
    </button>
  ),
  renderPreview: ({ words, activeWordIndex, config }) => (
    <span style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
        <span style={{ color: config.fontColor, transform: 'rotate(-2deg)' }}>{words[activeWordIndex - 1]?.word}</span>
        <span style={{ color: config.highlightColor, transform: 'scale(1.2) rotate(-4deg)', display: 'inline-block' }}>{words[activeWordIndex].word}</span>
        <span style={{ color: config.fontColor, transform: 'rotate(-2deg)' }}>{words[activeWordIndex + 1]?.word}</span>
      </span>
  )
};
