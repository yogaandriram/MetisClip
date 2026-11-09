import React from 'react';
import { SubtitlePreset } from './types';
import { Ease, cycle, interpolate, r4 } from './anim';
import { em, keywordColor, shadows, stroke, textBase } from './style';

export const hologramPreset: SubtitlePreset = {
  id: 'hologram',
  name: 'HOLOGRAM',
  wordsPerPage: 1,
  // Cyan hologram glow, white keywords
  getDefaultConfig: (baseHighlightColor?: string) => ({
    fontFamily: 'Orbitron',
    fontSize: 38,
    fontWeight: 'Black',
    isItalic: false,
    isUnderline: false,
    isUppercase: true,
    fontColor: '#00FFFF',
    strokeColor: '#000000',
    strokeWidth: 0,
    hasShadow: true,
    shadowColor: '#00FFFF',
    shadowX: 0,
    shadowY: 0,
    shadowBlur: 12,
    highlightColor: baseHighlightColor || '#FFFFFF',
    letterSpacing: 5,
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
          overflow: 'hidden',
          position: 'relative'
        }}
      >
        <style>
          {`
            @keyframes hologramBtn {
              0%,100%{opacity:0.85;transform:skewX(0deg)}
              25%{opacity:1;transform:skewX(0.5deg)}
              75%{opacity:0.9;transform:skewX(-0.5deg)}
            }
            @keyframes hologramScanBtn {
              0%{top:-25%}
              100%{top:110%}
            }
          `}
        </style>
        <div style={{ position: 'relative', overflow: 'hidden', padding: '5px 10px', width: '100%', textAlign: 'center' }}>
          <div style={{
            position: 'absolute', left: 0, width: '100%', height: '25%',
            background: 'linear-gradient(transparent, rgba(0,255,255,0.4), transparent)',
            animation: 'hologramScanBtn 1.5s linear infinite',
            zIndex: 1, pointerEvents: 'none'
          }}></div>
          <div style={{
            fontFamily: "'Orbitron', sans-serif",
            fontWeight: 900, 
            fontSize: '14px',
            color: '#0ff',
            letterSpacing: '3px',
            textTransform: 'uppercase',
            animation: 'hologramBtn 0.15s ease-in-out infinite',
            textShadow: '0 0 6px #0ff, 2px 0 2px rgba(255,0,0,0.5), -2px 0 2px rgba(0,0,255,0.5)',
            position: 'relative',
            zIndex: 2
          }}>
            HOLOGRAM
          </div>
        </div>
      </button>
    );
  },
  renderPreview: ({ words, activeWordIndex, time, config }) => {
    const w = words[activeWordIndex];
    if (!w) return null;
    const fontColor = config.fontColor || '#00ffff';
    const color = w.keyword ? keywordColor(config, fontColor, '#FFD400') : fontColor;
    const base = textBase(config, { letterSpacing: 5 });
    const blur = em(config.shadowBlur ?? 12, config);
    const glow = config.hasShadow && config.shadowColor ? `0 0 ${r4(blur)}em ${config.shadowColor}, 0 0 ${r4(blur * 2)}em ${config.shadowColor}` : null;
    const chroma = '0.083em 0 0.083em rgba(255,0,0,0.5), -0.083em 0 0.083em rgba(0,0,255,0.5)';

    // holoAnim 0.15s infinite (flicker) and holoScanAnim 1.5s linear infinite (scan line)
    const f = cycle(time - w.start, 0.15);
    const opacity = interpolate(f, [0, 0.25, 0.75, 1], [0.85, 1, 0.9, 0.85], Ease.easeInOut);
    const skew = interpolate(f, [0, 0.25, 0.75, 1], [0, 0.5, -0.5, 0], Ease.easeInOut);
    const scanTop = -25 + 135 * cycle(time, 1.5);

    return (
      <div style={{ display: 'flex', justifyContent: 'center', width: '100%', padding: '0.28em 0' }}>
        <div style={{ position: 'relative', overflow: 'hidden', padding: '0.28em 0.56em' }}>
          <div
            style={{
              position: 'absolute',
              left: 0,
              width: '100%',
              height: '25%',
              top: `${r4(scanTop)}%`,
              background: 'linear-gradient(transparent, rgba(0,255,255,0.4), transparent)',
              zIndex: 1,
              pointerEvents: 'none',
            }}
          />
          <span
            style={{
              ...base,
              display: 'inline-block',
              position: 'relative',
              zIndex: 2,
              color,
              textShadow: shadows(stroke(config), glow, chroma),
              opacity: r4(opacity),
              transform: `skewX(${r4(skew)}deg)${w.keyword ? ' scale(1.1)' : ''}`,
            }}
          >
            {w.word}
          </span>
        </div>
      </div>
    );
  },
};
