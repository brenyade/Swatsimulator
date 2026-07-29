import * as THREE from '../vendor/three.module.js';
import { EffectComposer } from '../vendor/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/postprocessing/OutputPass.js';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';
import {
  spawnCharacter, spawnWeapon, spawnProp, spawnDoorModel, equipCharacterRole, ROLE_VARIANTS,
} from './ModelLibrary.js';
import { spawnEnvironmentProp } from './EnvironmentKit.js';
import { BloodSystem } from './BloodSystem.js';
import { graphics, onGraphicsChange } from '../core/GraphicsSettings.js';

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

export const gx = (x) => x * SCALE;
export const gz = (y) => y * SCALE;
// The camera looks down its local -Z, but characters are authored facing +Z,
// so the two need yaw formulas that differ by exactly PI — using the camera
// formula for characters renders them walking backwards.
export const yawFromFacing = (facing) => -facing - Math.PI / 2;
export const charYawFromFacing = (facing) => -facing + Math.PI / 2;

// Weapons are attached to the torso rather than the (single rigid-bone, no
// wrist) arm — the arm's rotation swings wildly between animation poses, so
// a torso-relative offset gives a stable "held at the ready" look instead.
// Procedural weapons are authored barrel-along-+X; a -PI/2 yaw points the
// barrel down the character's forward (+Z local) instead of backwards.
const WEAPON_GRIP = { x: 0.62, y: 0.5, z: 0.2 };
const WEAPON_GRIP_ROT = { x: 0, y: -Math.PI / 2, z: 0 };

const TEX_SIZE = 256;
let maxAnisotropy = 1;

