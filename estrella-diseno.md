# Uplifter — Diseño por método estrella (copo de nieve)

Aquí practicamos el **método estrella / copo de nieve** aplicado al diseño del juego, no a una novela. La descripción del método y la lista de elementos ya implementados están en [estrella.md](estrella.md) — este documento es el cuaderno de trabajo donde rellenamos cada paso.

Regla del método: cada paso es **fractal del anterior**. No se inventa nada nuevo de la nada; todo crece de algo que ya está escrito. Si un paso queda flojo, paramos y lo arreglamos antes de seguir inflando.

---

## Paso 1 — Frase núcleo del juego ✅

> *Una sola oración (~15 palabras): quién es el jugador, qué quiere, qué se interpone.*

Pilotas un helicóptero hasta tierra, rescatas a personas heridas y las llevas a un punto de descarga (barco hospital u hospital en tierra).

---

## Sistemas de diseño decididos

> *Conclusiones cristalizadas durante las sesiones de diseño. Alimentan los pasos 2–9 y son el contrato que el código debe cumplir.*

### Puntos de descarga: 5 en total, 2 tipos diferenciados

El mapa tiene **3 barcos hospital + 2 hospitales en tierra = 5 puntos de descarga**. Son **complementarios**, no redundantes: cada eje los hace opuestos para forzar decisión.

| Eje | Barco hospital (×3) | Hospital en tierra (×2) |
|---|---|---|
| **Ubicación** | Mar abierto, lejos de AA | Tierra, dentro o cerca de zona caliente |
| **Acceso** | Seguro casi siempre | Variable: ruta puede ser hostil |
| **Capacidad** | Alta (~12) | Baja (~6) |
| **Velocidad de descarga** | Lenta (1 herido / 10 s) | Rápida (1 herido / 4 s) |
| **Riesgo durante descarga** | Nulo | Vulnerable: pueden atacarte mientras descargas |
| **Recompensa por pasajero** | Estándar (+250 cr) | Bonus (+400 cr, "atención más rápida") |
| **Estado** | Siempre operativo | Puede caer durante la sesión (destruido o capturado) |

### Por qué este sistema genera decisiones

- **Saturación dinámica**: los barcos se llenan al descargar y se vacían con el tiempo (~1 herido cada 8–10 s). Si tardas, el barco cercano queda lleno y tienes que ir a uno más lejos o esperar.
- **Riesgo vs proximidad**: el hospital cercano puede ser más rápido y pagar más, pero atravesar zona enemiga para llegar — sobre todo con 8 heridos a bordo y heli dañado — puede ser peor que el viaje largo y seguro al barco.
- **Decisión sobre el *próximo* viaje**: si saturo el barco cercano ahora, mi siguiente entrega va a tener que ir al lejano. Eso obliga a planificar más allá de la zona actual.
- **Esperar tiene coste real**: mientras flotas esperando que un barco se vacíe, otros heridos en otras zonas siguen sin extracción. No es opción gratis.
- **Hospitales caídos = consecuencia geográfica permanente**: si un hospital cae a mid-game, ves la columna de humo desde lejos. La pérdida se siente, no es un game over abstracto.
- **Caso límite "todos llenos"**: cuando ningún punto puede recibir, los heridos a bordo empiezan a degradarse (micro-timer que normalmente no aparece). Penaliza recoger más de lo que el sistema puede absorber.

### Valores de arranque para iterar

- **3 barcos** + **2 hospitales** por mapa, posiciones aleatorias entre `info_ship` / `info_hospital` colocados en el editor.
- **Barco**: cap 12, procesa 1 herido/10 s, +250 cr.
- **Hospital**: cap 6, procesa 1 herido/4 s, +400 cr.
- **HUD**: 5 iconos siempre visibles con barra de capacidad y código de color (verde/amarillo/rojo). A larga distancia solo el color; a media, la barra; a corta, el número exacto.

### Encaje con código actual

- `info_ship` ya existe y procesa entregas. Necesita: contador de ocupación, ritmo de vaciado, estado lleno/no lleno.
- `info_hospital` es nuevo pero hereda casi toda la lógica de `info_ship`. Diferencias: ubicación en tierra, ritmo distinto, vulnerabilidad a destrucción.
- HUD pointer (ya implementado para el objetivo) se extiende a 5 destinos con su barra de capacidad.

### Ciclo de día = dificultad escalonada

Cuando todos los civiles de la oleada actual están rescatados (o muertos), **cambia el día**. El cambio de día es el equivalente a subir un peldaño de dificultad:

- **Día 1**: pocos enemigos, sigilo fácil, hospitales operativos, barcos con buen ritmo de descarga.
- **Días siguientes**: más enemigos en el mapa, más patrullas, más probabilidad de que un hospital caiga, presión de notoriedad sube más rápido.

Por qué este sistema funciona:
- **Estructura el arco de sesión sin scripting**: cada día es un "acto" — apertura, escalada, clímax — sin necesidad de eventos guionizados.
- **Convierte completar una oleada en una decisión doble**: cierras un capítulo (alivio) **y** abres el siguiente más duro (tensión). Cada rescate exitoso no es solo "punto sumado", es "ahora el siguiente civil va a ser más caro".
- **Hace que jugar bien tenga consecuencias**: rescatar rápido **acelera** la subida de dificultad. Premiar al jugador con un mundo más hostil es el bucle clásico de los roguelites — alarga la sesión y mantiene la tensión.
- **Da un beat narrativo limpio**: al salir el sol (o ponerse) de día N a día N+1, ves visualmente que algo cambió. No necesitas un menú de "subir de nivel".

Decisiones que abre:
- **¿Acelero los rescates o ralentizo?** Ralentizar para mantenerse en día fácil más tiempo (más créditos seguros) vs acelerar para llegar al día N con más recursos acumulados (clímax).
- **¿Dejo civiles sin rescatar a propósito?** Si la oleada nunca termina, el día no cambia. ¿Es viable saltarse a alguien para mantener el mapa en estado cómodo? (Decisión moral fuerte.)

Valores de arranque para iterar:
- Día 1 → 2: +30% enemigos, +1 patrulla de helis enemigos.
- Día 2 → 3: +30% adicional, riesgo de hospital caído activo.
- Día 3+: escalada continua, mid-game / late-game.

### Valores numéricos de partida: los que ya hay en código

**Decisión cerrada**: para todos los parámetros numéricos del juego (rangos de engagement por unidad, munición, cooldowns, daño, velocidades, alcances), se usan los valores **actuales del código** como punto de partida. No se rediseñan en frío.

Aplica a:
- Rangos de engagement de AAG, SAM, helis enemigos, tanques.
- Munición y cooldown de armas (autocannon, sidewinders, hellfires, rockets).
- HP del heli, daño por proyectil.
- Velocidades base, alcances del sifón, ritmos de respawn.

Los marcadores **TBD** que aparecen en este documento sobre estos parámetros (paso 7, tablas de IA enemiga, etc.) no son decisiones pendientes — son recordatorios de que **el valor exacto se ajusta solo si el prototipo muestra que hace falta**. Mientras tanto, lo que hay en código es la verdad.

### Tono: arcade, no simulación

El juego es **un poco arcade**, no simulación militar.

- **NO hay daño parcial al heli** (rotor / timón / fuselaje). El heli tiene HP, se daña, muere. Binario.
- **Las decisiones del jugador son tácticas y morales**, no ingenieriles. No quiero que el jugador esté pensando "tengo el rotor al 40%, mejor no inclino tanto".
- Lectura inmediata, bucle limpio, sin micro-gestión de sistemas mecánicos.

### Sin sistema de cámara / fotos

Se elimina por completo la **cámara de fotos** como verbo del jugador. No hay fotografía, no hay créditos por fotos, no hay "crímenes de guerra fotografiables" como mecánica.

