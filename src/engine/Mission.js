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

export class Mission {
  constructor(def) {
    this.def = def;
    this.map = { width: def.width, height: def.height, grid: def.grid, openDoors: new Set() };
    this.doorTiles = [];
    for (let y = 0; y < def.height; y++) {
      for (let x = 0; x < def.width; x++) {
        if (def.grid[y][x] === 'D') this.doorTiles.push({ tx: x, ty: y, wx: x * 32 + 16, wy: y * 32 + 16 });
      }
    }

    const p0 = tile(def.playerStart.tx, def.playerStart.ty);
    this.player = new Player(p0.x, p0.y, def.loadout);

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

    this.tracers = [];
    this.effects = [];
    this.score = new ScoreManager();
    this.timeRemaining = def.timeLimit;
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

  allActors() {
    return [this.player, ...this.teammates, ...this.suspects, ...this.hostages, ...this.civilians].filter((a) => a.alive);
  }

  banner(text) { this.bannerText = text; this.bannerTimer = 2.0; }

  addTracers(list) { for (const t of list) this.tracers.push({ ...t, age: 0 }); }

  openDoor(tx, ty) { this.map.openDoors.add(`${tx},${ty}`); }

  markLoudEvent(x, y) { this.lastLoudEventPos = { x, y }; this.lastLoudEventAge = 0; }

  onPlayerFired() { this.markLoudEvent(this.player.x, this.player.y); }

  onHit(shooter, target, dmg) {
    this.markLoudEvent(target.x, target.y);
    if (target.team === 'player') playHurt();
    if (target.alive || target._deathProcessed) return;
    target._deathProcessed = true;
    if (target.team === 'civilian') this.score.recordCivilianCasualty();
    else if (target.team === 'hostage') this.score.recordHostageDied();
    else if (target.team === 'suspect') this.score.recordSuspectDeath(target);
    else if (target.team === 'teammate') this.score.recordTeammateLost();
  }

  onNonLethalHit(shooter, target) {
    this.markLoudEvent(target.x, target.y);
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

    // doors open automatically once someone actually walks up to them
    for (const d of this.doorTiles) {
      if (this.map.openDoors.has(`${d.tx},${d.ty}`)) continue;
      for (const a of this.allActors()) {
        if (dist(a.x, a.y, d.wx, d.wy) < 20) { this.map.openDoors.add(`${d.tx},${d.ty}`); break; }
      }
    }

    this.player.update(dt, input, this);
    for (const t of this.teammates) t.update(dt, this);
    for (const s of this.suspects) s.update(dt, this);
    for (const h of this.hostages) h.update(dt, this);
    for (const c of this.civilians) c.update(dt, this);

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
    if (this.timeRemaining <= 0) { this.state = 'lost_time'; return; }
    if (this.allSuspectsResolved && this.allEvidenceCollected) { this.state = 'won'; return; }
  }
}
