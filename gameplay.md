# Gameplay

Un heli rescata civiles en zona caliente y los lleva al barco. Vuelas bajo para no llamar la atención; cuanto más te ven, más caso te hacen los enemigos.

El jugador empieza la partida ya con el heli desplegado. **Solo se usa el heli** — los demás vehículos del mod (aviones, drones, tanques) quedan fuera de este modo.

## Bucle principal

1. Al arrancar el mapa hay **1 objetivo activo** elegido al azar entre las zonas de pickup colocadas en el editor.
2. Vuelas a la zona y aterrizas. Aparecen NPCs civiles que caminan hasta el heli y suben uno a uno.
3. Cuando todos han subido (cap: **8 pax**), vuelas al **barco** (zona única por mapa, "suelo cerca de A").
4. Aterrizas en el barco, se descarga la gente (sale del heli y entra al barco). Las estrellas vuelven a 0.
5. Se activa otro objetivo. Repetir.

### Cómo se ve el objetivo activo

- En el mapa: un **beam vertical** (o indicador grande) sobre la zona.
- En el HUD: si el marcador queda fuera de cámara, una flecha indica si está a la derecha o izquierda del campo de visión.

## Sistema de estrellas (notoriedad)

Inspirado en GTA. Rango 0–5. A más estrellas, más caso te hacen los enemigos.

### Qué sube estrellas

| Acción | +★ |
|---|---|
| Foto a vehículo | +1 |
| Foto a "crimen de guerra" (ver más abajo) | +3 |
| Disparar a enemigo | +4 |
| Disparar a civil / vehículo neutral | +1 |
| Volar alto sostenido | +1 cada 10s, **solo hasta 4★** (no llega a 5 por altura) |

### Qué baja estrellas

- **Tiempo**: decay lento automático.
- **Sigilo** (volar bajo): decay acelerado.
- **Aterrizar en el barco**: reset a 0.

### Respuesta enemiga por nivel

| ★ | Enemigos reaccionan |
|---|---|
| 0 | Te ignoran totalmente |
| 1 | Te ignoran pero emiten avisos sonoros (alarmas, gritos) |
| 2 | Helis te siguen si te acercas a uno |
| 3 | Pueden disparar en tu dirección; helis te siguen |
| 4 | Si te tienen a distancia razonable, empiezan a perseguirte |
| 5 | Te buscan activamente desde distancias grandes |

### HUD

5 estrellas arriba derecha, estilo GTA: 5 huecos, se rellenan en amarillo según el nivel actual.

## Sigilo

- **Volar bajo** = ≤64–128 unidades sobre el suelo.
- En sigilo los enemigos no te detectan **salvo que estés a menos de 500u** de ellos.
- En sigilo, las estrellas decaen más rápido.
- A 0 estrellas: el sigilo **no** es automático — tienes que volar bajo activamente para mantenerlas a 0.
- El sigilo funciona igual con o sin pasajeros a bordo.

## Curación por scrap

Scrap esparcido por todo el mapa (preferentemente **modelos**, sprites como fallback). Asset visual a elegir entre lo disponible en `d:\code\ModelCatalog` (TBD).

- Recoger scrap: ilimitado mientras haya disponible en el mapa, no hay contador en HUD.
- Cura: **4 HP/segundo** (sobre 100 base) tras varios segundos sin recibir daño.
- Cada pieza de scrap se consume al recogerla. **Respawna a los 120s + random** en la misma posición.

## Armas

### Cámara de fotos

- **Sustituye el arma 1** actual.
- El crosshair detecta automáticamente lo que tienes enfrente (igual que el sistema actual de targeting).
- Sujeto fotografiable:
  - Vehículo enemigo → **+1000 créditos, +1 ★**.
  - "Crimen de guerra" → **+1000 créditos, +3 ★**.
- Civiles / vehículos neutrales → fotografiarlos no da créditos pero sube ★ (ver tabla).

### "Crimen de guerra"

Cualquier enemigo entra en estado **"crimen de guerra"** durante 3 segundos cada vez que dispara (a quien sea: al jugador, a civiles, a otros enemigos). La siguiente foto que se le haga durante esa ventana cuenta como crimen y otorga +3★ y los créditos correspondientes.

## Daño y muerte

- Si el heli explota → **respawn**; la partida continúa.
- Los pasajeros a bordo se pierden al morir (TBD: confirmar si penalización de puntos).

## Dinero / puntuación

Los créditos se **donan automáticamente** — son los puntos totales del jugador. No hay tienda. Es el marcador.

## Vibes (feedback)

- Coger scrap → feedback sonoro.
- Coger gente → feedback sonoro al subir cada pax.
- Heli dañado → puffs de humo intermitentes.
- Descargar pax → animación de salir del heli y caminar al barco antes de desaparecer.

## Recursos y ubicaciones

- `d:\code\ModelCatalog` — sistemas y cachés de todos los recursos de `d:\` que se pueden traer para usar.
- `d:\code\uplifter` — código y herramientas del proyecto (editor, scripts, QuakeC source). **No** contiene `.mdl`, sonidos ni assets del mod.
- `d:\quake\uplifter` — instalación del mod: aquí van todos los `.mdl`, `.wav`, sprites, mapas compilados y `progs.dat`.
