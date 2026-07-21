// Weapon & equipment definitions shared by player and AI.

export const WEAPONS = {
  m9: {
    id: 'm9', name: 'EAGLE .50 PISTOL', lethal: true,
    damage: 36, fireDelay: 0.34, range: 420, spread: 0.026,
    magSize: 7, reserveMax: 28, reloadTime: 1.55,
  },
  mp5: {
    id: 'mp5', name: 'MP5 SUBMACHINE GUN', lethal: true,
    damage: 16, fireDelay: 0.11, range: 460, spread: 0.05,
    magSize: 30, reserveMax: 90, reloadTime: 1.8, automatic: true,
  },
  m4: {
    id: 'm4', name: 'M4A1 CARBINE', lethal: true,
    damage: 20, fireDelay: 0.095, range: 540, spread: 0.038,
    magSize: 30, reserveMax: 120, reloadTime: 2.0, automatic: true,
  },
  shotgun: {
    id: 'shotgun', name: '12GA BREACHING SHOTGUN', lethal: true,
    damage: 12, pellets: 6, fireDelay: 0.7, range: 220, spread: 0.14,
    magSize: 8, reserveMax: 24, reloadTime: 2.2,
  },
  taser: {
    id: 'taser', name: 'X26 TASER', lethal: false,
    damage: 0, fireDelay: 1.1, range: 180, spread: 0.01,
    magSize: 1, reserveMax: 4, reloadTime: 1.6, stuns: true,
  },
  pepperball: {
    id: 'pepperball', name: 'PEPPERBALL LAUNCHER', lethal: false,
    damage: 4, fireDelay: 0.5, range: 200, spread: 0.08,
    magSize: 10, reserveMax: 30, reloadTime: 1.6, stuns: true, automatic: true,
  },
};

export const EQUIPMENT = {
  flashbang: { id: 'flashbang', name: 'FLASHBANG', maxCount: 3, radius: 150, stunTime: 5.5 },
  breach: { id: 'breach', name: 'DYNAMIC ENTRY', desc: 'Kick or breach a closed door, or send a teammate to make entry and clear.' },
};

export function freshAmmoState(weaponId) {
  const w = WEAPONS[weaponId];
  return { mag: w.magSize, reserve: w.reserveMax, reloading: false, reloadT: 0, cooldown: 0 };
}
