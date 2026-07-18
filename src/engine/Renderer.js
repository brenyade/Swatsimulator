const TILE = 32;

function drawEntityBody(ctx, x, y, radius, facing, fill, stroke) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = stroke || '#000';
  ctx.stroke();
  // facing indicator
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(facing) * (radius + 7), y + Math.sin(facing) * (radius + 7));
  ctx.strokeStyle = stroke || '#fff';
  ctx.lineWidth = 3;
  ctx.stroke();
}

function healthArc(ctx, x, y, radius, hp, maxHp) {
  if (hp >= maxHp) return;
  const pct = Math.max(0, hp / maxHp);
  ctx.beginPath();
  ctx.arc(x, y, radius + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
  ctx.strokeStyle = pct > 0.5 ? '#3ddc84' : pct > 0.25 ? '#ffb703' : '#e63946';
  ctx.lineWidth = 3;
  ctx.stroke();
}

export function render(ctx, mission, extra = {}) {
  const { map, offsetX, offsetY } = mission;
  ctx.save();
  ctx.fillStyle = '#050705';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.translate(offsetX, offsetY);

  // --- tiles ---
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const c = map.grid[y][x];
      const px = x * TILE, py = y * TILE;
      if (c === '#') {
        ctx.fillStyle = '#2a322b';
        ctx.fillRect(px, py, TILE, TILE);
        ctx.strokeStyle = '#181d18';
        ctx.strokeRect(px, py, TILE, TILE);
      } else {
        ctx.fillStyle = ((x + y) % 2 === 0) ? '#1c2118' : '#1a1f17';
        ctx.fillRect(px, py, TILE, TILE);
        if (c === 'D') {
          const open = map.openDoors.has(`${x},${y}`);
          ctx.fillStyle = open ? 'rgba(120,160,120,0.25)' : '#8a5a2b';
          ctx.fillRect(px + 3, py + 3, TILE - 6, TILE - 6);
        }
      }
    }
  }

  // --- evidence markers ---
  for (const e of mission.evidencePoints) {
    if (e.collected) continue;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(-7, -7, 14, 14);
    ctx.restore();
  }

  // --- move-to marker ---
  if (extra.marker) {
    ctx.beginPath();
    ctx.arc(extra.marker.x, extra.marker.y, 12, 0, Math.PI * 2);
    ctx.strokeStyle = '#3ddc84';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(extra.marker.x - 16, extra.marker.y);
    ctx.lineTo(extra.marker.x + 16, extra.marker.y);
    ctx.moveTo(extra.marker.x, extra.marker.y - 16);
    ctx.lineTo(extra.marker.x, extra.marker.y + 16);
    ctx.stroke();
  }

  // --- civilians ---
  for (const c of mission.civilians) {
    if (!c.alive) continue;
    const color = c.state === 'panic' ? '#e0a458' : '#5fb46a';
    drawEntityBody(ctx, c.x, c.y, c.radius, c.facing, color, '#0e130e');
  }

  // --- hostages ---
  for (const h of mission.hostages) {
    if (!h.alive) continue;
    const color = h.state === 'freed' ? '#8fd6ff' : '#f2e94e';
    drawEntityBody(ctx, h.x, h.y, h.radius, h.facing, color, '#3a3400');
  }

  // --- suspects ---
  for (const s of mission.suspects) {
    if (!s.alive) continue;
    let color = '#8a8a8a';
    if (s.state === 'alert') color = '#e8b84b';
    else if (s.state === 'hostile') color = '#e63946';
    else if (s.state === 'surrendering') color = '#f2e94e';
    else if (s.state === 'arrested') color = '#555';
    drawEntityBody(ctx, s.x, s.y, s.radius, s.facing, color, s.elite ? '#ffffff' : '#1a0e0e');
    healthArc(ctx, s.x, s.y, s.radius, s.hp, s.maxHp);
    if (s.elite) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('★', s.x, s.y - s.radius - 8);
    }
  }

  // --- teammates ---
  for (const t of mission.teammates) {
    if (!t.alive) continue;
    drawEntityBody(ctx, t.x, t.y, t.radius, t.facing, '#3ddcd0', '#052a27');
    healthArc(ctx, t.x, t.y, t.radius, t.hp, t.maxHp);
  }

  // --- player ---
  const p = mission.player;
  if (p.alive) {
    drawEntityBody(ctx, p.x, p.y, p.radius, p.facing, '#4d8dff', '#001238');
    healthArc(ctx, p.x, p.y, p.radius, p.hp, p.maxHp);
  }

  // --- tracers ---
  for (const t of mission.tracers) {
    ctx.beginPath();
    ctx.moveTo(t.x0, t.y0);
    ctx.lineTo(t.x1, t.y1);
    ctx.strokeStyle = `rgba(255, 231, 145, ${1 - t.age / 0.08})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // --- flashbang effects ---
  for (const fx of mission.effects) {
    if (fx.type === 'flashbang-fly') {
      const t = Math.min(1, fx.age / fx.duration);
      const x = fx.x + (fx.tx - fx.x) * t, y = fx.y + (fx.ty - fx.y) * t;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ddd';
      ctx.fill();
    } else if (fx.type === 'flashbang-blast') {
      const t = fx.age / fx.duration;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, fx.radius * Math.min(1, t * 2), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${0.6 * (1 - t)})`;
      ctx.fill();
    }
  }

  ctx.restore();

  // full-screen white flash if player themself is stunned (screen-space, not world)
  if (mission.player.isStunned) {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(0.85, mission.player.stunTimer / 3)})`;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }
}
