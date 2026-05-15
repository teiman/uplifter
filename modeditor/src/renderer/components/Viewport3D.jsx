import React, { useEffect, useRef, useCallback } from 'react';
import {
  getTilemap, getTool, getIsoYawIdx,
} from '../state/store.js';
import {
  buildChunk, buildWater, chunkCounts, SKY_COLOR,
} from '../state/scene3d.js';
import {
  WORLD_HALF, SEA_LEVEL_Z, SEA_LEVEL_H,
  CELL_SIZE, HEIGHT_UNIT, BEDROCK_TOP_Z,
  MESH_CHUNK_SIZE,
} from '../../shared/types.mjs';
import { drainDirty3dChunks, takeFullRebuildRequest, setCamera3dTarget, takePendingFocus3dTarget } from '../state/store.js';

const VS = `#version 300 es
in vec3 a_pos;
in vec3 a_normal;
in vec3 a_color;

uniform mat4 u_viewProj;

out vec3 v_normal;
out vec3 v_color;

void main() {
  gl_Position = u_viewProj * vec4(a_pos, 1.0);
  v_normal = a_normal;
  v_color = a_color;
}
`;

const FS = `#version 300 es
precision highp float;
in vec3 v_normal;
in vec3 v_color;
out vec4 frag;

uniform vec3 u_sunDir;     // unit vector, from surface toward sun
uniform vec3 u_skyColor;

void main() {
  // Lambert + small ambient.
  float lambert = max(dot(normalize(v_normal), normalize(u_sunDir)), 0.0);
  float ambient = 0.35;
  vec3 col = v_color * (ambient + (1.0 - ambient) * lambert);
  // Cheap distance fade toward sky colour for atmosphere.
  frag = vec4(col, 1.0);
}
`;

/** Matrix utilities. Column-major 4x4 stored as length-16 Float32Array. */
function mat4Identity() {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}
function mat4Perspective(fovYRad, aspect, near, far) {
  const f = 1 / Math.tan(fovYRad / 2);
  const m = new Float32Array(16);
  m[0]  = f / aspect;
  m[5]  = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

/** Orthographic projection. Parallel lines stay parallel; the world
 *  doesn't shrink with distance. Used for the iso view. */
function mat4Ortho(left, right, bottom, top, near, far) {
  const m = new Float32Array(16);
  m[0]  = 2 / (right - left);
  m[5]  = 2 / (top - bottom);
  m[10] = -2 / (far - near);
  m[12] = -(right + left) / (right - left);
  m[13] = -(top + bottom) / (top - bottom);
  m[14] = -(far + near)   / (far - near);
  m[15] = 1;
  return m;
}
function mat4LookAt(eye, target, up) {
  const [ex, ey, ez] = eye;
  const [tx, ty, tz] = target;
  let zx = ex - tx, zy = ey - ty, zz = ez - tz;
  let zl = Math.hypot(zx, zy, zz) || 1; zx /= zl; zy /= zl; zz /= zl;
  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  let xl = Math.hypot(xx, xy, xz) || 1; xx /= xl; xy /= xl; xz /= xl;
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  const m = new Float32Array(16);
  m[0]=xx; m[4]=xy; m[8]=xz;  m[12]=-(xx*ex + xy*ey + xz*ez);
  m[1]=yx; m[5]=yy; m[9]=yz;  m[13]=-(yx*ex + yy*ey + yz*ez);
  m[2]=zx; m[6]=zy; m[10]=zz; m[14]=-(zx*ex + zy*ey + zz*ez);
  m[3]=0;  m[7]=0;  m[11]=0;  m[15]=1;
  return m;
}
function mat4Multiply(a, b) {
  const m = new Float32Array(16);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      m[c * 4 + r] = s;
    }
  }
  return m;
}

function compileShader(gl, src, type) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('Shader compile error: ' + log);
  }
  return sh;
}
function linkProgram(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error('Program link error: ' + log);
  }
  return p;
}