Razón: complicaba el bucle sin aportar suficiente. El núcleo del juego es rescate y logística; la cámara era una capa lateral que distraía de eso.

Implicaciones:
- El arma 1 vuelve a estar disponible para otra función (o nada — el heli puede ir desarmado).
- El portaaviones del día 5 ya no se justifica por "documentar crímenes". Se justifica simplemente por la **resistencia mantenida**: el jugador ha sostenido Davenport durante 4 días y la coalición internacional responde a la presión.
- La notoriedad solo sube por disparar (al enemigo o a civiles) y volar alto sostenido. Sin foto.
- En código (`camera.qc`), la lógica queda desactivada o reusada para otra cosa.

### Condición de cierre de sesión

La sesión **termina cuando todos los civiles de Davenport han sido rescatados** (o han muerto). No hay sesiones infinitas, no hay opción explícita de "retirarse".

- Cada día spawnea una oleada de civiles. Cuando la oleada se cierra, cambia el día.
- El día 5 entra automáticamente cuando se cumplen las condiciones de los días previos.
- El juego acaba en el día 5 al entregar al representante al portaaviones.
- Si el jugador muere durante el día 5, el portaaviones se va y la sesión termina en derrota.
- Si el jugador muere en días 1–4, respawnea y la sesión continúa hasta agotar civiles.

Implicación clave: **no hay forma de evitar el final**. El juego siempre llega a una conclusión narrativa — victoria o derrota — en máximo 5 días. La sesión es una unidad cerrada.

---

## Paso 2 — Párrafo expandido del bucle ✅ (borrador para revisar)

> *5–6 líneas con estructura "tres conflictos + cierre". El loop principal contado en prosa.*

Pilotas un helicóptero sobre un océano de islas en guerra y buscas civiles heridos en zonas calientes; cuanto más alto vuelas, antes te detectan, así que el sigilo a baja altura es tu primera línea de defensa. Cuando recoges heridos tienes que elegir dónde descargarlos: tres barcos hospital lejanos pero seguros, dos hospitales en tierra cercanos pero vulnerables, todos con capacidad limitada que se llena y se vacía con el tiempo. Mientras vuelas, las facciones enemigas reaccionan a tu notoriedad — al principio te ignoran, después patrullan, después te cazan — y cada civil rescatado te acerca al fin de la oleada. Cuando la oleada se cierra cambia el día: salen más enemigos, los hospitales en tierra pueden caer, el mapa se vuelve más hostil; tu éxito es la causa del próximo problema. El bucle continúa hasta que el heli explota o decides volver al barco y cerrar la sesión — no hay victoria final, solo la historia de cuánto aguantaste y cuántos sacaste vivos.

---

## Paso 3 — Fichas breves de sistemas y agentes

> *Equivalente al "perfil de personajes" en novela, pero aquí los "personajes" son los **sistemas y agentes** que tienen comportamiento dentro de la partida. Para cada uno: qué hace, qué quiere (objetivo del sistema en términos de la experiencia del jugador), con qué entra en conflicto, cómo evoluciona dentro de una sesión.*

### Jugador (piloto de heli)
El piloto decide **dónde ir**, **qué hacer**, **qué mejora elegir** y **a quién ayudar**. Esas cuatro decisiones son el verbo central del juego — el pilotaje en sí es el medio, no el fin.

- **Dónde ir**: qué zona de pickup, qué punto de descarga (de los 5), qué ruta entre ambos (directa peligrosa vs rodeo seguro), cuándo retirarse al barco.
- **Qué hacer**: rescatar, recoger scrap para curarse, huir.
- **Qué mejora elegir**: cada día (días 2–4) se ofrecen dos mejoras del heli y el jugador elige una. Sistema descrito en la ficha del helicóptero del paso 7. Los créditos son marcador puro, no se gastan.
- **A quién ayudar**: cuando hay varios civiles, varias zonas activas o dilemas (civil vs combatiente herido), el piloto elige a quién prioriza y a quién deja atrás.

### Facciones enemigas (IA hostil)

**Goliath** — un **imperio militarista**, única facción hostil. Es el antagonista sistémico de la partida.

**Identidad visual**:
- Edificios oscuros.
- Suelo de cemento oscuro alrededor de sus instalaciones.
- Lectura clara desde el aire: si ves cemento oscuro, sabes que estás sobre territorio Goliath.

**Unidades en juego** (ya implementadas en el mod, ver [estrella.md](estrella.md)):
- **Tanques** (`ground*.qc`) — presencia terrestre dominante.
- **Helicópteros enemigos** (`he.qc`, `hedrone.qc`).
- **Aviones** (`plane*.qc`).
- **Defensa aérea**: AAG, SAM, emSAM, radar estático.
- **Drones en enjambre** (`eswarm.qc`).

**Comportamiento característico**:
- Disparan a civiles en la calle.
- Disparan a edificios de civiles.
- En ocasiones disparan a hospitales en tierra (esto es lo que puede hacerlos caer durante la sesión, ver "Hospitales caídos" en sistemas decididos).

**Escalada por notoriedad** (gating de IA implementado, ver [estrella.md](estrella.md)):
- 0–1★: te ignoran. Patrullan, atacan civiles, pero no a ti.
- 2★: helis Goliath te siguen si te acercas a ≤500u.
- 3★: helis + AA estática siempre; otros si ≤500u.
- 4★: todos a rango normal.
- 5★: todos ignorando sigilo.

**Escalada por día** (sistema decidido, pendiente de implementar):
- Día 1: presencia limitada. Pocas patrullas.
- Día 2: +30% unidades, +1 patrulla de helis.
- Día 3+: presencia máxima, mayor probabilidad de que ataquen hospitales en tierra.

**Cómo se siente desde el heli**:
- Identificación rápida por color: si los edificios son oscuros y el suelo es cemento, estás en zona Goliath.
- Su agresión es **proactiva contra el mundo** (atacan civiles aunque el jugador no esté), no solo reactiva contra el jugador. Esto convierte cada incursión en un dilema moral: cada segundo que tardas, Goliath mata civiles.

**Decisión de alcance**: por ahora **Goliath es la única facción hostil**. Meter varias facciones antes de tener el núcleo afinado puede ensuciar el diseño antes de validarlo. Cuando el sistema base esté claro, se valorará meter una **facción terrorista** como segunda capa (ver "Futuras facciones" abajo).

### Futuras facciones (parking de ideas, no implementar todavía)

- **Facción terrorista** (TBD). Diferente de Goliath en lectura visual, motivación y tácticas (a desarrollar). Solo entra en juego una vez que el bucle con Goliath esté validado y pulido.

### Civiles / heridos (NPCs objetivo) — Davenport

Los civiles son los habitantes de **Davenport**, una antigua ciudad que perteneció a Goliath y hoy es **independiente**.

**Por qué Goliath quiere Davenport** (motor del conflicto):
- Recientemente se **descubrió petróleo** cerca de la ciudad.
- Goliath ha **rodeado Davenport con un muro** para aislarla y forzar la salida de la población.
- El objetivo militar de Goliath no es matar civiles directamente sino **vaciar el territorio**: hacer la vida imposible para que los civiles huyan, dejando la ciudad y el petróleo libres para que Goliath los anexe.
- Cada civil que el jugador rescata es **un civil que Goliath no consigue desplazar dentro de su sistema** — el jugador les ofrece una salida ordenada (barco / hospital) en vez de una huida desesperada.

**Identidad visual** (a especificar):
- Davenport como ciudad **clara, viva, vertical** — contraste directo con el cemento oscuro de Goliath. Cuando el jugador mira el mapa, distingue territorio amigo / enemigo de un vistazo.
- El **muro de Goliath** es una pieza geométrica icónica del mapa: barrera visible entre Davenport y el resto, infranqueable para civiles a pie pero permeable para el helicóptero.

