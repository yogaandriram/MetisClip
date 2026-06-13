import React, { useState, useEffect, useRef } from 'react';

interface PremiumSliderProps {
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (val: number) => void;
}

export const PremiumSlider: React.FC<PremiumSliderProps> = ({ min, max, step = 1, value, onChange }) => {
  const [localValue, setLocalValue] = useState<number>(value);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const sliderRef = useRef<HTMLInputElement>(null);

  // Sync with external value if it changes from outside
  useEffect(() => {
    if (!isDragging) {
      setLocalValue(value);
    }
  }, [value, isDragging]);

  // Debounced onChange
  useEffect(() => {
    if (isDragging) {
      const handler = setTimeout(() => {
        onChange(localValue);
      }, 50); // 50ms Option A Debounce
      
      return () => clearTimeout(handler);
    }
  }, [localValue, isDragging, onChange]);

  const percentage = ((localValue - min) / (max - min)) * 100;

  return (
    <div 
      style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Tooltip */}
      <div 
        style={{
          position: 'absolute',
          top: '-30px',
          left: `calc(${percentage}% + (${8 - percentage * 0.15}px))`, // Adjust for thumb width (approx 16px)
          transform: 'translateX(-50%)',
          background: 'rgba(20, 20, 20, 0.95)',
          color: '#fff',
          padding: '4px 8px',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: 600,
          pointerEvents: 'none',
          opacity: isDragging || isHovered ? 1 : 0,
          transition: 'opacity 0.2s, top 0.2s',
          whiteSpace: 'nowrap',
          border: '1px solid var(--border-glass)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          zIndex: 10
        }}
      >
        {localValue.toFixed(step < 1 ? 1 : 0)}
      </div>

      <input 
        ref={sliderRef}
        type="range" 
        min={min} 
        max={max} 
        step={step}
        value={localValue}
        onChange={(e) => setLocalValue(Number(e.target.value))}
        onMouseDown={() => setIsDragging(true)}
        onMouseUp={() => {
          setIsDragging(false);
          onChange(localValue); // Final definitive update
        }}
        onTouchStart={() => setIsDragging(true)}
        onTouchEnd={() => {
          setIsDragging(false);
          onChange(localValue);
        }}
        style={{ 
          width: '100%', 
          cursor: 'pointer',
          accentColor: 'var(--primary)',
          height: '4px',
          borderRadius: '2px',
          outline: 'none'
        }}
      />
    </div>
  );
};
