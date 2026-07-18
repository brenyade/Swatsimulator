import { Entity } from './Entity.js';
import { WEAPONS, freshAmmoState, EQUIPMENT } from '../core/Weapons.js';
import { fireShot } from '../core/Combat.js';
import { playShot } from '../core/Audio.js';
import { settings, BASE_YAW_RATE } from '../core/Settings.js';

const PITCH_LIMIT = 1.25;

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
    this.pitch = 0;
    this.recoil = 0;
  }

  get currentWeaponId() { return this.slot === 'lethal' ? this.loadout.lethal : this.loadout.nonlethal; }
  get currentWeapon() { return WEAPONS[this.currentWeaponId]; }
  get currentAmmo() { return this.ammo[this.currentWeaponId]; }

  update(dt, input, mission) {
    if (!this.alive) return;
    if (this.stunTimer > 0) { this.stunTimer -= dt; return; }

    const { x: yawPx, y: pitchPx } = input.consumeMouseDelta();
    const rate = BASE_YAW_RATE * settings.mouseSensitivity;
    this.facing += yawPx * rate;
    this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch - pitchPx * rate));

    const forward = { x: Math.cos(this.facing), y: Math.sin(this.facing) };
    const right = { x: Math.cos(this.facing + Math.PI / 2), y: Math.sin(this.facing + Math.PI / 2) };
    let mx = 0, my = 0;
    if (input.keys.has('w')) { mx += forward.x; my += forward.y; }
    if (input.keys.has('s')) { mx -= forward.x; my -= forward.y; }
    if (input.keys.has('a')) { mx -= right.x; my -= right.y; }
    if (input.keys.has('d')) { mx += right.x; my += right.y; }
    const len = Math.hypot(mx, my);
    if (len > 0) {
      mx /= len; my /= len;
      this.tryMove(mx * this.speed * dt, my * this.speed * dt, mission.map);
    }

    this.recoil *= Math.exp(-dt * 10);

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

    if (input.mouseDown && !ammo.reloading && ammo.cooldown <= 0) {
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
        this.recoil = Math.min(1.4, this.recoil + (this.currentWeapon.pellets ? 0.9 : 0.4));
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
