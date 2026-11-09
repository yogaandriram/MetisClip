import React from 'react';
import { SubtitlePreset } from './types';
import { Ease, interpolate, r4 } from './anim';
import { dropShadow, keywordColor, shadows, stroke, textBase } from './style';

export const cinematicbarPreset: SubtitlePreset = {
  id: 'cinematicbar',
  name: 'CINEMATIC BAR',
  wordsPerPage: 1,
  // Film title: lighter weight, wide tracking, gold keywords
  getDefaultConfig: (baseHighlightColor?: string) => ({
    fontFamily: 'Montserrat',
    fontSize: 28,
    fontWeight: 'Semi-Bold',
    isItalic: false,
    isUnderline: false,
    isUppercase: true,
    fontColor: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 0,
    hasShadow: true,
    shadowColor: '#000000',
    shadowX: 0,
    shadowY: 2,
    shadowBlur: 8,
    highlightColor: baseHighlightColor || '#F2C94C',
    letterSpacing: 8,
    lineHeight: 1.2,
  }),
  renderButton: (isSelected: boolean, onClick: () => void) => {
    return (
      <button
        onClick={onClick}
        style={{
          padding: '10px',
          borderRadius: '12px',
          background: isSelected ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
          border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--border-glass)'}`,
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '80px',
          overflow: 'hidden'
        }}
      >
        <style>
          {`
            @keyframes cinematicInBtn {
              0%{transform:translateY(10px);opacity:0}
              15%,85%{transform:translateY(0);opacity:1}
              100%{opacity:0}
            }
          `}
        </style>
        <div style={{ textAlign: 'center', width: '100%' }}>
          <div style={{
            width: '80%', margin: '0 auto', height: '1px',
            background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.6),transparent)'
          }}></div>
          <div style={{
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 700, 
            fontSize: '14px',
            color: '#fff', 
            letterSpacing: '4px', // Reduced from 8px to fit in the button
            textTransform: 'uppercase',
            padding: '4px 0',
            animation: 'cinematicInBtn 3s ease-in-out infinite'
          }}>
            CINEMATIC BAR
          </div>
          <div style={{
            width: '80%', margin: '0 auto', height: '1px',
            background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.6),transparent)'
          }}></div>
        </div>
      </button>
    );
  },
  renderPreview: ({ words, activeWordIndex, time, config }) => {
    const w = words[activeWordIndex];
    if (!w) return null;
    const fontColor = config.fontColor || '#ffffff';
    const base = textBase(config, { letterSpacing: 8 });
    // cinematicInAnim: slides up 0.83em and fades in over 0.2 s (ease-in-out)
    const t = time - w.start;
    const ty = interpolate(t, [0, 0.2], [0.83, 0], Ease.easeInOut);
    const opacity = interpolate(t, [0, 0.2], [0, 1], Ease.easeInOut);
    const bar: React.CSSProperties = {
      width: '100%',
      height: 'max(1px, 0.03em)',
      background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)',
    };
    return (
      <div style={{ width: '100%', textAlign: 'center' }}>
        <div style={bar} />
        <div
          style={{
            ...base,
            color: w.keyword ? keywordColor(config, fontColor, '#FFD400') : fontColor,
            textShadow: shadows(stroke(config), dropShadow(config)),
            padding: '0.22em 0',
            opacity: r4(opacity),
            transform: `translateY(${r4(ty)}em)`,
          }}
        >
          {w.word}
        </div>
        <div style={bar} />
      </div>
    );
  },
};
