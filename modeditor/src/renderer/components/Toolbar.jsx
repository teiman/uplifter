import React from 'react';
import { Button, ButtonGroup, Divider, ProgressBar, Spinner, Switch } from '@blueprintjs/core';

import {
  useStore,
  getMode, setMode,
  getTool, setTool,
  getHeightDelta, setHeightDelta,
  getRectTargetH, setRectTargetH,
  getClipboard, clearClipboard,
  resetMap,
  getTilemap,
  clearPlayArea, setPlayAreaRestrict, setPlayAreaStrict,
  rotateIsoYaw,
  getSiglosProgress,
  getShow2dDebug, setShow2dDebug,
  getActivePatrol, addPatrol,
  getSelectedEntityKind, setSelectedEntityKind,
  getEnemies, getSelectedEnemy,
  getDaySelected, setDaySelected,
} from '../state/store.js';
import { regionOfCell, REGION_GRID, ENEMY_TYPES } from '../../shared/types.mjs';

// --- top-level tabs (modes) ---
const MODE_TABS = [
  { id: 'paint',  label: 'Pintar',     icon: 'tint' },
  { id: 'height', label: 'Altura',     icon: 'mountain' },
  { id: 'area',   label: 'Área',       icon: 'selection' },
  { id: 'copy',   label: 'Copia',      icon: 'duplicate' },
  { id: 'gen',    label: 'Generadores', icon: 'random' },
  { id: 'patrol', label: 'Patrullas',  icon: 'route' },
  { id: 'entities', label: 'Entidades', icon: 'people' },
  { id: 'day',    label: 'Día',        icon: 'flash' },
  { id: '3d',     label: '3D',         icon: 'cube' },
];

// --- entities sub-tools (shown in the Entidades ribbon) ---
const ENTITY_TOOLS = [
  { id: 'place',  label: 'Colocar',     icon: 'plus' },
  { id: 'select', label: 'Seleccionar', icon: 'select' },
];

// --- copy sub-tools (shown in the Copia ribbon) ---
const COPY_TOOLS = [
  { id: 'copy',  label: 'Copiar', icon: 'duplicate' },
  { id: 'paste', label: 'Pegar',  icon: 'clipboard' },
];

// --- generator sub-tools (shown in the Generadores ribbon) ---
const GEN_TOOLS = [
  { id: 'city',     label: 'Ciudad',       icon: 'office' },
  { id: 'military', label: 'Base militar', icon: 'shield' },
  { id: '2siglos',  label: '2 siglos',     icon: 'time' },
];

// --- paint sub-tools (shown in the Pintar ribbon) ---
const PAINT_TOOLS = [
  { id: 'paint',     label: 'Pintar',           icon: 'tint' },
  { id: 'rect',      label: 'Rectángulo',       icon: 'widget' },
  { id: 'bucket',    label: 'Bote',             icon: 'style' },
  { id: 'unbuild',   label: 'Quitar especiales', icon: 'eraser' },
];

