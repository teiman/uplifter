# Uplifter — mod

Mod de Quake (motor ironwail) basado en Airquake. Premisa, mundo y skybox: ver
[../Uplifter.md](../Uplifter.md).

## Estructura

```
mod/
  src/        - QuakeC del servidor (progs.dat). progs.src lista el orden.
  csrc/       - QuakeC del cliente (csprogs.dat). csprogs.src lista el orden.
  bin/        - fteqcc64.exe (compilador QC).
  progs/      - modelos .mdl/.spr y skins (vehiculos, proyectiles, armas).
  gfx/        - HUD, skyboxes (gfx/env), conback, etc.
  sound/      - sonidos del mod.
  *.CFG *.RC *.TXT - configs del mod heredados de airquake_dv.
  build.bat   - compila / despliega / lanza (subcomandos).
```

El codigo QC viene de `D:\quake\airquake_dev\src` y `D:\quake\airquake_dev\csrc`
(decompilado del PROGS.DAT original de Airquake). Los assets de `progs/`, `gfx/`,
`sound/` y los configs `.CFG/.RC/.TXT` vienen de la copia instalada en
`D:\quake\uplifter`.

## build.bat

Todo se hace con `build.bat <comando> [map]`. Sin argumentos hace `compile`.

| Comando | Qué hace |
|---------|----------|
| `build.bat compile` | Compila `src/*.qc` → `progs.dat` y `csrc/*.qc` → `csprogs.dat` en `mod/`. |
| `build.bat deploy` | Copia `progs.dat` y `csprogs.dat` al install `D:\quake\uplifter`. |
| `build.bat run [map]` | Lanza `ironwail.exe -game uplifter +map <map>`. Map por defecto: `uplifter`. |
| `build.bat all [map]` | `compile` + `deploy` + `run` en cadena. |

## Sincronización con D:\quake\uplifter

Todo el flujo va de **este repo → install**. Nunca al revés.

| Qué cambia | Dónde se edita | Cómo llega al install |
|------------|-----------------|---------------------------|
| Código QC (`src/`, `csrc/`) | `mod/` | `build.bat compile` + `build.bat deploy` |
| Mapas (`.bsp`) | ModEditor | El editor escribe directamente en `D:\quake\uplifter\maps\` |
| Modelos / sonidos / texturas | `mod/` | A mano: copiar a `D:\quake\uplifter\{progs,sound,gfx}` |
| `ironwail.cfg`, `config.cfg`, `autosave/`, `screenshots/` | Los escribe el juego | Se quedan en el install, no nos importan |

El `deploy` NO arrastra `progs/`, `gfx/`, `sound/` enteros para mantener el ciclo
rápido. Si añades un asset nuevo, cópialo a mano la primera vez.

## Que NO esta versionado

- `PAK0.PAK` y `PAK1.PAK` del install (heredados de airquake_dv, no del mod).
- `progs.dat` y `csprogs.dat` (artefactos del build, regenerables).
- `maps/` (los `.bsp` los escribe el ModEditor en el install, no aqui).
- Skyboxes heredados de airquake en `gfx/env/*` excepto los `uplifter_*`
  (~119 MB de TGA que no usamos). Ver [../.gitignore](../.gitignore).
- `bin/fteqcc64.exe` (mantener local, no commit).
- `autosave/`, `screenshots/`, `config.cfg`, `ironwail.cfg` del install
  (estado de runtime).
