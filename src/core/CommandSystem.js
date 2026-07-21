import { dist, hasLineOfSight, worldToTile } from '../engine/utils.js';
import { playArrest } from './Audio.js';

const COMMAND_RANGE = 260;

export function commandFollow(mission) {
  mission.entryPlan = null;
  for (const t of mission.teammates) if (t.alive) t.setOrder('follow');
  mission.banner('TEAM: FOLLOW ME');
}

export function commandHold(mission) {
  mission.entryPlan = null;
  for (const t of mission.teammates) if (t.alive) t.setOrder('hold');
  mission.banner('TEAM: HOLD POSITION');
}

export function commandMoveTo(mission, worldPoint) {
  mission.entryPlan = null;
  for (const t of mission.teammates) if (t.alive) t.setOrder('moveto', worldPoint);
  mission.banner('TEAM: MOVING TO MARKER');
}

// Releases the team to independently clear the building room by room,
// engaging any hostiles they encounter along the way without further orders.
export function commandAutonomous(mission) {
  mission.entryPlan = null;
  for (const t of mission.teammates) if (t.alive) t.setOrder('autonomous');
  mission.banner('TEAM: AUTONOMOUS — CLEARING');
}

// Finds the nearest door tile to the player (within interact-ish range) and
// sends the first available teammate to breach & clear it.
export function commandBreach(mission) {
  const player = mission.player;
  const activePlan = mission.entryPlan;
  const door = activePlan?.door || findNearestDoor(mission, player.x, player.y, 140);
  if (!door) { mission.banner('NO DOOR NEARBY'); return; }
  const team = mission.teammates.filter((t) => t.alive);
  if (!team.length) return;

  if (activePlan) {
    const ready = team.every((t) => dist(t.x, t.y, t.stackPoint?.x ?? t.x, t.stackPoint?.y ?? t.y) < 22);
    if (!ready) { mission.banner('TEAM: STACK NOT READY'); return; }
    mission.entryPlan.phase = 'executing';
    team[0].setOrder('breach', door, mission);
    for (const t of team.slice(1)) t.setOrder('entry', door, mission);
    mission.banner('TEAM: EXECUTE, EXECUTE');
    return;
  }

  const tileDoor = mission.doorTiles.find((candidate) => candidate.tx === door.tx && candidate.ty === door.ty);
  let forward;
  let tangent;
  if (tileDoor?.axis === 'x') {
    forward = { x: 0, y: Math.sign(door.worldY - player.y) || 1 };
    tangent = { x: 1, y: 0 };
  } else {
    forward = { x: Math.sign(door.worldX - player.x) || 1, y: 0 };
    tangent = { x: 0, y: 1 };
  }
  const plannedDoor = {
    ...door,
    forwardX: forward.x,
    forwardY: forward.y,
    entryX: door.worldX + forward.x * 46,
    entryY: door.worldY + forward.y * 46,
  };
  mission.entryPlan = { door: plannedDoor, phase: 'stacking' };
  team.forEach((t, i) => {
    const lateral = (i - (team.length - 1) / 2) * 24;
    const point = {
      x: door.worldX - forward.x * 42 + tangent.x * lateral,
      y: door.worldY - forward.y * 42 + tangent.y * lateral,
    };
    t.setOrder('stack', { point, door: plannedDoor }, mission);
  });
  mission.banner('TEAM: STACK ON THE DOOR');
}

export function findNearestDoor(mission, x, y, maxDist) {
  const map = mission.map;
  let best = null, bestD = Infinity;
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      if (map.grid[ty][tx] !== 'D') continue;
      if (mission.map.openDoors.has(`${tx},${ty}`) || mission.map.openingDoors?.has(`${tx},${ty}`)) continue;
      const wx = tx * 32 + 16, wy = ty * 32 + 16;
      const d = dist(x, y, wx, wy);
      if (d < maxDist && d < bestD) { bestD = d; best = { tx, ty, worldX: wx, worldY: wy }; }
    }
  }
  return best;
}

export function getContextAction(mission) {
  const { player } = mission;
  const range = 46;
  if (mission.suspects.some((s) => s.alive && s.state === 'surrendering' && dist(player.x, player.y, s.x, s.y) < range)) {
    return 'F  RESTRAIN SUSPECT';
  }
  if (mission.hostages.some((h) => h.alive && h.state === 'held' && dist(player.x, player.y, h.x, h.y) < range)) {
    return 'F  RESCUE HOSTAGE';
  }
  if (mission.evidencePoints.some((e) => !e.collected && dist(player.x, player.y, e.x, e.y) < range)) {
    return 'F  SECURE EVIDENCE';
  }
  if (findNearestDoor(mission, player.x, player.y, 60)) return 'F  OPEN DOOR   ·   B  BREACH';
  return '';
}

// "Freeze! SWAT!" — attempts to force nearby suspects to surrender.
export function orderSurrender(mission) {
  const player = mission.player;
  let affected = 0;
  let surrendered = 0;
  for (const s of mission.suspects) {
    if (!s.alive) continue;
    if (s.state !== 'alert' && s.state !== 'hostile' && s.state !== 'idle') continue;
    const d = dist(player.x, player.y, s.x, s.y);
    if (d > COMMAND_RANGE) continue;
    const targetAngle = Math.atan2(s.y - player.y, s.x - player.x);
    let angleDiff = Math.abs(targetAngle - player.facing);
    if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;
    if (angleDiff > Math.PI * 0.42) continue;
    if (!hasLineOfSight(mission.map, player.x, player.y, s.x, s.y)) continue;
    affected++;
    const nearbyOfficers = [player, ...mission.teammates]
      .filter((officer) => officer.alive && dist(officer.x, officer.y, s.x, s.y) < 170).length;
    const pressure = 0.22
      + (s.state === 'idle' ? 0.16 : s.state === 'alert' ? 0.08 : 0)
      + Math.min(0.12, nearbyOfficers * 0.04)
      + (s.isStunned ? 0.24 : 0);
    if (s.receiveCommand?.(pressure, mission)) surrendered++;
  }
  mission.markLoudEvent(player.x, player.y);
  mission.banner(affected === 0 ? 'NO CONTACT IN YOUR SECTOR' : surrendered > 0 ? 'SUSPECT COMPLYING' : 'POLICE! SHOW ME YOUR HANDS!');
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
