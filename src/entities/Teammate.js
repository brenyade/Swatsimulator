import { Entity } from './Entity.js';
import { WEAPONS } from '../core/Weapons.js';
import { fireShot, hasClearShot } from '../core/Combat.js';
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
    this.stackPoint = null;
    this.entryDoor = null;
    this.engaging = null;
    this.scoutTarget = null;
    this.scoutTimer = Math.random() * 2;
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
    if (order === 'stack') { this.stackPoint = extra.point; this.breachDoor = extra.door; }
    if (order === 'entry') { this.entryDoor = extra; }
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
    if (this.tickStun(dt)) return;

    const threat = this.findVisibleThreat(mission);
    this.engaging = threat;
    if (threat) {
      const weapon = WEAPONS[this.weaponId];
      const d = dist(this.x, this.y, threat.x, threat.y);
      const holdPosition = this.order === 'hold' || this.order === 'stack';
      if (d > weapon.range * 0.7 && !holdPosition) {
        this.navigateTo(dt, mission.map, threat.x, threat.y, 1);
      } else {
        this.facing = Math.atan2(threat.y - this.y, threat.x - this.x);
      }
      this.fireCooldown -= dt;
      // Line-of-fire only needs checking right before a shot actually goes
      // out, not every frame a threat is merely in view.
      const clearLane = d <= weapon.range && this.fireCooldown <= 0 && hasClearShot(
        mission.map, mission.allActors(), this.x, this.y, threat.x, threat.y, new Set([this.id]),
      );
      if (d <= weapon.range && clearLane && this.fireCooldown <= 0) {
        this.fireCooldown = weapon.fireDelay * (1.0 + Math.random() * 0.3);
        const angle = Math.atan2(threat.y - this.y, threat.x - this.x);
        const tracers = fireShot({ shooter: this, weapon, angle, mission, ignoreIds: new Set([this.id]) });
        mission.addTracers(tracers);
        playShot(this.weaponId);
      }
      return;
    }

    if (this.order === 'autonomous') {
      this.scoutTimer -= dt;
      const arrived = this.scoutTarget && dist(this.x, this.y, this.scoutTarget.x, this.scoutTarget.y) < 18;
      if (!this.scoutTarget || this.scoutTimer <= 0 || arrived) {
        // Clearing priority: hunt down a known hostile first, otherwise head
        // for the nearest room nobody on the team has checked yet.
        const hostile = mission.suspects.find((s) => s.alive && s.state === 'hostile');
        if (hostile) {
          this.scoutTarget = { x: hostile.x, y: hostile.y };
          this.scoutUrgent = true;
          this.scoutTimer = 1.2;
        } else {
          const unvisited = mission.rooms.filter((r) => !mission.visitedRooms.has(r.id));
          const pool = unvisited.length ? unvisited : mission.rooms;
          let best = null, bestD = Infinity;
          for (const r of pool) {
            const d = dist(this.x, this.y, r.cx, r.cy);
            if (d < bestD) { bestD = d; best = r; }
          }
          this.scoutTarget = best ? { x: best.cx, y: best.cy } : { x: this.x, y: this.y };
          this.scoutUrgent = false;
          this.scoutTimer = 4 + Math.random() * 4;
        }
      }
      this.navigateTo(dt, mission.map, this.scoutTarget.x, this.scoutTarget.y, this.scoutUrgent ? 0.95 : 0.72);
    } else if (this.order === 'follow') {
      const target = this.formationOffset(mission.player);
      this.navigateTo(dt, mission.map, target.x, target.y, 1);
    } else if (this.order === 'hold' && this.holdPoint) {
      if (dist(this.x, this.y, this.holdPoint.x, this.holdPoint.y) > 12) {
        this.navigateTo(dt, mission.map, this.holdPoint.x, this.holdPoint.y, 1);
      }
    } else if (this.order === 'moveto' && this.moveTarget) {
      const reached = this.navigateTo(dt, mission.map, this.moveTarget.x, this.moveTarget.y, 1);
      if (reached) { this.order = 'hold'; this.holdPoint = { ...this.moveTarget }; }
    } else if (this.order === 'stack' && this.stackPoint) {
      if (dist(this.x, this.y, this.stackPoint.x, this.stackPoint.y) > 10) {
        this.navigateTo(dt, mission.map, this.stackPoint.x, this.stackPoint.y, 0.82);
      } else if (this.breachDoor) {
        this.facing = Math.atan2(this.breachDoor.worldY - this.y, this.breachDoor.worldX - this.x);
      }
    } else if (this.order === 'breach' && this.breachDoor) {
      this.updateBreach(dt, mission);
    } else if (this.order === 'entry' && this.entryDoor) {
      const key = `${this.entryDoor.tx},${this.entryDoor.ty}`;
      if (mission.map.openDoors.has(key)) {
        const reached = this.navigateTo(dt, mission.map, this.entryDoor.entryX, this.entryDoor.entryY, 0.92);
        if (reached) { this.order = 'hold'; this.holdPoint = { x: this.x, y: this.y }; this.entryDoor = null; }
      } else {
        this.facing = Math.atan2(this.entryDoor.worldY - this.y, this.entryDoor.worldX - this.x);
      }
    }
  }

  updateBreach(dt, mission) {
    const door = this.breachDoor;
    if (this.breachPhase === 'approach') {
      const reached = this.stackPoint
        ? this.navigateTo(dt, mission.map, this.stackPoint.x, this.stackPoint.y, 0.9)
        : dist(this.x, this.y, door.worldX, door.worldY) < 52;
      if (reached || dist(this.x, this.y, door.worldX, door.worldY) < 52) this.breachPhase = 'open';
    } else if (this.breachPhase === 'open') {
      mission.openDoor(door.tx, door.ty, 'breach');
      mission.spawnFlashbang(door.worldX, door.worldY, this.facing, true);
      this.breachPhase = 'enter';
    } else if (this.breachPhase === 'enter') {
      const inX = door.entryX ?? door.worldX + Math.cos(this.facing) * 40;
      const inY = door.entryY ?? door.worldY + Math.sin(this.facing) * 40;
      const reached = this.navigateTo(dt, mission.map, inX, inY, 1);
      if (reached) {
        this.order = 'hold'; this.holdPoint = { x: inX, y: inY }; this.breachDoor = null;
        mission.entryPlan = null;
      }
    }
  }
}
