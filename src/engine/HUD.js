function fmtTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export function initCommandBar() {
  const bar = document.getElementById('hud-command-bar');
  bar.innerHTML = `
    <div class="cmd"><b>1</b> Follow</div>
    <div class="cmd"><b>2</b> Hold</div>
    <div class="cmd"><b>3</b> Move Ahead</div>
    <div class="cmd"><b>4</b> Breach</div>
    <div class="cmd"><b>Space</b> Freeze!</div>
    <div class="cmd"><b>E</b> Interact / Kick Door</div>
    <div class="cmd"><b>F</b> Flashbang</div>
    <div class="cmd"><b>Q</b> Switch Weapon</div>
  `;
}

export function updateHUD(mission, input) {
  const p = mission.player;

  const objDiv = document.getElementById('hud-objectives');
  objDiv.innerHTML = mission.def.objectives.map((o) => {
    let done = false;
    if (o.id === 'neutralize') done = mission.allSuspectsResolved;
    else if (o.id === 'hostage') done = mission.allHostagesResolved;
    else if (o.id === 'evidence') done = mission.allEvidenceCollected;
    return `<div class="${done ? 'done' : ''}">${done ? '✓' : '▸'} ${o.text}</div>`;
  }).join('');

  document.getElementById('hud-timer').textContent = fmtTime(mission.timeRemaining);

  document.getElementById('hud-health-bar').style.width = `${Math.max(0, p.hp / p.maxHp) * 100}%`;
  document.getElementById('hud-weapon-name').textContent = mission.player.currentWeapon.name;
  const ammo = p.currentAmmo;
  document.getElementById('hud-ammo').textContent = ammo.reloading ? 'RELOADING…' : `${ammo.mag} / ${ammo.reserve}`;

  const teamDiv = document.getElementById('hud-team');
  teamDiv.innerHTML = mission.teammates.map((t) => {
    const pct = t.alive ? Math.max(0, t.hp / t.maxHp) * 100 : 0;
    return `<div class="team-member"><span>${t.alive ? t.name : t.name + ' (DOWN)'}</span><div class="bar"><div class="bar-fill health" style="width:${pct}%"></div></div></div>`;
  }).join('') + `<div class="team-member"><span>FLASHBANGS</span><span>${p.flashbangs}</span></div>`;

  const banner = document.getElementById('hud-banner');
  if (mission.bannerTimer > 0) {
    banner.textContent = mission.bannerText;
    banner.classList.add('show');
  } else {
    banner.classList.remove('show');
  }

  document.getElementById('hud-flash-overlay').style.opacity = p.isStunned ? Math.min(0.85, p.stunTimer / 3) : 0;
}
