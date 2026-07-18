import { isSolidTile, worldToTile } from '../engine/utils.js';

// Marches a ray in small steps, stopping at the first wall or living entity.
function marchRay(map, actors, ox, oy, angle, range, ignoreIds) {
  const stepSize = 6;
  let x = ox, y = oy;
  const dx = Math.cos(angle) * stepSize, dy = Math.sin(angle) * stepSize;
  const steps = Math.ceil(range / stepSize);
  for (let i = 0; i < steps; i++) {
    x += dx; y += dy;
    const { tx, ty } = worldToTile(x, y);
    if (isSolidTile(map, tx, ty, { forSight: true })) {
      return { hitWall: true, x, y };
    }
    for (const a of actors) {
      if (!a.alive || ignoreIds.has(a.id)) continue;
      if (Math.hypot(a.x - x, a.y - y) <= a.radius) {
        return { hitEntity: a, x, y };
      }
    }
  }
  return { x, y };
}

// Fires one shot (or a shotgun spread of pellets) from `shooter` toward `angle`.
// Returns tracer segments [{x0,y0,x1,y1}] for rendering.
export function fireShot({ shooter, weapon, angle, mission, ignoreIds }) {
  const pelletCount = weapon.pellets || 1;
  const tracers = [];
  for (let p = 0; p < pelletCount; p++) {
    const spreadAngle = angle + (Math.random() - 0.5) * weapon.spread * 2;
    const res = marchRay(mission.map, mission.allActors(), shooter.x, shooter.y, spreadAngle, weapon.range, ignoreIds);
    if (res.hitEntity) {
      if (weapon.stuns) {
        res.hitEntity.stun?.(2.75);
        mission.onNonLethalHit?.(shooter, res.hitEntity);
      } else {
        res.hitEntity.takeDamage(weapon.damage);
        mission.onHit?.(shooter, res.hitEntity, weapon.damage);
      }
    }
    tracers.push({ x0: shooter.x, y0: shooter.y, x1: res.x, y1: res.y });
  }
  return tracers;
}

export function hasClearShot(map, actors, ox, oy, tx, ty, ignoreIds) {
  const angle = Math.atan2(ty - oy, tx - ox);
  const range = Math.hypot(tx - ox, ty - oy);
  const res = marchRay(map, actors, ox, oy, angle, range, ignoreIds);
  return !res.hitWall && (!res.hitEntity || Math.hypot(res.x - tx, res.y - ty) < 14);
}
