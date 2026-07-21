import { getContextAction } from '../core/CommandSystem.js';

function fmtTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

// DOM lookups are cached once instead of repeating ~15 getElementById calls
// every single frame — the HUD nodes never change identity during a mission.
let el = null;
function cacheElements() {
  el = {
    objectives: document.getElementById('hud-objectives'),
    timer: document.getElementById('hud-timer'),
    healthBar: document.getElementById('hud-health-bar'),
    armorBar: document.getElementById('hud-armor-bar'),
    staminaBar: document.getElementById('hud-stamina-bar'),
    weaponName: document.getElementById('hud-weapon-name'),
    ammo: document.getElementById('hud-ammo'),
    status: document.getElementById('hud-status'),
    team: document.getElementById('hud-team'),
    banner: document.getElementById('hud-banner'),
    flashOverlay: document.getElementById('hud-flash-overlay'),
    damageVignette: document.getElementById('hud-damage-vignette'),
    crosshair: document.getElementById('hud-crosshair'),
    context: document.getElementById('hud-context'),
  };
}

export function initCommandBar() {
  const bar = document.getElementById('hud-command-bar');
  bar.innerHTML = `
    <div class="cmd"><b>1</b> Follow</div>
    <div class="cmd"><b>2</b> Hold</div>
    <div class="cmd"><b>3</b> Move Ahead</div>
    <div class="cmd"><b>4</b> Stack / Execute</div>
    <div class="cmd"><b>5</b> Auto-Clear</div>
    <div class="cmd"><b>Space</b> Freeze!</div>
    <div class="cmd"><b>F</b> Interact</div>
    <div class="cmd"><b>B</b> Breach</div>
    <div class="cmd"><b>G</b> Flashbang</div>
    <div class="cmd"><b>X</b> Switch</div>
  `;
  cacheElements();
}

export function updateHUD(mission, input) {
  if (!el) cacheElements();
  const p = mission.player;

  el.objectives.innerHTML = mission.def.objectives.map((o) => {
    let done = false;
    if (o.id === 'neutralize') done = mission.allSuspectsResolved;
    else if (o.id === 'hostage') done = mission.allHostagesResolved;
    else if (o.id === 'evidence') done = mission.allEvidenceCollected;
    return `<div class="${done ? 'done' : ''}">${done ? '✓' : '▸'} ${o.text}</div>`;
  }).join('');

  el.timer.textContent = mission.overtime
    ? `OT +${fmtTime(Math.abs(mission.timeRemaining))}`
    : fmtTime(mission.timeRemaining);

  el.healthBar.style.width = `${Math.max(0, p.hp / p.maxHp) * 100}%`;
  el.armorBar.style.width = `${Math.max(0, p.armor / p.maxArmor) * 100}%`;
  el.staminaBar.style.width = `${Math.max(0, p.stamina / p.maxStamina) * 100}%`;
  el.weaponName.textContent = mission.player.currentWeapon.name;
  const ammo = p.currentAmmo;
  el.ammo.textContent = ammo.reloading ? 'RELOADING…' : `${ammo.mag} / ${ammo.reserve}`;
  const stance = p.isCrouching ? 'CROUCHED' : p.isSprinting ? 'FAST MOVE' : 'STANDING';
  const lean = p.lean < -0.2 ? 'LEAN LEFT' : p.lean > 0.2 ? 'LEAN RIGHT' : p.isAiming ? 'AIMING' : 'READY';
  el.status.textContent = `${stance} · ${lean}`;

  el.team.innerHTML = mission.teammates.map((t) => {
    const pct = t.alive ? Math.max(0, t.hp / t.maxHp) * 100 : 0;
    return `<div class="team-member"><span>${t.alive ? t.name : t.name + ' (DOWN)'}</span><div class="bar"><div class="bar-fill health" style="width:${pct}%"></div></div></div>`;
  }).join('') + `<div class="team-member"><span>FLASHBANGS</span><span>${p.flashbangs}</span></div>`;

  if (mission.bannerTimer > 0) {
    el.banner.textContent = mission.bannerText;
    el.banner.classList.add('show');
  } else {
    el.banner.classList.remove('show');
  }

  el.flashOverlay.style.opacity = p.isStunned ? Math.min(0.85, p.stunTimer / 3) : 0;

  const hpFrac = Math.max(0, p.hp / p.maxHp);
  const lowHealthGlow = (1 - hpFrac) * 0.65;
  const hitPulse = (p.hitFlash || 0) * 0.55;
  el.damageVignette.style.opacity = Math.min(0.92, lowHealthGlow + hitPulse);

  const spreadScale = 0.7 + Math.min(1.8, (p.currentSpread || 0.03) * 12);
  el.crosshair.style.transform = `translate(-50%,-50%) scale(${spreadScale})`;
  el.crosshair.style.opacity = p.isAiming ? '0.42' : '0.9';

  const action = getContextAction(mission);
  el.context.textContent = action;
  el.context.classList.toggle('show', !!action);
}
