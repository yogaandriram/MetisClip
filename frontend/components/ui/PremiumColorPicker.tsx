import React, { useState } from 'react';
import { HexAlphaColorPicker } from 'react-colorful';
import { useFloating, useClick, useInteractions, useDismiss, offset, flip, shift } from '@floating-ui/react';

interface PremiumColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  label?: string;
}

export const PremiumColorPicker: React.FC<PremiumColorPickerProps> = ({ color, onChange, label }) => {
  const [isOpen, setIsOpen] = useState(false);

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
        </div>
      )}
    </div>
  );
};
