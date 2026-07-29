import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { clone as skeletonClone } from '../vendor/utils/SkeletonUtils.js';

const MODEL_BASE = 'src/vendor/models';

// Native character rig is ~2.7 units tall; scale so a person is ~1.6 world
// units tall to match the rest of the (1 tile == 2 units) world scale.
export const CHAR_SCALE = 0.6;

const CHARACTER_FILES = {
  a: 'characters/character-a.glb',
  b: 'characters/character-b.glb',
  c: 'characters/character-c.glb',
  e: 'characters/character-e.glb',
  f: 'characters/character-f.glb',
  i: 'characters/character-i.glb',
  j: 'characters/character-j.glb',
  k: 'characters/character-k.glb',
  m: 'characters/character-m.glb',
  p: 'characters/character-p.glb',
  q: 'characters/character-q.glb',
  r: 'characters/character-r.glb',
};

// Procedurally built wooden door — no external OBJ/MTL asset required, so
// there is nothing to source, license or fail to preload.
const DOOR_WIDTH = 1.15;
const DOOR_HEIGHT = 2.55;

const proceduralWeaponCache = new Map();
const roleEquipmentCache = new Map();

export const ROLE_VARIANTS = {
  teammate: ['j'],
  hostageBusiness: ['q'],
  hostageCasual: ['i'],
  suspect: ['b', 'k', 'r'],
  eliteSuspect: ['m'],
  civilian: ['a', 'c', 'e', 'f', 'p'],
};

const PROP_FILES = {
  crateSmall: 'props/crate-small.glb',
  crateMedium: 'props/crate-medium.glb',
  crateWide: 'props/crate-wide.glb',
  grenade: 'props/grenade-a.glb',
};

const loader = new GLTFLoader();
const rawCache = new Map(); // path -> Promise<gltf>
const resolvedCache = new Map(); // path -> gltf (populated once its promise resolves)

function loadRaw(relPath) {
  if (!rawCache.has(relPath)) {
    const url = `${MODEL_BASE}/${relPath}`;
    rawCache.set(relPath, new Promise((resolve, reject) => {
      loader.load(url, (gltf) => { resolvedCache.set(relPath, gltf); resolve(gltf); }, undefined, reject);
    }));
  }
  return rawCache.get(relPath);
}

export async function preloadAll(onProgress) {
  const all = [
    ...Object.values(CHARACTER_FILES),
    ...Object.values(PROP_FILES),
  ];
  let done = 0;
  await Promise.all(all.map((p) => loadRaw(p).then(() => { done++; onProgress?.(done, all.length); })));
}

function tintMaterial(root, tint) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    const mat = new THREE.MeshStandardMaterial({
      color: tint.color, metalness: tint.metalness, roughness: tint.roughness,
    });
    child.material = mat;
    child.castShadow = true;
    child.receiveShadow = true;
  });
}

function material(color, metalness = 0.55, roughness = 0.38) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness });
}

function addBox(group, size, position, mat, rotation = null) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2], 2, 2, 2), mat);
  mesh.position.set(position[0], position[1], position[2]);
  if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function addBarrel(group, radius, length, position, mat) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 16), mat);
  mesh.rotation.z = Math.PI / 2;
  mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = true;
  group.add(mesh);
  return mesh;
}

