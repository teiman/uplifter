# Revisión — canal de televisión / noticiario de día

> Revisión de la idea del **noticiario de cabecera de día** descrita en
> [estrella-diseno.md](estrella-diseno.md) (paso 4, "Minuto 2–8 → Cabecera del día: noticiario falso").

## Restricción técnica

No somos capaces de mover la cámara. Por lo tanto, el **canal de televisión de 24 horas**
no se puede hacer tal y como lo habíamos imaginado (una emisión continua con plano propio,
cobertura en directo, etc.).

## Qué sí conservamos

La idea sigue siendo interesante, pero **reducida**:

- Solo como **apertura de cada día**, no como canal continuo.
- Con información **muy puntual**: una sola cosa concreta por día.

Razón: si saturamos al usuario con información, **no se queda con nada**. Un único mensaje
claro se recuerda; un parte largo se ignora.

## Decisión

Simplificar los mensajes que se muestran. Que al usuario le llegue **una sola cosa, muy
concreta**, al empezar el día.

Esto encaja con el formato que ya proponía el diseño (5–10 s, una o dos noticias por día,
titular en pantalla y voz over breve), pero lo lleva al mínimo: **un titular por día**.

### Voz (audio) del noticiario

Lo de meter voz me parece interesante: intentémoslo. La idea es crear una **herramienta**
a la que se le pase el texto de la noticia y lo convierta a un fichero de audio, ya en el
formato que necesita el mod (frecuencia de muestreo, mono, etc.). Ese audio se mete en el mod
y, cuando el texto de la noticia aparezca en pantalla, se reproduce.


## Decisiones

- **Un solo canal, un solo texto por día**: el mensaje del día se muestra **únicamente en el
  overlay del canal de noticias 24h** (el estilo CNN-7 / BREAKING NEWS que hoy solo usa el
  día 1). **No usamos la consola** (`bprint`): se mezcla con el texto del juego y queda feo.
  Hoy el código tiene tres salidas (banner de consola + `centerprint` en pantalla en días 2–5,
  y un overlay aparte en el día 1); se unifican todas en ese único overlay con un único texto.

- **Formato del titular**: texto en pantalla **y** voz over. Las dos cosas a la vez —
  el texto se lee en el overlay y, mientras aparece, se reproduce el audio generado por la
  herramienta.

- **El noticiario anticipa el día, no resume el pasado**: el titular le da al jugador una
  idea de **lo que se va a encontrar al empezar a jugar** ese día, no un recap de días o
  noticias anteriores. Por ejemplo, "Goliath ha atacado un hospital" es el aviso de que hoy
  van a aparecer misiones/eventos ligados a ese hospital. El titular y el estado del mundo
  del día (qué hospital cae, qué zonas se calientan, qué slots se activan) son la misma cosa:
  el noticiario es la cara narrativa del setup del día.

- **Días 4+ dinámicos**: la simplificación se mantiene también ahí. Se muestra **un solo
  titular**, el del evento más importante que define el día que arranca. Si el día monta
  varios cambios, una cola priorizada elige el de mayor peso y los demás no generan titular
  (no se acumulan).

- **De dónde sale el guion**: el script de cada día (qué pasa, qué mensaje sale) está en la
  planificación de [dias.md](dias.md) y en el ciclo de día (`mod/src/day.qc`). Los textos ya
  escritos (titulares en pantalla de días 2–5 y el overlay del día 1) están recogidos en
  [dias.md](dias.md) → "Textos del noticiario"; son la base. El banner de consola se descarta.

## Implementado

Unificado en código (antes había tres salidas distintas para el mensaje del día):

1. ✅ Quitados los `bprint` de cambio de día en `mod/src/day.qc` (ya no se usa la consola).
2. ✅ Todos los días (1–5) usan el **mismo overlay del canal de noticias** (`airquake_hud.qc`),
   publicado por un sistema de newscast ligero en `day.qc` (`News_Show` / `News_Tick`) que
   enciende `STAT_HUD_INTRO` con el código del día durante unos segundos. **Sin freeze del
   heli** (el viejo `Intro_Begin` que congelaba y rompía la cámara queda dormido en `intro.qc`).
3. ✅ **Un único titular por día** en el overlay (códigos 1..5 = día), seleccionado en el HUD.
4. ✅ **Voz (TTS) por día**: herramienta `mod/tools/gen-news-vo.ps1` (TTS offline de Windows,
   `System.Speech`, voz femenina Microsoft Zira) genera `sound/speech/news/day1..5.wav` en
   formato del mod (11025 Hz, 16-bit, mono). `News_Show` reproduce la voz del día junto al
   titular; `News_Precache` las precachea en worldspawn. El overlay dura 11 s, suficiente
   para cubrir el VO más largo (~10 s).

Pendiente todavía: decidir si el overlay debe **pausar/proteger** el heli mientras se muestra
(ahora aparece sobre el HUD en vivo, con la transición de fundido a negro del propio overlay).