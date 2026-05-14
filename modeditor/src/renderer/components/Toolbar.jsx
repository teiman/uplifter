import React from 'react';
import { Button, ButtonGroup, Divider, Icon, Spinner } from '@blueprintjs/core';

import { useStore, getTool, setTool, resetMap } from '../state/store.js';

const TOOLS = [
  { id: 'paint',  label: 'Pintar',     icon: 'tint' },
  { id: 'raise',  label: 'Subir',      icon: 'arrow-up' },
  { id: 'lower',  label: 'Bajar',      icon: 'arrow-down' },
  { id: 'smooth', label: 'Suavizar',   icon: 'blur' },
];

export function Toolbar({ onCompile, onLaunch, compiling, canLaunch }) {
  const tool = useStore(() => getTool());

  return (
    <div className="toolbar-row">
      <strong style={{ marginRight: 12 }}>Uplifter ModEditor</strong>

      <ButtonGroup>
        {TOOLS.map(t => (
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
