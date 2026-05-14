import React, { useEffect, useRef, useCallback } from 'react';
import { PALETTE, SEA_LEVEL_H } from '../../shared/types.mjs';
import {
  subscribe,
  getTilemap,
  applyToolAtCell,
  getTool,
} from '../state/store.js';

/**
 * Top-down 2D editor for the tilemap. Draws each cell as a TILE_PX×TILE_PX
 * square coloured by texture (or water blue for submerged cells), tinted by
 * height (lighter = higher). Listens to mouse drag to apply the active tool.
 *
 * The canvas reads the live tilemap from the store — typed arrays mutate in
 * place, so we just redraw on every store revision and on each tool-applied
 * cell. No React reconciliation in the hot path.
 */
const TILE_PX = 10;

export function Canvas2D() {
  const canvasRef = useRef(null);
  const dragRef = useRef({ active: false, lastCell: null });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const t = getTilemap();
    const W = t.cols * TILE_PX;
    const H = t.rows * TILE_PX;
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#3a6da5'; // water default
    ctx.fillRect(0, 0, W, H);

    for (let row = 0; row < t.rows; row++) {
      for (let col = 0; col < t.cols; col++) {
        const i = row * t.cols + col;
        const h = t.heights[i];
        const texIdx = t.textures[i];

        let baseColor;
        if (h < SEA_LEVEL_H) {
          // Submerged: shade water by depth (deeper = darker).
          const depth = Math.min(8, SEA_LEVEL_H - h);
          const shade = Math.max(0, 100 - depth * 8);
          baseColor = `rgb(40, ${80 + shade * 0.4}, ${130 + shade * 0.5})`;
        } else if (texIdx >= 0 && texIdx < PALETTE.length) {
          baseColor = PALETTE[texIdx].color;
        } else {
          baseColor = '#5b6066';
        }
        ctx.fillStyle = baseColor;
        ctx.fillRect(col * TILE_PX, row * TILE_PX, TILE_PX, TILE_PX);

        // Subtle height shading for emerged cells: lighter as we go higher.
        if (h >= SEA_LEVEL_H && h > 0) {
          const a = Math.min(0.35, h * 0.04);
          ctx.fillStyle = `rgba(255,255,255,${a})`;
          ctx.fillRect(col * TILE_PX, row * TILE_PX, TILE_PX, TILE_PX);
        }
      }
    }

    // Grid lines every 8 cells (= 512u) for orientation. Skip for small grids.
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let c = 0; c <= t.cols; c += 8) {
      ctx.beginPath();
      ctx.moveTo(c * TILE_PX + 0.5, 0);
      ctx.lineTo(c * TILE_PX + 0.5, H);
      ctx.stroke();
    }
    for (let r = 0; r <= t.rows; r += 8) {
      ctx.beginPath();
      ctx.moveTo(0, r * TILE_PX + 0.5);
      ctx.lineTo(W, r * TILE_PX + 0.5);
      ctx.stroke();
    }
  }, []);

  useEffect(() => {
    draw();
    const off = subscribe(draw);
    return off;
  }, [draw]);

  const cellFromEvent = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const col = Math.floor(x / TILE_PX);
    const row = Math.floor(y / TILE_PX);
    return { col, row };
  }, []);

  const onMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    dragRef.current.active = true;
    dragRef.current.lastCell = null;
    const { col, row } = cellFromEvent(e);
    applyToolAtCell(col, row);
    dragRef.current.lastCell = `${col},${row}`;
  }, [cellFromEvent]);

  const onMouseMove = useCallback((e) => {
    if (!dragRef.current.active) return;
    const { col, row } = cellFromEvent(e);
    const key = `${col},${row}`;
    if (key === dragRef.current.lastCell) return;
    dragRef.current.lastCell = key;
    applyToolAtCell(col, row);
  }, [cellFromEvent]);

  const onMouseUp = useCallback(() => {
    dragRef.current.active = false;
    dragRef.current.lastCell = null;
  }, []);

  useEffect(() => {
    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
  }, [onMouseUp]);

  return (
    <div className="canvas2d-wrap">
      <canvas
        ref={canvasRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}
