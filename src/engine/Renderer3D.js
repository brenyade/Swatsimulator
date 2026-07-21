import * as THREE from '../vendor/three.module.js';
import {
  spawnCharacter, spawnWeapon, spawnProp, spawnDoorModel, equipCharacterRole, ROLE_VARIANTS,
} from './ModelLibrary.js';
import { spawnEnvironmentProp } from './EnvironmentKit.js';

// One world unit == half a tile (32px). Keeps corridors ~2 units wide and
// rooms human-scaled instead of cavernous.
const SCALE = 1 / 16;
const TILE_W = 32 * SCALE; // 2
const WALL_H = 3.0;
export const EYE_HEIGHT = 1.6;
const MAX_PIXEL_RATIO = 1.5;
const RESIZE_POLL_FRAMES = 60;
const MAX_PRACTICAL_LIGHTS = 3;
const MAX_TRACERS = 64;
const MAX_BLOOD_DECALS = 96;
const MAX_BLOOD_BURSTS = 48;

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
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = c1;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  let seed = [...`${c1}${c2}`].reduce((n, ch) => (n * 33 + ch.charCodeAt(0)) >>> 0, 2166136261);
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  ctx.fillStyle = c2;
  ctx.globalAlpha = 0.22;
  for (let i = 0; i < 420; i++) {
    const size = 1 + Math.floor(random() * 3);
    ctx.fillRect(Math.floor(random() * 64), Math.floor(random() * 64), size, size);
  }
  ctx.globalAlpha = 0.16;
  ctx.fillRect(0, 31, 64, 2);
  ctx.fillRect(31, 0, 2, 64);
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.repeat.set(repeatX, repeatY);
  return tex;
}

const SURFACE_STYLES = {
  grass: { a: '#304d2c', b: '#3b6135', roughness: 1.0 },
  walkway: { a: '#8a8a84', b: '#787770', roughness: 0.95 },
  porch: { a: '#8b765e', b: '#7a674f', roughness: 0.92 },
  driveway: { a: '#565a60', b: '#494d52', roughness: 0.97 },
  hardwood: { a: '#6d4d32', b: '#7b583b', roughness: 0.9 },
  tile: { a: '#bdb8ae', b: '#a7a298', roughness: 0.84 },
  carpet: { a: '#5a6973', b: '#4e5c66', roughness: 1.0 },
  concrete: { a: '#6e7376', b: '#5e6367', roughness: 0.96 },
  asphalt: { a: '#353b40', b: '#2b3035', roughness: 1.0 },
  metal: { a: '#5d666c', b: '#495158', roughness: 0.62, metalness: 0.45 },
  linoleum: { a: '#85908b', b: '#737e79', roughness: 0.82 },
};

function buildSurfaceIndex(def) {
  const index = new Map();
  for (const zone of def.surfaces || []) {
    for (let y = zone.y0; y <= zone.y1; y++) {
      for (let x = zone.x0; x <= zone.x1; x++) index.set(`${x},${y}`, zone.type);
    }
  }
  return index;
}

function buildOutdoorTiles(mission) {
  const tiles = new Set();
  // Surface zones are applied in order so an indoor room can override a broad
  // exterior yard/dock zone. Missions without explicit outdoor zones are
  // correctly treated as interiors instead of turning their connected floor
  // into grass and removing the ceiling.
  for (const zone of mission.def.surfaces || []) {
    if (zone.outdoor === undefined) continue;
    for (let y = zone.y0; y <= zone.y1; y++) {
      for (let x = zone.x0; x <= zone.x1; x++) {
        const key = `${x},${y}`;
        if (zone.outdoor) tiles.add(key);
        else tiles.delete(key);
      }
    }
  }
  return tiles;
}

