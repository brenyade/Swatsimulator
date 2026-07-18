// Shared math / pathfinding / line-of-sight helpers used across the sim.

export const TILE = 32;

export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

export function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }

export function lerp(a, b, t) { return a + (b - a) * t; }

export function angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }

export function worldToTile(x, y) { return { tx: Math.floor(x / TILE), ty: Math.floor(y / TILE) }; }
export function tileToWorldCenter(tx, ty) { return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 }; }

// Simple seeded RNG so playthroughs can be reproduced if ever needed.
export function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return function rng() {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return (s >>> 0) / 4294967296;
  };
}

// Doors never block movement/pathfinding (characters push through as they
// walk) but DO block vision/bullets while closed — that's their entire
// tactical purpose. Pass forSight:true from LOS/combat code.
export function isSolidTile(map, tx, ty, { forSight = false } = {}) {
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return true;
  const c = map.grid[ty][tx];
  if (c === '#') return true;
  if (c === 'D' && forSight && !map.openDoors?.has(`${tx},${ty}`)) return true;
  return false;
}

// Bresenham line-of-sight check between two world points. Closed doors block.
export function hasLineOfSight(map, x0, y0, x1, y1) {
  const t0 = worldToTile(x0, y0), t1 = worldToTile(x1, y1);
  let x = t0.tx, y = t0.ty;
  const dx = Math.abs(t1.tx - x), dy = -Math.abs(t1.ty - y);
  const sx = x < t1.tx ? 1 : -1, sy = y < t1.ty ? 1 : -1;
  let err = dx + dy;
  let guard = 0;
  while (true) {
    if (!(x === t0.tx && y === t0.ty) && isSolidTile(map, x, y, { forSight: true })) {
      return false;
    }
    if (x === t1.tx && y === t1.ty) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
    if (++guard > 4000) break;
  }
  return true;
}

// --- A* pathfinding over the tile grid, returns array of {x,y} world-space waypoints ---
export function findPath(map, startX, startY, goalX, goalY) {
  const start = worldToTile(startX, startY);
  const goal = worldToTile(goalX, goalY);
  if (isSolidTile(map, goal.tx, goal.ty)) return [];

  const key = (x, y) => `${x},${y}`;
  const open = new Map();
  const openList = [{ x: start.tx, y: start.ty, g: 0, f: 0 }];
  open.set(key(start.tx, start.ty), true);
  const cameFrom = new Map();
  const gScore = new Map([[key(start.tx, start.ty), 0]]);
  const closed = new Set();

  const heuristic = (x, y) => Math.abs(x - goal.tx) + Math.abs(y - goal.ty);
  let iterations = 0;

  while (openList.length > 0 && iterations++ < 3000) {
    openList.sort((a, b) => a.f - b.f);
    const current = openList.shift();
    const ck = key(current.x, current.y);
    open.delete(ck);
    if (current.x === goal.tx && current.y === goal.ty) {
      const path = [];
      let curKey = ck;
      while (cameFrom.has(curKey)) {
        const [cx, cy] = curKey.split(',').map(Number);
        path.push(tileToWorldCenter(cx, cy));
        curKey = cameFrom.get(curKey);
      }
      path.reverse();
      return path;
    }
    closed.add(ck);
    const neighbors = [
      { x: current.x + 1, y: current.y }, { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 }, { x: current.x, y: current.y - 1 },
      { x: current.x + 1, y: current.y + 1 }, { x: current.x - 1, y: current.y - 1 },
      { x: current.x + 1, y: current.y - 1 }, { x: current.x - 1, y: current.y + 1 },
    ];
    for (const n of neighbors) {
      if (isSolidTile(map, n.x, n.y)) continue;
      // prevent cutting corners diagonally through walls
      const diagonal = n.x !== current.x && n.y !== current.y;
      if (diagonal) {
        if (isSolidTile(map, current.x, n.y) || isSolidTile(map, n.x, current.y)) continue;
      }
      const nk = key(n.x, n.y);
      if (closed.has(nk)) continue;
      const cost = diagonal ? 1.4142 : 1;
      const tentativeG = current.g + cost;
      if (!gScore.has(nk) || tentativeG < gScore.get(nk)) {
        cameFrom.set(nk, ck);
        gScore.set(nk, tentativeG);
        const f = tentativeG + heuristic(n.x, n.y);
        if (!open.has(nk)) {
          openList.push({ x: n.x, y: n.y, g: tentativeG, f });
          open.set(nk, true);
        }
      }
    }
  }
  return []; // no path found
}

export function circlesOverlap(ax, ay, ar, bx, by, br) {
  return dist(ax, ay, bx, by) < ar + br;
}
