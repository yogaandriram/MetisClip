import React from 'react';
import { SubtitlePreset } from './types';

export const popshadowPreset: SubtitlePreset = {
  id: 'popshadow',
  name: 'POP SHADOW',
  getDefaultConfig: (baseHighlightColor?: string) => ({
    fontFamily: 'Montserrat',
    fontWeight: 'Regular',
    isUppercase: true,
    fontColor: '#ffffff',
    strokeColor: '#000000',
    strokeWidth: 0,
    hasShadow: false,
    shadowColor: '#000000',
    shadowX: 0,
    shadowY: 0,
    shadowBlur: 0,
    highlightColor: baseHighlightColor || '#FFE800',
    letterSpacing: 0,
    lineHeight: 1.2
  }),
  renderButton: (isSelected: boolean, onClick: () => void) => {
    const activeColor = '#A855F7';
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
          fontFamily: "'Montserrat', var(--font-display)",
          fontSize: '24px',
          fontWeight: '900',
          textTransform: "uppercase",
          boxShadow: isSelected ? '0 0 20px rgba(24, 86, 255, 0.3)' : 'none',
          overflow: 'hidden'
        }}
      >
        <span style={{ 
          color: '#ffffff',
          filter: `drop-shadow(3px 3px 0 ${activeColor})`,
          transform: 'scale(1.1) translateY(-2px)',
          display: 'inline-block',
          animation: 'popShadowButton 2s infinite ease-in-out'
        }}>
          SHADOW
        </span>
        <style>
          {`
            @keyframes popShadowButton {
              0% { transform: scale(1) translateY(0); filter: drop-shadow(0px 0px 0 ${activeColor}); }
              50% { transform: scale(1.1) translateY(-2px); filter: drop-shadow(3px 3px 0 ${activeColor}); }
              100% { transform: scale(1) translateY(0); filter: drop-shadow(0px 0px 0 ${activeColor}); }
            }
          `}
        </style>
      </button>
    );
  },
  renderPreview: ({ words, activeWordIndex, config }) => {
    const activeColor = (config.highlightColor && config.highlightColor !== '#000000') ? config.highlightColor : '#A855F7';
    const strokeWidth = config.strokeWidth !== undefined ? config.strokeWidth : 6;
    const fontColor = config.fontColor || '#ffffff';
    const strokeColor = config.strokeColor || '#000000';

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
      return 400;
    };
    const numericWeight = getWeight(config.fontWeight);
    
    return (
      <>
        <style>
          {`
            .popshadow-container {
              display: inline-flex;
              gap: 12px;
              align-items: center;
              flex-wrap: wrap;
              justify-content: center;
              max-width: 100%;
              padding: 10px; /* To prevent drop-shadow clipping */
            }
            .popshadow-word {
              display: inline-block;
              font-family: '${config.fontFamily}', var(--font-display);
              font-weight: ${numericWeight};
              text-transform: ${config.isUppercase ? 'uppercase' : 'none'};
              letter-spacing: ${config.letterSpacing !== undefined ? config.letterSpacing : 0}px;
              line-height: ${config.lineHeight !== undefined ? config.lineHeight : 1.2};
              -webkit-text-stroke: ${strokeWidth}px ${strokeColor};
              color: ${fontColor};
              transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            }
            .popshadow-word.inactive {
              transform: scale(0.95);
            }
            .popshadow-word.active {
              animation: popShadowAnim 0.3s cubic-bezier(0.25, 1, 0.5, 1) both;
              z-index: 10;
              position: relative;
            }
            @keyframes popShadowAnim {
              0% { transform: scale(0.95) translateY(0); filter: drop-shadow(0px 0px 0 ${activeColor}); }
              60% { transform: scale(1.15) translateY(-4px); filter: drop-shadow(4px 4px 0 ${activeColor}); }
              100% { transform: scale(1.1) translateY(-2px); filter: drop-shadow(2px 2px 0 ${activeColor}); }
            }
          `}
        </style>
        <span className="popshadow-container">
          <span key={`prev-${activeWordIndex}`} className="popshadow-word inactive">{words[activeWordIndex - 1]?.word}</span>
          <span key={`active-${activeWordIndex}`} className="popshadow-word active">{words[activeWordIndex].word}</span>
          <span key={`next-${activeWordIndex}`} className="popshadow-word inactive">{words[activeWordIndex + 1]?.word}</span>
        </span>
      </>
    );
  }
};
