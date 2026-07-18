export function drawMapPreview(canvas, def) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const scale = Math.min(canvas.width / (def.width * 32), canvas.height / (def.height * 32));
  const offX = (canvas.width - def.width * 32 * scale) / 2;
  const offY = (canvas.height - def.height * 32 * scale) / 2;

  for (let y = 0; y < def.height; y++) {
    for (let x = 0; x < def.width; x++) {
      const c = def.grid[y][x];
      ctx.fillStyle = c === '#' ? '#2a322b' : c === 'D' ? '#8a5a2b' : '#1c2118';
      ctx.fillRect(offX + x * 32 * scale, offY + y * 32 * scale, 32 * scale + 0.6, 32 * scale + 0.6);
    }
  }

  const dot = (tx, ty, color, r = 3.2) => {
    ctx.beginPath();
    ctx.arc(offX + (tx * 32 + 16) * scale, offY + (ty * 32 + 16) * scale, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  };

  for (const s of def.suspects) dot(s.tx, s.ty, s.elite ? '#ffffff' : '#e63946', s.elite ? 4.5 : 3.2);
  for (const h of def.hostages || []) dot(h.tx, h.ty, '#f2e94e');
  for (const e of def.evidence || []) dot(e.tx, e.ty, '#ffd166');
  dot(def.playerStart.tx, def.playerStart.ty, '#4d8dff', 4);
}
