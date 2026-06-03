import React from 'react';
import { Card, Icon, Tag, Callout, Divider } from '@blueprintjs/core';

import {
  useStore,
  getTilemap,
  getDaySelected,
  setSelectedEnemy,
} from '../state/store.js';

/**
 * Vista a página entera (sustituye el Canvas2D) que muestra el checklist
 * de requisitos del mapa para el día seleccionado en el ribbon "Día".
 *
 * Cada regla se evalúa contra `tilemap.enemies` (que contiene también las
 * entidades `info_*`). Una regla puede ser:
 *   - `min`: cuenta de entidades por classname ≥ N
 *   - `max`: cuenta de entidades por classname ≤ N
 *   - `exact`: cuenta == N
 *   - `composite`: regla manual con función evaluadora
 *
 * El "día" de una entidad sale de:
 *   - info_enemy_slot: activateDay (su día mínimo)
 *   - resto: appliesDay (0 = aplica a todos los días)
 *
 * Las reglas globales (puntos de descarga, carrier, representante) se
 * aplican a TODOS los días porque el mapa los necesita siempre.
 */

const RULES_GLOBAL = [
  {
    id: 'ships',
    label: '3 info_ship en mar abierto',
    classname: 'info_ship',
    min: 3,
    why: 'Barcos hospital. Punto de descarga seguro.',
  },
  {
    id: 'hospitals',
    label: '2 info_hospital en Davenport',
    classname: 'info_hospital',
    min: 2,
    why: 'Hospitales en tierra. Más rápidos pero vulnerables.',
  },
  {
    id: 'carrier',
    label: '1 info_carrier en el mar (día 5)',
    classname: 'info_carrier',
    exact: 1,
    why: 'Portaaviones USA del día 5. Aterrizar aquí cierra el juego.',
  },
  {
    id: 'representative',
    label: '1 info_representative en Davenport',
    classname: 'info_representative',
    exact: 1,
    why: 'NPC nombrado del día 5.',
  },
  {
    id: 'pickups',
    label: '≥4 info_pickup',
    classname: 'info_pickup',
    min: 4,
    why: 'Zonas de civiles. Como mínimo 4 para que el random no sea aburrido.',
  },
  {
    id: 'scrap',
    label: '≥8 info_scrap',
    classname: 'info_scrap',
    min: 8,
    why: 'Chatarra para curación pasiva.',
  },
];

/**
 * Reglas por día. Cada una se aplica solo si el día seleccionado coincide
 * con el suyo (o si `appliesToAllDays`).
 */
const RULES_PER_DAY = {
  1: [
    {
      id: 'd1-low-slots',
      label: 'Pocos slots de día 1 (≤8)',
      max: 8,
      filter: (e) => e.kind === 'info_enemy_slot' && (e.activateDay ?? 1) === 1,
      why: 'Día 1 introduce el verbo: presencia enemiga ligera.',
    },
  ],
  2: [
    {
      id: 'd2-slots-mix',
      label: '≥10 info_enemy_slot activables en día 2 o antes',
      min: 10,
      filter: (e) => e.kind === 'info_enemy_slot' && (e.activateDay ?? 1) <= 2,
      why: 'Día 2 introduce variedad y presión sostenida.',
    },
  ],
  3: [
    {
      id: 'd3-slots-mix',
      label: '≥15 info_enemy_slot activables en día 3 o antes',
      min: 15,
      filter: (e) => e.kind === 'info_enemy_slot' && (e.activateDay ?? 1) <= 3,
      why: 'Día 3 cae el primer hospital — el mapa debe sentirse hostil.',
    },
    {
      id: 'd3-rad-slots',
      label: '≥2 slots monster_rad activables en día 3 o antes',
      min: 2,
      filter: (e) => e.kind === 'info_enemy_slot'
        && (e.activateDay ?? 1) <= 3
        && (e.enemyKind ?? 'monster_aag') === 'monster_rad',
      why: 'Radares para que el sigilo importe a partir del día 3.',
    },
  ],
  4: [
    {
      id: 'd4-slots-mix',
      label: '≥20 info_enemy_slot activables en día 4 o antes',
      min: 20,
      filter: (e) => e.kind === 'info_enemy_slot' && (e.activateDay ?? 1) <= 4,
      why: 'Día 4 es el clímax: presión sistémica máxima.',
    },
    {
      id: 'd4-sam-slots',
      label: '≥3 slots monster_sam activables en día 4 o antes',
      min: 3,
      filter: (e) => e.kind === 'info_enemy_slot'
        && (e.activateDay ?? 1) <= 4
        && (e.enemyKind ?? 'monster_aag') === 'monster_sam',
      why: 'Día 4 introduce misiles SAM como amenaza principal.',
    },
  ],
  5: [
    {
      id: 'd5-slots-mix',
      label: '≥25 info_enemy_slot activables en día 5 o antes',
      min: 25,
      filter: (e) => e.kind === 'info_enemy_slot' && (e.activateDay ?? 1) <= 5,
      why: 'Día 5: el mapa debe estar saturado de amenazas.',
    },
    {
      id: 'd5-carrier-far',
      label: 'info_carrier alejado del centro del mapa (≥3000u)',
      composite: (enemies, tilemap) => {
        const carriers = enemies.filter(e => e.kind === 'info_carrier');
        if (carriers.length === 0) {
          return { ok: false, detail: 'No hay info_carrier.' };
        }
        const cellSize = tilemap.cellSize || 64;
        const cx = (tilemap.cols / 2) * cellSize;
        const cy = (tilemap.rows / 2) * cellSize;
        const far = carriers.find(c => {
          const ex = (c.col + 0.5) * cellSize;
          const ey = (c.row + 0.5) * cellSize;
          const d = Math.hypot(ex - cx, ey - cy);
          return d >= 3000;
        });
        if (far) {
          return { ok: true, detail: 'Distancia OK.' };
        }
        return { ok: false, detail: 'Carrier demasiado cerca del centro; el viaje final debe sentirse largo.' };
      },
      why: 'El último vuelo debe ser significativo, no trivial.',
    },
  ],
};

