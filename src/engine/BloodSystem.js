import * as THREE from '../vendor/three.module.js';

// Physical gore: every hit throws a cone of droplets along the shot vector.
// Droplets are integrated with gravity and killed when they meet the floor or
// a wall, where they leave an oriented decal. Corpses bleed out into pools
// that keep growing after death. Everything lives in a handful of pooled
// InstancedMeshes so the draw-call cost is flat no matter how bloody it gets.

const GRAVITY = 9.0;
const FLOOR_Y = 0.02;
const MAX_FLOOR_DECALS = 320;
const MAX_WALL_DECALS = 220;
const MAX_POOLS = 80;

function makeSplatterTexture(spiky) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  let seed = spiky ? 90210 : 13377;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xffffffff; };
  const c = size / 2;

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(122, 6, 8, 1)';
  ctx.beginPath();
  const lobes = spiky ? 16 : 22;
  for (let i = 0; i <= lobes; i++) {
    const a = (i / lobes) * Math.PI * 2;
    const jitter = spiky ? (0.32 + rnd() * 0.68) : (0.74 + rnd() * 0.26);
    const r = c * 0.82 * jitter;
    const x = c + Math.cos(a) * r;
    const y = c + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();

  // Detached speckles around the main mass sell the "spray" read.
  const specks = spiky ? 90 : 34;
  for (let i = 0; i < specks; i++) {
    const a = rnd() * Math.PI * 2;
    const r = c * (0.4 + rnd() * 0.62);
    const rad = spiky ? 0.8 + rnd() * 3.2 : 1.5 + rnd() * 4.5;
    ctx.beginPath();
    ctx.arc(c + Math.cos(a) * r, c + Math.sin(a) * r, rad, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(96, 4, 6, ${0.5 + rnd() * 0.5})`;
    ctx.fill();
  }

  // Darker core for depth.
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.arc(c, c, c * 0.42, 0, Math.PI * 2);
  ctx.fillStyle = '#3a0203';
  ctx.fill();
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

class DecalLayer {
  constructor(scene, texture, capacity, renderOrder) {
    this.capacity = capacity;
    this.cursor = 0;
    this.used = 0;
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      opacity: 0.95,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    scene.add(this.mesh);
    this.geometry = geo;
    this.material = mat;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._pos = new THREE.Vector3();
    this._scale = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 0, 1);
  }

  place(x, y, z, normal, size, roll) {
    this._q.setFromUnitVectors(this._up, normal);
    const spin = new THREE.Quaternion().setFromAxisAngle(normal, roll);
    this._q.premultiply(spin);
    this._pos.set(x, y, z);
    this._scale.set(size, size * (0.78 + Math.random() * 0.5), 1);
    this._m.compose(this._pos, this._q, this._scale);
    this.mesh.setMatrixAt(this.cursor, this._m);
    this.cursor = (this.cursor + 1) % this.capacity;
    this.used = Math.min(this.capacity, this.used + 1);
    this.mesh.count = this.used;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.cursor = 0;
    this.used = 0;
    this.mesh.count = 0;
  }

  dispose() { this.geometry.dispose(); this.material.dispose(); }
}

export class BloodSystem {
  // `solidAt(worldX, worldZ)` lets droplets collide with walls without the
  // system needing to know anything about the tile grid itself.
  constructor(scene, { particleBudget = 320, goreLevel = 1 } = {}, solidAt = () => false) {
    this.scene = scene;
    this.goreLevel = goreLevel;
    this.solidAt = solidAt;
    this.screenSplatter = 0;

    this.splatterTex = makeSplatterTexture(true);
    this.poolTex = makeSplatterTexture(false);

    this.floorDecals = new DecalLayer(scene, this.splatterTex, MAX_FLOOR_DECALS, 1);
    this.wallDecals = new DecalLayer(scene, this.splatterTex, MAX_WALL_DECALS, 1);
    this.poolDecals = new DecalLayer(scene, this.poolTex, MAX_POOLS, 0);

    this.capacity = particleBudget;
    const dropGeo = new THREE.SphereGeometry(1, 5, 4);
    const dropMat = new THREE.MeshBasicMaterial({ color: 0x9c0f12 });
    this.droplets = new THREE.InstancedMesh(dropGeo, dropMat, this.capacity);
    this.droplets.frustumCulled = false;
    this.droplets.count = this.capacity;
    scene.add(this.droplets);
    this.dropGeo = dropGeo;
    this.dropMat = dropMat;

    this.particles = new Array(this.capacity);
    for (let i = 0; i < this.capacity; i++) {
      this.particles[i] = { alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 0.02, life: 0 };
    }
    this.next = 0;

    // Corpse bleed-outs: each grows toward its target radius over a few seconds.
    this.pools = [];

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._normal = new THREE.Vector3();
    this._hideAll();
  }

  _hideAll() {
    this._m.makeScale(0, 0, 0);
    for (let i = 0; i < this.capacity; i++) this.droplets.setMatrixAt(i, this._m);
    this.droplets.instanceMatrix.needsUpdate = true;
  }

  setGore(level) { this.goreLevel = level; }

  _spawnParticle(x, y, z, vx, vy, vz, r) {
    const p = this.particles[this.next];
    this.next = (this.next + 1) % this.capacity;
    p.alive = true;
    p.x = x; p.y = y; p.z = z;
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.r = r;
    p.life = 2.6;
  }

  // A hit: cone of droplets along the shot vector plus a back-spray, scaled by
  // how much damage landed. `power` 1 is a normal round, ~3 is a fatal burst.
  burst(x, y, z, dirX, dirZ, power = 1) {
    const gore = this.goreLevel;
    if (gore <= 0.01) return;
    const count = Math.round((10 + power * 16) * gore);
    const len = Math.hypot(dirX, dirZ) || 1;
    const dx = dirX / len, dz = dirZ / len;

    for (let i = 0; i < count; i++) {
      // Most of the spray continues through the target; a minority kicks back.
      const back = Math.random() < 0.22 ? -0.55 : 1;
      const spread = 0.75;
      const sx = dx * back + (Math.random() - 0.5) * spread;
      const sz = dz * back + (Math.random() - 0.5) * spread;
      const speed = (1.6 + Math.random() * 4.4) * (0.6 + power * 0.28);
      this._spawnParticle(
        x + (Math.random() - 0.5) * 0.12,
        y + (Math.random() - 0.5) * 0.22,
        z + (Math.random() - 0.5) * 0.12,
        sx * speed,
        1.1 + Math.random() * 3.0,
        sz * speed,
        0.014 + Math.random() * 0.028,
      );
    }

    // A wet mark right under the impact, so even a single body shot reads.
    this._normal.set(0, 1, 0);
    this.floorDecals.place(
      x + dx * 0.25, FLOOR_Y, z + dz * 0.25, this._normal,
      (0.22 + power * 0.16) * gore, Math.random() * Math.PI * 2,
    );
  }

  // Called when something dies: a heavy burst plus a pool that keeps spreading.
  gib(x, y, z, dirX, dirZ) {
    const gore = this.goreLevel;
    if (gore <= 0.01) return;
    this.burst(x, y, z, dirX, dirZ, 3.2);
    this.pools.push({
      x, z,
      radius: 0.12,
      target: (0.85 + Math.random() * 0.5) * gore,
      rate: 0.16,
      roll: Math.random() * Math.PI * 2,
      slot: -1,
    });
    if (this.pools.length > MAX_POOLS) this.pools.shift();
  }

  splashScreen(amount) {
    this.screenSplatter = Math.min(1, this.screenSplatter + amount * this.goreLevel);
  }

  update(dt, cameraPos) {
    const dropped = [];
    for (let i = 0; i < this.capacity; i++) {
      const p = this.particles[i];
      if (!p.alive) continue;

      const px = p.x, pz = p.z;
      p.vy -= GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.life -= dt;

      if (p.y <= FLOOR_Y) {
        this._normal.set(0, 1, 0);
        this.floorDecals.place(p.x, FLOOR_Y, p.z, this._normal, 0.09 + Math.random() * 0.22, Math.random() * Math.PI * 2);
        p.alive = false;
        dropped.push(i);
        continue;
      }
      if (this.solidAt(p.x, p.z)) {
        // Work out which axis we crossed so the decal lies flat on the wall.
        const crossedX = !this.solidAt(px, p.z);
        if (crossedX) this._normal.set(p.x > px ? -1 : 1, 0, 0);
        else this._normal.set(0, 0, p.z > pz ? -1 : 1);
        this.wallDecals.place(
          crossedX ? (p.x > px ? Math.floor(p.x / 2) * 2 + 2 - 0.01 : Math.ceil(p.x / 2) * 2 - 2 + 0.01) : p.x,
          Math.max(0.05, p.y),
          crossedX ? p.z : (p.z > pz ? Math.floor(p.z / 2) * 2 + 2 - 0.01 : Math.ceil(p.z / 2) * 2 - 2 + 0.01),
          this._normal,
          0.12 + Math.random() * 0.3,
          Math.random() * Math.PI * 2,
        );
        p.alive = false;
        dropped.push(i);
        continue;
      }
      if (p.life <= 0) { p.alive = false; dropped.push(i); }
    }

    // Push transforms for live droplets; retired ones collapse to zero scale.
    for (let i = 0; i < this.capacity; i++) {
      const p = this.particles[i];
      if (p.alive) {
        this._v.set(p.x, p.y, p.z);
        this._q.identity();
        // Stretch along the direction of travel so fast droplets read as streaks.
        const speed = Math.hypot(p.vx, p.vy, p.vz);
        const stretch = 1 + Math.min(2.5, speed * 0.18);
        this._s.set(p.r, p.r * stretch, p.r);
        if (speed > 0.001) {
          this._q.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            new THREE.Vector3(p.vx / speed, p.vy / speed, p.vz / speed),
          );
        }
        this._m.compose(this._v, this._q, this._s);
      } else {
        this._m.makeScale(0, 0, 0);
      }
      this.droplets.setMatrixAt(i, this._m);
    }
    this.droplets.instanceMatrix.needsUpdate = true;

    // Grow the bleed-out pools.
    let poolsDirty = false;
    for (const pool of this.pools) {
      if (pool.radius < pool.target) {
        pool.radius = Math.min(pool.target, pool.radius + pool.rate * dt);
        poolsDirty = true;
      }
      if (pool.slot < 0) { pool.slot = this.poolDecals.cursor; poolsDirty = true; }
    }
    if (poolsDirty) this._rebuildPools();

    if (this.screenSplatter > 0) this.screenSplatter = Math.max(0, this.screenSplatter - dt * 0.34);
  }

  _rebuildPools() {
    this.poolDecals.clear();
    this._normal.set(0, 1, 0);
    for (const pool of this.pools) {
      this.poolDecals.place(pool.x, FLOOR_Y - 0.004, pool.z, this._normal, pool.radius * 2, pool.roll);
    }
  }

  dispose() {
    this.floorDecals.dispose();
    this.wallDecals.dispose();
    this.poolDecals.dispose();
    this.dropGeo.dispose();
    this.dropMat.dispose();
    this.splatterTex.dispose();
    this.poolTex.dispose();
  }
}
