import React from 'react';
import { PALETTE } from '../../shared/types.mjs';
import { useStore, getPaletteIdx, setPaletteIdx, getTool } from '../state/store.js';

/** Patterned background used as a stand-in for the real WAD texture
 *  until we port a wadLoader. Each palette colour over a darker tint
 *  gives every swatch a visually distinct surface. */
function previewStyle(color) {
  return {
    backgroundColor: color,
    backgroundImage:
      `linear-gradient(135deg, rgba(0,0,0,0.18) 25%, transparent 25%, transparent 50%, rgba(0,0,0,0.18) 50%, rgba(0,0,0,0.18) 75%, transparent 75%)`,
  };
}

export function LeftPanel() {
  const tool = useStore(() => getTool());
  const selected = useStore(() => getPaletteIdx());

  return (
    <>
      <div className="panel">
        <div className="panel-title">Textura</div>
        {tool !== 'paint' && (
          <div style={{ fontSize: 11, color: '#8da0b8', marginBottom: 6 }}>
            (activa cuando la herramienta es Pintar)
          </div>
        )}
        <div className="palette">
          {PALETTE.map((p, idx) => (
            <button
              key={p.id}
              className={`palette-swatch ${selected === idx ? 'selected' : ''}`}
              onClick={() => setPaletteIdx(idx)}
              title={p.tex}
            >
              <span className="swatch-label">{p.label}</span>
              <span className="swatch-preview" style={previewStyle(p.color)} />
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
