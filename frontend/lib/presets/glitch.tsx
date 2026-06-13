import React from 'react';
import { SubtitlePreset } from './types';

export const glitchPreset: SubtitlePreset = {
  id: 'glitch',
  name: 'GLITCH EFFECT',
  getDefaultConfig: (baseHighlightColor?: string) => ({
    fontFamily: 'Orbitron',
    fontWeight: 'Black',
    isUppercase: true,
    fontColor: '#00ffff',
    strokeColor: '#000000',
    strokeWidth: 0,
    hasShadow: false,
    shadowColor: '#000000',
    shadowX: 0,
    shadowY: 0,
    shadowBlur: 0,
    highlightColor: baseHighlightColor || '#00ffff',
    letterSpacing: 4,
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
            @keyframes glitchBtn1 {
              0%,100%{clip-path:inset(0 0 90% 0);transform:translate(-2px,0)}
              50%{clip-path:inset(30% 0 50% 0);transform:translate(2px,0)}
            }
            @keyframes glitchBtn2 {
              0%,100%{clip-path:inset(60% 0 20% 0);transform:translate(2px,0)}
              50%{clip-path:inset(10% 0 80% 0);transform:translate(-2px,0)}
            }
            .glitch-btn-text {
              font-family: 'Orbitron', sans-serif;
              font-weight: 900;
              font-size: 14px;
              color: #0ff;
              text-transform: uppercase;
              letter-spacing: 2px;
              position: relative;
            }
            .glitch-btn-text::before, .glitch-btn-text::after {
              content: attr(data-text);
              position: absolute;
              top: 0; left: 0; width: 100%;
              background: transparent;
            }
            .glitch-btn-text::before { color: #f0f; animation: glitchBtn1 3s infinite; z-index: -1; }
            .glitch-btn-text::after { color: #ff0; animation: glitchBtn2 3s infinite; z-index: -2; }
          `}
        </style>
        <div className="glitch-btn-text" data-text="GLITCH">
          GLITCH
        </div>
      </button>
    );
  },
  renderPreview: ({ words, activeWordIndex, config }) => {
    const fontColor = config.fontColor || '#00ffff';
    const currentWord = words[activeWordIndex]?.word || '';
    
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
    
    // Custom Shadow support if enabled, though Glitch doesn't need it by default
    const blur = config.shadowBlur ?? 0;
    const shadowString = config.hasShadow 
      ? `${config.shadowX || 0}px ${config.shadowY || 0}px ${blur}px ${config.shadowColor}`
      : 'none';
      
    // Stroke
    let webkitStroke = '';
    if (config.strokeWidth && config.strokeWidth > 0 && config.strokeColor) {
      webkitStroke = `-webkit-text-stroke: ${config.strokeWidth}px ${config.strokeColor};`;
    }
    
    return (
      <>
        <style>
          {`
            .glitch-container {
              display: flex;
              align-items: center;
              flex-wrap: wrap;
              justify-content: center;
              max-width: 100%;
              justify-content: center;
              width: 100%;
              padding: 20px;
            }
            .glitch-wrap {
              position: relative;
            }
            .glitch-word {
              font-family: '${config.fontFamily}', sans-serif;
              font-weight: ${numericWeight};
              color: ${fontColor};
              letter-spacing: ${config.letterSpacing !== undefined ? config.letterSpacing : 4}px;
              line-height: ${config.lineHeight !== undefined ? config.lineHeight : 1.2};
              text-transform: ${config.isUppercase ? 'uppercase' : 'none'};
              text-shadow: ${shadowString};
              ${webkitStroke}
              position: relative;
              display: inline-block;
            }
            .glitch-word::before, .glitch-word::after {
              content: attr(data-text);
              position: absolute;
              top: 0; left: 0; width: 100%;
              background: transparent;
            }
            .glitch-word::before {
              color: #f0f;
              animation: glitchAnim1 3s infinite;
              z-index: -1;
            }
            .glitch-word::after {
              color: #ff0;
              animation: glitchAnim2 3s infinite;
              z-index: -2;
            }
            
            @keyframes glitchAnim1 {
              0%,100% { clip-path: inset(0 0 90% 0); transform: translate(-4px, 0); }
              50% { clip-path: inset(30% 0 50% 0); transform: translate(4px, 0); }
            }
            @keyframes glitchAnim2 {
              0%,100% { clip-path: inset(60% 0 20% 0); transform: translate(4px, 0); }
              50% { clip-path: inset(10% 0 80% 0); transform: translate(-4px, 0); }
            }
          `}
        </style>
        <div className="glitch-container">
          <div className="glitch-wrap">
            {/* Single word rendering with data-text attribute for CSS pseudo-elements */}
            <span 
              key={`active-${activeWordIndex}`} 
              className="glitch-word"
              data-text={currentWord}
            >
              {currentWord}
            </span>
          </div>
        </div>
      </>
    );
  }
};