/**
 * Camera in spherical-around-target coords for orbit + free-fly hybrid.
 *
 *   target:  the look-at point. Pan moves target.
 *   yaw:     0 = looking down +X. Counter-clockwise from above.
 *   pitch:   0 = horizontal. -π/2 = straight down. Clamped.
 *   distance: how far the eye sits from the target.
 *
 * For mouselook (right-button drag) we tweak yaw/pitch.
 * For orbit (left-button drag in empty space) we also tweak yaw/pitch
 * but the target stays put.
 * For pan (middle-button drag) we translate target.
 * For dolly (wheel + WASD) we change distance / translate target along
 * the view direction.
 */
function makeCamera() {
  return {
    target: [0, 0, SEA_LEVEL_Z],
    yaw: -Math.PI / 4,
    pitch: -Math.PI / 4,
    distance: 4000,
  };
}

function cameraEye(cam) {
  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  const cy = Math.cos(cam.yaw);
  const sy = Math.sin(cam.yaw);
  const dx = cp * cy * cam.distance;
  const dy = cp * sy * cam.distance;
  const dz = sp * cam.distance;
  return [
    cam.target[0] - dx,
    cam.target[1] - dy,
    cam.target[2] - dz,
  ];
}

/** Forward / right / up vectors of the camera's view frame. */
function cameraFrame(cam) {
  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  const cy = Math.cos(cam.yaw);
  const sy = Math.sin(cam.yaw);
  const fwd = [cp * cy, cp * sy, sp];
  // Right vector is perpendicular to fwd in the XY plane.
  const right = [-sy, cy, 0];
  // Up vector (world up); we treat the world as Z-up.
  const up = [0, 0, 1];
  return { fwd, right, up };
}

/**
 * Build the world-space ray for a given canvas pixel.
 *
 * Constructs the per-pixel direction directly from the camera's forward
 * vector plus right/cameraUp scaled by tan(fov/2) — equivalent to
 * unprojecting through an inverse perspective matrix, but cheaper and
 * easier to read.
 *
 * @returns {{origin:[number,number,number], dir:[number,number,number]}}
 */
function pixelRay(cam, viewportW, viewportH, px, py, fovYRad = Math.PI / 3) {
  const eye = cameraEye(cam);
  const { fwd, right, up } = cameraFrame(cam);
  // Camera-frame up isn't world up — we need the up vector orthogonal to
  // fwd that lies in the plane containing world-up. Re-derive:
  //   cameraUp = right × fwd (right-handed)
  const cUp = [
    right[1] * fwd[2] - right[2] * fwd[1],
    right[2] * fwd[0] - right[0] * fwd[2],
    right[0] * fwd[1] - right[1] * fwd[0],
  ];
  const aspect = viewportW / viewportH;
  // NDC-style coords: (-1..+1) where +x = right, +y = up.
  const ndcX = (2 * px / viewportW) - 1;
  const ndcY = 1 - (2 * py / viewportH);
  const tanHalfFov = Math.tan(fovYRad / 2);
  const sx = ndcX * tanHalfFov * aspect;
  const sy = ndcY * tanHalfFov;
  const dir = [
    fwd[0] + right[0] * sx + cUp[0] * sy,
    fwd[1] + right[1] * sx + cUp[1] * sy,
    fwd[2] + right[2] * sx + cUp[2] * sy,
  ];
  const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  return {
    origin: eye,
    dir: [dir[0] / len, dir[1] / len, dir[2] / len],
  };
}

/**
 * Intersect a ray with an axis-aligned box. Returns the smallest positive
 * t (distance along the ray) or Infinity if no hit. Slab method.
 */
function rayAabb(origin, dir, minB, maxB) {
  let tmin = -Infinity, tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dir[i]) < 1e-9) {
      if (origin[i] < minB[i] || origin[i] > maxB[i]) return Infinity;
    } else {
      const inv = 1 / dir[i];
      let t1 = (minB[i] - origin[i]) * inv;
      let t2 = (maxB[i] - origin[i]) * inv;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin >= 0 ? tmin : (tmax >= 0 ? tmax : Infinity);
}

