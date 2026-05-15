import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Button, ButtonGroup } from '@blueprintjs/core';
import {
  PALETTE, SEA_LEVEL_H, OBJECT_BY_KIND,
  REGION_GRID, regionBounds, regionOfCell,
} from '../../shared/types.mjs';
import {
  subscribe,
  getTilemap,
  applyToolAtCell,
  endStroke,
  getMode,
  fillRect,
  setPlayArea,
  clearPlayArea,
  takePendingFocusCell,
  setView2dCenter,
} from '../state/store.js';

/** Same as LeftPanel: per-palette-id PNG URL from Vite. */
const PREVIEW_URLS = (() => {
  const mods = import.meta.glob('../assets/textures/*.png', { eager: true, query: '?url', import: 'default' });
  const byId = {};
  for (const [p, url] of Object.entries(mods)) {
    const name = p.split('/').pop().replace(/\.png$/, '');
    byId[name] = url;
  }
  return byId;
})();

/** Decoded HTMLImageElement per palette index — populated as images load. */
const TEXTURE_IMAGES = (() => {
  const arr = new Array(PALETTE.length).fill(null);
  return arr;
})();

/** Standalone water texture image. 'agua' is not in PALETTE anymore (it's
 *  a height concept, not a paint surface), but the 2D editor still uses
 *  the wavy water texture for submerged cells. Lazy-loaded once. */
let WATER_IMAGE = null;

/**
 * Top-down 2D editor. Pixels per cell is dynamic (zoom), centred on the
 * cursor when wheeling. We keep the canvas a fixed render-target size and
 * draw the *visible* slice of the tilemap into it, so big grids (470×470)
 * don't blow up memory or hit canvas-size caps.
 */
const ZOOM_LEVELS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48];
const DEFAULT_ZOOM_IDX = 5;        // → 8 px/cell, matches the previous default
const MIN_ZOOM_IDX = 0;
const MAX_ZOOM_IDX = ZOOM_LEVELS.length - 1;

function clampZoomIdx(idx) {
  return Math.max(MIN_ZOOM_IDX, Math.min(MAX_ZOOM_IDX, idx));
}

