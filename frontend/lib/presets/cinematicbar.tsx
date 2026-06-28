import React from 'react';
import { SubtitlePreset } from './types';

export const cinematicbarPreset: SubtitlePreset = {
  id: 'cinematicbar',
  name: 'CINEMATIC BAR',
  getDefaultConfig: (baseHighlightColor?: string) => ({
    fontFamily: 'Montserrat',
    fontSize: 36,
    fontWeight: 'Bold',
    isUppercase: true,
    fontColor: '#ffffff',
    strokeColor: '#000000',
    strokeWidth: 0,
    hasShadow: false,
    shadowColor: '#000000',
    shadowX: 0,
    shadowY: 0,
    shadowBlur: 0,
    highlightColor: baseHighlightColor || '#ffffff',
    letterSpacing: 8,
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
          overflow: 'hidden'
        }}
      >
        <style>
          {`
            @keyframes cinematicInBtn {
              0%{transform:translateY(10px);opacity:0}
              15%,85%{transform:translateY(0);opacity:1}
              100%{opacity:0}
            }
          `}
        </style>
        <div style={{ textAlign: 'center', width: '100%' }}>
          <div style={{
            width: '80%', margin: '0 auto', height: '1px',
            background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.6),transparent)'
          }}></div>
          <div style={{
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 700, 
            fontSize: '14px',
            color: '#fff', 
            letterSpacing: '4px', // Reduced from 8px to fit in the button
            textTransform: 'uppercase',
            padding: '4px 0',
            animation: 'cinematicInBtn 3s ease-in-out infinite'
          }}>
            CINEMATIC BAR
          </div>
          <div style={{
            width: '80%', margin: '0 auto', height: '1px',
            background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.6),transparent)'
          }}></div>
        </div>
      </button>
    );
  },
  renderPreview: ({ words, activeWordIndex, config }) => {
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
      return 400; // Default fallback
    };
    const numericWeight = getWeight(config.fontWeight);
    
    return (
      <>
        <style>
          {`
            .cinematic-container {
              display: flex;
              align-items: center;
              flex-wrap: wrap;
              justify-content: center;
              max-width: 100%;
              justify-content: center;
              width: 100%;
            }
            .cinematic-wrap {
              text-align: center;
              width: 100%;
              min-width: 250px; /* Ensure lines are wide enough */
            }
            .cinematic-bar-top, .cinematic-bar-bot {
              width: 100%;
              margin: 0 auto;
              height: 1px;
              background: linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent);
            }
            .cinematic-word {
              font-family: '${config.fontFamily}', sans-serif;
              font-weight: ${numericWeight};
              color: ${fontColor};
              letter-spacing: ${config.letterSpacing !== undefined ? config.letterSpacing : 8}px;
              line-height: ${config.lineHeight !== undefined ? config.lineHeight : 1.2};
              text-transform: ${config.isUppercase ? 'uppercase' : 'none'};
              padding: 8px 0;
            }
            .cinematic-word.active {
              animation: cinematicInAnim 1s ease-in-out forwards;
            }
            @keyframes cinematicInAnim {
              0% { transform: translateY(30px); opacity: 0; }
              15% { transform: translateY(0); opacity: 1; }
              85% { transform: translateY(0); opacity: 1; }
              100% { transform: translateY(-10px); opacity: 0; }
            }
          `}
        </style>
        <div className="cinematic-container">
          <div className="cinematic-wrap">
            <div className="cinematic-bar-top"></div>
            <div key={`active-${activeWordIndex}`} className="cinematic-word active">
              {words[activeWordIndex]?.word || ''}
            </div>
            <div className="cinematic-bar-bot"></div>
          </div>
        </div>
      </>
    );
  }
};
