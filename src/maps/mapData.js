import {
  newGrid, room, door, rectTiles, blockingProp,
} from './builder.js';

function finalizeGrid(grid) {
  return { width: grid[0].length, height: grid.length, grid };
}

const ENVIRONMENTS = {
  suburban: { sky: 0x526779, fog: 0x526779, fogDensity: 0.014, wall: 0x4b5148, door: 0x51463b, frame: 0xd4d0c5, hemiSky: 0xc5d8e8, hemiGround: 0x32422e, sunIntensity: 0.9 },
  retail: { sky: 0x242b31, fog: 0x242b31, fogDensity: 0.018, wall: 0x6c7067, door: 0x3a4146, frame: 0xd7d9d4, hemiSky: 0xdbe6e8, hemiGround: 0x272b25, hemiIntensity: 1.7 },
  apartment: { sky: 0x3b3430, fog: 0x3b3430, fogDensity: 0.024, wall: 0x51483f, door: 0x493a31, frame: 0xb9afa3, hemiSky: 0xd7c4af, hemiGround: 0x29241f, sun: 0xffd3a3, sunIntensity: 0.58 },
  bank: { sky: 0x4f5962, fog: 0x4f5962, fogDensity: 0.017, wall: 0x5a6267, door: 0x30383f, frame: 0xdfe3e5, hemiSky: 0xdce8f0, hemiGround: 0x34373a, sunIntensity: 0.88 },
  warehouse: { sky: 0x29343a, fog: 0x29343a, fogDensity: 0.026, wall: 0x3e4748, wallMetalness: 0.12, door: 0x252c30, frame: 0x8e9698, hemiSky: 0x9db7c2, hemiGround: 0x262d28, hemiIntensity: 1.45 },
  tower: { sky: 0x202c3b, fog: 0x202c3b, fogDensity: 0.016, wall: 0x464e59, door: 0x252b35, frame: 0xc4cbd4, hemiSky: 0xb8d4ed, hemiGround: 0x272b31, sun: 0xb9d9ff, sunIntensity: 0.78 },
  docks: { sky: 0x304454, fog: 0x304454, fogDensity: 0.018, wall: 0x52636b, wallMetalness: 0.16, wallRoughness: 0.7, door: 0x34444c, frame: 0xaab9bf, hemiSky: 0xb7d9e8, hemiGround: 0x3a4038, hemiIntensity: 2.2, sun: 0xd0eaff, sunIntensity: 1.1 },
};