export function Canvas2D() {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const dragRef = useRef({ active: false, lastCell: null });
  // Region under the cursor while in area mode; drives the hover
  // highlight overlay. Kept as a ref (not state) because we redraw
  // imperatively and don't need React re-renders.
  const hoverRegionRef = useRef(null);
  // Bumps each time an image finishes loading so the canvas redraws with
  // the freshly available texture.
  const [imageRev, setImageRev] = useState(0);

  // View transform: zoom (px/cell) + pan (top-left cell offset, fractional
  // for smooth wheel zoom centred on cursor).
  const viewRef = useRef({
    zoomIdx: DEFAULT_ZOOM_IDX,
    offsetCellX: 0,         // first cell visible at left edge
    offsetCellY: 0,         // first cell visible at top edge
  });

  // Lazy-load the texture images once per component lifetime. The shared
  // TEXTURE_IMAGES array survives unmounts, so re-mounting is cheap.
  useEffect(() => {
    let cancelled = false;
    for (let i = 0; i < PALETTE.length; i++) {
      if (TEXTURE_IMAGES[i]) continue;
      const url = PREVIEW_URLS[PALETTE[i].id];
      if (!url) continue;
      const img = new Image();
      img.src = url;
      img.onload = () => {
        if (cancelled) return;
        TEXTURE_IMAGES[i] = img;
        setImageRev((n) => n + 1);
      };
    }
    if (!WATER_IMAGE && PREVIEW_URLS.agua) {
      const img = new Image();
      img.src = PREVIEW_URLS.agua;
      img.onload = () => {
        if (cancelled) return;
        WATER_IMAGE = img;
        setImageRev((n) => n + 1);
      };
    }
    return () => { cancelled = true; };
  }, []);
  // Re-render trigger for the React subtree (so the "x%" label updates).
  const [, setZoomRev] = useState(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const t = getTilemap();
    const view = viewRef.current;
    const tile = ZOOM_LEVELS[view.zoomIdx];

    // Canvas = full size of its viewport wrapper.
    const W = wrap.clientWidth;
    const H = wrap.clientHeight;
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;

    // Mirror the cell at the centre of the viewport to the store so a
    // future switch to 3D can recenter the camera there. Silent write.
    setView2dCenter(
      Math.floor(view.offsetCellX + W / (2 * tile)),
      Math.floor(view.offsetCellY + H / (2 * tile)),
    );
    const ctx = canvas.getContext('2d');
    // Crisp upscaling for pixel-art textures.
    ctx.imageSmoothingEnabled = false;

    // Background fill: water blue. Anything beyond the grid stays this colour,
    // which matches the "rest of the world is ocean" mental model.
    ctx.fillStyle = '#3a6da5';
    ctx.fillRect(0, 0, W, H);

    // Visible cell range. Round outward so we paint partial edge cells fully.
    const col0 = Math.max(0, Math.floor(view.offsetCellX));
    const row0 = Math.max(0, Math.floor(view.offsetCellY));
    const col1 = Math.min(t.cols, Math.ceil(view.offsetCellX + W / tile));
    const row1 = Math.min(t.rows, Math.ceil(view.offsetCellY + H / tile));

    // Cell stride: at low zoom levels we sample one cell per `step` cells
    // and paint a step×step block with its colour. Keeps the per-frame
    // draw-call count below ~50k regardless of grid size.
    // tile=4  → step=1  (one draw per cell)
    // tile=2  → step=2  (one draw per 2×2 cells)
    // tile=1  → step=4
    // tile<1  → bigger steps proportionally
    const step = Math.max(1, Math.ceil(4 / tile));
    // For sub-pixel-sized cells we still want each block to cover at
    // least 1×1 pixel on screen.
    const blockPx = Math.max(1, Math.round(step * tile));
    // Pre-resolve water texture (only used at fine zoom; at coarse zoom
    // submerged cells get a flat tinted fillRect).
    const waterImg = WATER_IMAGE;
    const useTextures = step === 1;

    for (let row = row0; row < row1; row += step) {
      const sy = Math.round((row - view.offsetCellY) * tile);
      for (let col = col0; col < col1; col += step) {
        const i = row * t.cols + col;
        const h = t.heights[i];
        const texIdx = t.textures[i];
        const sx = Math.round((col - view.offsetCellX) * tile);

        if (h < SEA_LEVEL_H) {
          // Submerged. Use the water texture only when we're not
          // stepping (it'd be wasted GPU work to drawImage 64×64 PNGs
          // into single-pixel blocks). At coarse zoom, flat tinted
          // fillRects are 10–50× faster and visually equivalent.
          if (useTextures && waterImg) {
            ctx.drawImage(waterImg, sx, sy, blockPx, blockPx);
            const depth = Math.min(8, SEA_LEVEL_H - h);
            const a = depth * 0.06;
            if (a > 0) {
              ctx.fillStyle = `rgba(0, 0, 30, ${a})`;
              ctx.fillRect(sx, sy, blockPx, blockPx);
            }
          } else {
            const depth = Math.min(8, SEA_LEVEL_H - h);
            const shade = Math.max(0, 100 - depth * 8);
            ctx.fillStyle = `rgb(40, ${80 + shade * 0.4}, ${130 + shade * 0.5})`;
            ctx.fillRect(sx, sy, blockPx, blockPx);
          }
        } else {
          const img = (useTextures && texIdx >= 0 && texIdx < PALETTE.length)
            ? TEXTURE_IMAGES[texIdx] : null;
          if (img) {
            ctx.drawImage(img, sx, sy, blockPx, blockPx);
          } else {
            // Flat palette colour at coarse zoom, or fallback while the
            // image hasn't loaded yet, or for emerged-but-unpainted cells.
            ctx.fillStyle = (texIdx >= 0 && texIdx < PALETTE.length)
              ? PALETTE[texIdx].color
              : '#5b6066';
            ctx.fillRect(sx, sy, blockPx, blockPx);
          }
        }

        // Height shading on top of emerged cells.
        if (h >= SEA_LEVEL_H && h > 0) {
          const a = Math.min(0.35, h * 0.04);
          ctx.fillStyle = `rgba(255,255,255,${a})`;
          ctx.fillRect(sx, sy, blockPx, blockPx);
        }

        // Cliff outlines: only at fine zoom (step=1). At coarse zoom we
        // sampled cells, so outlines based on per-cell neighbour height
        // wouldn't be representative anyway, and the lines would
        // dominate the visual at this scale.
        if (useTextures && h >= SEA_LEVEL_H) {
          const neighbour = (cc, rr) => {
            if (cc < 0 || cc >= t.cols || rr < 0 || rr >= t.rows) return -1;
            return t.heights[rr * t.cols + cc];
          };
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
          ctx.lineWidth = Math.max(1, Math.round(tile / 16));
          // Inset half a line-width so the stroke sits inside the cell.
          const o = ctx.lineWidth / 2;
          // West (col - 1).
          if (neighbour(col - 1, row) < h) {
            ctx.beginPath();
            ctx.moveTo(sx + o, sy);
            ctx.lineTo(sx + o, sy + tile);
            ctx.stroke();
          }
          // East (col + 1).
          if (neighbour(col + 1, row) < h) {
            ctx.beginPath();
            ctx.moveTo(sx + tile - o, sy);
            ctx.lineTo(sx + tile - o, sy + tile);
            ctx.stroke();
          }
          // North (row - 1).
          if (neighbour(col, row - 1) < h) {
            ctx.beginPath();
            ctx.moveTo(sx,        sy + o);
            ctx.lineTo(sx + tile, sy + o);
            ctx.stroke();
          }
          // South (row + 1).
          if (neighbour(col, row + 1) < h) {
            ctx.beginPath();
            ctx.moveTo(sx,        sy + tile - o);
            ctx.lineTo(sx + tile, sy + tile - o);
            ctx.stroke();
          }
        }

        // Object marker: skip entirely at coarse zoom — the minimum disc
        // radius (2 px) would be bigger than the block itself and make
        // the map unreadable.
        const obj = useTextures ? t.objects[i] : null;
        if (obj) {
          const meta = OBJECT_BY_KIND.get(obj.kind);
          if (meta) {
            const cx = sx + tile / 2;
            const cy = sy + tile / 2;
            const r = Math.max(2, tile * 0.32);
            ctx.fillStyle = meta.color;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,0.6)';
            ctx.lineWidth = 1;
            ctx.stroke();
            if (tile >= 12) {
              ctx.fillStyle = 'rgba(0,0,0,0.85)';
              ctx.font = `${Math.round(tile * 0.55)}px serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(meta.glyph, cx, cy + 1);
            }
          }
        }
      }
    }

    // Playable area mask: cells outside the area are hidden in editing
    // modes (paint/height/rect) so the user only sees the region they
    // selected — matches the 3D viewport's behaviour. In area-select
    // mode we keep the dim translucent so the rest of the map stays
    // visible while picking another region.
    if (t.playArea) {
      const a = t.playArea;
      const ax0 = Math.round((a.c0     - view.offsetCellX) * tile);
      const ay0 = Math.round((a.r0     - view.offsetCellY) * tile);
      const ax1 = Math.round((a.c1 + 1 - view.offsetCellX) * tile);
      const ay1 = Math.round((a.r1 + 1 - view.offsetCellY) * tile);
      const isAreaMode = getMode() === 'area';
      // Opaque app-bg colour in editing modes; translucent black in
      // area-select mode so the user can still see other regions.
      ctx.fillStyle = isAreaMode
        ? (a.restrict ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.18)')
        : '#1c2127';
      if (ay0 > 0)         ctx.fillRect(0, 0, W, ay0);
      if (ay1 < H)         ctx.fillRect(0, ay1, W, H - ay1);
      const innerTop  = Math.max(0, ay0);
      const innerBot  = Math.min(H, ay1);
      const innerH   = innerBot - innerTop;
      if (innerH > 0) {
        if (ax0 > 0)       ctx.fillRect(0, innerTop, ax0, innerH);
        if (ax1 < W)       ctx.fillRect(ax1, innerTop, W - ax1, innerH);
      }
      // Outline.
      ctx.strokeStyle = a.restrict ? 'rgba(255,220,80,0.95)' : 'rgba(180,200,255,0.8)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 4]);
      ctx.strokeRect(ax0 + 0.5, ay0 + 0.5, ax1 - ax0 - 1, ay1 - ay0 - 1);
      ctx.setLineDash([]);
    }

    // Grid lines every 8 cells, but only drawn if the gap is wide enough to
    // not look noisy. At tile=1 we'd be drawing every 8 pixels — fine; at
    // tile=48 every 384 px — also fine. Keep it always on for now.
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    const gridStep = tile * 8;
    const firstGridX = Math.ceil(view.offsetCellX / 8) * 8;
    const firstGridY = Math.ceil(view.offsetCellY / 8) * 8;
    for (let c = firstGridX; c <= t.cols; c += 8) {
      const sx = Math.round((c - view.offsetCellX) * tile) + 0.5;
      if (sx < 0 || sx > W) continue;
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, H);
      ctx.stroke();
    }
    for (let r = firstGridY; r <= t.rows; r += 8) {
      const sy = Math.round((r - view.offsetCellY) * tile) + 0.5;
      if (sy < 0 || sy > H) continue;
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(W, sy);
      ctx.stroke();
    }

    // Region grid overlay (only in area mode). Drawn as bright lines at
    // the REGION_GRID boundaries so the user can see exactly which cell
    // group each click will pick, plus a hover highlight on the region
    // under the cursor.
    if (getMode() === 'area') {
      ctx.strokeStyle = 'rgba(255, 220, 80, 0.55)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= REGION_GRID; i++) {
        const cellCol = Math.floor(i * t.cols / REGION_GRID);
        const sx = Math.round((cellCol - view.offsetCellX) * tile) + 0.5;
        if (sx >= 0 && sx <= W) {
          ctx.beginPath();
          ctx.moveTo(sx, 0);
          ctx.lineTo(sx, H);
          ctx.stroke();
        }
        const cellRow = Math.floor(i * t.rows / REGION_GRID);
        const sy = Math.round((cellRow - view.offsetCellY) * tile) + 0.5;
        if (sy >= 0 && sy <= H) {
          ctx.beginPath();
          ctx.moveTo(0, sy);
          ctx.lineTo(W, sy);
          ctx.stroke();
        }
      }
      const hr = hoverRegionRef.current;
      if (hr) {
        const b = regionBounds(t.cols, t.rows, hr.rcol, hr.rrow);
        const sel = t.playArea
          && t.playArea.c0 === b.c0 && t.playArea.r0 === b.r0
          && t.playArea.c1 === b.c1 && t.playArea.r1 === b.r1;
        const x0 = (b.c0     - view.offsetCellX) * tile;
        const y0 = (b.r0     - view.offsetCellY) * tile;
        const x1 = (b.c1 + 1 - view.offsetCellX) * tile;
        const y1 = (b.r1 + 1 - view.offsetCellY) * tile;
        // Reddish tint when hovering the already-selected region, since
        // a click there will clear the selection.
        ctx.fillStyle = sel ? 'rgba(255, 100, 100, 0.18)' : 'rgba(255, 220, 80, 0.18)';
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
    }

    // Player spawn marker. Drawn last so it sits on top of objects and
    // grid lines. Singleton: at most one per map.
    if (t.spawn && typeof t.spawn.col === 'number' && typeof t.spawn.row === 'number') {
      const sx = Math.round((t.spawn.col - view.offsetCellX) * tile);
      const sy = Math.round((t.spawn.row - view.offsetCellY) * tile);
      const size = Math.max(8, tile);
      const cx = sx + size / 2;
      const cy = sy + size / 2;
      // Outer ring + inner solid disc + glyph.
      ctx.fillStyle = 'rgba(255, 80, 80, 0.85)';
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(4, tile * 0.45), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.lineWidth = 2;
      ctx.stroke();
      if (tile >= 10) {
        ctx.fillStyle = 'white';
        ctx.font = `bold ${Math.round(tile * 0.6)}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('♟', cx, cy + 1);
      }
    }

    // Drag overlay for the rect-fill tool.
    if (dragRef.current.active === 'rect' && dragRef.current.rectStart) {
      const a = dragRef.current.rectStart;
      const b = dragRef.current.rectEnd;
      const cMin = Math.min(a.col, b.col);
      const cMax = Math.max(a.col, b.col);
      const rMin = Math.min(a.row, b.row);
      const rMax = Math.max(a.row, b.row);
      const x0 = (cMin     - view.offsetCellX) * tile;
      const y0 = (rMin     - view.offsetCellY) * tile;
      const x1 = (cMax + 1 - view.offsetCellX) * tile;
      const y1 = (rMax + 1 - view.offsetCellY) * tile;
      ctx.fillStyle   = 'rgba(80, 160, 255, 0.18)';
      ctx.strokeStyle = 'rgba(120, 200, 255, 0.95)';
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
      ctx.setLineDash([]);
    }
  }, []);

  // Redraw on store changes AND on container resize. imageRev is in the
  // dep array so each texture-load triggers an extra redraw with the
  // freshly available image.
  useEffect(() => {
    // If we just returned from 3D mode, recenter on the cell that was
    // under the 3D camera target. Has to happen before the first draw
    // so the user never sees the old offset flash.
    const focus = takePendingFocusCell();
    if (focus && wrapRef.current) {
      const tile = ZOOM_LEVELS[viewRef.current.zoomIdx];
      const W = wrapRef.current.clientWidth;
      const H = wrapRef.current.clientHeight;
      viewRef.current.offsetCellX = focus.col + 0.5 - W / (2 * tile);
      viewRef.current.offsetCellY = focus.row + 0.5 - H / (2 * tile);
    }
    draw();
    const off = subscribe(draw);
    const ro = new ResizeObserver(draw);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => { off(); ro.disconnect(); };
  }, [draw, imageRev]);

  const cellFromEvent = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const tile = ZOOM_LEVELS[viewRef.current.zoomIdx];
    const col = Math.floor(viewRef.current.offsetCellX + x / tile);
    const row = Math.floor(viewRef.current.offsetCellY + y / tile);
    return { col, row };
  }, []);

  // ---------- zoom ----------
  // Centred on the cursor: the cell under the cursor stays put while the
  // zoom level changes. Standard top-down-editor behaviour.
  const zoomAt = useCallback((newIdx, anchorX, anchorY) => {
    const view = viewRef.current;
    newIdx = clampZoomIdx(newIdx);
    if (newIdx === view.zoomIdx) return;
    const oldTile = ZOOM_LEVELS[view.zoomIdx];
    const newTile = ZOOM_LEVELS[newIdx];
    // Cell coords under the anchor point before zoom.
    const cellX = view.offsetCellX + anchorX / oldTile;
    const cellY = view.offsetCellY + anchorY / oldTile;
    // New offset so the same cell stays under the anchor.
    view.offsetCellX = cellX - anchorX / newTile;
    view.offsetCellY = cellY - anchorY / newTile;
    view.zoomIdx = newIdx;
    setZoomRev((n) => n + 1);
    draw();
  }, [draw]);

  const onWheel = useCallback((e) => {
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const ax = e.clientX - rect.left;
    const ay = e.clientY - rect.top;
    const dir = e.deltaY < 0 ? +1 : -1;
    zoomAt(viewRef.current.zoomIdx + dir, ax, ay);
  }, [zoomAt]);

  // Wheel needs a non-passive listener on the canvas so preventDefault works.
  // React's onWheel is passive on some browser/Electron versions; attach
  // imperatively to be sure.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  const zoomIn = useCallback(() => {
    const w = wrapRef.current;
    if (!w) return;
    zoomAt(viewRef.current.zoomIdx + 1, w.clientWidth / 2, w.clientHeight / 2);
  }, [zoomAt]);
  const zoomOut = useCallback(() => {
    const w = wrapRef.current;
    if (!w) return;
    zoomAt(viewRef.current.zoomIdx - 1, w.clientWidth / 2, w.clientHeight / 2);
  }, [zoomAt]);
  const zoomFit = useCallback(() => {
    const w = wrapRef.current;
    if (!w) return;
    const t = getTilemap();
    const px = Math.min(w.clientWidth / t.cols, w.clientHeight / t.rows);
    // Pick the largest preset that still fits.
    let idx = MIN_ZOOM_IDX;
    for (let i = MAX_ZOOM_IDX; i >= MIN_ZOOM_IDX; i--) {
      if (ZOOM_LEVELS[i] <= px) { idx = i; break; }
    }
    const tile = ZOOM_LEVELS[idx];
    // Centre the grid in the viewport.
    viewRef.current.zoomIdx = idx;
    viewRef.current.offsetCellX = (t.cols - w.clientWidth / tile) / 2;
    viewRef.current.offsetCellY = (t.rows - w.clientHeight / tile) / 2;
    setZoomRev((n) => n + 1);
    draw();
  }, [draw]);

  // ---------- paint / pan / rect ----------
  // Middle or right button = pan the viewport. Left button: paint
  // (mode=paint/height) or sweep a rectangle (mode=rect/area).
  // The right-click context menu is suppressed below.
  const onMouseDown = useCallback((e) => {
    if (e.button === 1 || e.button === 2) {
      dragRef.current.active = 'pan';
      dragRef.current.lastX = e.clientX;
      dragRef.current.lastY = e.clientY;
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    if (getMode() === 'rect') {
      // Start a rect-select drag. The rect lives in cell-coords and is
      // drawn as an overlay every frame; the actual fill runs on mouseup.
      const { col, row } = cellFromEvent(e);
      dragRef.current.active = 'rect';
      dragRef.current.rectStart = { col, row };
      dragRef.current.rectEnd   = { col, row };
      draw();
      return;
    }
    if (getMode() === 'area') {
      // Click selects the region under the cursor; clicking the
      // already-selected region clears it. No drag — the gesture is a
      // single click. Restrict/strict flags persist across picks.
      const t = getTilemap();
      const { col, row } = cellFromEvent(e);
      const r = regionOfCell(t.cols, t.rows, col, row);
      if (!r) return;
      const pa = t.playArea;
      const same = pa
        && pa.c0 === Math.floor(r.rcol * t.cols / REGION_GRID)
        && pa.r0 === Math.floor(r.rrow * t.rows / REGION_GRID);
      if (same) {
        clearPlayArea();
      } else {
        const b = regionBounds(t.cols, t.rows, r.rcol, r.rrow);
        const keepRestrict = pa?.restrict ?? true;
        const keepStrict   = pa?.strict   ?? true;
        setPlayArea(b.c0, b.r0, b.c1, b.r1, keepRestrict, keepStrict);
      }
      return;
    }
    dragRef.current.active = 'paint';
    dragRef.current.lastCell = null;
    const { col, row } = cellFromEvent(e);
    applyToolAtCell(col, row);
    dragRef.current.lastCell = `${col},${row}`;
  }, [cellFromEvent, draw]);

  const onMouseMove = useCallback((e) => {
    if (dragRef.current.active === 'pan') {
      const tile = ZOOM_LEVELS[viewRef.current.zoomIdx];
      viewRef.current.offsetCellX -= (e.clientX - dragRef.current.lastX) / tile;
      viewRef.current.offsetCellY -= (e.clientY - dragRef.current.lastY) / tile;
      dragRef.current.lastX = e.clientX;
      dragRef.current.lastY = e.clientY;
      draw();
      return;
    }
    if (dragRef.current.active === 'rect') {
      const { col, row } = cellFromEvent(e);
      const end = dragRef.current.rectEnd;
      if (col === end.col && row === end.row) return;
      dragRef.current.rectEnd = { col, row };
      draw();
      return;
    }
    // Area-mode hover: update the highlighted region and redraw. Done
    // outside the drag check because there's no drag in area mode —
    // every move is just a hover update.
    if (getMode() === 'area') {
      const t = getTilemap();
      const { col, row } = cellFromEvent(e);
      const r = regionOfCell(t.cols, t.rows, col, row);
      const prev = hoverRegionRef.current;
      if ((!prev && r) || (prev && !r)
          || (prev && r && (prev.rcol !== r.rcol || prev.rrow !== r.rrow))) {
        hoverRegionRef.current = r;
        draw();
      }
      return;
    }
    if (dragRef.current.active !== 'paint') return;
    const { col, row } = cellFromEvent(e);
    const key = `${col},${row}`;
    if (key === dragRef.current.lastCell) return;
    dragRef.current.lastCell = key;
    applyToolAtCell(col, row);
  }, [cellFromEvent, draw]);

  // Mousemove on window, not the canvas: panning/painting with the
  // cursor briefly off the canvas (onto side panels or outside the
  // window) would otherwise drop events mid-gesture.
  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    return () => window.removeEventListener('mousemove', onMouseMove);
  }, [onMouseMove]);

  const onMouseUp = useCallback(() => {
    if (dragRef.current.active === 'rect') {
      const a = dragRef.current.rectStart;
      const b = dragRef.current.rectEnd;
      if (a && b) fillRect(a.col, a.row, b.col, b.row);
      dragRef.current.rectStart = null;
      dragRef.current.rectEnd = null;
    }
    dragRef.current.active = false;
    dragRef.current.lastCell = null;
    endStroke();
  }, []);

  // Esc cancels an in-flight rect drag without committing.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && dragRef.current.active === 'rect') {
        dragRef.current.active = false;
        dragRef.current.rectStart = null;
        dragRef.current.rectEnd = null;
        draw();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [draw]);

  // WASD pans in cells/sec, not pixels/sec — speed tracks world
  // distance instead of screen distance, so zooming in doesn't slow
  // the traversal of the map.
  useEffect(() => {
    const keys = { w: false, a: false, s: false, d: false };
    const isEditable = (el) => {
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    };
    const onDown = (e) => {
      if (e.repeat) return;
      if (isEditable(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === 'w' || k === 'a' || k === 's' || k === 'd') {
        keys[k] = true;
        e.preventDefault();
      }
    };
    const onUp = (e) => {
      const k = e.key.toLowerCase();
      if (k in keys) keys[k] = false;
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);

    let raf = 0;
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const dx = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
      const dy = (keys.s ? 1 : 0) - (keys.w ? 1 : 0);
      if (dx !== 0 || dy !== 0) {
        // 24 cells/sec feels like a comfortable pace at default zoom;
        // covers a 470-cell map in ~20s of continuous hold.
        const speed = 24;
        viewRef.current.offsetCellX += dx * speed * dt;
        viewRef.current.offsetCellY += dy * speed * dt;
        draw();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, [draw]);

  useEffect(() => {
    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
  }, [onMouseUp]);

  const zoomPct = Math.round(ZOOM_LEVELS[viewRef.current.zoomIdx] * 10);

  return (
    <div className="canvas2d-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        onMouseDown={onMouseDown}
        onContextMenu={(e) => e.preventDefault()}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
      <div className="canvas2d-zoom">
        <ButtonGroup minimal>
          <Button icon="zoom-out" onClick={zoomOut} />
          <Button onClick={zoomFit} title="Encajar (F)">{zoomPct}%</Button>
          <Button icon="zoom-in" onClick={zoomIn} />
        </ButtonGroup>
      </div>
    </div>
  );
}
