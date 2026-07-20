import * as THREE from '../vendor/three.module.js';

// A custom designated-marksman rifle, hand-built from primitives (no GLB
// asset matches this silhouette): long ported barrel, raised scope with
// twin turrets, M-LOK-style handguard, curved magazine, skeletonized stock.
// Built with the muzzle pointing along +Z to match the native orientation
// of the vendored blaster-kit models, so callers can treat it as a drop-in
// weapon (same external rotation.y = PI/2 applied by Renderer3D).

const STEEL = () => new THREE.MeshStandardMaterial({ color: 0x2b2d2c, roughness: 0.35, metalness: 0.65 });
const POLYMER = () => new THREE.MeshStandardMaterial({ color: 0x1c1e1c, roughness: 0.55, metalness: 0.25 });
const GLASS = () => new THREE.MeshStandardMaterial({ color: 0x0d1f14, roughness: 0.1, metalness: 0.3, emissive: 0x0a2a1a, emissiveIntensity: 0.3 });

function box(w, h, d, mat) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); }
function cyl(rTop, rBot, len, mat, segs = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, len, segs), mat);
  m.rotation.x = Math.PI / 2; // cylinders default to Y-axis; barrel runs along Z
  return m;
}

export function buildDMRRifle() {
  const group = new THREE.Group();
  const steel = STEEL(), polymer = POLYMER(), glass = GLASS();

  // --- receiver (the spine everything else attaches to) ---
  const receiver = box(0.045, 0.06, 0.18, steel);
  receiver.position.set(0, 0, 0);
  group.add(receiver);

  // --- barrel + handguard, forward of the receiver ---
  const barrel = cyl(0.011, 0.011, 0.4, steel);
  barrel.position.set(0, 0.005, 0.09 + 0.2);
  group.add(barrel);

  const handguard = box(0.05, 0.05, 0.24, polymer);
  handguard.position.set(0, 0.005, 0.09 + 0.12);
  group.add(handguard);
  // M-LOK style slot cutouts (cosmetic dark insets)
  for (let i = 0; i < 4; i++) {
    const slot = box(0.052, 0.01, 0.025, new THREE.MeshStandardMaterial({ color: 0x050505 }));
    slot.position.set(0, 0.026, 0.03 + i * 0.05);
    group.add(slot);
  }

  const muzzle = cyl(0.017, 0.014, 0.06, steel, 10);
  muzzle.position.set(0, 0.005, 0.09 + 0.4 - 0.01);
  group.add(muzzle);
  for (let i = 0; i < 3; i++) {
    const port = box(0.03, 0.006, 0.006, new THREE.MeshStandardMaterial({ color: 0x050505 }));
    port.position.set(0, 0.017, 0.09 + 0.4 - 0.045 + i * 0.014);
    group.add(port);
  }

  // folded bipod hinted at under the handguard
  for (const side of [-1, 1]) {
    const leg = box(0.012, 0.09, 0.014, steel);
    leg.position.set(side * 0.02, -0.05, 0.09 + 0.18);
    leg.rotation.x = 0.15 * side;
    group.add(leg);
  }

  // --- raised scope assembly ---
  const mountFront = box(0.02, 0.03, 0.02, steel);
  mountFront.position.set(0, 0.075, 0.06);
  group.add(mountFront);
  const mountRear = box(0.02, 0.03, 0.02, steel);
  mountRear.position.set(0, 0.075, -0.02);
  group.add(mountRear);
  const rail = box(0.024, 0.012, 0.16, steel);
  rail.position.set(0, 0.062, 0.02);
  group.add(rail);

  const scopeTube = cyl(0.02, 0.02, 0.22, steel, 14);
  scopeTube.position.set(0, 0.1, 0.03);
  group.add(scopeTube);
  const objective = cyl(0.026, 0.026, 0.045, steel, 14);
  objective.position.set(0, 0.1, 0.03 + 0.11 + 0.02);
  group.add(objective);
  const ocular = cyl(0.024, 0.028, 0.05, steel, 14);
  ocular.position.set(0, 0.1, 0.03 - 0.11 - 0.02);
  group.add(ocular);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.024, 14), glass);
  lens.position.set(0, 0.1, 0.03 + 0.11 + 0.043);
  group.add(lens);
  for (const side of [-1, 1]) {
    const turret = cyl(0.012, 0.012, 0.025, polymer, 8);
    turret.rotation.x = 0;
    turret.rotation.z = Math.PI / 2;
    turret.position.set(side === 1 ? 0.03 : 0, 0.1 + (side === -1 ? 0.03 : 0), 0.03);
    group.add(turret);
  }

  // --- pistol grip ---
  const grip = box(0.03, 0.09, 0.035, polymer);
  grip.position.set(0, -0.06, -0.075);
  grip.rotation.x = -0.2;
  group.add(grip);
  const trigguard = box(0.012, 0.03, 0.05, steel);
  trigguard.position.set(0, -0.02, -0.06);
  group.add(trigguard);

  // --- curved magazine (approximated with two angled segments) ---
  const magUpper = box(0.028, 0.09, 0.04, polymer);
  magUpper.position.set(0, -0.08, -0.02);
  magUpper.rotation.x = -0.12;
  group.add(magUpper);
  const magLower = box(0.026, 0.07, 0.036, polymer);
  magLower.position.set(0, -0.145, -0.045);
  magLower.rotation.x = -0.42;
  group.add(magLower);
  for (let i = 0; i < 4; i++) {
    const rib = box(0.03, 0.006, 0.042, new THREE.MeshStandardMaterial({ color: 0x111111 }));
    rib.position.set(0, -0.05 - i * 0.022, -0.015 - i * 0.008);
    rib.rotation.x = -0.2;
    group.add(rib);
  }

  // --- skeletonized stock ---
  const stockTop = box(0.03, 0.018, 0.22, polymer);
  stockTop.position.set(0, 0.02, -0.15 - 0.09);
  group.add(stockTop);
  const stockBottom = box(0.03, 0.018, 0.2, polymer);
  stockBottom.position.set(0, -0.03, -0.15 - 0.08);
  group.add(stockBottom);
  const cheekRiser = box(0.024, 0.02, 0.09, polymer);
  cheekRiser.position.set(0, 0.045, -0.15 - 0.06);
  group.add(cheekRiser);
  for (let i = 0; i < 2; i++) {
    const strut = box(0.026, 0.045, 0.014, polymer);
    strut.position.set(0, -0.005, -0.15 - 0.04 - i * 0.14);
    group.add(strut);
  }
  const buttpad = box(0.036, 0.07, 0.02, new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }));
  buttpad.position.set(0, -0.005, -0.15 - 0.09 - 0.11);
  group.add(buttpad);

  group.userData.isProcedural = true;
  return group;
}
