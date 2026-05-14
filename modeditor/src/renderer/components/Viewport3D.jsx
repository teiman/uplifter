import React, { useEffect, useRef, useCallback } from 'react';
import {
  subscribe, getTilemap,
} from '../state/store.js';
import { buildScene } from '../state/scene3d.js';
import { WORLD_HALF, SEA_LEVEL_Z } from '../../shared/types.mjs';

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

export function Viewport3D() {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const glRef = useRef(null);
  const sceneRef = useRef(null);
  const programRef = useRef(null);
  const buffersRef = useRef(null);
  const camRef = useRef(makeCamera());
  // Drag tracking. Mode: null | 'look' | 'orbit' | 'pan'.
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

    const vao = gl.createVertexArray();
    const posBuf = gl.createBuffer();
    const normBuf = gl.createBuffer();
    const colBuf = gl.createBuffer();
    const idxBuf = gl.createBuffer();
    buffersRef.current = { vao, posBuf, normBuf, colBuf, idxBuf, indexCount: 0 };

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
  }, []);

  // ---------- mesh upload ----------
  const uploadMesh = useCallback(() => {
    const gl = glRef.current;
    if (!gl) return;
    const scene = buildScene(getTilemap());
    sceneRef.current = scene;
    const P = programRef.current;
    const B = buffersRef.current;

    gl.bindVertexArray(B.vao);

    gl.bindBuffer(gl.ARRAY_BUFFER, B.posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, scene.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(P.a_pos);
    gl.vertexAttribPointer(P.a_pos, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, B.normBuf);
    gl.bufferData(gl.ARRAY_BUFFER, scene.normals, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(P.a_normal);
    gl.vertexAttribPointer(P.a_normal, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, B.colBuf);
    gl.bufferData(gl.ARRAY_BUFFER, scene.colors, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(P.a_color);
    gl.vertexAttribPointer(P.a_color, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, B.idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, scene.indices, gl.STATIC_DRAW);
    B.indexCount = scene.indices.length;

    gl.bindVertexArray(null);
  }, []);

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
    const eye = cameraEye(cam);
    const proj = mat4Perspective(Math.PI / 3, w / h, 4, WORLD_HALF * 4);
    const view = mat4LookAt(eye, cam.target, [0, 0, 1]);
    const viewProj = mat4Multiply(proj, view);

    const scene = sceneRef.current;
    const sky = scene ? scene.skyColor : [0.5, 0.7, 0.9];
    gl.viewport(0, 0, w, h);
    gl.clearColor(sky[0], sky[1], sky[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const P = programRef.current;
    const B = buffersRef.current;
    if (!P || !B || !B.indexCount) return;
    gl.useProgram(P.prog);
    gl.uniformMatrix4fv(P.u_viewProj, false, viewProj);
    // Sun comes from yaw 215°, pitch -45° (default in our world). Convert to a
    // surface-toward-sun direction: invert pitch sign so positive Z aims up.
    const sy = -45 * Math.PI / 180;
    const sa = 215 * Math.PI / 180;
    const sd = [Math.cos(sy) * Math.cos(sa), Math.cos(sy) * Math.sin(sa), -Math.sin(sy)];
    gl.uniform3fv(P.u_sunDir, sd);
    gl.uniform3fv(P.u_skyColor, sky);
    gl.bindVertexArray(B.vao);
    gl.drawElements(gl.TRIANGLES, B.indexCount, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
  }, []);

  // ---------- continuous animation loop (drives WASD) ----------
  const frame = useCallback(() => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastFrameTime.current) / 1000);
    lastFrameTime.current = now;

    // Move target with WASD while mouselook (right button) is held.
    const cam = camRef.current;
    const keys = keysRef.current;
    if (dragRef.current.mode === 'look') {
      const speed = (keys.shift ? 4000 : 1500) * dt;
      const { fwd, right } = cameraFrame(cam);
      let dx = 0, dy = 0, dz = 0;
      if (keys.w) { dx += fwd[0]; dy += fwd[1]; dz += fwd[2]; }
      if (keys.s) { dx -= fwd[0]; dy -= fwd[1]; dz -= fwd[2]; }
      if (keys.d) { dx += right[0]; dy += right[1]; }
      if (keys.a) { dx -= right[0]; dy -= right[1]; }
      if (keys.space) dz += 1;
      if (keys.ctrl)  dz -= 1;
      cam.target[0] += dx * speed;
      cam.target[1] += dy * speed;
      cam.target[2] += dz * speed;
    }
    draw();
    rafRef.current = requestAnimationFrame(frame);
  }, [draw]);

  // ---------- mount ----------
  useEffect(() => {
    initGL();
    uploadMesh();
    rafRef.current = requestAnimationFrame(frame);
    const off = subscribe(uploadMesh);
    const ro = new ResizeObserver(draw);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => {
      cancelAnimationFrame(rafRef.current);
      off();
      ro.disconnect();
    };
  }, [initGL, uploadMesh, frame, draw]);

  // ---------- mouse ----------
  const onMouseDown = useCallback((e) => {
    if (e.button === 2) {
      dragRef.current.mode = 'look';
    } else if (e.button === 1) {
      dragRef.current.mode = 'pan';
    } else if (e.button === 0) {
      dragRef.current.mode = 'orbit';
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
    if (drag.mode === 'look' || drag.mode === 'orbit') {
      const sensitivity = 0.005;
      cam.yaw   -= dx * sensitivity;
      cam.pitch -= dy * sensitivity;
      const max = Math.PI / 2 - 0.05;
      if (cam.pitch >  max) cam.pitch =  max;
      if (cam.pitch < -max) cam.pitch = -max;
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
        style={{ display: 'block', width: '100%', height: '100%', cursor: dragRef.current.mode === 'look' ? 'none' : 'grab' }}
      />
      <div className="canvas3d-hint">
        Botón derecho + arrastra: mirar · WASD: mover · Rueda: zoom · Botón medio: pan · Click izquierdo: orbita
      </div>
    </div>
  );
}
