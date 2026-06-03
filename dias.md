# dias.md — Guía del mapper para Uplifter

Este documento dice **qué entidades hay que colocar en el editor** para que el ciclo de 5 días funcione tal como se especifica en [estrella-diseno.md](estrella-diseno.md). Sirve como checklist al hacer un mapa nuevo.

> **Nota técnica**: implementación actual referenciada en `mod/src/`. Si esta guía y el código difieren, manda el código.

---

## Resumen rápido

Para un mapa jugable mínimo necesitas:

- **1** `info_player_start` (spawn del piloto). Se coloca con el brush de spawn como siempre.
- **3** `info_ship` (barcos hospital, mar abierto, fuera del muro de Goliath).
- **2** `info_hospital` (hospitales en tierra, dentro de Davenport).
- **1** `info_carrier` (portaaviones, mar abierto, lejos del bucle habitual).
- **1** `info_representative` (NPC del día 5, dentro de Davenport).
- **N** `info_pickup` (mínimo 4–6, repartidos por Davenport).
- **M** `info_enemy_slot` (mínimo 15–30, repartidos por territorio Goliath y fronteras).
- **K** `info_scrap` (mínimo 8–12, repartidos donde quieras pero accesibles).

---

## Entidades nuevas (paso a paso)

### 1. `info_ship` — Barcos hospital

- **Cuántos**: 3 por mapa.
- **Dónde**: en mar abierto, lejos de cualquier `info_enemy_slot`. El jugador los usa como punto de descarga seguro.
- **Cómo se coloca**: ribbon del editor → modo *Entities* → tipo `Barco` → click en el mar.
- **Parámetros**: ninguno (la lógica usa cap 12, ritmo 10 s, +250 cr/pax — todo en `hospital.qc`).
- **Recomendación**: distribúyelos por el perímetro del mapa para que ninguno quede demasiado cerca de otro. El jugador debe poder elegir cuál es "el cercano".

### 2. `info_hospital` — Hospitales en tierra

- **Cuántos**: 2 por mapa.
- **Dónde**: dentro de Davenport (la ciudad clara). Cerca de zonas de pickup para que el viaje sea corto pero arriesgado.
- **Cómo se coloca**: ribbon → tipo `Hosp.` (icono ✚) → click en suelo.
- **Parámetros**: ninguno (cap 6, ritmo 4 s, +400 cr/pax — `hospital.qc`).
- **Recomendación**: uno cerca del centro de Davenport y otro en un barrio periférico. El sistema los puede destruir conforme avanza la sesión.

### 3. `info_representative` — NPC del día 5

- **Cuántos**: 1 por mapa.
- **Dónde**: dentro de Davenport, en una ubicación icónica (plaza central, hospital principal, etc.). Será el rescate final.
- **Cómo se coloca**: ribbon → tipo `Repr.` (icono ★) → click en suelo.
- **Parámetros**: ninguno. La entidad existe siempre en el mapa pero solo se vuelve interactiva al llegar al día 5.

### 4. `info_carrier` — Portaaviones USA

- **Cuántos**: 1 por mapa.
- **Dónde**: en mar abierto, lejos del bucle habitual. Aparece visualmente conforme el jugador llega al día 5; antes está como entidad invisible.
- **Cómo se coloca**: ribbon → tipo `Carrier` (icono ⏏) → click en el mar.
- **Parámetros**: ninguno.
- **Recomendación**: colócalo a una distancia que requiera un viaje significativo desde Davenport (3000–6000 u). El último viaje debe sentirse como una "extracción".

### 5. `info_enemy_slot` — Posiciones candidatas de enemigos

- **Cuántos**: 15–30 por mapa. Cuantos más, más variedad de partidas (cada día se activa un porcentaje aleatorio).
- **Dónde**: en territorio Goliath (cemento oscuro), fronteras de Davenport, rutas habituales entre pickups y puntos de descarga.
- **Cómo se coloca**: ribbon → tipo `Slot` (icono ◇) → click en suelo.
- **Parámetros** (panel de propiedades de la entidad seleccionada):
  - **Tipo de enemigo (slot)**: `monster_aag` / `monster_sam` / `monster_rad`.
  - **Día mínimo de activación**: 1–5. El slot solo intenta activarse desde ese día.
