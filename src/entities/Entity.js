import { isSolidTile, worldToTile, findPath, dist } from '../engine/utils.js';

let _nextId = 1;

export class Entity {
  constructor(x, y) {
    this.id = _nextId++;
    this.x = x;
    this.y = y;
    this.radius = 11;
    this.facing = 0;
    this.speed = 90;
    this.hp = 100;
    this.maxHp = 100;
    this.alive = true;
    this.stunTimer = 0;
  }

  get isStunned() { return this.stunTimer > 0; }

  takeDamage(amount) {
    if (!this.alive) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.onDeath?.();
    }
  }

  stun(seconds) {
    this.stunTimer = Math.max(this.stunTimer, seconds);
  }

  moveToward(tx, ty, dt, map, speedMul = 1) {
    const dx = tx - this.x, dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) return true;
    const step = Math.min(this.speed * speedMul * dt, d);
    this.facing = Math.atan2(dy, dx);
    this.tryMove((dx / d) * step, (dy / d) * step, map);
    return d <= step + 0.5;
  }

  collidesAt(x, y, map) {
    const r = this.radius;
    const pts = [[x - r, y], [x + r, y], [x, y - r], [x, y + r]];
    for (const [px, py] of pts) {
      const { tx, ty } = worldToTile(px, py);
      if (isSolidTile(map, tx, ty)) return true;
    }
    return false;
  }

  tryMove(dx, dy, map) {
    if (!map) { this.x += dx; this.y += dy; return; }
    const nx = this.x + dx;
    if (!this.collidesAt(nx, this.y, map)) this.x = nx;
    const ny = this.y + dy;
    if (!this.collidesAt(this.x, ny, map)) this.y = ny;
  }

  // Path-following navigation with a cached A* route, recomputed periodically
  // or when the destination moves. Returns true once within arrival distance.
  navigateTo(dt, map, tx, ty, speedMul = 1) {
    if (!this._navTarget || dist(this._navTarget.x, this._navTarget.y, tx, ty) > 24 || this._repath <= 0) {
      this._navPath = findPath(map, this.x, this.y, tx, ty);
      this._navTarget = { x: tx, y: ty };
      this._repath = 0.5 + Math.random() * 0.2;
    }
    this._repath -= dt;
    if (this._navPath && this._navPath.length > 0) {
      const wp = this._navPath[0];
      const reached = this.moveToward(wp.x, wp.y, dt, map, speedMul);
      if (reached) this._navPath.shift();
      return this._navPath.length === 0 && dist(this.x, this.y, tx, ty) < 20;
    }
    return this.moveToward(tx, ty, dt, map, speedMul);
  }
}
