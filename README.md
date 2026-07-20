# SWAT Simulator

A single-player, first-person 3D tactical law-enforcement simulation built
with Three.js and vanilla JavaScript — no game engine, no build step. Runs in
any modern browser with WebGL.

## Play it

```
node server.js
```

Then open **http://localhost:8080** and click **PLAY NOW** for an instant
standalone deployment, or **CAREER MODE** for the 5-mission story campaign.
Click the canvas once to lock your mouse for look-around controls.

No npm install is required — the dev server is a zero-dependency Node script
and Three.js is vendored directly in `src/vendor/three.module.js`.

## Features

- **First-person 3D** — real WebGL scenes (walls, doors, floors, lighting,
  fog) built from the same tile maps, with mouse-look (pointer lock), a
  weapon viewmodel, and recoil kick.
- **Real 3D character & weapon models** — rigged, animated humanoid models
  (CC0, via Kenney's "Blocky Characters") play idle/walk/sprint/aim/shoot/die
  clips per AI state, with distinct looks for teammates, suspects, hostages
  and civilians. Weapons are real 3D models (Kenney's "Blaster Kit") recolored
  to tactical gunmetal tones for both the player viewmodel and NPCs.
- **Dressed-up maps** — the warehouse mission's cover is built from real
  stacked-crate props instead of flat wall blocks, with a tiled floor texture,
  ceiling, and fog throughout.
- **Play Now: Residential Home Invasion** — a house map that starts you
  outside in the yard. The front and back doors are actually locked (a real
  collision obstacle, not just closed) — walk up and press `E` to kick them
  in. Clear the living room, kitchen, and two bedrooms to rescue the
  homeowners.
- **Custom rifle model** — a hand-built (procedural, no external asset)
  designated-marksman rifle with a raised scope, ported handguard, curved
  magazine, and skeletonized stock, used as the Home Invasion loadout.
- **Custom Map upload** — write your own map as JSON (a tile grid plus
  spawn points) and load it straight from the main menu. It gets the same
  client-side validation as the build-time map checker (every spawn point
  on a floor tile and reachable) and the same AI as every built-in mission
  automatically — no code changes or redeploy needed. See "CUSTOM MAP" in
  the main menu for the schema and a downloadable template.
- **Career Mode** — a 5-mission story campaign (Metro City SWAT, Team 5) with
  briefings, a mission-select dossier, unlockable missions, and per-mission
  best-grade tracking saved to `localStorage`.
- **Tactical AI** — suspects patrol, spot you via line-of-sight and a vision
  cone, react on a delay, and either fight, flee, or surrender depending on
  whether they're armed and how you approach them. Order suspects to freeze
  with `Space`; a caught-early suspect is far more likely to comply.
- **Hostages & civilians** — hostages can be freed or (if you take too long
  in a standoff) executed by their captor; civilians panic and flee gunfire,
  and can be caught in crossfire like anyone else on the map.
- **AI teammates** — two SWAT officers who follow, hold position, move to a
  marker, or breach & clear a door on your command, and who automatically
  engage hostile suspects in their line of sight.
- **Weapons & equipment** — pistol, submachine gun, shotgun, taser,
  pepperball launcher, flashbangs, and a "dynamic entry" door-breach action.
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
| R | Reload |
| Q | Switch lethal / less-lethal |
| F | Throw flashbang (or breach a nearby closed door) |
| E | Interact — cuff a surrendered suspect, free a hostage, open a door, kick in a locked door |
| 1 / 2 / 3 / 4 | Team: Follow / Hold / Move ahead of you / Breach & clear |
| Space | Order nearby suspects to surrender |
| Esc | Pause (releases mouse look) |

## Project layout

```
index.html / styles.css   Screens & UI chrome
src/main.js                Screen navigation & app wiring, asset preload
src/vendor/                 Vendored Three.js + GLTFLoader (MIT/CC0, no CDN dependency)
src/vendor/models/          Character/weapon/prop GLB models (Kenney, CC0 — see LICENSE.txt)
src/engine/                Game loop, 3D renderer, model library, input, pathfinding/LOS, mission runtime
src/entities/               Player, Teammate, Suspect, Hostage, Civilian
src/core/                   Weapons, combat resolution, commands, scoring, career save, audio, settings
src/maps/                   Procedural map builder + all 6 mission definitions
scripts/validateMaps.mjs    Offline sanity check (connectivity, spawn placement) for every map
```

The underlying simulation (movement, pathfinding, line-of-sight, combat) is a
proven 2D top-down model on a tile grid; `Renderer3D.js` is purely a 3D
presentation layer over that same world state, so gameplay logic didn't have
to be rebuilt for the 3D conversion.

Run `npm run validate-maps` any time you edit `src/maps/mapData.js` to check
that every spawn point is reachable and out of walls.