function addProfile(group, points, depth, mat) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], index) => (index ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.012,
    bevelThickness: 0.012,
  });
  geometry.translate(0, 0, -depth / 2);
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function buildProceduralWeapon(weaponId) {
  const root = new THREE.Group();
  // Firearms are intentionally dark, but these values keep the silhouette and
  // component breaks legible under the low-key interior lighting.
  const steel = material(0x596268, 0.82, 0.3);
  const polymer = material(0x384148, 0.22, 0.62);
  const rubber = material(0x1b2023, 0.05, 0.9);
  const tan = material(0x6c5538, 0.08, 0.7);
  const yellow = material(0xd3a927, 0.12, 0.5);
  const optic = material(0x18252b, 0.65, 0.18);

  if (weaponId === 'm4') {
    // Profile-based receiver, stock, grip and magazine give the patrol rifle a
    // continuous, bevelled silhouette. Small rail/optic details then read at
    // both first-person and character-held scales.
    addProfile(root, [
      [-0.38, -0.1], [0.4, -0.1], [0.4, 0.15], [0.23, 0.23],
      [-0.3, 0.23], [-0.38, 0.12],
    ], 0.24, steel);
    addProfile(root, [
      [-0.3, -0.09], [0.34, -0.09], [0.26, -0.27], [-0.02, -0.3],
      [-0.16, -0.17], [-0.3, -0.16],
    ], 0.22, polymer);
    addProfile(root, [
      [-1.03, -0.06], [-0.83, -0.01], [-0.6, 0.12], [-0.34, 0.11],
      [-0.4, 0.28], [-0.82, 0.29], [-1.02, 0.17],
    ], 0.2, polymer);
    addProfile(root, [
      [-0.2, -0.11], [0.03, -0.11], [-0.01, -0.52], [-0.17, -0.58],
      [-0.29, -0.2],
    ], 0.18, rubber);
    addProfile(root, [
      [0.1, -0.12], [0.34, -0.12], [0.39, -0.5], [0.27, -0.61],
      [0.11, -0.49],
    ], 0.18, steel);

    addBarrel(root, 0.05, 0.46, [-0.57, 0.14, 0], steel);
    const handguard = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.72, 10), polymer);
    handguard.rotation.z = Math.PI / 2;
    handguard.position.set(0.75, 0.1, 0);
    handguard.castShadow = true;
    handguard.receiveShadow = true;
    root.add(handguard);
    addBarrel(root, 0.036, 0.52, [1.34, 0.1, 0], steel);
    addBarrel(root, 0.058, 0.16, [1.66, 0.1, 0], steel);

    addBox(root, [1.26, 0.045, 0.27], [0.25, 0.275, 0], steel);
    for (let x = -0.31; x <= 0.9; x += 0.09) {
      addBox(root, [0.045, 0.035, 0.31], [x, 0.31, 0], steel);
    }
    addBox(root, [0.26, 0.055, 0.26], [0.02, 0.335, 0], optic);
    addBarrel(root, 0.095, 0.3, [0.02, 0.44, 0], optic);
    addBarrel(root, 0.074, 0.015, [-0.137, 0.44, 0], material(0x356474, 0.72, 0.12));
    addBox(root, [0.12, 0.22, 0.035], [0.94, 0.32, 0], steel);
    addBox(root, [0.31, 0.12, 0.018], [0.12, 0.04, -0.132], rubber);
    addBox(root, [0.22, 0.075, 0.17], [-0.44, 0.29, 0], polymer);
    addBarrel(root, 0.055, 0.28, [0.72, -0.11, 0.17], rubber);
  } else if (weaponId === 'shotgun') {
    addBox(root, [0.62, 0.25, 0.22], [0.18, 0, 0], steel);
    addBarrel(root, 0.055, 1.2, [0.96, 0.08, 0], steel);
    addBarrel(root, 0.045, 0.94, [0.82, -0.045, 0], steel);
    addBox(root, [0.42, 0.22, 0.28], [0.72, -0.03, 0], tan);
    addBox(root, [0.64, 0.22, 0.25], [-0.46, -0.02, 0], tan, [0, 0, -0.1]);
    addBox(root, [0.16, 0.46, 0.2], [0.02, -0.28, 0], rubber, [0, 0, -0.16]);
    addBox(root, [0.08, 0.06, 0.09], [0.76, 0.2, 0], optic);
  } else if (weaponId === 'taser') {
    addBox(root, [0.7, 0.34, 0.25], [0.18, 0.04, 0], yellow);
    addBox(root, [0.24, 0.58, 0.22], [-0.03, -0.32, 0], rubber, [0, 0, -0.2]);
    addBox(root, [0.22, 0.23, 0.22], [0.58, 0.06, 0], polymer);
    addBarrel(root, 0.027, 0.12, [0.73, 0.1, 0.065], steel);
    addBarrel(root, 0.027, 0.12, [0.73, 0.1, -0.065], steel);
    addBox(root, [0.18, 0.06, 0.12], [0.22, 0.25, 0], optic);
  } else if (weaponId === 'm9') {
    // Compact service pistol — slide, frame/grip, barrel and sights, sized
    // like the taser rather than the long guns.
    addProfile(root, [
      [-0.3, -0.08], [0.34, -0.08], [0.36, 0.08], [0.28, 0.13],
      [-0.26, 0.13], [-0.3, 0.02],
    ], 0.18, steel); // slide
    addProfile(root, [
      [-0.28, -0.08], [0.12, -0.08], [0.12, -0.42], [-0.02, -0.52],
      [-0.2, -0.48], [-0.28, -0.24],
    ], 0.16, polymer); // frame + grip
    addBarrel(root, 0.024, 0.16, [0.4, 0.05, 0], steel);
    addBox(root, [0.05, 0.03, 0.11], [0.02, 0.155, 0], optic); // rear sight
    addBox(root, [0.035, 0.03, 0.09], [0.32, 0.155, 0], optic); // front sight
    addBox(root, [0.1, 0.05, 0.13], [-0.16, -0.05, 0], steel); // trigger guard block
    addBox(root, [0.03, 0.1, 0.11], [-0.24, -0.52, 0], rubber); // mag base pad
  } else {
    const isPepperball = weaponId === 'pepperball';
    const receiverLength = 0.64;
    addBox(root, [receiverLength, 0.3, 0.24], [0.12, 0.02, 0], isPepperball ? yellow : steel);
    addBarrel(root, 0.052, 0.62, [0.72, 0.07, 0], steel);
    addBarrel(root, 0.072, 0.18, [1.08, 0.07, 0], steel);
    addBox(root, [0.19, 0.5, 0.2], [0.05, -0.34, 0], polymer, [0, 0, -0.1]);
    addBox(root, [0.18, 0.4, 0.18], [0.36, -0.32, 0], steel, [0, 0, 0.06]);
    addBox(root, [0.54, 0.18, 0.2], [-0.55, 0, 0], polymer, [0, 0, 0.04]);
    addBox(root, [0.17, 0.44, 0.22], [-0.82, -0.02, 0], rubber);
    addBox(root, [0.12, 0.12, 0.18], [0.05, 0.26, 0], optic);
    addBox(root, [0.28, 0.055, 0.12], [0.05, 0.34, 0], steel);
    if (isPepperball) {
      const hopper = new THREE.Mesh(new THREE.SphereGeometry(0.23, 18, 12), polymer);
      hopper.scale.set(1.25, 1, 1);
      hopper.position.set(0.02, 0.48, 0);
      hopper.castShadow = true;
      root.add(hopper);
    }
  }

  return root;
}

