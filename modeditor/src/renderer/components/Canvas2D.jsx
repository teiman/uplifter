import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Button, ButtonGroup } from '@blueprintjs/core';
import { PALETTE, SEA_LEVEL_H, OBJECT_BY_KIND } from '../../shared/types.mjs';
import {
  subscribe,
  getTilemap,
  applyToolAtCell,
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
        // Trigger a render-cycle to flush the redraw effect below.
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

    const waterImg = TEXTURE_IMAGES[PALETTE.findIndex(p => p.id === 'agua')];
    for (let row = row0; row < row1; row++) {
      const sy = Math.round((row - view.offsetCellY) * tile);
      for (let col = col0; col < col1; col++) {
        const i = row * t.cols + col;
        const h = t.heights[i];
        const texIdx = t.textures[i];
        const sx = Math.round((col - view.offsetCellX) * tile);

        if (h < SEA_LEVEL_H) {
          // Submerged: water texture if available, else shaded blue.
          if (waterImg) {
            ctx.drawImage(waterImg, sx, sy, tile, tile);
            // Depth tint on top: deeper = darker.
            const depth = Math.min(8, SEA_LEVEL_H - h);
            const a = depth * 0.06;
            if (a > 0) {
              ctx.fillStyle = `rgba(0, 0, 30, ${a})`;
              ctx.fillRect(sx, sy, tile, tile);
            }
          } else {
            const depth = Math.min(8, SEA_LEVEL_H - h);
            const shade = Math.max(0, 100 - depth * 8);
            ctx.fillStyle = `rgb(40, ${80 + shade * 0.4}, ${130 + shade * 0.5})`;
            ctx.fillRect(sx, sy, tile, tile);
          }
        } else {
          const img = (texIdx >= 0 && texIdx < PALETTE.length) ? TEXTURE_IMAGES[texIdx] : null;
          if (img) {
            ctx.drawImage(img, sx, sy, tile, tile);
          } else {
            // Fallback: palette colour while the image hasn't loaded yet,
            // or for emerged-but-unpainted cells.
            ctx.fillStyle = (texIdx >= 0 && texIdx < PALETTE.length)
              ? PALETTE[texIdx].color
              : '#5b6066';
            ctx.fillRect(sx, sy, tile, tile);
          }
        }

        // Height shading on top of emerged cells.
        if (h >= SEA_LEVEL_H && h > 0) {
          const a = Math.min(0.35, h * 0.04);
          ctx.fillStyle = `rgba(255,255,255,${a})`;
          ctx.fillRect(sx, sy, tile, tile);
        }

        // Cliff outlines: draw a stroke along each side where the
        // neighbour cell is LOWER than this one. The neighbour draws
        // its own outline on the other side, so we never double-up.
        // Cells outside the grid count as "submerged" (-1), so the map
        // perimeter gets a natural outline against the ocean.
        if (h >= SEA_LEVEL_H) {
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

        // Object marker: a small filled disc tinted by the object's
        // colour, plus its glyph when the tile is big enough to read it.
        const obj = t.objects[i];
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
  }, []);

  // Redraw on store changes AND on container resize. imageRev is in the
  // dep array so each texture-load triggers an extra redraw with the
  // freshly available image.
  useEffect(() => {
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

  // ---------- paint / pan ----------
  // Middle button = pan. Left button = apply current tool.
  const onMouseDown = useCallback((e) => {
    if (e.button === 1) {
      dragRef.current.active = 'pan';
      dragRef.current.lastX = e.clientX;
      dragRef.current.lastY = e.clientY;
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    dragRef.current.active = 'paint';
    dragRef.current.lastCell = null;
    const { col, row } = cellFromEvent(e);
    applyToolAtCell(col, row);
    dragRef.current.lastCell = `${col},${row}`;
  }, [cellFromEvent]);

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
    if (dragRef.current.active !== 'paint') return;
    const { col, row } = cellFromEvent(e);
    const key = `${col},${row}`;
    if (key === dragRef.current.lastCell) return;
    dragRef.current.lastCell = key;
    applyToolAtCell(col, row);
  }, [cellFromEvent, draw]);

  const onMouseUp = useCallback(() => {
    dragRef.current.active = false;
    dragRef.current.lastCell = null;
  }, []);

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
        onMouseMove={onMouseMove}
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
