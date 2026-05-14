import React, { useEffect, useRef } from 'react';

export function LogPanel({ entries }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [entries]);

  return (
    <div ref={ref} style={{ height: '100%', overflowY: 'auto', padding: '4px 0' }}>
      {entries.length === 0 && (
        <div className="log-line meta">Listo. Pulsa Compilar para construir el .bsp.</div>
      )}
      {entries.map((e, i) => (
        <div key={i} className={`log-line ${e.stream}`}>
          [{e.tool}] {e.line}
        </div>
      ))}
    </div>
  );
}
