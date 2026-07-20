import * as THREE from '../vendor/three.module.js';
import {
  spawnCharacter, spawnWeapon, spawnProp, ROLE_VARIANTS,
} from './ModelLibrary.js';

// One world unit == half a tile (32px). Keeps corridors ~2 units wide and
// rooms human-scaled instead of cavernous.
const SCALE = 1 / 16;
const TILE_W = 32 * SCALE; // 2
const WALL_H = 3.0;
export const EYE_HEIGHT = 1.6;

export const gx = (x) => x * SCALE;
export const gz = (y) => y * SCALE;
export const yawFromFacing = (facing) => -facing - Math.PI / 2;

// Weapons are attached to the torso rather than the (single rigid-bone, no
// wrist) arm — the arm's rotation swings wildly between animation poses, so
// a torso-relative offset gives a stable "held at the ready" look instead.
const WEAPON_GRIP = { x: 0.62, y: 0.5, z: 0.2 };
const WEAPON_GRIP_ROT = { x: 0, y: Math.PI / 2, z: 0 };

function makeCheckerTexture(c1, c2, repeatX, repeatY) {
  const canvas = document.createElement('canvas');
  canvas.width = 2; canvas.height = 2;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = c1; ctx.fillRect(0, 0, 1, 1); ctx.fillRect(1, 1, 1, 1);
  ctx.fillStyle = c2; ctx.fillRect(1, 0, 1, 1); ctx.fillRect(0, 1, 1, 1);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.repeat.set(repeatX, repeatY);
  return tex;
}

function pickVariant(role, seed) {
  const list = ROLE_VARIANTS[role];
  return list[seed % list.length];
}

function attachWeapon(instance, weaponId) {
  const weapon = spawnWeapon(weaponId);
  weapon.position.set(WEAPON_GRIP.x, WEAPON_GRIP.y, WEAPON_GRIP.z);
  weapon.rotation.set(WEAPON_GRIP_ROT.x, WEAPON_GRIP_ROT.y, WEAPON_GRIP_ROT.z);
  weapon.scale.setScalar(1.1);
  instance.torso.add(weapon);
  return weapon;
}

function buildEliteMarker() {
  const marker = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.14, 0),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xaaaaaa, emissiveIntensity: 0.6 }),
  );
  marker.position.y = 2.05;
  return marker;
}