function weaponPrototype(weaponId) {
  if (!proceduralWeaponCache.has(weaponId)) {
    proceduralWeaponCache.set(weaponId, buildProceduralWeapon(weaponId));
  }
  return proceduralWeaponCache.get(weaponId);
}

// Equipment is authored in the character's own (unscaled) space, where the rig
// is 2.7 units tall: legs ~0-1.0, torso ~1.0-1.9, head ~1.9-2.7 spanning
// +/-0.4 on X and Z. Sizing to those real measurements keeps the helmet on the
// head instead of ballooning into a floating dome, and every value is kept
// light enough that the kit still reads as geometry in unlit shadow rather
// than collapsing into one black silhouette.
function buildRoleEquipment(role) {
  // Split into head-worn and torso-worn kit. Both halves are authored in the
  // character's root space and re-based onto the matching bone at equip time,
  // so the gear rides the skeleton — parented to the root instead, a helmet
  // stays standing upright while the body plays its death animation.
  const head = new THREE.Group();
  const root = new THREE.Group();
  const isTeammate = role === 'teammate';
  const isElite = role === 'eliteSuspect';

  const shell = material(isTeammate ? 0x41505e : isElite ? 0x35373c : 0x4c4238, 0.3, 0.55);
  shell.emissive = new THREE.Color(isTeammate ? 0x0e161d : isElite ? 0x121316 : 0x151109);
  shell.emissiveIntensity = 0.45;
  const webbing = material(isTeammate ? 0x2d3a46 : isElite ? 0x26282c : 0x3c3329, 0.12, 0.82);
  webbing.emissive = new THREE.Color(0x0a0d10);
  webbing.emissiveIntensity = 0.35;
  const accent = material(isTeammate ? 0x93a8ba : isElite ? 0x93332f : 0x6f5f48, 0.34, 0.45);
  const glass = new THREE.MeshStandardMaterial({
    color: 0x22394a, metalness: 0.86, roughness: 0.1,
    emissive: 0x14303f, emissiveIntensity: 0.9,
  });

  // Plate carrier front/back with side straps.
  addBox(root, [0.88, 0.76, 0.18], [0, 1.5, 0.34], shell);
  addBox(root, [0.88, 0.76, 0.16], [0, 1.5, -0.34], shell);
  addBox(root, [0.14, 0.62, 0.6], [-0.45, 1.48, 0], webbing);
  addBox(root, [0.14, 0.62, 0.6], [0.45, 1.48, 0], webbing);

  // Magazine pouches across the chest.
  for (const px of [-0.26, 0, 0.26]) addBox(root, [0.21, 0.26, 0.13], [px, 1.26, 0.46], webbing);
  addBox(root, [0.5, 0.16, 0.12], [0, 1.72, 0.45], accent);

  // Shoulder pads and collar.
  addBox(root, [0.26, 0.18, 0.44], [-0.5, 1.85, 0], shell);
  addBox(root, [0.26, 0.18, 0.44], [0.5, 1.85, 0], shell);
  addBox(root, [0.54, 0.15, 0.46], [0, 1.95, 0], webbing);

  // Helmet: a shallow cap sized just proud of the 0.8-wide head.
  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.46, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.56),
    shell,
  );
  helmet.scale.set(1.08, 1.0, 1.12);
  helmet.position.set(0, 2.26, 0);
  helmet.castShadow = true;
  helmet.receiveShadow = true;
  head.add(helmet);
  addBox(head, [1.0, 0.07, 1.04], [0, 2.25, 0], webbing);

  // Visor, NVG mount and ear protection.
  addBox(head, [0.6, 0.15, 0.09], [0, 2.29, 0.4], glass);
  addBox(head, [0.17, 0.12, 0.14], [0, 2.5, 0.38], accent);
  addBox(head, [0.1, 0.24, 0.24], [-0.43, 2.24, 0.02], webbing);
  addBox(head, [0.1, 0.24, 0.24], [0.43, 2.24, 0.02], webbing);

  if (isTeammate) {
    addBox(root, [0.42, 0.46, 0.16], [0, 1.46, -0.5], webbing);
    addBox(root, [0.06, 0.5, 0.06], [-0.42, 2.2, -0.26], accent, [0.16, 0, 0.1]);
  }
  return { head, torso: root };
}