function resolveSurfaceType(tx, ty, mission, surfaceIndex, outdoorTiles) {
  const explicit = surfaceIndex.get(`${tx},${ty}`);
  if (explicit) return explicit;
  const cell = mission.map.grid[ty][tx];
  if (cell === 'D') {
    const neighbors = [
      [tx + 1, ty], [tx - 1, ty], [tx, ty + 1], [tx, ty - 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || ny < 0 || nx >= mission.map.width || ny >= mission.map.height) continue;
      if (mission.map.grid[ny][nx] === '#') continue;
      const nKey = `${nx},${ny}`;
      const nStyle = surfaceIndex.get(nKey);
      if (nStyle) return nStyle;
      if (outdoorTiles.has(nKey)) return 'porch';
    }
  }
  return outdoorTiles.has(`${tx},${ty}`) ? 'grass' : 'hardwood';
}

function pickVariant(role, seed) {
  const list = ROLE_VARIANTS[role];
  return list[seed % list.length];
}

function attachWeapon(instance, weaponId) {
  const holder = new THREE.Group();
  const weapon = spawnWeapon(weaponId);
  holder.add(weapon);
  holder.position.set(WEAPON_GRIP.x, WEAPON_GRIP.y, WEAPON_GRIP.z);
  holder.rotation.set(WEAPON_GRIP_ROT.x, WEAPON_GRIP_ROT.y, WEAPON_GRIP_ROT.z);
  holder.scale.setScalar(1.1);
  instance.torso.add(holder);
  return holder;
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
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

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
    this.tracerMesh = null;
    this.tracerPositionAttribute = null;
    this.bloodPoolMesh = null;
    this.bloodBurstGroup = null;
    this.bloodParticleGeo = null;
    this._bloodPoolRendered = 0;
    this.markerRing = null;
    this._disposables = [];
    this._clock = 0;
    this._resizePollFrame = 0;
    this._scratchMatrix = new THREE.Matrix4();
    this._scratchQuaternion = new THREE.Quaternion();
    this._scratchScale = new THREE.Vector3();
  }

  resizeToDisplaySize(force = false) {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    const targetWidth = Math.round(rect.width * dpr);
    const targetHeight = Math.round(rect.height * dpr);
    if (!force && this.canvas.width === targetWidth && this.canvas.height === targetHeight) return false;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(rect.width, rect.height, false);
    this.camera.aspect = rect.width / rect.height;
    this.camera.updateProjectionMatrix();
    return true;
  }

  _setViewmodelWeapon(weaponId) {
    if (this.viewmodelWeaponId === weaponId) return;
    if (this.viewmodelMesh) {
      this.viewmodelMesh.traverse((child) => {
        if (!child.isMesh) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => material.dispose());
      });
      this.viewmodel.remove(this.viewmodelMesh);
    }
    const holder = new THREE.Group();
    const weapon = spawnWeapon(weaponId);
    weapon.traverse((child) => {
      if (!child.isMesh) return;
      const prepare = (source) => {
        const material = source.clone();
        if (material.emissive) {
          material.emissive.setHex(0x20282d);
          material.emissiveIntensity = 0.42;
        }
        return material;
      };
      child.material = Array.isArray(child.material)
        ? child.material.map(prepare)
        : prepare(child.material);
      child.renderOrder = 2;
    });
    holder.add(weapon);
    if (weaponId === 'm9') {
      // Pistols are small enough to sit closer to the camera and lower in frame.
      holder.position.set(0.30, -0.30, -0.62);
      holder.rotation.y = Math.PI / 2;
      holder.scale.setScalar(0.7);
    } else {
      // Keep the stock in front of the near plane. The previous position put
      // the camera inside long guns, making them look like giant black blocks.
      holder.position.set(0.38, -0.40, -1.20);
      holder.rotation.y = Math.PI / 2;
      holder.scale.setScalar(0.43);
    }
    this.viewmodel.add(holder);
    this.viewmodelMesh = holder;
    this.viewmodelWeaponId = weaponId;
  }

  disposeScene() {
    for (const d of this._disposables) d();
    this._disposables = [];
    this.entityInstances.clear();
    this.doorMeshes = [];
    this.evidenceMeshes = [];
    this.tracerMesh = null;
    this.tracerPositionAttribute = null;
    this.bloodPoolMesh = null;
    this.bloodBurstGroup = null;
    this.bloodParticleGeo = null;
    this._bloodPoolRendered = 0;
  }

  buildScene(mission) {
    this.disposeScene();
    const environment = mission.def.environment || {};
    const scene = new THREE.Scene();
    const skyColor = environment.sky ?? 0x51616f;
    scene.background = new THREE.Color(skyColor);
    scene.fog = new THREE.FogExp2(environment.fog ?? skyColor, environment.fogDensity ?? 0.02);
    scene.add(this.camera);

    scene.add(new THREE.HemisphereLight(
      environment.hemiSky ?? 0xb3c7d8,
      environment.hemiGround ?? 0x30402c,
      environment.hemiIntensity ?? 1.85,
    ));
    const sun = new THREE.DirectionalLight(environment.sun ?? 0xffffff, environment.sunIntensity ?? 0.72);
    sun.position.set(6, 10, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(512, 512);
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.035;
    sun.shadow.camera.left = -30;
    sun.shadow.camera.right = 30;
    sun.shadow.camera.top = 30;
    sun.shadow.camera.bottom = -30;
    scene.add(sun);

    const { map } = mission;
    const w = map.width * TILE_W, h = map.height * TILE_W;
    const surfaceIndex = buildSurfaceIndex(mission.def);
    const outdoorTiles = buildOutdoorTiles(mission);
    const propTileKeys = new Set();
    for (const p of mission.propPoints) {
      for (let ty = p.y0; ty <= p.y1; ty++) {
        for (let tx = p.x0; tx <= p.x1; tx++) propTileKeys.add(`${tx},${ty}`);
      }
    }

    // Tile-based floors let the quick-play house render believable outdoor and
    // indoor materials instead of one giant flat slab.
    const floorGeo = new THREE.PlaneGeometry(TILE_W, TILE_W);
    const floorTilesByStyle = new Map();
    const ceilingTiles = [];
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        const cell = map.grid[ty][tx];
        const key = `${tx},${ty}`;
        // Blocking furniture uses # in the navigation grid. It still needs a
        // floor below and, when indoors, a ceiling above its footprint.
        if (cell === '#' && !propTileKeys.has(key)) continue;
        const style = resolveSurfaceType(tx, ty, mission, surfaceIndex, outdoorTiles);
        if (!floorTilesByStyle.has(style)) floorTilesByStyle.set(style, []);
        floorTilesByStyle.get(style).push([tx, ty]);
        const isOutdoor = outdoorTiles.has(key);
        if (!isOutdoor) ceilingTiles.push([tx, ty]);
      }
    }
    const tileMatrix = new THREE.Matrix4();
    for (const [style, tiles] of floorTilesByStyle.entries()) {
      const cfg = SURFACE_STYLES[style] || SURFACE_STYLES.hardwood;
      const tex = makeCheckerTexture(cfg.a, cfg.b, 2, 2);
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: cfg.roughness, metalness: cfg.metalness || 0 });
      const mesh = new THREE.InstancedMesh(floorGeo, mat, Math.max(1, tiles.length));
      tiles.forEach(([tx, ty], i) => {
        tileMatrix.makeRotationX(-Math.PI / 2);
        tileMatrix.setPosition(gx(tx * 32 + 16), 0.001, gz(ty * 32 + 16));
        mesh.setMatrixAt(i, tileMatrix);
      });
      mesh.count = tiles.length;
      mesh.receiveShadow = true;
      scene.add(mesh);
      this._disposables.push(() => { mat.dispose(); tex.dispose(); });
    }
    this._disposables.push(() => floorGeo.dispose());

    const ceilGeo = new THREE.PlaneGeometry(TILE_W, TILE_W);
    const ceilingBase = new THREE.Color(environment.ceiling ?? 0x555b56);
    const ceilingAlt = ceilingBase.clone().multiplyScalar(0.84);
    const ceilTex = makeCheckerTexture(
      `#${ceilingBase.getHexString()}`,
      `#${ceilingAlt.getHexString()}`,
      2,
      2,
    );
    const ceilMat = new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 1 });
    const ceilingMesh = new THREE.InstancedMesh(ceilGeo, ceilMat, Math.max(1, ceilingTiles.length));
    ceilingTiles.forEach(([tx, ty], i) => {
      tileMatrix.makeRotationX(Math.PI / 2);
      tileMatrix.setPosition(gx(tx * 32 + 16), WALL_H, gz(ty * 32 + 16));
      ceilingMesh.setMatrixAt(i, tileMatrix);
    });
    ceilingMesh.count = ceilingTiles.length;
    scene.add(ceilingMesh);
    this._disposables.push(() => { ceilGeo.dispose(); ceilMat.dispose(); ceilTex.dispose(); });

    // Recessed practical fixtures make interiors read as occupied buildings
    // instead of uniformly lit test rooms. A small subset also casts local
    // light, while the emissive instanced panels provide the visible source.
    const fixtureTiles = ceilingTiles.filter(([tx, ty]) => tx % 4 === 2 && ty % 4 === 2);
    const fixtureGeo = new THREE.BoxGeometry(0.82, 0.035, 0.24);
    const fixtureMat = new THREE.MeshStandardMaterial({
      color: 0xf1ead8, emissive: 0xffe7b8, emissiveIntensity: 2.1, roughness: 0.42,
    });
    const fixtureMesh = new THREE.InstancedMesh(fixtureGeo, fixtureMat, Math.max(1, fixtureTiles.length));
    fixtureTiles.forEach(([tx, ty], i) => {
      tileMatrix.makeTranslation(gx(tx * 32 + 16), WALL_H - 0.045, gz(ty * 32 + 16));
      fixtureMesh.setMatrixAt(i, tileMatrix);
    });
    fixtureMesh.count = fixtureTiles.length;
    scene.add(fixtureMesh);
    // Point lights are among the most expensive inputs to every PBR shader.
    // Keep all visible emissive panels, but use only a few evenly distributed
    // real lights plus the player's headlamp and broad hemisphere lighting.
    const practicalCount = Math.min(MAX_PRACTICAL_LIGHTS, fixtureTiles.length);
    for (let i = 0; i < practicalCount; i++) {
      const [tx, ty] = fixtureTiles[Math.floor(i * fixtureTiles.length / practicalCount)];
      const practical = new THREE.PointLight(0xffe2b2, 0.48, 7.5, 2);
      practical.position.set(gx(tx * 32 + 16), WALL_H - 0.18, gz(ty * 32 + 16));
      scene.add(practical);
    }
    this._disposables.push(() => { fixtureGeo.dispose(); fixtureMat.dispose(); });

    // walls — single instanced mesh for every solid tile that isn't a decorative prop
    const wallTiles = [];
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        if (map.grid[ty][tx] === '#' && !propTileKeys.has(`${tx},${ty}`)) wallTiles.push([tx, ty]);
      }
    }
    const wallGeo = new THREE.BoxGeometry(TILE_W, WALL_H, TILE_W);
    const wallBase = new THREE.Color(environment.wall ?? 0x2a322b);
    const wallAlt = wallBase.clone().multiplyScalar(0.82);
    const wallTex = makeCheckerTexture(`#${wallBase.getHexString()}`, `#${wallAlt.getHexString()}`, 1, 1);
    const wallMat = new THREE.MeshStandardMaterial({
      map: wallTex,
      color: 0xffffff,
      roughness: environment.wallRoughness ?? 0.95,
      metalness: environment.wallMetalness ?? 0,
    });
    const wallMesh = new THREE.InstancedMesh(wallGeo, wallMat, Math.max(1, wallTiles.length));
    const m4 = new THREE.Matrix4();
    wallTiles.forEach(([tx, ty], i) => {
      m4.makeTranslation(gx(tx * 32 + 16), WALL_H / 2, gz(ty * 32 + 16));
      wallMesh.setMatrixAt(i, m4);
    });
    wallMesh.count = wallTiles.length;
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    scene.add(wallMesh);

    const wallTrimGeo = new THREE.BoxGeometry(TILE_W + 0.025, 0.12, TILE_W + 0.025);
    const wallTrimMat = new THREE.MeshStandardMaterial({ color: 0x171c19, roughness: 0.84 });
    const wallTrim = new THREE.InstancedMesh(wallTrimGeo, wallTrimMat, Math.max(1, wallTiles.length));
    wallTiles.forEach(([tx, ty], i) => {
      m4.makeTranslation(gx(tx * 32 + 16), 0.06, gz(ty * 32 + 16));
      wallTrim.setMatrixAt(i, m4);
    });
    wallTrim.count = wallTiles.length;
    wallTrim.receiveShadow = true;
    scene.add(wallTrim);

    // Exterior-facing glazing breaks up monolithic wall runs and gives the
    // approach readable facade landmarks without changing collision geometry.
    const windowX = [];
    const windowZ = [];
    for (const [tx, ty] of wallTiles) {
      if ((tx * 11 + ty * 7) % 3 !== 0) continue;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = tx + dx, ny = ty + dy;
        if (map.grid[ny]?.[nx] === '#' || !outdoorTiles.has(`${nx},${ny}`)) continue;
        const record = {
          x: gx(tx * 32 + 16) + dx * (TILE_W / 2 + 0.026),
          z: gz(ty * 32 + 16) + dy * (TILE_W / 2 + 0.026),
        };
        (dx ? windowX : windowZ).push(record);
        break;
      }
    }
    const windowMat = new THREE.MeshStandardMaterial({
      color: 0x547080, emissive: 0x15242c, emissiveIntensity: 0.45,
      metalness: 0.36, roughness: 0.16,
    });
    const windowXGeo = new THREE.BoxGeometry(0.045, 1.05, 1.18);
    const windowZGeo = new THREE.BoxGeometry(1.18, 1.05, 0.045);
    const windowXMesh = new THREE.InstancedMesh(windowXGeo, windowMat, Math.max(1, windowX.length));
    windowX.forEach((entry, i) => {
      m4.makeTranslation(entry.x, 1.72, entry.z);
      windowXMesh.setMatrixAt(i, m4);
    });
    windowXMesh.count = windowX.length;
    scene.add(windowXMesh);
    const windowZMesh = new THREE.InstancedMesh(windowZGeo, windowMat, Math.max(1, windowZ.length));
    windowZ.forEach((entry, i) => {
      m4.makeTranslation(entry.x, 1.72, entry.z);
      windowZMesh.setMatrixAt(i, m4);
    });
    windowZMesh.count = windowZ.length;
    scene.add(windowZMesh);

    // Proper casings and mullions keep facade glazing from reading as a flat
    // blue decal. Instancing preserves the cheap draw cost across large maps.
    const windowFrameMat = new THREE.MeshStandardMaterial({
      color: environment.windowFrame ?? 0xc9c5b8,
      metalness: 0.08,
      roughness: 0.66,
    });
    const frameSpecs = [
      { records: windowX, vertical: new THREE.BoxGeometry(0.075, 1.17, 0.055), horizontal: new THREE.BoxGeometry(0.075, 0.055, 1.29), axis: 'x' },
      { records: windowZ, vertical: new THREE.BoxGeometry(0.055, 1.17, 0.075), horizontal: new THREE.BoxGeometry(1.29, 0.055, 0.075), axis: 'z' },
    ];
    for (const spec of frameSpecs) {
      const verticals = new THREE.InstancedMesh(spec.vertical, windowFrameMat, Math.max(1, spec.records.length * 3));
      const horizontals = new THREE.InstancedMesh(spec.horizontal, windowFrameMat, Math.max(1, spec.records.length * 3));
      let vi = 0, hi = 0;
      for (const entry of spec.records) {
        for (const offset of [-0.59, 0, 0.59]) {
          m4.makeTranslation(
            entry.x + (spec.axis === 'z' ? offset : 0),
            1.72,
            entry.z + (spec.axis === 'x' ? offset : 0),
          );
          verticals.setMatrixAt(vi++, m4);
        }
        for (const offset of [-0.525, 0, 0.525]) {
          m4.makeTranslation(entry.x, 1.72 + offset, entry.z);
          horizontals.setMatrixAt(hi++, m4);
        }
      }
      verticals.count = vi;
      horizontals.count = hi;
      scene.add(verticals, horizontals);
    }
    this._disposables.push(() => {
      wallGeo.dispose(); wallMat.dispose(); wallTex.dispose(); wallTrimGeo.dispose(); wallTrimMat.dispose();
      windowXGeo.dispose(); windowZGeo.dispose(); windowMat.dispose(); windowFrameMat.dispose();
      frameSpecs.forEach((spec) => { spec.vertical.dispose(); spec.horizontal.dispose(); });
    });

    // Procedural wooden door with a separate animated leaf and a static frame.
    // Narrow real-world proportions are dressed with wall jambs to fit the
    // simulation's two-metre door tile without stretching the model.
    this.doorMeshes = [];
    let sideJambGeo = null;
    let headerJambGeo = null;
    for (const d of mission.doorTiles) {
      const group = new THREE.Group();
      group.position.set(gx(d.wx), 0, gz(d.wy));
      group.rotation.y = d.axis === 'x' ? 0 : Math.PI / 2;

      const model = spawnDoorModel();
      group.add(model.root);

      const sideWidth = Math.max(0.08, (TILE_W - model.width) / 2);
      const headerHeight = Math.max(0.08, WALL_H - model.height);
      if (!sideJambGeo) sideJambGeo = new THREE.BoxGeometry(sideWidth, WALL_H, TILE_W);
      if (!headerJambGeo) headerJambGeo = new THREE.BoxGeometry(model.width, headerHeight, TILE_W);
      for (const side of [-1, 1]) {
        const jamb = new THREE.Mesh(sideJambGeo, wallMat);
        jamb.position.set(side * (model.width / 2 + sideWidth / 2), WALL_H / 2, 0);
        jamb.castShadow = true;
        jamb.receiveShadow = true;
        group.add(jamb);
      }
      const header = new THREE.Mesh(headerJambGeo, wallMat);
      header.position.set(0, model.height + headerHeight / 2, 0);
      header.castShadow = true;
      header.receiveShadow = true;
      group.add(header);

      scene.add(group);
      this.doorMeshes.push({
        root: group,
        hinge: model.hinge,
        key: `${d.tx},${d.ty}`,
        openAmount: 0,
        swingDirection: (d.tx + d.ty) % 2 === 0 ? -1 : 1,
      });
    }
    this._disposables.push(() => {
      sideJambGeo?.dispose();
      headerJambGeo?.dispose();
    });

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

    // Semantic furniture and cover replace the old full-height wall blocks.
    // Crate assets remain for warehouse/dock stacks; other types use the
    // cached architectural kit so each room reads by function at a glance.
    for (const p of mission.propPoints) {
      if (p.type === 'crate') {
        const seedAngle = ((p.x0 * 7 + p.y0 * 13) % 4) * (Math.PI / 2);
        const crateScale = 1.7;
        const base = spawnProp('crateMedium');
        base.scale.setScalar(crateScale);
        base.rotation.y = seedAngle;
        base.position.set(gx(p.x), 0, gz(p.y));
        scene.add(base);
        if ((p.x0 + p.y0) % 2 === 0) {
          const top = spawnProp('crateSmall');
          top.scale.setScalar(crateScale);
          top.rotation.y = seedAngle + Math.PI / 3;
          top.position.set(gx(p.x), 0.37 * crateScale, gz(p.y));
          scene.add(top);
        }
      } else {
        let width = (p.x1 - p.x0 + 1) * TILE_W * 0.82;
        let depth = (p.y1 - p.y0 + 1) * TILE_W * 0.82;
        let autoRotation = 0;
        if (depth > width) {
          [width, depth] = [depth, width];
          autoRotation = Math.PI / 2;
        }
        const prop = spawnEnvironmentProp(p.type, width, depth);
        prop.position.set(gx(p.x), 0, gz(p.y));
        prop.rotation.y = autoRotation + (p.rotation || 0);
        scene.add(prop);
      }
    }

    // tracer group
    this.tracerGroup = new THREE.Group();
    scene.add(this.tracerGroup);

    // Persistent blood pools — one shared instanced mesh, grown incrementally
    // as suspects/teammates die instead of rebuilt every frame.
    const poolGeo = new THREE.CircleGeometry(0.32, 10);
    const poolMat = new THREE.MeshBasicMaterial({
      color: 0x5c0f10, transparent: true, opacity: 0.92, depthWrite: false,
    });
    this.bloodPoolMesh = new THREE.InstancedMesh(poolGeo, poolMat, MAX_BLOOD_DECALS);
    this.bloodPoolMesh.count = 0;
    scene.add(this.bloodPoolMesh);
    this._bloodPoolRendered = 0;
    this._disposables.push(() => { poolGeo.dispose(); poolMat.dispose(); });

    // Short-lived blood impact bursts, rebuilt each frame like tracers.
    this.bloodBurstGroup = new THREE.Group();
    scene.add(this.bloodBurstGroup);
    this.bloodParticleGeo = new THREE.SphereGeometry(0.045, 5, 4);
    this._disposables.push(() => { this.bloodParticleGeo.dispose(); });

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
    equipCharacterRole(instance.root, role);
    if (entity.elite) instance.root.add(buildEliteMarker());
    if (weaponId) attachWeapon(instance, weaponId);
    this.scene.add(instance.root);
    this.entityInstances.set(entity.id, {
      instance, kind, lastX: entity.x, lastY: entity.y, animName: null,
    });
  }

  _animNameFor(entity, kind, moving) {
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

  // Corpses persist on the ground for the rest of the mission. The death
  // clip plays once and then the mixer is frozen — a static skinned mesh
  // has zero animation cost and can never drift into a degenerate pose from
  // hours of accumulated mixer time, which is the usual cause of skinned
  // meshes rendering as a collapsed black tangle after they've been "dead"
  // a while.
  _updateDeadInstance(entity, dt) {
    const rec = this.entityInstances.get(entity.id);
    if (!rec) return;
    const { instance } = rec;
    if (rec.animName !== 'die') {
      instance.play('die', { loopOnce: true });
      rec.animName = 'die';
      rec.diedAt = this._clock;
      instance.root.position.set(gx(entity.x), 0, gz(entity.y));
      instance.root.rotation.y = yawFromFacing(entity.facing);
    }
    instance.root.visible = true;
    if (this._clock - rec.diedAt < 1.5) instance.update(dt);
  }

  _updateInstance(entity, dt) {
    if (!entity.alive) { this._updateDeadInstance(entity, dt); return; }
    const rec = this.entityInstances.get(entity.id);
    if (!rec) return;
    const { instance } = rec;
    const moved = Math.hypot(entity.x - rec.lastX, entity.y - rec.lastY);
    const moving = moved > 0.15;
    rec.lastX = entity.x; rec.lastY = entity.y;

    instance.root.visible = true;
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

    // Doors stay visible and swing on the asset's leaf hinge. Breaches open
    // more violently than normal interaction or AI traversal.
    for (const door of this.doorMeshes) {
      const isOpen = mission.map.openDoors.has(door.key) || mission.map.openingDoors?.has(door.key);
      const mode = mission.map.doorModes?.get(door.key);
      const speed = mode === 'breach' ? 5.5 : 2.6;
      door.openAmount = Math.min(1, Math.max(0, door.openAmount + (isOpen ? 1 : -1) * dt * speed));
      const eased = 1 - Math.pow(1 - door.openAmount, 3);
      door.hinge.rotation.y = door.swingDirection * eased * Math.PI * 0.5;
    }

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
    for (const child of this.tracerGroup.children) {
      child.geometry?.dispose();
      child.material?.dispose();
    }
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

    // blood pools — append any pools added since last frame; the buffer is
    // never rewritten in full, only grown, so this stays cheap even with
    // dozens already on the ground.
    if (this.bloodPoolMesh && mission.bloodPools.length > this._bloodPoolRendered) {
      const capacity = MAX_BLOOD_DECALS;
      for (let i = this._bloodPoolRendered; i < mission.bloodPools.length; i++) {
        const pool = mission.bloodPools[i];
        const slot = i % capacity;
        const scale = 0.75 + pool.seed * 0.85;
        this._scratchMatrix.makeRotationX(-Math.PI / 2);
        this._scratchMatrix.multiply(new THREE.Matrix4().makeRotationZ(pool.seed * Math.PI * 2));
        this._scratchMatrix.scale(new THREE.Vector3(scale, scale, 1));
        this._scratchMatrix.setPosition(gx(pool.x), 0.012, gz(pool.y));
        this.bloodPoolMesh.setMatrixAt(slot, this._scratchMatrix);
      }
      this._bloodPoolRendered = mission.bloodPools.length;
      this.bloodPoolMesh.count = Math.min(capacity, mission.bloodPools.length);
      this.bloodPoolMesh.instanceMatrix.needsUpdate = true;
    }

    // blood impact bursts — small red particles that fly outward from the
    // hit point and fall away, rebuilt each frame like tracers since they
    // only live a fraction of a second.
    for (const child of this.bloodBurstGroup.children) child.material?.dispose();
    this.bloodBurstGroup.clear();
    let activeBursts = 0;
    for (const fx of mission.effects) {
      if (fx.type !== 'blood-burst' || fx.age >= fx.duration) continue;
      if (++activeBursts > MAX_BLOOD_BURSTS) break;
      const t2 = fx.age / fx.duration;
      const particleCount = 6;
      for (let i = 0; i < particleCount; i++) {
        const angle = (i / particleCount) * Math.PI * 2 + fx.x * 0.013 + fx.y * 0.007;
        const spread = t2 * 0.55;
        const mat = new THREE.MeshBasicMaterial({
          color: 0xa9161a, transparent: true, opacity: Math.max(0, 1 - t2),
        });
        const mesh = new THREE.Mesh(this.bloodParticleGeo, mat);
        mesh.scale.setScalar(1 - t2 * 0.5);
        mesh.position.set(
          gx(fx.x) + Math.cos(angle) * spread,
          EYE_HEIGHT * 0.55 - t2 * t2 * 0.7,
          gz(fx.y) + Math.sin(angle) * spread,
        );
        this.bloodBurstGroup.add(mesh);
      }
    }

    // camera
    const p = mission.player;
    const leanPixels = (p.lean || 0) * 5.2;
    const leanFacing = p.facing + Math.PI / 2;
    this.camera.position.set(
      gx(p.x + Math.cos(leanFacing) * leanPixels),
      EYE_HEIGHT - (p.crouchAmount || 0) * 0.46,
      gz(p.y + Math.sin(leanFacing) * leanPixels),
    );
    this.camera.rotation.y = yawFromFacing(p.facing);
    this.camera.rotation.x = p.pitch;
    this.camera.rotation.z = -(p.lean || 0) * 0.075;

    this._setViewmodelWeapon(p.currentWeaponId);

    // Aim-down-sights settles the weapon toward the centre while recoil and
    // sprinting still produce readable camera feedback.
    const settle = 1 - Math.exp(-dt * 14);
    this.viewmodel.position.x += ((p.isAiming ? -0.27 : 0) - this.viewmodel.position.x) * settle;
    this.viewmodel.position.y += ((p.isAiming ? 0.055 : 0) - this.viewmodel.position.y) * settle;
    this.viewmodel.position.z = (p.isAiming ? -0.06 : 0) + p.recoil * 0.12;
    this.viewmodel.rotation.x = -p.recoil * 0.25;
    const targetFov = (p.isAiming ? 64 : p.isSprinting ? 84 : 78) + p.recoil * 4;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = targetFov;
      this.camera.updateProjectionMatrix();
    }

    this.headlamp.intensity = 1.3;
  }

  render() {
    this.resizeToDisplaySize();
    this.renderer.render(this.scene, this.camera);
  }
}
