import React from 'react';
import { BRUSH_PALETTE } from '../../shared/types.mjs';
import { useStore, getBrushIdx, setBrushIdx, getTool } from '../state/store.js';

/** Pattern background for texture swatches: diagonal stripes over the
 *  palette colour. Visually different from the flat coloured swatches
 *  used for special objects. */
function texturePreviewStyle(color) {
  return {
    backgroundColor: color,
    backgroundImage:
      `linear-gradient(135deg, rgba(0,0,0,0.18) 25%, transparent 25%, transparent 50%, rgba(0,0,0,0.18) 50%, rgba(0,0,0,0.18) 75%, transparent 75%)`,
  };
}

export function LeftPanel() {
  const tool = useStore(() => getTool());
  const selected = useStore(() => getBrushIdx());

  return (
    <div className="panel">
      {tool !== 'paint' && (
        <div style={{ fontSize: 11, color: '#8da0b8', marginBottom: 6 }}>
          (selecciona la herramienta Pintar para usar la paleta)
        </div>
      )}
      <div className="palette">
        {BRUSH_PALETTE.map((b, idx) => (
          <button
            key={`${b.type}-${b.id}`}
            className={`palette-swatch ${selected === idx ? 'selected' : ''}`}
            onClick={() => setBrushIdx(idx)}
            title={b.label}
          >
            <span className="swatch-label">{b.label}</span>
            {b.type === 'texture' ? (
              <span className="swatch-preview" style={texturePreviewStyle(b.color)} />
            ) : (
              <span className="swatch-preview swatch-preview-object" style={{ backgroundColor: b.color }}>
                <span className="swatch-glyph">{b.glyph}</span>
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