// --- height sub-tools (shown in the Altura ribbon) ---
const HEIGHT_TOOLS = [
  { id: 'raise',   label: 'Subir',      icon: 'arrow-up' },
  { id: 'lower',   label: 'Bajar',      icon: 'arrow-down' },
  { id: 'smooth',  label: 'Suavizar',   icon: 'blur' },
  { id: 'extend',  label: 'Extender',   icon: 'horizontal-distribution' },
  { id: 'rect',    label: 'Rectángulo', icon: 'widget' },
  { id: 'bucket',  label: 'Bote',       icon: 'style' },
  { id: 'cap',     label: 'Cap nivel',  icon: 'horizontal-bar-chart-asc' },
  { id: 'erosion', label: 'Erosión',    icon: 'flows' },
  { id: 'unramp',  label: 'Quitar rampas', icon: 'eraser' },
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

export function Toolbar({ onSave, onCompile, onLaunch, compiling, canLaunch, saving, debugMode, onDebugModeChange, phongMode, onPhongModeChange, cloudsEnabled, onCloudsEnabledChange }) {
  const mode = useStore(() => getMode());
  const tool = useStore(() => getTool());
  const heightDelta = useStore(() => getHeightDelta());
  const rectTargetH = useStore(() => getRectTargetH());
  const clipboard = useStore(() => getClipboard());
  const tilemap = useStore(() => getTilemap());
  const show2dDebug = useStore(() => getShow2dDebug());
  const activePatrol = useStore(() => getActivePatrol());
  const selectedEntityKind = useStore(() => getSelectedEntityKind());
  const enemies = useStore(() => getEnemies());
  const selectedEnemy = useStore(() => getSelectedEnemy());
  const daySelected = useStore(() => getDaySelected());
  // Progreso de "2 siglos": lo escribe runErosion2SiglosWithProgress en el
  // store. null = no corriendo; objeto = en marcha o recien terminado.
  // Vive en el store porque la simulacion la dispara Canvas2D al soltar el
  // drag-rect, no la Toolbar directamente.
  const siglosProgress = useStore(() => getSiglosProgress());

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
        {/* Toggle Debug: cambia tanto el .map (texturas dbg_* por kind)
            como el lanzador (debug_iw.exe con comando `debug_point`).
            Con debug on cada brush se ve plano de su color, y `debug_point`
            en la consola del juego identifica el brush bajo el crosshair. */}
        <Switch
          checked={!!debugMode}
          onChange={(e) => onDebugModeChange?.(e.target.checked)}
          label="Debug"
          style={{ marginBottom: 0, marginLeft: 8 }}
          title="Compila con texturas planas por kind y lanza debug_iw.exe"
        />
        {/* Toggle Phong: anade _phong/_phong_angle al func_detail para
            suavizar la iluminacion entre caras casi-coplanares (rampas,
            corner_in, tips). Off = bordes facetados duros. */}
        <Switch
          checked={!!phongMode}
          onChange={(e) => onPhongModeChange?.(e.target.checked)}
          label="Phong"
          style={{ marginBottom: 0, marginLeft: 8 }}
          title="Suaviza la iluminacion entre caras casi-coplanares (rampas, corner_in, tips)"
        />
        {/* Toggle Nubes: cuando esta off, el writer salta la banda de
            ~500 brushes de func_detail_illusionary de nubes. light no
            calcula iluminacion sobre ellos -> compilacion notablemente
            mas rapida. El cielo se ve liso sin nubes. */}
        <Switch
          checked={!!cloudsEnabled}
          onChange={(e) => onCloudsEnabledChange?.(e.target.checked)}
          label="Nubes"
          style={{ marginBottom: 0, marginLeft: 8 }}
          title="Genera la banda de nubes (~500 brushes). Off = compilación más rápida, cielo limpio"
        />
        {/* Toggle de la info debug de la vista 2D (por ahora, el `h=N` por
            celda a zoom alto). Off por defecto; se activa solo al diagnosticar. */}
        <Switch
          checked={show2dDebug}
          onChange={(e) => setShow2dDebug(e.target.checked)}
          label="2D debug"
          style={{ marginBottom: 0, marginLeft: 8 }}
          title="Muestra info debug sobre la vista 2D (altura por celda a zoom alto)"
        />
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
          <>
            <ButtonGroup>
              {PAINT_TOOLS.map(t => (
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
            <span className="ribbon-hint">
              {tool === 'rect'
                ? 'Arrastra para definir el rectángulo; al soltar se rellena con la textura/objeto seleccionado.'
                : tool === 'bucket'
                ? 'Click en una celda: rellena todas las contiguas con la misma altura y textura usando la textura seleccionada.'
                : 'Selecciona una textura u objeto de la paleta y pinta con click izquierdo.'}
            </span>
          </>
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
            {(tool === 'rect' || tool === 'bucket' || tool === 'cap') ? (
              <div className="ribbon-field">
                <span className="ribbon-field-label">Altura</span>
                <MiniNumber value={rectTargetH} onCommit={setRectTargetH} />
              </div>
            ) : (tool !== 'extend' && tool !== 'unramp') && (
              <div className="ribbon-field">
                <span className="ribbon-field-label">Δ por clic</span>
                <MiniNumber value={heightDelta} min={1} onCommit={setHeightDelta} />
              </div>
            )}
            {tool === 'unramp' && (
              <span className="ribbon-hint">
                Arrastra un rectángulo: al soltar, limpia decoraciones de erosión (rampas, esquinas, puentes) y tags de suavizado.
              </span>
            )}
          </>
        )}

        {mode === 'gen' && (
          <>
            <ButtonGroup>
              {GEN_TOOLS.map(t => (
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
            {siglosProgress && (
              <>
                <Divider />
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 180 }}>
                  <ProgressBar
                    value={siglosProgress.iter / siglosProgress.max}
                    intent={siglosProgress.done ? 'success' : 'primary'}
                    stripes={!siglosProgress.done}
                    animate={!siglosProgress.done}
                  />
                  <span className="ribbon-field-label" style={{ whiteSpace: 'nowrap' }}>
                    {siglosProgress.iter}/{siglosProgress.max}
                  </span>
                </div>
              </>
            )}
            <span className="ribbon-hint">
              {tool === 'city'
                ? 'Click en una celda: rellena la región conexa con un grid de casas + calles. Ctrl-Z para deshacer.'
                : tool === 'military'
                ? 'Click en una celda: rellena la región conexa con pista, hangares, cuarteles, búnker y torre de vigilancia. Ctrl-Z para deshacer.'
                : tool === '2siglos'
                ? 'Arrastra un rectángulo: al soltar, simula 200 iteraciones de erosión, ríos y suavizado solo dentro de ese área.'
                : 'Elige un generador y click para rellenar.'}
            </span>
          </>
        )}

        {mode === 'patrol' && (
          <>
            <Button icon="plus" onClick={addPatrol}>Nueva ruta</Button>
            <Divider />
            {activePatrol ? (
              <span className="ribbon-text">
                {`Ruta activa: ${activePatrol.name} · ${activePatrol.nodes.length} nodos`}
              </span>
            ) : (
              <span className="ribbon-hint">Crea una ruta para empezar a colocar nodos.</span>
            )}
            <span className="ribbon-hint">
              Click en una celda para añadir un nodo a la ruta activa; click otra vez para quitarlo. El último nodo enlaza con el primero (ciclo).
            </span>
          </>
        )}

        {mode === 'copy' && (
          <>
            <ButtonGroup>
              {COPY_TOOLS.map(t => (
                <Button
                  key={t.id}
                  icon={t.icon}
                  active={tool === t.id}
                  // Pegar requires something in the clipboard.
                  disabled={t.id === 'paste' && !clipboard}
                  onClick={() => setTool(t.id)}
                >
                  {t.label}
                </Button>
              ))}
            </ButtonGroup>
            {clipboard ? (
              <>
                <span className="ribbon-text">
                  {`Portapapeles: ${clipboard.cols}×${clipboard.rows} celdas`}
                </span>
                <Button icon="trash" small onClick={clearClipboard}>
                  Vaciar
                </Button>
              </>
            ) : (
              <span className="ribbon-hint">Portapapeles vacío.</span>
            )}
            <span className="ribbon-hint">
              {tool === 'copy'
                ? 'Arrastra para copiar la región (altura + textura + objetos).'
                : 'Click para pegar el portapapeles usando el cursor como esquina superior izquierda.'}
            </span>
          </>
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
                label="Solo área"
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

        {mode === 'entities' && (
          <>
            <ButtonGroup>
              {ENTITY_TOOLS.map(t => (
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
            <Divider />
            <span className="ribbon-text">
              {`${enemies.length} entidad${enemies.length === 1 ? '' : 'es'}`}
              {selectedEnemy ? ` · sel: ${selectedEnemy.id}` : ''}
            </span>
            <span className="ribbon-hint">
              {tool === 'place'
                ? 'Click en una celda vacía para colocar el tipo elegido en la paleta de la izquierda. Click en una entidad existente para seleccionarla.'
                : 'Click en una entidad para seleccionarla; click fuera para deseleccionar.'}
            </span>
          </>
        )}

        {mode === 'day' && (
          <>
            <span className="ribbon-field-label">Validar día</span>
            <ButtonGroup>
              {[1, 2, 3, 4, 5].map(d => (
                <Button
                  key={d}
                  active={daySelected === d}
                  intent={daySelected === d ? 'primary' : 'none'}
                  onClick={() => setDaySelected(d)}
                >
                  {`Día ${d}`}
                </Button>
              ))}
            </ButtonGroup>
            <span className="ribbon-hint">
              Comprueba si el mapa tiene las entidades necesarias para el día seleccionado.
            </span>
          </>
        )}

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
