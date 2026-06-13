import React, { useState, useEffect } from 'react';
import { HexAlphaColorPicker } from 'react-colorful';
import { useFloating, useClick, useInteractions, useDismiss, offset, flip, shift } from '@floating-ui/react';

interface PremiumColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  label?: string;
}

const DEFAULT_SWATCHES = ['#FFFFFF', '#000000', '#FFD700', '#00FFCC', '#FF00FF', '#FF3366', '#33CCFF', '#00FF66'];
const STORAGE_KEY = 'aiautoclip_recent_colors';

export const PremiumColorPicker: React.FC<PremiumColorPickerProps> = ({ color, onChange, label }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [recentColors, setRecentColors] = useState<string[]>(DEFAULT_SWATCHES);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setRecentColors(JSON.parse(saved));
      } catch (e) {}
    }
  }, []);

  // Save color to recents when closing the picker
  useEffect(() => {
    if (!isOpen && color) {
      if (!recentColors.includes(color)) {
        const newRecent = [color, ...recentColors].slice(0, 16); // Max 16 colors
        setRecentColors(newRecent);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newRecent));
      }
    }
  }, [isOpen, color, recentColors]);

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement: 'bottom-end',
    middleware: [offset(10), flip(), shift()],
  });

  const click = useClick(context);
  const dismiss = useDismiss(context);

  const { getReferenceProps, getFloatingProps } = useInteractions([
    click,
    dismiss
  ]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
      {label && <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{label}</span>}
      <div
        ref={refs.setReference}
        {...getReferenceProps()}
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '8px',
          backgroundColor: color,
          border: '1px solid var(--border-glass)',
          cursor: 'pointer',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          marginLeft: label ? 'auto' : '0'
        }}
      />
      {isOpen && (
        <div 
          ref={refs.setFloating}
          style={{
            ...floatingStyles,
            zIndex: 9999,
            padding: '12px',
            background: 'rgba(20, 20, 20, 0.95)',
            backdropFilter: 'blur(10px)',
            border: '1px solid var(--border-glass)',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
          }}
          {...getFloatingProps()}
        >
          <HexAlphaColorPicker color={color} onChange={onChange} />
          <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
            <input 
              type="text" 
              value={color}
              onChange={(e) => onChange(e.target.value)}
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--border-glass)',
                color: 'white',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px'
              }}
            />
          </div>
          
          <div style={{ marginTop: '12px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '8px' }}>Recent & Swatches</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', width: '200px' }}>
              {recentColors.map(c => (
                <div 
                  key={c}
                  onClick={() => onChange(c)}
                  style={{
                    width: '20px', height: '20px', borderRadius: '4px', background: c,
                    cursor: 'pointer', border: '1px solid rgba(255,255,255,0.2)',
                    boxShadow: c === color ? '0 0 0 2px #fff' : 'none',
                    transition: 'transform 0.1s'
                  }}
                  title={c}
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
