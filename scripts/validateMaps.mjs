import { QUICKPLAY_MISSION, CAREER_MISSIONS } from '../src/maps/mapData.js';

let failures = 0;

function floodFill(grid, width, height, sx, sy) {
  const seen = new Set();
  const stack = [[sx, sy]];
  seen.add(`${sx},${sy}`);
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

function checkMission(m) {
  console.log(`\n--- ${m.name} (${m.id}) ---`);
  const { grid, width, height } = m;

  if (grid.length !== height) { console.log(`FAIL: height mismatch`); failures++; }
  for (let y = 0; y < grid.length; y++) {
    if (grid[y].length !== width) { console.log(`FAIL: row ${y} length ${grid[y].length} != width ${width}`); failures++; }
  }

  const check = (label, tx, ty) => {
    if (tx < 0 || ty < 0 || tx >= width || ty >= height) { console.log(`FAIL: ${label} out of bounds (${tx},${ty})`); failures++; return; }
    const c = grid[ty][tx];
    if (c === '#') { console.log(`FAIL: ${label} spawns inside a wall at (${tx},${ty})`); failures++; }
  };

  check('player', m.playerStart.tx, m.playerStart.ty);
  m.teammates.forEach((t, i) => check(`teammate${i}`, t.tx, t.ty));
  m.suspects.forEach((s, i) => check(`suspect${i} (${s.name})`, s.tx, s.ty));
  (m.hostages || []).forEach((h, i) => check(`hostage${i} (${h.name})`, h.tx, h.ty));
  (m.civilians || []).forEach((c, i) => check(`civilian${i}`, c.tx, c.ty));
  (m.evidence || []).forEach((e, i) => check(`evidence${i}`, e.tx, e.ty));
  m.suspects.forEach((s, i) => (s.patrol || []).forEach((p, j) => check(`suspect${i} patrol${j}`, p.tx, p.ty)));

  for (let ty = 0; ty < height; ty++) {
    for (let tx = 0; tx < width; tx++) {
      if (grid[ty][tx] !== 'D') continue;
      const horizontalSupports = Number(grid[ty]?.[tx - 1] === '#') + Number(grid[ty]?.[tx + 1] === '#');
      const verticalSupports = Number(grid[ty - 1]?.[tx] === '#') + Number(grid[ty + 1]?.[tx] === '#');
      if (horizontalSupports === 0 && verticalSupports === 0) {
        console.log(`FAIL: door at (${tx},${ty}) has no supporting wall`); failures++;
        continue;
      }
      const horizontal = horizontalSupports >= verticalSupports;
      const passages = horizontal
        ? [[tx, ty - 1], [tx, ty + 1]]
        : [[tx - 1, ty], [tx + 1, ty]];
      if (passages.some(([x, y]) => grid[y]?.[x] === '#')) {
        console.log(`FAIL: door at (${tx},${ty}) opens into a wall`); failures++;
      }
    }
  }

  for (const [i, prop] of (m.props || []).entries()) {
    const x0 = prop.x0 ?? prop.tx, y0 = prop.y0 ?? prop.ty;
    const x1 = prop.x1 ?? prop.tx, y1 = prop.y1 ?? prop.ty;
    if ([x0, y0, x1, y1].some((v) => !Number.isInteger(v)) || x0 < 0 || y0 < 0 || x1 >= width || y1 >= height) {
      console.log(`FAIL: prop${i} (${prop.type}) has an invalid footprint`); failures++;
      continue;
    }
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (grid[y][x] !== '#') { console.log(`FAIL: prop${i} (${prop.type}) is missing collision at (${x},${y})`); failures++; }
      }
    }
  }

  const reachable = floodFill(grid, width, height, m.playerStart.tx, m.playerStart.ty);
  const checkReach = (label, tx, ty) => {
    if (!reachable.has(`${tx},${ty}`)) { console.log(`FAIL: ${label} NOT REACHABLE from player start`); failures++; }
  };
  m.teammates.forEach((t, i) => checkReach(`teammate${i}`, t.tx, t.ty));
  m.suspects.forEach((s, i) => checkReach(`suspect${i} (${s.name})`, s.tx, s.ty));
  (m.hostages || []).forEach((h, i) => checkReach(`hostage${i} (${h.name})`, h.tx, h.ty));
  (m.civilians || []).forEach((c, i) => checkReach(`civilian${i}`, c.tx, c.ty));
  (m.evidence || []).forEach((e, i) => checkReach(`evidence${i}`, e.tx, e.ty));

  console.log(`OK: ${width}x${height}, ${m.suspects.length} suspects, ${(m.hostages||[]).length} hostages, ${(m.civilians||[]).length} civilians, reachable tiles=${reachable.size}`);
}

[QUICKPLAY_MISSION, ...CAREER_MISSIONS].forEach(checkMission);

console.log(failures === 0 ? '\nALL MAPS VALID' : `\n${failures} FAILURES FOUND`);
process.exit(failures === 0 ? 0 : 1);
