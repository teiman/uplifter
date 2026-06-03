import { useSyncExternalStore } from 'react';
import {
  makeEmptyTilemap, deserialiseTilemap, BRUSH_PALETTE, PALETTE, SEA_LEVEL_H,
  HOUSE_STOREYS_MIN, HOUSE_STOREYS_MAX, MESH_CHUNK_SIZE,
  CELL_SIZE, HEIGHT_UNIT,
  encodeDeco,
  OBJECT_BY_KIND,
  ENEMY_BY_KIND,
} from '../../shared/types.mjs';
import { generateCityAt } from './generators/city.js';
import { generateMilitaryAt } from './generators/military.js';

/**
 * Minimal external store: mutable singleton + subscriber set. Components
 * read via useStore(selector) and re-render when notify() fires.
 *
 * Mutations on typed arrays (textures, heights) are in-place — we bump
 * a `revision` counter so React knows to re-run selectors.
 */
const state = {
  tilemap: makeEmptyTilemap(),
  selectedBrushIdx: 0,       // index into BRUSH_PALETTE
  mode: 'paint',             // 'paint' | 'height' | 'area' | 'copy' | 'gen' | '3d'
  tool: 'paint',             // when mode='paint':  'paint' | 'rect' | 'bucket'
                             // when mode='height': 'raise'|'lower'|'smooth'|'extend'|'rect'
                             // when mode='area':   always 'area' (no sub-tools)
                             // when mode='copy':   'copy' | 'paste'
                             // when mode='gen':    'city'
                             // when mode='3d':     'perspective' | 'iso'
                             //
                             // 'rect' is a drag-rectangle sub-tool that
                             // exists in both 2D editing modes: in paint
                             // it fills the rect with the current brush;
                             // in height it sets every cell in the rect
                             // to rectTargetH.
                             //
                             // The 3D viewport is "just another mode": the
                             // view that renders the main canvas is derived
                             // from mode (3d when mode === '3d', else 2d).
                             // Within 3D mode, the tool picks the camera
                             // projection — perspective (walk-around) or
                             // iso (orthographic, classic 35.264°/45°).
  heightDelta: 1,
  // Target height for the 'extend' tool. Set by the first click of a
  // stroke (the cell under the cursor); kept across the drag so each
  // dragged-over cell gets the same height.
  extendTargetH: null,
  // Cells already touched in the current paint stroke. Used by the
  // curve-cycle logic so a single click+drag doesn't rotate the same
  // cell through multiple directions. Reset by endStroke().
  strokeCells: new Set(),
  // Target height for the 'rect' tool in height mode. User-controlled
  // via the ribbon input. Applied to every cell inside the dragged
  // rectangle on mouseup.
  rectTargetH: 1,
  // Clipboard for the copy/paste mode. null = nothing copied yet.
  // Shape: { cols, rows, heights: Int16Array, textures: Int8Array,
  //          objects: Array(cols*rows), smoothing: Array(cols*rows) }
  clipboard: null,
  // Día seleccionado en la solapa "Día" (1..5). Por defecto 1 para que el
  // checklist tenga algo que mostrar al entrar.
  daySelected: 1,
  // Iso view yaw index: 0..3, mapped to 45°, 135°, 225°, 315°. Lets
  // the user rotate the isometric camera in 90° steps while keeping
  // the same focus point. Persisted so re-entering the iso tool
  // restores the last orientation.
  isoYawIdx: 0,
  // Shared 3D camera target world-space XY (Z reserved for future use).
  // Viewport3D mirrors its live camRef.target here so 2D can recenter
  // on the same world point when leaving 3D mode.
  camera3dTargetX: 0,
  camera3dTargetY: 0,
  // Live cell at the centre of the 2D viewport. Canvas2D mirrors this
  // every time its view changes so the 3D camera can recenter on the
  // same world point when the user switches to 3D mode.
  view2dCenterCol: 0,
  view2dCenterRow: 0,
  // One-shot focus requests, one per direction. Set by setMode on a
  // cross-view transition; the receiving viewport consumes (reads and
  // clears) it on its next mount. Kept separate so 2D↔3D toggles don't
  // step on each other.
  pendingFocusCell: null,        // for Canvas2D: { col, row }
  pendingFocus3dTarget: null,    // for Viewport3D: { x, y }
  // Toggle for the 2D viewport's debug overlay (per-cell `h=N` text).
  // Off by default to keep the editor clean; the user enables it from
  // the toolbar when diagnosing height/erosion issues.
  show2dDebug: false,
  // Estado de la simulacion "2 siglos" en curso. null = nada corriendo.
  // Mientras corre: { iter, max, done }. Lo escribe applyErosion2Siglos en
  // su callback y lo lee la Toolbar para pintar la barra de progreso.
  // Vive en el store (y no como state local de Toolbar) porque ahora la
  // simulacion se puede disparar desde Canvas2D (drag-rect ad hoc) — sin
  // un punto comun, la barra no se entera.
  siglosProgress: null,
  // Patrullas: UI no persistida. activePatrolId apunta a la ruta a la que
  // se anaden nodos cuando se hace click en el modo 'patrol'. patrolCounter
  // genera ids unicos ('p1', 'p2', ...) que tambien funcionan como sufijo
  // de targetname al compilar.
  activePatrolId: null,
  patrolCounter: 0,
  // Seleccion unificada del modo Entidades / Patrullas. Una sola entidad
  // seleccionada a la vez. Forma:
  //   null
  //   { type: 'enemy', id: 'e3' }
  //   { type: 'node',  patrolId: 'p2', nodeId: 'n5' }
  // Los getters legacy getSelectedEnemyId / getSelectedEnemy filtran por
  // type='enemy' para no romper consumers actuales (EntityPanel etc.).
  selectedEntityRef: null,
  enemyCounter: 0,
  // Modo 'entities': kind activo a colocar con tool='place'. Lo elige el
  // usuario en el ribbon del modo Entities. Default = primer ENEMY_TYPES.
  selectedEntityKind: 'monster_aag',
  revision: 0,
};

const subscribers = new Set();
function notify() {
  state.revision++;
  for (const fn of subscribers) fn();
}

// ---------- 3D mesh dirty tracking ----------
// Cell edits mark their chunk (cx,cy) as dirty here. Viewport3D drains
// the set every animation frame and rebuilds only those chunks.
const dirty3dChunks = new Set();
// When set, Viewport3D rebuilds every chunk + the water plane on its
// next frame and clears this flag. Used after resetMap/loadTilemap when
// the entire grid changes at once.
let fullRebuild3dRequested = false;

function markChunkDirty(col, row) {
  const cx = (col / MESH_CHUNK_SIZE) | 0;
  const cy = (row / MESH_CHUNK_SIZE) | 0;
  dirty3dChunks.add(`${cx},${cy}`);
}

/** Called by Viewport3D each frame. Returns the set of dirty chunk keys
 *  ("cx,cy"), then clears the internal set. */
export function drainDirty3dChunks() {
  const out = new Set(dirty3dChunks);
  dirty3dChunks.clear();
  return out;
}

/** Called by Viewport3D each frame. Returns true (and clears) if a full
 *  rebuild was requested since the last drain. */
export function takeFullRebuildRequest() {
  if (!fullRebuild3dRequested) return false;
  fullRebuild3dRequested = false;
  return true;
}

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function getSnapshot() {
  return state.revision;
}

/**
 * Subscribe to the store and run `selector` on every revision bump.
 *
 * Implementation note: we deliberately use `state.revision` as the
 * external snapshot (not the selector's return value), because most
 * selectors return live references into the store (tilemap, sun, etc.)
 * which never change identity even when their fields mutate. Using
 * revision as the snapshot guarantees React re-renders on every notify().
 */
export function useStore(selector) {
  useSyncExternalStore(subscribe, getSnapshot);
  return selector(state);
}

// ---------- accessors ----------
export function getTilemap()        { return state.tilemap; }
export function getBrushIdx()       { return state.selectedBrushIdx; }
export function getMode()           { return state.mode; }
export function getTool()           { return state.tool; }
/** Derived: the main canvas view ('2d' or '3d') is dictated by mode.
 *  Everything that's not 3D is a 2D-editing mode. */
export function getView() {
  if (state.mode === '3d') return '3d';
  if (state.mode === 'day') return 'day';
  return '2d';
}
// Day selected in the Día tab (1..5). Defaults to 1 so the checklist
// has something to show before the user picks.
export function getDaySelected() { return state.daySelected ?? 1; }
export function setDaySelected(d) {
  const v = Math.max(1, Math.min(5, Math.round(Number(d) || 1)));
  if (state.daySelected === v) return;
  state.daySelected = v;
  notify();
}
export function getHeightDelta()    { return state.heightDelta; }
export function getRectTargetH()    { return state.rectTargetH; }
export function getClipboard()      { return state.clipboard; }
export function getIsoYawIdx()      { return state.isoYawIdx; }
export function getShow2dDebug()    { return state.show2dDebug; }

export function setShow2dDebug(v) {
  const next = !!v;
  if (state.show2dDebug === next) return;
  state.show2dDebug = next;
  notify();
}

export function getSiglosProgress() { return state.siglosProgress; }

/** Rotate the iso camera by ±1 step (90° each). The view stays focused
 *  on the same world target because cameraEye is recomputed from
 *  yaw/pitch + target/distance; only the eye position moves. */
export function rotateIsoYaw(step) {
  state.isoYawIdx = ((state.isoYawIdx + step) % 4 + 4) % 4;
  notify();
}

// ---------- mutators ----------
export function setBrushIdx(idx) {
  state.selectedBrushIdx = idx;
  notify();
}

const VALID_MODES = new Set(['paint', 'height', 'area', 'copy', 'gen', 'patrol', 'entities', 'day', '3d']);

/**
 * Switch the top-level mode. Resets the sub-tool to the mode's default:
 *   paint  → 'paint'   (sub-tools: 'paint', 'rect')
 *   height → 'raise'   (sub-tools: 'raise', 'lower', 'smooth', 'extend', 'rect')
 *   area   → 'area'
 *   3d     → 'iso'     (sub-tools: 'iso', 'perspective')
 *
 * Unknown modes are coerced to 'paint' so callers can't leave the
 * editor in a state where no canvas handler picks up clicks.
 */