export class Renderer3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(canvas.width, canvas.height, false);

    this.camera = new THREE.PerspectiveCamera(78, canvas.width / canvas.height, 0.05, 90);
    this.camera.rotation.order = 'YXZ';

    this.headlamp = new THREE.PointLight(0xffedc4, 1.3, 12, 2);
    this.camera.add(this.headlamp);

    this.viewmodel = new THREE.Group();
    this.viewmodelWeaponId = null;
    this.viewmodelMesh = null;
    this.camera.add(this.viewmodel);

    this.scene = null;
    this.entityInstances = new Map(); // entity.id -> { instance, kind, lastX, lastY, animName }
    this.doorMeshes = [];
    this.evidenceMeshes = [];
    this.tracerGroup = null;
    this.markerRing = null;
    this._disposables = [];
    this._clock = 0;
  }

  _setViewmodelWeapon(weaponId) {
    if (this.viewmodelWeaponId === weaponId) return;
    if (this.viewmodelMesh) this.viewmodel.remove(this.viewmodelMesh);
    const weapon = spawnWeapon(weaponId);
    weapon.position.set(0.26, -0.28, -0.72);
    weapon.rotation.y = Math.PI / 2;
    weapon.scale.setScalar(0.55);
    this.viewmodel.add(weapon);
    this.viewmodelMesh = weapon;
    this.viewmodelWeaponId = weaponId;
  }

  disposeScene() {
    for (const d of this._disposables) d();
    this._disposables = [];
    this.entityInstances.clear();
    this.doorMeshes = [];
    this.evidenceMeshes = [];
  }

  buildScene(mission) {
    this.disposeScene();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07090a);
    scene.fog = new THREE.FogExp2(0x07090a, 0.032);
    scene.add(this.camera);

    scene.add(new THREE.HemisphereLight(0x9fb3c8, 0x232920, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 0.45);
    sun.position.set(6, 10, 4);
    scene.add(sun);

    const { map } = mission;
    const w = map.width * TILE_W, h = map.height * TILE_W;

    const floorTex = makeCheckerTexture('#1c2118', '#1a1f17', map.width, map.height);
    const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.95 });
    const floorGeo = new THREE.PlaneGeometry(w, h);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(w / 2 - TILE_W / 2, 0, h / 2 - TILE_W / 2);
    scene.add(floor);
    this._disposables.push(() => { floorGeo.dispose(); floorMat.dispose(); floorTex.dispose(); });

    const ceilGeo = new THREE.PlaneGeometry(w, h);
    const ceilMat = new THREE.MeshStandardMaterial({ color: 0x11140f, roughness: 1 });
    const ceiling = new THREE.Mesh(ceilGeo, ceilMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(w / 2 - TILE_W / 2, WALL_H, h / 2 - TILE_W / 2);
    scene.add(ceiling);
    this._disposables.push(() => { ceilGeo.dispose(); ceilMat.dispose(); });

    // walls — single instanced mesh for every solid tile that isn't a decorative prop
    const propTileKeys = new Set(mission.propPoints.map((p) => `${p.tx},${p.ty}`));
    const wallTiles = [];
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        if (map.grid[ty][tx] === '#' && !propTileKeys.has(`${tx},${ty}`)) wallTiles.push([tx, ty]);
      }
    }
    const wallGeo = new THREE.BoxGeometry(TILE_W, WALL_H, TILE_W);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x2a322b, roughness: 0.95 });
    const wallMesh = new THREE.InstancedMesh(wallGeo, wallMat, Math.max(1, wallTiles.length));
    const m4 = new THREE.Matrix4();
    wallTiles.forEach(([tx, ty], i) => {
      m4.makeTranslation(gx(tx * 32 + 16), WALL_H / 2, gz(ty * 32 + 16));
      wallMesh.setMatrixAt(i, m4);
    });
    wallMesh.count = wallTiles.length;
    scene.add(wallMesh);
    this._disposables.push(() => { wallGeo.dispose(); wallMat.dispose(); });

    // doors — individual meshes so they can be hidden once opened
    this.doorMeshes = [];
    const doorGeo = new THREE.BoxGeometry(TILE_W * 0.92, WALL_H * 0.9, TILE_W * 0.92);
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.8 });
    for (const d of mission.doorTiles) {
      const door = new THREE.Mesh(doorGeo, doorMat);
      door.position.set(gx(d.wx), WALL_H * 0.45, gz(d.wy));
      door.userData.key = `${d.tx},${d.ty}`;
      scene.add(door);
      this.doorMeshes.push(door);
    }
    this._disposables.push(() => { doorGeo.dispose(); doorMat.dispose(); });

    // evidence markers
    const evGeo = new THREE.OctahedronGeometry(0.22, 0);
    const evMat = new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0x554400, emissiveIntensity: 0.4 });
    this.evidenceMeshes = mission.evidencePoints.map((e) => {
      const mesh = new THREE.Mesh(evGeo, evMat);
      mesh.position.set(gx(e.x), 1.1, gz(e.y));
      mesh.userData.evidence = e;
      scene.add(mesh);
      return mesh;
    });
    this._disposables.push(() => { evGeo.dispose(); evMat.dispose(); });

    // move-to-marker ring (hidden until used)
    const ringGeo = new THREE.RingGeometry(0.35, 0.5, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x3ddc84, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
    this.markerRing = new THREE.Mesh(ringGeo, ringMat);
    this.markerRing.rotation.x = -Math.PI / 2;
    this.markerRing.visible = false;
    scene.add(this.markerRing);
    this._disposables.push(() => { ringGeo.dispose(); ringMat.dispose(); });

    // decorative props (crate stacks etc.) sitting where a plain wall would be
    for (const p of mission.propPoints) {
      const seedAngle = ((p.tx * 7 + p.ty * 13) % 4) * (Math.PI / 2);
      const crateScale = 1.7;
      const base = spawnProp('crateMedium');
      base.scale.setScalar(crateScale);
      base.rotation.y = seedAngle;
      base.position.set(gx(p.x), 0, gz(p.y));
      scene.add(base);
      if ((p.tx + p.ty) % 2 === 0) {
        const top = spawnProp('crateSmall');
        top.scale.setScalar(crateScale);
        top.rotation.y = seedAngle + Math.PI / 3;
        top.position.set(gx(p.x), 0.37 * crateScale, gz(p.y));
        scene.add(top);
      }
    }

    // tracer group
    this.tracerGroup = new THREE.Group();
    scene.add(this.tracerGroup);

    this.scene = scene;

    // characters
    let ti = 0, si = 0, hi = 0, ci = 0;
    for (const t of mission.teammates) this._createInstance(t, 'teammate', ti++);
    for (const s of mission.suspects) this._createInstance(s, 'suspect', si++);
    for (const h of mission.hostages) this._createInstance(h, 'hostage', hi++);
    for (const c of mission.civilians) this._createInstance(c, 'civilian', ci++);

    this._setViewmodelWeapon(mission.player.currentWeaponId);
  }

  _createInstance(entity, kind, seed) {
    let role = kind;
    let weaponId = null;
    if (kind === 'suspect') {
      role = entity.elite ? 'eliteSuspect' : 'suspect';
      if (entity.armed) weaponId = entity.weaponId;
    } else if (kind === 'teammate') {
      weaponId = 'mp5';
    } else if (kind === 'hostage') {
      role = seed % 2 === 0 ? 'hostageBusiness' : 'hostageCasual';
    }
    const variant = pickVariant(role, seed);
    const instance = spawnCharacter(variant);
    if (entity.elite) instance.root.add(buildEliteMarker());
    if (weaponId) attachWeapon(instance, weaponId);
    this.scene.add(instance.root);
    this.entityInstances.set(entity.id, {
      instance, kind, lastX: entity.x, lastY: entity.y, animName: null,
    });
  }

  _animNameFor(entity, kind, moving) {
    if (!entity.alive) return { name: 'die', loopOnce: true };
    if (kind === 'suspect') {
      switch (entity.state) {
        case 'alert': return { name: 'idle' };
        case 'hostile': return { name: entity.target ? 'shoot' : (moving ? 'walk' : 'idle') };
        case 'surrendering': return { name: 'react' };
        case 'arrested': return { name: 'kneel' };
        case 'fleeing': return { name: 'sprint' };
        default: return { name: moving ? 'walk' : 'idle' };
      }
    }
    if (kind === 'teammate') {
      return { name: entity.engaging ? 'shoot' : (moving ? 'walk' : 'idle') };
    }
    if (kind === 'hostage') {
      if (entity.state === 'held') return { name: 'kneel' };
      return { name: moving ? 'sprint' : 'idle' };
    }
    // civilian
    if (entity.state === 'panic') return { name: 'sprint' };
    return { name: moving ? 'walk' : 'idle' };
  }

  _updateInstance(entity, dt) {
    const rec = this.entityInstances.get(entity.id);
    if (!rec) return;
    const { instance } = rec;
    const moved = Math.hypot(entity.x - rec.lastX, entity.y - rec.lastY);
    const moving = moved > 0.15;
    rec.lastX = entity.x; rec.lastY = entity.y;

    const visible = entity.alive || rec.animName === 'die';
    instance.root.visible = true; // keep visible through the die animation, then hide below
    if (!entity.alive && rec.diedAt === undefined) rec.diedAt = this._clock;
    if (!entity.alive && this._clock - rec.diedAt > 2.5) instance.root.visible = false;

    instance.root.position.set(gx(entity.x), 0, gz(entity.y));
    instance.root.rotation.y = yawFromFacing(entity.facing);

    const anim = this._animNameFor(entity, rec.kind, moving);
    instance.play(anim.name, { loopOnce: !!anim.loopOnce });
    rec.animName = anim.name;
    instance.update(dt);
  }

  update(mission, dt, marker) {
    this._clock += dt;

    for (const t of mission.teammates) this._updateInstance(t, dt);
    for (const s of mission.suspects) this._updateInstance(s, dt);
    for (const h of mission.hostages) this._updateInstance(h, dt);
    for (const c of mission.civilians) this._updateInstance(c, dt);

    // doors
    for (const d of this.doorMeshes) d.visible = !mission.map.openDoors.has(d.userData.key);

    // evidence spin
    for (const mesh of this.evidenceMeshes) {
      mesh.visible = !mesh.userData.evidence.collected;
      mesh.rotation.y += dt * 1.4;
      mesh.position.y = 1.1 + Math.sin(this._clock * 2) * 0.08;
    }

    // move-to marker
    if (marker) {
      this.markerRing.visible = true;
      this.markerRing.position.set(gx(marker.x), 0.05, gz(marker.y));
    } else {
      this.markerRing.visible = false;
    }

    // tracers
    this.tracerGroup.clear();
    for (const t of mission.tracers) {
      const points = [
        new THREE.Vector3(gx(t.x0), EYE_HEIGHT - 0.15, gz(t.y0)),
        new THREE.Vector3(gx(t.x1), EYE_HEIGHT - 0.15, gz(t.y1)),
      ];
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({ color: 0xffe791, transparent: true, opacity: 1 - t.age / 0.08 });
      this.tracerGroup.add(new THREE.Line(geo, mat));
    }

    // camera
    const p = mission.player;
    this.camera.position.set(gx(p.x), EYE_HEIGHT, gz(p.y));
    this.camera.rotation.y = yawFromFacing(p.facing);
    this.camera.rotation.x = p.pitch;

    this._setViewmodelWeapon(p.currentWeaponId);

    // viewmodel recoil + fov kick
    this.viewmodel.position.z = p.recoil * 0.12;
    this.viewmodel.rotation.x = -p.recoil * 0.25;
    const targetFov = 78 + p.recoil * 4;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = targetFov;
      this.camera.updateProjectionMatrix();
    }

    this.headlamp.intensity = 1.3;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
