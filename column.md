# Columnas (reemplazo de cubos)

Cada celda emergida del mapa sigue siendo un cubo de **64×64×64** unidades, pero el renderizado pasa a usar **cinco texturas** en vez de una sola. Cuando varias celdas se apilan verticalmente para hacer una columna alta, las texturas se reparten **según la posición del cubo en la pila**: solo el cubo más alto lleva `top` + `capital`, solo el más bajo lleva `base` + `bottom`, y los intermedios usan únicamente `side`. El resultado es una sola columna continua, no varias columnitas apiladas.

```
                       ┌──────────────┐
                      ╱      [1]     ╱│
                     ╱     top      ╱ │   ◄── cubo SUPERIOR
                    ╱              ╱  │       top arriba +
                   ┌──────────────┐   │       4 caras laterales = capital
                   │              │   │
                   │     [3]      │[3]│
                   │   capital    │   │
                   │              │   │
                   ├──────────────┤───┤   ◄── cubo MEDIO
                   │              │   │       4 caras laterales = side
                   │     [2]      │[2]│
                   │     side     │   │
                   │              │   │
                   ├──────────────┤───┤   ◄── cubo INFERIOR
                   │              │   │       4 caras laterales = base +
                   │     [4]      │[4]│       bottom abajo
                   │     base     │   │
                   │              │  ╱
                   └──────────────┘ ╱
                                  ╱
                               [5] bottom (oculto contra el suelo)
```

## Texturas

| #  | Key       | Aparece en…                                                       | Visible normal |
|----|-----------|-------------------------------------------------------------------|----------------|
| 1  | `top`     | Cara superior del cubo más alto de la pila                        | Sí             |
| 2  | `side`    | Las 4 caras laterales de los cubos **intermedios** (fuste)         | Sí             |
| 3  | `capital` | Las 4 caras laterales del cubo **más alto**                        | Sí             |
| 4  | `base`    | Las 4 caras laterales del cubo **más bajo**                        | Sí             |
| 5  | `bottom`  | Cara inferior del cubo más bajo                                   | No (contra el suelo) |

## Casos según altura de la pila

- **1 cubo** — el mismo cubo es a la vez "más alto" y "más bajo". Convención: las 4 caras laterales usan `capital`, más `top` arriba y `bottom` abajo. 

- **2 cubos** — cubo superior: `top` + 4 caras `capital`. Cubo inferior: 4 caras `base` + `bottom`. Sin tramo `side`.

- **N≥3 cubos** — cubo superior y cubo inferior como en el caso de 2; los `N−2` cubos intermedios usan `side` en las 4 caras laterales.

## Notas

- `capital`, `side` y `base` aplican **a la cara lateral entera**, no son bandas dentro de una cara común — cambian la textura de los 4 quads laterales completos del cubo correspondiente.
- `top` y `bottom` de cubos intermedios no se renderizan porque están ocluidos por sus vecinos verticales — el writer puede omitir esos quads directamente.
- `bottom` del cubo inferior tampoco se ve nunca en condiciones normales (queda contra el bedrock), pero se incluye en el modelo para el caso en que una celda vecina lateral esté más baja y deje la solera expuesta.

## Convenciones de nombres

Todos los identificadores se escriben **en inglés**, en minúsculas. Cuatro capas, cada una con su propia regla:

### 1. Claves JS (caras del cubo)

Palabras únicas, sin separadores. Coinciden con las etiquetas del diagrama:

```
top   side   capital   base   bottom
```

### 2. Archivos PNG en disco

Subcarpeta por bioma dentro de `modeditor/src/renderer/assets/textures/`, un archivo por cara:

```
assets/textures/
  soil/
    top.png
    side.png
    capital.png
    base.png
    bottom.png
  sand/
    top.png
    …
  house/         ← edificios entran como un bioma más
    top.png
    …
```

### 3. Nombres de textura Quake

Patrón `<id>_<face>`, todo snake_case. Quake no permite guiones en los nombres, así que cualquier `-` del id se convierte en `_`:

```
soil_top      soil_side      soil_capital      soil_base      soil_bottom
road_up_top   road_up_side   road_up_capital   road_up_base   road_up_bottom
house_top     house_side     house_capital     house_base     house_bottom
```

### 4. Estructura del PALETTE entry

Cada entrada de `PALETTE` lleva sus 5 texturas explícitamente:

```js
{
  id: 'soil',
  label: 'Soil',
  color: '#7a5a3a',
  tex: {
    top:     'soil_top',
    side:    'soil_side',
    capital: 'soil_capital',
    base:    'soil_base',
    bottom:  'soil_bottom',
  },
}
```

Para no repetir el bloque por cada bioma, un helper deriva los 5 nombres a partir del id:

```js
function texturesFor(id) {
  const s = id.replace(/-/g, '_');
  return {
    top:     `${s}_top`,
    side:    `${s}_side`,
    capital: `${s}_capital`,
    base:    `${s}_base`,
    bottom:  `${s}_bottom`,
  };
}
```

### Texturas sistémicas (no por bioma)

`sky`, `water` y `bedrock` no son biomas — se quedan con sus nombres históricos para no romper los WADs ya cargados:

```
SKY_TEXTURE     = 'sky_auto'
WATER_TEXTURE   = '*water'
BEDROCK_TEXTURE = 'dirt'
```

### Migración del arte existente

Al preparar el sistema se crean **todos** los archivos de una vez — carpetas por bioma y los 5 PNGs por cara, sin huecos. Cada archivo se obtiene así:

- **Copiando el PNG monolítico existente** (`soil.png`, `sand.png`, …) a las 5 caras del bioma. Las columnas se ven uniformes hasta que se reemplacen archivos individuales.
- **Generándolo de cero** (placeholder de color sólido o patrón mínimo) cuando no hay PNG existente del bioma — por ejemplo `house/`, que actualmente no tiene un PNG monolítico.

Así el árbol de assets queda completo desde el primer commit del cambio y el cargador no necesita lógica de fallback en runtime: si un PNG falta, es un error real, no un caso esperado. Las texturas definitivas se van introduciendo archivo a archivo sustituyendo los placeholders.
