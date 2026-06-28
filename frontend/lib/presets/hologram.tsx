import React from 'react';
import { SubtitlePreset, generateRoundedStroke } from './types';

export const hologramPreset: SubtitlePreset = {
  id: 'hologram',
  name: 'HOLOGRAM',
  getDefaultConfig: (baseHighlightColor?: string) => ({
    fontFamily: 'Orbitron',
    fontSize: 36,
    fontWeight: 'Black',
    isUppercase: true,
    fontColor: '#00ffff',
    strokeColor: '#000000',
    strokeWidth: 0,
    hasShadow: true,
    shadowColor: '#00ffff',
    shadowX: 0,
    shadowY: 0,
    shadowBlur: 12,
    highlightColor: baseHighlightColor || '#00ffff',
    letterSpacing: 5,
    lineHeight: 1.2
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
  renderPreview: ({ words, activeWordIndex, config }) => {
    const fontColor = config.fontColor || '#00ffff';
    
    // Helper to map string weights to CSS numbers
    const getWeight = (weight: string | number | undefined) => {
      if (typeof weight === 'number') return weight;
      const w = (weight || '').toLowerCase();
      if (w.includes('thin')) return 100;
      if (w.includes('extralight')) return 200;
      if (w.includes('light')) return 300;
      if (w.includes('medium')) return 500;
      if (w.includes('semibold')) return 600;
      if (w.includes('extrabold')) return 800;
      if (w.includes('bold')) return 700;
      if (w.includes('black')) return 900;
      if (w.includes('regular')) return 400;
      return 400; // Default fallback
    };
    const numericWeight = getWeight(config.fontWeight);
    
    const baseFontSize = config.fontSize || 36;
    const strokeWidth = config.strokeWidth || 0;
    const strokeColor = config.strokeColor || '#000000';
    const roundedStrokeShadow = generateRoundedStroke(strokeWidth, strokeColor, baseFontSize);

    let combinedShadows = [];
    if (config.hasShadow && config.shadowColor) {
      const blur = config.shadowBlur ?? 12;
      const blurEm = blur / baseFontSize;
      const blurEm2 = (blur * 2) / baseFontSize;
      combinedShadows.push(`0 0 ${blurEm}em ${config.shadowColor}, 0 0 ${blurEm2}em ${config.shadowColor}, 0.083em 0 0.083em rgba(255,0,0,0.5), -0.083em 0 0.083em rgba(0,0,255,0.5)`);
    } else {
      combinedShadows.push(`0.083em 0 0.083em rgba(255,0,0,0.5), -0.083em 0 0.083em rgba(0,0,255,0.5)`);
    }
    
    if (strokeWidth > 0 && roundedStrokeShadow !== 'none') {
      combinedShadows.push(roundedStrokeShadow);
    }
    const finalTextShadow = combinedShadows.length > 0 ? combinedShadows.join(', ') : 'none';
    const letterSpacingEm = (config.letterSpacing !== undefined ? config.letterSpacing : 5) / baseFontSize;
    
    return (
      <>
        <style>
          {`
            .holo-container {
              display: flex;
              align-items: center;
              flex-wrap: wrap;
              justify-content: center;
              max-width: 100%;
              justify-content: center;
              width: 100%;
              padding: 20px;
            }
            .holo-wrap {
              position: relative;
              overflow: hidden;
              padding: 10px 20px;
            }
            .holo-scan {
              position: absolute;
              left: 0;
              width: 100%;
              height: 25%;
              background: linear-gradient(transparent, rgba(0,255,255,0.4), transparent);
              animation: holoScanAnim 1.5s linear infinite;
              z-index: 1;
              pointer-events: none;
            }
            .holo-word {
              font-family: '${config.fontFamily}', sans-serif;
              font-weight: ${numericWeight};
              color: ${fontColor};
              letter-spacing: ${letterSpacingEm}em;
              line-height: ${config.lineHeight !== undefined ? config.lineHeight : 1.2};
              text-transform: ${config.isUppercase ? 'uppercase' : 'none'};
              text-shadow: ${finalTextShadow};
              animation: holoAnim 0.15s ease-in-out infinite;
              position: relative;
              z-index: 2;
            }
            
            @keyframes holoAnim {
              0%,100% { opacity: 0.85; transform: skewX(0deg); }
              25% { opacity: 1; transform: skewX(0.5deg); }
              75% { opacity: 0.9; transform: skewX(-0.5deg); }
            }
            @keyframes holoScanAnim {
              0% { top: -25%; }
              100% { top: 110%; }
            }
          `}
        </style>
        <div className="holo-container">
          <div className="holo-wrap">
            <div className="holo-scan"></div>
            {/* Hanya kata aktif (single word) tanpa sebelum/sesudah */}
            <span key={`active-${activeWordIndex}`} className="holo-word">
              {words[activeWordIndex]?.word || ''}
            </span>
          </div>
        </div>
      </>
    );
  }
};
