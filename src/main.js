import { QUICKPLAY_MISSION, CAREER_MISSIONS } from './maps/mapData.js';
import { CareerManager } from './core/CareerManager.js';
import { GameRunner } from './engine/GameRunner.js';
import { drawMapPreview } from './ui/mapPreview.js';
import { WEAPONS, EQUIPMENT } from './core/Weapons.js';
import { setVolume, resumeAudio, playUiClick } from './core/Audio.js';
import { settings } from './core/Settings.js';
import { preloadAll } from './engine/ModelLibrary.js';
import { loadGraphics, applyPreset, setGore, graphics, PRESETS } from './core/GraphicsSettings.js';
import { buildCustomMission, CUSTOM_MAP_TEMPLATE } from './maps/customMap.js';

// Resolve the quality preset before the renderer is constructed — it reads
// shadow, sampling and pixel-ratio settings while building its context.
loadGraphics();

const career = new CareerManager();
const canvas = document.getElementById('game-canvas');
const runner = new GameRunner(canvas);
const app = document.getElementById('app');

let currentMissionDef = null;
let currentCareerIndex = null; // null => quick play / non-career

// ---------------------------------------------------------------- screens
function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  document.getElementById(`screen-${id}`).classList.add('active');
}

document.querySelectorAll('[data-back]').forEach((btn) => {
  btn.addEventListener('click', () => {
    playUiClick();
    if (btn.dataset.back === 'career') renderCareerScreen();
    showScreen(btn.dataset.back);
  });
});

// ---------------------------------------------------------------- main menu
document.getElementById('btn-play-now').addEventListener('click', () => {
  resumeAudio(); playUiClick();
  currentMissionDef = QUICKPLAY_MISSION;
  currentCareerIndex = null;
  openBriefing();
});
document.getElementById('btn-career').addEventListener('click', () => { resumeAudio(); playUiClick(); renderCareerScreen(); showScreen('career'); });
document.getElementById('btn-custom-map').addEventListener('click', () => { playUiClick(); showScreen('custom'); });
document.getElementById('btn-armory').addEventListener('click', () => { playUiClick(); renderArmory(); showScreen('armory'); });
document.getElementById('btn-options').addEventListener('click', () => { playUiClick(); showScreen('options'); });
document.getElementById('btn-credits').addEventListener('click', () => { playUiClick(); showScreen('credits'); });

const fullscreenButtons = [
  document.getElementById('btn-menu-fullscreen'),
  document.getElementById('btn-pause-fullscreen'),
];

function refreshFullscreenButtons() {
  const label = document.fullscreenElement ? 'EXIT FULLSCREEN' : 'ENTER FULLSCREEN';
  fullscreenButtons.forEach((button) => { button.textContent = label; });
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await app.requestFullscreen({ navigationUI: 'hide' });
  } catch (error) {
    console.warn('Fullscreen request was declined', error);
  }
}

fullscreenButtons.forEach((button) => button.addEventListener('click', () => {
  playUiClick();
  toggleFullscreen();
}));

document.addEventListener('fullscreenchange', () => {
  refreshFullscreenButtons();
  requestAnimationFrame(() => runner.resize(true));
});
refreshFullscreenButtons();

// ---------------------------------------------------------------- career screen
function grade_(missionIndex) {
  const r = career.data.results[missionIndex];
  return r ? r.grade : null;
}

