import React from 'react';
import { SubtitlePreset, generateRoundedStroke } from './types';

export const auraglowPreset: SubtitlePreset = {
  id: 'auraglow',
  name: 'AURA GLOW',
  getDefaultConfig: (baseHighlightColor?: string) => ({
    fontFamily: 'Outfit',
    fontSize: 36,
    fontWeight: 'Regular',
    isUppercase: true,
    fontColor: '#ffffff',
    strokeColor: '#000000',
    strokeWidth: 0,
    hasShadow: true,
    shadowColor: '#000000',
    shadowX: 0,
    shadowY: 4,
    shadowBlur: 10,
    highlightColor: baseHighlightColor || '#4F46E5',
    letterSpacing: 0,
    lineHeight: 1.2
  }),
  renderButton: (isSelected: boolean, onClick: () => void) => {
    const activeColor = '#1856FF';
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
          fontFamily: "'Outfit', var(--font-display)",
          fontSize: '24px',
          fontWeight: '900',
          textTransform: "uppercase",
          boxShadow: isSelected ? '0 0 20px rgba(24, 86, 255, 0.3)' : 'none',
          overflow: 'hidden'
        }}
      >
        <span style={{ 
          backgroundImage: `linear-gradient(90deg, ${activeColor}, #00FFFF, ${activeColor})`,
          backgroundSize: '200% auto',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          color: 'transparent',
          filter: `drop-shadow(0 0 12px ${activeColor}) drop-shadow(0 4px 8px rgba(0,0,0,0.8))`,
          display: 'inline-block',
          animation: 'springPopBtn 2s infinite alternate cubic-bezier(0.175, 0.885, 0.32, 1.275)'
        }}>
          AURA
        </span>
        <style>
          {`
            @keyframes springPopBtn {
              0% { transform: rotateX(-40deg) translateY(10px) scale(0.9); background-position: 0% center; }
              100% { transform: rotateX(0deg) translateY(0) scale(1.1); background-position: 200% center; }
            }
          `}
        </style>
      </button>
    );
  },
  renderPreview: ({ words, activeWordIndex, config }) => {
    const activeColor = (config.highlightColor && config.highlightColor !== '#000000') ? config.highlightColor : '#00F0FF';
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
    
    return (
      <>
        <style>
          {`
            .aura-container {
              display: inline-flex;
              gap: 12px;
              align-items: center;
              flex-wrap: wrap;
              justify-content: center;
              max-width: 100%;
              perspective: 800px;
            }
            .aura-word {
              display: inline-block;
              font-family: '${config.fontFamily}', var(--font-display);
              font-weight: ${numericWeight};
              text-transform: ${config.isUppercase ? 'uppercase' : 'none'};
              letter-spacing: ${letterSpacingEm}em;
              line-height: ${config.lineHeight !== undefined ? config.lineHeight : 1.2};
              transform-style: preserve-3d;
              transition: all 0.3s ease;
              position: relative;
              z-index: 1;
            }
            .aura-word::after {
              content: attr(data-text);
              position: absolute;
              left: 0;
              top: 0;
              z-index: -1;
              color: transparent;
              -webkit-text-fill-color: transparent;
              white-space: nowrap;
            }
            .aura-word.inactive {
              color: ${fontColor};
              opacity: 0.8;
              transform: rotateX(40deg) scale(0.9);
            }
            .aura-word.inactive::after {
              text-shadow: 0 0.111em 0.277em rgba(0,0,0,0.5)${strokeWidth > 0 ? `, ${roundedStrokeShadow}` : ''};
            }
            .aura-word.active {
              animation: springPop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) both;
              background-image: linear-gradient(90deg, ${activeColor}, #00FFFF, ${activeColor});
              background-size: 200% auto;
              color: transparent;
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
              filter: drop-shadow(0 0 0.416em ${activeColor}) drop-shadow(0 0.138em 0.277em rgba(0,0,0,0.8));
            }
            .aura-word.active::after {
              text-shadow: ${strokeWidth > 0 ? roundedStrokeShadow : 'none'};
            }
            @keyframes springPop {
              0% { transform: rotateX(-60deg) translateY(0.555em) scale(0.8); opacity: 0; background-position: 0% center; }
              100% { transform: rotateX(0deg) translateY(0) scale(1.1); opacity: 1; background-position: 200% center; }
            }
          `}
        </style>
        <span className="aura-container">
          <span key={`prev-${activeWordIndex}`} className="aura-word inactive" data-text={words[activeWordIndex - 1]?.word}>{words[activeWordIndex - 1]?.word}</span>
          <span key={`active-${activeWordIndex}`} className="aura-word active" data-text={words[activeWordIndex].word}>{words[activeWordIndex].word}</span>
          <span key={`next-${activeWordIndex}`} className="aura-word inactive" data-text={words[activeWordIndex + 1]?.word}>{words[activeWordIndex + 1]?.word}</span>
        </span>
      </>
    );
  }
};
