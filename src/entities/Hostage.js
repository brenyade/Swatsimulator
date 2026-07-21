import { Entity } from './Entity.js';

export class Hostage extends Entity {
  constructor(opts) {
    super(opts.x, opts.y);
    this.radius = 10;
    this.speed = 70;
    this.hp = 40;
    this.maxHp = 40;
    this.team = 'hostage';
    this.name = opts.name || 'HOSTAGE';
    this.state = 'held'; // held, freed, dead
    this.fleeTarget = opts.fleeTo || null;
  }

  update(dt, mission) {
    if (!this.alive) return;
    if (this.tickStun(dt)) return;
    if (this.state === 'freed' && this.fleeTarget) {
      this.navigateTo(dt, mission.map, this.fleeTarget.x, this.fleeTarget.y, 0.7);
    }
  }

  free(mission) {
    if (this.state !== 'held') return;
    this.state = 'freed';
    mission.onHostageFreed?.(this);
  }

  kill(mission) {
    if (this.state === 'dead') return;
    this.hp = 0;
    this.alive = false;
    this.state = 'dead';
    mission.onHostageDied?.(this);
  }

  onDeath() { this.state = 'dead'; }
}
