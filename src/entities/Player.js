import { Entity } from './Entity.js';
import { WEAPONS, freshAmmoState, EQUIPMENT } from '../core/Weapons.js';
import { fireShot } from '../core/Combat.js';
import { playShot } from '../core/Audio.js';
import { settings, BASE_YAW_RATE } from '../core/Settings.js';
import { clamp } from '../engine/utils.js';

const PITCH_LIMIT = 1.25;

export class Player extends Entity {
  constructor(x, y, loadout) {
    super(x, y);
    this.radius = 10;
    this.speed = 66;
    this.hp = 100;
    this.maxHp = 100;
    this.armor = 100;
    this.maxArmor = 100;
    this.team = 'player';
    this.velocityX = 0;
    this.velocityY = 0;
    this.isCrouching = false;
    this.crouchAmount = 0;
    this.lean = 0;

    this.loadout = loadout; // lethal firearm + less-lethal secondary
    this.slot = 'lethal'; // or 'nonlethal'
    this.ammo = {
      [loadout.lethal]: freshAmmoState(loadout.lethal),
      [loadout.nonlethal]: freshAmmoState(loadout.nonlethal),
    };
    this.flashbangs = EQUIPMENT.flashbang.maxCount;
    this.fireCooldown = 0;
    this.pitch = 0;
    this.recoil = 0;
    this.stamina = 100;
    this.maxStamina = 100;
    this.isMoving = false;
    this.isSprinting = false;
    this.isAiming = false;
    this.currentSpread = this.currentWeapon.spread;
    this.hitFlash = 0;
  }

  get currentWeaponId() { return this.slot === 'lethal' ? this.loadout.lethal : this.loadout.nonlethal; }
  get currentWeapon() { return WEAPONS[this.currentWeaponId]; }
  get currentAmmo() { return this.ammo[this.currentWeaponId]; }

  takeDamage(amount) {
    const absorbed = Math.min(this.armor, amount * 0.65);
    this.armor -= absorbed;
    super.takeDamage(amount - absorbed);
  }

  // Drives a brief red flash on the damage vignette, on top of the steady
  // low-health glow that HUD.js derives straight from current HP.
  registerHit(amount) {
    this.hitFlash = Math.min(1, this.hitFlash + 0.35 + Math.min(0.4, amount / 60));
  }

  update(dt, input, mission) {
    if (!this.alive) return;
    if (this.tickStun(dt)) {
      this.isSprinting = false;
      this.isAiming = false;
      return;
    }

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
    this.isMoving = len > 0;
    this.isAiming = input.aimDown && !this.currentAmmo.reloading;
    this.isCrouching = input.keys.has('control');
    this.crouchAmount += (Number(this.isCrouching) - this.crouchAmount) * (1 - Math.exp(-dt * 12));
    this.isSprinting = this.isMoving && input.keys.has('shift') && !this.isAiming && !this.isCrouching && this.stamina > 0;
    const leanTarget = this.isSprinting ? 0 : (input.keys.has('q') ? -1 : input.keys.has('e') ? 1 : 0);
    this.lean += (leanTarget - this.lean) * (1 - Math.exp(-dt * 14));
    if (this.isSprinting) this.stamina = Math.max(0, this.stamina - dt * 22);
    else this.stamina = Math.min(this.maxStamina, this.stamina + dt * 14);

    if (len > 0) { mx /= len; my /= len; }
    const healthSpeed = 0.72 + 0.28 * Math.max(0, this.hp / this.maxHp);
    const moveScale = this.isSprinting ? 1.34 : this.isCrouching ? 0.58 : this.isAiming ? 0.72 : 1;
    const targetVx = mx * this.speed * moveScale * healthSpeed;
    const targetVy = my * this.speed * moveScale * healthSpeed;
    const accel = len > 0 ? 360 : 520;
    this.velocityX += clamp(targetVx - this.velocityX, -accel * dt, accel * dt);
    this.velocityY += clamp(targetVy - this.velocityY, -accel * dt, accel * dt);
    if (Math.abs(this.velocityX) < 0.02) this.velocityX = 0;
    if (Math.abs(this.velocityY) < 0.02) this.velocityY = 0;
    this.tryMove(this.velocityX * dt, this.velocityY * dt, mission.map);

    this.recoil *= Math.exp(-dt * 10);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 1.6);

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

    const weapon = this.currentWeapon;
    const wantsFire = weapon.automatic ? input.mouseDown : input.mousePressed;
    const movementSpread = this.isSprinting ? 2.5 : this.isMoving ? 1.3 : 1;
    const aimSpread = this.isAiming ? 0.52 : 1;
    const stanceSpread = this.isCrouching ? 0.78 : 1;
    const injurySpread = 1 + (1 - Math.max(0, this.hp / this.maxHp)) * 0.55;
    const leanSpread = 1 + Math.abs(this.lean) * 0.08;
    const recoilSpread = 1 + this.recoil * 0.5;
    const spreadMultiplier = movementSpread * aimSpread * stanceSpread * injurySpread * leanSpread * recoilSpread;
    this.currentSpread = weapon.spread * spreadMultiplier;

    if (wantsFire && !this.isSprinting && !ammo.reloading && ammo.cooldown <= 0) {
      if (ammo.mag > 0) {
        ammo.mag -= 1;
        ammo.cooldown = weapon.fireDelay;
        const tracers = fireShot({
          shooter: this, weapon, angle: this.facing, spreadMultiplier,
          mission, ignoreIds: new Set([this.id]),
        });
        mission.addTracers(tracers);
        mission.onPlayerFired?.();
        playShot(this.currentWeaponId);
        this.recoil = Math.min(1.4, this.recoil + (weapon.pellets ? 0.9 : weapon.id === 'm4' ? 0.34 : 0.4));
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
