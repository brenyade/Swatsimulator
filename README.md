# SWAT Simulator

A single-player tactical law-enforcement simulation built entirely with HTML5
Canvas and vanilla JavaScript — no game engine, no build step, no external
assets. Runs in any modern browser.

## Play it

```
node server.js
```

Then open **http://localhost:8080** and click **PLAY NOW** for an instant
standalone deployment, or **CAREER MODE** for the 5-mission story campaign.

No npm install is required — the dev server is a zero-dependency Node script.

## Features

- **Play Now** — jump straight into a standalone tactical deployment.
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
| WASD | Move |
| Mouse | Aim |
| Left Click | Fire |
| R | Reload |
| Q | Switch lethal / less-lethal |
| F | Throw flashbang (or breach a nearby closed door) |
| E | Interact — cuff a surrendered suspect, free a hostage, open a door |
| 1 / 2 / 3+Click / 4 | Team: Follow / Hold / Move to marker / Breach & clear |
| Space | Order nearby suspects to surrender |
| Esc | Pause |

## Project layout

```
index.html / styles.css   Screens & UI chrome
src/main.js                Screen navigation & app wiring
src/engine/                Game loop, rendering, input, pathfinding/LOS, mission runtime
src/entities/               Player, Teammate, Suspect, Hostage, Civilian
src/core/                   Weapons, combat resolution, commands, scoring, career save, audio
src/maps/                   Procedural map builder + all 6 mission definitions
scripts/validateMaps.mjs    Offline sanity check (connectivity, spawn placement) for every map
```

Run `npm run validate-maps` any time you edit `src/maps/mapData.js` to check
that every spawn point is reachable and out of walls.