export function setMode(mode) {
  if (!VALID_MODES.has(mode)) mode = 'paint';
  if (state.mode === mode) return;
  const t = state.tilemap;
  const gridHalfX = (t.cols * CELL_SIZE) / 2;
  const gridHalfY = (t.rows * CELL_SIZE) / 2;
  // Leaving 3D for any 2D editing mode: stash the cell under the 3D
  // camera's target so Canvas2D can recenter on the same world spot
  // when it mounts.
  if (state.mode === '3d' && mode !== '3d') {
    const col = Math.floor((state.camera3dTargetX + gridHalfX) / CELL_SIZE);
    const ySouthIdx = Math.floor((state.camera3dTargetY + gridHalfY) / CELL_SIZE);
    const row = (t.rows - 1) - ySouthIdx;
    state.pendingFocusCell = { col, row };
  }
  // Entering 3D from any 2D mode: stash the world XY of the 2D
  // viewport's centre cell so Viewport3D can point its camera there
  // on mount.
  if (state.mode !== '3d' && mode === '3d') {
    const col = state.view2dCenterCol;
    const row = state.view2dCenterRow;
    const ySouthIdx = (t.rows - 1) - row;
    const x = -gridHalfX + (col + 0.5) * CELL_SIZE;
    const y = -gridHalfY + (ySouthIdx + 0.5) * CELL_SIZE;
    state.pendingFocus3dTarget = { x, y };
  }
  state.mode = mode;
  state.tool = (mode === 'paint')    ? 'paint'
             : (mode === 'height')   ? 'raise'
             : (mode === 'area')     ? 'area'
             : (mode === 'copy')     ? 'copy'
             : (mode === 'gen')      ? 'city'
             : (mode === 'patrol')   ? 'patrol'
             : (mode === 'entities') ? 'place'
             : (mode === '3d')       ? 'iso'
             :                         'paint';
  notify();
}

/** Viewport3D mirrors its live camera target world XY here every frame
 *  so 2D recentering on mode switch has a fresh value. Silent write —
 *  no notify(), since no React component reads this directly. */
export function setCamera3dTarget(x, y) {
  state.camera3dTargetX = x;
  state.camera3dTargetY = y;
}

/** Canvas2D mirrors the cell at the centre of its viewport here so 3D
 *  mount can pick it up. Silent. */
export function setView2dCenter(col, row) {
  state.view2dCenterCol = col;
  state.view2dCenterRow = row;
}

/** Canvas2D reads and clears this on mount. Returns null when there's
 *  no pending focus request. Clearing it on read prevents the focus
 *  from re-applying on subsequent remounts (e.g. re-running an effect). */
export function takePendingFocusCell() {
  const c = state.pendingFocusCell;
  state.pendingFocusCell = null;
  return c;
}

/** Viewport3D reads and clears this on mount. Same pattern as
 *  takePendingFocusCell, but in world XY for the 3D camera target. */
export function takePendingFocus3dTarget() {
  const t = state.pendingFocus3dTarget;
  state.pendingFocus3dTarget = null;
  return t;
}

export function setTool(tool) {
  state.tool = tool;
  notify();
}

export function setHeightDelta(n) {
  state.heightDelta = n;
  notify();
}

export function setRectTargetH(n) {
  state.rectTargetH = n;
  notify();
}

export function setSun(partial) {
  state.tilemap.sun = { ...state.tilemap.sun, ...partial };
  notify();
}

export function setQuality(q) {
  state.tilemap.quality = q;
  notify();
}

export function resetMap() {
  state.tilemap = makeEmptyTilemap();
  fullRebuild3dRequested = true;
  notify();
}

/** Replace the current tilemap with a deserialised one (from disk). */
export function loadTilemap(serialised) {
  state.tilemap = deserialiseTilemap(serialised);
  migratePatrolsAndEnemies(state.tilemap);
  // Reset de la seleccion: el ref guardado en memoria puede apuntar a
  // un id de otra sesion / otro mapa.
  state.selectedEntityRef = null;
  fullRebuild3dRequested = true;
  notify();
}

/**
 * Saneamiento de patrullas + enemigos al cargar un tilemap:
 *   - Asigna ids estables a nodos de patrulla que no los tengan (saves
 *     de antes del cambio).
 *   - Inicializa nodeCounter por ruta a max(node.id numero) + 1 para
 *     evitar colisiones futuras.
 *   - Quita nodos duplicados en (col,row) dentro de la misma ruta (no
 *     deberian existir, pero un save corrupto los podria tener — y dos
 *     nodos en la misma celda confunden al pick).
 *   - Quita enemies duplicados en (col,row) por el mismo motivo.
 *   - Garantiza patrolCounter > max(p.id numero) para evitar colisiones.
 *
 * Solo actua si hay algo que sanear; en mapas limpios es no-op.
 */
