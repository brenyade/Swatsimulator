import { Player } from '../entities/Player.js';
import { Teammate } from '../entities/Teammate.js';
import { Suspect } from '../entities/Suspect.js';
import { Hostage } from '../entities/Hostage.js';
import { Civilian } from '../entities/Civilian.js';
import { ScoreManager } from '../core/ScoreManager.js';
import { tile } from '../maps/builder.js';
import { dist } from './utils.js';
import { playFlashbang, playHurt } from '../core/Audio.js';

const TEAM_NAMES = ['ALPHA', 'BRAVO'];
const MAX_BLOOD_POOLS = 48;

export class Mission {
  constructor(def) {
    this.def = def;
    this.map = {
      width: def.width,
      height: def.height,
      grid: def.grid,
      openDoors: new Set(),
      openingDoors: new Map(),
      doorModes: new Map(),
    };
    this.doorTiles = [];
    for (let y = 0; y < def.height; y++) {
      for (let x = 0; x < def.width; x++) {
        if (def.grid[y][x] === 'D') {
          const horizontalSupports = Number(def.grid[y]?.[x - 1] === '#') + Number(def.grid[y]?.[x + 1] === '#');
          const verticalSupports = Number(def.grid[y - 1]?.[x] === '#') + Number(def.grid[y + 1]?.[x] === '#');
          this.doorTiles.push({
            tx: x, ty: y, wx: x * 32 + 16, wy: y * 32 + 16,
            axis: horizontalSupports >= verticalSupports ? 'x' : 'y',
          });
        }
      }
    }

    this._buildRooms(def);

    const p0 = tile(def.playerStart.tx, def.playerStart.ty);
    this.player = new Player(p0.x, p0.y, def.loadout);
    const nearestEntry = this.doorTiles.reduce((best, doorTile) => {
      const d = dist(p0.x, p0.y, doorTile.wx, doorTile.wy);
      return !best || d < best.distance ? { doorTile, distance: d } : best;
    }, null);
    this.player.facing = Number.isFinite(def.playerStart.facing)
      ? def.playerStart.facing
      : nearestEntry ? Math.atan2(nearestEntry.doorTile.wy - p0.y, nearestEntry.doorTile.wx - p0.x) : 0;

    this.teammates = def.teammates.map((t, i) => {
      const w = tile(t.tx, t.ty);
      return new Teammate(w.x, w.y, TEAM_NAMES[i] || `T${i}`, i);
    });

    this.suspects = def.suspects.map((s) => {
      const w = tile(s.tx, s.ty);
      return new Suspect({
        ...s, x: w.x, y: w.y,
        patrol: s.patrol ? s.patrol.map((p) => tile(p.tx, p.ty)) : null,
        fleeTo: s.fleeTo ? tile(s.fleeTo.tx, s.fleeTo.ty) : null,
      });
    });

    this.hostages = def.hostages.map((h, i) => {
      const w = tile(h.tx, h.ty);
      const hostage = new Hostage({ ...h, x: w.x, y: w.y, fleeTo: p0 });
      hostage._index = i;
      return hostage;
    });

    this.civilians = (def.civilians || []).map((c) => {
      const w = tile(c.tx, c.ty);
      return new Civilian({ ...c, x: w.x, y: w.y });
    });

    this.evidencePoints = (def.evidence || []).map((e) => ({ ...tile(e.tx, e.ty), tx: e.tx, ty: e.ty, collected: false }));
    this.propPoints = (def.props || []).map((p) => {
      const x0 = p.x0 ?? p.tx;
      const y0 = p.y0 ?? p.ty;
      const x1 = p.x1 ?? p.tx;
      const y1 = p.y1 ?? p.ty;
      return {
        ...p,
        x0, y0, x1, y1,
        x: (x0 + x1 + 1) * 16,
        y: (y0 + y1 + 1) * 16,
      };
    });

    this.tracers = [];
    this.effects = [];
    this.bloodPools = [];
    this.score = new ScoreManager();
    this.timeRemaining = def.timeLimit;
    this.overtime = false;
    this.elapsed = 0;
    this.state = 'running';
    this.bannerText = '';
    this.bannerTimer = 0;
    this.lastLoudEventPos = null;
    this.lastLoudEventAge = 999;

    const CANVAS_W = 1000, CANVAS_H = 680;
    this.offsetX = Math.max(10, Math.round((CANVAS_W - def.width * 32) / 2));
    this.offsetY = Math.max(10, Math.round((CANVAS_H - def.height * 32) / 2));
  }

