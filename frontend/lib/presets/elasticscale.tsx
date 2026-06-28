import React from 'react';
import { SubtitlePreset, generateRoundedStroke } from './types';

export const elasticscalePreset: SubtitlePreset = {
  id: 'elasticscale',
  name: 'ELASTIC SCALE',
  getDefaultConfig: (baseHighlightColor?: string) => ({
    fontFamily: 'Inter',
    fontSize: 36,
    fontWeight: 'Black',
    isUppercase: true,
    fontColor: '#111111',
    strokeColor: '#000000',
    strokeWidth: 0,
    hasShadow: false, // Disabling standard shadow, using box-shadow for bg
    shadowColor: '#000000',
    shadowX: 0,
    shadowY: 0,
    shadowBlur: 0,
    highlightColor: baseHighlightColor || '#FFD700', // Using highlightColor as bg color
    letterSpacing: 0,
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
            @keyframes elasticScaleBtn {
              0% { transform: scaleX(0); opacity: 0; }
              35% { transform: scaleX(1.15); opacity: 1; }
              55% { transform: scaleX(0.95); }
              70%, 90% { transform: scaleX(1); opacity: 1; }
              100% { opacity: 0; }
            }
          `}
        </style>
        <div style={{
          fontFamily: "'Inter', sans-serif",
          fontWeight: 900,
          fontSize: '12px',
          color: '#111',
          background: '#FFD700',
          padding: '6px 14px',
          animation: 'elasticScaleBtn 2.5s cubic-bezier(0.36,0.07,0.19,0.97) infinite',
          transformOrigin: 'left',
          borderRadius: '4px',
          boxShadow: '0 2px 10px rgba(255,215,0,0.4)',
          textTransform: 'uppercase'
        }}>
          ELASTIC
        </div>
      </button>
    );
  },
  renderPreview: ({ words, activeWordIndex, config }) => {
    const fontColor = config.fontColor || '#111111';
    const bgColor = config.highlightColor || '#FFD700'; // We use highlightColor for the background
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
    
    const baseFontSize = config.fontSize || 36;
    const strokeWidth = config.strokeWidth || 0;
    const strokeColor = config.strokeColor || '#000000';
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
    const letterSpacingEm = (config.letterSpacing !== undefined ? config.letterSpacing : 0) / baseFontSize;
    
    return (
      <>
        <style>
          {`
            .elastic-container {
              display: flex;
              align-items: center;
              flex-wrap: wrap;
              justify-content: center;
              max-width: 100%;
              justify-content: center;
              width: 100%;
              padding: 20px;
            }
            .elastic-word {
              font-family: '${config.fontFamily}', sans-serif;
              font-weight: ${numericWeight};
              color: ${fontColor};
              background: ${bgColor};
              letter-spacing: ${letterSpacingEm}em;
              line-height: ${config.lineHeight !== undefined ? config.lineHeight : 1.2};
              text-transform: ${config.isUppercase ? 'uppercase' : 'none'};
              text-shadow: ${finalTextShadow};
              padding: 0.222em 0.777em;
              border-radius: 0.111em;
              box-shadow: 0 0.111em 0.555em rgba(255,215,0,0.4);
              animation: elasticScaleAnim 1s cubic-bezier(0.36,0.07,0.19,0.97) forwards;
              transform-origin: left;
              display: inline-block;
            }
            
            @keyframes elasticScaleAnim {
              0% { transform: scaleX(0); opacity: 0; }
              35% { transform: scaleX(1.15); opacity: 1; }
              55% { transform: scaleX(0.95); opacity: 1; }
              70%, 100% { transform: scaleX(1); opacity: 1; }
            }
          `}
        </style>
        <div className="elastic-container">
          <div key={`word-${activeWordIndex}`}>
            {/* Single word rendering */}
            <span className="elastic-word">
              {currentWord}
            </span>
          </div>
        </div>
      </>
    );
  }
};