function renderCareerScreen() {
  const profile = document.getElementById('career-profile');
  const completed = Object.values(career.data.results).filter((r) => r.completed).length;
  profile.innerHTML = `
    <h3>${career.data.officerName}</h3>
    <div class="stat-line"><span>Rank</span><span>${career.data.rank}</span></div>
    <div class="stat-line"><span>Missions Cleared</span><span>${completed} / ${CAREER_MISSIONS.length}</span></div>
    <div class="stat-line"><span>Unit</span><span>Metro SWAT — Team 5</span></div>
  `;

  const list = document.getElementById('mission-list');
  list.innerHTML = '';
  CAREER_MISSIONS.forEach((m, i) => {
    const unlocked = career.isUnlocked(i);
    const g = grade_(i);
    const card = document.createElement('div');
    card.className = `mission-card ${unlocked ? '' : 'locked'} ${g ? 'completed' : ''}`;
    card.innerHTML = `
      <div class="mission-num">${i + 1}</div>
      <div class="mission-info">
        <h4>${m.name}</h4>
        <p>${unlocked ? 'Ready for deployment' : 'Locked — complete the previous mission'}</p>
      </div>
      <div class="mission-grade">${g || (unlocked ? '' : '🔒')}</div>
    `;
    if (unlocked) {
      card.addEventListener('click', () => {
        playUiClick();
        currentMissionDef = m;
        currentCareerIndex = i;
        openBriefing();
      });
    }
    list.appendChild(card);
  });
}

// ---------------------------------------------------------------- briefing
function openBriefing() {
  const def = currentMissionDef;
  document.getElementById('briefing-title').textContent = def.name.toUpperCase();
  document.getElementById('briefing-text').textContent = def.briefing;
  drawMapPreview(document.getElementById('briefing-map-preview'), def);

  document.getElementById('briefing-objectives').innerHTML =
    `<h4>OBJECTIVES</h4><ul>${def.objectives.map((o) => `<li>${o.text}</li>`).join('')}</ul>`;

  const lethal = WEAPONS[def.loadout.lethal];
  const nonlethal = WEAPONS[def.loadout.nonlethal];
  document.getElementById('briefing-loadout').innerHTML = `
    <h4>LOADOUT</h4>
    <ul>
      <li>${lethal.name}</li>
      <li>${nonlethal.name}</li>
      <li>${EQUIPMENT.flashbang.name} x${EQUIPMENT.flashbang.maxCount}</li>
      <li>2 SWAT teammates</li>
    </ul>`;

  showScreen('briefing');
}

document.getElementById('btn-deploy').addEventListener('click', () => {
  resumeAudio(); playUiClick();
  showScreen('game');
  runner.start(currentMissionDef, { onEnd: handleMissionEnd });
  runner.input.requestLock();
});

// ---------------------------------------------------------------- in-mission overlays
const pauseMenu = document.getElementById('pause-menu');
const controlsOverlay = document.getElementById('controls-overlay');

window.addEventListener('keydown', (e) => {
  if (e.altKey && e.key === 'Enter') {
    e.preventDefault();
    toggleFullscreen();
    return;
  }
  if (e.key === 'Escape' && document.getElementById('screen-game').classList.contains('active')) {
    if (!controlsOverlay.classList.contains('hidden')) { controlsOverlay.classList.add('hidden'); return; }
    const willPause = pauseMenu.classList.contains('hidden');
    pauseMenu.classList.toggle('hidden', !willPause);
    runner.setPaused(willPause);
  }
});

document.getElementById('btn-resume').addEventListener('click', () => {
  pauseMenu.classList.add('hidden');
  runner.setPaused(false);
  runner.input.requestLock();
});
document.getElementById('btn-restart-mission').addEventListener('click', () => {
  pauseMenu.classList.add('hidden');
  runner.start(currentMissionDef, { onEnd: handleMissionEnd });
  runner.input.requestLock();
});
document.getElementById('btn-controls').addEventListener('click', () => controlsOverlay.classList.remove('hidden'));
document.getElementById('btn-close-controls').addEventListener('click', () => controlsOverlay.classList.add('hidden'));
document.getElementById('btn-quit-mission').addEventListener('click', () => {
  runner.stop();
  pauseMenu.classList.add('hidden');
  showScreen('menu');
});

// ---------------------------------------------------------------- debrief
function handleMissionEnd(mission) {
  const targetTime = mission.def.timeLimit * 0.6;
  const result = mission.score.finalize(mission.teammates, targetTime);
  const passed = mission.state === 'won';

  if (passed && currentCareerIndex !== null) {
    career.recordResult(currentCareerIndex, { grade: result.grade, score: result.score });
  }
  showDebrief(mission, result, passed);
}