// ============================================================
// QUICK DEPLOYMENT — used by "PLAY NOW". Standalone, not part of career.
// ============================================================
function buildQuickPlay() {
  const g = newGrid(34, 24);

  // outdoor playable space: front yard, backyard, street, and driveway
  room(g, 1, 1, 32, 22);

  // main house shell and attached garage shell
  room(g, 9, 4, 25, 19, '#');
  room(g, 25, 12, 31, 19, '#');

  // interior rooms
  room(g, 10, 5, 15, 10);     // living room
  room(g, 17, 5, 18, 18);     // foyer / central hallway
  room(g, 20, 5, 24, 10);     // kitchen / dining
  room(g, 10, 12, 15, 15);    // home office
  room(g, 10, 17, 15, 18);    // bathroom / laundry
  room(g, 20, 12, 24, 18);    // master bedroom
  room(g, 26, 13, 30, 18);    // attached garage

  // entry points and interior doors
  door(g, 17, 19);            // front door
  door(g, 12, 4);             // rear patio door (living room)
  door(g, 22, 4);             // rear kitchen door
  door(g, 28, 19);            // garage roll-up / entry door
  door(g, 16, 8);             // living -> hall
  door(g, 19, 8);             // kitchen -> hall
  door(g, 16, 14);            // office -> hall
  door(g, 16, 17);            // bathroom/laundry -> hall
  door(g, 19, 14);            // master -> hall
  door(g, 25, 15);            // interior garage door

  // Furniture keeps its collision footprint but renders as a recognizable
  // room object instead of another full-height wall block.
  const props = [
    blockingProp(g, 11, 6, 12, 7, 'sofa'),
    blockingProp(g, 13, 9, 14, 9, 'counter'),
    blockingProp(g, 21, 6, 22, 6, 'counter'),
    blockingProp(g, 22, 8, 23, 8, 'counter'),
    blockingProp(g, 11, 13, 12, 14, 'desk'),
    blockingProp(g, 21, 13, 22, 14, 'bed'),
    blockingProp(g, 11, 17, 12, 17, 'locker'),
    blockingProp(g, 27, 14, 29, 14, 'workbench'),
  ];

  return {
    id: 'quickplay-house',
    name: 'Copper Cove House Raid',
    environment: ENVIRONMENTS.suburban,
    isQuickPlay: true,
    ...finalizeGrid(g),
    props,
    playerStart: { tx: 17, ty: 22 },
    teammates: [{ tx: 16, ty: 22 }, { tx: 18, ty: 22 }],
    suspects: [
      { tx: 13, ty: 8, armed: true, willSurrender: 0.45, name: 'LIVING ROOM GUNMAN', guarding: 0, weaponId: 'm9' },
      { tx: 22, ty: 16, armed: true, willSurrender: 0.25, name: 'BEDROOM SUSPECT', weaponId: 'mp5' },
      { tx: 28, ty: 16, armed: false, willSurrender: 0.9, name: 'LOOKOUT', patrol: [{ tx: 28, ty: 16 }, { tx: 27, ty: 18 }] },
    ],
    hostages: [{ tx: 13, ty: 15, name: 'HOMEOWNER' }],
    civilians: [{ tx: 23, ty: 6, wanderRadius: 40 }],
    objectives: [
      { id: 'neutralize', text: 'Neutralize or arrest every suspect in the residence' },
      { id: 'hostage', text: 'Rescue the homeowner' },
    ],
    surfaces: [
      { x0: 1, y0: 1, x1: 32, y1: 22, type: 'grass', outdoor: true },
      { x0: 13, y0: 20, x1: 19, y1: 22, type: 'walkway', outdoor: true },
      { x0: 25, y0: 20, x1: 31, y1: 22, type: 'driveway', outdoor: true },
      { x0: 16, y0: 19, x1: 18, y1: 19, type: 'porch', outdoor: true },
      { x0: 27, y0: 19, x1: 29, y1: 19, type: 'porch', outdoor: true },
      { x0: 10, y0: 5, x1: 15, y1: 10, type: 'hardwood', outdoor: false },
      { x0: 17, y0: 5, x1: 18, y1: 18, type: 'hardwood', outdoor: false },
      { x0: 20, y0: 5, x1: 24, y1: 10, type: 'tile', outdoor: false },
      { x0: 10, y0: 12, x1: 15, y1: 15, type: 'carpet', outdoor: false },
      { x0: 10, y0: 17, x1: 15, y1: 18, type: 'tile', outdoor: false },
      { x0: 20, y0: 12, x1: 24, y1: 18, type: 'carpet', outdoor: false },
      { x0: 26, y0: 13, x1: 30, y1: 18, type: 'concrete', outdoor: false },
    ],
    timeLimit: 360,
    loadout: { lethal: 'm9', nonlethal: 'taser' },
    briefing: 
`QUICK DEPLOYMENT

Patrol units have contained a barricaded suspect situation at a detached suburban home in Copper Cove. Neighbors report multiple armed occupants, and one resident is believed to still be inside. You are deploying from the curb with a full exterior approach, multiple breach points, and authority to make dynamic entry.

Start outside, choose your door, and clear the house room by room. The front entry, rear patio doors, and attached garage are all viable access points. Keep your stack tight and get the homeowner out alive.`,
  };
}

