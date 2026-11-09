import React from 'react';
import { SubtitlePreset } from './types';
import { Ease, clamp, interpolate, r4 } from './anim';
import { dropShadow, highlight, shadows, stroke, textBase } from './style';

export const velocityzoomPreset: SubtitlePreset = {
  id: 'velocityzoom',
  name: 'VELOCITY ZOOM',
  wordsPerPage: 1,
  // Comic impact: very large word, thick outline
  getDefaultConfig: (baseHighlightColor?: string) => ({
    fontFamily: 'Bangers',
    fontSize: 54,
    fontWeight: 'Regular',
    isItalic: false,
    isUnderline: false,
    isUppercase: true,
    fontColor: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 6,
    hasShadow: true,
    shadowColor: '#000000',
    shadowX: 0,
    shadowY: 8,
    shadowBlur: 12,
    highlightColor: baseHighlightColor || '#FFD700',
    letterSpacing: 2,
    lineHeight: 1.0,
  }),
  renderButton: (isSelected: boolean, onClick: () => void) => {
    const activeColor = '#FFD700';
    return (
      <button
        onClick={onClick}
        style={{
          padding: '20px',
          borderRadius: '12px',
          background: isSelected ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
          border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--border-glass)'}`,
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '80px',
          fontFamily: "'Bangers', var(--font-display)",
          fontSize: '24px',
          fontWeight: '400',
          textTransform: "uppercase",
          boxShadow: isSelected ? '0 0 20px rgba(255, 215, 0, 0.3)' : 'none',
          overflow: 'visible'
        }}
      >
        <span style={{ 
          color: activeColor,
          display: 'inline-block',
          animation: 'velocityZoomButton 1s infinite alternate cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          WebkitTextStroke: '2px black',
          paintOrder: 'stroke fill',
          textShadow: '0px 4px 0px rgba(0,0,0,1)'
        }}>
          ZOOM
        </span>
        <style>
          {`
            @keyframes velocityZoomButton {
              0% { transform: scale(0.8) rotate(0deg); }
              100% { transform: scale(1.15) rotate(-3deg); }
            }
          `}
        </style>
      </button>
    );
  },
  renderPreview: ({ words, activeWordIndex, time, config }) => {
    const w = words[activeWordIndex];
    if (!w) return null;
    const activeColor = highlight(config, '#FFD700');
    const base = textBase(config, { letterSpacing: 2 });
    // velocityImpact 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275): 0% → 50% → 100%
    const t = time - w.start;
    const k = [0, 0.15, 0.3];
    const peak = w.keyword ? 1.45 : 1.3;
    const scale = interpolate(t, k, [0.3, peak, w.keyword ? 1.12 : 1], Ease.backOut);
    const rotate = interpolate(t, k, [5, -3, 0], Ease.backOut);
    const opacity = clamp(interpolate(t, [0, 0.15], [0, 1], Ease.backOut));
    return (
      <div style={{ display: 'flex', justifyContent: 'center', width: '100%', textAlign: 'center' }}>
        <span
          style={{
            ...base,
            display: 'inline-block',
            color: w.keyword ? '#FFFFFF' : activeColor,
            textShadow: shadows(stroke(config, 8), dropShadow(config)),
            transformOrigin: 'center center',
            transform: `scale(${r4(scale)}) rotate(${r4(rotate)}deg)`,
            opacity: r4(opacity),
          }}
        >
          {w.word}
        </span>
      </div>
    );
  },
};