function migratePatrolsAndEnemies(t) {
  // Patrullas + nodos.
  if (Array.isArray(t.patrols)) {
    let maxPatrolNum = state.patrolCounter ?? 0;
    for (const p of t.patrols) {
      if (!p) continue;
      // patrolCounter sigue avanzando aunque el usuario abra otro mapa.
      const pnum = parseInt(String(p.id ?? '').replace(/^p/, ''), 10);
      if (Number.isFinite(pnum) && pnum > maxPatrolNum) maxPatrolNum = pnum;
      if (!Array.isArray(p.nodes)) p.nodes = [];
      // kind: default 'aerial' para rutas guardadas antes de este campo.
      if (p.kind !== 'aerial' && p.kind !== 'ground') p.kind = 'aerial';
      // Dedup por celda dentro de la ruta.
      const seen = new Set();
      p.nodes = p.nodes.filter(n => {
        const k = `${n.col},${n.row}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      // Asignar ids que falten.
      let maxNodeNum = p.nodeCounter ?? 0;
      for (const n of p.nodes) {
        const nnum = parseInt(String(n.id ?? '').replace(/^n/, ''), 10);
        if (Number.isFinite(nnum) && nnum > maxNodeNum) maxNodeNum = nnum;
      }
      for (const n of p.nodes) {
        if (!n.id) {
          maxNodeNum += 1;
          n.id = `n${maxNodeNum}`;
        }
      }
      p.nodeCounter = maxNodeNum;
    }
    state.patrolCounter = maxPatrolNum;
  }
  // Enemies: dedup por celda Y por id, y reassignacion de ids vacios o
  // mal formados. Un mapa de antes del invariante puede tener dos
  // enemies con el mismo id — en ese caso find(e => e.id === id) solo
  // devuelve el primero y el otro queda "invisible" al sistema de
  // seleccion (puede pintarse pero no editarse). La forma defensiva:
  //   - quitamos duplicados por celda.
  //   - reasignamos ids para garantizar unicidad: cualquier id que ya
  //     se ha visto antes en este pase se sustituye por uno nuevo.
  if (Array.isArray(t.enemies)) {
    const validPatrolIds = new Set((t.patrols ?? []).map(p => p.id));
    const seenCells = new Set();
    const seenIds = new Set();
    // Primera pasada: calcular maxEnemyNum sobre TODOS los ids validos.
    let maxEnemyNum = state.enemyCounter ?? 0;
    for (const e of t.enemies) {
      if (!e) continue;
      const enum_ = parseInt(String(e.id ?? '').replace(/^e/, ''), 10);
      if (Number.isFinite(enum_) && enum_ > maxEnemyNum) maxEnemyNum = enum_;
    }
    // Segunda pasada: filtrar y deduplicar.
    t.enemies = t.enemies.filter(e => {
      if (!e) return false;
      const k = `${e.col},${e.row}`;
      if (seenCells.has(k)) return false;
      seenCells.add(k);
      // Id valido y unico — si no, asignamos uno nuevo.
      const idOk = typeof e.id === 'string' && /^e\d+$/.test(e.id) && !seenIds.has(e.id);
      if (!idOk) {
        maxEnemyNum += 1;
        e.id = `e${maxEnemyNum}`;
      }
      seenIds.add(e.id);
      // Limpia targets a rutas inexistentes.
      if (e.target && !validPatrolIds.has(e.target)) e.target = null;
      return true;
    });
    state.enemyCounter = maxEnemyNum;
  }
}

/** Set the playable area to the given inclusive cell rectangle.
 *  Order of corners doesn't matter; we normalise here.
 *  - `restrict` (default true): when on, mapWriter omits terrain cells
 *    outside the area.
 *  - `strict` (default true): on top of `restrict`, also shrinks the
 *    world box (sky walls/ceiling, bedrock, global water) to the area
 *    bounds. Much faster to compile because qbsp's `-subdivide` has
 *    far smaller faces to chew through. Off → the world box stays at
 *    the full ±WORLD_HALF. */
export function setPlayArea(c0, r0, c1, r1, restrict = true, strict = true) {
  const t = state.tilemap;
  const cMin = Math.max(0, Math.min(c0, c1));
  const cMax = Math.min(t.cols - 1, Math.max(c0, c1));
  const rMin = Math.max(0, Math.min(r0, r1));
  const rMax = Math.min(t.rows - 1, Math.max(r0, r1));
  t.playArea = { c0: cMin, r0: rMin, c1: cMax, r1: rMax, restrict, strict };
  // 3D viewport filters geometry by playArea, so the area changing
  // means every chunk + the water plane must be re-built.
  fullRebuild3dRequested = true;
  notify();
}

/** Remove the playable area entirely. */
export function clearPlayArea() {
  state.tilemap.playArea = null;
  fullRebuild3dRequested = true;
  notify();
}

/** Toggle whether the area restricts compilation (or just shows in the
 *  editor as a reference). No-op when there's no area defined. */
export function setPlayAreaRestrict(restrict) {
  const a = state.tilemap.playArea;
  if (!a) return;
  a.restrict = !!restrict;
  notify();
}

/** Toggle the 'strict' flag — when on, the world box also shrinks to
 *  fit the area, dramatically speeding up compilation at the cost of
 *  the rest of the world being unreachable. */
export function setPlayAreaStrict(strict) {
  const a = state.tilemap.playArea;
  if (!a) return;
  a.strict = !!strict;
  notify();
}

/** Move the player spawn to the centre of (col, row) in world coords.
 *  The mapWriter re-derives Z at compile time, so we leave it null
 *  (and `angle` defaults to 0). */
function setSpawnToCell(col, row) {
  const t = state.tilemap;
  const gridHalfX = (t.cols * CELL_SIZE) / 2;
  const gridHalfY = (t.rows * CELL_SIZE) / 2;
  const x = -gridHalfX + col * CELL_SIZE + CELL_SIZE / 2;
  const ySouthIdx = (t.rows - 1) - row;
  const y = -gridHalfY + ySouthIdx * CELL_SIZE + CELL_SIZE / 2;
  t.spawn = { col, row, x, y, z: null, angle: 0 };
  notify();
}

// ---------- patrullas ----------
// Undo local de patrullas. Cada entrada del stack es un snapshot del
// estado de patrullas (deep-clone de tilemap.patrols + activePatrolId +
// patrolCounter) tomado JUSTO ANTES de una mutacion. Ctrl+Z en modo
// 'patrol' hace pop y restaura. Stack acotado para no comer memoria si
// el usuario hace 10000 clicks.
const PATROL_UNDO_LIMIT = 200;
const patrolUndoStack = [];

function snapshotPatrols() {
  return {
    patrols: state.tilemap.patrols.map(p => ({
      id: p.id,
      name: p.name,
      kind: p.kind ?? 'aerial',
      flightHeight: p.flightHeight,
      nodeCounter: p.nodeCounter ?? 0,
      nodes: p.nodes.map(n => ({
        id: n.id,
        col: n.col,
        row: n.row,
        ...(n.zOverride != null ? { zOverride: n.zOverride } : {}),
      })),
    })),
    activePatrolId: state.activePatrolId,
    patrolCounter: state.patrolCounter,
  };
}

function pushPatrolUndo() {
  patrolUndoStack.push(snapshotPatrols());
  if (patrolUndoStack.length > PATROL_UNDO_LIMIT) {
    patrolUndoStack.shift();
  }
}

/** Pop el ultimo snapshot y restaura. No-op si no hay nada que deshacer.
 *  Devuelve true si se aplico un undo. */
export function undoPatrol() {
  const snap = patrolUndoStack.pop();
  if (!snap) return false;
  state.tilemap.patrols = snap.patrols;
  state.activePatrolId = snap.activePatrolId;
  state.patrolCounter = snap.patrolCounter;
  fullRebuild3dRequested = true;
  notify();
  return true;
}

export function canUndoPatrol() {
  return patrolUndoStack.length > 0;
}

// Cada ruta es { id, name, flightHeight, nodes:[{col,row}, ...] }.
//   id           — generado al crear, sufijo en `targetname` al compilar
//   name         — editable; viaja al .map como `noise` (los drones lo usan
//                  para buscar nodos amigos via find(world, noise, ...))
//   flightHeight — cuantas unidades HEIGHT_UNIT por encima del terreno bajo
//                  el nodo se emite el `path_corner`. Cuanto mas grande,
//                  mas alto vuelan los drones que sigan esta ruta.
//   nodes        — lista ordenada; la conexion es ciclica implicita
//                  (nodes[N-1] enlaza con nodes[0]).
const DEFAULT_FLIGHT_HEIGHT = 8;

export function getPatrols()         { return state.tilemap.patrols; }
export function getActivePatrolId()  { return state.activePatrolId; }
export function getActivePatrol() {
  const id = state.activePatrolId;
  if (!id) return null;
  return state.tilemap.patrols.find(p => p.id === id) ?? null;
}

export function setActivePatrol(id) {
  if (state.activePatrolId === id) return;
  state.activePatrolId = id;
  notify();
}

export function addPatrol(kind = 'aerial') {
  const t = state.tilemap;
  pushPatrolUndo();
  state.patrolCounter += 1;
  const id = `p${state.patrolCounter}`;
  // kind: 'aerial' (default) | 'ground'. Aerial usa flightHeight para
  // elevar los path_corner; ground los pega al suelo (flightHeight se
  // ignora). Mantener 'aerial' como default preserva el comportamiento
  // historico para rutas creadas antes de este campo.
  // nodeCounter: id estable de cada nodo (n1, n2, ...) — sobrevive a
  // borrados/inserciones y se persiste como cualquier otro campo.
  const p = {
    id, name: id, kind,
    flightHeight: DEFAULT_FLIGHT_HEIGHT,
    nodeCounter: 0,
    nodes: [],
  };
  t.patrols.push(p);
  state.activePatrolId = id;
  fullRebuild3dRequested = true;
  notify();
  return id;
}

/** Cambia kind ('aerial' | 'ground') de una ruta. Otros valores se
 *  rechazan en silencio. */
export function setPatrolKind(id, kind) {
  if (kind !== 'aerial' && kind !== 'ground') return;
  const p = state.tilemap.patrols.find(p => p.id === id);
  if (!p) return;
  if (p.kind === kind) return;
  pushPatrolUndo();
  p.kind = kind;
  fullRebuild3dRequested = true;
  notify();
}

export function deletePatrol(id) {
  const t = state.tilemap;
  const i = t.patrols.findIndex(p => p.id === id);
  if (i < 0) return;
  pushPatrolUndo();
  t.patrols.splice(i, 1);
  if (state.activePatrolId === id) {
    state.activePatrolId = t.patrols.length > 0 ? t.patrols[0].id : null;
  }
  // Limpia enemies que apuntaban a esta ruta — si quedaran con
  // target='p_borrada' el writer emitiria un path_corner inexistente
  // y el QC haria find(world, targetname, ...) -> null, dejando al
  // dron sin patrullar (el bug clasico "este dron no sigue la ruta").
  for (const e of t.enemies) {
    if (e.target === id) e.target = null;
  }
  fullRebuild3dRequested = true;
  notify();
}

export function setPatrolName(id, name) {
  const p = state.tilemap.patrols.find(p => p.id === id);
  if (!p) return;
  // Sanitize: el name se serializa en el .map como string entrecomillado.
  // Quitamos comillas dobles y saltos por si acaso.
  const clean = String(name).replace(/["\r\n]/g, '').trim();
  if (p.name === clean) return;
  pushPatrolUndo();
  p.name = clean || p.id;
  notify();
}

export function setPatrolFlightHeight(id, h) {
  const p = state.tilemap.patrols.find(p => p.id === id);
  if (!p) return;
  const n = Math.max(0, Math.floor(Number(h) || 0));
  if (p.flightHeight === n) return;
  pushPatrolUndo();
  p.flightHeight = n;
  fullRebuild3dRequested = true;
  notify();
}

/**
 * Click en (col,row) sobre la ruta activa, sin nodo ya en esa celda:
 *   anade un nodo nuevo al final del anillo (la conexion ciclica se
 *   cierra: nodes[N-1] -> nodes[0]).
 * Si no hay ruta activa, crea una vacia y la activa.
 *
 * El borrado de nodos ya NO es toggle desde el click — ahora hay drag
 * y seleccion, asi que ese gesto choca. Se borra desde el panel de
 * propiedades del nodo (boton "Eliminar nodo").
 *
 * Si la celda ya tiene un nodo de la ruta activa, no hacemos nada
 * aqui; el click handler de Canvas2D selecciona ese nodo (mismo
 * patron que entidades).
 */
export function addPatrolNodeAtCell(col, row) {
  const t = state.tilemap;
  if (!state.activePatrolId) {
    addPatrol();
  } else {
    pushPatrolUndo();
  }
  const p = t.patrols.find(p => p.id === state.activePatrolId);
  if (!p) return null;
  // No permitir dos nodos en la misma celda dentro de la misma ruta
  // (igual que con entidades). Si ya hay uno aqui, devolvemos su id
  // — el caller decide si selecciona o no.
  const existing = p.nodes.find(n => n.col === col && n.row === row);
  if (existing) return existing.id;
  p.nodeCounter = (p.nodeCounter ?? 0) + 1;
  const nodeId = `n${p.nodeCounter}`;
  p.nodes.push({ id: nodeId, col, row });
  fullRebuild3dRequested = true;
  notify();
  return nodeId;
}

/** Alias historico — el comportamiento toggle se ha removido, pero
 *  dejamos este nombre para no romper llamadas viejas. Equivale a
 *  addPatrolNodeAtCell. */
export function togglePatrolNodeAtCell(col, row) {
  return addPatrolNodeAtCell(col, row);
}

/** Borra el nodo con `nodeId` de la ruta `patrolId`. La conexion
 *  ciclica se restaura sola al recompilar (los targetnames se generan
 *  con `i % N` sobre los nodos restantes). */
export function deletePatrolNode(patrolId, nodeId) {
  const p = state.tilemap.patrols.find(p => p.id === patrolId);
  if (!p) return;
  const i = p.nodes.findIndex(n => n.id === nodeId);
  if (i < 0) return;
  pushPatrolUndo();
  p.nodes.splice(i, 1);
  // Si la entidad seleccionada era este nodo, deseleccionamos.
  if (state.selectedEntityRef
      && state.selectedEntityRef.type === 'node'
      && state.selectedEntityRef.patrolId === patrolId
      && state.selectedEntityRef.nodeId === nodeId) {
    state.selectedEntityRef = null;
  }
  fullRebuild3dRequested = true;
  notify();
}

/** Mueve el nodo `nodeId` de la ruta `patrolId` a (col,row). Rechaza
 *  el movimiento si ya hay OTRO nodo de la misma ruta en esa celda
 *  (mismo invariante que enemies en su tabla). Devuelve true si movio. */
export function movePatrolNodeToCell(patrolId, nodeId, col, row) {
  const t = state.tilemap;
  if (col < 0 || col >= t.cols || row < 0 || row >= t.rows) return false;
  const p = t.patrols.find(p => p.id === patrolId);
  if (!p) return false;
  const n = p.nodes.find(n => n.id === nodeId);
  if (!n) return false;
  if (n.col === col && n.row === row) return true;
  const blocker = p.nodes.find(x => x !== n && x.col === col && x.row === row);
  if (blocker) return false;
  pushPatrolUndo();
  n.col = col;
  n.row = row;
  fullRebuild3dRequested = true;
  notify();
  return true;
}

/** Z override opcional por nodo. null/undefined limpia el override
 *  (el nodo vuelve a usar la altura de vuelo de la ruta). */
export function setPatrolNodeZOverride(patrolId, nodeId, zOverride) {
  const p = state.tilemap.patrols.find(p => p.id === patrolId);
  if (!p) return;
  const n = p.nodes.find(n => n.id === nodeId);
  if (!n) return;
  const next = (zOverride == null) ? undefined : Math.round(Number(zOverride));
  if (n.zOverride === next) return;
  pushPatrolUndo();
  if (next === undefined) delete n.zOverride;
  else n.zOverride = next;
  fullRebuild3dRequested = true;
  notify();
}

/** Devuelve {patrol, node} para el primer nodo encontrado en (col,row).
 *  Si activeOnly=true solo mira en la ruta activa. */
export function getPatrolNodeAtCell(col, row, { activeOnly = false } = {}) {
  const t = state.tilemap;
  const patrols = activeOnly && state.activePatrolId
    ? t.patrols.filter(p => p.id === state.activePatrolId)
    : t.patrols;
  for (const p of patrols) {
    const n = p.nodes.find(n => n.col === col && n.row === row);
    if (n) return { patrol: p, node: n };
  }
  return null;
}

// ---------- enemigos ----------
// Cada enemigo es { id, kind, col, row, angle, target }:
//   id     — 'e<n>' generado al crear, estable
//   kind   — classname (monster_aag, monster_etank, ...) — ver ENEMY_TYPES
//   col,row — snap a celda; la Z la deriva el writer del terreno bajo el
//             nodo + un offset segun tipo (estatico = sobre el suelo;
//             volador = altura de la ruta o un default si no tiene ruta).
//   angle  — 0..359, mira hacia donde al spawnear (Quake convention)
//   target — id de una ruta (de tilemap.patrols) o null. El mapWriter
//             convierte 'p1' -> 'patrol_p1_0' (primer path_corner).

export function getEnemies()           { return state.tilemap.enemies; }
// --- selectores legacy: filtran selectedEntityRef por type='enemy' ---
export function getSelectedEnemyId() {
  const r = state.selectedEntityRef;
  return (r && r.type === 'enemy') ? r.id : null;
}
export function getSelectedEnemy() {
  const id = getSelectedEnemyId();
  if (!id) return null;
  return state.tilemap.enemies.find(e => e.id === id) ?? null;
}
export function setSelectedEnemy(id) {
  const cur = state.selectedEntityRef;
  if (id == null) {
    if (cur == null) return;
    state.selectedEntityRef = null;
  } else {
    if (cur && cur.type === 'enemy' && cur.id === id) return;
    state.selectedEntityRef = { type: 'enemy', id };
  }
  notify();
}

// --- selectores unificados (preferidos) ---
export function getSelectedEntityRef() { return state.selectedEntityRef; }
export function setSelectedEntityRef(ref) {
  // Normaliza: ref puede ser null o un objeto con type. Sin clone porque
  // los refs son { type, id } / { type, patrolId, nodeId } — todo strings.
  const cur = state.selectedEntityRef;
  if (ref == null) {
    if (cur == null) return;
    state.selectedEntityRef = null;
    notify();
    return;
  }
  // Igualdad shallow para evitar notify spurio.
  if (cur && cur.type === ref.type
      && cur.id === ref.id
      && cur.patrolId === ref.patrolId
      && cur.nodeId === ref.nodeId) return;
  state.selectedEntityRef = { ...ref };
  notify();
}

/** Resuelve el ref a su objeto correspondiente. Devuelve:
 *   { type:'enemy', enemy }                — si type='enemy'
 *   { type:'node',  patrol, node }         — si type='node'
 *   null                                   — si no hay seleccion o el
 *                                            objeto referenciado ya no existe. */
export function getSelectedEntity() {
  const r = state.selectedEntityRef;
  if (!r) return null;
  if (r.type === 'enemy') {
    const e = state.tilemap.enemies.find(e => e.id === r.id);
    return e ? { type: 'enemy', enemy: e } : null;
  }
  if (r.type === 'node') {
    const p = state.tilemap.patrols.find(p => p.id === r.patrolId);
    if (!p) return null;
    const n = p.nodes.find(n => n.id === r.nodeId);
    return n ? { type: 'node', patrol: p, node: n } : null;
  }
  return null;
}

/**
 * Coloca un enemigo del kind dado en la celda. Si la celda ya tiene un
 * enemigo, lo elimina (toggle). Devuelve el id creado, o null si quito.
 */
export function addEnemyAtCell(kind, col, row) {
  const t = state.tilemap;
  if (col < 0 || col >= t.cols || row < 0 || row >= t.rows) return null;
  // Toggle: si ya hay un enemigo (cualquier kind) en esa celda, lo borramos
  // y dejamos vacio (en vez de apilar). Mismo patron que togglePatrolNode.
  const existing = t.enemies.findIndex(e => e.col === col && e.row === row);
  if (existing >= 0) {
    const removedId = t.enemies[existing].id;
    t.enemies.splice(existing, 1);
    const r = state.selectedEntityRef;
    if (r && r.type === 'enemy' && r.id === removedId) state.selectedEntityRef = null;
    fullRebuild3dRequested = true;
    notify();
    return null;
  }
  state.enemyCounter += 1;
  const id = `e${state.enemyCounter}`;
  // Default target: si el enemigo es movil, intentamos asignarle una
  // ruta compatible con su tipo:
  //   - enemigo aereo (drone/avion/helo) → ruta 'aerial'
  //   - enemigo terrestre (tank/humvee/m-sam) → ruta 'ground'
  // Prioridad: si la ruta activa es compatible, la usamos; si no, la
  // primera ruta del mapa que sea compatible; si no hay ninguna, null
  // (el usuario tendra que crear una y asignarsela a mano).
  // Esto evita el bug clasico: colocar un tanque con una ruta aerea
  // activa y que el tanque salga dando vueltas mirando al cielo.
  const enemyMeta = ENEMY_BY_KIND.get(kind);
  let defaultTarget = null;
  if (enemyMeta && enemyMeta.needsPath) {
    const wantedKind = enemyMeta.aerial ? 'aerial' : 'ground';
    const isCompat = (p) => (p.kind ?? 'aerial') === wantedKind;
    const activePatrol = t.patrols.find(p => p.id === state.activePatrolId);
    if (activePatrol && isCompat(activePatrol)) {
      defaultTarget = activePatrol.id;
    } else {
      const fallback = t.patrols.find(isCompat);
      if (fallback) defaultTarget = fallback.id;
    }
  }
  t.enemies.push({ id, kind, col, row, angle: 0, target: defaultTarget });
  state.selectedEntityRef = { type: 'enemy', id };
  fullRebuild3dRequested = true;
  notify();
  return id;
}

export function deleteEnemy(id) {
  const t = state.tilemap;
  const i = t.enemies.findIndex(e => e.id === id);
  if (i < 0) return;
  t.enemies.splice(i, 1);
  const r = state.selectedEntityRef;
  if (r && r.type === 'enemy' && r.id === id) state.selectedEntityRef = null;
  fullRebuild3dRequested = true;
  notify();
}

export function setEnemyTarget(id, target) {
  const e = state.tilemap.enemies.find(e => e.id === id);
  if (!e) return;
  const next = target || null;
  if (e.target === next) return;
  e.target = next;
  notify();
}

export function setEnemyAngle(id, angle) {
  const e = state.tilemap.enemies.find(e => e.id === id);
  if (!e) return;
  let a = Math.round(Number(angle) || 0);
  // Normaliza al rango [0, 360).
  a = ((a % 360) + 360) % 360;
  if (e.angle === a) return;
  e.angle = a;
  fullRebuild3dRequested = true;
  notify();
}

// Sólo info_enemy_slot: tipo de monstruo que se spawnea cuando el slot
// se activa. Valores válidos: monster_aag, monster_sam, monster_rad.
export function setEnemySlotKind(id, slotKind) {
  const e = state.tilemap.enemies.find(e => e.id === id);
  if (!e) return;
  if (e.enemyKind === slotKind) return;
  e.enemyKind = slotKind;
  notify();
}

// Sólo info_enemy_slot: día mínimo para que el slot pueda activarse
// (1..5). El sistema sólo intenta activarlo desde ese día en adelante.
export function setEnemySlotActivateDay(id, day) {
  const e = state.tilemap.enemies.find(e => e.id === id);
  if (!e) return;
  const d = Math.max(1, Math.min(5, Math.round(Number(day) || 1)));
  if (e.activateDay === d) return;
  e.activateDay = d;
  notify();
}

// Día aplicable de la entidad. 0 = todos los días; 1..5 = sólo ese día.
// Esto es **metadata del mapper para la solapa Día** — el runtime no lo
// usa para ocultar/mostrar, sirve para el checklist de validación y para
// que el editor sepa qué entidades cuentan al validar un día concreto.
export function setEntityAppliesDay(id, day) {
  const e = state.tilemap.enemies.find(e => e.id === id);
  if (!e) return;
  const d = Math.max(0, Math.min(5, Math.round(Number(day) || 0)));
  if (e.appliesDay === d) return;
  e.appliesDay = d;
  notify();
}

// ---------- modo 'entities' ----------
// Estado UI: kind seleccionado en el ribbon del modo Entities. Lo usa el
// click handler de Canvas2D cuando tool === 'place'. No persiste — vive en
// memoria mientras dura la sesion del editor.
export function getSelectedEntityKind() { return state.selectedEntityKind; }
export function setSelectedEntityKind(kind) {
  if (state.selectedEntityKind === kind) return;
  state.selectedEntityKind = kind;
  notify();
}

/** Devuelve el enemigo en la celda (col,row) o null si no hay. Lo usan los
 *  handlers de click del modo Entities y el render para resaltar el
 *  seleccionado. */
export function getEnemyAtCell(col, row) {
  const t = state.tilemap;
  return t.enemies.find(e => e.col === col && e.row === row) ?? null;
}

/**
 * Click en (col,row) en modo Entities con tool='place':
 *   - Si la celda ya tiene un enemigo, lo SELECCIONA (no se reemplaza
 *     silenciosamente). Asi el usuario puede entrar a editar properties
 *     sin tener que cambiar a la tool 'select'.
 *   - Si no, coloca un enemigo del kind activo y lo deja seleccionado.
 * Devuelve el id resultante (seleccionado o creado).
 */
export function placeOrSelectEntityAtCell(col, row) {
  const t = state.tilemap;
  if (col < 0 || col >= t.cols || row < 0 || row >= t.rows) return null;
  // Prioridad de pick: enemigo primero (mas raro), luego nodo de patrulla.
  const enemy = t.enemies.find(e => e.col === col && e.row === row);
  if (enemy) {
    setSelectedEntityRef({ type: 'enemy', id: enemy.id });
    return { type: 'enemy', id: enemy.id };
  }
  const hitNode = getPatrolNodeAtCell(col, row);
  if (hitNode) {
    setSelectedEntityRef({ type: 'node', patrolId: hitNode.patrol.id, nodeId: hitNode.node.id });
    return { type: 'node', patrolId: hitNode.patrol.id, nodeId: hitNode.node.id };
  }
  // Celda vacia → crear enemigo. Pero solo si el brush activo del
  // sidebar es de tipo 'enemy'; si el usuario tiene seleccionada una
  // textura o un objeto especial en la paleta, un click en celda vacia
  // no debe colocar nada (era confuso "click pone tanque" cuando el
  // sidebar mostraba seleccionada una textura).
  const brush = BRUSH_PALETTE[state.selectedBrushIdx];
  if (!brush || brush.type !== 'enemy') return null;
  // addEnemyAtCell ya pone el selectedEntityRef al recien creado.
  const newId = addEnemyAtCell(state.selectedEntityKind, col, row);
  return newId ? { type: 'enemy', id: newId } : null;
}

/** Click en (col,row) con tool='select': si hay entidad o nodo lo
 *  selecciona; si no, deselecciona. */
export function selectEntityAtCell(col, row) {
  const t = state.tilemap;
  if (col < 0 || col >= t.cols || row < 0 || row >= t.rows) {
    setSelectedEntityRef(null);
    return null;
  }
  const enemy = t.enemies.find(e => e.col === col && e.row === row);
  if (enemy) {
    setSelectedEntityRef({ type: 'enemy', id: enemy.id });
    return { type: 'enemy', id: enemy.id };
  }
  const hitNode = getPatrolNodeAtCell(col, row);
  if (hitNode) {
    setSelectedEntityRef({ type: 'node', patrolId: hitNode.patrol.id, nodeId: hitNode.node.id });
    return { type: 'node', patrolId: hitNode.patrol.id, nodeId: hitNode.node.id };
  }
  setSelectedEntityRef(null);
  return null;
}

/** Mueve la entidad `id` a la celda (col,row). Si la celda destino ya
 *  esta ocupada por OTRA entidad (no la misma), no mueve y devuelve
 *  false — el drag handler lo usa para cancelar el drop. Out-of-grid
 *  tambien es no-op. */
export function moveEnemyToCell(id, col, row) {
  const t = state.tilemap;
  if (col < 0 || col >= t.cols || row < 0 || row >= t.rows) return false;
  const e = t.enemies.find(e => e.id === id);
  if (!e) return false;
  if (e.col === col && e.row === row) return true;
  // Misma celda destino con OTRA entidad → conflicto, no movemos.
  const blocker = t.enemies.find(x => x !== e && x.col === col && x.row === row);
  if (blocker) return false;
  e.col = col;
  e.row = row;
  fullRebuild3dRequested = true;
  notify();
  return true;
}

/** Cambia el kind del enemigo seleccionado (o el id dado). */
export function setEnemyKind(id, kind) {
  const e = state.tilemap.enemies.find(e => e.id === id);
  if (!e) return;
  if (!ENEMY_BY_KIND.has(kind)) return;
  if (e.kind === kind) return;
  e.kind = kind;
  // Si el nuevo kind NO necesita ruta, limpiamos target para no dejar
  // un puntero invalido colgando.
  const meta = ENEMY_BY_KIND.get(kind);
  if (meta && !meta.needsPath) e.target = null;
  fullRebuild3dRequested = true;
  notify();
}

/** Return the storeys count of any 4-connected neighbouring house, or
 *  null if none exists. Used to make contiguous houses share a height. */
function houseStoreysFromNeighbours(t, col, row) {
  const check = (cc, rr) => {
    if (cc < 0 || cc >= t.cols || rr < 0 || rr >= t.rows) return null;
    const o = t.objects[rr * t.cols + cc];
    return (o && o.kind === 'casa' && typeof o.storeys === 'number') ? o.storeys : null;
  };
  return check(col - 1, row) ?? check(col + 1, row) ?? check(col, row - 1) ?? check(col, row + 1);
}

/**
 * Apply the currently selected paint brush to a cell. Returns true if
 * anything changed.
 *
 * `toggleObject`:
 *   - true  (default for single-cell paint): clicking the same kind on a
 *     cell that already holds it removes the object.
 *   - false (used by fillRect): always set the object, never toggle.
 */
function applyPaintAtCell(col, row, { toggleObject } = { toggleObject: true }) {
  const t = state.tilemap;
  const i = row * t.cols + col;
  let changed = false;
  const brush = BRUSH_PALETTE[state.selectedBrushIdx];
  if (!brush) return false;
  if (brush.type === 'texture') {
    // Curve cycling: when the active brush is a `cycle` brush (curve-out
    // or curve-in), each click in the 'paint' tool rotates the cell
    // through the 4 cardinal directions of that family.
    //   - empty cell or different family   → start at the brush's id (-N)
    //   - same family + first touch        → rotate to next direction
    //   - same family + already touched    → no-op (drag stays still)
    // The rotation only fires under the 'paint' tool. Bote/Rectángulo
    // (bucket/rect) and any fill path always plant the brush at -N.
    let targetId = brush.id;
    if (brush.cycle && state.tool === 'paint') {
      const curIdx = t.textures[i];
      const curPal = curIdx >= 0 ? PALETTE[curIdx] : null;
      const curId = curPal?.id;
      const m = curId ? curId.match(/^(curve-(?:out|in))-([NESO])$/) : null;
      if (m && m[1] === brush.cycle) {
        // Same family — cycle to next dir, unless this cell was
        // already touched in this stroke.
        if (state.strokeCells.has(i)) {
          // Already rotated once in this drag; freeze for the rest.
          targetId = curId;
        } else {
          const NEXT = { N: 'E', E: 'S', S: 'O', O: 'N' };
          targetId = `${brush.cycle}-${NEXT[m[2]]}`;
        }
      }
      // else: empty cell or different family → keep brush.id (the -N
      // variant), which plants a fresh curve.
      state.strokeCells.add(i);
    }
    const palIdx = PALETTE.findIndex(p => p.id === targetId);
    if (palIdx < 0) return false;
    // Painting a texture also lifts a submerged cell to sea level —
    // otherwise pintar on the default all-water map would produce no
    // visible cube. Use Altura tools to submerge or raise further.
    if (t.textures[i] !== palIdx) { t.textures[i] = palIdx; changed = true; }
    if (t.heights[i] < SEA_LEVEL_H) { t.heights[i] = SEA_LEVEL_H; changed = true; }
  } else if (brush.type === 'spawn') {
    // Spawn is a singleton — each click relocates the single
    // info_player_start to the centre of the clicked cell. Z is
    // re-derived by the mapWriter (mid-ceiling above the terrain).
    setSpawnToCell(col, row);
    // No per-chunk dirty needed (no geometry change); notify so any
    // overlay redraws.
    return false;
  } else if (brush.type === 'enemy') {
    // Enemigo (monster_*): delega en addEnemyAtCell, que es toggle por
    // celda y ya notifica + marca chunk dirty internamente. Devolvemos
    // false aqui para no disparar un segundo notify en applyToolAtCell.
    addEnemyAtCell(brush.id, col, row);
    return false;
  } else if (brush.type === 'object') {
    const existing = t.objects[i];
    if (toggleObject && existing && existing.kind === brush.id) {
      t.objects[i] = null;
      changed = true;
    } else if (!existing || existing.kind !== brush.id) {
      const newObj = { kind: brush.id };
      if (brush.id === 'casa') {
        const inherited = houseStoreysFromNeighbours(t, col, row);
        newObj.storeys = inherited != null
          ? inherited
          : (HOUSE_STOREYS_MIN + Math.floor(Math.random() * (HOUSE_STOREYS_MAX - HOUSE_STOREYS_MIN + 1)));
      }
      t.objects[i] = newObj;
      changed = true;
      // Snap a submerged cell up so the object doesn't end up under
      // water. Pick a default 'tierra' texture if the cell was bare,
      // so the surface isn't empty on emergence.
      if (t.heights[i] < SEA_LEVEL_H) {
        t.heights[i] = SEA_LEVEL_H;
        if (t.textures[i] < 0) {
          const dirtIdx = PALETTE.findIndex(p => p.id === 'tierra');
          if (dirtIdx >= 0) t.textures[i] = dirtIdx;
        }
      }
    }
  }
  if (changed) markChunkDirty(col, row);
  return changed;
}

/**
 * Fill an axis-aligned cell rectangle with the currently selected brush.
 * Inclusive on both ends. Used by the 'rect' tool when the user releases
 * the mouse over the target rectangle.
 */
export function fillRect(c0, r0, c1, r1) {
  const t = state.tilemap;
  const cMin = Math.max(0, Math.min(c0, c1));
  const cMax = Math.min(t.cols - 1, Math.max(c0, c1));
  const rMin = Math.max(0, Math.min(r0, r1));
  const rMax = Math.min(t.rows - 1, Math.max(r0, r1));
  let anyChanged = false;
  for (let row = rMin; row <= rMax; row++) {
    for (let col = cMin; col <= cMax; col++) {
      if (applyPaintAtCell(col, row, { toggleObject: false })) anyChanged = true;
    }
  }
  if (anyChanged) notify();
  return anyChanged;
}

/**
 * Bucket-fill: paint every cell 4-connected to (col, row) that shares
 * its current height AND texture index with the start cell. Submerged
 * starts are rejected (you can't bucket-fill ocean — use Altura tools
 * to raise the land first). For non-texture brushes (object/spawn) we
 * fall back to a single-cell apply so a click doesn't carpet half the
 * map with houses.
 */
export function floodFillPaint(col, row) {
  const t = state.tilemap;
  if (col < 0 || col >= t.cols || row < 0 || row >= t.rows) return false;
  const i0 = row * t.cols + col;
  if (t.heights[i0] < SEA_LEVEL_H) return false;
  const brush = BRUSH_PALETTE[state.selectedBrushIdx];
  if (!brush || brush.type !== 'texture') {
    // Object/spawn brushes bypass the flood — same behaviour as a
    // regular single-cell paint.
    return applyToolAtCell(col, row);
  }
  const cols = t.cols;
  const rows = t.rows;
  const origH = t.heights[i0];
  const origT = t.textures[i0];
  const visited = new Uint8Array(cols * rows);
  const stack = [i0];
  visited[i0] = 1;
  let anyChanged = false;
  while (stack.length > 0) {
    const i = stack.pop();
    const cc = i % cols;
    const cr = (i - cc) / cols;
    if (applyPaintAtCell(cc, cr, { toggleObject: false })) anyChanged = true;
    const neighbours = [i - 1, i + 1, i - cols, i + cols];
    const nCols = [cc - 1, cc + 1, cc, cc];
    const nRows = [cr, cr, cr - 1, cr + 1];
    for (let k = 0; k < 4; k++) {
      const nc = nCols[k], nr = nRows[k];
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      const ni = neighbours[k];
      if (visited[ni]) continue;
      if (t.heights[ni] !== origH || t.textures[ni] !== origT) continue;
      visited[ni] = 1;
      stack.push(ni);
    }
  }
  if (anyChanged) notify();
  return anyChanged;
}

/**
 * Cap de altura: para cada celda del rect inclusive, si su altura supera
 * `maxH`, la baja a `maxH`. Las celdas por debajo del cap se quedan
 * intactas. Si maxH cae por debajo del nivel del mar, las celdas
 * sumergidas pierden textura+objeto (consistente con el tool 'lower').
 *
 * Devuelve true si alguna celda cambio.
 */
export function applyCapRect(c0, r0, c1, r1, maxH) {
  const t = state.tilemap;
  const cMin = Math.max(0, Math.min(c0, c1));
  const cMax = Math.min(t.cols - 1, Math.max(c0, c1));
  const rMin = Math.max(0, Math.min(r0, r1));
  const rMax = Math.min(t.rows - 1, Math.max(r0, r1));
  let anyChanged = false;
  for (let row = rMin; row <= rMax; row++) {
    for (let col = cMin; col <= cMax; col++) {
      const i = row * t.cols + col;
      if (t.heights[i] > maxH) {
        t.heights[i] = maxH;
        if (maxH < SEA_LEVEL_H) {
          t.textures[i] = -1;
          t.objects[i] = null;
        }
        markChunkDirty(col, row);
        anyChanged = true;
      }
    }
  }
  if (anyChanged) notify();
  return anyChanged;
}

/**
 * Quita edificios (casa, tower) de todas las celdas del rect inclusive.
 * No toca lamparas, arboles, arbustos ni rocas — solo los objetos con
 * flag `isBuilding` en SPECIAL_OBJECTS. Tampoco altera alturas/texturas.
 *
 * Devuelve el numero de celdas afectadas.
 */
export function removeBuildingsRect(c0, r0, c1, r1) {
  const t = state.tilemap;
  const cMin = Math.max(0, Math.min(c0, c1));
  const cMax = Math.min(t.cols - 1, Math.max(c0, c1));
  const rMin = Math.max(0, Math.min(r0, r1));
  const rMax = Math.min(t.rows - 1, Math.max(r0, r1));
  if (!t.objects) return 0;
  let removed = 0;
  for (let row = rMin; row <= rMax; row++) {
    for (let col = cMin; col <= cMax; col++) {
      const i = row * t.cols + col;
      const obj = t.objects[i];
      if (!obj) continue;
      const meta = OBJECT_BY_KIND.get(obj.kind);
      if (!meta || !meta.isBuilding) continue;
      t.objects[i] = null;
      markChunkDirty(col, row);
      removed++;
    }
  }
  if (removed > 0) notify();
  return removed;
}

/**
 * Bucket-fill por altura+textura: a partir de (col,row), llena la region
 * conexa de celdas con misma h Y misma textura, fijando su altura al
 * targetH. La textura no cambia. Mismo flood que floodFillPaint pero el
 * efecto es solo altura. Sumergir una celda (h < SEA_LEVEL_H) limpia su
 * textura+objeto como hace el sub-tool 'lower'.
 */
export function floodFillHeight(col, row, targetH) {
  const t = state.tilemap;
  if (col < 0 || col >= t.cols || row < 0 || row >= t.rows) return false;
  const cols = t.cols, rows = t.rows;
  const i0 = row * cols + col;
  const origH = t.heights[i0];
  const origT = t.textures[i0];
  if (origH === targetH) return false;  // nada que hacer
  const visited = new Uint8Array(cols * rows);
  const stack = [i0];
  visited[i0] = 1;
  let anyChanged = false;
  while (stack.length > 0) {
    const i = stack.pop();
    const cc = i % cols;
    const cr = (i - cc) / cols;
    if (t.heights[i] !== targetH) {
      t.heights[i] = targetH;
      if (targetH < SEA_LEVEL_H) {
        t.textures[i] = -1;
        t.objects[i] = null;
      }
      markChunkDirty(cc, cr);
      anyChanged = true;
    }
    const neighbours = [i - 1, i + 1, i - cols, i + cols];
    const nCols = [cc - 1, cc + 1, cc, cc];
    const nRows = [cr, cr, cr - 1, cr + 1];
    for (let k = 0; k < 4; k++) {
      const nc = nCols[k], nr = nRows[k];
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      const ni = neighbours[k];
      if (visited[ni]) continue;
      if (t.heights[ni] !== origH || t.textures[ni] !== origT) continue;
      visited[ni] = 1;
      stack.push(ni);
    }
  }
  if (anyChanged) notify();
  return anyChanged;
}

/**
 * Set every cell in the inclusive rectangle to height `targetH`.
 * Submerging a cell strips its texture/object (consistent with the
 * 'lower' and 'extend' tools). Used by the rect-fill drag in height
 * mode.
 */
export function fillRectHeight(c0, r0, c1, r1, targetH) {
  const t = state.tilemap;
  const cMin = Math.max(0, Math.min(c0, c1));
  const cMax = Math.min(t.cols - 1, Math.max(c0, c1));
  const rMin = Math.max(0, Math.min(r0, r1));
  const rMax = Math.min(t.rows - 1, Math.max(r0, r1));
  let anyChanged = false;
  for (let row = rMin; row <= rMax; row++) {
    for (let col = cMin; col <= cMax; col++) {
      const i = row * t.cols + col;
      if (t.heights[i] === targetH) continue;
      t.heights[i] = targetH;
      if (targetH < SEA_LEVEL_H) {
        t.textures[i] = -1;
        t.objects[i] = null;
      }
      markChunkDirty(col, row);
      anyChanged = true;
    }
  }
  if (anyChanged) notify();
  return anyChanged;
}

/**
 * Erosion: aplica las reglas de preparacion_iso para rellenar el terreno
 * con bloques de decoracion (kind + dir). No altera las alturas existentes
 * (eso es responsabilidad del usuario con las tools subir/bajar/rect); en
 * vez de eso, marca cada celda del rect con el `kind` que mejor encaja
 * segun sus vecinos. Las decoraciones se guardan en tilemap.decorations[i]
 * y se renderizan como bloques amarillos.
 *
 * Regla: para cada celda dentro del rect, comparamos su altura `h` con la
 * de los 8 vecinos. Un vecino se considera "cubo" si su altura es
 * ESTRICTAMENTE mayor que h. Segun el patron de vecinos cubo, elegimos
 * un kind+dir:
 *
 *   4 ortos cubo                  -> pit
 *   3 ortos cubo, 1 libre         -> ramp_u_closed (lado bajo = lado libre)
 *   2 ortos opuestos cubo         -> ramp_u
 *   2 ortos adyacentes cubo       -> corner_in (esquina convergente)
 *   1 orto cubo                   -> ramp (lado alto = lado del cubo)
 *   0 ortos, 2 diag opuestos      -> bridge_diag
 *   0 ortos, 1 diag               -> ramp_diag / corner_out (alta en diagonal)
 *   resto                         -> sin decoracion
 *
 * Dirs (orto): 0=N, 1=E, 2=S, 3=O.
 * Dirs (diag): 0=NE, 1=SE, 2=SO, 3=NO.
 */
/**
 * Inversa de applyErosionRect: limpia toda la decoracion en el rectangulo.
 * Tambien resetea t.smoothing[] (los tags legacy 'rampa'/'bevel'/'prisma')
 * para que el usuario tenga un unico "wipe" de overlays especiales. La
 * altura del terreno NO se toca; solo se quitan los elementos derivados.
 */
export function removeErosionRect(c0, r0, c1, r1) {
  const t = state.tilemap;
  const cMin = Math.max(0, Math.min(c0, c1));
  const cMax = Math.min(t.cols - 1, Math.max(c0, c1));
  const rMin = Math.max(0, Math.min(r0, r1));
  const rMax = Math.min(t.rows - 1, Math.max(r0, r1));
  const cols = t.cols;
  let anyChanged = false;
  for (let row = rMin; row <= rMax; row++) {
    for (let col = cMin; col <= cMax; col++) {
      const i = row * cols + col;
      if (t.decorations && t.decorations[i] !== 0) {
        t.decorations[i] = 0;
        anyChanged = true;
        markChunkDirty(col, row);
      }
      if (t.smoothing && t.smoothing[i] != null) {
        t.smoothing[i] = null;
        anyChanged = true;
        markChunkDirty(col, row);
      }
    }
  }
  if (anyChanged) notify();
  return anyChanged;
}

export function applyErosionRect(c0, r0, c1, r1) {
  const t = state.tilemap;
  if (!t.decorations) t.decorations = new Int16Array(t.cols * t.rows);
  const cMin = Math.max(0, Math.min(c0, c1));
  const cMax = Math.min(t.cols - 1, Math.max(c0, c1));
  const rMin = Math.max(0, Math.min(r0, r1));
  const rMax = Math.min(t.rows - 1, Math.max(r0, r1));
  const cols = t.cols, rows = t.rows;
  function hAt(col, row) {
    if (col < 0 || col >= cols || row < 0 || row >= rows) return -Infinity;
    return t.heights[row * cols + col];
  }
  let anyChanged = false;
  // Paso 1: limpiamos cualquier decoracion previa dentro del rect. Asi,
  // cambios en las reglas se aplican siempre desde cero cuando el usuario
  // vuelve a aplicar Erosion. Sin esto, una celda cuya decoracion antigua
  // resulta ser el mismo `code` que la nueva regla pero con otra direccion
  // de bug seguiria fija. Con limpieza explicita evitamos esa clase de fallo.
  for (let row = rMin; row <= rMax; row++) {
    for (let col = cMin; col <= cMax; col++) {
      const i = row * cols + col;
      if (t.decorations[i] !== 0) {
        t.decorations[i] = 0;
        markChunkDirty(col, row);
        anyChanged = true;
      }
    }
  }

  // Paso 2: evaluamos las reglas con las alturas actuales y escribimos la
  // decoracion que corresponde a cada celda. Las celdas sin patron quedan
  // limpias (gracias al paso 1).
  for (let row = rMin; row <= rMax; row++) {
    for (let col = cMin; col <= cMax; col++) {
      const i = row * cols + col;
      const h = t.heights[i];
      // Vecinos ortogonales (N/E/S/O) y diagonales (NE/SE/SO/NO).
      const N = hAt(col, row - 1) > h ? 1 : 0;
      const E = hAt(col + 1, row) > h ? 1 : 0;
      const S = hAt(col, row + 1) > h ? 1 : 0;
      const O = hAt(col - 1, row) > h ? 1 : 0;
      const NE = hAt(col + 1, row - 1) > h ? 1 : 0;
      const SE = hAt(col + 1, row + 1) > h ? 1 : 0;
      const SO = hAt(col - 1, row + 1) > h ? 1 : 0;
      const NO = hAt(col - 1, row - 1) > h ? 1 : 0;
      const orthos = N + E + S + O;
      const diags = NE + SE + SO + NO;

      let code = 0;
      if (orthos === 4) {
        code = encodeDeco('pit', 0);
      } else if (orthos === 3) {
        // El lado libre: 0=N, 1=E, 2=S, 3=O.
        const free = !N ? 0 : !E ? 1 : !S ? 2 : 3;
        code = encodeDeco('ramp_u_closed', free);
      } else if (orthos === 2 && (N + S === 2)) {
        code = encodeDeco('ramp_u', 0); // dir 0 = NS
      } else if (orthos === 2 && (E + O === 2)) {
        code = encodeDeco('ramp_u', 1); // dir 1 = EO
      } else if (orthos === 2) {
        // Dos ortos adyacentes: corner_in con esquina = entre ellos.
        // dir 0=NE (N+E), 1=SE (S+E), 2=SO (S+O), 3=NO (N+O).
        const cornerDir = (N && E) ? 0 : (S && E) ? 1 : (S && O) ? 2 : 3;
        code = encodeDeco('corner_in', cornerDir);
      } else if (orthos === 1) {
        // El lado alto.
        const hi = N ? 0 : E ? 1 : S ? 2 : 3;
        code = encodeDeco('ramp', hi);
      } else if (orthos === 0 && diags >= 2) {
        // Sin ortos altos: si hay dos diagonales opuestas, puente.
        if (NE && SO) code = encodeDeco('bridge_diag', 1);       // dir 1 = NE-SO
        else if (NO && SE) code = encodeDeco('bridge_diag', 0);  // dir 0 = NO-SE
        // Si no son opuestas (ej NE+SE), no aplicamos kind (caso raro).
      } else if (orthos === 0 && diags === 1) {
        // Un solo diagonal alto y nada mas. ramp_diag = tetraedro con
        // esquina alta apuntando a ese diagonal.
        const diagDir = NE ? 0 : SE ? 1 : SO ? 2 : 3;
        code = encodeDeco('ramp_diag', diagDir);
      }
      // Sin patron reconocible: 0 (limpia decoracion previa).
      if (t.decorations[i] !== code) {
        t.decorations[i] = code;
        markChunkDirty(col, row);
        anyChanged = true;
      }
    }
  }
  if (anyChanged) notify();
  return anyChanged;
}

/**
 * Suaviza la altura de la celda (col,row) promediando un cuadro 3x3.
 * Devuelve true si cambio. Helper reutilizable (la accion 'smooth' del
 * applyTool tambien lo usa indirectamente — misma matematica).
 */
function smoothCellHeight(col, row) {
  const t = state.tilemap;
  if (col < 0 || col >= t.cols || row < 0 || row >= t.rows) return false;
  let sum = 0, count = 0;
  for (let dr = -1; dr <= 1; dr++) {
    const rr = row + dr;
    if (rr < 0 || rr >= t.rows) continue;
    for (let dc = -1; dc <= 1; dc++) {
      const cc = col + dc;
      if (cc < 0 || cc >= t.cols) continue;
      sum += t.heights[rr * t.cols + cc];
      count++;
    }
  }
  const i = row * t.cols + col;
  const avg = Math.round(sum / count);
  if (avg !== t.heights[i]) {
    t.heights[i] = avg;
    markChunkDirty(col, row);
    return true;
  }
  return false;
}

/**
 * Suaviza un rectangulo entero promediando cada celda con su cuadro 3x3.
 * Lectura sobre las alturas originales (snapshot al entrar), escritura
 * al final — asi cada celda usa los valores ANTES del paso, sin sesgar
 * por orden de barrido.
 *
 * Devuelve true si alguna celda cambio.
 */
export function applySmoothRect(c0, r0, c1, r1) {
  const t = state.tilemap;
  const cMin = Math.max(0, Math.min(c0, c1));
  const cMax = Math.min(t.cols - 1, Math.max(c0, c1));
  const rMin = Math.max(0, Math.min(r0, r1));
  const rMax = Math.min(t.rows - 1, Math.max(r0, r1));
  const cols = t.cols, rows = t.rows;
  // Snapshot solo de las celdas que vamos a leer (rect + 1 de halo).
  // Mas barato que copiar t.heights entero para mapas grandes.
  const origGet = (c, r) => {
    if (c < 0 || c >= cols || r < 0 || r >= rows) return null;
    return t.heights[r * cols + c];
  };
  let anyChanged = false;
  // Computamos las nuevas alturas en un buffer, luego volcamos.
  const newH = new Int16Array((cMax - cMin + 1) * (rMax - rMin + 1));
  for (let row = rMin; row <= rMax; row++) {
    for (let col = cMin; col <= cMax; col++) {
      let sum = 0, count = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const v = origGet(col + dc, row + dr);
          if (v === null) continue;
          sum += v;
          count++;
        }
      }
      newH[(row - rMin) * (cMax - cMin + 1) + (col - cMin)] = Math.round(sum / count);
    }
  }
  for (let row = rMin; row <= rMax; row++) {
    for (let col = cMin; col <= cMax; col++) {
      const i = row * cols + col;
      const avg = newH[(row - rMin) * (cMax - cMin + 1) + (col - cMin)];
      if (avg !== t.heights[i]) {
        t.heights[i] = avg;
        markChunkDirty(col, row);
        anyChanged = true;
      }
    }
  }
  if (anyChanged) notify();
  return anyChanged;
}

/**
 * Simula un "rio" que arranca en (col0,row0) y avanza paso a paso al vecino
 * (cuadro 3x3 sin la propia celda) de menor altura, aplicando smooth a la
 * celda actual en cada paso. Si todos los vecinos son >= que la celda
 * actual (pozo), aplica smooth y reintenta una vez; si tampoco baja, para.
 * Termina cuando alcanza el nivel del mar o no encuentra siguiente paso.
 *
 * Devuelve true si alguna celda cambio.
 */
function runRiverFrom(col0, row0, c0, r0, c1, r1) {
  const t = state.tilemap;
  const MAX_STEPS = (c1 - c0 + 1) + (r1 - r0 + 1); // cota razonable
  let col = col0, row = row0;
  let changed = false;
  for (let step = 0; step < MAX_STEPS; step++) {
    // 1) Aplica smooth a la celda actual.
    if (smoothCellHeight(col, row)) changed = true;
    // 2) Si ya estamos al nivel del mar, terminamos.
    const hHere = t.heights[row * t.cols + col];
    if (hHere <= SEA_LEVEL_H) break;
    // 3) Busca el vecino mas bajo dentro del area.
    let bestC = -1, bestR = -1, bestH = hHere;
    for (let dr = -1; dr <= 1; dr++) {
      const rr = row + dr;
      if (rr < r0 || rr > r1) continue;
      for (let dc = -1; dc <= 1; dc++) {
        if (dc === 0 && dr === 0) continue;
        const cc = col + dc;
        if (cc < c0 || cc > c1) continue;
        const hn = t.heights[rr * t.cols + cc];
        if (hn < bestH) { bestH = hn; bestC = cc; bestR = rr; }
      }
    }
    if (bestC === -1) {
      // Pozo: smooth + un solo reintento. Si tras smooth aun no hay salida,
      // paramos. smoothCellHeight ya se llamo arriba, asi que ya hicimos
      // el "reintento": miramos de nuevo aqui.
      let retryBest = hHere;
      let retryC = -1, retryR = -1;
      for (let dr = -1; dr <= 1; dr++) {
        const rr = row + dr;
        if (rr < r0 || rr > r1) continue;
        for (let dc = -1; dc <= 1; dc++) {
          if (dc === 0 && dr === 0) continue;
          const cc = col + dc;
          if (cc < c0 || cc > c1) continue;
          const hn = t.heights[rr * t.cols + cc];
          if (hn < retryBest) { retryBest = hn; retryC = cc; retryR = rr; }
        }
      }
      if (retryC === -1) break;
      bestC = retryC; bestR = retryR;
    }
    col = bestC; row = bestR;
  }
  return changed;
}

/**
 * "2 siglos": en cada iteracion hace 3 pasos:
 *   1) Simula 10 rios. Cada rio arranca en una celda del percentil >=90
 *      de altura dentro del area y baja vecino-a-vecino aplicando smooth
 *      hasta llegar al nivel del mar o atascarse.
 *   2) Suaviza 100 celdas aleatorias mas (smooth disperso).
 *   3) Aplica applyErosionRect a todo el rect.
 * Repite hasta 200 veces o hasta que una iteracion no produzca cambios.
 *
 * Rect activo (prioridad de mayor a menor):
 *   - `rect` explicito: {c0,r0,c1,r1}, normalizado y recortado al mapa.
 *   - tilemap.playArea, si esta definida.
 *   - Mapa entero.
 *
 * Es ASYNC: entre iteraciones cede al event loop con un setTimeout(0) para
 * que React pueda re-renderizar (barra de progreso) y la app no se quede
 * congelada. `onProgress({iter, max, changed, done})` recibe la senal en
 * cada paso. Devuelve una Promise con el numero de iteraciones efectivas.
 */
export function applyErosion2Siglos(onProgress, rect = null) {
  const t = state.tilemap;
  const MAX = 200;
  const SMOOTH_POINTS = 100;
  const RIVERS_PER_ITER = 10;
  let c0, r0, c1, r1;
  if (rect) {
    c0 = Math.max(0, Math.min(rect.c0, rect.c1));
    c1 = Math.min(t.cols - 1, Math.max(rect.c0, rect.c1));
    r0 = Math.max(0, Math.min(rect.r0, rect.r1));
    r1 = Math.min(t.rows - 1, Math.max(rect.r0, rect.r1));
  } else if (t.playArea) {
    c0 = t.playArea.c0; r0 = t.playArea.r0;
    c1 = t.playArea.c1; r1 = t.playArea.r1;
  } else {
    c0 = 0; r0 = 0; c1 = t.cols - 1; r1 = t.rows - 1;
  }
  const wRange = c1 - c0 + 1;
  const hRange = r1 - r0 + 1;
  return new Promise((resolve) => {
    let iter = 0;
    const step = () => {
      // 1) 10 rios. Calculamos el umbral del percentil 90 de la altura
      //    dentro del area en cada iteracion (las alturas cambian de un
      //    paso al siguiente, asi que recalcular es mas robusto).
      let riverChanged = false;
      const heights = [];
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          heights.push(t.heights[r * t.cols + c]);
        }
      }
      heights.sort((a, b) => a - b);
      // Percentil 90: la altura por debajo de la cual estan el 90% de las
      // celdas; las que la superan son el "top 10%". Si el area es muy
      // plana (todas la misma h), el threshold sera igual al max y solo
      // las celdas con h estricto > threshold califican — puede ser 0.
      // En ese caso usamos el max como threshold inclusivo.
      const p90Idx = Math.floor(heights.length * 0.9);
      const threshold = heights[p90Idx];
      const maxH = heights[heights.length - 1];
      // Recoger candidatos: celdas con h >= threshold (o > threshold + 0
      // si threshold==maxH, entonces aceptamos h >= max).
      const candidates = [];
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const h = t.heights[r * t.cols + c];
          if (h >= threshold && h > SEA_LEVEL_H) candidates.push((r << 16) | c);
        }
      }
      for (let k = 0; k < RIVERS_PER_ITER && candidates.length > 0; k++) {
        const idx = (Math.random() * candidates.length) | 0;
        const packed = candidates[idx];
        const startC = packed & 0xffff;
        const startR = packed >>> 16;
        if (runRiverFrom(startC, startR, c0, r0, c1, r1)) riverChanged = true;
      }
      if (riverChanged) notify();
      // 2) Suavizar 100 puntos aleatorios dentro del area.
      let smoothChanged = false;
      for (let k = 0; k < SMOOTH_POINTS; k++) {
        const c = c0 + ((Math.random() * wRange) | 0);
        const r = r0 + ((Math.random() * hRange) | 0);
        if (smoothCellHeight(c, r)) smoothChanged = true;
      }
      if (smoothChanged) notify();
      // 3) Erosion sobre el rect entero.
      const erosionChanged = applyErosionRect(c0, r0, c1, r1);
      iter++;
      const changed = riverChanged || smoothChanged || erosionChanged;
      if (onProgress) {
        try { onProgress({ iter, max: MAX, changed, done: false }); } catch {}
      }
      if (!changed || iter >= MAX) {
        if (onProgress) {
          try { onProgress({ iter, max: MAX, changed, done: true }); } catch {}
        }
        resolve(iter);
        return;
      }
      // Ceder al event loop para que React repinte la barra antes de la
      // siguiente iteracion.
      setTimeout(step, 0);
    };
    step();
  });
}

/**
 * Wrapper sobre applyErosion2Siglos que publica el progreso en el store
 * (`state.siglosProgress`) y lo limpia 1.5 s despues de terminar. Util
 * cuando varios componentes (Toolbar, Canvas2D) quieren disparar la
 * simulacion sin coordinar callbacks entre ellos.
 *
 * Solo permite una simulacion en curso a la vez: si `state.siglosProgress`
 * no es null y .done es false, devuelve sin hacer nada.
 */
export async function runErosion2SiglosWithProgress(rect = null) {
  if (state.siglosProgress && !state.siglosProgress.done) return 0;
  state.siglosProgress = { iter: 0, max: 200, done: false };
  notify();
  const iters = await applyErosion2Siglos((p) => {
    state.siglosProgress = p;
    notify();
  }, rect);
  setTimeout(() => {
    state.siglosProgress = null;
    notify();
  }, 1500);
  return iters;
}

/**
 * Copy/paste clipboard for the 'copy' mode.
 *
 * copyRect snapshots heights + textures + objects + smoothing for the
 * inclusive cell rectangle (any corner ordering). Objects are
 * deep-cloned so editing the live tilemap after a copy can't mutate
 * the clipboard. pasteAt drops the clipboard at (col, row) as the
 * top-left anchor, clipping at the tilemap edges.
 */
export function copyRect(c0, r0, c1, r1) {
  const t = state.tilemap;
  const cMin = Math.max(0, Math.min(c0, c1));
  const cMax = Math.min(t.cols - 1, Math.max(c0, c1));
  const rMin = Math.max(0, Math.min(r0, r1));
  const rMax = Math.min(t.rows - 1, Math.max(r0, r1));
  const cw = cMax - cMin + 1;
  const ch = rMax - rMin + 1;
  if (cw <= 0 || ch <= 0) return false;
  const heights   = new Int16Array(cw * ch);
  const textures  = new Int8Array (cw * ch);
  const objects   = new Array(cw * ch).fill(null);
  const smoothing = new Array(cw * ch).fill(null);
  for (let r = 0; r < ch; r++) {
    for (let c = 0; c < cw; c++) {
      const src = (rMin + r) * t.cols + (cMin + c);
      const dst = r * cw + c;
      heights[dst]  = t.heights[src];
      textures[dst] = t.textures[src];
      const so = t.objects[src];
      objects[dst]  = so ? { ...so } : null;
      smoothing[dst] = t.smoothing ? t.smoothing[src] : null;
    }
  }
  state.clipboard = { cols: cw, rows: ch, heights, textures, objects, smoothing };
  notify();
  return true;
}

export function pasteAt(col, row) {
  const cb = state.clipboard;
  if (!cb) return false;
  const t = state.tilemap;
  let anyChanged = false;
  for (let r = 0; r < cb.rows; r++) {
    for (let c = 0; c < cb.cols; c++) {
      const dc = col + c;
      const dr = row + r;
      if (dc < 0 || dc >= t.cols || dr < 0 || dr >= t.rows) continue;
      const src = r * cb.cols + c;
      const dst = dr * t.cols + dc;
      let cellChanged = false;
      if (t.heights[dst] !== cb.heights[src]) {
        t.heights[dst] = cb.heights[src];
        cellChanged = true;
      }
      if (t.textures[dst] !== cb.textures[src]) {
        t.textures[dst] = cb.textures[src];
        cellChanged = true;
      }
      const srcObj = cb.objects[src];
      // Object comparison: shallow-equal on (kind, storeys); cheaper
      // than a full deep diff and covers all the fields we care about.
      const dstObj = t.objects[dst];
      const objSame = !srcObj && !dstObj
        || (srcObj && dstObj && srcObj.kind === dstObj.kind && srcObj.storeys === dstObj.storeys);
      if (!objSame) {
        t.objects[dst] = srcObj ? { ...srcObj } : null;
        cellChanged = true;
      }
      if (t.smoothing && t.smoothing[dst] !== cb.smoothing[src]) {
        t.smoothing[dst] = cb.smoothing[src];
        cellChanged = true;
      }
      if (cellChanged) {
        markChunkDirty(dc, dr);
        anyChanged = true;
      }
    }
  }
  if (anyChanged) notify();
  return anyChanged;
}

/** Drop the clipboard. UI surface mostly for clarity. */
export function clearClipboard() {
  state.clipboard = null;
  notify();
}

// Undo stack común a todos los generadores (ciudad, militar, ...). Cada
// entrada lleva una closure `undo()` capturada por el generador y la lista
// de celdas a remarcar como dirty al restaurar. Tope alto: los snapshots
// son pequeños (solo guardamos las celdas tocadas).
const GENERATOR_UNDO_LIMIT = 32;
const generatorUndoStack = [];

function pushGeneratorUndo(entry) {
  generatorUndoStack.push(entry);
  if (generatorUndoStack.length > GENERATOR_UNDO_LIMIT) generatorUndoStack.shift();
}

/** Hay algo que deshacer del último generador ejecutado. */
export function canUndoGenerator() {
  return generatorUndoStack.length > 0;
}

/** Restaura el último snapshot de generador. No-op si la pila está vacía.
 *  Devuelve true si se aplicó un undo. */
export function undoGenerator() {
  const e = generatorUndoStack.pop();
  if (!e) return false;
  const dirty = e.undo();                       // restaura texturas/objetos
  if (Array.isArray(dirty)) {
    for (const { col, row } of dirty) markChunkDirty(col, row);
  }
  notify();
  return true;
}

/**
 * Run the city generator on the region under (col, row). The generator
 * itself is a pure function on the tilemap shape; this wrapper marks
 * each dirty cell's chunk so the 3D viewport rebuilds incrementally,
 * and notifies subscribers exactly once at the end.
 *
 * Returns the number of cells modified (0 when the seed is invalid:
 * submerged, on an object, or off-grid).
 *
 * The city generator currently doesn't expose an undo closure (kept the
 * minimal change here); to add it later, snapshot textures+objects inside
 * generateCityAt and push to generatorUndoStack the same way the military
 * one does.
 */
export function runCityGenerator(col, row) {
  // Snapshot before/after for undo. We diff the touched cells lazily by
  // capturing the full textures/objects ArrayBuffer-equivalent of cells
  // present in the resulting dirtyCells list. Cheaper than snapshotting
  // the entire tilemap and matches what undoGenerator() expects.
  const cellSnap = new Map();
  const before = (col, row) => {
    const i = row * state.tilemap.cols + col;
    if (cellSnap.has(i)) return;
    cellSnap.set(i, {
      tex: state.tilemap.textures[i],
      obj: state.tilemap.objects[i] ? { ...state.tilemap.objects[i] } : null,
    });
  };
  // Patch markChunkDirty for the duration of this call so we snapshot
  // each cell the generator dirties — but only the FIRST time we see it.
  // The generator may dirty a cell multiple times; only the pre-state
  // matters for undo. We do this without monkey-patching by intercepting
  // through the returned dirtyCells list AFTER the fact, comparing the
  // current state to whatever's there. Simpler: pre-snapshot via a copy.
  const tex0 = new Int8Array(state.tilemap.textures);
  const obj0 = state.tilemap.objects.slice();

  const { modified, dirtyCells } = generateCityAt(state.tilemap, col, row);
  if (modified === 0) return 0;

  for (const { col: cc, row: rr } of dirtyCells) markChunkDirty(cc, rr);

  // Build the undo entry from the pre/post diff over the actual dirtyCells.
  const uniqIdx = new Set();
  const undoCells = [];
  for (const { col: cc, row: rr } of dirtyCells) {
    const i = rr * state.tilemap.cols + cc;
    if (uniqIdx.has(i)) continue;
    uniqIdx.add(i);
    undoCells.push({ i, col: cc, row: rr, tex: tex0[i], obj: obj0[i] });
  }
  pushGeneratorUndo({
    undo: () => {
      for (const u of undoCells) {
        state.tilemap.textures[u.i] = u.tex;
        state.tilemap.objects[u.i] = u.obj;
      }
      return undoCells.map(u => ({ col: u.col, row: u.row }));
    },
  });

  notify();
  return modified;
}

/**
 * Run the military base generator on the region under (col, row). Same
 * lifecycle as runCityGenerator: snapshot pre-state, run the generator,
 * mark dirty chunks, push an undo entry, notify.
 *
 * Returns the number of cells modified (0 when the seed is invalid).
 */
export function runMilitaryGenerator(col, row) {
  // Snapshot heights too — the military generator now raises the
  // perimeter cells to build a defensive wall, so undo must restore
  // those heights along with textures and objects.
  const tex0 = new Int8Array(state.tilemap.textures);
  const obj0 = state.tilemap.objects.slice();
  const h0   = new Int16Array(state.tilemap.heights);

  const { modified, dirtyCells } = generateMilitaryAt(state.tilemap, col, row);
  if (modified === 0) return 0;

  for (const { col: cc, row: rr } of dirtyCells) markChunkDirty(cc, rr);

  const uniqIdx = new Set();
  const undoCells = [];
  for (const { col: cc, row: rr } of dirtyCells) {
    const i = rr * state.tilemap.cols + cc;
    if (uniqIdx.has(i)) continue;
    uniqIdx.add(i);
    undoCells.push({ i, col: cc, row: rr, tex: tex0[i], obj: obj0[i], h: h0[i] });
  }
  pushGeneratorUndo({
    undo: () => {
      for (const u of undoCells) {
        state.tilemap.textures[u.i] = u.tex;
        state.tilemap.objects[u.i] = u.obj;
        state.tilemap.heights[u.i] = u.h;
      }
      return undoCells.map(u => ({ col: u.col, row: u.row }));
    },
  });

  notify();
  return modified;
}

/**
 * Apply the active tool at cell (col, row). Idempotent within a stroke
 * for paint; additive for raise/lower (drag keeps raising).
 *
 * Painting with an object brush:
 *   - first click on an empty cell  → place the object.
 *   - click on a cell already holding the SAME kind → remove it.
 *   - click on a cell holding a DIFFERENT object → replace.
 *
 * Returns true if anything changed.
 */
export function applyToolAtCell(col, row) {
  const t = state.tilemap;
  if (col < 0 || col >= t.cols || row < 0 || row >= t.rows) return false;
  const i = row * t.cols + col;
  let changed = false;
  switch (state.tool) {
    case 'paint': {
      changed = applyPaintAtCell(col, row);
      break;
    }
    case 'rect': {
      // Single-click in rect mode is a no-op. The fill happens on
      // mouse-up via fillRect(). Marking changed=false avoids redraws.
      break;
    }
    case 'area': {
      // Same shape as 'rect': mouseup handler on the canvas calls
      // setPlayArea() with the drag bounds. Single-click is a no-op.
      break;
    }
    case 'raise': {
      t.heights[i] += state.heightDelta;
      changed = true;
      break;
    }
    case 'lower': {
      t.heights[i] -= state.heightDelta;
      if (t.heights[i] < SEA_LEVEL_H) {
        t.textures[i] = -1;
        t.objects[i] = null;  // submerged: objects vanish.
      }
      changed = true;
      break;
    }
    case 'smooth': {
      // Promedio sobre cuadro 3x3 centrado en la celda (la propia celda +
      // 8 vecinos: 4 ortogonales + 4 diagonales). Da una difusion mas
      // isotropa que la cruz de 5: las pendientes diagonales no quedan
      // mas afiladas que las cardinales.
      let sum = 0;
      let count = 0;
      for (let dr = -1; dr <= 1; dr++) {
        const rr = row + dr;
        if (rr < 0 || rr >= t.rows) continue;
        for (let dc = -1; dc <= 1; dc++) {
          const cc = col + dc;
          if (cc < 0 || cc >= t.cols) continue;
          sum += t.heights[rr * t.cols + cc];
          count++;
        }
      }
      const avg = Math.round(sum / count);
      if (avg !== t.heights[i]) { t.heights[i] = avg; changed = true; }
      break;
    }
    case 'extend': {
      // The first click of a stroke captures the cell's current height
      // as the target. Subsequent cells dragged over snap to that
      // height — handy for flattening or extending a plateau.
      if (state.extendTargetH == null) {
        state.extendTargetH = t.heights[i];
      } else if (t.heights[i] !== state.extendTargetH) {
        t.heights[i] = state.extendTargetH;
        // Submerging a cell strips its surface state, consistent with
        // the 'lower' tool.
        if (t.heights[i] < SEA_LEVEL_H) {
          t.textures[i] = -1;
          t.objects[i] = null;
        }
        changed = true;
      }
      break;
    }
    default:
      break;
  }
  if (changed) {
    markChunkDirty(col, row);
    notify();
  }
  return changed;
}

/** Called by the canvas when the mouse button is released. Clears
 *  per-stroke state so the next drag starts fresh. */
export function endStroke() {
  if (state.extendTargetH != null) {
    state.extendTargetH = null;
    // No notify — visual state didn't change, only intent.
  }
  if (state.strokeCells.size > 0) state.strokeCells.clear();
}