- **Sistema**: cada día, `Day_SlotActivationPct()` devuelve un porcentaje (20 % en día 1, 40 % en día 2, 55 % día 3, 75 % día 4, 90 % día 5). Cada slot tira el dado al inicio del día; si gana, spawnea su monstruo y se elimina.
- **Recomendación**:
  - Mezcla tipos: ~60 % AAG (suelo), ~25 % SAM (anti-aéreo), ~15 % Radar (detección sin daño).
  - Pon **muchos slots de día 1** en las afueras del muro (para que el día 1 tenga algo de presencia ya, aunque baja).
  - Pon slots con día mínimo 3 o 4 cerca de los hospitales (que la presión emerja con el avance del día).
  - Evita slots dentro de Davenport (es zona segura para el jugador hasta que escala el día 4).

### 6. `info_pickup` — Zonas de civiles (sin cambios mayores)

- **Cuántos**: mínimo 4–6 por mapa.
- **Dónde**: dentro de Davenport, en calles, plazas, edificios bombardeados.
- **Cómo se coloca**: ya existente — ribbon → tipo `Pickup`.
- **Sistema**: el día 1 hay 1 activo a la vez. Día 2–3: hasta 2 a la vez. Día 4+: hasta 3 a la vez (`Day_PickupConcurrent`).
- **Recomendación**: distribuye al menos 4 por todo Davenport. El sistema rota aleatoriamente entre ellos.

### 7. `info_scrap` — Chatarra que cura (sin cambios)

- **Cuántos**: 8–12 por mapa.
- **Dónde**: cerca de rutas habituales pero no en los pickups directamente. El jugador debe rodear un poco para cogerla.
- **Cómo se coloca**: ya existente — ribbon → tipo `Scrap`.

---

## Plantilla de checklist para un mapa nuevo

Copia y pega esto en un Trello / Notion / etc.:

```
[ ] 1 info_player_start (spawn, en uno de los barcos)
[ ] 3 info_ship (perímetro marino)
[ ] 2 info_hospital (centro + periferia de Davenport)
[ ] 1 info_representative (lugar icónico de Davenport)
[ ] 1 info_carrier (mar abierto, lejos del bucle)
[ ] 4–6 info_pickup (repartidos por Davenport)
[ ] 15–30 info_enemy_slot:
    [ ] ~60% monster_aag
    [ ] ~25% monster_sam
    [ ] ~15% monster_rad
    [ ] Variar activate_day entre 1 y 5
[ ] 8–12 info_scrap (zonas accesibles)
[ ] Muro de Goliath modelado en el terreno (visual + bloqueador para civiles)
[ ] Davenport con identidad visual clara (textura blanca / vertical)
[ ] Territorio Goliath con cemento oscuro
```

---

## Cómo verificar el mapa

Al cargar el mapa, los logs del servidor (consola de ironwail) deben mostrar:

```
[objectives] info_pickup count: 5 / info_ship count: 3
```

Si dice `WARNING: no info_pickup` o `WARNING: no info_ship`, el mapa no está listo. El cambio
de día **ya no escribe en la consola**: se ve como un titular en el overlay del canal de
noticias (ver "Textos del noticiario" más abajo). Y al ofrecer paquete:

```
=== Refuerzo logístico — elige paquete ===
  [101] A: Flares + chatarra automática
  [102] B: Turbo + sifón con alcance mayor
```

El jugador pulsa **impulse 101** (paquete A) o **impulse 102** (paquete B). Por consola: `impulse 101` o `impulse 102`. (En la build final habrá un binding por defecto y/o UI gráfica; mientras tanto se usa la consola).

---

## Textos del noticiario (por día)

Estos son los textos **que ya están en el mod**, traídos aquí como referencia. El
noticiario **anticipa** lo que el jugador va a encontrar ese día (no resume el pasado): el
titular monta el setup del día (ver [revision_television.md](revision_television.md)).

