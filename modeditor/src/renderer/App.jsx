import React, { useEffect, useState, useCallback, useRef } from 'react';
import { OverlayToaster, Position } from '@blueprintjs/core';

import { Toolbar } from './components/Toolbar.jsx';
import { LeftPanel } from './components/LeftPanel.jsx';
import { RightPanel } from './components/RightPanel.jsx';
import { Canvas2D } from './components/Canvas2D.jsx';
import { Viewport3D } from './components/Viewport3D.jsx';
import { DayChecklistView } from './components/DayChecklistView.jsx';
import { LogPanel } from './components/LogPanel.jsx';

import { serialiseTilemap } from '../shared/types.mjs';
import { getTilemap, useStore, getView, loadTilemap } from './state/store.js';

export function App() {
  const [log, setLog] = useState([]);
  const [compiling, setCompiling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastBspPath, setLastBspPath] = useState(null);
  const [defaults, setDefaults] = useState(null);
  const [currentTool, setCurrentTool] = useState(null);
  // Modo debug: cuando esta on, el .map usa texturas dbg_* por kind y el
  // launcher arranca debug_iw.exe (Ironwail patcheado con el comando
  // `debug_point`). Permite identificar que brush genera la geometria a
  // la que apuntamos. Toggle desde el toolbar. Off por defecto.
  const [debugMode, setDebugMode] = useState(false);
  // Phong: anade _phong/_phong_angle al func_detail. Suaviza la iluminacion
  // entre caras casi-coplanares (cuerpo corner_in <-> tip, rampa <-> cubo).
  // Toggle desde el toolbar. Off por defecto: se activa solo cuando se quiere
  // pulir el look final, ya que ralentiza light.
  const [phongMode, setPhongMode] = useState(false);
  // Nubes: cuando off, el writer no emite los ~500 brushes de
  // func_detail_illusionary de la banda de nubes. light no calcula
  // iluminacion sobre ellos -> compilacion notablemente mas rapida.
  // OFF por defecto: el coste de las nubes en cada compile no compensa
  // durante iteracion de gameplay; se activa solo para builds finales.
  const [cloudsEnabled, setCloudsEnabled] = useState(false);
  const toasterRef = useRef(null);

  const toast = useCallback((message, intent = 'none', timeout = 2500) => {
    toasterRef.current?.show({ message, intent, timeout });
  }, []);

  // Exponemos el toast en window para que la capa de estado (store.js, sin
  // React) pueda dar feedback puntual — p.ej. "seleccion copiada al
  // portapapeles". Desacoplado: si no existe, el store simplemente no avisa.
  useEffect(() => {
    window.__toast = toast;
    return () => { if (window.__toast === toast) delete window.__toast; };
  }, [toast]);

  // Subscribe to compile log stream from main process. Track the active
  // tool (qbsp / vis / light) so the title can show the current phase.
  useEffect(() => {
    if (!window.modeditor?.compile) return;
    const off = window.modeditor.compile.onLog((entry) => {
      setLog((prev) => [...prev.slice(-499), entry]);
      if (entry.stream === 'meta' && entry.tool && entry.tool !== 'compile' && entry.tool !== 'mapWriter') {
        setCurrentTool(entry.tool);
      }
    });
    return () => { try { off?.(); } catch {} };
  }, []);

  // Animated title while compiling: spinner + current phase first, app
  // name nowhere — the user wants the status front-and-centre, not the
  // app name. When idle, restore the plain title.
  useEffect(() => {
    if (!compiling) {
      document.title = lastBspPath
        ? 'Uplifter ModEditor — listo'
        : 'Uplifter ModEditor';
      return;
    }
    const frames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
    let i = 0;
    const tick = () => {
      const phase = currentTool || 'preparing';
      document.title = `${frames[i % frames.length]} Compiling (${phase})`;
      i++;
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [compiling, lastBspPath, currentTool]);

  useEffect(() => {
    window.modeditor?.defaults?.().then(setDefaults).catch(() => {});
  }, []);

  // Restore the last-saved tilemap on startup. Silent if there's no
  // saved file yet — the default empty ocean is already in the store.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await window.modeditor?.tilemap?.loadLast?.({ basename: 'uplifter' });
        if (cancelled || !r?.ok) return;
        loadTilemap(r.tilemap);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // Si ya hay un .bsp compilado en disco de una sesión anterior, sembrar
  // lastBspPath para que el botón "Lanzar" funcione sin obligar a
  // recompilar primero. Es seguro porque onLaunch solo dispara el deploy
  // del archivo existente — si está obsoleto, basta con recompilar.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await window.modeditor?.bsp?.findExisting?.({ basename: 'uplifter' });
        if (cancelled || !r?.ok) return;
        setLastBspPath(r.bspPath);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  const onSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const snap = serialiseTilemap(getTilemap());
      const r = await window.modeditor.tilemap.save({ tilemap: snap, basename: 'uplifter' });
      if (r.ok) {
        toast(`Guardado → ${r.path}`, 'success', 4000);
      } else {
        toast(`Guardado falló: ${r.error}`, 'danger', 4000);
      }
    } catch (err) {
      toast(`Error: ${err.message}`, 'danger', 4000);
    } finally {
      setSaving(false);
    }
  }, [saving, toast]);

  const onCompile = useCallback(async () => {
    if (compiling) return;
    setCompiling(true);
    setLog([]);
    setLastBspPath(null);
    setCurrentTool(null);
    try {
      const snap = serialiseTilemap(getTilemap());
      const r = await window.modeditor.compile.run({ tilemap: snap, basename: 'uplifter', debug: debugMode, phong: phongMode, clouds: cloudsEnabled });
      const secs = r.elapsedMs != null ? (r.elapsedMs / 1000).toFixed(1) : '?';
      if (r.ok) {
        setLastBspPath(r.bspPath);
        toast(`Compilado en ${secs}s → ${r.bspPath}`, 'success', 6000);
      } else if (r.leaked) {
        toast(`Compilación falló (leak, ${secs}s)`, 'danger', 4000);
      } else {
        toast(`Compilación falló (${r.lastTool}: ${r.exitCode}, ${secs}s)`, 'danger', 4000);
      }
    } catch (err) {
      toast(`Error: ${err.message}`, 'danger', 4000);
    } finally {
      setCompiling(false);
    }
  }, [compiling, toast, debugMode, phongMode, cloudsEnabled]);

  const onLaunch = useCallback(async () => {
    if (!lastBspPath) {
      toast('No hay BSP — compila primero', 'warning', 3000);
      return;
    }
    try {
      const dep = await window.modeditor.bsp.deploy({
        sourcePath: lastBspPath,
        destDir: defaults?.deployDest,
      });
      if (!dep.ok) {
        toast(`Deploy falló: ${dep.error}`, 'danger', 4000);
        return;
      }
      const launch = await window.modeditor.quake.launch({
        map: 'uplifter',
        game: defaults?.quakeGame || 'uplifter',
        cwd: defaults?.quakeCwd || 'd:\\quake',
        debug: debugMode,
      });
      if (launch.ok) {
        toast('Lanzado', 'success');
      } else {
        toast(`Launch falló: ${launch.error}`, 'danger', 4000);
      }
    } catch (err) {
      toast(`Error: ${err.message}`, 'danger', 4000);
    }
  }, [lastBspPath, defaults, toast, debugMode]);

  return (
    <div className="app-root">
      <OverlayToaster ref={toasterRef} position={Position.TOP} />
      <div className="app-toolbar">
        <Toolbar
          onSave={onSave}
          onCompile={onCompile}
          onLaunch={onLaunch}
          compiling={compiling}
          saving={saving}
          canLaunch={!!lastBspPath}
          debugMode={debugMode}
          onDebugModeChange={setDebugMode}
          phongMode={phongMode}
          onPhongModeChange={setPhongMode}
          cloudsEnabled={cloudsEnabled}
          onCloudsEnabledChange={setCloudsEnabled}
        />
      </div>
      <div className="app-left">
        <LeftPanel />
      </div>
      <div className="app-canvas">
        <MainView />
      </div>
      <div className="app-right">
        <RightPanel />
      </div>
      <div className="app-log">
        <LogPanel entries={log} />
      </div>
    </div>
  );
}

function MainView() {
  const view = useStore(() => getView());
  if (view === '3d') return <Viewport3D />;
  if (view === 'day') return <DayChecklistView />;
  return <Canvas2D />;
}
