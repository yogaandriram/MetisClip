import React from 'react';
import { SubtitlePreset } from './types';
import { Ease, interpolate, r4 } from './anim';
import { dropShadow, highlight, shadows, stroke, textBase } from './style';
import { LayeredText } from './parts';

export const slideupfadePreset: SubtitlePreset = {
  id: 'slideupfade',
  name: 'SLIDE UP FADE',
  wordsPerPage: 1,
  // One large word with a gradient fill
  getDefaultConfig: (baseHighlightColor?: string) => ({
    fontFamily: 'Poppins',
    fontSize: 44,
    fontWeight: 'Extra-Bold',
    isItalic: false,
    isUnderline: false,
    isUppercase: true,
    fontColor: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 0,
    hasShadow: true,
    shadowColor: '#000000',
    shadowX: 0,
    shadowY: 3,
    shadowBlur: 6,
    highlightColor: baseHighlightColor || '#FF6584',
    letterSpacing: 0,
    lineHeight: 1.1,
  }),
  renderButton: (isSelected: boolean, onClick: () => void) => {
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
          overflow: 'hidden'
        }}
      >
        <style>
          {`
            @keyframes slideUpFadeBtn {
              0%{transform:translateY(20px);opacity:0}
              30%,70%{transform:translateY(0);opacity:1}
              100%{transform:translateY(-5px);opacity:0}
            }
          `}
        </style>
        <span style={{ 
          fontFamily: "'Poppins', sans-serif",
          fontWeight: 800,
          fontSize: '24px',
          background: 'linear-gradient(135deg, #6C63FF, #FF6584)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          animation: 'slideUpFadeBtn 2s ease-in-out infinite'
        }}>
          SLIDE UP FADE
        </span>
      </button>
    );
  },
  renderPreview: ({ words, activeWordIndex, time, config }) => {
    const w = words[activeWordIndex];
    if (!w) return null;
    const activeColor = highlight(config, '#FF6584');
    const base = textBase(config);
    // slideUpFadeAnim: rises 1.111em and fades in over the first 0.3 s (ease-in-out)
    const t = time - w.start;
    const ty = interpolate(t, [0, 0.3], [1.111, 0], Ease.easeInOut);
    const opacity = interpolate(t, [0, 0.3], [0, 1], Ease.easeInOut);
    const scale = w.keyword ? 1.12 : 1;
    return (
      <LayeredText
        text={w.word}
        base={base}
        outer={{ transform: `translateY(${r4(ty)}em) scale(${scale})`, opacity: r4(opacity) }}
        back={{ textShadow: shadows(stroke(config), dropShadow(config)) }}
        front={{
          backgroundImage: `linear-gradient(135deg, ${w.keyword ? activeColor : '#6C63FF'}, ${w.keyword ? '#FFD400' : activeColor})`,
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          color: 'transparent',
        }}
      />
    );
  },
};