// ============================================================
// MISSION 1 — Convenience Store Robbery
// ============================================================
function buildMission1() {
  const g = newGrid(20, 15);
  room(g, 1, 1, 11, 10);              // main store floor
  room(g, 13, 3, 16, 8);              // back office
  door(g, 12, 6);                     // office door
  room(g, 1, 12, 18, 13);             // parking-lot staging
  door(g, 5, 11);                     // front storefront entry
  room(g, 18, 6, 18, 13);             // side service approach
  door(g, 17, 6);                     // rear office entry

  const props = [
    blockingProp(g, 3, 4, 3, 7, 'shelf'),
    blockingProp(g, 7, 3, 7, 6, 'shelf'),
    blockingProp(g, 9, 8, 10, 8, 'counter'),
  ];

  return {
    id: 'm1',
    name: 'Convenience Store Robbery',
    environment: ENVIRONMENTS.retail,
    ...finalizeGrid(g),
    props,
    playerStart: { tx: 5, ty: 13 },
    teammates: [{ tx: 4, ty: 13 }, { tx: 6, ty: 13 }],
    suspects: [
      { tx: 10, ty: 3, armed: true, willSurrender: 0.5, name: 'DESPERATE ROBBER', guarding: 0 },
    ],
    hostages: [{ tx: 10, ty: 2, name: 'STORE CLERK' }],
    civilians: [{ tx: 5, ty: 9, wanderRadius: 40 }, { tx: 9, ty: 5, wanderRadius: 40 }],
    objectives: [
      { id: 'neutralize', text: 'Neutralize the armed suspect' },
      { id: 'hostage', text: 'Rescue the store clerk' },
    ],
    surfaces: [
      { x0: 1, y0: 12, x1: 18, y1: 13, type: 'asphalt', outdoor: true },
      { x0: 18, y0: 6, x1: 18, y1: 11, type: 'walkway', outdoor: true },
      { x0: 1, y0: 1, x1: 11, y1: 10, type: 'tile', outdoor: false },
      { x0: 13, y0: 3, x1: 16, y1: 8, type: 'carpet', outdoor: false },
    ],
    timeLimit: 300,
    loadout: { lethal: 'm9', nonlethal: 'taser' },
    briefing: `METRO CITY — NIGHT SHIFT, WEEK ONE\n\nWelcome to Metro SWAT, rookie. Dispatch has a 211 in progress — armed robbery, corner convenience store on 5th. The suspect is reportedly panicked and has a clerk held at the register. He's fired no shots yet.\n\nThis is your first live deployment. Move slow, clear your corners, and remember: a suspect who surrenders is a suspect who goes home to a courtroom instead of a morgue. Use your voice before you use your weapon. Your team follows your lead — issue orders and keep them alive.\n\nGet the clerk out. Bring the suspect in. Welcome to the team.`,
    debriefWin: `The clerk was escorted out through the front entrance, shaken but unharmed. Command logged this as a clean textbook stop for a rookie's first callout — Captain Alvarez wants to see how you handle something bigger.`,
  };
}

