# Uplifter

A total-conversion mod for **Quake** (running on the [ironwail](https://github.com/andrei-drexler/ironwail) engine), built on top of [AirQuake](https://www.quaddicted.com/reviews/airquake.html) by Iikka Keränen.

You pilot a rescue helicopter over a global ocean dotted with islands. Enemy forces attack coastal towns with helicopters, tanks, and the occasional aircraft. Your job is to fly into the hot zone, land, pick up fleeing civilians, photograph war crimes from the air, and bring everyone back to the carrier.

> The mod targets very large open-air maps (±16384 units, 16× a standard Quake map), which requires the **BSP2** format and the **"bigcoords" protocol 666** — both natively supported by ironwail.

## What's in this repository

This repo holds **source and tooling only**. Runtime assets (`.mdl` models, `.wav` sounds, sprites, compiled maps, `progs.dat`) live in the mod install directory, not here.

```
uplifter/
  mod/          - The Quake mod itself.
    src/        - Server-side QuakeC (compiles to progs.dat). progs.src lists file order.
    csrc/       - Client-side QuakeC (compiles to csprogs.dat).
    bin/        - fteqcc64.exe (QuakeC compiler) — not versioned.
    gfx/        - HUD, conback, skyboxes.
    *.CFG *.RC  - Mod configs inherited from airquake_dv.
    *.TXT       - Original AirQuake documentation by Iikka Keränen (attribution).
    build.bat   - Compile / deploy / run the mod.
  modeditor/    - Electron map editor for building the large BSP2 outdoor maps.
  tools/        - Helper tooling (e.g. Aseprite Quake palette export).
  ref/          - Reference material and the third-party ironwail engine (not versioned).
```

## Gameplay

A helicopter rescues civilians in a hot zone and ferries them back to the carrier. Fly low to stay unseen — the more you're spotted, the harder the enemy comes after you.

- **Main loop:** one rescue objective is active at a time. Fly to the pickup zone, land, board civilians (up to 8), then fly them to the carrier and unload. A new objective then activates.
- **Notoriety (stars):** a GTA-style 0–5 wanted system. Taking photos, firing weapons, and flying high raise your stars; time, stealth (flying low), and landing on the carrier lower them. Higher stars mean a more aggressive enemy response.
- **Camera:** your primary weapon is a camera. Photographing enemy vehicles or in-progress "war crimes" earns credits and stars.
- **Healing:** collect scrap scattered across the map to slowly heal between fights.
- **Days:** a session runs through 5 escalating days, each a wave of civilians to rescue, with upgrade choices between days.

## Building the mod

The mod is compiled with [fteqcc](https://www.fteqcc.org/). Everything is driven by `mod/build.bat`:

```bat
build.bat compile      :: src/*.qc → progs.dat, csrc/*.qc → csprogs.dat
build.bat deploy       :: copy the compiled .dat files to the install dir
build.bat run [map]    :: launch ironwail.exe -game uplifter +map <map>
build.bat all [map]    :: compile + deploy + run
```

`fteqcc64.exe` is expected in `mod/bin/` (kept locally, not committed). See `mod/README.md` for the full build/deploy flow.

## ModEditor

`modeditor/` is an Electron + React tool for authoring the large outdoor maps the mod needs. It models each map as a 2D grid of textured, height-mapped cells and emits BSP2 maps with the bigcoords protocol set automatically.

```bash
cd modeditor
npm install
npm run dev      # vite + electron with hot reload
npm start        # production build + electron
```

## Credits & licensing

- Built on **AirQuake 1.00** by **Iikka Keränen** — the original AirQuake documentation is preserved in `mod/*.TXT`.
- Runs on **ironwail** by Andrei Drexler.
- Derives from id Software's Quake, which was released under the GNU GPL.

No project-wide license file is included yet. The QuakeC sources derive from GPL'd id Software code; treat them accordingly.
