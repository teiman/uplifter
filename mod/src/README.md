# AirQuake - QC Source Code (decompiled)

Decompiled from `PROGS.DAT` (1997) using `fteqcc64 -d`.
Vanilla reference in `ref/vanilla/` for comparison.

## AirQuake-exclusive files

### Planes (5 variants)
| File | Description |
|------|-------------|
| plane.qc | Base aircraft weapon system: ammo mapping and v_* models |
| plane1.qc | Variant 1: auto, rocket, sidewinder, maverick |
| plane2.qc | Variant 2: auto, sidewinder, bomb, maverick |
| plane3.qc | Variant 3: auto, sidewinder, pave low, maverick |
| plane4.qc | Variant 4: auto, sidewinder, bomb, maverick |
| plane5.qc | Variant 5: auto, plasma, rocket, sidewinder |

### Helicopter
| File | Description |
|------|-------------|
| he.qc | Helicopter entity: touch, damage and explosion |
| helo1.qc | Helicopter weapon system: ammo mapping and v_* models |
| hedrone.qc | Helicopter AI: target acquisition and turret aiming |

### Ground vehicles
| File | Description |
|------|-------------|
| ground.qc | Ground vehicle physics engine: terrain tilting, suspension |
| ground1.qc | Tank: steering and engine sound system |
| ground2.qc | HMMV (humvee): steering and engine sound |
| ground3.qc | Car/jeep: steering and engine sound |
| ground4.qc | Hovercraft: steering and hover engine sound |

### Flight/vehicle control system
| File | Description |
|------|-------------|
| ac.qc | Aircraft control: camera think, target tracking, behavior |
| acguns.qc | Ammo management: checks ammo types and availability |
| acitems.qc | Item pickup and ammo inventory |
| acdrone.qc | Drone sound engine: speed-dependent audio (jet) |
| acdrone2.qc | Drone weapon systems: fires spikes, cannons and bombs |

### Enemies
| File | Description |
|------|-------------|
| eground.qc | Enemy ground vehicle terrain tilting |
| etank.qc | Enemy tank engine sound |
| ehmmv.qc | Enemy humvee engine sound |
| emsam.qc | Enemy mobile SAM: target search, turret rotation |
| sam.qc | Stationary SAM launcher: aims and fires surface-to-air missiles |
| aag.qc | Anti-aircraft artillery enemy |
| amg.qc | Air-to-ground missile enemy: aims and launches at targets |
| rad.qc | Radar/detection: finds targets by team and distance |

### Utilities and misc
| File | Description |
|------|-------------|
| airmisc.qc | Bit calculation functions for flags |
| control.qc | Runway triggers: detects aircraft landings |
| admin.qc | Server admin menu: kick, map change, game limits |
| dummy.qc | Dummy entity that explodes on contact |
| xwall.qc | Expandable wall: spawn and visibility management |

## Files shared with vanilla Quake (modified)
ai, buttons, client, combat, defs, doors, fight, misc, monsters, plats, player, subs, sysdefs, triggers, weapons, world

## Vanilla Quake files removed (monsters)
boss, demon, dog, enforcer, fish, hknight, items, knight, ogre, oldone, shalrath, shambler, soldier, tarbaby, wizard, zombie
