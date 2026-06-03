import React, { useState, useEffect, useRef } from 'react';
import { Button, FormGroup, Checkbox } from '@blueprintjs/core';

import {
  useStore,
  getSelectedEntity,
  setSelectedEntityRef,
  setPatrolNodeZOverride,
  deletePatrolNode,
  setActivePatrol,
} from '../state/store.js';

/** Numeric field con commit por keystroke + guard contra round-trip
 *  (mismo patron que en otros panels). */
function NumberField({ value, onCommit, min, max, disabled = false }) {
  const [text, setText] = useState(String(value));
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      setText(String(value));
      last.current = value;
    }
  }, [value]);
  return (
    <input
      className="bp5-input bp5-small"
      value={text}
      disabled={disabled}
      onChange={(e) => {
        const s = e.target.value;
        setText(s);
        const n = parseInt(s, 10);
        if (Number.isFinite(n) && (min == null || n >= min) && (max == null || n <= max)) {
          last.current = n;
          onCommit(n);
        }
      }}
      onBlur={() => {
        const n = parseInt(text, 10);
        if (!Number.isFinite(n)) setText(String(value));
      }}
      style={{ width: 100 }}
    />
  );
}

/**
 * Panel de propiedades del nodo de patrulla seleccionado. Solo se
 * renderiza cuando hay un nodo seleccionado (el padre lo decide).
 *
 * Edita:
 *   - posicion (col, row) — solo lectura, se mueve por drag en el canvas.
 *   - zOverride (opcional) — altura Z absoluta en unidades Quake; si
 *     esta presente, el writer la usa en vez de derivar Z del terreno
 *     + flightHeight de la ruta.
 *
 * Permite eliminar el nodo (la ruta se "repara" sola al recompilar:
 * los targetname son `patrol_<id>_<i>` regenerados sobre los nodos
 * restantes, asi que el anillo se cierra entre los supervivientes).
 */
export function NodePanel() {
  const sel = useStore(() => getSelectedEntity());
  if (!sel || sel.type !== 'node') return null;
  const { patrol, node } = sel;
  const hasZ = node.zOverride != null;

  return (
    <div className="panel">
      <div className="panel-title">Nodo seleccionado</div>
      <div style={{ fontSize: 11, color: '#a7b6c9', marginBottom: 8 }}>
        <strong>{node.id}</strong> de ruta <strong>{patrol.name}</strong>
        {' · '}celda ({node.col},{node.row})
      </div>

      <FormGroup
        label="Altura Z (override)"
        helperText={hasZ
          ? 'Anula la altura derivada de flightHeight para este nodo.'
          : 'Sin override: usa el terreno + flightHeight de la ruta.'}
        style={{ marginBottom: 8 }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Checkbox
            checked={hasZ}
            onChange={(e) => {
              if (e.currentTarget.checked) {
                // Activamos override con un valor inicial razonable: 0
                // (sea level) — el usuario lo ajusta despues.
                setPatrolNodeZOverride(patrol.id, node.id, 0);
              } else {
                setPatrolNodeZOverride(patrol.id, node.id, null);
              }
            }}
            style={{ marginBottom: 0 }}
            label="Activo"
          />
          <NumberField
            value={hasZ ? node.zOverride : 0}
            disabled={!hasZ}
            onCommit={(n) => setPatrolNodeZOverride(patrol.id, node.id, n)}
          />
          <span style={{ fontSize: 11, color: '#8da0b8' }}>uQ</span>
        </div>
      </FormGroup>

      <div style={{ display: 'flex', gap: 4 }}>
        <Button
          icon="locate"
          small
          onClick={() => {
            // Atajo: hacer activa la ruta a la que pertenece este nodo
            // (util en modo Entidades, donde no se cambia activePatrolId
            // por seleccionar un nodo).
            setActivePatrol(patrol.id);
          }}
          title="Hacer activa la ruta de este nodo"
        >
          Activar ruta
        </Button>
        <Button
          icon="trash"
          intent="danger"
          small
          onClick={() => {
            if (confirm(`¿Eliminar el nodo ${node.id} de la ruta ${patrol.name}?`)) {
              deletePatrolNode(patrol.id, node.id);
            }
          }}
        >
          Eliminar nodo
        </Button>
      </div>
    </div>
  );
}
