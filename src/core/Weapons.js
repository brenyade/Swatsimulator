// Weapon & equipment definitions shared by player and AI.

export const WEAPONS = {
  m9: {
    id: 'm9', name: 'M9 PISTOL', lethal: true,
    damage: 22, fireDelay: 0.28, range: 380, spread: 0.03,
    magSize: 15, reserveMax: 45, reloadTime: 1.4,
  },
  mp5: {
    id: 'mp5', name: 'MP5 SUBMACHINE GUN', lethal: true,
    damage: 16, fireDelay: 0.11, range: 460, spread: 0.05,
    magSize: 30, reserveMax: 90, reloadTime: 1.8,
  },
  shotgun: {
    id: 'shotgun', name: '12GA BREACHING SHOTGUN', lethal: true,
    damage: 12, pellets: 6, fireDelay: 0.7, range: 220, spread: 0.14,
    magSize: 8, reserveMax: 24, reloadTime: 2.2,
  },
  dmr: {
    id: 'dmr', name: 'DMR-762 MARKSMAN RIFLE', lethal: true,
    damage: 42, fireDelay: 0.5, range: 620, spread: 0.012,
    magSize: 10, reserveMax: 40, reloadTime: 2.1,
  },
  taser: {
    id: 'taser', name: 'X26 TASER', lethal: false,
    damage: 0, fireDelay: 1.1, range: 180, spread: 0.01,
    magSize: 1, reserveMax: 4, reloadTime: 1.6, stuns: true,
  },
  pepperball: {
    id: 'pepperball', name: 'PEPPERBALL LAUNCHER', lethal: false,
    damage: 4, fireDelay: 0.5, range: 200, spread: 0.08,
    magSize: 10, reserveMax: 30, reloadTime: 1.6, stuns: true,
  },
};

export const EQUIPMENT = {
  flashbang: { id: 'flashbang', name: 'FLASHBANG', maxCount: 3, radius: 150, stunTime: 5.5 },
  breach: { id: 'breach', name: 'DYNAMIC ENTRY', desc: 'Open + flashbang a door in one motion.' },
};

export function freshAmmoState(weaponId) {
  const w = WEAPONS[weaponId];
  return { mag: w.magSize, reserve: w.reserveMax, reloading: false, reloadT: 0, cooldown: 0 };
}
