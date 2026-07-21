import { Entity } from './Entity.js';
import { WEAPONS } from '../core/Weapons.js';
import { fireShot, hasClearShot } from '../core/Combat.js';
import { findPath, hasLineOfSight, dist } from '../engine/utils.js';
import { playShot, playAlert } from '../core/Audio.js';

const VISION_RANGE = 230;
const VISION_ANGLE = Math.PI * 0.6; // cone half-angle while unaware
const HEARING_RANGE = 310;

export class Suspect extends Entity {
  constructor(opts) {
    super(opts.x, opts.y);
    this.radius = 11;
    this.speed = opts.elite ? 78 : 62;
    this.hp = opts.elite ? 90 : 70;
    this.maxHp = this.hp;
    this.armor = opts.elite ? 42 : 0;
    this.team = 'suspect';

    this.armed = opts.armed !== false;
    this.willSurrender = opts.willSurrender ?? (this.armed ? 0.5 : 0.95);
    this.elite = !!opts.elite;
    this.runner = !!opts.runner;
    this.guarding = opts.guarding ?? null; // hostage id
    this.weaponId = opts.weaponId || (this.elite ? 'mp5' : 'm9');
    this.patrol = opts.patrol || null;
    this.fleeTo = opts.fleeTo || null;
    this.name = opts.name || 'SUSPECT';
    this.home = { x: opts.x, y: opts.y };
    this.wanderRadius = opts.wanderRadius ?? 150;
    this.morale = opts.morale ?? (this.elite ? 0.92 : this.armed ? 0.66 : 0.3);
    this.compliancePressure = 0;

    this.state = 'idle'; // idle, alert, hostile, surrendering, arrested, fleeing
    this.patrolIdx = 0;
    this.path = [];
    this.repathTimer = 0;
    this.alertTimer = 0;
    this.loseTargetTimer = 0;
    this.fireCooldown = Math.random();
    this.target = null;
    this.lastKnownPos = null;
    this.standoffTimer = 0;
    this.wanderPause = Math.random() * 2;
    this.wanderTarget = null;
    this.wanderTimer = Math.random() * 3;
  }

  get isThreatActive() { return this.alive && (this.state === 'alert' || this.state === 'hostile'); }
  get isNeutralized() { return !this.alive || this.state === 'arrested' || this.state === 'fleeing' && this.escaped; }

  takeDamage(amount) {
    const absorbed = Math.min(this.armor, amount * 0.48);
    this.armor -= absorbed;
    super.takeDamage(amount - absorbed);
  }

  applyPressure(amount) {
    if (this.elite) amount *= 0.45;
    this.morale = Math.max(0, this.morale - amount);
  }

  receiveCommand(amount, mission) {
    if (!this.alive || this.state === 'arrested' || this.state === 'surrendering') return false;
    this.applyPressure(amount * 0.5);
    this.compliancePressure += amount * (1.15 - this.morale * 0.35);
    const threshold = (this.armed ? 0.72 : 0.24)
      + (1 - this.willSurrender) * 0.55
      + (this.elite ? 0.62 : 0);
    if (this.isStunned || this.compliancePressure >= threshold || this.morale < 0.08) {
      this.state = 'surrendering';
      this.target = null;
      this.lastKnownPos = null;
      mission.banner(`${this.name}: HANDS UP`);
      return true;
    }
    if (this.state === 'idle') this.state = 'alert';
    this.alertTimer = Math.max(this.alertTimer, this.armed ? 0.75 : 1.2);
    return false;
  }

