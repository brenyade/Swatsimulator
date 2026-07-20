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

const WEAPON_FILES = {
  m9: 'weapons/blaster-b.glb',
  mp5: 'weapons/blaster-m.glb',
  shotgun: 'weapons/blaster-d.glb',
  taser: 'weapons/blaster-k.glb',
  pepperball: 'weapons/blaster-o.glb',
};

// Recolors applied to the plain-metal weapon meshes at runtime (the source
// models come in bright toy colors; we want tactical/duty-belt colors).
const WEAPON_TINTS = {
  m9: { color: 0x2b2e2c, metalness: 0.6, roughness: 0.35 },
  mp5: { color: 0x24272a, metalness: 0.55, roughness: 0.4 },
  shotgun: { color: 0x3a3226, metalness: 0.4, roughness: 0.55 },
  taser: { color: 0xf2c744, metalness: 0.2, roughness: 0.5, accent: 0x111111 },
  pepperball: { color: 0xe07a2b, metalness: 0.2, roughness: 0.5, accent: 0x222222 },
};

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
    ...Object.values(WEAPON_FILES),
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
  });
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
  const file = WEAPON_FILES[weaponId] || WEAPON_FILES.m9;
  const gltf = resolvedCache.get(file);
  const root = gltf.scene.clone(true);
  const tint = WEAPON_TINTS[weaponId] || WEAPON_TINTS.m9;
  tintMaterial(root, tint);
  return root;
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
