// Lightweight procedural sound design — no external audio assets required.
let ctx = null;
let master = null;
let volume = 0.7;

function ensureCtx() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = volume;
  master.connect(ctx.destination);
  return ctx;
}

export function setVolume(v01) {
  volume = v01;
  if (master) master.gain.value = volume;
}

export function resumeAudio() {
  const c = ensureCtx();
  if (c && c.state === 'suspended') c.resume();
}

function tone({ freq = 440, type = 'sine', duration = 0.12, gain = 0.3, sweepTo = null }) {
  const c = ensureCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime);
  if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, c.currentTime + duration);
  g.gain.setValueAtTime(gain, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  osc.connect(g).connect(master);
  osc.start();
  osc.stop(c.currentTime + duration + 0.02);
}

function noiseBurst({ duration = 0.15, gain = 0.4 }) {
  const c = ensureCtx();
  if (!c) return;
  const bufferSize = Math.floor(c.sampleRate * duration);
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  const src = c.createBufferSource();
  src.buffer = buffer;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(g).connect(master);
  src.start();
}

export function playShot(weaponId) {
  if (weaponId === 'shotgun') noiseBurst({ duration: 0.22, gain: 0.55 });
  else if (weaponId === 'taser' || weaponId === 'pepperball') tone({ freq: 900, type: 'square', duration: 0.08, gain: 0.15, sweepTo: 300 });
  else noiseBurst({ duration: 0.09, gain: 0.35 });
}

export function playFlashbang() {
  noiseBurst({ duration: 0.5, gain: 0.6 });
  tone({ freq: 2200, type: 'sine', duration: 0.5, gain: 0.2 });
}

export function playAlert() { tone({ freq: 520, type: 'sawtooth', duration: 0.18, gain: 0.2, sweepTo: 720 }); }
export function playArrest() { tone({ freq: 660, type: 'triangle', duration: 0.2, gain: 0.25, sweepTo: 990 }); }
export function playHurt() { tone({ freq: 180, type: 'square', duration: 0.15, gain: 0.25, sweepTo: 90 }); }
export function playUiClick() { tone({ freq: 440, type: 'sine', duration: 0.06, gain: 0.15 }); }
