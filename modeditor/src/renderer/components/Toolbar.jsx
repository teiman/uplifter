import React from 'react';
import { Button, ButtonGroup, Divider, Spinner } from '@blueprintjs/core';

import { useStore, getTool, setTool, resetMap, getView, setView } from '../state/store.js';

const TOOLS = [
  { id: 'paint',  label: 'Pintar',     icon: 'tint' },
  { id: 'raise',  label: 'Subir',      icon: 'arrow-up' },
  { id: 'lower',  label: 'Bajar',      icon: 'arrow-down' },
  { id: 'smooth', label: 'Suavizar',   icon: 'blur' },
];

export function Toolbar({ onCompile, onLaunch, compiling, canLaunch }) {
  const tool = useStore(() => getTool());
  const view = useStore(() => getView());

  return (
    <div className="toolbar-row">
      <strong style={{ marginRight: 12 }}>Uplifter ModEditor</strong>

      <ButtonGroup>
        <Button icon="grid"  active={view === '2d'} onClick={() => setView('2d')}>2D</Button>
        <Button icon="cube"  active={view === '3d'} onClick={() => setView('3d')}>3D</Button>
      </ButtonGroup>

      <Divider />

      <ButtonGroup>
        {TOOLS.map(t => (
          <Button
            key={t.id}
            icon={t.icon}
            active={tool === t.id}
            onClick={() => setTool(t.id)}
            disabled={view === '3d'}
          >
            {t.label}
          </Button>
        ))}
      </ButtonGroup>

      <Divider />

      <Button
        icon="document"
        onClick={() => {
          if (confirm('¿Nuevo mapa? Se perderá lo no guardado.')) resetMap();
        }}
      >
        Nuevo
      </Button>

      <div style={{ flex: 1 }} />

      <Button
        intent="primary"
        icon={compiling ? <Spinner size={16} /> : 'build'}
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
        Lanzar juego
      </Button>
    </div>
  );
}