// ============================================================
// MISSION 2 — Meth Lab Apartment Bust
// ============================================================
function buildMission2() {
  const g = newGrid(22, 17);
  room(g, 1, 1, 8, 6);                 // living room
  room(g, 10, 1, 20, 6);               // kitchen / lab room
  room(g, 1, 8, 8, 13);                // bedroom
  room(g, 10, 8, 20, 13);              // second bedroom / lab annex
  room(g, 9, 3, 9, 4, '.'); door(g, 9, 3);   // corridor connector living<->kitchen (upper)
  room(g, 9, 10, 9, 11, '.'); door(g, 9, 10); // connector bedroom<->annex
  room(g, 4, 7, 5, 7, '.'); door(g, 4, 7);    // living -> bedroom
  room(g, 14, 7, 15, 7, '.'); door(g, 14, 7); // kitchen -> annex
  room(g, 1, 15, 20, 15);               // apartment corridor staging
  door(g, 4, 14);                        // bedroom-side entry
  door(g, 14, 14);                       // lab-annex entry

  const props = [
    blockingProp(g, 3, 2, 4, 3, 'sofa'),
    blockingProp(g, 13, 2, 15, 3, 'lab'),
    blockingProp(g, 3, 10, 4, 11, 'bed'),
    blockingProp(g, 16, 9, 17, 10, 'lab'),
  ];

  return {
    id: 'm2',
    name: 'Meth Lab Apartment Bust',
    environment: ENVIRONMENTS.apartment,
    ...finalizeGrid(g),
    props,
    playerStart: { tx: 9, ty: 15 },
    teammates: [{ tx: 8, ty: 15 }, { tx: 10, ty: 15 }],
    suspects: [
      { tx: 16, ty: 3, armed: true, willSurrender: 0.35, name: 'COOK', weaponId: 'm9' },
      { tx: 12, ty: 11, armed: false, willSurrender: 0.9, name: 'ADDICT', patrol: [{ tx: 12, ty: 11 }, { tx: 15, ty: 11 }] },
      { tx: 6, ty: 11, armed: true, willSurrender: 0.5, name: 'LOOKOUT', patrol: [{ tx: 6, ty: 11 }, { tx: 6, ty: 9 }] },
    ],
    hostages: [],
    civilians: [{ tx: 2, ty: 2, wanderRadius: 50 }],
    objectives: [
      { id: 'neutralize', text: 'Neutralize all suspects' },
      { id: 'evidence', text: 'Secure the drug lab evidence' },
    ],
    evidence: [{ tx: 18, ty: 3 }],
    surfaces: [
      { x0: 1, y0: 15, x1: 20, y1: 15, type: 'tile', outdoor: false },
      { x0: 1, y0: 1, x1: 8, y1: 6, type: 'carpet', outdoor: false },
      { x0: 10, y0: 1, x1: 20, y1: 6, type: 'linoleum', outdoor: false },
      { x0: 1, y0: 8, x1: 8, y1: 13, type: 'hardwood', outdoor: false },
      { x0: 10, y0: 8, x1: 20, y1: 13, type: 'concrete', outdoor: false },
    ],
    timeLimit: 360,
    loadout: { lethal: 'mp5', nonlethal: 'taser' },
    briefing: `TWO WEEKS LATER\n\nYou've earned your place on Team 5's entry stack. Narcotics has a warrant for a suspected meth lab running out of a two-bedroom apartment. Expect at least two armed occupants and volatile chemicals — no stray rounds near the kitchen.\n\nYou're cleared for the MP5 this time. Stack on the door, call your breaches, and clear this apartment room by room. Command wants the lab evidence intact for the DA.`,
    debriefWin: `The apartment is secure and the lab evidence has been logged into custody. Narcotics division sends their thanks — this bust ties directly into a much larger supplier network operating out of the industrial district.`,
  };
}

// ============================================================
// MISSION 3 — Bank Heist In Progress
// ============================================================
function buildMission3() {
  const g = newGrid(26, 19);
  room(g, 1, 1, 24, 7);                // main lobby
  room(g, 1, 9, 10, 14);               // manager offices
  room(g, 13, 9, 24, 14);              // vault antechamber
  door(g, 5, 8);
  door(g, 18, 8);
  room(g, 19, 9, 24, 13, '#');         // vault shell
  room(g, 20, 10, 23, 12);             // vault room
  door(g, 19, 11);
  room(g, 1, 16, 24, 17);              // street / rear approach
  door(g, 5, 15);                      // manager-wing entry
  door(g, 18, 15);                     // vault-wing entry

  const props = [
    blockingProp(g, 6, 3, 18, 3, 'teller'),
    blockingProp(g, 6, 5, 18, 5, 'counter'),
    blockingProp(g, 3, 11, 4, 12, 'desk'),
    blockingProp(g, 15, 10, 16, 11, 'locker'),
  ];

  return {
    id: 'm3',
    name: 'Bank Heist In Progress',
    environment: ENVIRONMENTS.bank,
    ...finalizeGrid(g),
    props,
    playerStart: { tx: 12, ty: 17 },
    teammates: [{ tx: 11, ty: 17 }, { tx: 13, ty: 17 }],
    suspects: [
      { tx: 12, ty: 2, armed: true, willSurrender: 0.2, name: 'CREW LEADER', weaponId: 'mp5' },
      { tx: 8, ty: 4, armed: true, willSurrender: 0.45, name: 'GETAWAY MAN', patrol: [{ tx: 8, ty: 4 }, { tx: 16, ty: 4 }] },
      { tx: 21, ty: 11, armed: true, willSurrender: 0.3, name: 'SAFECRACKER' },
    ],
    hostages: [{ tx: 9, ty: 2, name: 'BANK TELLER' }, { tx: 15, ty: 2, name: 'CUSTOMER' }],
    civilians: [{ tx: 2, ty: 9, wanderRadius: 40 }],
    objectives: [
      { id: 'neutralize', text: 'Neutralize all suspects' },
      { id: 'hostage', text: 'Rescue both hostages' },
      { id: 'evidence', text: 'Secure the vault cash evidence' },
    ],
    evidence: [{ tx: 21, ty: 11 }],
    surfaces: [
      { x0: 1, y0: 16, x1: 24, y1: 17, type: 'asphalt', outdoor: true },
      { x0: 1, y0: 1, x1: 24, y1: 7, type: 'tile', outdoor: false },
      { x0: 1, y0: 9, x1: 10, y1: 14, type: 'carpet', outdoor: false },
      { x0: 13, y0: 9, x1: 24, y1: 14, type: 'tile', outdoor: false },
    ],
    timeLimit: 420,
    loadout: { lethal: 'mp5', nonlethal: 'pepperball' },
    briefing: `ONE MONTH INTO THE TOUR\n\nA three-man crew hit First Metro Bank during business hours. Two hostages are confirmed in the lobby, and a third suspect is reportedly working the vault. This crew came prepared — expect submachine guns and a leader who won't go down easy.\n\nYou're issued a pepperball launcher this run for softer options against the less committed members of the crew. Clear the lobby, free the hostages, and push toward the vault. Watch your cross-fire — civilians and hostages share this floor with armed suspects.`,
    debriefWin: `Both hostages are safe and the recovered cash has been logged as evidence. Forensics traced the crew's equipment back to a supplier known to work with an organization calling themselves "the Vipers." Command wants that thread pulled.`,
  };
}