// Re-bases a group authored in `root` space into `bone` space, so it lands in
// exactly the same place at bind pose but is then carried by the animation.
function attachToBone(root, bone, group) {
  if (!bone) { root.add(group); return; }
  root.updateMatrixWorld(true);
  const toBone = new THREE.Matrix4().copy(bone.matrixWorld).invert().multiply(root.matrixWorld);
  group.applyMatrix4(toBone);
  bone.add(group);
}

export function equipCharacterRole(root, role) {
  if (role !== 'teammate' && role !== 'suspect' && role !== 'eliteSuspect') return;
  if (!roleEquipmentCache.has(role)) roleEquipmentCache.set(role, buildRoleEquipment(role));
  const kit = roleEquipmentCache.get(role);
  attachToBone(root, root.getObjectByName('head'), kit.head.clone(true));
  attachToBone(root, root.getObjectByName('torso'), kit.torso.clone(true));
}

// ---------------------------------------------------------------- characters

const ANIM_ALIASES = {
  idle: 'idle', walk: 'walk', sprint: 'sprint', die: 'die',
  aim: 'holding-right', shoot: 'holding-right-shoot', kneel: 'sit', react: 'emote-no',
};

export function spawnCharacter(variantLetter) {
  const file = CHARACTER_FILES[variantLetter] || CHARACTER_FILES.a;
  const gltf = resolvedCache.get(file);
  if (!gltf) throw new Error(`Model not preloaded: ${file}`);
  const root = skeletonClone(gltf.scene);
  root.scale.setScalar(CHAR_SCALE);
  root.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    if (child.material?.isMeshStandardMaterial) {
      child.material = child.material.clone();
      child.material.roughness = Math.max(0.62, child.material.roughness ?? 0.62);
    }
  });

  const mixer = new THREE.AnimationMixer(root);
  const clips = new Map(gltf.animations.map((c) => [c.name, c]));
  const actions = new Map();
  const state = { current: null, action: null };

  function getAction(name) {
    if (!actions.has(name)) {
      const clip = clips.get(name);
      if (!clip) return null;
      actions.set(name, mixer.clipAction(clip));
    }
    return actions.get(name);
  }

  function play(aliasName, { fadeTime = 0.2, loopOnce = false } = {}) {
    const clipName = ANIM_ALIASES[aliasName] || aliasName;
    if (state.current === clipName) return;
    const next = getAction(clipName);
    if (!next) return;
    next.reset();
    next.setLoop(loopOnce ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = loopOnce;
    next.enabled = true;
    next.play();
    if (state.action) {
      state.action.crossFadeTo(next, fadeTime, false);
    } else {
      next.fadeIn(fadeTime);
    }
    state.action = next;
    state.current = clipName;
  }

  return {
    root,
    armRight: root.getObjectByName('arm-right'),
    torso: root.getObjectByName('torso'),
    head: root.getObjectByName('head'),
    update: (dt) => mixer.update(dt),
    play,
  };
}

