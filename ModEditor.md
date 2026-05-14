# ModEditor

Editor de mapas para el mod **Uplifter** (ver [Uplifter.md](Uplifter.md) para el diseño del mod). Basado en [atlasmapper](../atlasmaper/) pero **simplificado** y orientado al caso de uso: escenarios al aire libre vistos desde un helicóptero, sin interiores complejos.

## Modelo de datos

El mapa es una rejilla 2D. Cada celda `[x, y]` tiene:

- **Una textura** (única — no hay capas de pintura).
- **Una altura** (entero, en unidades de la rejilla).
- **Opcionalmente** un objeto especial o un terreno especial de suavizado (mutuamente excluyentes):
  - **Objetos especiales:** casa, rascacielos, lámpara, árbol, arbusto, roca.
  - **Terreno especial (suavizado):** rampa, bevel, prisma.

> Diferencia clave con atlasmapper: aquí no hay capas verticales apilables. La altura es un campo escalar por celda; los muros se derivan de los desniveles entre celdas vecinas.

### Inicialización

Al crear un mapa, **todo el territorio arranca con altura -1** — todas las celdas quedan por debajo de `SEA_LEVEL` y se renderizan como océano (ver "Agua y nivel del mar"). El diseñador esculpe tierra subiendo celdas por encima del nivel del mar.

## Paleta de texturas

Selector con los tipos base:

- `tierra`, `arena`, `agua`
- `road-up`, `road-down-left`, `road-x` (tiles de carretera direccionales)
- `metal`, `plaza`

## Vistas

### Vista 2D (top-down)

Vista principal de edición. Pintas texturas y colocas objetos especiales sobre la rejilla.

### Visor de alturas

Modo dedicado a alterar la altura de las celdas:

- **Pintar altura** — sube/baja celdas individualmente.
- **Suavizar** — promedia alturas con vecinas para crear pendientes.

### Viewport 3D

Vista WebGL2 para previsualizar la geometría exacta que se compilará. Ver "Controles 3D" abajo.

## Patrullas (pathways)

Editor de patrullas para IA enemiga (los helicópteros, tanques y aviones del mod — ver [Uplifter.md](Uplifter.md)).

- Una patrulla es una lista ordenada de **nodos**.
- Cada nodo se conecta al **anterior** mediante una línea visible en la vista 2D.
- El **último nodo cierra el ciclo** conectándose al primero (las patrullas son bucles).
- Se pueden **añadir y quitar nodos** individuales.
- Se pueden **borrar patrullas** enteras.

## Controles del editor

- **Selector de textura** — el tipo activo para pintar.
- **Selector de modo** — 2D / alturas.
- **Input de luz** — intensidad y dirección de la luz solar del mapa (escribe `_sun_*` en `worldspawn`).
- **Selector de calidad** — alta / baja (ajusta flags de `light`: supersampling, sombras suaves).
- **Botón Compilar** — genera el `.bsp`.
- **Botón Lanzar juego** — arranca ironwail con el mapa actual.

## Geometría generada

El mundo se sella con una caja de geometría fija, del tamaño exacto de la zona jugable (**±16384**, ver [Uplifter.md](Uplifter.md)). La caja física y el área de juego coinciden — el colchón frente al `-worldextent` del compilador es puramente para qbsp.

| Brush | Posición | Textura | Función |
|---|---|---|---|
| 4 paredes laterales | perímetro ±16384, de `floorBottomZ` a `skyTopZ` | `sky` | Skybox visible + sellan los lados |
| Techo | a `skyTopZ` | `sky` | Cúpula celeste + sella por arriba |
| Bedrock | losa sólida bajo el agua, espesor `SKY_WALL_THICKNESS` | `tierra` | Sella por debajo (ver más abajo) |
| Agua global | de bedrock hasta `SEA_LEVEL` | `*water0` | Océano jugable |
| Brushes de terreno | por celda, encima del agua | (textura de la celda) | Solo celdas con `altura ≥ SEA_LEVEL` |

### Agua y nivel del mar

Existe la constante **`SEA_LEVEL`** (`Z = 0`, alineada con `floorBottomZ` — 1 celda por debajo del nivel base del terreno en `FLOOR_Z = 64`). **Toda celda con `altura < SEA_LEVEL` es automáticamente agua**, sin que el diseñador tenga que pintarla. Pintar `agua` en una celda es azúcar sintáctico para fijarle altura `-1`.

Para no generar 160k brushes cuando el mapa es 470×470 celdas, el agua se modela con **un único brush global** que cubre todo el mundo. Las celdas sub-nivel **no emiten brush propio** — el brush global ya ocupa ese volumen. Las celdas con `altura ≥ SEA_LEVEL` emiten su brush de terreno encima; qbsp recorta el plano del agua donde la tierra emerge.

El fondo submarino es plano (la cara superior del bedrock) — no se ve desde un helicóptero. Si hace falta profundidad distinta en un punto (puerto hondo, bajío), se modela como **brush local** que perfora la lámina, no como variación de tile.

### Por qué el bedrock es obligatorio

Las caras líquidas (`*water*`) son transparentes para vis — el motor las dibuja translúcidas y vis las ignora para PVS. Sin bedrock, vis vería el universo abierto y `-leaktest` reventaría. La losa de `tierra` bajo el agua es opaca a vis y deja el mapa estanco — el equivalente inferior de las paredes `sky`.