**Cómo aparecen los heridos**:
- Spawn en zonas calientes de Davenport — calles, plazas, edificios atacados por Goliath.
- Pueden ser víctimas directas de bombardeo / fuego cruzado, o civiles atrapados en el lado equivocado del muro.
- Sistema de spawning: `info_pickup` ya implementado; las zonas se eligen aleatoriamente al inicio del día.

**Cómo se mueven** (sistema implementado, ver `objectives.qc`):
- Caminan hasta el helicóptero cuando aterrizas en la zona.
- Suben de uno en uno hasta la capacidad de la zona (cap 8 por pickup).

**Qué los pone en peligro**:
- Disparos directos de Goliath (tanques, helis, drones).
- Bombardeo de sus edificios (los edificios civiles tienen vida en el mod).
- Si el jugador tarda, Goliath les alcanza y los mata antes de que lleguen al heli.

**Cómo se sienten como "carga" valiosa**:
- Cada civil a bordo es **un voto de Davenport contra el plan de Goliath**: salvar civiles es resistencia política, no solo humanitaria.
- Llevar 8 a bordo te vuelve más lento (TBD: si se modela física de peso) y más vulnerable durante el viaje — la carga preciosa también te ralentiza.
- La descarga en hospital de Davenport (uno de los dos hospitales en tierra) probablemente tenga **carga simbólica adicional**: estás devolviéndolos a su propia ciudad, no llevándotelos. Esto puede afectar a la elección entre barco (evacuación) vs hospital de Davenport (resistencia).

**Implicaciones para sistemas decididos previamente**:
- Los **2 hospitales en tierra** probablemente estén ambos en Davenport (dentro del muro). Coherente con que sean vulnerables: Goliath puede atacarlos.
- Los **3 barcos hospital** están en mar abierto, fuera del alcance directo de Goliath. Lectura clara: el barco es "salir de Davenport"; el hospital es "quedarse en Davenport".
- El **ciclo de día** ahora tiene narrativa: cada día Goliath aprieta más el cerco. El "día N+1 más difícil" no es un número abstracto, es Davenport bajo más presión.

> *Los sistemas **Puntos de descarga**, **Notoriedad** y **Ciclo de día** ya están descritos arriba en "Sistemas de diseño decididos" y no se duplican aquí.*

---

## Paso 4 — Expansión del bucle minuto a minuto

> *Cada conflicto del párrafo del paso 2 crece a un párrafo entero contando qué pasa dentro de una sesión real. El objetivo es que un lector pueda imaginar la sesión completa antes de que exista una build.*

### Minuto 0–2: despegue y primer contacto ✅

**Objetivo del diseño**: en 90 segundos el jugador completa el bucle entero (pickup → entrega → recompensa) sin tutoriales y sale enganchado.

**Orden de aprendizaje** (uno por vez, nunca dos a la vez):
1. Verbo principal: piloto un heli, vuelo, aterrizo, despego.
2. Objetivo: hay gente que necesita ayuda.
3. Punto de descarga: existe un sitio al que volver.
4. Existen enemigos (sin que te ataquen).
5. Volar bajo me protege.

**Escena**:

- **Segundos 0–10 — arranque**: spawn en uno de los barcos hospital. Heli ya armado en cubierta, motor encendido, sin menús ni texto. Sol bajo, mar tranquilo — pistas visuales de "el día acaba de empezar". Una columna de humo a media distancia marca la zona de pickup. **Un solo marcador en el HUD**, no varios.

- **Segundos 10–60 — primer vuelo**: despega y vuela hacia la columna de humo, cerca (≤30 s a velocidad normal). En el camino ve una patrulla de Goliath a lo lejos pero fuera de su ruta: existen, no le disparan. Al acercarse asoma el muro de Goliath — lectura visual instantánea: "ese es el enemigo, esto es Davenport".

- **Segundos 60–90 — primer rescate**: aterriza en la zona. **2 o 3 heridos** (no 8) caminan hasta el heli con feedback sonoro por cada uno. Flecha de vuelta lleva al mismo barco donde empezó — no le complicamos con 5 destinos todavía.

- **Segundos 90–120 — primera descarga**: aterriza en el barco. Descarga visible. **+créditos en pantalla** ("esto sirve para algo"). Aparece el siguiente objetivo. A partir de aquí, gameplay loop normal.

**Por qué funciona**:
- El jugador completa el bucle completo en 2 minutos y sabe a qué se dedica el juego sin que nadie se lo explique.
- Ve enemigos pero no los pelea: tensión sin frustración.
- Día 1 ya está balanceado en el sistema decidido ("pocos enemigos, sigilo fácil") — encaja sin trabajo extra.
- Geografía narrativa: barco → mar → muro → Davenport. El jugador cruza el cerco en su primer minuto — ese es el sentido del juego encapsulado en geografía.

### Minuto 2–8: ciclo de rescate típico ✅

**Cabecera del día: noticiario falso**

Cada día empieza con una breve "transmisión de noticiario" (estilo TV de campaña / propaganda) que el jugador ve antes de despegar. Sirve a tres funciones de diseño a la vez:

1. **Contexto narrativo**: contar qué ha hecho Goliath desde el día anterior ("ha bombardeado un hospital", "ha arrasado un barrio civil").
2. **Justificación de cambios del mundo**: si hoy hay un hospital menos, el noticiario lo explica. Si hay un hospital nuevo, también ("una ONG ha abierto un hospital de campaña en X").
3. **Telegrama de gameplay**: anticipa qué va a encontrar el jugador hoy — qué tipo de unidades nuevas, qué zonas calientes.

Formato sugerido: 5–10 s, una o dos noticias por día, voz over breve o titular en pantalla (decisión técnica TBD).

**Días 1–3: scriptados**

Los tres primeros días tienen contenido **fijo** en el noticiario y un mundo predecible. Razón: el jugador todavía está aprendiendo el bucle; un noticiario aleatorio podría enseñarle conceptos antes de tiempo o saltarse otros.

Esquema de los 3 días scriptados:

- **Día 1** — sin noticiario previo (es el primer contacto). El jugador empieza fresco. Mundo: pocos enemigos, hospitales operativos, una sola zona de pickup a la vez.
- **Día 2** — primer noticiario. Goliath ha bombardeado casas civiles → más zonas de pickup activas a la vez. Llega el **refuerzo logístico** (primera elección de mejora del heli: turbo vs heli más rápido).
- **Día 3** — segundo noticiario. Goliath ha bombardeado un hospital → uno de los dos hospitales en tierra está caído desde el inicio del día. El jugador descubre que los hospitales pueden caer. Aparece, en compensación, un hospital nuevo más lejos (también anunciado por el noticiario).

**Día 4 en adelante: dinámico**

A partir del día 4 el noticiario se genera a partir del estado real del mundo:
- Hospitales caídos durante la sesión aparecen como noticia al inicio del siguiente día.
- Tipo de unidades enemigas predominantes el día anterior alimentan el titular ("Goliath despliega más cazas").
- Sigue subiendo la presión sistémica (más enemigos, más probabilidad de ataques a hospitales) como ya está decidido en el ciclo de día.

**El bucle dentro del día** (minutos 2–8 cualquier día):

- Vuelas a una de las zonas activas — ahora puede haber **varias a la vez**, no solo una.
- Sigilo a baja altura para no subir estrellas mientras viajas.
- Aterrizas, recoges 4–8 heridos según capacidad y tiempo disponible.
- Eliges punto de descarga según ocupación visible en HUD, riesgo de ruta y bonus de hospital cercano.
- Vuelves, descargas, repites.

**Por qué este planteo funciona**:

