import React from 'react';
import { SubtitlePreset } from './types';

export const staggerfadePreset: SubtitlePreset = {
  id: 'staggerfade',
  name: 'STAGGER FADE',
  getDefaultConfig: (baseHighlightColor?: string) => ({
    fontFamily: 'Exo 2',
    fontWeight: 'Black',
    isUppercase: true,
    fontColor: '#00CFFF',
    strokeColor: '#000000',
    strokeWidth: 0,
    hasShadow: false,
    shadowColor: '#000000',
    shadowX: 0,
    shadowY: 0,
    shadowBlur: 0,
    highlightColor: baseHighlightColor || '#00CFFF',
    letterSpacing: 2,
    lineHeight: 1.2
  }),
  renderButton: (isSelected: boolean, onClick: () => void) => {
    const text = "STAGGER";
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
            @keyframes staggerFadeBtn {
              0%,100%{opacity:0;transform:translateY(15px)}
              20%,80%{opacity:1;transform:translateY(0)}
            }
            .stagger-btn-wrap {
              display: flex;
            }
            .stagger-btn-char {
              display: inline-block;
              font-family: 'Exo 2', sans-serif;
              font-weight: 900;
              font-size: 14px;
              color: #00CFFF;
              text-transform: uppercase;
              letter-spacing: 2px;
            }
          `}
        </style>
        <div className="stagger-btn-wrap">
          {text.split('').map((char, index) => (
            <span 
              key={index} 
              className="stagger-btn-char"
              style={{ animation: `staggerFadeBtn 2s ${index * 0.12}s infinite` }}
            >
              {char}
            </span>
          ))}
        </div>
      </button>
    );
  },
  renderPreview: ({ words, activeWordIndex, config }) => {
    const fontColor = config.fontColor || '#00CFFF';
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
    
    // Custom Shadow support if enabled
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
            .stagger-container {
              display: flex;
              align-items: center;
              flex-wrap: wrap;
              justify-content: center;
              max-width: 100%;
              justify-content: center;
              width: 100%;
              padding: 20px;
            }
            .stagger-wrap {
              display: flex;
            }
            .stagger-char {
              display: inline-block;
              font-family: '${config.fontFamily}', sans-serif;
              font-weight: ${numericWeight};
              color: ${fontColor};
              letter-spacing: ${config.letterSpacing !== undefined ? config.letterSpacing : 2}px;
              line-height: ${config.lineHeight !== undefined ? config.lineHeight : 1.2};
              text-transform: ${config.isUppercase ? 'uppercase' : 'none'};
              text-shadow: ${shadowString};
              ${webkitStroke}
            }
            
            @keyframes staggerFadeAnim {
              0%,100%{opacity:0;transform:translateY(25px)}
              20%,80%{opacity:1;transform:translateY(0)}
            }
          `}
        </style>
        <div className="stagger-container">
          <div className="stagger-wrap" key={`word-${activeWordIndex}`}>
            {/* Split active word into characters and apply stagger delay */}
            {currentWord.split('').map((char, index) => (
              <span 
                key={`char-${index}`}
                className="stagger-char"
                style={{ animation: `staggerFadeAnim 2s ${index * 0.12}s infinite` }}
              >
                {char}
              </span>
            ))}
          </div>
        </div>
      </>
    );
  }
};
