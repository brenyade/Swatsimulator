import {
  newGrid, room, door, rectTiles,
} from './builder.js';

function finalizeGrid(grid) {
  return { width: grid[0].length, height: grid.length, grid };
}

// ============================================================
// QUICK DEPLOYMENT — used by "PLAY NOW". Standalone, not part of career.
// ============================================================
function buildQuickPlay() {
  const g = newGrid(20, 13);
  room(g, 1, 1, 18, 11);              // main open floor
  room(g, 5, 3, 6, 4, '#');           // shelf
  room(g, 12, 3, 13, 5, '#');         // shelf
  room(g, 8, 7, 10, 7, '#');          // counter
  door(g, 9, 1);                     // unused flourish door on back wall (storage nook)
  room(g, 8, 0, 11, 0, '#');          // keep border solid (safety)

  return {
    id: 'quickplay',
    name: 'Riverside Pawn Shop',
    isQuickPlay: true,
    ...finalizeGrid(g),
    playerStart: { tx: 2, ty: 11 },
    teammates: [{ tx: 2, ty: 10 }, { tx: 3, ty: 11 }],
    suspects: [
      { tx: 14, ty: 4, armed: true, willSurrender: 0.55, name: 'ARMED SUSPECT', guarding: 0 },
      { tx: 16, ty: 9, armed: false, willSurrender: 0.95, name: 'ACCOMPLICE' },
    ],
    hostages: [{ tx: 15, ty: 3, name: 'SHOP OWNER' }],
    civilians: [{ tx: 4, ty: 9, wanderRadius: 50 }],
    objectives: [
      { id: 'neutralize', text: 'Neutralize all suspects' },
      { id: 'hostage', text: 'Rescue the hostage' },
    ],
    timeLimit: 300,
    loadout: { lethal: 'mp5', nonlethal: 'taser' },
    briefing: `QUICK DEPLOYMENT\n\nDispatch reports an armed robbery in progress at a Riverside pawn shop. At least one suspect is armed and a hostage is being held near the back counter. Move in, neutralize the threat, and bring everyone out alive.\n\nThis is a standalone training deployment and does not affect your Career save.`,
  };
}