- El noticiario **sustituye al tutorial de mid-game**: cada concepto nuevo entra acompañado de su explicación diegética. No hay popup "AHORA APRENDES X" — hay un parte que dice "Goliath ha hecho X, prepárate".
- Los 3 días scriptados son un **on-ramp controlado**: el jugador conoce los 5 puntos de descarga, recibe sus primeras mejoras del heli, ve caer su primer hospital, todo en orden seguro.
- A partir del día 4 el mundo se siente **reactivo**: el noticiario refleja lo que pasó, no un guion. El jugador siente que sus decisiones marcan el estado del mundo.
- **Coste de implementación bajo**: el noticiario es texto/voz sobre un fondo estático. No necesita animación.

**Pendientes técnicos**:
- ¿Voz over en español, subtítulos, o solo titular? (decisión de pulido).
- ¿Cómo se selecciona el evento de noticiario en días 4+? (probablemente una cola priorizada de eventos del día anterior).
- ¿Se puede saltar? (sí, con tecla).

### Minuto 8–15: presión sistémica creciente (notoriedad + saturación de puntos de descarga) ✅

**Cómo escala la presión sin tocar el mapa**

El editor scripteará el mapa con un **catálogo de posiciones candidatas** para enemigos estáticos (radares, AA, SAM, patrullas en tierra). Al inicio de cada día, una fracción de esas posiciones se "activa" y efectivamente tiene un enemigo desplegado.

- **Día 1**: pocas posiciones activas (p. ej. ~20% de las candidatas).
- **Día N**: más posiciones activas (p. ej. +15–20% por día hasta tope).

Mismo mapa, mismas posiciones predefinidas, **diferente densidad** según el día. El jugador aprende la geografía y aprende qué zonas se vuelven peligrosas conforme avanza la sesión.

**Mismo principio para enemigos dinámicos**:

Para patrullas móviles (helis, drones swarm, vehículos), no se aumenta la población máxima sino la **frecuencia de spawn**. Cada tipo de enemigo tiene un timer de aparición que se acorta día a día.

- **Día 1**: nuevo heli enemigo cada ~120 s.
- **Día N**: nuevo heli enemigo cada 90 s, 60 s, 40 s...

Esto evita problemas técnicos (no hay 200 unidades en el mapa de golpe) y mantiene la **sensación de mundo vivo** sin saturar el motor.

**Por qué el sistema funciona**:

- **Predecible para el jugador, no para el diseñador**: el jugador puede aprender qué posiciones del mapa son candidatas, pero no sabe cuáles están activas hoy hasta que las explora o las ve disparar. Esto premia exploración y memoria del mapa.
- **Cero scripting de eventos**: el mapa no necesita decidir "ahora aparece un enemigo aquí". Solo necesita un set de posiciones candidatas y un porcentaje de activación según el día.
- **El diseñador controla la dificultad con un solo número por día**: el porcentaje de activación. Ajustar la curva de dificultad es trivial.
- **El jugador ve el mundo cambiando**: pasar por una zona ayer fría y hoy con AA disparando genera el feeling de "Goliath se mueve". Encaja con el noticiario del día.

**Sensación dentro del minuto 8–15**:

- Ya llevas varios ciclos de rescate. El barco más cercano probablemente esté saturado.
- Empiezas a sufrir presión real: una AA que ayer no estaba ahora dispara a tu ruta habitual.
- Decisión emerge: ¿sigo mi ruta conocida o exploro una nueva sabiendo que también puede tener sorpresas?
- Las estrellas suben más fácil porque hay más enemigos cerca → patrullas que reaccionan, no solo estáticas.

**Pendientes técnicos**:

- ¿Cómo se marcan las posiciones candidatas en el editor? Probablemente como `info_enemy_slot` con un tipo (radar / AA / SAM / patrulla).
- ¿La activación es aleatoria o priorizada (zonas cerca de hospitales caídos primero)? La segunda opción da más narrativa pero pide más lógica.
- ¿Tope superior de activación? Sí: necesario para no saturar el motor en partidas muy largas.

### Minuto 15+: clímax y desenlace de sesión ✅

**Día 5: aparece el portaaviones de USA**

Tras 5 días de resistir, **EEUU envía un portaaviones** que entra en el mapa y acaba con la lucha. El noticiario del día 5 lo anuncia. Es el final de la sesión y del juego.

**La misión final**:

- Una única misión, distinta a todas las anteriores.
- **Recoger a un representante de Davenport** (no a heridos cualquiera — un NPC nombrado).
- **Llevarlo al portaaviones** (no a un barco hospital ni a un hospital en tierra — al portaaviones de USA, que es nuevo en el mapa).
- Cuando aterrizas en el portaaviones y el representante baja, **el juego termina**.

**Por qué este desenlace funciona**:

- **Rompe el bucle de forma narrativa, no mecánica**: tras 5 días repitiendo pickup → entrega, el día 5 te pide hacer **un solo viaje** con un solo pasajero. El cambio de ritmo en sí es el clímax.
- **El portaaviones es el deus ex machina diegéticamente justificado**: tras días viendo crímenes de Goliath, la coalición internacional manda al portaaviones. El jugador ha sostenido a Davenport durante 4 días — el portaaviones es el reconocimiento de esa resistencia.
- **El representante es el peso narrativo concentrado en un NPC**: ya no rescatas estadísticas, rescatas a una persona específica. Davenport tiene cara.
- **El final es alcanzable pero no fácil**: el día 5 es el de máxima presión (más posiciones de enemigos activas, hospitales caídos, oleadas grandes). Llegar al representante con vida y entregarlo es un reto real.

**Decisiones que abre para el jugador en el día 5**:

- **Ruta directa al representante o último ciclo de rescate de civiles antes?** Si te quedan civiles en peligro, salvarlos o ignorarlos para llegar antes al final.
- **¿Cuánto riesgo aceptar?** Con el portaaviones en el mapa, perder el heli ahora pierde toda la sesión. Más conservador que nunca.

**Pendientes técnicos**:

- ¿Cómo entra el portaaviones al mapa? Probablemente spawn en una coordenada fija al inicio del día 5, visible desde lejos (silueta enorme en el horizonte).
- ¿El representante es un NPC marcado especial o un `info_pickup` con flag? Más limpio como entidad propia (`info_representative`).
- ¿Qué pasa si el jugador muere en el día 5 antes de entregar al representante? Opciones: (a) game over, (b) respawn en el último barco con el representante reseteado en su zona, (c) el portaaviones se va y el juego acaba en derrota narrativa.

**Por qué cierra bien el método estrella**:

El paso 1 dice "rescatas a personas heridas y las llevas a un punto de descarga". El día 5 cumple esa frase llevada al extremo: **un solo rescate, un solo destino, máxima carga simbólica**. La estructura fractal del copo está respetada hasta el final.

---

## Paso 5 — Experiencia jugable por agente

> *Equivalente al "POV de personaje" en novela. Aquí: cómo se **siente** estar en cada lado del sistema. No "qué hace el civil" (eso es paso 3) sino "qué siente el jugador cuando ve a un civil intentando llegar al heli bajo fuego". Es el filtro emocional que valida el diseño.*

### Vivencia del jugador ✅

**El verbo dominante cambia con la fase**:

| Fase | Verbo dominante | Qué siente |
|---|---|---|
| Día 1 | Explorar | Curiosidad, ligereza, subidón limpio de "estoy ayudando" |
| Día 2–3 | Decidir | Concentración logística + asimilar las primeras consecuencias visibles del cerco |
| Día 3–4 | Elegir a quién perder | Tensión, culpa, primeras bajas conscientes |
| Día 5 | Traer a casa | Solemnidad y miedo, vuelas más despacio que nunca |

**Momento icónico de la sesión**: el primer hospital que cae. Lo ves de lejos como una columna de humo mientras haces otra cosa. Sabes lo que significa sin que nadie te lo diga. No puedes hacer nada — pasó mientras estabas en otro lado. Es el momento en que el jugador entiende que el mundo sigue aunque él no esté mirando.