function statRow(label, value, isBad) {
  return `<div class="stat"><span>${label}</span><span class="val ${isBad ? 'bad' : value ? 'good' : ''}">${value}</span></div>`;
}

function showDebrief(mission, result, passed) {
  const s = mission.score;
  const title = document.getElementById('debrief-title');
  if (passed) title.textContent = 'MISSION COMPLETE';
  else if (mission.state === 'lost_dead') title.textContent = 'MISSION FAILED — OFFICER DOWN';
  else title.textContent = 'MISSION FAILED — TIME EXPIRED';

  const gradeEl = document.getElementById('debrief-grade');
  gradeEl.textContent = passed ? result.grade : '—';

  document.getElementById('debrief-stats').innerHTML = [
    statRow('Suspects Arrested', s.suspectsArrested),
    statRow('Suspects Neutralized (Justified)', s.suspectsKilledJustified),
    statRow('Excessive Force Incidents', s.suspectsKilledExcessive, s.suspectsKilledExcessive > 0),
    statRow('ROE Violations', s.forceViolations, s.forceViolations > 0),
    statRow('Suspects Escaped', s.suspectsEscaped, s.suspectsEscaped > 0),
    statRow('Hostages Rescued', s.hostagesFreed),
    statRow('Hostages Lost', s.hostagesDied, s.hostagesDied > 0),
    statRow('Civilian Casualties', s.civilianCasualties, s.civilianCasualties > 0),
    statRow('Teammates Lost', s.teammatesLost, s.teammatesLost > 0),
    statRow('Mission Score', passed ? result.score : 0),
  ].join('');

  const storyEl = document.getElementById('debrief-story');
  if (passed) {
    storyEl.textContent = mission.def.debriefWin || 'The scene is secure.';
  } else if (mission.state === 'lost_dead') {
    storyEl.textContent = 'You went down before the scene could be secured. Command is pulling the team back to regroup. Review your approach and try again.';
  } else {
    storyEl.textContent = 'Time ran out before the situation could be resolved. Command has dispatched a relief unit. Try a faster, more decisive approach.';
  }

  const nextBtn = document.getElementById('btn-debrief-next');
  const isCareer = currentCareerIndex !== null;
  const hasNext = isCareer && currentCareerIndex + 1 < CAREER_MISSIONS.length;
  if (passed && isCareer && hasNext) {
    nextBtn.textContent = 'CONTINUE ▶';
    nextBtn.style.display = '';
    nextBtn.onclick = () => {
      playUiClick();
      currentMissionDef = CAREER_MISSIONS[currentCareerIndex + 1];
      currentCareerIndex += 1;
      openBriefing();
    };
  } else if (passed && isCareer && !hasNext) {
    nextBtn.textContent = 'RETURN TO CAREER';
    nextBtn.style.display = '';
    nextBtn.onclick = () => { playUiClick(); renderCareerScreen(); showScreen('career'); };
  } else {
    nextBtn.style.display = 'none';
  }

  document.getElementById('btn-debrief-retry').onclick = () => {
    playUiClick();
    showScreen('game');
    runner.start(currentMissionDef, { onEnd: handleMissionEnd });
    runner.input.requestLock();
  };
  document.getElementById('btn-debrief-menu').onclick = () => { playUiClick(); showScreen('menu'); };

  showScreen('debrief');
}

// ---------------------------------------------------------------- custom map
const customJsonEl = document.getElementById('custom-json');
const customErrorsEl = document.getElementById('custom-errors');

document.getElementById('btn-custom-template').addEventListener('click', () => {
  playUiClick();
  customJsonEl.value = JSON.stringify(CUSTOM_MAP_TEMPLATE, null, 2);
  customErrorsEl.textContent = '';
});