  // Segments the floor into rooms bounded by walls and doors (a closed
  // doorway separates two rooms), so autonomous teammates can prioritize
  // clearing space they haven't checked yet instead of wandering at random.
  _buildRooms(def) {
    this.rooms = [];
    this.roomIndex = new Map();
    this.visitedRooms = new Set();
    const seen = new Set();
    for (let y = 0; y < def.height; y++) {
      for (let x = 0; x < def.width; x++) {
        const key = `${x},${y}`;
        if (seen.has(key) || def.grid[y][x] !== '.') continue;
        const roomId = this.rooms.length;
        const tiles = [];
        const stack = [[x, y]];
        seen.add(key);
        while (stack.length) {
          const [cx, cy] = stack.pop();
          tiles.push({ tx: cx, ty: cy });
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= def.width || ny >= def.height) continue;
            const nKey = `${nx},${ny}`;
            if (seen.has(nKey) || def.grid[ny][nx] !== '.') continue;
            seen.add(nKey);
            stack.push([nx, ny]);
          }
        }
        let sx = 0, sy = 0;
        for (const t of tiles) { sx += t.tx; sy += t.ty; this.roomIndex.set(`${t.tx},${t.ty}`, roomId); }
        const avgTx = sx / tiles.length, avgTy = sy / tiles.length;
        // The centroid of an L-shaped or irregular room can land outside the
        // room entirely (inside a wall); snap to the closest tile that is
        // actually part of the room so it's always a reachable nav target.
        let center = tiles[0], centerD = Infinity;
        for (const t of tiles) {
          const d = (t.tx - avgTx) ** 2 + (t.ty - avgTy) ** 2;
          if (d < centerD) { centerD = d; center = t; }
        }
        this.rooms.push({
          id: roomId,
          tiles,
          cx: center.tx * 32 + 16,
          cy: center.ty * 32 + 16,
        });
      }
    }
  }

  roomIdAt(x, y) {
    const id = this.roomIndex.get(`${Math.floor(x / 32)},${Math.floor(y / 32)}`);
    return id === undefined ? null : id;
  }

  allActors() {
    return [this.player, ...this.teammates, ...this.suspects, ...this.hostages, ...this.civilians].filter((a) => a.alive);
  }

  banner(text) { this.bannerText = text; this.bannerTimer = 2.0; }

  addTracers(list) { for (const t of list) this.tracers.push({ ...t, age: 0 }); }

  openDoor(tx, ty, mode = 'normal') {
    const key = `${tx},${ty}`;
    if (this.map.openDoors.has(key) || this.map.openingDoors.has(key)) return;
    this.map.openingDoors.set(key, 0);
    this.map.doorModes.set(key, mode);
  }

  updateDoorOpenings(dt) {
    for (const [key, elapsed] of this.map.openingDoors) {
      const next = elapsed + dt;
      const mode = this.map.doorModes.get(key);
      const clearanceDelay = mode === 'breach' ? 0.09 : 0.18;
      if (next >= clearanceDelay) {
        this.map.openingDoors.delete(key);
        this.map.openDoors.add(key);
      } else {
        this.map.openingDoors.set(key, next);
      }
    }
  }

  markLoudEvent(x, y) { this.lastLoudEventPos = { x, y }; this.lastLoudEventAge = 0; }

  onPlayerFired() { this.markLoudEvent(this.player.x, this.player.y); }

  // dirX/dirY is the shot vector, so spray continues through the target
  // instead of puffing symmetrically. `power` scales with damage; `fatal`
  // upgrades the hit to a full burst plus a spreading pool.
  spawnBloodImpact(x, y, dirX = 1, dirY = 0, power = 1, fatal = false) {
    this.effects.push({ type: 'blood-burst', x, y, dirX, dirY, power, fatal, age: 0, duration: 0.4 });
  }

  spawnBloodPool(x, y) {
    this.bloodPools.push({ x, y, seed: Math.random() });
    if (this.bloodPools.length > MAX_BLOOD_POOLS) this.bloodPools.shift();
  }

  onHit(shooter, target, dmg) {
    this.markLoudEvent(target.x, target.y);
    if (target.team === 'player') { playHurt(); this.player.registerHit?.(dmg); }
    const ddx = target.x - shooter.x, ddy = target.y - shooter.y;
    const dl = Math.hypot(ddx, ddy) || 1;
    const dirX = ddx / dl, dirY = ddy / dl;
    this.spawnBloodImpact(target.x, target.y, dirX, dirY, Math.max(0.6, Math.min(3, dmg / 22)), false);
    if (shooter.team === 'player') {
      const suspectState = target.stateAtDeath || target.state;
      const unlawful = target.team === 'civilian'
        || target.team === 'hostage'
        || target.team === 'teammate'
        || (target.team === 'suspect' && suspectState !== 'hostile');
      if (unlawful && this.score.recordForceViolation(target)) this.banner('ROE VIOLATION — UNAUTHORIZED FORCE');
    }
    if (target.team === 'suspect') target.applyPressure?.(0.12 + Math.min(0.2, dmg / 120));
    if (target.alive || target._deathProcessed) return;
    target._deathProcessed = true;
    this.spawnBloodImpact(target.x, target.y, dirX, dirY, 3, true);
    this.spawnBloodPool(target.x, target.y);
    if (target.team === 'civilian') this.score.recordCivilianCasualty();
    else if (target.team === 'hostage') this.score.recordHostageDied();
    else if (target.team === 'suspect') this.score.recordSuspectDeath(target);
    else if (target.team === 'teammate') this.score.recordTeammateLost();
  }

  onNonLethalHit(shooter, target) {
    this.markLoudEvent(target.x, target.y);
    if (target.team === 'suspect') target.applyPressure?.(0.42);
  }

  onHostageFreed() { this.score.recordHostageFreed(); this.banner('HOSTAGE RESCUED'); }
  onHostageDied(h) {
    if (h._deathProcessed) return;
    h._deathProcessed = true;
    this.score.recordHostageDied();
    this.banner('HOSTAGE DOWN');
  }
  onSuspectArrested() { this.score.recordArrest(); }

  spawnFlashbang(x, y, angle, isTeammateThrow = false) {
    const dist_ = isTeammateThrow ? 46 : 130;
    const bx = x + Math.cos(angle) * dist_;
    const by = y + Math.sin(angle) * dist_;
    this.effects.push({ type: 'flashbang-fly', x, y, tx: bx, ty: by, age: 0, duration: 0.35 });
    this.markLoudEvent(bx, by);
  }

  triggerFlashbangBlast(x, y) {
    const RADIUS = 150;
    playFlashbang();
    this.effects.push({ type: 'flashbang-blast', x, y, age: 0, duration: 0.6, radius: RADIUS });
    for (const a of this.allActors()) {
      if (dist(a.x, a.y, x, y) > RADIUS) continue;
      if (a.team === 'suspect' || a.team === 'civilian' || a.team === 'teammate' || a.team === 'player') {
        a.stun?.(a.team === 'suspect' ? 4.5 : 1.5);
        if (a.team === 'suspect') a.applyPressure?.(0.55);
      }
    }
  }

  secureEvidenceNear(x, y, range = 40) {
    for (const e of this.evidencePoints) {
      if (e.collected) continue;
      if (dist(x, y, e.x, e.y) < range) {
        e.collected = true;
        this.banner('EVIDENCE SECURED');
        return true;
      }
    }
    return false;
  }

  get allEvidenceCollected() { return this.evidencePoints.every((e) => e.collected); }
  get allSuspectsResolved() { return this.suspects.every((s) => s.isNeutralized); }
  get allHostagesResolved() { return this.hostages.every((h) => h.state !== 'held'); }

  update(dt, input) {
    if (this.state !== 'running') return;

    this.elapsed += dt;
    this.timeRemaining -= dt;
    this.lastLoudEventAge += dt;
    if (this.bannerTimer > 0) this.bannerTimer -= dt;

    this.updateDoorOpenings(dt);

    // AI can still move through closed doors when they reach them, but the
    // player must explicitly open or kick doors for dynamic entry to matter.
    if (this.doorTiles.length) {
      const nonPlayerActors = [...this.teammates, ...this.suspects, ...this.hostages, ...this.civilians]
        .filter((actor) => actor.alive);
      for (const d of this.doorTiles) {
        const key = `${d.tx},${d.ty}`;
        if (this.map.openDoors.has(key) || this.map.openingDoors.has(key)) continue;
        for (const a of nonPlayerActors) {
          if (a.team === 'teammate' && ['stack', 'breach', 'entry'].includes(a.order)) continue;
          if (dist(a.x, a.y, d.wx, d.wy) < 30) { this.openDoor(d.tx, d.ty); break; }
        }
      }
    }

    this.player.update(dt, input, this);
    for (const t of this.teammates) t.update(dt, this);
    for (const s of this.suspects) s.update(dt, this);
    for (const h of this.hostages) h.update(dt, this);
    for (const c of this.civilians) c.update(dt, this);

    if (this.player.alive) {
      const pr = this.roomIdAt(this.player.x, this.player.y);
      if (pr !== null) this.visitedRooms.add(pr);
    }
    for (const t of this.teammates) {
      if (!t.alive) continue;
      const r = this.roomIdAt(t.x, t.y);
      if (r !== null) this.visitedRooms.add(r);
    }

    for (const fx of this.effects) {
      fx.age += dt;
      if (fx.type === 'flashbang-fly' && fx.age >= fx.duration && !fx.exploded) {
        fx.exploded = true;
        this.triggerFlashbangBlast(fx.tx, fx.ty);
      }
    }
    this.effects = this.effects.filter((fx) => fx.age < (fx.type === 'flashbang-blast' ? fx.duration : fx.duration + 2));
    this.tracers.forEach((t) => (t.age += dt));
    this.tracers = this.tracers.filter((t) => t.age < 0.08);

    this.score.timeElapsed = this.elapsed;

    if (!this.player.alive) { this.state = 'lost_dead'; return; }
    if (this.timeRemaining <= 0 && !this.overtime) {
      this.overtime = true;
      this.banner('COMMAND: OVERTIME — COMPLETE THE CLEAR');
    }
    if (this.allSuspectsResolved && this.allEvidenceCollected && this.allHostagesResolved) {
      this.state = 'won';
    }
  }
}
