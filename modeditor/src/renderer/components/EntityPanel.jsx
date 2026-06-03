import React, { useState, useEffect, useRef } from 'react';
import { Button, ButtonGroup, FormGroup, HTMLSelect } from '@blueprintjs/core';

import {
  useStore,
  getSelectedEnemy,
  getEnemies,
  setSelectedEnemy,
  setEnemyAngle,
  setEnemyTarget,
  setEnemyKind,
  setEnemySlotKind,
  setEnemySlotActivateDay,
  setEntityAppliesDay,
  deleteEnemy,
  getPatrols,
} from '../state/store.js';
import { ENEMY_TYPES, ENEMY_BY_KIND } from '../../shared/types.mjs';

/** Numeric field con commit por keystroke + guard contra round-trip. Mismo
 *  patron que el del PatrolPanel / RightPanel. */
function NumberField({ value, onCommit, min = 0, max }) {
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
      onChange={(e) => {
        const s = e.target.value;
        setText(s);
        const n = parseInt(s, 10);
        if (Number.isFinite(n) && n >= min && (max == null || n <= max)) {
          last.current = n;
          onCommit(n);
        }
      }}
      onBlur={() => {
        const n = parseInt(text, 10);
        if (!Number.isFinite(n)) setText(String(value));
      }}
      style={{ width: 80 }}
    />
  );
}

/**
 * Panel de propiedades de la entidad seleccionada. Solo se muestra en
 * modo 'entities' (decision del padre, RightPanel). Edita kind, angulo,
 * target (ruta) y permite borrar la entidad.
 *
 * Tambien lista todas las entidades del mapa como atajo de seleccion —
 * util cuando estan muy juntas y cuesta clicar la correcta.
 */
