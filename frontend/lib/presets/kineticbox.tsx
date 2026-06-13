import React from 'react';
import { SubtitlePreset } from './types';

export const kineticboxPreset: SubtitlePreset = {
  id: 'kineticbox',
  name: 'KINETIC BOX',
  getDefaultConfig: (baseHighlightColor?: string) => ({
    fontFamily: 'Montserrat',
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
    highlightColor: baseHighlightColor || '#FFFF00'
  }),
  renderButton: (isSelected: boolean, onClick: () => void) => {
    const activeColor = '#FFFF00';
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
          background: activeColor,
          color: '#111',
          padding: '4px 12px',
          transform: 'skewX(-10deg) scale(1.05)',
          display: 'inline-block',
          boxShadow: '4px 4px 0 rgba(0,0,0,0.8)'
        }}>
          <span style={{ display: 'inline-block', transform: 'skewX(10deg)' }}>KINETIC</span>
        </span>
      </button>
    );
  },
  renderPreview: ({ words, activeWordIndex, config }) => {
    const activeColor = (config.highlightColor && config.highlightColor !== '#000000') ? config.highlightColor : '#FFEB3B';
    const fontColor = config.fontColor || '#000000';

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
            .kinetic-container {
              display: inline-flex;
              gap: 12px;
              align-items: center;
            }
            .kinetic-word {
              display: inline-block;
              font-family: '${config.fontFamily}', var(--font-display);
              font-weight: ${numericWeight};
              text-transform: uppercase;
              transition: all 0.2s ease;
            }
            .kinetic-word.inactive {
              color: ${config.fontColor};
              opacity: 0.9;
              transform: scale(0.95);
              text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
            }
            .kinetic-word.active {
              animation: kineticSmash 0.3s cubic-bezier(0.25, 1, 0.5, 1) both;
              background: ${activeColor};
              color: #111;
              padding: 4px 12px;
              transform: skewX(-10deg);
              box-shadow: 4px 4px 0 rgba(0,0,0,0.8);
            }
            .kinetic-inner {
              display: inline-block;
              transform: skewX(10deg);
            }
            @keyframes kineticSmash {
              0% { transform: skewX(-10deg) scale(0.5); opacity: 0; box-shadow: 0px 0px 0 rgba(0,0,0,0.8); }
              60% { transform: skewX(-10deg) scale(1.15); box-shadow: 8px 8px 0 rgba(0,0,0,0.8); }
              100% { transform: skewX(-10deg) scale(1.05); opacity: 1; box-shadow: 4px 4px 0 rgba(0,0,0,0.8); }
            }
          `}
        </style>
        <span className="kinetic-container">
          <span key={`prev-${activeWordIndex}`} className="kinetic-word inactive">{words[activeWordIndex - 1]?.word}</span>
          
          <span key={`active-${activeWordIndex}`} className="kinetic-word active">
            <span className="kinetic-inner">{words[activeWordIndex].word}</span>
          </span>
          
          <span key={`next-${activeWordIndex}`} className="kinetic-word inactive">{words[activeWordIndex + 1]?.word}</span>
        </span>
      </>
    );
  }
};
