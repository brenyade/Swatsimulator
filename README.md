# SWAT Simulator

A single-player, first-person 3D tactical law-enforcement simulation built
with Three.js and vanilla JavaScript — no game engine, no build step. Runs in
any modern browser with WebGL.

## Play it

```
node server.js
```

Then open **http://localhost:8080** and click **PLAY NOW** for an instant
standalone deployment, or **CAREER MODE** for the 6-mission story campaign.
Click the canvas once to lock your mouse for look-around controls.

No npm install is required — the dev server is a zero-dependency Node script
and Three.js is vendored directly in `src/vendor/three.module.js`.

## Features

- **First-person 3D** — real WebGL scenes (walls, doors, floors, lighting,
  fog) built from the same tile maps, with mouse-look (pointer lock), a
  correctly scaled weapon viewmodel, recoil kick, responsive viewport sizing,
  native fullscreen controls and compact HUD layouts for smaller displays.
- **Upgraded tactical models** — rigged, animated humanoids now receive layered
  armour, helmets, optics, radios and role-specific equipment. The entire
  weapon set — pistol, MP5, M4A1, shotgun, taser and pepperball launcher — is
  built procedurally, so there are no external model files to source or
  license. Procedural wooden doors use a separate frame and hinged leaf, with
  distinct interaction and breach speeds.
- **Mission-specific environments** — every operation has its own lighting,
  fog, wall, door and colour treatment. Procedural high-frequency floor detail,
  soft shadows, tone mapping and physical materials replace the flat look.
  Semantic furniture and cover now render as shelves, counters, sofas, beds,
  lab benches, teller stations, cubicles, conference furniture and pallet racks.
- **Play Now** — jump straight into a standalone tactical deployment.
- **Career Mode** — a 6-mission story campaign (Metro City SWAT, Team 5) with
  briefings, a mission-select dossier, unlockable missions, and per-mission
  best-grade tracking saved to `localStorage`.
- **Tactical AI** — suspects patrol locally, investigate nearby gunfire, spot
  officers through vision cones, and react according to morale. Flashbangs,
  less-lethal hits and controlled force reduce resistance and make surrender
  more likely. Repeated lawful commands build compliance pressure instead of
  resolving the encounter with one random roll.
- **Hostages & civilians** — hostages can be freed or (if you take too long
  in a standoff) executed by their captor; civilians panic and flee gunfire,
  and can be caught in crossfire like anyone else on the map.
- **AI teammates** — two SWAT officers who follow, hold position, move to a
  marker, stack on a selected doorway, execute a second-stage breach/clear
  order, or clear the building autonomously. Hold and stack orders preserve
  position while officers cover threats; autonomous mode prioritizes rooms
  that haven't been checked yet and beelines for any known hostile to engage.
- **Grounded officer handling** — accelerated movement, slower tactical pace,
  crouch, lean, armor, injury penalties, soft overtime and immediate ROE
  violation feedback reward deliberate clearing over rushing.
- **Weapons & equipment** — pistol, MP5, M4A1, shotgun, taser, pepperball
  launcher, flashbangs, aim-down-sights, stamina-based sprinting, movement and
  recoil accuracy penalties, and a "dynamic entry" door-breach action.
- **Scoring** — SWAT-style grading (arrests vs. justified/excessive force,
  hostages saved, civilian casualties, teammates lost, time) producing an
  S–F mission grade.
- **Procedural audio** — gunfire, flashbangs, alerts and arrests are
  synthesized live via the Web Audio API; no sound files to download.
- **Armory, Options, Credits** — full menu suite around the game.

## Controls

| Key | Action |
|---|---|
| Click canvas | Enable mouse look (pointer lock) |
| Mouse | Look / turn |
| WASD | Move (relative to where you're facing) |
| Left Click | Fire |
| Right Click | Aim down sights |
| Shift | Sprint (uses stamina) |
| R | Reload |
| Q / E | Lean left / right |
| Ctrl | Crouch |
| X | Switch lethal / less-lethal |
| B | Kick / breach a nearby closed door |
| G | Throw flashbang |
| F | Context action — cuff, rescue, secure evidence, or open a door |
| 1 / 2 / 3 / 4 | Team: Follow / Hold / Move ahead of you / Breach & clear |
| 5 | Team: Autonomous — independently clear rooms and engage |
| Space | Order nearby suspects to surrender |
| Esc | Pause (releases mouse look) |
| Alt + Enter | Toggle native fullscreen |

## Project layout

```
index.html / styles.css   Screens & UI chrome
src/main.js                Screen navigation & app wiring, asset preload
src/vendor/                 Vendored Three.js loaders + fflate (MIT, no CDN dependency)
src/vendor/models/          Character, weapon, prop and door models (see each asset's source/license notes)
src/engine/                Game loop, 3D renderer, model library, input, pathfinding/LOS, mission runtime
src/entities/               Player, Teammate, Suspect, Hostage, Civilian
src/core/                   Weapons, combat resolution, commands, scoring, career save, audio, settings
src/maps/                   Procedural map builder + 1 quickplay and 6 career missions
scripts/validateMaps.mjs    Offline sanity check (connectivity, spawn placement) for every map
```

The underlying simulation (movement, pathfinding, line-of-sight, combat) is a
proven 2D top-down model on a tile grid; `Renderer3D.js` is purely a 3D
presentation layer over that same world state, so gameplay logic didn't have
to be rebuilt for the 3D conversion.

Run `npm test` after changes. It checks every map for reachable spawn points,
verifies the animation-loop lifecycle, confirms campaign/weapon progression,
and ensures the runtime model pipeline stays fully local.
