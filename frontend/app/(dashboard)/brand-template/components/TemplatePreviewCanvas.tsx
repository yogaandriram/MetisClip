import React, { useState, useRef, useEffect, useCallback } from 'react';
import { presets } from '@/lib/presets';
import { CaptionSettings, BrandSettings, LayoutSettings } from '../types';

interface TemplatePreviewCanvasProps {
  caption: CaptionSettings;
  aiEmojis: boolean;
  brandSettings?: BrandSettings;
  layoutSettings: LayoutSettings;
  onUpdateBrand?: (updates: Partial<BrandSettings>) => void;
}

export const TemplatePreviewCanvas: React.FC<TemplatePreviewCanvasProps> = ({ caption, aiEmojis, brandSettings, layoutSettings, onUpdateBrand }) => {
  const defaultVideoUrl = "https://www.w3schools.com/html/mov_bbb.mp4";
  const videoUrl = brandSettings?.sampleVideoUrl || defaultVideoUrl;

  // Canvas bounds
  const CANVAS_WIDTH = 300;
  const CANVAS_HEIGHT = 533;
  const LOGO_SIZE = 60; // Max width/height of the logo
  const SNAP_THRESHOLD = 15;

  // Dragging State
  const initialPos = brandSettings?.logoPosition || { x: CANVAS_WIDTH - LOGO_SIZE - 15, y: 15 };
  const [pos, setPos] = useState(initialPos);
  const [isDragging, setIsDragging] = useState(false);
  const [snapGuides, setSnapGuides] = useState({ x: false, y: false });
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync state with props if it changes externally
  useEffect(() => {
    if (brandSettings?.logoPosition && !isDragging) {
      setPos(brandSettings.logoPosition);
    }
  }, [brandSettings?.logoPosition, isDragging]);

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    let newX = e.clientX - rect.left - LOGO_SIZE / 2;
    let newY = e.clientY - rect.top - LOGO_SIZE / 2;

    // Boundaries
    newX = Math.max(0, Math.min(newX, CANVAS_WIDTH - LOGO_SIZE));
    newY = Math.max(0, Math.min(newY, CANVAS_HEIGHT - LOGO_SIZE));

    // Snapping Logic
    const centerX = CANVAS_WIDTH / 2 - LOGO_SIZE / 2;
    const centerY = CANVAS_HEIGHT / 2 - LOGO_SIZE / 2;
    
    let snapX = false;
    let snapY = false;

    if (Math.abs(newX - centerX) < SNAP_THRESHOLD) {
      newX = centerX;
      snapX = true;
    }
    if (Math.abs(newY - centerY) < SNAP_THRESHOLD) {
      newY = centerY;
      snapY = true;
    }

    setSnapGuides({ x: snapX, y: snapY });
    setPos({ x: newX, y: newY });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    setSnapGuides({ x: false, y: false });
    e.currentTarget.releasePointerCapture(e.pointerId);
    
    if (onUpdateBrand) {
      onUpdateBrand({ logoPosition: pos });
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: '16px', position: 'relative' }}>
      {/* Mock Mobile Screen */}
      <div 
        ref={containerRef}
        style={{ 
          width: `${CANVAS_WIDTH}px`, 
          height: `${CANVAS_HEIGHT}px`, 
          background: '#1A1A2E', 
          borderRadius: '16px', 
          position: 'relative', 
          overflow: 'hidden', 
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          border: '1px solid var(--border-glass)'
        }}
      >
        <video 
          src={videoUrl}
          autoPlay 
          loop 
          muted 
          playsInline
          style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.8 }}
        />
        
        {/* Safe Zone Overlays */}
        {layoutSettings.safeZone === 'tiktok' && (
          <>
            <div style={{ position: 'absolute', right: '10px', bottom: '150px', width: '40px', height: '200px', background: 'rgba(255,0,0,0.2)', border: '1px dashed red', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: 'red', writingMode: 'vertical-rl', pointerEvents: 'none' }}>TikTok UI</div>
            <div style={{ position: 'absolute', left: '10px', bottom: '20px', width: '200px', height: '80px', background: 'rgba(255,0,0,0.2)', border: '1px dashed red', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: 'red', pointerEvents: 'none' }}>Caption & Sound</div>
          </>
        )}
        {layoutSettings.safeZone === 'reels' && (
          <>
            <div style={{ position: 'absolute', right: '10px', bottom: '120px', width: '40px', height: '200px', background: 'rgba(255,0,255,0.2)', border: '1px dashed #f0f', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#f0f', writingMode: 'vertical-rl', pointerEvents: 'none' }}>Reels UI</div>
            <div style={{ position: 'absolute', left: '10px', bottom: '20px', width: '200px', height: '80px', background: 'rgba(255,0,255,0.2)', border: '1px dashed #f0f', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#f0f', pointerEvents: 'none' }}>Caption & Audio</div>
          </>
        )}
        {layoutSettings.safeZone === 'shorts' && (
          <>
            <div style={{ position: 'absolute', right: '10px', bottom: '80px', width: '40px', height: '240px', background: 'rgba(255,0,0,0.2)', border: '1px dashed red', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: 'red', writingMode: 'vertical-rl', pointerEvents: 'none' }}>Shorts UI</div>
            <div style={{ position: 'absolute', left: '10px', bottom: '20px', width: '220px', height: '60px', background: 'rgba(255,0,0,0.2)', border: '1px dashed red', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: 'red', pointerEvents: 'none' }}>Channel & Title</div>
          </>
        )}

        {/* Snap Guides */}
        {isDragging && snapGuides.x && (
          <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1px', background: 'var(--primary)', borderLeft: '1px dashed var(--primary)', transform: 'translateX(-50%)', zIndex: 10, pointerEvents: 'none' }} />
        )}
        {isDragging && snapGuides.y && (
          <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', background: 'var(--primary)', borderTop: '1px dashed var(--primary)', transform: 'translateY(-50%)', zIndex: 10, pointerEvents: 'none' }} />
        )}

        {/* Overlay Image (Logo/CTA) */}
        {brandSettings?.overlayUrl && (
          <img 
            src={brandSettings.overlayUrl} 
            alt="Brand Overlay"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            style={{ 
              position: 'absolute', 
              top: `${pos.y}px`, 
              left: `${pos.x}px`, 
              maxWidth: `${LOGO_SIZE}px`, 
              maxHeight: `${LOGO_SIZE}px`, 
              objectFit: 'contain',
              cursor: isDragging ? 'grabbing' : 'grab',
              touchAction: 'none',
              zIndex: 20
            }}
          />
        )}

        {/* Mock Caption */}
        <div style={{ position: 'absolute', bottom: `${caption.positionY || 80}px`, left: '50%', transform: 'translateX(-50%)', width: '80%', textAlign: 'center' }}>
          <div style={{ 
            fontFamily: `'${caption.fontFamily}', var(--font-display)`,
            fontSize: `${caption.fontSize * 0.5}px`, 
            fontStyle: caption.isItalic ? 'italic' : 'normal',
            textDecoration: caption.isUnderline ? 'underline' : 'none',
            textTransform: caption.isUppercase ? 'uppercase' : 'none',
            WebkitTextStroke: caption.strokeWidth > 0 ? `${caption.strokeWidth * 0.5}px ${caption.strokeColor}` : 'none',
            textShadow: caption.hasShadow ? `${caption.shadowX * 0.5}px ${caption.shadowY * 0.5}px ${caption.shadowBlur * 0.5}px ${caption.shadowColor}` : (caption.strokeWidth === 0 ? '1px 1px 0px #000, -1px -1px 0px #000, -1px 1px 0px #000, 1px -1px 0px #000' : 'none'),
            fontWeight: caption.fontWeight === 'Bold' || caption.fontWeight === 'Black' ? 900 : (caption.fontWeight === 'Medium' ? 500 : 400),
            lineHeight: 1.2,
            display: 'flex',
            justifyContent: 'center',
            gap: '8px'
          }}>
            {(() => {
              const activePreset = presets.find(p => p.id === caption.mode);
              if (!activePreset) return null;
              
              const isHighlightStyle = activePreset.id === 'popart' || activePreset.id === 'glitch' || activePreset.id === 'cinematic' || activePreset.id === 'retro' || activePreset.id === 'typewriter' || activePreset.id === 'boldbox' || activePreset.id === 'outlineonly' || activePreset.id === '3dblock' || activePreset.id === 'vaporwave' || activePreset.id === 'impactful';
              
              return activePreset.renderPreview({
                words: [
                  { word: isHighlightStyle ? activePreset.name : 'PRESET', start: 0, end: 1 },
                  { word: 'CAPTIONS', start: 1, end: 2 },
                  { word: '', start: 2, end: 3 }
                ],
                activeWordIndex: 1,
                config: caption
              });
            })()}
          </div>
          {aiEmojis && <div style={{ fontSize: '30px', marginTop: '10px' }}>🥰</div>}
        </div>

        {/* Mock Timeline */}
        <div style={{ position: 'absolute', bottom: '15px', width: '90%', height: '4px', background: 'rgba(255,255,255,0.3)', borderRadius: '2px' }}>
          <div style={{ width: '30%', height: '100%', background: 'var(--primary)', borderRadius: '2px' }} />
        </div>
        <div style={{ position: 'absolute', bottom: '10px', left: '15px' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
        </div>
      </div>
    </div>
  );
};