// ============================================================
// MISSION 1 — Convenience Store Robbery
// ============================================================
function buildMission1() {
  const g = newGrid(18, 12);
  room(g, 1, 1, 11, 10);              // main store floor
  room(g, 13, 3, 16, 8);              // back office
  door(g, 12, 6);                     // office door

  // shelves / obstacles
  room(g, 3, 4, 3, 7, '#');
  room(g, 7, 3, 7, 6, '#');
  room(g, 9, 8, 10, 8, '#');

  return {
    id: 'm1',
    name: 'Convenience Store Robbery',
    ...finalizeGrid(g),
    playerStart: { tx: 2, ty: 10 },
    teammates: [{ tx: 2, ty: 9 }, { tx: 3, ty: 10 }],
    suspects: [
      { tx: 10, ty: 3, armed: true, willSurrender: 0.5, name: 'DESPERATE ROBBER', guarding: 0 },
    ],
    hostages: [{ tx: 10, ty: 2, name: 'STORE CLERK' }],
    civilians: [{ tx: 5, ty: 9, wanderRadius: 40 }, { tx: 9, ty: 5, wanderRadius: 40 }],
    objectives: [
      { id: 'neutralize', text: 'Neutralize the armed suspect' },
      { id: 'hostage', text: 'Rescue the store clerk' },
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
  const g = newGrid(22, 15);
  room(g, 1, 1, 8, 6);                 // living room
  room(g, 10, 1, 20, 6);               // kitchen / lab room
  room(g, 1, 8, 8, 13);                // bedroom
  room(g, 10, 8, 20, 13);              // second bedroom / lab annex
  room(g, 9, 3, 9, 4, '.'); door(g, 9, 3);   // corridor connector living<->kitchen (upper)
  room(g, 9, 10, 9, 11, '.'); door(g, 9, 10); // connector bedroom<->annex
  room(g, 4, 7, 5, 7, '.'); door(g, 4, 7);    // living -> bedroom
  room(g, 14, 7, 15, 7, '.'); door(g, 14, 7); // kitchen -> annex

  // furniture obstacles
  room(g, 3, 2, 4, 3, '#');
  room(g, 13, 2, 15, 3, '#');
  room(g, 3, 10, 4, 11, '#');
  room(g, 16, 9, 17, 10, '#');

  return {
    id: 'm2',
    name: 'Meth Lab Apartment Bust',
    ...finalizeGrid(g),
    playerStart: { tx: 2, ty: 5 },
    teammates: [{ tx: 2, ty: 4 }, { tx: 3, ty: 5 }],
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
  const g = newGrid(26, 16);
  room(g, 1, 1, 24, 7);                // main lobby
  room(g, 1, 9, 10, 14);               // manager offices
  room(g, 13, 9, 24, 14);              // vault antechamber
  room(g, 5, 8, 6, 8, '.'); door(g, 5, 8);
  room(g, 18, 8, 19, 8, '.'); door(g, 18, 8);
  room(g, 20, 10, 23, 12);             // vault room
  room(g, 19, 11, 19, 11, '.'); door(g, 19, 11);

  // teller counters / cover
  room(g, 6, 3, 18, 3, '#');
  room(g, 6, 5, 18, 5, '#');
  room(g, 3, 11, 4, 12, '#');
  room(g, 15, 10, 16, 11, '#');

  return {
    id: 'm3',
    name: 'Bank Heist In Progress',
    ...finalizeGrid(g),
    playerStart: { tx: 2, ty: 6 },
    teammates: [{ tx: 2, ty: 5 }, { tx: 3, ty: 6 }],
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
  const g = newGrid(28, 18);
  room(g, 1, 1, 26, 16);               // one big warehouse floor
  // crate stacks as cover / maze structure
  const crateRects = [
    [4, 3, 6, 5], [9, 2, 11, 3], [14, 4, 17, 6], [20, 2, 22, 5],
    [3, 9, 5, 12], [8, 8, 8, 13], [12, 10, 15, 12], [18, 9, 20, 13],
    [23, 8, 25, 11], [10, 14, 12, 15],
  ];
  for (const [x0, y0, x1, y1] of crateRects) room(g, x0, y0, x1, y1, '#');
  const crateProps = crateRects.flatMap(([x0, y0, x1, y1]) => rectTiles(x0, y0, x1, y1));

  // office (mini-boss room) partitioned in far corner
  room(g, 21, 13, 26, 16, '#');
  room(g, 22, 13, 25, 15, '.');
  room(g, 21, 14, 21, 14, '.'); door(g, 21, 14);

  return {
    id: 'm4',
    name: 'Warehouse Gang Stronghold',
    ...finalizeGrid(g),
    props: crateProps.map((t) => ({ ...t, type: 'crate' })),
    playerStart: { tx: 2, ty: 16 },
    teammates: [{ tx: 2, ty: 15 }, { tx: 3, ty: 16 }],
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
  const g = newGrid(28, 20);
  room(g, 1, 1, 12, 8);                // west open-plan office
  room(g, 15, 1, 26, 8);               // east open-plan office
  room(g, 1, 10, 12, 18);              // conference wing
  room(g, 15, 10, 26, 18);             // executive suite (finale room)
  room(g, 13, 4, 14, 5, '.'); door(g, 13, 4);     // west<->east upper corridor
  room(g, 13, 13, 14, 14, '.'); door(g, 13, 13);  // west<->east lower corridor
  room(g, 6, 8, 7, 9, '.'); door(g, 6, 8);        // west upper->lower
  room(g, 19, 8, 20, 9, '.'); door(g, 19, 8);     // east upper->lower

  // cubicles / desks
  room(g, 3, 3, 5, 3, '#');
  room(g, 8, 2, 10, 2, '#');
  room(g, 3, 6, 4, 6, '#');
  room(g, 18, 3, 20, 3, '#');
  room(g, 22, 5, 24, 6, '#');
  room(g, 3, 12, 5, 13, '#');
  room(g, 8, 15, 10, 16, '#');
  // executive suite dividers
  room(g, 18, 12, 19, 15, '#');
  room(g, 22, 13, 23, 16, '#');

  return {
    id: 'm5',
    name: 'The Skyscraper Siege',
    ...finalizeGrid(g),
    playerStart: { tx: 2, ty: 17 },
    teammates: [{ tx: 2, ty: 16 }, { tx: 3, ty: 17 }],
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
    timeLimit: 540,
    loadout: { lethal: 'mp5', nonlethal: 'pepperball' },
    briefing: `THE FINAL CALL\n\nDominic Cross has taken the top floor of the Metro Financial Tower, along with a city councilwoman and building security. He's made no demands — every indication says he intends this to end in blood, his or someone else's.\n\nHis remaining Vipers are spread across the floor. Cross himself is holed up in the executive suite with the hostages, and he will not surrender easily. This is the operation your whole tour has led to. Move as a team, clear methodically, and bring the hostages home.\n\nMetro City is watching this one. Let's finish it clean.`,
    debriefWin: `The tower is secure. Both hostages walked out on their own feet, and Dominic Cross is in federal custody awaiting trial. Metro City's mayor personally thanked Team 5 at a press conference the next morning.\n\nYou didn't just close a case — you shut down the Vipers' entire city operation. Captain Alvarez has one word for your file: exemplary.`,
  };
}

export const QUICKPLAY_MISSION = buildQuickPlay();

export const CAREER_MISSIONS = [
  buildMission1(),
  buildMission2(),
  buildMission3(),
  buildMission4(),
  buildMission5(),
];

export function getCareerMission(index) { return CAREER_MISSIONS[index]; }
