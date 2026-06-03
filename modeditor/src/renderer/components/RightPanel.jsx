import React, { useState, useEffect, useRef } from 'react';
import { FormGroup, Button, ButtonGroup } from '@blueprintjs/core';

import {
  useStore,
  getTilemap,
  setSun,
  setQuality,
  getMode,
} from '../state/store.js';
import { PatrolPanel } from './PatrolPanel.jsx';
import { EntityPanel } from './EntityPanel.jsx';
import { NodePanel } from './NodePanel.jsx';

/** Plain text input — no spinner buttons, no clamp pingers. */
function TextField({ value, onChange }) {
  return (
    <input
      className="bp5-input"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      style={{ width: '100%' }}
    />
  );
}

/**
 * Numeric field with local string state.
 *
 * The user types freely (including transient invalid states like "" or
 * "-") and the local string drives the input. Valid integers are
 * committed upstream via onCommit on each keystroke.
 *
 * The trap: a naïve `useEffect(() => setText(String(value)), [value])`
 * fights the user — after every commit, value updates upstream, the
 * effect fires and overwrites the typed text with the canonicalised
 * number. So Backspace (e.g. "250" → "25") gets immediately undone.
 *
 * Fix: only resync from upstream when the new value is genuinely
 * external (i.e. different from what we last committed ourselves).
 * We compare against a ref of the last-committed number so our own
 * round-trip is silently ignored.
 */
function NumberField({ value, onCommit, min }) {
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
      className="bp5-input"
      value={text}
      onChange={(e) => {
        const s = e.target.value;
        setText(s);
        const n = parseInt(s, 10);
        if (Number.isFinite(n) && (min === undefined || n >= min)) {
          lastCommittedRef.current = n;
          onCommit(n);
        }
      }}
      onBlur={() => {
        // Snap back to the committed value if the user left the field
        // in an invalid state.
        const n = parseInt(text, 10);
        if (!Number.isFinite(n)) setText(String(value));
      }}
      style={{ width: '100%' }}
    />
  );
}

export function RightPanel() {
  const tilemap = useStore(() => getTilemap());
  const mode = useStore(() => getMode());
  const sun = tilemap.sun;
  const quality = tilemap.quality;

  return (
    <>
      {mode === 'patrol' && <PatrolPanel />}
      {mode === 'entities' && <EntityPanel />}
      {/* NodePanel se muestra en ambos modos cuando hay un nodo
          seleccionado. Mostrar el mismo panel en los dos sitios mantiene
          la UX consistente: el panel de propiedades es el panel de
          propiedades, da igual desde donde lo seleccionaste. */}
      {(mode === 'patrol' || mode === 'entities') && <NodePanel />}
      <div className="panel">
        <div className="panel-title">Luz solar</div>
        <FormGroup label="Intensidad">
          <NumberField value={sun.intensity} min={0} onCommit={(n) => setSun({ intensity: n })} />
        </FormGroup>
        <FormGroup label="Min-light" helperText="Mínimo de iluminación; 0 desactiva.">
          <NumberField value={sun.minlight ?? 0} min={0} onCommit={(n) => setSun({ minlight: n })} />
        </FormGroup>
      </div>

      <div className="panel">
        <div className="panel-title">Calidad</div>
        <ButtonGroup fill>
          <Button
            active={quality === 'flat'}
            intent={quality === 'flat' ? 'primary' : 'none'}
            onClick={() => setQuality('flat')}
            icon="layout-grid"
            title="Terreno aplanado (2 alturas), sin edificios ni decoración. La compilación más rápida — para testear gameplay."
          >
            Flat
          </Button>
          <Button
            active={quality === 'fast'}
            intent={quality === 'fast' ? 'primary' : 'none'}
            onClick={() => setQuality('fast')}
            icon="flash"
          >
            Low
          </Button>
          <Button
            active={quality === 'hq'}
            intent={quality === 'hq' ? 'primary' : 'none'}
            onClick={() => setQuality('hq')}
            icon="clean"
          >
            High
          </Button>
        </ButtonGroup>
      </div>

      <div className="panel">
        <div className="panel-title">Mapa</div>
        <div style={{ fontSize: 12, color: '#a7b6c9' }}>
          Rejilla: {tilemap.cols}×{tilemap.rows} celdas<br/>
          Celda: {tilemap.cellSize}u<br/>
          Mundo: ±16384u
        </div>
      </div>
    </>
  );
}