// ---------------------------------------------------------------- weapons

export function spawnWeapon(weaponId) {
  return weaponPrototype(weaponId).clone(true);
}

// A hinged wooden door built entirely from primitives — panel, two recessed
// insets and a brass knob — so it needs no external model file at all. The
// door is authored directly in the renderer's native Y-up space: the hinge
// sits on the vertical edge of the doorway and swings around world Y.
function buildDoorLeaf() {
  const width = DOOR_WIDTH, height = DOOR_HEIGHT, thickness = 0.09;
  const wood = material(0x6b4a30, 0.04, 0.78);
  const trim = material(0x4a3220, 0.04, 0.82);
  const brass = material(0xb08d3e, 0.75, 0.32);

  const leaf = new THREE.Group();
  leaf.name = 'door-leaf';
  const panel = new THREE.Mesh(new THREE.BoxGeometry(width, height, thickness), wood);
  panel.castShadow = true;
  panel.receiveShadow = true;
  leaf.add(panel);

  const insetGeo = new THREE.BoxGeometry(width * 0.72, height * 0.36, thickness * 0.5);
  for (const oy of [height * 0.24, -height * 0.24]) {
    const inset = new THREE.Mesh(insetGeo, trim);
    inset.position.set(0, oy, thickness * 0.28);
    inset.castShadow = true;
    leaf.add(inset);
  }

  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), brass);
  knob.position.set(width * 0.38, 0, thickness / 2 + 0.045);
  leaf.add(knob);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.012), brass);
  plate.position.set(width * 0.38, 0, thickness / 2 + 0.006);
  leaf.add(plate);

  return leaf;
}

export function spawnDoorModel() {
  const width = DOOR_WIDTH, height = DOOR_HEIGHT;
  const leaf = buildDoorLeaf();
  leaf.position.x = width / 2; // spans from the hinge edge across the doorway when closed

  const hinge = new THREE.Group();
  hinge.name = 'door-hinge';
  hinge.position.set(-width / 2, height / 2, 0);
  hinge.add(leaf);

  const root = new THREE.Group();
  root.name = 'door-root';
  root.add(hinge);

  return { root, hinge, leaf, frame: null, width, height };
}

// ---------------------------------------------------------------- props

const PROP_TINTS = {
  crateSmall: { color: 0x6b5335, metalness: 0.05, roughness: 0.85 },
  crateMedium: { color: 0x5c4a30, metalness: 0.05, roughness: 0.85 },
  crateWide: { color: 0x4d3f2a, metalness: 0.05, roughness: 0.85 },
};

export function spawnProp(propId) {
  const file = PROP_FILES[propId];
  const gltf = resolvedCache.get(file);
  const root = gltf.scene.clone(true);
  const tint = PROP_TINTS[propId];
  if (tint) tintMaterial(root, tint);
  return root;
}