export function EntityPanel() {
  const selected = useStore(() => getSelectedEnemy());
  const enemies = useStore(() => getEnemies());
  const patrols = useStore(() => getPatrols());

  return (
    <>
      <div className="panel">
        <div className="panel-title">Entidad seleccionada</div>
        {!selected ? (
          <div style={{ fontSize: 12, color: '#a7b6c9' }}>
            Sin selección. Click sobre una entidad en el mapa para editarla.
          </div>
        ) : (
          <SelectedEntityEditor entity={selected} patrols={patrols} />
        )}
      </div>

      <div className="panel">
        <div className="panel-title">Todas las entidades</div>
        {enemies.length === 0 ? (
          <div style={{ fontSize: 12, color: '#a7b6c9' }}>
            Aún no hay entidades. Usa "Colocar" en el ribbon y haz click en el mapa.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {enemies.map((e) => {
              const meta = ENEMY_BY_KIND.get(e.kind);
              const isSel = selected && selected.id === e.id;
              return (
                <button
                  key={e.id}
                  onClick={() => setSelectedEnemy(e.id)}
                  className={`bp5-button bp5-small ${isSel ? 'bp5-active' : ''}`}
                  style={{
                    justifyContent: 'flex-start',
                    textAlign: 'left',
                    color: meta?.color,
                  }}
                >
                  <span style={{ marginRight: 6 }}>{meta?.glyph || '?'}</span>
                  <span style={{ flex: 1 }}>{e.id} · {meta?.label || e.kind}</span>
                  <span style={{ fontSize: 10, color: '#8da0b8' }}>
                    ({e.col},{e.row})
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function SelectedEntityEditor({ entity, patrols }) {
  const meta = ENEMY_BY_KIND.get(entity.kind);
  const needsPath = !!meta?.needsPath;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 11, color: '#a7b6c9' }}>
        id: <strong>{entity.id}</strong> · celda ({entity.col},{entity.row})
      </div>

      <FormGroup label="Tipo" style={{ marginBottom: 0 }}>
        <HTMLSelect
          fill
          value={entity.kind}
          onChange={(e) => setEnemyKind(entity.id, e.currentTarget.value)}
        >
          <optgroup label="Estacionarios">
            {ENEMY_TYPES.filter(t => !t.needsPath).map(t => (
              <option key={t.kind} value={t.kind}>{t.label}</option>
            ))}
          </optgroup>
          <optgroup label="Móviles (necesitan ruta)">
            {ENEMY_TYPES.filter(t => t.needsPath).map(t => (
              <option key={t.kind} value={t.kind}>{t.label}</option>
            ))}
          </optgroup>
        </HTMLSelect>
      </FormGroup>

      <FormGroup
        label="Ángulo"
        helperText="0° = Este, 90° = Norte (convención Quake)"
        style={{ marginBottom: 0 }}
      >
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <NumberField
            value={entity.angle ?? 0}
            min={0}
            max={359}
            onCommit={(n) => setEnemyAngle(entity.id, n)}
          />
          <ButtonGroup>
            {[0, 90, 180, 270].map(a => (
              <Button
                key={a}
                small
                active={(entity.angle ?? 0) === a}
                onClick={() => setEnemyAngle(entity.id, a)}
              >
                {a}°
              </Button>
            ))}
          </ButtonGroup>
        </div>
      </FormGroup>

      {entity.kind === 'info_enemy_slot' && (
        <>
          <FormGroup
            label="Tipo de enemigo (slot)"
            helperText="Qué monstruo spawnea si el slot se activa este día."
            style={{ marginBottom: 0 }}
          >
            <HTMLSelect
              fill
              value={entity.enemyKind || 'monster_aag'}
              onChange={(e) => setEnemySlotKind(entity.id, e.currentTarget.value)}
            >
              <option value="monster_aag">AAG</option>
              <option value="monster_sam">SAM</option>
              <option value="monster_rad">Radar</option>
            </HTMLSelect>
          </FormGroup>
          <FormGroup
            label="Día mínimo de activación"
            helperText="Desde qué día puede activarse este slot (1–5)."
            style={{ marginBottom: 0 }}
          >
            <NumberField
              value={entity.activateDay ?? 1}
              min={1}
              max={5}
              onCommit={(n) => setEnemySlotActivateDay(entity.id, n)}
            />
          </FormGroup>
        </>
      )}

      {needsPath && (() => {
        // Filtra rutas compatibles con el tipo de entidad: aerea para
        // enemigos voladores, terrestre para terrestres. Si la ruta
        // actualmente asignada NO es compatible (porque el usuario
        // cambio el tipo de ruta o el kind del enemy), la incluimos
        // igualmente para que el dropdown pueda mostrarla y el usuario
        // sepa que esta mal — marcada como "incompatible".
        const wantedKind = meta?.aerial ? 'aerial' : 'ground';
        const compat = patrols.filter(p => (p.kind ?? 'aerial') === wantedKind);
        const incompatCurrent = entity.target
          ? patrols.find(p => p.id === entity.target && (p.kind ?? 'aerial') !== wantedKind)
          : null;
        return (
          <FormGroup
            label="Ruta (target)"
            helperText={
              incompatCurrent
                ? `⚠ La ruta actual es ${incompatCurrent.kind ?? 'aerial'}; este enemigo necesita ${wantedKind}.`
                : `Solo se listan rutas ${wantedKind === 'aerial' ? 'aéreas' : 'terrestres'} compatibles.`
            }
            style={{ marginBottom: 0 }}
          >
            <HTMLSelect
              fill
              value={entity.target ?? ''}
              onChange={(e) => setEnemyTarget(entity.id, e.currentTarget.value || null)}
            >
              <option value="">— sin ruta —</option>
              {compat.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.nodes.length} nodos)
                </option>
              ))}
              {incompatCurrent && (
                <option value={incompatCurrent.id}>
                  ⚠ {incompatCurrent.name} (incompatible)
                </option>
              )}
            </HTMLSelect>
          </FormGroup>
        );
      })()}

      <FormGroup
        label="Día aplicable"
        helperText="0 = todos los días. 1–5 = sólo cuenta en la validación de ese día (solapa Día)."
        style={{ marginBottom: 0 }}
      >
        <HTMLSelect
          fill
          value={String(entity.appliesDay ?? 0)}
          onChange={(e) => setEntityAppliesDay(entity.id, parseInt(e.currentTarget.value, 10))}
        >
          <option value="0">Todos los días</option>
          <option value="1">Sólo día 1</option>
          <option value="2">Sólo día 2</option>
          <option value="3">Sólo día 3</option>
          <option value="4">Sólo día 4</option>
          <option value="5">Sólo día 5</option>
        </HTMLSelect>
      </FormGroup>

      <Button
        icon="trash"
        intent="danger"
        small
        onClick={() => {
          if (confirm(`¿Eliminar la entidad ${entity.id}?`)) deleteEnemy(entity.id);
        }}
        style={{ marginTop: 4 }}
      >
        Eliminar entidad
      </Button>
    </div>
  );
}
