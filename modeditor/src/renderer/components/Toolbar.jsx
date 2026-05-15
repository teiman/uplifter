import React from 'react';
import { Button, ButtonGroup, Divider, Spinner, Switch } from '@blueprintjs/core';

import {
  useStore,
  getMode, setMode,
  getTool, setTool,
  getHeightDelta, setHeightDelta,
  resetMap,
  getTilemap,
  clearPlayArea, setPlayAreaRestrict, setPlayAreaStrict,
  rotateIsoYaw,
} from '../state/store.js';
import { regionOfCell, REGION_GRID } from '../../shared/types.mjs';

// --- top-level tabs (modes) ---
const MODE_TABS = [
  { id: 'paint',  label: 'Pintar',     icon: 'tint' },
  { id: 'height', label: 'Altura',     icon: 'mountain' },
  { id: 'rect',   label: 'Rectángulo', icon: 'widget' },
  { id: 'area',   label: 'Área',       icon: 'selection' },
  { id: '3d',     label: '3D',         icon: 'cube' },
];

// --- height sub-tools (shown in the Altura ribbon) ---
const HEIGHT_TOOLS = [
  { id: 'raise',  label: 'Subir',    icon: 'arrow-up' },
  { id: 'lower',  label: 'Bajar',    icon: 'arrow-down' },
  { id: 'smooth', label: 'Suavizar', icon: 'blur' },
  { id: 'extend', label: 'Extender', icon: 'horizontal-distribution' },
];

/** Quiet integer field used inside the ribbon. Same UX as RightPanel's
 *  NumberField but with looser sync — fine for the height delta. */
function MiniNumber({ value, onCommit, min, width = 60 }) {
  const [text, setText] = React.useState(String(value));
  const last = React.useRef(value);
  React.useEffect(() => {
    if (value !== last.current) { setText(String(value)); last.current = value; }
  }, [value]);
  return (
    <input
      className="bp5-input bp5-small"
      value={text}
      style={{ width }}
      onChange={(e) => {
        const s = e.target.value;
        setText(s);
        const n = parseInt(s, 10);
        if (Number.isFinite(n) && (min == null || n >= min)) {
          last.current = n;
          onCommit(n);
        }
      }}
      onBlur={() => {
        const n = parseInt(text, 10);
        if (!Number.isFinite(n)) setText(String(value));
      }}
    />
  );
}

export function Toolbar({ onSave, onCompile, onLaunch, compiling, canLaunch, saving }) {
  const mode = useStore(() => getMode());
  const tool = useStore(() => getTool());
  const heightDelta = useStore(() => getHeightDelta());
  const tilemap = useStore(() => getTilemap());

  return (
    <div className="ribbon">
      {/* ----- Top bar: title + global actions ----- */}
      <div className="ribbon-topbar">
        <strong>Uplifter ModEditor</strong>
        <div style={{ flex: 1 }} />
        <Button
          icon="document"
          minimal
          onClick={() => {
            if (confirm('¿Nuevo mapa? Se perderá lo no guardado.')) resetMap();
          }}
        >
          Nuevo
        </Button>
        <Button
          icon={saving ? <Spinner size={14} /> : 'floppy-disk'}
          minimal
          disabled={saving}
          onClick={onSave}
        >
          Guardar
        </Button>
        <Divider />
        <Button
          intent="primary"
          icon={compiling ? <Spinner size={14} /> : 'build'}
          disabled={compiling}
          onClick={onCompile}
        >
          Compilar
        </Button>
        <Button
          intent="success"
          icon="play"
          disabled={!canLaunch}
          onClick={onLaunch}
        >
          Lanzar
        </Button>
      </div>

      {/* ----- Tabs: top-level modes ----- */}
      <div className="ribbon-tabs">
        {MODE_TABS.map(t => (
          <button
            key={t.id}
            className={`ribbon-tab ${mode === t.id ? 'active' : ''}`}
            onClick={() => setMode(t.id)}
          >
            <span className={`bp5-icon-${t.icon} bp5-icon`} />
            <span style={{ marginLeft: 6 }}>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ----- Contextual ribbon: contents depend on the active tab ----- */}
      <div className="ribbon-context">
        {mode === 'paint' && (
          <span className="ribbon-hint">Selecciona una textura u objeto de la paleta y pinta con click izquierdo.</span>
        )}

        {mode === 'height' && (
          <>
            <ButtonGroup>
              {HEIGHT_TOOLS.map(t => (
                <Button
                  key={t.id}
                  icon={t.icon}
                  active={tool === t.id}
                  onClick={() => setTool(t.id)}
                >
                  {t.label}
                </Button>
              ))}
            </ButtonGroup>
            {tool !== 'extend' && (
              <div className="ribbon-field">
                <span className="ribbon-field-label">Δ por clic</span>
                <MiniNumber value={heightDelta} min={1} onCommit={setHeightDelta} />
              </div>
            )}
          </>
        )}

        {mode === 'rect' && (
          <span className="ribbon-hint">Arrastra para definir un rectángulo; al soltar se rellena con la selección.</span>
        )}

        {mode === 'area' && (() => {
          const pa = tilemap.playArea;
          const selected = pa
            ? regionOfCell(tilemap.cols, tilemap.rows, pa.c0, pa.r0)
            : null;
          return pa ? (
            <>
              <span className="ribbon-text">
                {`Región ${selected ? `${selected.rcol},${selected.rrow}` : '(libre)'}`
                + ` de ${REGION_GRID}×${REGION_GRID}`
                + ` · cols ${pa.c0}–${pa.c1}, rows ${pa.r0}–${pa.r1}`}
              </span>
              <Switch
                checked={!!pa.restrict}
                label="Compilar solo área"
                onChange={(e) => setPlayAreaRestrict(e.currentTarget.checked)}
                style={{ marginBottom: 0 }}
              />
              <Switch
                checked={!!pa.strict}
                disabled={!pa.restrict}
                label="Estricto"
                onChange={(e) => setPlayAreaStrict(e.currentTarget.checked)}
                style={{ marginBottom: 0 }}
              />
              <Button icon="trash" small onClick={clearPlayArea}>
                Borrar área
              </Button>
            </>
          ) : (
            <span className="ribbon-hint">
              {`Click en una de las ${REGION_GRID}×${REGION_GRID} regiones del mapa para seleccionarla. Click otra vez para deseleccionarla.`}
            </span>
          );
        })()}

        {mode === '3d' && (
          <>
            <ButtonGroup>
              <Button
                icon="cube-add"
                active={tool === 'iso'}
                onClick={() => setTool('iso')}
              >
                Iso
              </Button>
              <Button
                icon="camera"
                active={tool === 'perspective'}
                onClick={() => setTool('perspective')}
              >
                Perspectiva
              </Button>
            </ButtonGroup>
            {tool === 'iso' && (
              <ButtonGroup>
                <Button
                  icon="rotate-page"
                  onClick={() => rotateIsoYaw(-1)}
                  title="Rotar vista 90° (anti-horario)"
                />
                <Button
                  icon="refresh"
                  onClick={() => rotateIsoYaw(+1)}
                  title="Rotar vista 90° (horario)"
                />
              </ButtonGroup>
            )}
            <span className="ribbon-hint">
              {tool === 'iso'
                ? 'Vista isométrica (35°/45°). Botones ↺↻: rotar 90°. Botón medio: pan · Rueda: zoom.'
                : 'Botón derecho: arrastrar (altura fija) · Click izquierdo: orbita · WASD: mover.'}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
