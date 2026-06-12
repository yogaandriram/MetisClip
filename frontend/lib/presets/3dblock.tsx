import React from 'react';
import { SubtitlePreset } from './types';

export const block3dPreset: SubtitlePreset = {
  id: '3dblock',
  name: '3dblock',
  getDefaultConfig: (baseHighlightColor?: string) => ({
    fontFamily: 'Bungee',
    fontWeight: 'Regular',
    isUppercase: true,
    fontColor: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 1,
    hasShadow: true,
    shadowColor: '#000000',
    shadowX: 4,
    shadowY: 4,
    shadowBlur: 0,
    highlightColor: baseHighlightColor || '#10B981'
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
        fontFamily: 'Bungee, sans-serif',
        fontSize: '18px',
        fontWeight: 'Regular',
        textTransform: "uppercase"
      }}
    >
      3dblock
    </button>
  ),
  renderPreview: ({ words, activeWordIndex, config }) => (
    <span style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
        <span style={{ color: config.fontColor }}>{words[activeWordIndex - 1]?.word}</span>
        <span style={{ color: config.highlightColor, transform: 'translateY(-4px)', display: 'inline-block' }}>{words[activeWordIndex].word}</span>
        <span style={{ color: config.fontColor }}>{words[activeWordIndex + 1]?.word}</span>
      </span>
  )
};
