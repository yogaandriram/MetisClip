import React from 'react';
import { SubtitlePreset } from './types';

export const typewriterPreset: SubtitlePreset = {
  id: 'typewriter',
  name: 'TYPEWRITER',
  getDefaultConfig: (baseHighlightColor?: string) => ({
    fontFamily: 'Courier New',
    fontWeight: 'Regular',
    isUppercase: false,
    fontColor: '#00FF88',
    strokeColor: '#000000',
    strokeWidth: 0,
    hasShadow: true,
    shadowColor: '#00FF88',
    shadowX: 0,
    shadowY: 0,
    shadowBlur: 10,
    highlightColor: baseHighlightColor || '#00FF88'
  }),
  renderButton: (isSelected: boolean, onClick: () => void) => {
    const activeColor = '#00FF88';
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
          fontFamily: "'Courier New', monospace",
          fontSize: '24px',
          fontWeight: '700',
          boxShadow: isSelected ? `0 0 20px rgba(0, 255, 136, 0.2)` : 'none',
          overflow: 'hidden',
          color: '#ffffff'
        }}
      >
        <style>
          {`
            @keyframes blinkBtn {
              50% { border-color: transparent; }
            }
            .type-btn-text {
              color: ${activeColor};
              border-right: 3px solid ${activeColor};
              white-space: nowrap;
              padding-right: 5px;
              animation: blinkBtn 0.7s infinite;
              text-shadow: 0 0 8px ${activeColor};
              display: inline-block;
            }
          `}
        </style>
        <span className="type-btn-text">
          TYPEWRITER
        </span>
      </button>
    );
  },
  renderPreview: ({ words, activeWordIndex, config }) => {
    const activeColor = (config.highlightColor && config.highlightColor !== '#000000') ? config.highlightColor : '#00FF88';
    const fontColor = config.fontColor || '#00FF88';
    const shadowColor = config.hasShadow ? (config.shadowColor || activeColor) : 'transparent';
    const shadowBlur = config.hasShadow ? (config.shadowBlur || 10) : 0;

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
    const numericWeight = getWeight(config.fontWeight) || 700;
    
    return (
      <>
        <style>
          {`
            .typewriter-container {
              display: inline-flex;
              flex-wrap: wrap;
              gap: 8px;
              justify-content: center;
              padding: 10px;
            }
            .typewriter-word {
              font-family: '${config.fontFamily}', monospace;
              font-weight: ${numericWeight};
              text-transform: ${config.isUppercase ? 'uppercase' : 'none'};
            }
            .typewriter-word-wrapper {
              position: relative;
              display: inline-block;
            }
            .typewriter-word.past {
              display: inline-block;
              color: ${fontColor};
              text-shadow: 0 0 ${shadowBlur}px ${shadowColor};
            }
            .typewriter-word.active {
              position: absolute;
              left: 0;
              top: 0;
              bottom: 0;
              display: inline-block;
              color: ${activeColor};
              text-shadow: 0 0 ${shadowBlur}px ${activeColor};
              border-right: 3px solid ${activeColor};
              white-space: nowrap;
              overflow: hidden;
              animation: typewriterAnim 0.3s steps(10) forwards, blinkAnim 0.7s infinite;
            }
            .typewriter-word.future {
              display: none;
            }
            @keyframes typewriterAnim {
              from { width: 0; }
              to { width: 100%; }
            }
            @keyframes blinkAnim {
              50% { border-color: transparent; }
            }
          `}
        </style>
        <span className="typewriter-container">
          {words.map((w, i) => {
            const wordText = w.word.trim();
            if (i < activeWordIndex) {
              return <span key={i} className="typewriter-word past">{wordText}</span>;
            } else if (i === activeWordIndex) {
              return (
                <span key={i} className="typewriter-word-wrapper">
                  <span className="typewriter-word" style={{ visibility: 'hidden', whiteSpace: 'nowrap', paddingRight: '5px' }}>
                    {wordText}
                  </span>
                  <span className="typewriter-word active" style={{ paddingRight: '5px' }}>
                    {wordText}
                  </span>
                </span>
              );
            }
            return <span key={i} className="typewriter-word future">{wordText}</span>;
          })}
        </span>
      </>
    );
  }
};