/**
 * Find the world point under the ray. We test against the AABB of every
 * emerged cell + the global water plane. Linear scan over visible cells —
 * fine for our 64×64 default grid; if grids get huge, switch to a 2D-DDA
 * walk through the rejilla.
 *
 * Returns [x, y, z] of the hit point, or null if the ray misses every-
 * thing (which only really happens when looking outside the world box).
 */
function raycastTilemap(tilemap, origin, dir) {
  const { cols, rows } = tilemap;
  const gridHalfX = (cols * CELL_SIZE) / 2;
  const gridHalfY = (rows * CELL_SIZE) / 2;

  let bestT = Infinity;

  // Land cells.
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      const h = tilemap.heights[i];
      if (h < SEA_LEVEL_H) continue;
      const x0 = -gridHalfX + col * CELL_SIZE;
      const x1 = x0 + CELL_SIZE;
      const ySouthIdx = (rows - 1) - row;
      const y0 = -gridHalfY + ySouthIdx * CELL_SIZE;
      const y1 = y0 + CELL_SIZE;
      const z1 = h * HEIGHT_UNIT;
      const t = rayAabb(origin, dir, [x0, y0, BEDROCK_TOP_Z], [x1, y1, z1]);
      if (t < bestT) bestT = t;
    }
  }

  // Water plane (at SEA_LEVEL_Z). Skip when looking from below.
  if (Math.abs(dir[2]) > 1e-9) {
    const tw = (SEA_LEVEL_Z - origin[2]) / dir[2];
    if (tw > 0 && tw < bestT) {
      const hx = origin[0] + dir[0] * tw;
      const hy = origin[1] + dir[1] * tw;
      // Only count the hit if it's inside the playable world.
      if (Math.abs(hx) <= WORLD_HALF && Math.abs(hy) <= WORLD_HALF) {
        bestT = tw;
      }
    }
  }

  if (!isFinite(bestT)) return null;
  return [
    origin[0] + dir[0] * bestT,
    origin[1] + dir[1] * bestT,
    origin[2] + dir[2] * bestT,
  ];
}

