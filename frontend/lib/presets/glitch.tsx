import React from 'react';
import { SubtitlePreset } from './types';
import { Ease, cycle, interpolate, r4 } from './anim';
import { dropShadow, keywordColor, shadows, stroke, textBase } from './style';

export const glitchPreset: SubtitlePreset = {
  id: 'glitch',
  name: 'GLITCH EFFECT',
  wordsPerPage: 1,
  // Blocky display face, white with yellow/magenta glitch slices
  getDefaultConfig: (baseHighlightColor?: string) => ({
    fontFamily: 'Russo One',
    fontSize: 42,
    fontWeight: 'Regular',
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
    highlightColor: baseHighlightColor || '#00FFFF',
    letterSpacing: 3,
    lineHeight: 1.15,
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
            @keyframes glitchBtn1 {
              0%,100%{clip-path:inset(0 0 90% 0);transform:translate(-4px,0)}
              50%{clip-path:inset(30% 0 50% 0);transform:translate(4px,0)}
            }
            @keyframes glitchBtn2 {
              0%,100%{clip-path:inset(60% 0 20% 0);transform:translate(4px,0)}
              50%{clip-path:inset(10% 0 80% 0);transform:translate(-4px,0)}
            }
            .glitch-btn-text {
              font-family: 'Russo One', sans-serif;
              font-weight: 400;
              font-size: 14px;
              color: #0ff;
              text-transform: uppercase;
              letter-spacing: 2px;
              position: relative;
            }
            .glitch-btn-text::before, .glitch-btn-text::after {
              content: attr(data-text);
              position: absolute;
              top: 0; left: 0; width: 100%;
              background: transparent;
            }
            .glitch-btn-text::before { color: #f0f; animation: glitchBtn1 3s infinite; z-index: -1; }
            .glitch-btn-text::after { color: #ff0; animation: glitchBtn2 3s infinite; z-index: -2; }
          `}
        </style>
        <div className="glitch-btn-text" data-text="GLITCH">
          GLITCH
        </div>
      </button>
    );
  },
  renderPreview: ({ words, activeWordIndex, time, config }) => {
    const w = words[activeWordIndex];
    if (!w) return null;
    const fontColor = config.fontColor || '#00ffff';
    const base = textBase(config, { letterSpacing: 4 });
    // glitchAnim1 / glitchAnim2: 3s ease infinite, colour copies sliced with clip-path
    const c = cycle(time - w.start, 3);
    const k = [0, 0.5, 1];
    const layer = (color: string, top: number[], bottom: number[], x: number[]): React.CSSProperties => ({
      ...base,
      position: 'absolute',
      left: 0,
      top: 0,
      width: '100%',
      color,
      clipPath: `inset(${r4(interpolate(c, k, top, Ease.ease))}% 0 ${r4(interpolate(c, k, bottom, Ease.ease))}% 0)`,
      transform: `translate(${r4(interpolate(c, k, x, Ease.ease))}em, 0)`,
    });
    return (
      <div style={{ display: 'flex', justifyContent: 'center', width: '100%', padding: '0.55em 0' }}>
        <span style={{ position: 'relative', display: 'inline-block', transform: w.keyword ? 'scale(1.1)' : undefined }}>
          <span aria-hidden style={layer('#ffff00', [60, 10, 60], [20, 80, 20], [0.111, -0.111, 0.111])}>
            {w.word}
          </span>
          <span aria-hidden style={layer('#ff00ff', [0, 30, 0], [90, 50, 90], [-0.111, 0.111, -0.111])}>
            {w.word}
          </span>
          <span
            style={{
              ...base,
              position: 'relative',
              display: 'inline-block',
              color: w.keyword ? keywordColor(config, fontColor, '#FFD400') : fontColor,
              textShadow: shadows(stroke(config), dropShadow(config)),
            }}
          >
            {w.word}
          </span>
        </span>
      </div>
    );
  },
};