### Modelo de datos vs. writer

Es una optimización del `.map` writer, no un cambio en el modelo de datos: las celdas sub-nivel se siguen pintando como tile azul en el editor 2D para feedback visual. La UX de edición no cambia.

## Tecnología

ModEditor es una aplicación **Electron** (igual que atlasmapper), pero la UI se rehace en **React + BlueprintJS**. Las terminaciones de atlasmapper se sentían "HTML 2.0"; BlueprintJS da look y densidad de aplicación de escritorio de verdad — paneles, trees, hotkeys, dialogs pensados para herramientas (Palantir, Linear), no para landing pages.

### Stack

- **Electron** — main process en Node. Se reusa el código de atlasmapper: `mapWriter.js`, `compileTools.js`, `wadLoader.js`, `wadWriter.js`, `deployBsp.js`.
- **React** — todo el árbol de UI del renderer es React (sin convivencia con JS imperativo "a parches").
- **BlueprintJS** — componentes para paneles, paleta, tree de patrullas, dialogs, menús, hotkeys.
- **WebGL2** — viewport 3D (un VBO/IBO + atlas, shader Lambert), heredado de atlasmapper.
- **Canvas 2D** — vista top-down + visor de alturas.

### React vs. canvas

React maneja todo **menos el dibujo del mundo**. Los tres canvas (`<Canvas2D/>`, `<Heightmap/>`, `<Viewport3D/>`) son componentes React que montan el canvas en `useEffect` y delegan el render directamente a WebGL / Canvas2D. Es la única zona imperativa.

### Por qué no Tauri, Vue, Svelte

- **Tauri** implicaría reescribir el host (Node → Rust) por una ganancia que no nos importa (binario más pequeño, menos RAM). Coste alto, beneficio bajo.
- **Vue / Svelte** son razonables, pero BlueprintJS solo existe para React — y la decisión arrancó por la librería, no por el framework.

## Controles 3D

El viewport 3D **no captura el ratón** (sin `requestPointerLock`). Pointer lock es cómodo jugando, pero incómodo en una herramienta — pierdes el cursor, no puedes ver paneles a la vez, no puedes alt-tab limpio.

### Modelo TrenchBroom

Lo que esperan los mappers de Quake con experiencia:

- **Click derecho mantenido + arrastrar** = mirar alrededor (mouselook sin captura — `cursor: none` mientras está pulsado, vuelve al soltar).
- **Click central mantenido + arrastrar** = pan.
- **Shift + click central + arrastrar** = orbit alrededor del punto pivote.
- **Rueda** = zoom (dolly hacia delante/atrás).
- **WASD + Espacio/Ctrl + Shift** = fly-look, **activo solo mientras click derecho está mantenido** (modo fly temporal).

### Modo orbital

Para revisar sin tener que volar:

- **Click izquierdo arrastrando** sobre el viewport (sin click derecho) = orbita la cámara alrededor del punto que el ratón apuntaba al iniciar el drag (estilo Sketchfab / Three.js editor).
- **Botones de viewport** en una esquina — `top` / `front` / `side` / `iso` dan vistas predefinidas instantáneas.

### Detalle técnico

- `mousedown` (botón derecho) → `cursor: none`, empieza a leer deltas.
- `mousemove` → `event.movementX / movementY` da el delta sin necesitar pointer lock.
- `mouseup` → restaura el cursor.
- **Wrap en bordes:** si el cursor llega al borde del viewport durante un mouselook largo, se usa `setPointerCapture()` (no `requestPointerLock`) para que los eventos sigan llegando aunque el cursor salga visualmente. Alternativa: aceptar que hay que soltar y reclicar (es lo que hace Blender).

## Compilación

- **Siempre optimiza.** No hay diálogo de confirmación ni opción de saltar la optimización.
- Pipeline heredado de atlasmapper: `qbsp` → `vis` → `light`.
- **Flags fijos de qbsp:** `-bsp2 -subdivide 1024 -worldextent 32768 -leaktest`. El valor `1024` es deliberado y arregla dos problemas a la vez:
  - El **default 240** revienta qbsp en `EmitEdges` para las caras gigantes del world box (sky, bedrock, agua de ±16384): tras T-junctions, las subcaras acaban con > 64 vértices.
  - **`-nosubdivide`** evita el aborto pero deja caras enormes intactas, lo que dispara `Bad surface extents` en quakespasm/ironwail al cargar (límite duro del lightmap atlas: 256×256 luxels por cara).
  - **`1024`** parte las caras lo suficiente para mantenerlas por debajo de los 64 vértices/cara que tolera qbsp **y** los 256×256 luxels que tolera el motor.
- **Flags de light** según el selector de calidad: alta usa `-soft -extra4`, baja sin flags.
- **`worldspawn`** incluye siempre: `"protocol" "666"` y la `"sky"` del mod ([Uplifter.md](Uplifter.md)).

## Referencias

- [Uplifter.md](Uplifter.md) — diseño del mod (premisa, mundo, escala).
- [atlasmapper README](../atlasmaper/README.md) — editor base del que se simplifica.