> **Fuente de la verdad = código.** Si editas el texto, hazlo en el `.qc` correspondiente;
> esta tabla es solo una copia legible. Origen: `mod/src/intro.qc` (día 1),
> `mod/src/day.qc` (días 2–5), `mod/csrc/airquake_hud.qc` (overlay BREAKING NEWS).

### Día 1 — intro en dos fases (overlay "CNN-7 / BREAKING NEWS")

La intro congela el heli 20 s (10 s por fase) y pinta el overlay de noticiario. `intro.qc`
saca un `centerprint`; el HUD (`airquake_hud.qc`) pinta el titular, la sub-línea y un ticker.

| Fase | Titular (HUD) | Sub-línea (HUD) | Centerprint (intro.qc) |
|---|---|---|---|
| 1 (heli) | `GOLIATH FORCES SURROUND DAVENPORT - OIL DISPUTE TURNS VIOLENT` | `Coastal city of Davenport has been ringed by Goliath armour overnight.` | `BREAKING NEWS` / `DAVENPORT UNDER SIEGE` / `Goliath forces have surrounded the coastal city after the recent oil discovery.` |
| 2 (Davenport) | `WOUNDED REPORTED IN CITY STREETS - RESCUE HELI DISPATCHED` | `Civilian casualties confirmed across multiple districts as Goliath shells continue.` | `BREAKING NEWS` / `WOUNDED REPORTED IN THE STREETS` / `A humanitarian rescue helicopter has been dispatched to the area.` |

- **Ticker** (se repite en bucle): `GOLIATH DENIES TARGETING CIVILIANS  *  OIL EXPORT BLOCKADE ENTERS DAY ONE  *  INTERNATIONAL CALLS FOR CEASE-FIRE GROW  *  USS CARRIER REPOSITIONED`
- **Consola**: al entrar `> CNN-7 NEWSDESK ON AIR`; al salir `> CNN-7 returns to scheduled programming.`

### Días 2–5 — cambio de día

Cada cambio de día muestra **un único titular** en el overlay del canal de noticias 24h
(mismo overlay para los 5 días). **Ya no se usa la consola** (ver
[revision_television.md](revision_television.md)). El texto vive en `mod/csrc/airquake_hud.qc`
(`Hud_DrawNewscast`, seleccionado por código de día 1..5); el encendido/apagado lo hace
`News_Show` / `News_Tick` en `mod/src/day.qc`.

| Día (código) | Titular (overlay) | Sub-línea |
|---|---|---|
| 1 | `GOLIATH FORCES SURROUND DAVENPORT - OIL DISPUTE TURNS VIOLENT` | `Coastal city of Davenport has been ringed by Goliath armour overnight.` |
| 2 | `GOLIATH ARTILLERY STRIKES CIVILIAN BLOCKS` | `Casualties mount overnight as the cordon tightens.` |
| 3 | `FIELD HOSPITAL DESTROYED` | `Goliath jets struck a Davenport medical centre at dawn.` |
| 4 | `CORDON HARDENS AROUND THE CITY` | `Goliath has reinforced the perimeter with heavy armour.` |
| 5 | `USS CARRIER ARRIVES OFFSHORE` | `International coalition prepares to receive a Davenport envoy.` |

**Voz (TTS)**: cada titular tiene su locución en `sound/speech/news/day1..5.wav` (voz femenina,
11025 Hz mono). Se regeneran con `mod/tools/gen-news-vo.ps1` (TTS offline de Windows). Para
cambiar un texto: edita la línea en ese script y reejecútalo, o genera uno suelto con
`-Text "..." -Out "speech/news/dayN.wav"`.

---

## Referencias técnicas

- `mod/src/day.qc` — ciclo de día, escalado, hooks.
- `mod/src/upgrades.qc` — paquetes A/B por día.
- `mod/src/siphon.qc` — cono de succión (heridos / scrap / munición).
- `mod/src/hospital.qc` — barcos + hospitales.
- `mod/src/objectives.qc` — todas las entidades `info_*` listadas arriba.
- `mod/src/defs.qc` — constantes `UPG_*`, `STAT_HUD_DAY`, etc.
- [estrella-diseno.md](estrella-diseno.md) — diseño completo del juego.
- [estrella.md](estrella.md) — catálogo de lo ya implementado.
