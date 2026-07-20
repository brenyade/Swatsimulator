// Builds a playable mission from user-authored JSON (see docs in
// screen-custom of index.html for the schema). Runs the same sanity checks
// as scripts/validateMaps.mjs, but client-side, so bad maps fail with a
// readable error instead of crashing mid-mission.

import { WEAPONS } from '../core/Weapons.js';

const DEFAULT_LOADOUT = { lethal: 'mp5', nonlethal: 'taser' };

function floodFillReachable(grid, width, height, sx, sy) {
  const seen = new Set([`${sx},${sy}`]);
  const stack = [[sx, sy]];
  while (stack.length) {
    const [x, y] = stack.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const key = `${nx},${ny}`;
      if (seen.has(key)) continue;
      const c = grid[ny][nx];
      if (c === '#') continue; // doors ('D') are passable for this check
      seen.add(key);
      stack.push([nx, ny]);
    }
  }
  return seen;
}

export function buildCustomMission(raw) {
  const errors = [];
  const req = (cond, msg) => { if (!cond) errors.push(msg); };

  req(raw && typeof raw === 'object', 'Root value must be a JSON object.');
  if (errors.length) return { ok: false, errors };

  req(Array.isArray(raw.grid) && raw.grid.length > 0, '"grid" must be a non-empty array of row strings.');
  req(raw.playerStart && Number.isInteger(raw.playerStart.tx) && Number.isInteger(raw.playerStart.ty), '"playerStart" must be {tx, ty}.');
  if (errors.length) return { ok: false, errors };

  const height = raw.grid.length;
  const width = raw.grid[0].length;
  raw.grid.forEach((row, i) => {
    if (typeof row !== 'string' || row.length !== width) errors.push(`Row ${i} must be a string of length ${width} (matching row 0).`);
    for (const ch of row) {
      if (!'#.D'.includes(ch)) errors.push(`Row ${i} has an unknown tile character "${ch}" — only "#", ".", "D" are allowed.`);
    }
  });
  if (errors.length) return { ok: false, errors };

  const grid = raw.grid.slice();
  const inBounds = (tx, ty) => tx >= 0 && ty >= 0 && tx < width && ty < height;
  const isFloor = (tx, ty) => inBounds(tx, ty) && grid[ty][tx] !== '#';

  const checkSpawn = (label, tx, ty) => {
    if (!inBounds(tx, ty)) { errors.push(`${label} at (${tx},${ty}) is outside the ${width}x${height} grid.`); return; }
    if (!isFloor(tx, ty)) errors.push(`${label} at (${tx},${ty}) is inside a wall.`);
  };

  checkSpawn('playerStart', raw.playerStart.tx, raw.playerStart.ty);
  const teammates = raw.teammates || [{ tx: raw.playerStart.tx, ty: raw.playerStart.ty }];
  teammates.forEach((t, i) => checkSpawn(`teammates[${i}]`, t.tx, t.ty));
  const suspects = raw.suspects || [];
  suspects.forEach((s, i) => {
    checkSpawn(`suspects[${i}]`, s.tx, s.ty);
    (s.patrol || []).forEach((p, j) => checkSpawn(`suspects[${i}].patrol[${j}]`, p.tx, p.ty));
  });
  const hostages = raw.hostages || [];
  hostages.forEach((h, i) => checkSpawn(`hostages[${i}]`, h.tx, h.ty));
  const civilians = raw.civilians || [];
  civilians.forEach((c, i) => checkSpawn(`civilians[${i}]`, c.tx, c.ty));
  const evidence = raw.evidence || [];
  evidence.forEach((e, i) => checkSpawn(`evidence[${i}]`, e.tx, e.ty));
  const props = raw.props || [];
  props.forEach((p, i) => checkSpawn(`props[${i}]`, p.tx, p.ty));

  if (errors.length) return { ok: false, errors };

  const reachable = floodFillReachable(grid, width, height, raw.playerStart.tx, raw.playerStart.ty);
  const checkReach = (label, tx, ty) => { if (!reachable.has(`${tx},${ty}`)) errors.push(`${label} at (${tx},${ty}) is not reachable from the player start.`); };
  teammates.forEach((t, i) => checkReach(`teammates[${i}]`, t.tx, t.ty));
  suspects.forEach((s, i) => checkReach(`suspects[${i}]`, s.tx, s.ty));
  hostages.forEach((h, i) => checkReach(`hostages[${i}]`, h.tx, h.ty));
  civilians.forEach((c, i) => checkReach(`civilians[${i}]`, c.tx, c.ty));
  evidence.forEach((e, i) => checkReach(`evidence[${i}]`, e.tx, e.ty));
  props.forEach((p, i) => checkReach(`props[${i}]`, p.tx, p.ty));

  if (raw.loadout) {
    if (!WEAPONS[raw.loadout.lethal] || !WEAPONS[raw.loadout.lethal].lethal) errors.push(`loadout.lethal "${raw.loadout.lethal}" is not a valid lethal weapon id.`);
    if (!WEAPONS[raw.loadout.nonlethal] || WEAPONS[raw.loadout.nonlethal].lethal) errors.push(`loadout.nonlethal "${raw.loadout.nonlethal}" is not a valid less-lethal weapon id.`);
  }
  suspects.forEach((s, i) => {
    if (s.weaponId && !WEAPONS[s.weaponId]) errors.push(`suspects[${i}].weaponId "${s.weaponId}" is not a valid weapon id.`);
  });

  if (errors.length) return { ok: false, errors };

  const objectives = raw.objectives || [
    ...(suspects.length ? [{ id: 'neutralize', text: 'Neutralize all suspects' }] : []),
    ...(hostages.length ? [{ id: 'hostage', text: 'Rescue all hostages' }] : []),
    ...(evidence.length ? [{ id: 'evidence', text: 'Secure the evidence' }] : []),
  ];

  const mission = {
    id: `custom-${Date.now()}`,
    name: raw.name || 'Custom Deployment',
    isQuickPlay: true,
    width,
    height,
    grid,
    playerStart: raw.playerStart,
    teammates,
    suspects,
    hostages,
    civilians,
    evidence,
    props,
    objectives,
    timeLimit: Number.isFinite(raw.timeLimit) ? raw.timeLimit : 300,
    loadout: raw.loadout || DEFAULT_LOADOUT,
    briefing: raw.briefing || `CUSTOM DEPLOYMENT\n\n${raw.name || 'A custom scenario'} — uploaded map. Good luck out there.`,
  };

  return { ok: true, mission };
}