// ============================================================
// MISSION 4 — Warehouse Gang Stronghold (The Vipers)
// ============================================================
function buildMission4() {
  const g = newGrid(28, 21);
  room(g, 1, 1, 26, 16);               // one big warehouse floor
  // crate stacks as cover / maze structure
  const crateRects = [
    [4, 3, 6, 5], [9, 2, 11, 3], [14, 4, 17, 6], [20, 2, 22, 5],
    [3, 9, 5, 12], [8, 8, 8, 13], [12, 10, 15, 12], [18, 9, 20, 13],
    [23, 8, 25, 11], [10, 14, 12, 15],
  ];
  for (const [x0, y0, x1, y1] of crateRects) room(g, x0, y0, x1, y1, '#');
  const crateProps = crateRects.flatMap(([x0, y0, x1, y1], i) => (
    i % 3 === 0
      ? [{ type: 'palletRack', x0, y0, x1, y1 }]
      : rectTiles(x0, y0, x1, y1).map((t) => ({ ...t, type: 'crate' }))
  ));

  // office (mini-boss room) partitioned in far corner
  room(g, 21, 13, 26, 16, '#');
  room(g, 22, 13, 25, 15, '.');
  room(g, 21, 14, 21, 14, '.'); door(g, 21, 14);
  room(g, 1, 18, 26, 19);              // loading apron staging
  door(g, 6, 17);                      // west loading entry
  door(g, 16, 17);                     // central loading entry

  return {
    id: 'm4',
    name: 'Warehouse Gang Stronghold',
    environment: ENVIRONMENTS.warehouse,
    ...finalizeGrid(g),
    props: crateProps,
    playerStart: { tx: 11, ty: 19 },
    teammates: [{ tx: 10, ty: 19 }, { tx: 12, ty: 19 }],
    suspects: [
      { tx: 10, ty: 1, armed: true, willSurrender: 0.3, name: 'VIPER RUNNER', patrol: [{ tx: 6, ty: 1 }, { tx: 22, ty: 1 }] },
      { tx: 6, ty: 11, armed: true, willSurrender: 0.35, name: 'VIPER SOLDIER' },
      { tx: 17, ty: 13, armed: true, willSurrender: 0.3, name: 'VIPER SOLDIER' },
      { tx: 23, ty: 14, armed: true, willSurrender: 0.15, elite: true, name: 'VIPER ENFORCER', weaponId: 'mp5' },
    ],
    hostages: [{ tx: 24, ty: 14, name: 'KIDNAPPED INFORMANT' }],
    civilians: [],
    objectives: [
      { id: 'neutralize', text: 'Neutralize all Viper gang members' },
      { id: 'hostage', text: 'Rescue the informant' },
      { id: 'evidence', text: 'Secure the weapons cache' },
    ],
    evidence: [{ tx: 9, ty: 6 }],
    surfaces: [
      { x0: 1, y0: 18, x1: 26, y1: 19, type: 'asphalt', outdoor: true },
      { x0: 1, y0: 1, x1: 26, y1: 16, type: 'concrete', outdoor: false },
      { x0: 22, y0: 13, x1: 25, y1: 15, type: 'linoleum', outdoor: false },
    ],
    timeLimit: 480,
    loadout: { lethal: 'mp5', nonlethal: 'taser' },
    briefing: `THE VIPERS\n\nEvidence from the bank job led here — a riverfront warehouse controlled by a gang calling themselves the Vipers. Intel confirms an informant is being held inside after trying to feed information to your unit, along with a stockpile of illegal weapons.\n\nThe warehouse floor is wide open and stacked with crates — plenty of cover for the gang, plenty of ambush angles for you. Expect an enforcer holding the back office who won't be interested in a peaceful outcome. Get in, get the informant out, and take that weapons cache off the street.`,
    debriefWin: `The informant is safe and the weapons cache is in an evidence locker downtown. Under questioning, the Viper enforcer let slip a name that changes everything: Dominic Cross — the man believed to run the entire operation — is holed up in the old Metro Financial Tower with hostages of his own. Command is authorizing a full tactical response.`,
  };
}

