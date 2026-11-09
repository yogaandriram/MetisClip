import React from 'react';
import { SubtitlePreset } from './types';
import { cubicBezier, interpolate, r4 } from './anim';
import { dropShadow, shadows, stroke, textBase, withAlpha } from './style';

export const elasticscalePreset: SubtitlePreset = {
  id: 'elasticscale',
  name: 'ELASTIC SCALE',
  wordsPerPage: 1,
  // Condensed headline face in a yellow label box (highlight = box color)
  getDefaultConfig: (baseHighlightColor?: string) => ({
    fontFamily: 'Anton',
    fontSize: 44,
    fontWeight: 'Regular',
    isItalic: false,
    isUnderline: false,
    isUppercase: true,
    fontColor: '#111111',
    strokeColor: '#000000',
    strokeWidth: 0,
    hasShadow: false,
    shadowColor: '#000000',
    shadowX: 0,
    shadowY: 0,
    shadowBlur: 0,
    highlightColor: baseHighlightColor || '#FFD700',
    letterSpacing: 1,
    lineHeight: 1.1,
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
          overflow: 'hidden',
          position: 'relative'
        }}
      >
        <style>
          {`
            @keyframes elasticScaleBtn {
              0% { transform: scaleX(0); opacity: 0; }
              35% { transform: scaleX(1.15); opacity: 1; }
              55% { transform: scaleX(0.95); }
              70%, 90% { transform: scaleX(1); opacity: 1; }
              100% { opacity: 0; }
            }
          `}
        </style>
        <div style={{
          fontFamily: "'Anton', sans-serif",
          fontWeight: 400,
          fontSize: '12px',
          color: '#111',
          background: '#FFD700',
          padding: '6px 14px',
          animation: 'elasticScaleBtn 2.5s cubic-bezier(0.36,0.07,0.19,0.97) infinite',
          transformOrigin: 'left',
          borderRadius: '4px',
          boxShadow: '0 2px 10px rgba(255,215,0,0.4)',
          textTransform: 'uppercase'
        }}>
          ELASTIC
        </div>
      </button>
    );
  },
  renderPreview: ({ words, activeWordIndex, time, config }) => {
    const w = words[activeWordIndex];
    if (!w) return null;
    const fontColor = config.fontColor || '#111111';
    const bgColor = config.highlightColor || '#FFD700'; // the highlight color is the box color here
    const base = textBase(config);
    // elasticScaleAnim 0.8s cubic-bezier(0.36, 0.07, 0.19, 0.97): 0% → 35% → 55% → 70%
    const t = time - w.start;
    const ease = cubicBezier(0.36, 0.07, 0.19, 0.97);
    const sx = interpolate(t, [0, 0.28, 0.44, 0.56], [0, 1.15, 0.95, 1], ease);
    const opacity = interpolate(t, [0, 0.28], [0, 1], ease);
    return (
      <div style={{ display: 'flex', justifyContent: 'center', width: '100%', padding: '0.55em 0' }}>
        <span
          style={{
            ...base,
            display: 'inline-block',
            color: fontColor,
            background: bgColor,
            textShadow: shadows(stroke(config), dropShadow(config)),
            padding: '0.222em 0.777em',
            borderRadius: '0.111em',
            boxShadow: `0 0.111em 0.555em ${withAlpha(bgColor, 0.4)}`,
            transformOrigin: 'left center',
            transform: `scaleX(${r4(sx)})${w.keyword ? ' scale(1.12)' : ''}`,
            opacity: r4(opacity),
          }}
        >
          {w.word}
        </span>
      </div>
    );
  },
};
