# Uplifter

Mod para **Quake** (motor ironwail) basado en **Airquake**. El jugador parte de una barcaza, despega en un helicóptero y vuela hasta una zona de guerra donde fotografía crímenes de guerra, rescata civiles, y vuelve.

Mod instalado en: `d:\quake\uplifter`

## Premisa

- El jugador es un piloto de helicóptero en una operación humanitaria/periodística.
- Los **enemigos** atacan casas con helicópteros, tanques y, ocasionalmente, aviones.
- Las **casas** tienen vida. Si las destruyen, arden, echan humo y salen civiles huyendo.
- Los enemigos matan civiles si los alcanzan.
- El jugador rescata civiles o fotografía crímenes de guerra desde el aire.

## Mundo del juego

Uplifter sucede en un **océano global con islas**. El mundo es siempre mar abierto con masas de tierra emergidas — pueblos costeros, archipiélagos, bases militares en islas, una barcaza inicial flotando.

### Tamaño del mundo

Los mapas son **grandes** — escenarios al aire libre vistos desde el aire. Tamaño jugable: **±16384 unidades** en X/Y (16× el área de un mapa Quake estándar).

Esto requiere salirse del formato BSP vanilla. La cadena necesaria, ya validada para ironwail:

- **Formato BSP2** — soporta coords float y los volúmenes que necesitamos. Ironwail lo carga nativamente.
- **Protocolo 666** ("bigcoords") en el `worldspawn` del mapa — el protocolo de red original solo codifica posiciones del jugador hasta ±4096; el 666 sube ese techo a ±32768.
- **Margen jugable** efectivo: zona segura ±15000, los últimos 1384 son colchón.

La herramienta de mapeo (ver [ModEditor.md](ModEditor.md)) se encarga de estos detalles automáticamente.

### Cielo

Cielo **azul eterno**. Uplifter siempre es día claro — no hay noche, ni tormentas, ni variaciones. Skybox fijo reutilizando la skin de cielo de `airquake_dv`.

## Bootstrapping

1. Copiar `airquake_dv` a `d:\quake\uplifter`.
2. Crear el ModEditor según [ModEditor.md](ModEditor.md).

## Documentos relacionados

- [ModEditor.md](ModEditor.md) — herramienta de mapeo para crear escenarios del mod.
