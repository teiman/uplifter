# Uplifter — mod

The Quake mod itself (ironwail engine), built on AirQuake. See the top-level
[../README.md](../README.md) for the premise, world, and gameplay overview.

## Structure

```
mod/
  src/        - Server-side QuakeC (progs.dat). progs.src lists the file order.
  csrc/       - Client-side QuakeC (csprogs.dat). csprogs.src lists the order.
  bin/        - fteqcc64.exe (QuakeC compiler).
  progs/      - .mdl/.spr models and skins (vehicles, projectiles, weapons).
  gfx/        - HUD, skyboxes (gfx/env), conback, etc.
  sound/      - mod sounds.
  *.CFG *.RC *.TXT - mod configs inherited from airquake_dv.
  build.bat   - compile / deploy / run (subcommands).
```

The QC code originates from `D:\quake\airquake_dev\src` and
`D:\quake\airquake_dev\csrc` (decompiled from AirQuake's original PROGS.DAT).
The `progs/`, `gfx/`, `sound/` assets and the `.CFG/.RC/.TXT` configs come from
the installed copy at `D:\quake\uplifter`.

## build.bat

Everything runs through `build.bat <command> [map]`. With no arguments it runs `compile`.

| Command | What it does |
|---------|--------------|
| `build.bat compile` | Compiles `src/*.qc` → `progs.dat` and `csrc/*.qc` → `csprogs.dat` in `mod/`. |
| `build.bat deploy` | Copies `progs.dat` and `csprogs.dat` to the install at `D:\quake\uplifter`. |
| `build.bat run [map]` | Launches `ironwail.exe -game uplifter +map <map>`. Default map: `uplifter`. |
| `build.bat all [map]` | `compile` + `deploy` + `run` chained. |

## Syncing with D:\quake\uplifter

The flow always goes **this repo → install**. Never the other way around.

| What changes | Where it's edited | How it reaches the install |
|--------------|-------------------|----------------------------|
| QC code (`src/`, `csrc/`) | `mod/` | `build.bat compile` + `build.bat deploy` |
| Maps (`.bsp`) | ModEditor | The editor writes directly into `D:\quake\uplifter\maps\` |
| Models / sounds / textures | `mod/` | By hand: copy into `D:\quake\uplifter\{progs,sound,gfx}` |
| `ironwail.cfg`, `config.cfg`, `autosave/`, `screenshots/` | Written by the game | Stay in the install, we don't track them |

`deploy` does NOT drag the whole `progs/`, `gfx/`, `sound/` trees, to keep the
cycle fast. When you add a new asset, copy it over by hand the first time.

## What is NOT versioned

- `PAK0.PAK` and `PAK1.PAK` from the install (inherited from airquake_dv, not the mod).
- `progs.dat` and `csprogs.dat` (build artifacts, regenerable).
- `maps/` (the `.bsp` files are written by the ModEditor into the install, not here).
- AirQuake's inherited skyboxes under `gfx/env/*` except the `uplifter_*` ones
  (~119 MB of TGA we don't use). See [../.gitignore](../.gitignore).
- `bin/fteqcc64.exe` (kept local, not committed).
- `autosave/`, `screenshots/`, `config.cfg`, `ironwail.cfg` from the install
  (runtime state).
