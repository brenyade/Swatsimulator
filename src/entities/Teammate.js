import { Entity } from './Entity.js';
import { WEAPONS } from '../core/Weapons.js';
import { fireShot } from '../core/Combat.js';
import { dist, hasLineOfSight } from '../engine/utils.js';
import { playShot } from '../core/Audio.js';

const VISION_RANGE = 320;

export class Teammate extends Entity {
  constructor(x, y, name, formationIndex) {
    super(x, y);
    this.radius = 10;
    this.speed = 105;
    this.hp = 100;
    this.maxHp = 100;
    this.team = 'teammate';
    this.name = name;
    this.formationIndex = formationIndex;
    this.weaponId = 'mp5';
    this.fireCooldown = Math.random();

    this.order = 'follow'; // follow, hold, moveto, breach
    this.holdPoint = null;
    this.moveTarget = null;
    this.breachDoor = null;
    this.breachPhase = null;
    this.engaging = null;
  }

  formationOffset(player) {
    const angle = player.facing + Math.PI + (this.formationIndex === 0 ? -0.7 : this.formationIndex === 1 ? 0.7 : Math.PI);
    const distBack = 34;
    return { x: player.x + Math.cos(angle) * distBack, y: player.y + Math.sin(angle) * distBack };
  }

  setOrder(order, extra, mission) {
    this.order = order;
    if (order === 'hold') this.holdPoint = { x: this.x, y: this.y };
    if (order === 'moveto') this.moveTarget = extra;
    if (order === 'breach') { this.breachDoor = extra; this.breachPhase = 'approach'; }
  }

  findVisibleThreat(mission) {
    let best = null, bestD = Infinity;
    for (const s of mission.suspects) {
      if (!s.alive || s.state !== 'hostile') continue;
      const d = dist(this.x, this.y, s.x, s.y);
      if (d > VISION_RANGE) continue;
      if (!hasLineOfSight(mission.map, this.x, this.y, s.x, s.y)) continue;
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  update(dt, mission) {
    if (!this.alive) return;
    if (this.stunTimer > 0) return;

    const threat = this.findVisibleThreat(mission);
    this.engaging = threat;
    if (threat) {
      const weapon = WEAPONS[this.weaponId];
      const d = dist(this.x, this.y, threat.x, threat.y);
      if (d > weapon.range * 0.7) {
        this.navigateTo(dt, mission.map, threat.x, threat.y, 1);
      } else {
        this.facing = Math.atan2(threat.y - this.y, threat.x - this.x);
      }
      this.fireCooldown -= dt;
      if (d <= weapon.range && this.fireCooldown <= 0) {
        this.fireCooldown = weapon.fireDelay * (1.0 + Math.random() * 0.3);
        const angle = Math.atan2(threat.y - this.y, threat.x - this.x);
        const tracers = fireShot({ shooter: this, weapon, angle, mission, ignoreIds: new Set([this.id]) });
        mission.addTracers(tracers);
        playShot(this.weaponId);
      }
      return;
    }

    if (this.order === 'follow') {
      const target = this.formationOffset(mission.player);
      this.navigateTo(dt, mission.map, target.x, target.y, 1);
    } else if (this.order === 'hold' && this.holdPoint) {
      if (dist(this.x, this.y, this.holdPoint.x, this.holdPoint.y) > 12) {
        this.navigateTo(dt, mission.map, this.holdPoint.x, this.holdPoint.y, 1);
      }
    } else if (this.order === 'moveto' && this.moveTarget) {
      const reached = this.navigateTo(dt, mission.map, this.moveTarget.x, this.moveTarget.y, 1);
      if (reached) { this.order = 'hold'; this.holdPoint = { ...this.moveTarget }; }
    } else if (this.order === 'breach' && this.breachDoor) {
      this.updateBreach(dt, mission);
    }
  }

  updateBreach(dt, mission) {
    const door = this.breachDoor;
    if (this.breachPhase === 'approach') {
      const reached = this.navigateTo(dt, mission.map, door.worldX, door.worldY, 1);
      if (reached) this.breachPhase = 'open';
    } else if (this.breachPhase === 'open') {
      mission.openDoor(door.tx, door.ty);
      mission.spawnFlashbang(door.worldX, door.worldY, this.facing, true);
      this.breachPhase = 'enter';
    } else if (this.breachPhase === 'enter') {
      const inX = door.worldX + Math.cos(this.facing) * 40;
      const inY = door.worldY + Math.sin(this.facing) * 40;
      const reached = this.navigateTo(dt, mission.map, inX, inY, 1);
      if (reached) { this.order = 'hold'; this.holdPoint = { x: inX, y: inY }; this.breachDoor = null; }
    }
  }
}