function buildTemplateGrid() {
  const width = 20, height = 13;
  const rows = Array.from({ length: height }, () => Array(width).fill('#'));
  const carve = (x0, y0, x1, y1, ch = '.') => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) rows[y][x] = ch;
  };
  carve(1, 1, 18, 11);
  carve(5, 3, 6, 4, '#');
  carve(12, 3, 13, 5, '#');
  rows[1][9] = 'D';
  return rows.map((r) => r.join(''));
}

export const CUSTOM_MAP_TEMPLATE = {
  name: 'My Custom Map',
  grid: buildTemplateGrid(),
  playerStart: { tx: 2, ty: 11 },
  teammates: [{ tx: 2, ty: 10 }, { tx: 3, ty: 11 }],
  suspects: [
    { tx: 14, ty: 4, armed: true, willSurrender: 0.5, name: 'SUSPECT' },
  ],
  hostages: [{ tx: 15, ty: 3, name: 'HOSTAGE' }],
  civilians: [{ tx: 4, ty: 9, wanderRadius: 50 }],
  evidence: [],
  props: [],
  timeLimit: 300,
  loadout: { lethal: 'mp5', nonlethal: 'taser' },
  briefing: 'CUSTOM DEPLOYMENT\n\nWrite your own briefing text here.',
};
