// Quality presets, persisted to localStorage. Renderer3D reads these at scene
// build time (textures, shadows, light count) and applies the cheap ones
// (pixel ratio, post-FX strength) live whenever they change.

const SAVE_KEY = 'swatsim_gfx_v1';

export const PRESETS = {
  low: {
    label: 'LOW',
    pixelRatioCap: 1.0,
    shadows: false,
    shadowMapSize: 512,
    postFX: false,
    samples: 0,
    bloomStrength: 0.0,
    bloomThreshold: 0.7,
    bloomScale: 0.5,
    grain: 0.0,
    textureSize: 64,
    anisotropy: 1,
    practicalLights: 2,
    particleBudget: 80,
    dustMotes: 0,
    normalMaps: false,
  },
  medium: {
    label: 'MEDIUM',
    pixelRatioCap: 1.25,
    shadows: true,
    shadowMapSize: 1024,
    postFX: true,
    samples: 0,
    bloomStrength: 0.6,
    bloomThreshold: 0.66,
    bloomScale: 0.5,
    grain: 0.02,
    textureSize: 128,
    anisotropy: 4,
    practicalLights: 3,
    particleBudget: 180,
    dustMotes: 140,
    normalMaps: true,
  },
  high: {
    label: 'HIGH',
    pixelRatioCap: 1.5,
    shadows: true,
    shadowMapSize: 2048,
    postFX: true,
    samples: 4,
    bloomStrength: 0.85,
    bloomThreshold: 0.62,
    bloomScale: 0.5,
    grain: 0.028,
    textureSize: 256,
    anisotropy: 8,
    practicalLights: 5,
    particleBudget: 320,
    dustMotes: 260,
    normalMaps: true,
  },
  ultra: {
    label: 'ULTRA',
    pixelRatioCap: 2.0,
    shadows: true,
    shadowMapSize: 4096,
    postFX: true,
    samples: 8,
    bloomStrength: 1.0,
    bloomThreshold: 0.58,
    bloomScale: 0.6,
    grain: 0.03,
    textureSize: 512,
    anisotropy: 16,
    practicalLights: 7,
    particleBudget: 520,
    dustMotes: 420,
    normalMaps: true,
  },
};

function detectDefaultPreset() {
  const cores = navigator.hardwareConcurrency || 4;
  const dpr = window.devicePixelRatio || 1;
  if (cores >= 12 && dpr >= 1) return 'ultra';
  if (cores >= 8) return 'high';
  if (cores >= 4) return 'medium';
  return 'low';
}

export const graphics = {
  presetName: 'high',
  ...PRESETS.high,
  // Bumped independently of the preset so players can dial gore back without
  // dropping visual fidelity.
  goreLevel: 1.0,
  listeners: new Set(),
};

export function applyPreset(name) {
  const preset = PRESETS[name] || PRESETS.high;
  Object.assign(graphics, preset);
  graphics.presetName = PRESETS[name] ? name : 'high';
  save();
  notify();
}

export function setGore(level) {
  graphics.goreLevel = level;
  save();
  notify();
}

export function onGraphicsChange(fn) {
  graphics.listeners.add(fn);
  return () => graphics.listeners.delete(fn);
}

function notify() {
  for (const fn of graphics.listeners) {
    try { fn(graphics); } catch (err) { console.warn('graphics listener failed', err); }
  }
}

function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ preset: graphics.presetName, gore: graphics.goreLevel }));
  } catch { /* storage unavailable */ }
}

export function loadGraphics() {
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch { stored = null; }
  const name = stored?.preset && PRESETS[stored.preset] ? stored.preset : detectDefaultPreset();
  Object.assign(graphics, PRESETS[name]);
  graphics.presetName = name;
  if (typeof stored?.gore === 'number') graphics.goreLevel = stored.gore;
  return graphics;
}
