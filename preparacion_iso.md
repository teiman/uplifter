# Preparación ISO — Enumeración de patrones 3x3

## Objetivo

Enumerar y visualizar todas las combinaciones únicas de un grid 3x3 donde cada celda puede estar **ocupada** o **vacía**, considerando equivalentes las combinaciones que coinciden bajo rotaciones de 90°.

## Arquitectura

- **Servidor**: Node.js sirviendo una página web estática y exponiendo una API para consultar/listar patrones.
- **Cliente**: página web que dibuja los patrones en un grid y se comunica con el servidor.

## Reglas de equivalencia

Una combinación A es equivalente a otra B si existe `N ∈ {0, 1, 2, 3}` tal que rotar A 90°·N produce B.

- Espacio total bruto: `2^9 = 512` combinaciones.
- Tras agrupar por clase de equivalencia rotacional (órbitas del grupo cíclico C₄), el conteo de clases únicas se reduce significativamente.
- Solo se cuenta **un representante** por clase.

## Identificación

Cada clase de equivalencia recibe un código incremental:

- `L0`, `L1`, `L2`, ...

El código se asigna al primer representante encontrado al recorrer las combinaciones en orden canónico (por ejemplo, por el entero formado al leer las 9 celdas como bits).

## Entregables

1. Servidor Node que sirve la página web y, opcionalmente, expone los patrones por API.
2. Página web que, para cada patrón único, muestra **dos vistas en paralelo**:
   - **Vista cenital (desde arriba)**: grid 2D 3x3 con las celdas ocupadas rellenas.
   - **Vista isométrica**: cada celda ocupada se renderiza como un cubo 3D en proyección isométrica.
   - Junto a cada patrón, su código `Lx`.
3. Algoritmo de canonicalización: dada una combinación, devolver el representante de su clase y su código.