document.getElementById('btn-custom-deploy').addEventListener('click', () => {
  playUiClick();
  customErrorsEl.textContent = '';
  let raw;
  try {
    raw = JSON.parse(customJsonEl.value);
  } catch (err) {
    customErrorsEl.textContent = `Invalid JSON: ${err.message}`;
    return;
  }
  const result = buildCustomMission(raw);
  if (!result.ok) {
    customErrorsEl.textContent = result.errors.join('\n');
    return;
  }
  currentMissionDef = result.mission;
  currentCareerIndex = null;
  openBriefing();
});

// ---------------------------------------------------------------- armory
function renderArmory() {
  const body = document.getElementById('armory-body');
  const cards = [];
  for (const w of Object.values(WEAPONS)) {
    cards.push(`
      <div class="armory-item">
        <h4>${w.name}</h4>
        <p>Damage ${w.pellets ? w.damage + ' x' + w.pellets + ' pellets' : w.damage} · Magazine ${w.magSize} · Range ${w.range}</p>
        <span class="tag">${w.lethal ? 'LETHAL' : 'LESS-LETHAL'}</span>
      </div>`);
  }
  cards.push(`
    <div class="armory-item">
      <h4>${EQUIPMENT.flashbang.name}</h4>
      <p>Stuns and blinds suspects and civilians in a ${EQUIPMENT.flashbang.radius}px radius for several seconds. Carry ${EQUIPMENT.flashbang.maxCount} per deployment.</p>
      <span class="tag">EQUIPMENT</span>
    </div>`);
  cards.push(`
    <div class="armory-item">
      <h4>DYNAMIC ENTRY</h4>
      <p>${EQUIPMENT.breach.desc} Approach a closed door and press F to kick it in yourself, or send a teammate in with the Breach command.</p>
      <span class="tag">TACTIC</span>
    </div>`);
  body.innerHTML = cards.join('');
}

// ---------------------------------------------------------------- options
const presetHost = document.getElementById('opt-gfx-presets');
function renderPresetButtons() {
  presetHost.innerHTML = '';
  for (const [key, preset] of Object.entries(PRESETS)) {
    const btn = document.createElement('button');
    btn.textContent = preset.label;
    btn.className = key === graphics.presetName ? 'active' : '';
    btn.addEventListener('click', () => {
      playUiClick();
      applyPreset(key);
      renderPresetButtons();
      // Texture resolution, shadow maps and light counts are baked when the
      // scene is built, so an active mission has to be rebuilt to pick them up.
      if (runner.running && currentMissionDef) runner.rebuildScene();
    });
    presetHost.appendChild(btn);
  }
}
renderPresetButtons();

const goreSlider = document.getElementById('opt-gore');
goreSlider.value = String(Math.round(graphics.goreLevel * 100));
goreSlider.addEventListener('input', () => setGore(goreSlider.value / 100));

const fpsToggle = document.getElementById('opt-fps');
fpsToggle.addEventListener('change', (e) => {
  document.getElementById('hud-fps').classList.toggle('show', e.target.checked);
});

const volSlider = document.getElementById('opt-volume');
volSlider.addEventListener('input', () => setVolume(volSlider.value / 100));
setVolume(volSlider.value / 100);

const sensSlider = document.getElementById('opt-sens');
sensSlider.addEventListener('input', () => { settings.mouseSensitivity = sensSlider.value / 100; });

document.getElementById('opt-hints').addEventListener('change', (e) => {
  document.getElementById('hud-command-bar').style.display = e.target.checked ? '' : 'none';
});

document.getElementById('btn-reset-career').addEventListener('click', () => {
  if (confirm('Reset all Career progress? This cannot be undone.')) {
    career.reset();
    renderCareerScreen();
  }
});

// ---------------------------------------------------------------- boot
preloadAll((done, total) => {
  document.getElementById('loading-bar-fill').style.width = `${(done / total) * 100}%`;
  document.getElementById('loading-text').textContent = `Loading tactical equipment… ${done}/${total}`;
}).then(() => {
  showScreen('menu');
}).catch((err) => {
  console.error('Asset preload failed', err);
  document.getElementById('loading-text').textContent = 'Failed to load assets — check console and refresh.';
});

window.__game = { runner, career };
