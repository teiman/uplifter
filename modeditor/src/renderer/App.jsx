import React, { useEffect, useState, useCallback, useRef } from 'react';
import { OverlayToaster, Position } from '@blueprintjs/core';

import { Toolbar } from './components/Toolbar.jsx';
import { LeftPanel } from './components/LeftPanel.jsx';
import { RightPanel } from './components/RightPanel.jsx';
import { Canvas2D } from './components/Canvas2D.jsx';
import { LogPanel } from './components/LogPanel.jsx';

import { serialiseTilemap } from '../shared/types.mjs';
import { getTilemap } from './state/store.js';

export function App() {
  const [log, setLog] = useState([]);
  const [compiling, setCompiling] = useState(false);
  const [lastBspPath, setLastBspPath] = useState(null);
  const [defaults, setDefaults] = useState(null);
  const [currentTool, setCurrentTool] = useState(null);
  const toasterRef = useRef(null);

  const toast = useCallback((message, intent = 'none', timeout = 2500) => {
    toasterRef.current?.show({ message, intent, timeout });
  }, []);

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

  const onCompile = useCallback(async () => {
    if (compiling) return;
    setCompiling(true);
    setLog([]);
    setLastBspPath(null);
    setCurrentTool(null);
    try {
      const snap = serialiseTilemap(getTilemap());
      const r = await window.modeditor.compile.run({ tilemap: snap, basename: 'uplifter' });
      if (r.ok) {
        setLastBspPath(r.bspPath);
        toast('Compilación OK', 'success');
      } else if (r.leaked) {
        toast('Compilación falló: leak', 'danger', 4000);
      } else {
        toast(`Compilación falló (${r.lastTool}: ${r.exitCode})`, 'danger', 4000);
      }
    } catch (err) {
      toast(`Error: ${err.message}`, 'danger', 4000);
    } finally {
      setCompiling(false);
    }
  }, [compiling, toast]);

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
      });
      if (launch.ok) {
        toast('Lanzado', 'success');
      } else {
        toast(`Launch falló: ${launch.error}`, 'danger', 4000);
      }
    } catch (err) {
      toast(`Error: ${err.message}`, 'danger', 4000);
    }
  }, [lastBspPath, defaults, toast]);

  return (
    <div className="app-root">
      <OverlayToaster ref={toasterRef} position={Position.TOP} />
      <div className="app-toolbar">
        <Toolbar
          onCompile={onCompile}
          onLaunch={onLaunch}
          compiling={compiling}
          canLaunch={!!lastBspPath}
        />
      </div>
      <div className="app-left">
        <LeftPanel />
      </div>
      <div className="app-canvas">
        <Canvas2D />
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