**Tres reglas de tono que protegen la vivencia**:

1. **Las muertes son secas**, no épicas. 5 s, mensaje breve, respawn. La épica está en los rescates.
2. **El feedback positivo es discreto**. +250 cr aparece y ya — lo que se siente bien es ver al civil bajar y caminar al barco, no el número.
3. **El feedback negativo es ambiental**. Nunca "FALLASTE A 3 CIVILES" — solo humo en una zona que ya pasó. El jugador lo lee solo.

### Vivencia del enemigo (legibilidad de la IA) ✅

**Regla central**: el jugador nunca debe morir sin saber por qué le mataron. Cada amenaza tiene que **avisarse antes** con señal sonora y/o visual clara.

**Telegrafías confirmadas**:

- **"Te apuntan" (AA/SAM tiene lock)** — sonido de pitido acelerado, distinto al del radar.
- **"Misil te busca"** — chirrido agudo del misil (stereo según ángulo) + notificación en pantalla "MISSILE INCOMING" con flecha hacia el origen.
- **"All clear" (te perdieron)** — pitido descendente sutil cuando el último enemigo rompe contacto. Indica al jugador que puede relajarse y elegir si sigue en sigilo o sube.

**Ideas adicionales propuestas**:

- **Estela visible del misil**: trail de humo blanco bien visible. Tiempo de reacción de 1.5–3 s según distancia.
- **Radar detectando (previo al lock)**: pitido lento "blip... blip..." con 2 s de gracia antes de confirmar el lock. Si bajas en esos 2 s, el radar te pierde.
- **Voz de radio enemiga** cuando una patrulla cambia de rumbo hacia ti — una sola línea por evento ("intercepting bogey", "moving to engage"). No spam.
- **Icono del enemigo cambia de gris a rojo** en el HUD cuando pasa a engagement. Confirma visualmente el cambio que ya oíste en la radio.
- **Indicador de "amenazas activas"**: contador discreto en una esquina del HUD ("3 contactos"). Permite saber cuántos enemigos te tienen en seguimiento sin tener que mirar la radio o el mapa.
- **Diferenciación sonora por unidad**: el AA suena distinto al SAM, el SAM distinto al heli enemigo, el heli enemigo distinto al drone swarm. Cada tipo tiene su firma sonora reconocible — el jugador puede identificar la amenaza solo de oído.
- **El sonido del misil cambia cuando estás esquivando bien**: si el misil pierde lock por tu maniobra, el chirrido baja de intensidad antes del "all clear". Premio sonoro inmediato a buena conducta evasiva.

**Por qué este sistema funciona**:

- El jugador siempre sabe en qué de 4 estados está: no me ven / me ven sin atacar / algo me apunta / algo me dispara.
- Las señales son **multimodales** (sonido + visual). El jugador puede estar mirando el suelo o el HUD y aun así percibir la amenaza.
- En código ya hay base: `rad.qc` reporta dirección, gating por estrellas funciona, AA/SAM/emSAM disparan. Falta la **capa de feedback al jugador** (sonidos diferenciados, indicadores HUD por estado, estelas visibles).

### Vivencia del civil (legibilidad del objetivo) ✅

**Decisión técnica**: mismo modelo 3D para todos, diferenciados solo por **color/textura de ropa**. Más barato de hacer y suficientemente legible desde el aire en un mod Quake.

**Código de ropa**:

| Tipo | Ropa | Cómo se lee desde el heli |
|---|---|---|
| Civil sano | Blanca | Punto blanco caminando |
| Civil herido (objetivo de rescate) | Blanca con manchurrones rojos | Punto blanco con detalle rojo — el rojo es la señal de "rescátame" |
| Soldado Goliath | Verde o marrón desierto | Punto verde/marrón — color del enemigo, fácil de descartar como objetivo de rescate |

**Por qué funciona**:

- El **blanco** se asocia a Davenport (ciudad clara, civiles, hospitales). El verde/marrón se asocia a Goliath (uniforme militar). La identidad visual del juego ya separa los bandos por color — esto extiende la regla a los NPCs.
- El **rojo de las manchas** es señal universal de "esto es sangre, esto necesita ayuda". El jugador no necesita aprender una iconografía nueva.
- Desde el aire un punto blanco con un poco de rojo destaca contra el suelo claro de Davenport. Si fuera todo rojo se confundiría con explosiones / fuego del entorno.
- **Reusa el sistema de skins de Quake**: una skin distinta por variante, mismo modelo. Coste de implementación mínimo.

**Pendiente para más adelante** (no implementar todavía):

- Estado "ya no va a llegar" (civil que se va a morir antes de alcanzar el heli). Puede ser: caminando muy lento, o un sprite/efecto de cruz roja desvaneciéndose sobre la cabeza. Decisión opcional para iteración futura — el sistema base de rescate ya funciona sin esto.

---

## Paso 6 — Arco de la sesión (4 fases)

> *Equivalente a "estructura de actos" en novela. Una página por fase: qué siente el jugador, qué sistemas dominan, qué decisiones predominan, qué puede salir mal. Aquí emergen los agujeros sistémicos — se tapan ahora, no implementando.*

### Apertura (día 1, primer rescate) ✅

**El día 1 es UN solo rescate**, no varios.

Razón: el día 1 no ejerce presión sistémica (pocos enemigos, sigilo fácil, un solo punto de descarga visible). Repetir el bucle sin nada nuevo aburre — viola el principio del método estrella (cada paso añade algo). Un solo rescate basta para enseñar el verbo y desencadenar el primer cambio de día.

**Coincide exactamente con el minuto 0–2 del paso 4**: spawn en barco, vuelo al pickup, recoger 2–3 heridos, descargar, créditos visibles. Cuando el civil se baja del heli y camina al barco, la oleada del día 1 está completa y **arranca el día 2** con su primer noticiario.

**Qué tiene que haber aprendido el jugador al cerrar el día 1**:
- Verbo principal (pilotar, aterrizar, despegar).
- Hay heridos, los recojo, los llevo al barco.
- Las entregas dan créditos.

**Lo que NO necesita saber todavía** (lo aprenderá en el día 2+):
- Que hay 5 puntos de descarga.
- Que puede elegir mejoras del heli cada día.
- Que los hospitales pueden caer.
- Que el sigilo importa.

**Qué le engancha para el día 2**: el noticiario del día 2 ("Goliath ha bombardeado un barrio civil") aparece justo después de la descarga del día 1. Es el cliffhanger: el jugador ve que el mundo se mueve sin él y quiere ver qué pasa.

### Mid-game (día 2–3, ritmo de crucero) ✅

**Día 2: el juego empieza de verdad**

El día 2 abre con el **primer noticiario**: "Goliath ha bombardeado un barrio civil". Eso justifica diegéticamente lo que el jugador encontrará nuevo en la sesión:

- **Varias zonas de pickup activas a la vez** (no solo una como en día 1).
- **Primera elección de mejora del heli** (turbo vs heli más rápido, ver paso 7).
- **El segundo punto de descarga se hace evidente** porque el barco del spawn se satura tras 2 entregas seguidas. El jugador descubre la lógica de los 5 puntos por necesidad, no por tutorial.

Verbo dominante del día 2: **decidir**. La cabeza se llena de la logística por primera vez — qué zona primero, qué barco al volver, qué mejora elegir.

**Día 3: primera consecuencia irreversible**

El día 3 abre con el **segundo noticiario**: "Goliath ha bombardeado un hospital". Uno de los dos hospitales en tierra arranca el día caído (visible: columna de humo desde el spawn).

