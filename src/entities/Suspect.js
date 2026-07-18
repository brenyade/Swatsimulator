import { Entity } from './Entity.js';
import { WEAPONS } from '../core/Weapons.js';
import { fireShot } from '../core/Combat.js';
import { findPath, hasLineOfSight, dist } from '../engine/utils.js';
import { playShot, playAlert } from '../core/Audio.js';

const VISION_RANGE = 230;
const VISION_ANGLE = Math.PI * 0.6; // cone half-angle while unaware

export class Suspect extends Entity {
  constructor(opts) {
    super(opts.x, opts.y);
    this.radius = 11;
    this.speed = opts.elite ? 78 : 62;
    this.hp = opts.elite ? 140 : 70;
    this.maxHp = this.hp;
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
  }

  get isThreatActive() { return this.alive && (this.state === 'alert' || this.state === 'hostile'); }
  get isNeutralized() { return !this.alive || this.state === 'arrested' || this.state === 'fleeing' && this.escaped; }

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
    if (this.stunTimer > 0) return;

    if (this.state === 'fleeing') { this.updateFleeing(dt, mission); return; }
    if (this.state === 'surrendering') {
      // stands still, hands up. Occasionally re-evaluate nothing; player must arrest.
      return;
    }

    const seen = this.findVisibleTarget(mission);

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
        if (this.loseTargetTimer > 2.5) { this.state = 'idle'; this.target = null; }
      }
      return;
    }

    if (this.state === 'hostile') {
      this.updateHostile(dt, mission, seen);
      return;
    }
  }

  updatePatrol(dt, mission) {
    if (!this.patrol || this.patrol.length === 0) return;
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
      if (d <= weapon.range && this.fireCooldown <= 0) {
        this.fireCooldown = weapon.fireDelay * (0.9 + Math.random() * 0.4);
        const angle = Math.atan2(seen.y - this.y, seen.x - this.x);
        const tracers = fireShot({ shooter: this, weapon, angle, mission, ignoreIds: new Set([this.id]) });
        mission.addTracers(tracers);
        playShot(this.weaponId);
      }

      // standoff / hostage execution risk
      if (this.guarding) {
        this.standoffTimer += dt;
        const hostage = mission.hostages.find(h => h.id === this.guarding);
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
    if (reached) { this.escaped = true; this.alive = false; }
  }

  onDeath() { this.stateAtDeath = this.state; this.state = 'dead'; }
}
