import React, { useState, useEffect, useRef } from 'react';
import { Button, ButtonGroup, FormGroup } from '@blueprintjs/core';

import {
  useStore,
  getPatrols, getActivePatrolId,
  addPatrol, deletePatrol, setActivePatrol,
  setPatrolName, setPatrolFlightHeight,
  setPatrolKind,
} from '../state/store.js';

/** NumberField clonado de RightPanel (commit per-keystroke con guardia
 *  contra el round-trip que sobrescribe lo tecleado). */
function NumberField({ value, onCommit, min = 0 }) {
  const [text, setText] = useState(String(value));
  const lastCommittedRef = useRef(value);
  useEffect(() => {
    if (value !== lastCommittedRef.current) {
      setText(String(value));
      lastCommittedRef.current = value;
    }
  }, [value]);
  return (
    <input
      className="bp5-input bp5-small"
      value={text}
      onChange={(e) => {
        const s = e.target.value;
        setText(s);
        const n = parseInt(s, 10);
        if (Number.isFinite(n) && n >= min) {
          lastCommittedRef.current = n;
          onCommit(n);
        }
      }}
      onBlur={() => {
        const n = parseInt(text, 10);
        if (!Number.isFinite(n)) setText(String(value));
      }}
      style={{ width: 60 }}
    />
  );
}

/** Input de texto con commit en cada cambio. Mismo patron que NumberField
 *  pero sin parseo numerico. */
function TextField({ value, onCommit }) {
  const [text, setText] = useState(value);
  const lastRef = useRef(value);
  useEffect(() => {
    if (value !== lastRef.current) {
      setText(value);
      lastRef.current = value;
    }
  }, [value]);
  return (
    <input
      className="bp5-input bp5-small"
      value={text}
      onChange={(e) => {
        const s = e.target.value;
        setText(s);
        lastRef.current = s;
        onCommit(s);
      }}
      style={{ width: '100%' }}
    />
  );
}

/**
 * Panel de gestion de patrullas. Solo se muestra en modo 'patrol' (decision
 * del padre, RightPanel). Una ruta esta marcada como "activa" — los clicks
 * en Canvas2D anaden/quitan nodos a ella.
 */
export function PatrolPanel() {
  const patrols = useStore(() => getPatrols());
  const activeId = useStore(() => getActivePatrolId());

  return (
    <div className="panel">
      <div className="panel-title">Patrullas</div>
      <ButtonGroup fill style={{ marginBottom: 8 }}>
        <Button icon="plus" onClick={() => addPatrol('aerial')} small title="Ruta aerea (drones, aviones, helos)">
          Aérea
        </Button>
        <Button icon="plus" onClick={() => addPatrol('ground')} small title="Ruta terrestre (tanques, humvees, m-sam)">
          Terrestre
        </Button>
      </ButtonGroup>
      {patrols.length === 0 ? (
        <div style={{ fontSize: 12, color: '#a7b6c9' }}>
          Sin rutas. Crea una y luego haz click en celdas del mapa para añadir nodos.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {patrols.map((p) => {
            const isActive = p.id === activeId;
            return (
              <div
                key={p.id}
                style={{
                  border: isActive ? '1px solid #4a90e2' : '1px solid #2a3140',
                  borderRadius: 4,
                  padding: 8,
                  background: isActive ? 'rgba(74,144,226,0.08)' : 'transparent',
                }}
              >
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 6 }}>
                  <Button
                    icon={isActive ? 'tick-circle' : 'circle'}
                    small
                    minimal
                    active={isActive}
                    onClick={() => setActivePatrol(p.id)}
                    title={isActive ? 'Ruta activa' : 'Marcar como activa'}
                  />
                  <TextField value={p.name} onCommit={(s) => setPatrolName(p.id, s)} />
                  <Button
                    icon="trash"
                    small
                    minimal
                    intent="danger"
                    onClick={() => {
                      if (confirm(`¿Eliminar la ruta "${p.name}"?`)) deletePatrol(p.id);
                    }}
                    title="Eliminar ruta"
                  />
                </div>
                {/* Toggle del tipo de ruta. Aerea usa flightHeight; terrestre
                    pega los nodos al suelo y oculta el campo de altura. */}
                <ButtonGroup small fill style={{ marginBottom: 6 }}>
                  <Button
                    icon="airplane"
                    active={(p.kind ?? 'aerial') === 'aerial'}
                    onClick={() => setPatrolKind(p.id, 'aerial')}
                    title="Ruta aerea: usa altura de vuelo sobre el terreno"
                  >
                    Aérea
                  </Button>
                  <Button
                    icon="map"
                    active={p.kind === 'ground'}
                    onClick={() => setPatrolKind(p.id, 'ground')}
                    title="Ruta terrestre: nodos pegados al suelo"
                  >
                    Terrestre
                  </Button>
                </ButtonGroup>
                {(p.kind ?? 'aerial') === 'aerial' && (
                  <FormGroup
                    label="Altura de vuelo"
                    helperText={`${p.flightHeight} × 64u sobre el terreno bajo cada nodo`}
                    style={{ marginBottom: 0 }}
                  >
                    <NumberField
                      value={p.flightHeight}
                      min={0}
                      onCommit={(n) => setPatrolFlightHeight(p.id, n)}
                    />
                  </FormGroup>
                )}
                <div style={{ fontSize: 11, color: '#a7b6c9', marginTop: 6 }}>
                  {p.nodes.length} nodo{p.nodes.length === 1 ? '' : 's'}
                  {p.nodes.length >= 2 && ' · ciclo cerrado'}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