- El jugador descubre **que los hospitales pueden caer**. No por su culpa esta vez — el guion lo hace pasar. Pero queda la lección: "esto puede volver a pasar, y la próxima vez quizá sea durante mi sesión".
- En compensación, el noticiario anuncia **un hospital de campaña nuevo** más lejos. El jugador aprende que el mapa de descargas no es estático: el mundo añade y quita destinos.
- Las posiciones candidatas de enemigos suben de densidad. Rutas que ayer eran cómodas hoy tienen AA disparando. El sigilo deja de ser opcional.

Verbo dominante del día 3: **planificar más de un paso adelante**. Ya no eliges destino a destino — eliges una ruta de 2–3 saltos teniendo en cuenta qué barcos van a estar llenos, qué hospital ha caído, qué zonas se han vuelto peligrosas.

**Cómo se siente el jugador en mid-game**

- Por primera vez **siente que sabe jugar**. El bucle es fluido, las decisiones son significativas, los errores cuestan pero son recuperables.
- Empieza a tener **rutas favoritas** y zonas que evita. El mapa se vuelve personal.
- Aparece la primera **culpa táctica**: dejar a un civil corriendo hacia el heli porque ya llevas 8 y vas a perder a los que tienes si te quedas. Lo recuerdas.

**Errores recuperables en mid-game**:
- Saturar el barco más cercano y tener que ir al lejano — coste de tiempo, no de partida.
- Subir a 3★ por descuido — el decay en sigilo baja rápido, te recuperas en 30 s.
- Perder algún civil de una oleada — la oleada cierra igual y avanza el día.

**Errores no recuperables**:
- Perder el heli con 8 pax a bordo — respawn pero esos 8 se pierden, los créditos de ese viaje no entran.
- Subir a 5★ con el heli dañado y sin scrap cerca — muerte casi segura.

**Lo que el jugador todavía no sabe en mid-game**:
- Que el clímax del día 5 cambia el tipo de misión (representante de Davenport al portaaviones). Lo descubre por el noticiario cuando llegue.

### Clímax (día 4, presión sistémica máxima antes del final) ✅

El día 4 es el día más cargado de la sesión. Es el último día de bucle "normal" antes de que el día 5 cambie el tipo de misión con el portaaviones. El jugador no lo sabe — para él es solo "otro día más duro".

**Lo que aporta el noticiario del día 4** (primer noticiario dinámico, no scripteado):
- Refleja lo que pasó el día 3: hospital caído, civiles perdidos, mejoras instaladas.
- Anuncia el avance de Goliath ("Goliath fortifica el cerco", "más unidades en la frontera").
- Sirve de aviso: el mundo está más hostil que nunca.

**Estado del mapa**:
- Posiciones candidatas de enemigos al ~60–80% de activación.
- Uno de los dos hospitales en tierra puede estar caído (el del día 3 si el guion lo dejó, o uno nuevo si las condiciones lo disparan).
- Frecuencia de spawn de patrullas a su pico: helis cada 30–40 s, drones swarm visibles en varias zonas.
- Oleadas de civiles más grandes: zonas con 8–10 heridos en lugar de 4–6.

**Decisiones que dominan el día 4**:
- **¿Acepto perder civiles para no romper el sigilo?** Con tantos enemigos, mantener 0★ exige descartar rescates.
- **¿Aterrizo a recoger scrap?** Con el heli probablemente dañado, parar a curarte en una zona caliente es jugarse el respawn.
- **¿Voy al barco lejano seguro o al hospital cercano que puede caer mientras estoy descargando?** Hospital atacado durante la descarga es el momento más dramático del día.

**Cómo se siente**:
- Verbo dominante: **elegir a quién perder**. Ya no se trata de optimizar — se trata de minimizar daño.
- El jugador siente que el mapa **no le pertenece**. Rutas familiares están cerradas. Hospitales conocidos han caído.
- Aparece la **culpa acumulada**: los civiles dejados atrás en los días anteriores, las decisiones rápidas que ahora pesan.
- Tensión sostenida, no picos. El día 4 no tiene "el gran momento" — tiene 15 minutos continuos de presión.

**Errores que el día 4 castiga**:
- Subir a 4–5★ ahora mismo es muerte casi segura: hay demasiados enemigos activos.
- Llevar 8 pax y forzar ruta directa porque tienes prisa — un misil te quita los 8.
- Asumir que el barco conocido sigue libre — al final del día 4 todos están saturados a la vez.

**Lo que cierra el día 4**: la oleada final se completa y aparece el noticiario del día 5 que cambia el juego ("Estados Unidos envía el USS [nombre] a la zona — evacuación final autorizada"). Punto de no retorno narrativo.

### Cierre de sesión (día 5 y/o muerte) ✅

Hay tres formas en que se cierra la sesión:

**1. Final canónico — entregar al representante**

El jugador llega al portaaviones con el representante de Davenport vivo. Pantalla de cierre:
- Resumen seco: días aguantados, civiles rescatados, hospitales perdidos.
- Sin "FELICIDADES" gritón. Tono solemne, en la línea de las reglas de feedback del paso 5.
- Una sola línea de cierre narrativo: algo tipo "Davenport recuerda tu nombre" o "El testimonio sale al aire mañana".

**2. Muerte en día 5**

Si el heli explota antes de entregar al representante:
- El portaaviones se va.
- La sesión termina en derrota.
- Mensaje breve: "Sin testimonio. Sin representante. Davenport cae."
- Sin segunda oportunidad — la consecuencia es proporcional al peso del momento.

**3. Muerte en días 1–4 (retorno al bucle)**

- Respawn estándar (ya implementado): heli nuevo, reset scrap a 10, estrellas a 0, pasajeros perdidos.
- Los créditos persisten — es el marcador acumulado.
- La sesión continúa automáticamente hasta agotar la oleada de civiles del día y avanzar al siguiente. No hay opción de "retirarse": el juego siempre llega al día 5.

**Qué se lleva el jugador como memoria**:
- El primer hospital que cayó (momento icónico identificado en el paso 5).
- El día en que dejó civiles atrás por primera vez.
- El vuelo final con el representante.
- El número total de civiles que sacó con vida.

**Qué le hace volver**:
- La partida es corta (15–25 minutos por sesión completa). No es un compromiso pesado.
- Los noticiarios del día 4+ son dinámicos — cada sesión tiene una historia distinta.
- El score (civiles + hospitales mantenidos en pie) invita a superar el récord propio.

**Lo que NO hace el cierre**:
- No hay upgrades persistentes entre sesiones. Cada sesión es self-contained.
- No hay desbloqueos. Cada sesión es completa por sí misma.
- No hay leaderboard global (al menos en primera versión — la rejugabilidad es contra uno mismo).

---

## Paso 7 — Especificación detallada de sistemas

> *Equivalente al "perfil completo de personaje" en novela. Aquí: cada sistema decidido en el paso 3 se especifica con números, fórmulas, máquinas de estado y condiciones de transición. Es la fuente de verdad para implementar.*

### Helicóptero del jugador (física y daño) ✅ (parcial)

**Ya implementado en código** (ver `helo1.qc` en [estrella.md](estrella.md)):
- Modelo `progs/helo1.mdl`.
- Pitch/yaw/roll con autonivelado por thrust.
- Soft-landing: snap a 0 si velocidad <250 u/s y ángulos <45°.
- Puffs de humo visuales cuando `health < 1`.
- Downwash dust al volar a ≤65 u del suelo.
- Ripples sobre agua.

**Decisión cerrada**: NO hay daño parcial al heli. Tono arcade, daño binario (HP global). Ver "Tono: arcade, no simulación" en sistemas decididos.

**Pendiente de tunear con prototipo**:
- HP base exacto y curva de daño por tipo de proyectil.
- Velocidad máxima horizontal vs altitud (¿el sigilo te ralentiza?).
- Capacidad de pasajeros (¿el heli tiene tope o solo lo tiene la zona de pickup? — código actual: solo la zona).
- Si llevar pax afecta peso/velocidad/maniobrabilidad.

