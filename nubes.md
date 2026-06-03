# Plan: capa volumétrica de nubes (10 layers, cumulonimbo procedural)

## Resumen

Nube semi-volumétrica generada en el writer del editor — una banda horizontal compacta a altura fija, compuesta de **10 capas apiladas en 256 u** (cada 25 u en Z), donde cada capa es un **clúster aleatorio de brushes** con su **propia textura** procedural. Todo metido en un `func_detail_illusionary` para no impactar BSP/vis y para que el heli las atraviese sin colisión.

---

## 1. Texturas: 10 variantes procedurales en wadWriter.js

10 texturas `cloud_0` ... `cloud_9`, todas 64×64 o 128×128, generadas con ruido determinista (semilla por índice). Cada textura:

- **Base**: blanco-grisáceo (RGB 200-240, gris claro).
- **Bordes**: degradado a transparente. Píxeles fuera del "cuerpo de la nube" usan **color #255 de la paleta de Quake** (es el color "fence" reservado para alpha).
- **Variación por índice**: cada `cloud_i` usa un ruido distinto (perlin 2D con semilla `i`), bordes más o menos difusos, ligero tinte hacia azul-gris en las capas inferiores y hacia blanco puro en las superiores (sugerencia de luz cenital).

Las texturas con prefijo `{` en su nombre (`{cloud_0`) son interpretadas por qbsp/ironwail como **fence textures** — el color de paleta 255 se renderiza transparente en lugar de pintarse. Es como funciona Quake estándar para celdas, etc.

**Coste**: 10 entries más en la WAD, ~10 KB en total. Despreciable.

---

## 2. Constantes nuevas en `types.js`

```js
const CLOUD_LAYER_Z = SKY_TOP_Z - 600;   // banda centrada aquí
const CLOUD_LAYER_COUNT = 10;            // 10 layers
const CLOUD_LAYER_SPACING = 25;          // 25u entre capas → banda total 250u
const CLOUD_BRUSH_SIZE = 1024;           // cada brush ~1024×1024 (vista aérea)
const CLOUD_BRUSH_THICKNESS = 8;         // grosor del brush (necesita > 0 para qbsp)
const CLOUD_CLUSTER_COUNT = 25;          // 25 brushes por capa
const CLOUD_FIELD_HALF = 14000;          // dispersión XY ±14000 (no llegan a paredes)
```

Total brushes nube = 10 × 25 = **250**. Muy manejable.

---

## 3. Función `emitClouds()` en mapWriter.js

Genera los brushes y los añade a un nuevo array `cloudBrushes` (igual que `minimapVisualBrushes`). Como toda la nube es `func_detail_illusionary`, no entra en BSP ni en vis.

**Pseudo-código**:

```js
function emitClouds({ cloudBrushes, xMin, xMax, yMin, yMax }) {
  // Random determinista (no Math.random — no debe variar entre compiles).
  // Uso mulberry32 con seed fija para que el mismo mapa genere las
  // mismas nubes en cada compile (cache de geometría se preserva).
  const rand = mulberry32(0xC10D5EED);

  for (let layer = 0; layer < CLOUD_LAYER_COUNT; layer++) {
    const layerZ = CLOUD_LAYER_Z + (layer - CLOUD_LAYER_COUNT/2) * CLOUD_LAYER_SPACING;
    const texName = `{cloud_${layer}`;

    for (let i = 0; i < CLOUD_CLUSTER_COUNT; i++) {
      // Posición aleatoria dentro del campo, pero dentro de los límites
      // del worldspawn (xMin/xMax). Tamaño con variación ±25%.
      const cx = rand_range(rand, Math.max(xMin, -CLOUD_FIELD_HALF),
                                  Math.min(xMax, +CLOUD_FIELD_HALF));
      const cy = rand_range(rand, Math.max(yMin, -CLOUD_FIELD_HALF),
                                  Math.min(yMax, +CLOUD_FIELD_HALF));
      const sx = CLOUD_BRUSH_SIZE * (0.75 + rand() * 0.5);
      const sy = CLOUD_BRUSH_SIZE * (0.75 + rand() * 0.5);

      cloudBrushes.push(boxBrush(
        { minX: cx - sx/2, maxX: cx + sx/2,
          minY: cy - sy/2, maxY: cy + sy/2,
          minZ: layerZ, maxZ: layerZ + CLOUD_BRUSH_THICKNESS },
        texName,
      ));
    }
  }
}
```

**Importante**: `rand` con seed fija (`0xC10D5EED`) para que la disposición sea **determinista** — el mismo mapa siempre genera la misma nube. Eso permite que el cache de compilación (`compileCache`) detecte que la geometría no cambia y use ruta rápida.

---

## 4. Emisión del `func_detail_illusionary`

Igual que `minimapVisualBrushes`: declaramos `cloudBrushes` antes de la llamada a `emitClouds`, y después de cerrar worldspawn emitimos:

```js
if (cloudBrushes.length > 0) {
  out.push('{');
  out.push('"classname" "func_detail_illusionary"');
  out.push('"_phong" "0"');           // sin phong: las nubes son planas
  out.push('"_dirt" "0"');            // sin dirt-mapping
  out.push('"_minlight" "200"');      // bien iluminadas siempre
  out.push('"_shadow" "0"');          // no proyectan sombra
  for (const b of cloudBrushes) out.push(b);
  out.push('}');
}
```

`_shadow 0` es importante: si una capa proyecta sombra sobre la siguiente, se ven líneas oscuras antiestéticas y `light` tarda muchísimo más.

`_minlight 200` asegura que las nubes se iluminen uniformemente sin necesidad de calcular luz por luxel (la luz del sol no las ilumina bien al ser fence textures finas).

---

## 5. Render order y z-fighting

Las 10 capas están separadas por 25u → no hay z-fighting real (qbsp solo lo provoca cuando los planos son coplanares). Pero el orden de dibujado importa para el alpha blending:

- En `func_detail_illusionary`, ironwail dibuja en orden de inserción dentro del entity.
- Si dibujamos primero las capas inferiores (Z más bajo), arriba se ve la suma de las inferiores y luego la actual. Eso es lo correcto cuando se mira de abajo arriba.
- Ningún cambio extra: el loop por capas las emite ya en orden Z ascendente.

---

## 6. Compatibilidad con cache de compilación

El cache (`compileCache`) calcula `geomHash` sobre el tilemap + algunos flags. **Las nubes solo dependen del seed y de las constantes**, no del tilemap. Como son deterministas, dos compilaciones del mismo mapa generan las mismas nubes → el hash sigue siendo estable → cache funciona.

Si en algún momento queremos exponer una semilla configurable por mapa (para variar nubes entre escenarios), se añade `tilemap.cloudSeed` y se incluye en el `geomHash`.

---

## 7. Coste estimado en compilación

- **Brushes**: 250 (insignificante frente a los 90 000+ del terreno).
- **Vis**: 0 portales nuevos (todo en `func_detail_illusionary`).
- **Light**: 250 brushes × 6 caras × N luxels por cara. Con `_minlight 200` y `_shadow 0`, `light` los procesa muy rápido — apenas unos segundos extra.
- **BSP**: 0 nodos nuevos.

Total impacto: probablemente +5-10s en `light`, negligible en `qbsp`/`vis`.

---

## 8. Cosas a vigilar

- **`{` prefix** debe estar soportado por la versión de qbsp/ironwail que usas. Verifiqué que ironwail lo soporta, pero conviene comprobarlo en el primer compile.
- **Color de paleta #255**: en la paleta Quake estándar es `(159, 91, 83)` (rosa medio). Hay que pintar las zonas transparentes con ese color exacto. wadWriter.js ya tiene helpers para esto.
- **FOV alto** (>90) puede hacer que las capas se vean planas. El parallax funciona mejor a FOV 70-90.
- **Si el jugador vuela muy rápido**, las 10 capas parpadean. Solución: capas más juntas (10u en vez de 25u) o motion blur (no disponible en ironwail vanilla).

---

## 9. Orden de implementación sugerido

1. Añadir las 10 texturas procedurales en `wadWriter.js` (función `tintedEntry` ya existe).
2. Añadir las constantes en `types.js` y exportarlas.
3. Implementar `emitClouds()` en `mapWriter.js`.
4. Declarar `cloudBrushes` y emitir el `func_detail_illusionary` al final.
5. Compilar y verificar visualmente.
6. Iterar: ajustar `CLOUD_LAYER_Z`, número de clústeres, alpha de las texturas si las nubes se ven mal.