  findVisibleTarget(mission) {
    const candidates = [mission.player, ...mission.teammates].filter(a => a.alive);
    let best = null, bestD = Infinity;
    for (const c of candidates) {
      const d = dist(this.x, this.y, c.x, c.y);
      if (d > VISION_RANGE) continue;
      if (this.state === 'idle') {
        const ang = Math.atan2(c.y - this.y, c.x - this.x);
        let diff = Math.abs(ang - this.facing);
        if (diff > Math.PI) diff = 2 * Math.PI - diff;
        if (diff > VISION_ANGLE) continue;
      }
      if (!hasLineOfSight(mission.map, this.x, this.y, c.x, c.y)) continue;
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  update(dt, mission) {
    if (!this.alive || this.state === 'arrested') return;
    if (this.tickStun(dt)) return;

    if (this.state === 'fleeing') { this.updateFleeing(dt, mission); return; }
    if (this.state === 'surrendering') {
      // stands still, hands up. Occasionally re-evaluate nothing; player must arrest.
      return;
    }

    const seen = this.findVisibleTarget(mission);

    if (this.state === 'idle' && mission.lastLoudEventPos && mission.lastLoudEventAge < 0.35) {
      const heardDistance = dist(this.x, this.y, mission.lastLoudEventPos.x, mission.lastLoudEventPos.y);
      if (heardDistance <= HEARING_RANGE) {
        this.state = 'alert';
        this.lastKnownPos = { ...mission.lastLoudEventPos };
        this.facing = Math.atan2(this.lastKnownPos.y - this.y, this.lastKnownPos.x - this.x);
        this.alertTimer = 1.1;
        this.loseTargetTimer = 0;
        playAlert();
      }
    }

    if (this.state === 'idle') {
      this.updatePatrol(dt, mission);
      if (seen) {
        this.state = 'alert';
        this.target = seen;
        this.alertTimer = this.elite ? 0.4 : 0.9;
        this.loseTargetTimer = 0;
        playAlert();
      }
      return;
    }

    if (this.state === 'alert') {
      if (seen) {
        this.target = seen;
        this.lastKnownPos = { x: seen.x, y: seen.y };
        this.facing = Math.atan2(seen.y - this.y, seen.x - this.x);
        this.alertTimer -= dt;
        this.loseTargetTimer = 0;
        if (this.alertTimer <= 0) {
          if (this.armed) {
            this.state = 'hostile';
          } else if (this.runner) {
            this.state = 'fleeing';
          } else if (Math.random() < this.willSurrender) {
            this.state = 'surrendering';
          } else {
            this.state = 'hostile'; // refuses to comply, resists
          }
        }
      } else {
        this.loseTargetTimer += dt;
        if (this.lastKnownPos) this.navigateTo(dt, mission.map, this.lastKnownPos.x, this.lastKnownPos.y, 0.65);
        if (this.loseTargetTimer > 5) { this.state = 'idle'; this.target = null; this.lastKnownPos = null; }
      }
      return;
    }

    if (this.state === 'hostile') {
      this.updateHostile(dt, mission, seen);
      return;
    }
  }

  updatePatrol(dt, mission) {
    if (!this.patrol || this.patrol.length === 0) {
      this.wanderTimer -= dt;
      if (!this.wanderTarget || this.wanderTimer <= 0 || dist(this.x, this.y, this.wanderTarget.x, this.wanderTarget.y) < 18) {
        const candidates = [];
        for (let ty = 1; ty < mission.map.height - 1; ty++) {
          for (let tx = 1; tx < mission.map.width - 1; tx++) {
            const x = tx * 32 + 16, y = ty * 32 + 16;
            if (mission.map.grid[ty][tx] !== '#' && dist(this.home.x, this.home.y, x, y) <= this.wanderRadius) {
              candidates.push({ x, y });
            }
          }
        }
        this.wanderTarget = candidates[Math.floor(Math.random() * candidates.length)] || { x: this.x, y: this.y };
        this.wanderTimer = 3 + Math.random() * 6;
      }
      this.navigateTo(dt, mission.map, this.wanderTarget.x, this.wanderTarget.y, 0.55);
      return;
    }
    if (this.wanderPause > 0) { this.wanderPause -= dt; return; }
    const wp = this.patrol[this.patrolIdx];
    const reached = this.navigateTo(dt, mission.map, wp.x, wp.y, 0.55);
    if (reached) {
      this.patrolIdx = (this.patrolIdx + 1) % this.patrol.length;
      this.wanderPause = 1.5 + Math.random() * 2;
    }
  }

  updateHostile(dt, mission, seen) {
    const weapon = WEAPONS[this.weaponId];
    if (!this.elite && this.morale < 0.14 && Math.random() < dt * 0.8) {
      this.state = 'surrendering';
      this.target = null;
      mission.banner(`${this.name}: SURRENDERING`);
      return;
    }
    if (seen) {
      this.target = seen;
      this.lastKnownPos = { x: seen.x, y: seen.y };
      this.loseTargetTimer = 0;
      const d = dist(this.x, this.y, seen.x, seen.y);
      const preferred = weapon.range * 0.65;
      if (d > preferred) {
        this.navigateTo(dt, mission.map, seen.x, seen.y, 1);
      } else {
        this.facing = Math.atan2(seen.y - this.y, seen.x - this.x);
      }
      this.fireCooldown -= dt;
      const clearLane = d <= weapon.range && this.fireCooldown <= 0 && hasClearShot(
        mission.map, mission.allActors(), this.x, this.y, seen.x, seen.y, new Set([this.id]),
      );
      if (d <= weapon.range && clearLane && this.fireCooldown <= 0) {
        this.fireCooldown = weapon.fireDelay * (0.9 + Math.random() * 0.4);
        const angle = Math.atan2(seen.y - this.y, seen.x - this.x);
        const tracers = fireShot({ shooter: this, weapon, angle, mission, ignoreIds: new Set([this.id]) });
        mission.addTracers(tracers);
        playShot(this.weaponId);
      }

      // standoff / hostage execution risk
      if (this.guarding !== null) {
        this.standoffTimer += dt;
        const hostage = mission.hostages.find(h => h.id === this.guarding || h._index === this.guarding);
        if (hostage && hostage.state === 'held' && this.standoffTimer > 14 && dist(this.x, this.y, hostage.x, hostage.y) < 80) {
          const chancePerSecond = 0.025;
          if (Math.random() < chancePerSecond * dt * 30) {
            hostage.kill(mission);
          }
        }
      }
    } else {
      this.loseTargetTimer += dt;
      if (this.lastKnownPos) {
        this.navigateTo(dt, mission.map, this.lastKnownPos.x, this.lastKnownPos.y, 0.85);
      }
      if (this.loseTargetTimer > 3.5) { this.state = 'alert'; this.alertTimer = 1.2; }
    }
  }

  updateFleeing(dt, mission) {
    if (!this.fleeTo) { this.state = 'hostile'; return; }
    const reached = this.navigateTo(dt, mission.map, this.fleeTo.x, this.fleeTo.y, 1.1);
    if (reached) {
      this.escaped = true;
      this.alive = false;
      mission.score.recordEscape();
    }
  }

  onDeath() { this.stateAtDeath = this.state; this.state = 'dead'; }
}