// ============================================================
// MISSION 5 — Finale: The Skyscraper Siege
// ============================================================
function buildMission5() {
  const g = newGrid(28, 23);
  room(g, 1, 1, 12, 8);                // west open-plan office
  room(g, 15, 1, 26, 8);               // east open-plan office
  room(g, 1, 10, 12, 18);              // conference wing
  room(g, 15, 10, 26, 18);             // executive suite (finale room)
  room(g, 13, 4, 14, 4, '.'); door(g, 13, 4);     // west<->east upper corridor
  room(g, 13, 13, 14, 13, '.'); door(g, 13, 13);  // west<->east lower corridor
  door(g, 6, 9);                                   // west upper->lower
  door(g, 19, 9);                                  // east upper->lower

  // cubicles / desks
  const props = [
    blockingProp(g, 3, 3, 5, 3, 'cubicle'),
    blockingProp(g, 8, 2, 10, 2, 'cubicle'),
    blockingProp(g, 3, 6, 4, 6, 'desk'),
    blockingProp(g, 18, 3, 20, 3, 'cubicle'),
    blockingProp(g, 22, 5, 24, 6, 'conference'),
    blockingProp(g, 3, 12, 5, 13, 'conference'),
    blockingProp(g, 8, 15, 10, 16, 'cubicle'),
  ];
  // executive suite dividers
  room(g, 18, 12, 19, 15, '#');
  room(g, 22, 13, 23, 16, '#');
  room(g, 1, 20, 26, 21);              // elevator / stair staging lobby
  door(g, 6, 19);                      // west stair entry
  door(g, 19, 19);                     // east elevator entry

  return {
    id: 'm5',
    name: 'The Skyscraper Siege',
    environment: ENVIRONMENTS.tower,
    ...finalizeGrid(g),
    props,
    playerStart: { tx: 13, ty: 21 },
    teammates: [{ tx: 12, ty: 21 }, { tx: 14, ty: 21 }],
    suspects: [
      { tx: 5, ty: 4, armed: true, willSurrender: 0.35, name: 'VIPER GUNMAN', patrol: [{ tx: 5, ty: 4 }, { tx: 10, ty: 6 }] },
      { tx: 20, ty: 4, armed: true, willSurrender: 0.3, name: 'VIPER GUNMAN', patrol: [{ tx: 20, ty: 4 }, { tx: 24, ty: 4 }] },
      { tx: 5, ty: 14, armed: true, willSurrender: 0.35, name: 'VIPER GUNMAN' },
      { tx: 25, ty: 17, armed: true, willSurrender: 0.4, name: 'VIPER GUNMAN', guarding: 1 },
      {
        tx: 21, ty: 14, armed: true, willSurrender: 0.08, elite: true, weaponId: 'mp5',
        name: 'DOMINIC CROSS', guarding: 0,
      },
    ],
    hostages: [{ tx: 20, ty: 15, name: 'CITY COUNCILWOMAN' }, { tx: 24, ty: 16, name: 'SECURITY GUARD' }],
    civilians: [{ tx: 4, ty: 4, wanderRadius: 40 }, { tx: 21, ty: 3, wanderRadius: 40 }],
    objectives: [
      { id: 'neutralize', text: 'Neutralize Dominic Cross and his crew' },
      { id: 'hostage', text: 'Rescue both hostages' },
    ],
    surfaces: [
      { x0: 1, y0: 20, x1: 26, y1: 21, type: 'tile', outdoor: false },
      { x0: 1, y0: 1, x1: 12, y1: 8, type: 'carpet', outdoor: false },
      { x0: 15, y0: 1, x1: 26, y1: 8, type: 'carpet', outdoor: false },
      { x0: 1, y0: 10, x1: 12, y1: 18, type: 'hardwood', outdoor: false },
      { x0: 15, y0: 10, x1: 26, y1: 18, type: 'carpet', outdoor: false },
    ],
    timeLimit: 540,
    loadout: { lethal: 'mp5', nonlethal: 'pepperball' },
    briefing: `THE FINAL CALL\n\nDominic Cross has taken the top floor of the Metro Financial Tower, along with a city councilwoman and building security. He's made no demands — every indication says he intends this to end in blood, his or someone else's.\n\nHis remaining Vipers are spread across the floor. Cross himself is holed up in the executive suite with the hostages, and he will not surrender easily. This is the operation your whole tour has led to. Move as a team, clear methodically, and bring the hostages home.\n\nMetro City is watching this one. Let's finish it clean.`,
    debriefWin: `The tower is secure. Both hostages walked out on their own feet, and Dominic Cross is in federal custody awaiting trial. Metro City's mayor personally thanked Team 5 at a press conference the next morning.\n\nYou didn't just close a case — you shut down the Vipers' entire city operation. Captain Alvarez has one word for your file: exemplary.`,
  };
}