// High-res procedural surface textures. Every material in the world is
// generated at runtime from a base/accent color pair plus a pattern painter,
// so the whole game upgrades visually with zero downloaded image assets.
function makeCheckerTexture(c1, c2, repeatX, repeatY, pattern = 'noise') {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_SIZE; canvas.height = TEX_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = c1;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  let seed = [...`${c1}${c2}${pattern}`].reduce((n, ch) => (n * 33 + ch.charCodeAt(0)) >>> 0, 2166136261);
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  // Multi-octave value noise: broad tonal patches, medium blotches, fine grain.
  ctx.fillStyle = c2;
  for (const [count, min, max, alpha] of [[46, 22, 64, 0.07], [240, 6, 18, 0.07], [1500, 1, 3, 0.1]]) {
    ctx.globalAlpha = alpha;
    for (let i = 0; i < count; i++) {
      const size = min + random() * (max - min);
      ctx.fillRect(random() * TEX_SIZE, random() * TEX_SIZE, size, size);
    }
  }

  ctx.globalAlpha = 1;
  if (pattern === 'wood') {
    // plank rows with butt joints and grain streaks
    const plankH = 43;
    for (let y = 0; y < TEX_SIZE; y += plankH) {
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = '#181008';
      ctx.fillRect(0, y, TEX_SIZE, 2);
      const joint = random() * TEX_SIZE;
      ctx.fillRect(joint, y, 2, plankH);
      ctx.globalAlpha = 0.1;
      for (let g = 0; g < 26; g++) {
        ctx.fillStyle = random() > 0.5 ? '#000000' : '#ffe6bf';
        ctx.fillRect(random() * TEX_SIZE, y + 3 + random() * (plankH - 6), 14 + random() * 60, 1);
      }
    }
  } else if (pattern === 'tile') {
    const cell = 64;
    for (let y = 0; y < TEX_SIZE; y += cell) {
      for (let x = 0; x < TEX_SIZE; x += cell) {
        ctx.globalAlpha = random() * 0.08;
        ctx.fillStyle = c2;
        ctx.fillRect(x, y, cell, cell);
      }
    }
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#1a1d1c';
    for (let i = 0; i <= TEX_SIZE; i += cell) {
      ctx.fillRect(0, i - 1, TEX_SIZE, 2);
      ctx.fillRect(i - 1, 0, 2, TEX_SIZE);
    }
  } else if (pattern === 'grass') {
    for (let i = 0; i < 1100; i++) {
      ctx.globalAlpha = 0.16 + random() * 0.18;
      ctx.fillStyle = random() > 0.6 ? '#6f8f4a' : random() > 0.5 ? c2 : '#233a1e';
      ctx.fillRect(random() * TEX_SIZE, random() * TEX_SIZE, 1 + random() * 1.5, 3 + random() * 6);
    }
  } else if (pattern === 'concrete') {
    for (let i = 0; i < 22; i++) {
      const cx = random() * TEX_SIZE, cy = random() * TEX_SIZE, r = 18 + random() * 52;
      const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
      grad.addColorStop(0, 'rgba(0,0,0,0.09)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = grad;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 0.14;
    ctx.strokeStyle = '#101210';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      let x = random() * TEX_SIZE, y = random() * TEX_SIZE;
      ctx.moveTo(x, y);
      for (let s = 0; s < 5; s++) { x += (random() - 0.5) * 60; y += random() * 40; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  } else if (pattern === 'panel') {
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = '#101512';
    for (let y = 84; y < TEX_SIZE; y += 84) ctx.fillRect(0, y, TEX_SIZE, 2);
    ctx.globalAlpha = 0.1;
    for (let x = 128; x < TEX_SIZE; x += 128) ctx.fillRect(x, 0, 2, TEX_SIZE);
    // grime gradient pooling at the bottom of each panel course
    const grime = ctx.createLinearGradient(0, 0, 0, TEX_SIZE);
    grime.addColorStop(0, 'rgba(255,255,255,0.045)');
    grime.addColorStop(1, 'rgba(0,0,0,0.12)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = grime;
    ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  } else if (pattern === 'metal') {
    ctx.globalAlpha = 0.055;
    for (let i = 0; i < 220; i++) {
      ctx.fillStyle = random() > 0.5 ? '#ffffff' : '#000000';
      ctx.fillRect(0, random() * TEX_SIZE, TEX_SIZE, 1);
    }
  } else if (pattern === 'asphalt') {
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#8d9297';
    for (let i = 0; i < 900; i++) ctx.fillRect(random() * TEX_SIZE, random() * TEX_SIZE, 1.5, 1.5);
  }

  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = Math.min(8, maxAnisotropy);
  tex.repeat.set(repeatX, repeatY);
  return tex;
}

const SURFACE_STYLES = {
  grass: { a: '#304d2c', b: '#3b6135', roughness: 1.0, pattern: 'grass' },
  walkway: { a: '#8a8a84', b: '#787770', roughness: 0.95, pattern: 'concrete' },
  porch: { a: '#8b765e', b: '#7a674f', roughness: 0.92, pattern: 'wood' },
  driveway: { a: '#565a60', b: '#494d52', roughness: 0.97, pattern: 'concrete' },
  hardwood: { a: '#6d4d32', b: '#7b583b', roughness: 0.9, pattern: 'wood' },
  tile: { a: '#bdb8ae', b: '#a7a298', roughness: 0.84, pattern: 'tile' },
  carpet: { a: '#5a6973', b: '#4e5c66', roughness: 1.0 },
  concrete: { a: '#6e7376', b: '#5e6367', roughness: 0.96, pattern: 'concrete' },
  asphalt: { a: '#353b40', b: '#2b3035', roughness: 1.0, pattern: 'asphalt' },
  metal: { a: '#5d666c', b: '#495158', roughness: 0.62, metalness: 0.45, pattern: 'metal' },
  linoleum: { a: '#85908b', b: '#737e79', roughness: 0.82, pattern: 'tile' },
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, graphics.pixelRatioCap));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = graphics.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();

    // Live quality changes that don't need the scene rebuilt.
    onGraphicsChange((g) => {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, g.pixelRatioCap));
      this.renderer.shadowMap.enabled = g.shadows;
      if (this.bloomPass) this.bloomPass.strength = g.postFX ? g.bloomStrength : 0;
      this.blood?.setGore(g.goreLevel);
      this.resizeToDisplaySize(true);
    });

    // Image-based ambient lighting: a neutral studio environment gives every
    // PBR material believable specular response instead of flat diffuse.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(78, canvas.width / canvas.height, 0.05, 90);
    this.camera.rotation.order = 'YXZ';

    this.headlamp = new THREE.PointLight(0xffedc4, 1.3, 12, 2);
    this.camera.add(this.headlamp);

    this.viewmodel = new THREE.Group();
    this.viewmodelWeaponId = null;
    this.viewmodelMesh = null;
    this.camera.add(this.viewmodel);

    // Muzzle flash: a brief hot point light plus an additive card at the
    // muzzle, driven by player.muzzleFlash each frame.
    this.muzzleLight = new THREE.PointLight(0xffc66b, 0, 5, 2);
    this.muzzleLight.position.set(0.35, -0.3, -1.1);
    this.camera.add(this.muzzleLight);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffd9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthTest: false,
    });
    this.muzzleFlashMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), flashMat);
    this.muzzleFlashMesh.position.set(0.36, -0.31, -1.35);
    this.muzzleFlashMesh.renderOrder = 3;
    this.muzzleFlashMesh.visible = false;
    this.camera.add(this.muzzleFlashMesh);

    this.composer = null;
    this.renderPass = null;
    this.bloomPass = null;

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
    this.composer?.setSize(rect.width, rect.height);
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
    // A PI/2 yaw alone points the barrel straight down -Z, which presents the
    // weapon dead-on and reads as a flat slab. Adding a little extra yaw
    // (muzzle toward screen centre, converging on the crosshair) plus a touch
    // of pitch gives the standard three-quarter FPS presentation, and backing
    // the model off stops the near plane from cropping it into a black wall.
    if (weaponId === 'm9') {
      holder.position.set(0.22, -0.26, -0.80);
      holder.rotation.set(0.06, Math.PI / 2 + 0.22, 0.04);
      holder.scale.setScalar(0.55);
    } else {
      holder.position.set(0.30, -0.32, -1.05);
      holder.rotation.set(0.04, Math.PI / 2 + 0.16, 0.03);
      holder.scale.setScalar(0.40);
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
    this.blood = null;
    this.skyDome = null;
  }

  buildScene(mission) {
    this.disposeScene();
    const environment = mission.def.environment || {};
    const scene = new THREE.Scene();
    const skyColor = new THREE.Color(environment.sky ?? 0x51616f);
    scene.fog = new THREE.FogExp2(environment.fog ?? skyColor.getHex(), environment.fogDensity ?? 0.02);
    scene.environment = this.envTexture;
    scene.add(this.camera);

    // Gradient sky dome — a real geometry dome (bright horizon, deep zenith)
    // that rotates correctly with the camera, replacing the old flat
    // background color.
    const SKY_RADIUS = 70;
    const skyGeo = new THREE.SphereGeometry(SKY_RADIUS, 24, 14);
    const horizon = skyColor.clone().multiplyScalar(1.28);
    const zenith = skyColor.clone().multiplyScalar(0.5);
    const skyColors = [];
    const pos = skyGeo.attributes.position;
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      // Bright band at the horizon (y == 0) easing up into the deeper zenith.
      // Mapping the bright end to the bottom pole instead washed the whole
      // visible sky to the dark zenith colour.
      const up = Math.max(0, pos.getY(i) / SKY_RADIUS);
      tmp.copy(horizon).lerp(zenith, Math.pow(up, 0.55));
      skyColors.push(tmp.r, tmp.g, tmp.b);
    }
    skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(skyColors, 3));
    const skyMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
    const skyDome = new THREE.Mesh(skyGeo, skyMat);
    skyDome.renderOrder = -1;
    skyDome.frustumCulled = false;
    scene.add(skyDome);
    // The dome has to ride with the camera. Pinned at the world origin it sits
    // only ~13 units off the far side of a 68x48 map, so its dark upper shell
    // hangs over the level as a huge black dome instead of reading as sky.
    this.skyDome = skyDome;
    this._disposables.push(() => { skyGeo.dispose(); skyMat.dispose(); });

    scene.add(new THREE.HemisphereLight(
      environment.hemiSky ?? 0xb3c7d8,
      environment.hemiGround ?? 0x30402c,
      environment.hemiIntensity ?? 1.55,
    ));
    const sun = new THREE.DirectionalLight(environment.sun ?? 0xffffff, environment.sunIntensity ?? 0.85);
    sun.position.set(6, 10, 4);
    sun.castShadow = graphics.shadows;
    sun.shadow.mapSize.set(graphics.shadowMapSize, graphics.shadowMapSize);
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
      const tex = makeCheckerTexture(cfg.a, cfg.b, 1, 1, cfg.pattern);
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
      1,
      1,
      'panel',
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
    const practicalCount = Math.min(graphics.practicalLights, fixtureTiles.length);
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
    const wallTex = makeCheckerTexture(`#${wallBase.getHexString()}`, `#${wallAlt.getHexString()}`, 1, 1, 'panel');
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

    // Gore: droplets are simulated with gravity and leave oriented decals
    // wherever they land, so walls and floors accumulate real splatter and
    // corpses bleed out into pools that keep spreading.
    const bloodMap = mission.map;
    const solidAt = (wx, wz) => {
      const tx = Math.floor(wx / (SCALE * 32));
      const ty = Math.floor(wz / (SCALE * 32));
      if (tx < 0 || ty < 0 || tx >= bloodMap.width || ty >= bloodMap.height) return true;
      return bloodMap.grid[ty][tx] === '#';
    };
    this.blood = new BloodSystem(
      scene,
      { particleBudget: graphics.particleBudget, goreLevel: graphics.goreLevel },
      solidAt,
    );
    this._disposables.push(() => { this.blood?.dispose(); this.blood = null; });

    this.scene = scene;

    // characters
    let ti = 0, si = 0, hi = 0, ci = 0;
    for (const t of mission.teammates) this._createInstance(t, 'teammate', ti++);
    for (const s of mission.suspects) this._createInstance(s, 'suspect', si++);
    for (const h of mission.hostages) this._createInstance(h, 'hostage', hi++);
    for (const c of mission.civilians) this._createInstance(c, 'civilian', ci++);

    this._setViewmodelWeapon(mission.player.currentWeaponId);
    this._buildComposer(scene);
  }

  // Post-processing chain: multisampled scene render -> subtle bloom (bright
  // fixtures, muzzle flash, emissive glass pick up a soft glow) -> tone
  // mapping/color-space output.
  _buildComposer(scene) {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: 4,
    });
    this.composer?.dispose();
    this.composer = new EffectComposer(this.renderer, target);
    this.renderPass = new RenderPass(scene, this.camera);
    this.bloomPass = new UnrealBloomPass(size.clone(), graphics.postFX ? graphics.bloomStrength * 0.45 : 0, 0.65, 0.86);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());
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
      instance.root.rotation.y = charYawFromFacing(entity.facing);
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
    instance.root.rotation.y = charYawFromFacing(entity.facing);

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

    // Gore. Each hit event is emitted into the particle sim exactly once; the
    // sim then owns the droplets, the decals they leave and the pools that
    // spread under the bodies, all of which persist for the whole mission.
    if (this.blood) {
      for (const fx of mission.effects) {
        if (fx.type !== 'blood-burst' || fx._emitted) continue;
        fx._emitted = true;
        const power = fx.power ?? 1;
        const wx = gx(fx.x), wz = gz(fx.y);
        if (fx.fatal) this.blood.gib(wx, EYE_HEIGHT * 0.62, wz, fx.dirX ?? 1, fx.dirY ?? 0);
        else this.blood.burst(wx, EYE_HEIGHT * 0.68, wz, fx.dirX ?? 1, fx.dirY ?? 0, power);
        // Getting sprayed at close range paints the visor.
        const camDist = Math.hypot(this.camera.position.x - wx, this.camera.position.z - wz);
        if (camDist < 2.6) this.blood.splashScreen((fx.fatal ? 0.7 : 0.32) * (1 - camDist / 2.6));
      }
      if (!mission.player.alive || mission.player.hitFlash > 0.55) {
        this.blood.splashScreen(mission.player.hitFlash * 0.04);
      }
      this.blood.update(dt, this.camera.position);
      if (this.bloodSplatterPass) this.bloodSplatterPass(this.blood.screenSplatter);
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
    if (this.skyDome) this.skyDome.position.copy(this.camera.position);

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

    // muzzle flash — hot light + additive card for the few frames after a shot
    const flash = p.muzzleFlash || 0;
    if (flash > 0) {
      const strength = flash / 0.055;
      this.muzzleLight.intensity = 30 * strength;
      this.muzzleFlashMesh.visible = true;
      this.muzzleFlashMesh.material.opacity = 0.85 * strength;
      this.muzzleFlashMesh.rotation.z = this._clock * 53 % (Math.PI * 2);
      const s = 0.8 + strength * 0.5;
      this.muzzleFlashMesh.scale.set(s, s, s);
    } else {
      this.muzzleLight.intensity = 0;
      this.muzzleFlashMesh.visible = false;
    }
  }

  render() {
    this.resizeToDisplaySize();
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