**Sifón (base, día 1)**

El heli arranca con un **sifón** — un cono de succión hacia abajo que recoge heridos, munición y chatarra **sin tener que aterrizar y sin coste**. Es infinito. Es solo conveniencia del verbo "recoger": el jugador no se preocupa por gestionar el sifón, solo por dónde apuntarlo.

**Sistema de mejoras del heli — paquetes A vs B por día**

Cada día (2–5) el jugador elige entre **dos paquetes excluyentes**. Cada paquete contiene **un arma o boost principal + una mejora pasiva de calidad de vida**. Se lleva el paquete entero, pierde el otro entero — no hay forma de mezclar.

**Flujo del día**:
1. El día empieza con el noticiario.
2. Pantalla breve "Refuerzo logístico — elige un paquete": dos opciones lado a lado con icono y descripción de cada paquete completo.
3. El jugador elige A o B.
4. Sale al mapa con todo lo del paquete elegido.

**Filosofía del arsenal**:

No se añaden armas nuevas. Todo el arsenal proviene de **lo ya implementado en el mod** (autocannon, hellfires, sidewinders, rockets, ver [estrella.md](estrella.md)).

- El heli empieza **indefenso** (día 1, solo sifón).
- Cada día los paquetes desbloquean **acceso a armas existentes** + **pasivas/boosts** de calidad de vida.
- La escalada de power fantasy emerge de **acumular pasivas y armas a lo largo de la sesión**.
- A la vez, el mundo escala (más enemigos, más posiciones activas, más patrullas) → la dificultad relativa se mantiene mientras la sensación de poder crece.

**Por qué paquetes en vez de mejoras sueltas**:
- **Decisión real, no farmeo**: el jugador no acumula mejoras, **compromete una identidad** cada día. Si eliges A el día 3, te pierdes algo que B tenía y nunca lo recuperas.
- **La pasiva va dentro**: cada paquete incluye una calidad de vida pasiva. Si eliges A, perderás también la pasiva de B. Eso da peso a la elección.
- **Tensión variada por día**: cada par usa un eje distinto (evasión vs velocidad, útil vs espectacular, daño vs vida, dos sabores de dios).
- **Rejugabilidad**: 2⁴ = 16 builds posibles a lo largo de la sesión. Suficientes para que cada partida se sienta distinta.

**Plan completo de paquetes**:

| Día | Paquete A | Paquete B | Tensión |
|---|---|---|---|
| 1 | Sifón base (sin elección, sin armas) | — | — |
| 2 | **Flares** (3 cargas, anti-misil) + **chatarra recogida automáticamente** al pasar cerca | **Turbo** (burst de escape) + **sifón con alcance algo mayor** | Evasión vs velocidad |
| 3 | **Autocannon desbloqueado** (arma frontal ya implementada) + **respawn más rápido de munición y chatarra** en el mapa | **Sidewinders desbloqueados** (misiles aire-aire, ya implementados) + **sifón también recoge munición** automáticamente al pasar cerca | Anti-tierra vs anti-aire |
| 4 | **Hellfires desbloqueados** (misiles aire-tierra de los planes, ya implementados — one-shot a vehículos) + **munición infinita del autocannon** | **Blindaje x1.5** (HP base aumentado) + **sifón con alcance doble** (recoges civiles desde más alto sin entrar en rango de fuego) | Daño vs vida |
| 5 | **Rockets de saturación** (cohetes a área, ya implementados — abren paso entre patrullas) + **munición infinita** en todo lo desbloqueado | **Recarga acelerada** de todo el arsenal (flares, misiles, cohetes recargan a velocidad doble) + **blindaje x2** sobre lo que tuvieras | Munición infinita vs recarga + tanque |

**Notas sobre el plan**:
- **Todas las armas ya existen en código**. No hay que implementar nada nuevo, solo gobernar **el momento del desbloqueo** y vincularlo al paquete elegido.
- **Día 1 no hay elección**. El jugador aprende el sifón. Vulnerable, frágil, civil. No tiene armas — solo huye y recoge.
- **El jugador acumula**: al llegar al día 5, las armas/pasivas elegidas en días 2–4 se conservan. La build crece monótonamente.
- **El escalado del mundo compensa**: más enemigos cada día, más posiciones candidatas activas, más frecuencia de patrullas. El power fantasy es **percibido** (te sientes más fuerte) pero la dificultad real se mantiene.
- **Coste de las armas activas (turbo, autocannon, sidewinders, hellfires, rockets)** — pendiente de tunear con prototipo. Candidatos: munición limitada, romper sigilo al disparar (sube notoriedad — ya implementado), cooldown entre usos.

**Puntos de mejora secretos en el mapa** (oculto al jugador, no se anuncia):

Además de la elección por día, el mapa tiene **puntos de mejora secretos** repartidos por la geografía. Si el jugador los descubre durante el vuelo, obtiene la mejora **adicional** (no en lugar de la elegida — además de).

- **No se documentan en HUD ni se marcan**. El jugador los encuentra explorando o por casualidad.
- **No se mencionan en noticiarios ni tutoriales**. Su existencia es descubrimiento puro.
- **Pueden estar en**: islas pequeñas alejadas del bucle habitual, dentro del muro de Goliath (territorio peligroso, recompensa proporcional), encima de edificios concretos de Davenport, en el barco de spawn (escondido a propósito en el inicio).
- **Por qué funciona**:
  - **Premia la exploración**: el jugador que sale de su ruta óptima encuentra cosas. El óptimo de eficiencia ya no es óptimo absoluto.
  - **Da rejugabilidad de descubrimiento**: cada partida puede aparecer uno nuevo, o el jugador puede recordar dónde estaba el del día anterior y planear ruta.
  - **Refuerza la sensación de "mapa con secretos"**: el mundo no es solo un set de zonas funcionales — tiene capas ocultas.
  - **No castiga a quien no los encuentra**: las mejoras del día por elección bastan para terminar la sesión. Los secretos son bonus, no requisito.
- **Pendientes**:
  - ¿Cuántos secretos por mapa? Probablemente 3–5, no más.
  - ¿Respawnean entre sesiones? Probablemente sí, pero en posiciones distintas dentro de un conjunto de candidatos predefinidos.
  - ¿Algún tipo de pista sutil (un brillo apenas visible al pasar cerca, un sonido lejano)? Decisión de tunear: si son demasiado ocultos, nadie los encuentra; si demasiado evidentes, dejan de ser secretos.

### IA enemiga (máquina de estados por unidad) ✅ (parcial)

**Estados generales** (extender el gating ya implementado por estrellas):

1. **Idle / patrol** — la unidad sigue su ruta predefinida, no le presta atención al jugador.
2. **Alerta** — detecta al jugador pero no engage (depende del nivel de estrellas y del tipo de unidad).
3. **Engagement** — apunta al jugador (telegrafía con pitido acelerado del paso 5).
4. **Disparando / persiguiendo** — ataca activamente.
5. **Pérdida de contacto** — el jugador rompió línea de vista o sigilo; vuelve a alerta y luego a patrol con timer ("all clear" del paso 5).

**Diferencias por unidad** (ya implementadas con parámetros distintos en código):

| Unidad | Rango engagement | Comportamiento característico |
|---|---|---|
| Radar estático (`monster_rad`) | 3000 u | Solo detecta y reporta dirección; no dispara |
| AAG (`monster_aag`) | TBD | Cañón rápido, dispara directamente |
| SAM (`monster_sam`) | TBD | Misil con lock; requiere ventana de telegrafía |
| emSAM (`emsam.qc`) | 2000 u | SAM montado en camión, móvil |
| Heli enemigo (`he.qc`) | TBD | Persigue, dispara en movimiento |
| Drone swarm (`eswarm.qc`) | 220 u radio vecindad | Boids: cohesión + alineamiento + separación, persigue a 320 u/s |
| Tanque (`ground*.qc`) | TBD | Lento pero pega fuerte; solo amenaza si vuelas bajo en su rango |
| Avión (`plane*.qc`) | TBD | No usado contra el jugador en el modo heli (TBD: o sí?) |