function ruleResult(rule, enemies, tilemap) {
  if (rule.composite) {
    return rule.composite(enemies, tilemap);
  }
  let matches;
  if (rule.classname) {
    matches = enemies.filter(e => e.kind === rule.classname);
  } else if (rule.filter) {
    matches = enemies.filter(rule.filter);
  } else {
    return { ok: false, detail: 'Regla mal configurada.' };
  }
  const n = matches.length;
  if (rule.exact != null) {
    return {
      ok: n === rule.exact,
      detail: `${n} encontradas (se esperan exactamente ${rule.exact}).`,
      matches,
    };
  }
  if (rule.min != null && rule.max != null) {
    const ok = n >= rule.min && n <= rule.max;
    return {
      ok,
      detail: `${n} encontradas (rango ${rule.min}–${rule.max}).`,
      matches,
    };
  }
  if (rule.min != null) {
    return {
      ok: n >= rule.min,
      detail: `${n} encontradas (mínimo ${rule.min}).`,
      matches,
    };
  }
  if (rule.max != null) {
    return {
      ok: n <= rule.max,
      detail: `${n} encontradas (máximo ${rule.max}).`,
      matches,
    };
  }
  return { ok: false, detail: 'Regla sin umbral.' };
}

function RuleItem({ rule, result }) {
  return (
    <Card
      style={{
        padding: 10,
        marginBottom: 6,
        background: result.ok ? '#1f2d22' : '#2d1f1f',
        borderLeft: `3px solid ${result.ok ? '#3e9d4c' : '#c44d4d'}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon
          icon={result.ok ? 'tick-circle' : 'cross-circle'}
          color={result.ok ? '#3e9d4c' : '#c44d4d'}
          size={18}
        />
        <strong style={{ flex: 1 }}>{rule.label}</strong>
        <Tag minimal>{result.ok ? 'OK' : 'Pendiente'}</Tag>
      </div>
      <div style={{ marginTop: 4, fontSize: 12, color: '#a7b6c9' }}>
        {result.detail}
      </div>
      {rule.why && (
        <div style={{ marginTop: 2, fontSize: 11, fontStyle: 'italic', color: '#8da0b8' }}>
          {rule.why}
        </div>
      )}
      {result.matches && result.matches.length > 0 && result.matches.length <= 8 && (
        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {result.matches.map(m => (
            <button
              key={m.id}
              className="bp5-button bp5-small bp5-minimal"
              onClick={() => setSelectedEnemy(m.id)}
              style={{ fontSize: 11 }}
            >
              {m.id} · ({m.col},{m.row})
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

export function DayChecklistView() {
  const tilemap = useStore(() => getTilemap());
  const day = useStore(() => getDaySelected());
  const enemies = tilemap.enemies || [];

  const globalResults = RULES_GLOBAL.map(r => ({
    rule: r,
    result: ruleResult(r, enemies, tilemap),
  }));
  const dayRules = RULES_PER_DAY[day] || [];
  const dayResults = dayRules.map(r => ({
    rule: r,
    result: ruleResult(r, enemies, tilemap),
  }));

  const allResults = [...globalResults, ...dayResults];
  const okCount = allResults.filter(x => x.result.ok).length;
  const totalCount = allResults.length;
  const allOk = okCount === totalCount;

  return (
    <div
      style={{
        height: '100%',
        overflow: 'auto',
        padding: 16,
        background: '#1a2231',
        color: '#dde4ef',
      }}
    >
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <h2 style={{ marginTop: 0, color: '#e8eef7' }}>
          Validación — Día {day}
        </h2>
        <Callout
          intent={allOk ? 'success' : 'warning'}
          icon={allOk ? 'tick-circle' : 'warning-sign'}
          style={{ marginBottom: 16 }}
        >
          <strong>{okCount}/{totalCount}</strong> reglas cumplidas.
          {allOk
            ? ' El mapa está listo para este día.'
            : ' Faltan elementos para que la sesión funcione correctamente.'}
        </Callout>

        <h3 style={{ color: '#e8eef7' }}>Globales (todos los días)</h3>
        {globalResults.map(({ rule, result }) => (
          <RuleItem key={rule.id} rule={rule} result={result} />
        ))}

        <Divider style={{ margin: '16px 0' }} />

        <h3 style={{ color: '#e8eef7' }}>Específicas del día {day}</h3>
        {dayResults.length === 0 ? (
          <div style={{ fontSize: 12, color: '#a7b6c9', fontStyle: 'italic' }}>
            No hay reglas específicas para este día. El cumplimiento global basta.
          </div>
        ) : (
          dayResults.map(({ rule, result }) => (
            <RuleItem key={rule.id} rule={rule} result={result} />
          ))
        )}
      </div>
    </div>
  );
}