export function Viewport3D() {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const glRef = useRef(null);
  const programRef = useRef(null);
  const buffersRef = useRef(null);
  const camRef = useRef(makeCamera());
  // Drag tracking. Mode: null | 'drag' | 'orbit' | 'pan'.
  const dragRef = useRef({ mode: null, x: 0, y: 0 });
  const keysRef = useRef({});
  const lastFrameTime = useRef(performance.now());
  const rafRef = useRef(0);

  // ---------- WebGL init ----------
  const initGL = useCallback(() => {
    const canvas = canvasRef.current;
    const gl = canvas.getContext('webgl2');
    if (!gl) throw new Error('WebGL2 unavailable');
    glRef.current = gl;
    const vs = compileShader(gl, VS, gl.VERTEX_SHADER);
    const fs = compileShader(gl, FS, gl.FRAGMENT_SHADER);
    const prog = linkProgram(gl, vs, fs);
    programRef.current = {
      prog,
      a_pos:    gl.getAttribLocation(prog, 'a_pos'),
      a_normal: gl.getAttribLocation(prog, 'a_normal'),
      a_color:  gl.getAttribLocation(prog, 'a_color'),
      u_viewProj: gl.getUniformLocation(prog, 'u_viewProj'),
      u_sunDir:   gl.getUniformLocation(prog, 'u_sunDir'),
      u_skyColor: gl.getUniformLocation(prog, 'u_skyColor'),
    };
    // The mesh cache is a map of chunkKey → {vao, buffers, indexCount}.
    // chunkKey is "cx,cy" of the chunk in the chunk-grid (not cell-grid).
    // The water plane has its own slot at key 'water'.
    buffersRef.current = { chunks: new Map(), water: null };

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
  }, []);

  // ---------- mesh upload helpers ----------
  /** Allocate/replace GL resources for a chunk. mesh is the typed-array
   *  bundle from buildChunk()/buildWater(); empty chunks (no triangles)
   *  free their slot. */
  const uploadMeshSlot = useCallback((key, mesh) => {
    const gl = glRef.current;
    if (!gl) return;
    const P = programRef.current;
    const B = buffersRef.current;
    const existing = B.chunks.get(key);
    if (mesh.triangleCount === 0) {
      if (existing) {
        gl.deleteVertexArray(existing.vao);
        gl.deleteBuffer(existing.posBuf);
        gl.deleteBuffer(existing.normBuf);
        gl.deleteBuffer(existing.colBuf);
        gl.deleteBuffer(existing.idxBuf);
        B.chunks.delete(key);
      }
      return;
    }
    let slot = existing;
    if (!slot) {
      slot = {
        vao: gl.createVertexArray(),
        posBuf: gl.createBuffer(),
        normBuf: gl.createBuffer(),
        colBuf: gl.createBuffer(),
        idxBuf: gl.createBuffer(),
        indexCount: 0,
      };
      B.chunks.set(key, slot);
    }
    gl.bindVertexArray(slot.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, slot.posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(P.a_pos);
    gl.vertexAttribPointer(P.a_pos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, slot.normBuf);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(P.a_normal);
    gl.vertexAttribPointer(P.a_normal, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, slot.colBuf);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.colors, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(P.a_color);
    gl.vertexAttribPointer(P.a_color, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, slot.idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    slot.indexCount = mesh.indices.length;
    gl.bindVertexArray(null);
  }, []);

  /** Rebuild a specific chunk identified by its chunk-grid (cx, cy). */
  const rebuildChunkSlot = useCallback((cx, cy) => {
    const mesh = buildChunk(getTilemap(), cx, cy);
    uploadMeshSlot(`${cx},${cy}`, mesh);
  }, [uploadMeshSlot]);

  /** Rebuild every chunk + water plane. Used on mount and on resetMap/
   *  loadTilemap, when there's no fine-grained dirty info. */
  const rebuildAll = useCallback(() => {
    const t = getTilemap();
    const { cx, cy } = chunkCounts(t);
    for (let r = 0; r < cy; r++) {
      for (let c = 0; c < cx; c++) {
        rebuildChunkSlot(c, r);
      }
    }
    uploadMeshSlot('water', buildWater(t));
  }, [rebuildChunkSlot, uploadMeshSlot]);

  /** Apply any pending dirty chunks. Called every frame (cheap when
   *  nothing's dirty). */
  const applyDirty = useCallback(() => {
    if (takeFullRebuildRequest()) {
      rebuildAll();
      return;
    }
    const dirty = drainDirty3dChunks();
    if (dirty.size === 0) return;
    for (const key of dirty) {
      const [cx, cy] = key.split(',').map(Number);
      rebuildChunkSlot(cx, cy);
    }
  }, [rebuildAll, rebuildChunkSlot]);

  // ---------- draw ----------
  const draw = useCallback(() => {
    const gl = glRef.current;
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!gl || !wrap || !canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.floor(wrap.clientWidth * dpr));
    const h = Math.max(1, Math.floor(wrap.clientHeight * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;

    const cam = camRef.current;
    // In iso mode lock the orientation to one of the four classic
    // isometric quadrants (yaw 45° + n·90°, pitch -arctan(1/√2) ≈
    // -35.264°). The user picks the quadrant with the rotate buttons
    // in the ribbon; pan and zoom still work, but free orbit doesn't —
    // it'd break the iso symmetry on the next frame anyway.
    const isIso = getTool() === 'iso';
    if (isIso) {
      cam.yaw   = Math.PI / 4 + getIsoYawIdx() * (Math.PI / 2);
      cam.pitch = -Math.atan(1 / Math.SQRT2);
    }
    const eye = cameraEye(cam);
    // Choose the projection. Perspective for free flight, orthographic
    // for iso. In iso, distance maps to the half-height of the visible
    // ortho frustum so the wheel still zooms intuitively.
    const aspect = w / h;
    const proj = isIso
      ? mat4Ortho(
          -cam.distance * aspect, cam.distance * aspect,
          -cam.distance,           cam.distance,
          -WORLD_HALF * 4,         WORLD_HALF * 4,
        )
      : mat4Perspective(Math.PI / 3, aspect, 4, WORLD_HALF * 4);
    const view = mat4LookAt(eye, cam.target, [0, 0, 1]);
    const viewProj = mat4Multiply(proj, view);

    const sky = SKY_COLOR;
    gl.viewport(0, 0, w, h);
    gl.clearColor(sky[0], sky[1], sky[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const P = programRef.current;
    const B = buffersRef.current;
    if (!P || !B) return;
    gl.useProgram(P.prog);
    gl.uniformMatrix4fv(P.u_viewProj, false, viewProj);
    const sy = -45 * Math.PI / 180;
    const sa = 215 * Math.PI / 180;
    const sd = [Math.cos(sy) * Math.cos(sa), Math.cos(sy) * Math.sin(sa), -Math.sin(sy)];
    gl.uniform3fv(P.u_sunDir, sd);
    gl.uniform3fv(P.u_skyColor, sky);
    // Draw every populated chunk slot. Empty chunks were freed during
    // their last rebuild and aren't in the map.
    for (const slot of B.chunks.values()) {
      gl.bindVertexArray(slot.vao);
      gl.drawElements(gl.TRIANGLES, slot.indexCount, gl.UNSIGNED_INT, 0);
    }
    gl.bindVertexArray(null);
  }, []);

  // ---------- continuous animation loop (drives WASD) ----------
  const frame = useCallback(() => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastFrameTime.current) / 1000);
    lastFrameTime.current = now;

    // WASD moves the camera target across the horizontal plane (Z is
    // never touched). Always active while the 3D viewport has focus,
    // not gated by any mouse button. Shift = run.
    const cam = camRef.current;
    const keys = keysRef.current;
    if (keys.w || keys.a || keys.s || keys.d) {
      const speed = (keys.shift ? 4000 : 1500) * dt;
      // Flatten forward into the XY plane so movement stays on the
      // horizontal plane regardless of camera pitch.
      const { fwd, right } = cameraFrame(cam);
      const fwdLen = Math.hypot(fwd[0], fwd[1]) || 1;
      const fwdX = fwd[0] / fwdLen;
      const fwdY = fwd[1] / fwdLen;
      let dx = 0, dy = 0;
      if (keys.w) { dx += fwdX; dy += fwdY; }
      if (keys.s) { dx -= fwdX; dy -= fwdY; }
      if (keys.a) { dx += right[0]; dy += right[1]; }
      if (keys.d) { dx -= right[0]; dy -= right[1]; }
      cam.target[0] += dx * speed;
      cam.target[1] += dy * speed;
      // Z deliberately untouched.
    }
    // Mirror live target XY to the store so a 2D mode switch can
    // recenter on the same world point. Silent (no notify) — purely a
    // shared scratchpad.
    setCamera3dTarget(cam.target[0], cam.target[1]);
    applyDirty();
    draw();
    rafRef.current = requestAnimationFrame(frame);
  }, [applyDirty, draw]);

  // ---------- mount ----------
  useEffect(() => {
    initGL();
    rebuildAll();
    // Pick up a pending 2D→3D focus handoff. When a playArea is set
    // the 3D viewport renders only that region, so frame the camera on
    // the area's centre and size the iso ortho frustum to the area's
    // larger side. Without an area, frame the whole map.
    const focus = takePendingFocus3dTarget();
    if (focus) {
      const t = getTilemap();
      const pa = t.playArea;
      if (pa) {
        const gridHalfX = (t.cols * CELL_SIZE) / 2;
        const gridHalfY = (t.rows * CELL_SIZE) / 2;
        const cx = -gridHalfX + ((pa.c0 + pa.c1 + 1) / 2) * CELL_SIZE;
        const ySouthMid = (t.rows - 1) - ((pa.r0 + pa.r1) / 2);
        const cy = -gridHalfY + (ySouthMid + 0.5) * CELL_SIZE;
        camRef.current.target[0] = cx;
        camRef.current.target[1] = cy;
        const span = Math.max(pa.c1 - pa.c0 + 1, pa.r1 - pa.r0 + 1) * CELL_SIZE;
        camRef.current.distance = span / 2;
      } else {
        camRef.current.target[0] = focus.x;
        camRef.current.target[1] = focus.y;
        const span = Math.max(t.cols, t.rows) * CELL_SIZE;
        camRef.current.distance = span / 2;
      }
    }
    rafRef.current = requestAnimationFrame(frame);
    // No store subscription needed — applyDirty in the frame loop pulls
    // dirty chunks from the store every tick. resetMap/loadTilemap mark
    // a full rebuild request that applyDirty picks up.
    const ro = new ResizeObserver(draw);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [initGL, rebuildAll, frame, draw]);

  // ---------- mouse ----------
  // Right button = drag-pan horizontal (altitude fixed). Middle = free
  // pan. Left = orbit around the point under the cursor.
  //
  // Orbit semantics: we stash the world point under the cursor as the
  // pivot and snapshot the current eye position. The camera doesn't move
  // at all on mousedown; only when the user actually drags do we rotate
  // the snapshotted eye around the pivot. This keeps the click itself a
  // no-op (no jumping into the ground) and the pivot ends up wherever
  // the user clicked, including land surface or water plane.
  const onMouseDown = useCallback((e) => {
    if (e.button === 2) {
      dragRef.current.mode = 'drag';
    } else if (e.button === 1) {
      dragRef.current.mode = 'pan';
    } else if (e.button === 0) {
      dragRef.current.mode = 'orbit';
      const canvas = canvasRef.current;
      const cam = camRef.current;
      const eye = cameraEye(cam);
      let pivot = cam.target;     // fallback: current target
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const px = (e.clientX - rect.left) * (canvas.width  / rect.width);
        const py = (e.clientY - rect.top)  * (canvas.height / rect.height);
        const { origin, dir } = pixelRay(cam, canvas.width, canvas.height, px, py);
        const hit = raycastTilemap(getTilemap(), origin, dir);
        if (hit) pivot = hit;
      }
      // Snapshot the offset eye-relative-to-pivot. Spherical coords
      // around the pivot let us rotate without re-deriving identity.
      const ox = eye[0] - pivot[0];
      const oy = eye[1] - pivot[1];
      const oz = eye[2] - pivot[2];
      const r = Math.hypot(ox, oy, oz);
      const horiz = Math.hypot(ox, oy);
      dragRef.current.orbit = {
        pivot,
        radius: r,
        // yaw 0 = eye is east of pivot, increases CCW from above.
        yaw: Math.atan2(oy, ox),
        // pitch +π/2 = eye straight above pivot, -π/2 = below.
        pitch: Math.atan2(oz, horiz || 1e-9),
      };
    }
    dragRef.current.x = e.clientX;
    dragRef.current.y = e.clientY;
    e.preventDefault();
  }, []);

  const onMouseMove = useCallback((e) => {
    const drag = dragRef.current;
    if (!drag.mode) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    const cam = camRef.current;
    if (drag.mode === 'orbit') {
      const o = drag.orbit;
      if (!o) return;
      const sensitivity = 0.005;
      o.yaw   += dx * sensitivity;
      o.pitch += dy * sensitivity;
      const max = Math.PI / 2 - 0.05;
      if (o.pitch >  max) o.pitch =  max;
      if (o.pitch < -max) o.pitch = -max;
      // Pivot stays put, eye orbits around it. Translate that back into
      // the cam.{target, yaw, pitch, distance} fields that cameraEye()
      // expects. cameraEye computes eye = target - <unit fwd> * distance,
      // where fwd uses cam.yaw/pitch in the same convention. So:
      //   target  = pivot
      //   yaw     = o.yaw + π   (eye on opposite side of fwd)
      //   pitch   = -o.pitch    (cameraEye's pitch sign is inverted)
      //   distance= o.radius
      cam.target = [o.pivot[0], o.pivot[1], o.pivot[2]];
      cam.yaw = o.yaw + Math.PI;
      cam.pitch = -o.pitch;
      cam.distance = o.radius;
    } else if (drag.mode === 'drag') {
      // Horizontal drag-pan: move target in the camera's XY frame,
      // ignoring its Z component so altitude is preserved. Right vector
      // is already on the XY plane (cameraFrame returns [-sin,cos,0]);
      // forward needs flattening.
      const { fwd, right } = cameraFrame(cam);
      const fwdLen = Math.hypot(fwd[0], fwd[1]) || 1;
      const fwdX = fwd[0] / fwdLen;
      const fwdY = fwd[1] / fwdLen;
      const k = cam.distance * 0.002;
      // Drag right = camera moves right; drag down = camera moves
      // "forward" (away from the viewer on the ground plane).
      cam.target[0] += right[0] * dx * k + fwdX * dy * k;
      cam.target[1] += right[1] * dx * k + fwdY * dy * k;
      // Z deliberately untouched.
    } else if (drag.mode === 'pan') {
      const { right } = cameraFrame(cam);
      // Pan speed scales with distance so the world doesn't fly past you
      // when zoomed in.
      const k = cam.distance * 0.002;
      cam.target[0] -= right[0] * dx * k;
      cam.target[1] -= right[1] * dx * k;
      // Vertical pan along world up.
      cam.target[2] += dy * k;
    }
  }, []);

  const onMouseUp = useCallback(() => {
    dragRef.current.mode = null;
  }, []);

  const onWheel = useCallback((e) => {
    e.preventDefault();
    const cam = camRef.current;
    const factor = e.deltaY < 0 ? 0.85 : 1.18;
    cam.distance = Math.max(32, Math.min(WORLD_HALF * 3, cam.distance * factor));
  }, []);

  // Wheel non-passive.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  useEffect(() => {
    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
  }, [onMouseUp]);

  // ---------- keyboard ----------
  useEffect(() => {
    const onDown = (e) => {
      const k = keysRef.current;
      if (e.key === 'w' || e.key === 'W') k.w = true;
      if (e.key === 'a' || e.key === 'A') k.a = true;
      if (e.key === 's' || e.key === 'S') k.s = true;
      if (e.key === 'd' || e.key === 'D') k.d = true;
      if (e.key === ' ') k.space = true;
      if (e.key === 'Control') k.ctrl = true;
      if (e.key === 'Shift') k.shift = true;
    };
    const onUp = (e) => {
      const k = keysRef.current;
      if (e.key === 'w' || e.key === 'W') k.w = false;
      if (e.key === 'a' || e.key === 'A') k.a = false;
      if (e.key === 's' || e.key === 'S') k.s = false;
      if (e.key === 'd' || e.key === 'D') k.d = false;
      if (e.key === ' ') k.space = false;
      if (e.key === 'Control') k.ctrl = false;
      if (e.key === 'Shift') k.shift = false;
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  return (
    <div className="canvas2d-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onContextMenu={(e) => e.preventDefault()}
        style={{ display: 'block', width: '100%', height: '100%', cursor: dragRef.current.mode === 'drag' ? 'grabbing' : 'grab' }}
      />
      <div className="canvas3d-hint">
        Botón derecho: arrastra (altura fija) · Click izquierdo: orbita · Botón medio: pan · Rueda: zoom · WASD: mover
      </div>
    </div>
  );
}
