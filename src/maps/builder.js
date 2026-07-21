// Procedural grid builder. Building maps with numeric rectangles instead of
// hand-typed ASCII avoids the classic "row is one character short" bug and
// makes it trivial to verify connectivity in tests.

export function newGrid(w, h) {
  return Array.from({ length: h }, () => Array(w).fill('#'));
}

export function room(grid, x0, y0, x1, y1, ch = '.') {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (grid[y] && grid[y][x] !== undefined) grid[y][x] = ch;
    }
  }
}

export function hall(grid, x0, y0, x1, y1) { room(grid, x0, y0, x1, y1, '.'); }

export function door(grid, x, y) { grid[y][x] = 'D'; }

// Reserves a rectangular collision footprint while preserving what the
// obstacle actually represents for the 3D renderer (shelf, desk, sofa, etc.).
export function blockingProp(grid, x0, y0, x1, y1, type, options = {}) {
  room(grid, x0, y0, x1, y1, '#');
  return { type, x0, y0, x1, y1, ...options };
}

// All tile coordinates within a rectangle — handy for turning an obstacle
// rect into a list of decorative prop positions (one per tile).
export function rectTiles(x0, y0, x1, y1) {
  const tiles = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) tiles.push({ tx: x, ty: y });
  }
  return tiles;
}

export function tile(tx, ty) { return { x: tx * 32 + 16, y: ty * 32 + 16 }; }
