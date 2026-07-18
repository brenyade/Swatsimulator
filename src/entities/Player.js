import { Entity } from './Entity.js';
import { WEAPONS, freshAmmoState, EQUIPMENT } from '../core/Weapons.js';
import { fireShot } from '../core/Combat.js';
import { playShot } from '../core/Audio.js';

export class Player extends Entity {
  constructor(x, y, loadout) {
    super(x, y);
    this.radius = 10;
    this.speed = 120;
    this.hp = 100;
    this.maxHp = 100;
    this.team = 'player';

    this.loadout = loadout; // { lethal: 'mp5'|'m9'|'shotgun', nonlethal: 'taser'|'pepperball' }
    this.slot = 'lethal'; // or 'nonlethal'
    this.ammo = {
      [loadout.lethal]: freshAmmoState(loadout.lethal),
      [loadout.nonlethal]: freshAmmoState(loadout.nonlethal),
    };
    this.flashbangs = EQUIPMENT.flashbang.maxCount;
    this.fireCooldown = 0;
    this.sprint = false;
  }

  get currentWeaponId() { return this.slot === 'lethal' ? this.loadout.lethal : this.loadout.nonlethal; }
  get currentWeapon() { return WEAPONS[this.currentWeaponId]; }
  get currentAmmo() { return this.ammo[this.currentWeaponId]; }

  update(dt, input, mission) {
    if (!this.alive) return;
    if (this.stunTimer > 0) { this.stunTimer -= dt; return; }

    let mx = 0, my = 0;
    if (input.keys.has('w')) my -= 1;
    if (input.keys.has('s')) my += 1;
    if (input.keys.has('a')) mx -= 1;
    if (input.keys.has('d')) mx += 1;
    const len = Math.hypot(mx, my);
    if (len > 0) {
      mx /= len; my /= len;
      this.tryMove(mx * this.speed * dt, my * this.speed * dt, mission.map);
    }

    this.facing = Math.atan2(input.mouseWorld.y - this.y, input.mouseWorld.x - this.x);

    const ammo = this.currentAmmo;
    if (ammo.reloading) {
      ammo.reloadT -= dt;
      if (ammo.reloadT <= 0) {
        ammo.reloading = false;
        const need = this.currentWeapon.magSize - ammo.mag;
        const take = Math.min(need, ammo.reserve);
        ammo.mag += take; ammo.reserve -= take;
      }
    }
    if (ammo.cooldown > 0) ammo.cooldown -= dt;

    if (input.mouseDown && !input.suppressFire && !ammo.reloading && ammo.cooldown <= 0) {
      if (ammo.mag > 0) {
        ammo.mag -= 1;
        ammo.cooldown = this.currentWeapon.fireDelay;
        const tracers = fireShot({
          shooter: this, weapon: this.currentWeapon, angle: this.facing,
          mission, ignoreIds: new Set([this.id]),
        });
        mission.addTracers(tracers);
        mission.onPlayerFired?.();
        playShot(this.currentWeaponId);
      } else if (ammo.reserve > 0) {
        this.reload();
      }
    }
  }

  reload() {
    const ammo = this.currentAmmo;
    if (ammo.reloading || ammo.reserve <= 0 || ammo.mag >= this.currentWeapon.magSize) return;
    ammo.reloading = true;
    ammo.reloadT = this.currentWeapon.reloadTime;
  }

  switchSlot() {
    this.slot = this.slot === 'lethal' ? 'nonlethal' : 'lethal';
  }

  throwFlashbang(mission) {
    if (this.flashbangs <= 0) return;
    this.flashbangs--;
    mission.spawnFlashbang(this.x, this.y, this.facing);
  }
}