**Pendiente de tunear con telemetría**:
- Rangos exactos por unidad para que la dificultad por día tenga curva sensata.
- Tiempo de telegrafía (lock-on) por unidad. La SAM debería avisar más que el AA.
- Coordinación entre unidades: ¿una patrulla de helis comparte detección? (probablemente sí en código actual, validar).
- Probabilidad de spawn de cada tipo por día y por porcentaje de activación.

### Civiles (spawning y comportamiento) ✅ (parcial)

**Ya implementado** (ver `objectives.qc` en [estrella.md](estrella.md)):
- Spawn en `info_pickup` al inicio del día — la zona se elige aleatoriamente.
- Caminan hasta el helicóptero cuando aterrizas en su zona.
- Suben de uno en uno hasta cap 8 por zona.

**Decisiones de diseño en este documento**:
- Skin diferenciada por tipo (sano blanco, herido blanco con manchurrones rojos, soldado verde/marrón) — ver paso 5.
- Cuántas zonas activas a la vez:
  - **Día 1**: 1 sola.
  - **Día 2+**: varias zonas a la vez (número exacto TBD, escalar con el día).
- Cuántos heridos por zona:
  - **Día 1**: 2–3 (zona pequeña para no abrumar).
  - **Día 2–3**: 4–6.
  - **Día 4+**: 8–10 (oleadas grandes que fuerzan dos viajes o decisiones de a quién dejar).

**Decisión cerrada**: NO se introducen categorías de heridas graves vs leves. Todos los heridos son iguales en mecánica. Añadir tipos sería complicar el sistema sin mejora clara de gameplay.

**Pendiente de decidir**:
- ¿Civiles sanos (no heridos) pueden ser objetivo opcional? Por ahora no — solo los heridos cuentan.
- Comportamiento bajo fuego: ¿corren al heli más rápido? ¿se quedan paralizados? ¿se esconden? TBD.

> *Los sistemas **Puntos de descarga**, **Notoriedad** y **Ciclo de día** tienen sus valores en "Sistemas de diseño decididos" arriba.*

---

## Paso 8 — Catálogo de situaciones jugables

> *Equivalente a la "lista de escenas" en novela. Aquí: el catálogo de **tipos de situación** que el motor puede generar (no escenas guionizadas, sino patrones que emergen de los sistemas). Sirve para validar que el espacio de juego tiene variedad.*

| ID | Tipo | Disparador | Decisión central | Sistemas implicados | Duración estimada |
|---|---|---|---|---|---|
| S01 | Rescate limpio en zona fría | Día 1 / cualquier día con baja densidad de enemigos cerca de la zona | Ninguna real — onboarding | Pickup, descarga, créditos | 90 s |
| S02 | Rescate bajo fuego de AA estática | Día 2+ con posición candidata de AA activa en la zona | ¿Sigilo lento por las afueras o ruta directa rápida con riesgo? | Sigilo, AA telegrafía, daño al heli | 2–4 min |
| S03 | Persecución de drones en enjambre | Notoriedad ≥3★ + spawn de eswarm cercano | ¿Aterrizo en zona segura para que pierdan línea o huyo en horizontal? | Notoriedad, eswarm boids, sigilo | 1–3 min |
| S04 | Punto de descarga cercano saturado | Tras 2–3 entregas seguidas al mismo destino | ¿Voy al lejano seguro, al hospital cercano arriesgado, o espero a que se vacíe? | Saturación, riesgo de ruta, sigilo | Variable |
| S05 | Hospital atacado mientras descargas | Día 3+ con hospital activo + ataque de Goliath disparado | ¿Aborto la descarga y huyo con heridos a bordo, o aguanto los 3–6 s restantes? | Hospital en tierra, vulnerabilidad, daño al heli | 10–30 s |
| S06 | Oleada grande (8–10 heridos) | Día 4+ con zona de pickup activa | ¿Cargo 8 y vuelvo a por más, dejo a algunos, o llamo a las afueras y dejo morir a los demás? | Pickup cap, timer implícito, sigilo | 3–5 min |
| S07 | Heli dañado lejos del scrap | Daño acumulado + scrap más cercano en zona caliente | ¿Aterrizo a curarme arriesgándome o sigo herido al barco? | Scrap, curación, daño | 1–2 min |
| S08 | Notoriedad 5★ con pax a bordo | Acumulación de engagement en una sola salida | ¿Suelto pax en un hospital cercano arriesgado o intento aguantar al barco? | Notoriedad, todos los enemigos cazándote, pax | 1–3 min |
| S09 | Día 5 — extracción del representante | Inicio del día 5 | ¿Ruta directa al portaaviones o último ciclo de rescates antes? | Misión única, representante, portaaviones, todo el resto | 5–10 min |
| S10 | Múltiples zonas activas en paralelo | Día 2+ con varias `info_pickup` activas | ¿Qué zona primero según riesgo, distancia, número de heridos? | Pickup múltiple, planificación de ruta | Estructural |
| S11 | Todos los puntos de descarga llenos | Spam de entregas exitosas + barcos saturados a la vez | ¿Espero flotando, sigo recogiendo aceptando degradación a bordo, o cambio de zona? | Saturación global, micro-timer de degradación | Variable |

**Notas sobre el catálogo**:

- Las situaciones **no son escenas guionizadas**, emergen de los sistemas. Sirven para validar que el espacio de decisión es variado.
- Algunas situaciones se pueden **combinar** (ej. S02 + S06 = oleada grande con AA cerca). Eso multiplica la variedad sin trabajo extra.
- El día 5 (S09) es el único caso de **situación scripted** — es el clímax y conviene que sea predecible narrativamente.
- Si en una sesión de prueba alguna situación **no aparece nunca**, es señal de que falta tunear los disparadores. Si una aparece **siempre**, es señal de que domina el bucle y aburre.

---

## Paso 9 — Tuning y telemetría *(opcional, después de la primera build)*

> *Equivalente al "borrador detallado por escena" en novela, pero aplicado al juego: cada sistema del paso 7 se contrasta con datos reales de juego. Qué métricas observamos, qué valores ajustamos, qué condiciones de victoria/derrota afinamos.*

_(pendiente — solo tiene sentido empezar este paso cuando exista build jugable)_

---

## Paso 10 — Primera build jugable

> *Con todo el esqueleto montado, implementar es resolver detalles técnicos, no inventar diseño.*

Estado actual: el mod ya tiene **~95% de sistemas base implementados** (ver [estrella.md](estrella.md) sección "Otros sistemas vivos en el codigo"). El paso 10 consiste en:

1. Confrontar el diseño de pasos 1–9 con el código existente.
2. Marcar qué encaja directamente, qué pide ajuste, qué es nuevo (ej. `info_hospital`, ciclo de día, saturación de puntos de descarga).
3. Priorizar la cola de implementación: empezar por el sistema cuya ausencia más rompe la experiencia diseñada en el paso 4–6.

---

## Notas de trabajo

- Si un paso revela que algo del juego ya implementado no encaja con el diseño que vamos a escribir, marcarlo aquí — para decidir si se cambia el diseño o se ajusta el código.
- Cuando un paso esté listo, mover su `_(pendiente)_` al contenido real y marcar el paso con ✅ en el título.

## Referencias

- [Uplifter.md](Uplifter.md) — diseño general del mod.
- [gameplay.md](gameplay.md) — bucle de juego, estrellas, sigilo, armas.
