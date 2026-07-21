import { Entity } from './Entity.js';
import { dist } from '../engine/utils.js';

export class Civilian extends Entity {
  constructor(opts) {
    super(opts.x, opts.y);
    this.radius = 10;
    this.speed = 95;
    this.hp = 30;
    this.maxHp = 30;
    this.team = 'civilian';
    this.name = opts.name || 'CIVILIAN';
    this.home = { x: opts.x, y: opts.y };
    this.wanderRadius = opts.wanderRadius ?? 60;
    this.state = 'idle';
    this.wanderTarget = null;
    this.pauseTimer = Math.random() * 2;
  }

  update(dt, mission) {
    if (!this.alive) return;
    if (this.tickStun(dt)) return;

    if (mission.lastLoudEventPos) {
      const d = dist(this.x, this.y, mission.lastLoudEventPos.x, mission.lastLoudEventPos.y);
      if (d < 200 && mission.lastLoudEventAge < 0.3) this.state = 'panic';
    }

    if (this.state === 'panic') {
      const away = mission.lastLoudEventPos;
      if (away) {
        const dx = this.x - away.x, dy = this.y - away.y;
        const d = Math.hypot(dx, dy) || 1;
        this.moveToward(this.x + (dx / d) * 40, this.y + (dy / d) * 40, dt, mission.map, 1.4);
      }
      this.pauseTimer -= dt;
      if (this.pauseTimer <= 0) { this.state = 'idle'; this.pauseTimer = 1 + Math.random() * 2; }
      return;
    }

    this.pauseTimer -= dt;
    if (this.pauseTimer <= 0) {
      if (!this.wanderTarget) {
        const ang = Math.random() * Math.PI * 2;
        this.wanderTarget = {
          x: this.home.x + Math.cos(ang) * this.wanderRadius,
          y: this.home.y + Math.sin(ang) * this.wanderRadius,
        };
      }
      const reached = this.moveToward(this.wanderTarget.x, this.wanderTarget.y, dt, mission.map, 0.4);
      if (reached) { this.wanderTarget = null; this.pauseTimer = 1.5 + Math.random() * 3; }
    }
  }

  onDeath() { this.state = 'dead'; }
}
