import React from 'react';
import { SubtitlePreset, generateRoundedStroke } from './types';

export const velocityzoomPreset: SubtitlePreset = {
  id: 'velocityzoom',
  name: 'VELOCITY ZOOM',
  getDefaultConfig: (baseHighlightColor?: string) => ({
    fontFamily: 'Montserrat',
    fontSize: 36,
    fontWeight: 'Black',
    isUppercase: true,
    fontColor: '#ffffff',
    strokeColor: '#000000',
    strokeWidth: 8, // Very thick stroke
    hasShadow: true,
    shadowColor: '#000000',
    shadowX: 0,
    shadowY: 10,
    shadowBlur: 15,
    highlightColor: baseHighlightColor || '#FFD700', // Bright Yellow default
    letterSpacing: 2,
    lineHeight: 1.1
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
          fontFamily: "'Montserrat', var(--font-display)",
          fontSize: '24px',
          fontWeight: '900',
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
  renderPreview: ({ words, activeWordIndex, config }) => {
    const activeColor = (config.highlightColor && config.highlightColor !== '#000000') ? config.highlightColor : '#FFD700';
    const strokeWidth = config.strokeWidth !== undefined ? config.strokeWidth : 8;
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
      return 900;
    };
    const numericWeight = getWeight(config.fontWeight);
    
    const baseFontSize = config.fontSize || 36;
    const roundedStrokeShadow = generateRoundedStroke(strokeWidth, strokeColor, baseFontSize);

    let combinedShadows = [];
    if (config.hasShadow && config.shadowColor) {
      const blur = config.shadowBlur ?? 0;
      const xEm = (config.shadowX || 0) / baseFontSize;
      const yEm = (config.shadowY || 0) / baseFontSize;
      const blurEm = blur / baseFontSize;
      combinedShadows.push(`${xEm}em ${yEm}em ${blurEm}em ${config.shadowColor}`);
    }
    if (strokeWidth > 0 && roundedStrokeShadow !== 'none') {
      combinedShadows.push(roundedStrokeShadow);
    }
    const finalTextShadow = combinedShadows.length > 0 ? combinedShadows.join(', ') : 'none';
    const letterSpacingEm = (config.letterSpacing !== undefined ? config.letterSpacing : 4) / baseFontSize;

    return (
      <>
        <style>
          {`
            .velocityzoom-container {
              display: flex;
              align-items: center;
              justify-content: center;
              width: 100%;
              text-align: center;
            }

            .velocityzoom-word {
              display: inline-block;
              font-family: ${config.fontFamily || 'Montserrat'}, sans-serif;
              font-size: ${baseFontSize}px;
              font-weight: ${numericWeight};
              color: ${activeColor};
              font-style: ${config.isItalic ? 'italic' : 'normal'};
              text-decoration: ${config.isUnderline ? 'underline' : 'none'};
              text-transform: ${config.isUppercase ? 'uppercase' : 'none'};
              
              letter-spacing: ${letterSpacingEm}em;
              line-height: ${config.lineHeight !== undefined ? config.lineHeight : 1.2};
              text-transform: ${config.isUppercase ? 'uppercase' : 'none'};
              text-shadow: ${finalTextShadow};
              
              /* Impact animation */
              animation: velocityImpact 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
              transform-origin: center center;
            }

            @keyframes velocityImpact {
              0% {
                transform: scale(0.3) rotate(5deg);
                opacity: 0;
              }
              50% {
                transform: scale(1.3) rotate(-3deg);
                opacity: 1;
              }
              100% {
                transform: scale(1) rotate(0deg);
                opacity: 1;
              }
            }
          `}
        </style>
        <div className="velocityzoom-container">
          {words.map((w, index) => {
            const isActive = index === activeWordIndex;
            // Strict Single Word Mode: Only render if it's the active word
            if (!isActive) return null;
            
            return (
              <span key={index} className="velocityzoom-word">
                {w.word}
              </span>
            );
          })}
        </div>
      </>
    );
  }
};
