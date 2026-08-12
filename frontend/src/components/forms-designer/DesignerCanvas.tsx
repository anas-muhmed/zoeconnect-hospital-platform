import React, { useRef } from 'react';
import { CanvasEngineHost, useEngineSelector } from '@hdsp/canvas-engine-react';
import type { CanvasEngine } from '@hdsp/canvas-engine';
import type { ComponentRegistry } from '@hdsp/form-schema';

interface DesignerCanvasProps {
  engine: CanvasEngine;
  registry: ComponentRegistry;
  onCanvasDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onCursorMove: (world: {x: number, y: number}) => void;
}

export function DesignerCanvas({ engine, registry, onCanvasDrop, onCursorMove }: DesignerCanvasProps) {
  const viewport = useEngineSelector(engine, (s) => s.viewport);
  const containerRef = useRef<HTMLDivElement>(null);
  
  return (
    <div 
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onCanvasDrop}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        // Offset by 20px due to rulers
        const worldX = (e.clientX - rect.left - 20 - viewport.panX) / viewport.zoom;
        const worldY = (e.clientY - rect.top - 20 - viewport.panY) / viewport.zoom;
        onCursorMove({ x: worldX, y: worldY });
      }}
    >
      {/* Top Ruler */}
      <div style={{ position: 'absolute', top: 0, left: 20, right: 0, height: 20, background: '#1e293b', borderBottom: '1px solid #334155', zIndex: 10 }}>
         <Ruler orientation="horizontal" pan={viewport.panX} zoom={viewport.zoom} />
      </div>
      
      {/* Left Ruler */}
      <div style={{ position: 'absolute', top: 20, left: 0, bottom: 0, width: 20, background: '#1e293b', borderRight: '1px solid #334155', zIndex: 10 }}>
         <Ruler orientation="vertical" pan={viewport.panY} zoom={viewport.zoom} />
      </div>
      
      {/* Corner Piece */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: 20, height: 20, background: '#0f172a', zIndex: 11, borderBottom: '1px solid #334155', borderRight: '1px solid #334155' }} />
      
      <div style={{ position: 'absolute', top: 20, left: 20, right: 0, bottom: 0 }}>
        <CanvasEngineHost engine={engine} registry={registry} />
      </div>
    </div>
  );
}

function Ruler({ orientation, pan, zoom }: { orientation: 'horizontal' | 'vertical', pan: number, zoom: number }) {
  // A simple grid background can simulate ruler ticks
  const tickSpacing = 50 * zoom;
  const offset = pan % tickSpacing;
  
  if (orientation === 'horizontal') {
    return (
      <div style={{
        width: '100%', height: '100%',
        background: `repeating-linear-gradient(90deg, transparent, transparent ${tickSpacing - 1}px, #475569 ${tickSpacing - 1}px, #475569 ${tickSpacing}px)`,
        backgroundPosition: `${offset}px 0`
      }} />
    );
  } else {
    return (
      <div style={{
        width: '100%', height: '100%',
        background: `repeating-linear-gradient(180deg, transparent, transparent ${tickSpacing - 1}px, #475569 ${tickSpacing - 1}px, #475569 ${tickSpacing}px)`,
        backgroundPosition: `0 ${offset}px`
      }} />
    );
  }
}
