import React from 'react';
import { SubtitlePreset } from './types';
import { Ease, interpolate, r4 } from './anim';
import { dropShadow, keywordColor, shadows, stroke, textBase } from './style';

export const staggerfadePreset: SubtitlePreset = {
  id: 'staggerfade',
  name: 'STAGGER FADE',
  wordsPerPage: 1,
  getDefaultConfig: (baseHighlightColor?: string) => ({
    fontFamily: 'Exo 2',
    fontSize: 36,
    fontWeight: 'Black',
    isUppercase: true,
    fontColor: '#00CFFF',
    strokeColor: '#000000',
    strokeWidth: 0,
    hasShadow: false,
    shadowColor: '#000000',
    shadowX: 0,
    shadowY: 0,
    shadowBlur: 0,
    highlightColor: baseHighlightColor || '#00CFFF',
    letterSpacing: 2,
    lineHeight: 1.2
  }),
  renderButton: (isSelected: boolean, onClick: () => void) => {
    const text = "STAGGER";
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
            @keyframes staggerFadeBtn {
              0%,100%{opacity:0;transform:translateY(15px)}
              20%,80%{opacity:1;transform:translateY(0)}
            }
            .stagger-btn-wrap {
              display: flex;
            }
            .stagger-btn-char {
              display: inline-block;
              font-family: 'Exo 2', sans-serif;
              font-weight: 900;
              font-size: 14px;
              color: #00CFFF;
              text-transform: uppercase;
              letter-spacing: 2px;
            }
          `}
        </style>
        <div className="stagger-btn-wrap">
          {text.split('').map((char, index) => (
            <span 
              key={index} 
              className="stagger-btn-char"
              style={{ animation: `staggerFadeBtn 2s ${index * 0.12}s infinite` }}
            >
              {char}
            </span>
          ))}
        </div>
      </button>
    );
  },
  renderPreview: ({ words, activeWordIndex, time, config }) => {
    const w = words[activeWordIndex];
    if (!w) return null;
    const fontColor = config.fontColor || '#00CFFF';
    const color = w.keyword ? keywordColor(config, fontColor, '#FFD400') : fontColor;
    const base = textBase(config, { letterSpacing: 2 });
    const textShadow = shadows(stroke(config), dropShadow(config));
    const chars = Array.from(w.word);
    // staggerFadeAnim: each character rises 0.694em and fades in (0.3 s), one after another
    const step = Math.min(0.06, 0.36 / Math.max(1, chars.length));
    const t = time - w.start;
    return (
      <div style={{ display: 'flex', justifyContent: 'center', width: '100%', padding: '0.55em 0' }}>
        <div style={{ display: 'flex', transform: w.keyword ? 'scale(1.1)' : undefined }}>
          {chars.map((ch, i) => {
            const local = t - i * step;
            return (
              <span
                key={i}
                style={{
                  ...base,
                  display: 'inline-block',
                  color,
                  textShadow,
                  opacity: r4(interpolate(local, [0, 0.3], [0, 1], Ease.ease)),
                  transform: `translateY(${r4(interpolate(local, [0, 0.3], [0.694, 0], Ease.ease))}em)`,
                }}
              >
                {ch}
              </span>
            );
          })}
        </div>
      </div>
    );
  },
};
