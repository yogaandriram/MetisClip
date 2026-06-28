import React from 'react';
import { SubtitlePreset } from './types';

export const luminaPreset: SubtitlePreset = {
  id: 'lumina',
  name: 'LUMINA',
  getDefaultConfig: (baseHighlightColor?: string) => ({
    fontFamily: 'Inter',
    fontSize: 36,
    fontWeight: 'Regular',
    isUppercase: true,
    fontColor: '#ffffff',
    strokeColor: '#000000',
    strokeWidth: 0,
    hasShadow: true,
    shadowColor: '#000000',
    shadowX: 0,
    shadowY: 0,
    shadowBlur: 0,
    highlightColor: baseHighlightColor || '#00FFCC',
    letterSpacing: 0,
    lineHeight: 1.2
  }),
  renderButton: (isSelected: boolean, onClick: () => void) => {
    const activeColor = '#FFFFFF';
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
          fontFamily: "'Inter', var(--font-display)",
          fontSize: '18px',
          fontWeight: '500',
          textTransform: "uppercase",
          boxShadow: isSelected ? '0 0 20px rgba(24, 86, 255, 0.3)' : 'none',
          overflow: 'hidden'
        }}
      >
        <span style={{ 
          background: 'rgba(255, 255, 255, 0.15)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          borderRadius: '50px',
          padding: '6px 16px',
          color: activeColor,
          letterSpacing: '4px',
          textShadow: `0 0 10px ${activeColor}`,
          display: 'inline-block',
          boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
        }}>
          LUMINA
        </span>
      </button>
    );
  },
  renderPreview: ({ words, activeWordIndex, config }) => {
    const activeColor = (config.highlightColor && config.highlightColor !== '#000000') ? config.highlightColor : '#FFFFFF';

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
            .lumina-container {
              display: inline-flex;
              gap: 12px;
              align-items: center;
              flex-wrap: wrap;
              justify-content: center;
              max-width: 100%;
            }
            .lumina-word {
              display: inline-block;
              font-family: '${config.fontFamily}', var(--font-display);
              font-weight: ${numericWeight};
              text-transform: ${config.isUppercase ? 'uppercase' : 'none'};
              letter-spacing: ${config.letterSpacing !== undefined ? config.letterSpacing : 0}px;
              line-height: ${config.lineHeight !== undefined ? config.lineHeight : 1.2};
              text-shadow: ${config.hasShadow ? `${config.shadowX}px ${config.shadowY}px ${config.shadowBlur}px ${config.shadowColor}` : 'none'};
              transition: all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
            }
            .lumina-word.inactive {
              color: ${config.fontColor};
              opacity: 0.4;
              transform: scale(0.95);
              filter: blur(1px);
            }
            .lumina-word.active {
              animation: etherealFade 0.8s ease-out both;
              background: rgba(255, 255, 255, 0.15);
              backdrop-filter: blur(10px);
              -webkit-backdrop-filter: blur(10px);
              border: 1px solid rgba(255, 255, 255, 0.3);
              border-radius: 50px;
              padding: 6px 18px;
              color: ${activeColor};
              text-shadow: 0 0 10px ${activeColor}, 0 2px 4px rgba(0,0,0,0.5);
              box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            }
            @keyframes etherealFade {
              0% { 
                opacity: 0; 
                transform: translateY(10px) scale(0.9);
                letter-spacing: 0px;
                filter: blur(4px);
              }
              100% { 
                opacity: 1; 
                transform: translateY(0) scale(1);
                letter-spacing: 4px;
                filter: blur(0px);
              }
            }
          `}
        </style>
        <span className="lumina-container">
          <span key={`prev-${activeWordIndex}`} className="lumina-word inactive">{words[activeWordIndex - 1]?.word}</span>
          <span key={`active-${activeWordIndex}`} className="lumina-word active">{words[activeWordIndex].word}</span>
          <span key={`next-${activeWordIndex}`} className="lumina-word inactive">{words[activeWordIndex + 1]?.word}</span>
        </span>
      </>
    );
  }
};
