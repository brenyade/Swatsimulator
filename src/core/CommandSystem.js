import { dist, hasLineOfSight, worldToTile } from '../engine/utils.js';
import { playArrest } from './Audio.js';

const COMMAND_RANGE = 260;

export function commandFollow(mission) {
  for (const t of mission.teammates) if (t.alive) t.setOrder('follow');
  mission.banner('TEAM: FOLLOW ME');
}

export function commandHold(mission) {
  for (const t of mission.teammates) if (t.alive) t.setOrder('hold');
  mission.banner('TEAM: HOLD POSITION');
}

export function commandMoveTo(mission, worldPoint) {
  for (const t of mission.teammates) if (t.alive) t.setOrder('moveto', worldPoint);
  mission.banner('TEAM: MOVING TO MARKER');
}

// Finds the nearest door tile to the player (within interact-ish range) and
// sends the first available teammate to breach & clear it.
export function commandBreach(mission) {
  const player = mission.player;
  const door = findNearestDoor(mission, player.x, player.y, 140);
  if (!door) { mission.banner('NO DOOR NEARBY'); return; }
  const free = mission.teammates.find(t => t.alive);
  if (!free) return;
  free.setOrder('breach', door, mission);
  mission.banner('TEAM: BREACH & CLEAR');
}

export function findNearestDoor(mission, x, y, maxDist) {
  const map = mission.map;
  let best = null, bestD = Infinity;
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      if (map.grid[ty][tx] !== 'D') continue;
      if (mission.map.openDoors.has(`${tx},${ty}`)) continue;
      const wx = tx * 32 + 16, wy = ty * 32 + 16;
      const d = dist(x, y, wx, wy);
      if (d < maxDist && d < bestD) { bestD = d; best = { tx, ty, worldX: wx, worldY: wy }; }
    }
  }
  return best;
}

// "Freeze! SWAT!" — attempts to force nearby suspects to surrender.
export function orderSurrender(mission) {
  const player = mission.player;
  let affected = 0;
  for (const s of mission.suspects) {
    if (!s.alive) continue;
    if (s.state !== 'alert' && s.state !== 'hostile' && s.state !== 'idle') continue;
    const d = dist(player.x, player.y, s.x, s.y);
    if (d > COMMAND_RANGE) continue;
    if (!hasLineOfSight(mission.map, player.x, player.y, s.x, s.y)) continue;
    affected++;
    if (s.state === 'idle') {
      s.state = 'alert';
      s.target = player;
      s.alertTimer = 0.9;
      continue;
    }
    const bonus = s.state === 'alert' ? 0.3 : 0;
    if (!s.armed || Math.random() < s.willSurrender + bonus) {
      s.state = 'surrendering';
      s.target = null;
    }
  }
  mission.banner(affected > 0 ? 'POLICE! FREEZE! SWAT!' : 'FREEZE! SWAT!');
}

// E — context interact: arrest a surrendering suspect or free an adjacent hostage
// or open a closed door directly in front of the player.
export function contextInteract(mission) {
  const player = mission.player;
  const INTERACT_RANGE = 40;

  for (const s of mission.suspects) {
    if (s.alive && s.state === 'surrendering' && dist(player.x, player.y, s.x, s.y) < INTERACT_RANGE) {
      s.state = 'arrested';
      mission.onSuspectArrested?.(s);
      mission.banner('SUSPECT IN CUSTODY');
      playArrest();
      return;
    }
  }
  for (const h of mission.hostages) {
    if (h.alive && h.state === 'held' && dist(player.x, player.y, h.x, h.y) < INTERACT_RANGE) {
      h.free(mission);
      mission.banner('HOSTAGE RESCUED');
      return;
    }
  }
  const door = findNearestDoor(mission, player.x, player.y, INTERACT_RANGE + 20);
  if (door) {
    mission.openDoor(door.tx, door.ty);
    mission.banner('DOOR OPENED');
  }
}