// ============================================================
// MISSION 6 — Operation Night Current
// ============================================================
function buildMission6() {
  const g = newGrid(32, 22);
  room(g, 1, 1, 30, 20); // open dockyard approach

  // Customs warehouse with three connected clearing zones.
  room(g, 3, 3, 18, 16, '#');
  room(g, 4, 4, 17, 9);                // freight sorting floor
  room(g, 4, 11, 9, 15);              // customs office
  room(g, 11, 11, 17, 15);            // evidence lockup
  door(g, 8, 16);                      // loading-bay entry
  door(g, 3, 7);                       // west service entry
  door(g, 18, 6);                      // east loading entry
  door(g, 6, 10);                      // sorting -> office
  door(g, 14, 10);                     // sorting -> lockup

  // Harbour-control building and interview room.
  room(g, 21, 4, 29, 15, '#');
  room(g, 22, 5, 28, 9);
  room(g, 22, 11, 28, 14);
  door(g, 21, 7);
  door(g, 25, 10);
  door(g, 25, 15);

  const crateRects = [
    [5, 5, 6, 6], [14, 7, 16, 8], [12, 12, 13, 13],
    [5, 18, 8, 19], [12, 18, 15, 19], [19, 17, 22, 18], [25, 2, 28, 3],
  ];
  for (const [x0, y0, x1, y1] of crateRects) room(g, x0, y0, x1, y1, '#');
  const crateProps = crateRects.flatMap(([x0, y0, x1, y1], i) => (
    i % 3 === 0
      ? [{ type: 'palletRack', x0, y0, x1, y1 }]
      : rectTiles(x0, y0, x1, y1).map((t) => ({ ...t, type: 'crate' }))
  ));
  const interiorProps = [
    blockingProp(g, 8, 12, 9, 12, 'desk'),
    blockingProp(g, 11, 11, 11, 12, 'locker'),
    blockingProp(g, 23, 6, 24, 6, 'counter'),
  ];

  return {
    id: 'm6',
    name: 'Operation Night Current',
    environment: ENVIRONMENTS.docks,
    ...finalizeGrid(g),
    props: [...crateProps, ...interiorProps],
    playerStart: { tx: 2, ty: 19 },
    teammates: [{ tx: 2, ty: 18 }, { tx: 3, ty: 19 }],
    suspects: [
      { tx: 12, ty: 2, armed: true, willSurrender: 0.35, morale: 0.62, name: 'DOCK LOOKOUT', patrol: [{ tx: 9, ty: 2 }, { tx: 20, ty: 2 }], weaponId: 'm4' },
      { tx: 12, ty: 6, armed: true, willSurrender: 0.25, morale: 0.74, name: 'FREIGHT GUNMAN', guarding: 0, weaponId: 'mp5' },
      { tx: 6, ty: 13, armed: false, runner: true, willSurrender: 0.78, morale: 0.28, name: 'SMUGGLING COURIER', fleeTo: { tx: 1, ty: 2 } },
      { tx: 16, ty: 14, armed: true, willSurrender: 0.28, morale: 0.7, name: 'LOCKUP GUARD', weaponId: 'm4' },
      { tx: 26, ty: 7, armed: true, willSurrender: 0.32, morale: 0.68, name: 'CONTROL-ROOM GUNMAN', weaponId: 'mp5' },
      { tx: 27, ty: 13, armed: true, willSurrender: 0.1, morale: 0.96, elite: true, name: 'MARA VOSS', guarding: 1, weaponId: 'm4' },
    ],
    hostages: [{ tx: 16, ty: 6, name: 'PORT INSPECTOR' }, { tx: 24, ty: 13, name: 'FEDERAL WITNESS' }],
    civilians: [{ tx: 2, ty: 5, name: 'NIGHT FOREMAN', wanderRadius: 55 }],
    objectives: [
      { id: 'neutralize', text: 'Arrest or neutralize Mara Voss and her crew' },
      { id: 'hostage', text: 'Rescue the port inspector and federal witness' },
      { id: 'evidence', text: 'Secure the shipping manifest and weapons ledger' },
    ],
    evidence: [{ tx: 15, ty: 13 }, { tx: 27, ty: 12 }],
    surfaces: [
      { x0: 1, y0: 1, x1: 30, y1: 20, type: 'asphalt', outdoor: true },
      { x0: 4, y0: 4, x1: 17, y1: 9, type: 'concrete', outdoor: false },
      { x0: 4, y0: 11, x1: 9, y1: 15, type: 'linoleum', outdoor: false },
      { x0: 11, y0: 11, x1: 17, y1: 15, type: 'concrete', outdoor: false },
      { x0: 22, y0: 5, x1: 28, y1: 14, type: 'metal', outdoor: false },
    ],
    timeLimit: 600,
    loadout: { lethal: 'm4', nonlethal: 'pepperball' },
    briefing: `AFTER THE VIPERS\n\nDominic Cross gave up the name behind the Vipers' supply chain: Mara Voss, a former private-security contractor moving rifles and witnesses through Pier 19. Port cameras went dark twenty minutes ago. A federal witness and a port inspector are now being held between the customs warehouse and harbour-control building.\n\nThe dockyard gives you three entry routes and long exterior sightlines, but stacked freight turns the warehouse into a close-quarters maze. Your new M4A1 offers reach outside; switch to pepperball indoors when compliance is possible. Recover both ledgers, rescue the hostages, and take Voss alive if you can.`,
    debriefWin: `Pier 19 is secure. The witness and inspector are safe, both ledgers are in federal custody, and Mara Voss can no longer hide behind shell companies and hired guns. The evidence opens a regional trafficking case—and Team 5 has become the unit other cities call when the stakes are highest.`,
  };
}

export const QUICKPLAY_MISSION = buildQuickPlay();

export const CAREER_MISSIONS = [
  buildMission1(),
  buildMission2(),
  buildMission3(),
  buildMission4(),
  buildMission5(),
  buildMission6(),
];

export function getCareerMission(index) { return CAREER_MISSIONS[index]; }
