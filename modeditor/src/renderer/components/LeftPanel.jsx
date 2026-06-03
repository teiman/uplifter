import React from 'react';
import { BRUSH_PALETTE } from '../../shared/types.mjs';
import { useStore, getBrushIdx, setBrushIdx, getMode, setSelectedEntityKind } from '../state/store.js';

/** Per-biome texture previews. Each biome now lives in its own
 *  subfolder with 5 face PNGs (top/side/capital/base/bottom — see
 *  column.md). The 2D editor shows the cell as seen from above, so we
 *  read top.png as the swatch. */
const PREVIEW_URLS = (() => {
  const mods = import.meta.glob('../assets/textures/*/top.png', { eager: true, query: '?url', import: 'default' });
  const byId = {};
  for (const [p, url] of Object.entries(mods)) {
    // Path looks like '../assets/textures/<biome>/top.png'.
    const parts = p.split('/');
    const biome = parts[parts.length - 2];
    byId[biome] = url;
  }
  return byId;
})();

/** Texture swatch background: the actual WAD texture if we have a PNG
 *  preview for it; otherwise a striped colour as a fallback. CSS sets
 *  aspect-ratio: 1 and background-size: 100% (no-repeat) so the source
 *  texture is shown as one zoomed-in square — clearer than tiling. */
function texturePreviewStyle(id, color) {
  const url = PREVIEW_URLS[id];
  if (url) {
    return {
      backgroundImage: `url(${url})`,
      imageRendering: 'pixelated',
    };
  }
  return {
    backgroundColor: color,
    backgroundImage:
      `linear-gradient(135deg, rgba(0,0,0,0.18) 25%, transparent 25%, transparent 50%, rgba(0,0,0,0.18) 50%, rgba(0,0,0,0.18) 75%, transparent 75%)`,
  };
}

export function LeftPanel() {
  const mode = useStore(() => getMode());
  const selected = useStore(() => getBrushIdx());

  return (
    <div className="panel">
      {mode !== 'paint' && mode !== 'entities' && (
        <div style={{ fontSize: 11, color: '#8da0b8', marginBottom: 6 }}>
          (selecciona el modo Pintar o Entidades para usar la paleta)
        </div>
      )}
      <div className="palette">
        {BRUSH_PALETTE.map((b, idx) => (
          <button
            key={`${b.type}-${b.id}`}
            className={`palette-swatch ${selected === idx ? 'selected' : ''}`}
            onClick={() => {
              setBrushIdx(idx);
              // Si el brush elegido es un enemigo, tambien actualizamos
              // el kind activo del modo Entidades — asi la paleta de la
              // izquierda controla a la vez el "que pintar" y el "que
              // colocar" sin tener selectores duplicados.
              if (b.type === 'enemy') setSelectedEntityKind(b.id);
            }}
            title={b.label}
          >
            <span className="swatch-label">{b.label}</span>
            {b.type === 'texture' ? (
              <span className="swatch-preview" style={texturePreviewStyle(b.id, b.color)} />
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
