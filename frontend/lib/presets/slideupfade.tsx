import React from 'react';
import { SubtitlePreset, generateRoundedStroke } from './types';

export const slideupfadePreset: SubtitlePreset = {
  id: 'slideupfade',
  name: 'SLIDE UP FADE',
  getDefaultConfig: (baseHighlightColor?: string) => ({
    fontFamily: 'Poppins',
    fontSize: 36,
    fontWeight: 'Regular',
    isUppercase: true,
    fontColor: '#ffffff',
    strokeColor: '#000000',
    strokeWidth: 0,
    hasShadow: true,
    shadowColor: '#000000',
    shadowX: 0,
    shadowY: 2,
    shadowBlur: 4,
    highlightColor: baseHighlightColor || '#FF6584',
    letterSpacing: 0,
    lineHeight: 1.2
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
  renderPreview: ({ words, activeWordIndex, config }) => {
    const activeColor = (config.highlightColor && config.highlightColor !== '#000000') ? config.highlightColor : '#FF6584';
    const fontColor = config.fontColor || '#ffffff';
    
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
    const baseFontSize = config.fontSize || 36;
    const strokeWidth = config.strokeWidth || 0;
    const strokeColor = config.strokeColor || '#000000';
    const roundedStrokeShadow = generateRoundedStroke(strokeWidth, strokeColor, baseFontSize);
    const letterSpacingEm = (config.letterSpacing !== undefined ? config.letterSpacing : 0) / baseFontSize;
    
    // Add text shadow mapping for slideupfade
    let combinedShadows = [];
    if (config.hasShadow && config.shadowColor) {
      const blur = config.shadowBlur ?? 0;
      const xEm = (config.shadowX || 0) / baseFontSize;
      const yEm = (config.shadowY || 0) / baseFontSize;
      const blurEm = blur / baseFontSize;
      combinedShadows.push(`${xEm}em ${yEm}em ${blurEm}em ${config.shadowColor}`);
    }
    const finalTextShadow = combinedShadows.length > 0 ? combinedShadows.join(', ') : 'none';

    return (
      <>
        <style>
          {`
            .slideup-container {
              display: inline-flex;
              gap: 12px;
              align-items: center;
              flex-wrap: wrap;
              justify-content: center;
              max-width: 100%;
              position: relative;
              height: 2em;
              overflow: visible;
            }
            .slideup-word {
              display: inline-block;
              font-family: '${config.fontFamily}', sans-serif;
              font-weight: ${numericWeight};
              text-transform: ${config.isUppercase ? 'uppercase' : 'none'};
              letter-spacing: ${letterSpacingEm}em;
              line-height: ${config.lineHeight !== undefined ? config.lineHeight : 1.2};
              position: absolute;
              opacity: 0;
              left: 50%;
              transform-origin: center center;
              white-space: nowrap;
              transform: translateX(-50%);
              z-index: 1;
            }
            .slideup-word::after {
              content: attr(data-text);
              position: absolute;
              left: 0;
              top: 0;
              z-index: -1;
              color: transparent;
              -webkit-text-fill-color: transparent;
              white-space: nowrap;
              text-shadow: ${strokeWidth > 0 ? roundedStrokeShadow : 'none'}${combinedShadows.length > 0 ? (strokeWidth > 0 ? ', ' : '') + finalTextShadow : ''};
            }
            .slideup-word.active {
              animation: slideUpFadeAnim 1s ease-in-out forwards;
              background: linear-gradient(135deg, #6C63FF, ${activeColor});
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
              background-clip: text;
              color: transparent; /* fallback */
            }
            @keyframes slideUpFadeAnim {
              0% { transform: translateY(1.111em) translateX(-50%); opacity: 0; }
              30% { transform: translateY(0) translateX(-50%); opacity: 1; }
              70% { transform: translateY(0) translateX(-50%); opacity: 1; }
              100% { transform: translateY(-0.277em) translateX(-50%); opacity: 0; }
            }
          `}
        </style>
        <span className="slideup-container">
          <span key={`active-${activeWordIndex}`} className="slideup-word active" data-text={words[activeWordIndex]?.word || ''}>
            {words[activeWordIndex]?.word || ''}
          </span>
        </span>
      </>
    );
  }
};
