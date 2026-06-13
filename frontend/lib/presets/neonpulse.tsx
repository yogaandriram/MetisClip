import React from 'react';
import { SubtitlePreset } from './types';

export const neonpulsePreset: SubtitlePreset = {
  id: 'neonpulse',
  name: 'NEON PULSE',
  getDefaultConfig: (baseHighlightColor?: string) => ({
    fontFamily: 'Orbitron',
    fontWeight: 'Regular',
    isUppercase: true,
    fontColor: '#ffffff',
    strokeColor: '#000000',
    strokeWidth: 0,
    hasShadow: true,
    shadowColor: '#FF00FF',
    shadowX: 0,
    shadowY: 0,
    shadowBlur: 20,
    highlightColor: baseHighlightColor || '#FF00FF'
  }),
  renderButton: (isSelected: boolean, onClick: () => void) => {
    const activeColor = '#FF00FF';
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
          fontFamily: "'Orbitron', sans-serif",
          fontSize: '24px',
          fontWeight: '900',
          boxShadow: isSelected ? `0 0 20px rgba(255, 0, 255, 0.2)` : 'none',
          overflow: 'hidden',
          letterSpacing: '2px',
          textTransform: 'uppercase'
        }}
      >
        <style>
          {`
            @keyframes neonBtnPulse {
              0%, 100% {
                text-shadow: 0 0 5px ${activeColor}, 0 0 15px ${activeColor};
              }
              50% {
                text-shadow: 0 0 2px ${activeColor}, 0 0 5px ${activeColor};
              }
            }
            .neon-btn-text {
              color: ${activeColor};
              animation: neonBtnPulse 1.5s ease-in-out infinite;
              display: inline-block;
            }
          `}
        </style>
        <span className="neon-btn-text">
          NEON PULSE
        </span>
      </button>
    );
  },
  renderPreview: ({ words, activeWordIndex, config }) => {
    const activeColor = (config.highlightColor && config.highlightColor !== '#000000') ? config.highlightColor : '#FF00FF';
    const fontColor = config.fontColor || '#ffffff';
    const shadowColor = config.hasShadow ? (config.shadowColor || '#000000') : 'transparent';
    const shadowBlur = config.hasShadow ? (config.shadowBlur || 0) : 0;

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
    const numericWeight = getWeight(config.fontWeight) || 900;
    
    return (
      <>
        <style>
          {`
            .neonpulse-container {
              display: inline-flex;
              gap: 12px;
              align-items: center;
              padding: 20px;
              flex-wrap: wrap;
              justify-content: center;
            }
            .neonpulse-word {
              font-family: '${config.fontFamily}', sans-serif;
              font-weight: ${numericWeight};
              text-transform: ${config.isUppercase ? 'uppercase' : 'none'};
              letter-spacing: 2px;
              /* Removed transition: all to prevent Safari/Chrome bugs with animated text-shadows */
            }
            .neonpulse-word.inactive {
              display: inline-block;
              color: ${fontColor};
              opacity: 0.5;
              transform: scale(0.9);
              text-shadow: 0 0 ${shadowBlur}px ${shadowColor};
              transition: transform 0.3s ease, opacity 0.3s ease;
            }
            .neonpulse-word.active {
              display: inline-block;
              color: ${fontColor}; /* Hot white core for true neon effect */
              transform: scale(1.15);
              animation: neonPulseAnim 1.5s ease-in-out infinite;
              z-index: 10;
              position: relative;
              transition: transform 0.3s ease;
            }
            @keyframes neonPulseAnim {
              0%, 100% {
                text-shadow: 0 0 5px ${activeColor}, 0 0 20px ${activeColor}, 0 0 40px ${activeColor};
              }
              50% {
                text-shadow: 0 0 2px ${activeColor}, 0 0 8px ${activeColor};
              }
            }
          `}
        </style>
        <span className="neonpulse-container">
          <span key={`prev-${activeWordIndex}`} className="neonpulse-word inactive">
            {words[activeWordIndex - 1]?.word}
          </span>
          <span key={`active-${activeWordIndex}`} className="neonpulse-word active">
            {words[activeWordIndex].word}
          </span>
          <span key={`next-${activeWordIndex}`} className="neonpulse-word inactive">
            {words[activeWordIndex + 1]?.word}
          </span>
        </span>
      </>
    );
  }
};
