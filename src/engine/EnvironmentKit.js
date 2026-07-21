import * as THREE from '../vendor/three.module.js';
import { mergeGeometries } from '../vendor/utils/BufferGeometryUtils.js';

// A compact architectural prop kit. Prototypes are cached and cloned so maps
// can contain substantial room detail without allocating duplicate geometry.
const cache = new Map();
const materials = {
  darkMetal: new THREE.MeshStandardMaterial({ color: 0x252b2e, metalness: 0.72, roughness: 0.34 }),
  lightMetal: new THREE.MeshStandardMaterial({ color: 0x727b7e, metalness: 0.68, roughness: 0.3 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x65482f, metalness: 0.03, roughness: 0.72 }),
  woodDark: new THREE.MeshStandardMaterial({ color: 0x35281f, metalness: 0.02, roughness: 0.78 }),
  laminate: new THREE.MeshStandardMaterial({ color: 0x9a9386, metalness: 0.04, roughness: 0.62 }),
  fabric: new THREE.MeshStandardMaterial({ color: 0x394a54, metalness: 0.01, roughness: 0.96 }),
  fabricLight: new THREE.MeshStandardMaterial({ color: 0x8c8f8a, metalness: 0.01, roughness: 0.94 }),
  plastic: new THREE.MeshStandardMaterial({ color: 0x24282a, metalness: 0.08, roughness: 0.58 }),
  white: new THREE.MeshStandardMaterial({ color: 0xd5d1c8, metalness: 0.02, roughness: 0.7 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x9fc5cc, metalness: 0.08, roughness: 0.14, transparent: true, opacity: 0.38 }),
  screen: new THREE.MeshStandardMaterial({ color: 0x18242a, emissive: 0x173b4d, emissiveIntensity: 0.75, roughness: 0.22 }),
  red: new THREE.MeshStandardMaterial({ color: 0x812d2a, metalness: 0.08, roughness: 0.65 }),
  blue: new THREE.MeshStandardMaterial({ color: 0x31556d, metalness: 0.08, roughness: 0.62 }),
  cardboard: new THREE.MeshStandardMaterial({ color: 0x8c6b43, metalness: 0.01, roughness: 0.94 }),
};

function addBox(root, size, position, material, rotation = null) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
  return mesh;
}

function addCylinder(root, radius, height, position, material, sides = 14) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, sides), material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
  return mesh;
}

function addLegs(root, width, depth, topY, material = materials.darkMetal) {
  const inset = 0.13;
  for (const x of [-width / 2 + inset, width / 2 - inset]) {
    for (const z of [-depth / 2 + inset, depth / 2 - inset]) {
      addBox(root, [0.07, topY, 0.07], [x, topY / 2, z], material);
    }
  }
}

function buildShelf(root, width, depth) {
  const h = 2.05;
  const d = Math.min(depth, 0.82);
  for (const x of [-width / 2 + 0.06, width / 2 - 0.06]) addBox(root, [0.09, h, 0.09], [x, h / 2, 0], materials.darkMetal);
  for (let i = 0; i < 5; i++) {
    const y = 0.12 + i * 0.44;
    addBox(root, [width, 0.07, d], [0, y, 0], materials.lightMetal);
    if (i < 4) {
      const count = Math.max(2, Math.floor(width / 0.35));
      for (let j = 0; j < count; j++) {
        const mat = (i + j) % 3 === 0 ? materials.red : (i + j) % 3 === 1 ? materials.blue : materials.cardboard;
        addBox(root, [Math.min(0.24, width / count * 0.72), 0.25, d * 0.55], [(-width / 2) + (j + 0.5) * width / count, y + 0.16, 0], mat);
      }
    }
  }
}

function buildCounter(root, width, depth, teller = false) {
  const d = Math.min(depth, 1.2);
  addBox(root, [width, 0.88, d], [0, 0.44, 0], materials.woodDark);
  addBox(root, [width + 0.08, 0.09, d + 0.12], [0, 0.93, 0], materials.laminate);
  if (teller) {
    for (const x of [-width / 2 + 0.05, width / 2 - 0.05]) addBox(root, [0.06, 1.05, 0.06], [x, 1.48, 0], materials.lightMetal);
    addBox(root, [width - 0.12, 0.68, 0.035], [0, 1.53, 0], materials.glass);
  } else {
    addBox(root, [0.38, 0.12, 0.28], [width * 0.22, 1.05, 0], materials.plastic);
    addBox(root, [0.32, 0.05, 0.18], [width * 0.22, 1.14, 0], materials.screen, [-0.25, 0, 0]);
  }
}

function buildDesk(root, width, depth, cubicle = false) {
  const d = Math.min(depth, 1.25);
  addLegs(root, width, d, 0.7);
  addBox(root, [width, 0.1, d], [0, 0.74, 0], materials.wood);
  addBox(root, [Math.min(0.62, width * 0.42), 0.42, 0.06], [0, 1.04, -d * 0.16], materials.screen);
  addBox(root, [0.08, 0.28, 0.08], [0, 0.86, -d * 0.16], materials.darkMetal);
  addBox(root, [Math.min(0.62, width * 0.42), 0.035, 0.2], [0, 0.82, d * 0.18], materials.plastic, [-0.05, 0, 0]);
  if (cubicle) {
    addBox(root, [width, 1.25, 0.07], [0, 0.75, -d / 2], materials.fabricLight);
    addBox(root, [0.07, 1.25, d], [-width / 2, 0.75, 0], materials.fabricLight);
  }
}

function buildSofa(root, width, depth) {
  const d = Math.min(depth, 1.15);
  addBox(root, [width, 0.32, d * 0.78], [0, 0.36, 0.08], materials.fabric);
  addBox(root, [width, 0.78, 0.24], [0, 0.73, -d / 2 + 0.12], materials.fabric);
  for (const x of [-width / 2 + 0.13, width / 2 - 0.13]) addBox(root, [0.26, 0.58, d], [x, 0.45, 0], materials.fabric);
  const cushions = Math.max(2, Math.round(width / 0.75));
  for (let i = 0; i < cushions; i++) addBox(root, [width / cushions - 0.05, 0.12, d * 0.62], [(-width / 2) + (i + 0.5) * width / cushions, 0.58, 0.07], materials.fabricLight);
}

function buildBed(root, width, depth) {
  addBox(root, [width, 0.26, depth,], [0, 0.25, 0], materials.woodDark);
  addBox(root, [width - 0.12, 0.3, depth - 0.14], [0, 0.49, 0.02], materials.white);
  addBox(root, [width, 1.0, 0.13], [0, 0.72, -depth / 2 + 0.06], materials.wood);
  addBox(root, [width * 0.72, 0.16, depth * 0.26], [0, 0.72, -depth * 0.25], materials.fabricLight);
}

function buildLabBench(root, width, depth) {
  const d = Math.min(depth, 1.15);
  addBox(root, [width, 0.72, d], [0, 0.36, 0], materials.white);
  addBox(root, [width + 0.05, 0.08, d + 0.05], [0, 0.76, 0], materials.lightMetal);
  const count = Math.max(3, Math.floor(width / 0.4));
  for (let i = 0; i < count; i++) {
    const x = -width / 2 + (i + 0.5) * width / count;
    addCylinder(root, 0.07 + (i % 2) * 0.025, 0.25 + (i % 3) * 0.06, [x, 0.93, 0], i % 2 ? materials.glass : materials.red, 12);
  }
  addBox(root, [width * 0.55, 0.38, 0.08], [0, 1.28, -d / 2 + 0.05], materials.white);
}

function buildConference(root, width, depth) {
  const d = Math.min(depth, 1.55);
  addBox(root, [width, 0.12, d], [0, 0.78, 0], materials.wood);
  addBox(root, [width * 0.68, 0.7, d * 0.45], [0, 0.38, 0], materials.darkMetal);
  for (const side of [-1, 1]) {
    const chairs = Math.max(2, Math.floor(width / 0.75));
    for (let i = 0; i < chairs; i++) {
      const x = -width / 2 + (i + 0.5) * width / chairs;
      addBox(root, [0.42, 0.1, 0.42], [x, 0.48, side * (d / 2 + 0.32)], materials.fabric);
      addBox(root, [0.42, 0.58, 0.1], [x, 0.73, side * (d / 2 + 0.48)], materials.fabric);
    }
  }
}

function buildCooler(root, width, depth) {
  const d = Math.min(depth, 0.9);
  addBox(root, [width, 2.15, d], [0, 1.075, 0], materials.darkMetal);
  const doors = Math.max(1, Math.round(width / 0.75));
  for (let i = 0; i < doors; i++) {
    const panelW = width / doors - 0.08;
    const x = -width / 2 + (i + 0.5) * width / doors;
    addBox(root, [panelW, 1.82, 0.035], [x, 1.08, d / 2 + 0.02], materials.glass);
    addBox(root, [0.035, 1.45, 0.04], [x + panelW * 0.38, 1.08, d / 2 + 0.06], materials.lightMetal);
  }
  addBox(root, [width - 0.1, 0.05, 0.05], [0, 2.02, d / 2 + 0.06], materials.screen);
}

function buildPalletRack(root, width, depth) {
  const h = 2.5;
  const d = Math.min(depth, 1.6);
  for (const x of [-width / 2 + 0.08, width / 2 - 0.08]) {
    for (const z of [-d / 2 + 0.08, d / 2 - 0.08]) addBox(root, [0.1, h, 0.1], [x, h / 2, z], materials.blue);
  }
  for (const y of [0.18, 1.15, 2.1]) {
    addBox(root, [width, 0.1, d], [0, y, 0], materials.lightMetal);
    if (y < 2) {
      const boxes = Math.max(2, Math.floor(width / 0.75));
      for (let i = 0; i < boxes; i++) addBox(root, [width / boxes - 0.1, 0.66, d * 0.72], [-width / 2 + (i + 0.5) * width / boxes, y + 0.38, 0], materials.cardboard);
    }
  }
}

function buildPrototype(type, width, depth) {
  const root = new THREE.Group();
  switch (type) {
    case 'shelf': buildShelf(root, width, depth); break;
    case 'counter': buildCounter(root, width, depth); break;
    case 'teller': buildCounter(root, width, depth, true); break;
    case 'desk': buildDesk(root, Math.min(width, 2.8), Math.min(depth, 1.25)); break;
    case 'cubicle': buildDesk(root, Math.min(width, 4.2), Math.min(depth, 1.4), true); break;
    case 'sofa': buildSofa(root, Math.min(width, 2.9), Math.min(depth, 1.25)); break;
    case 'bed': buildBed(root, Math.min(width, 2.15), Math.min(depth, 2.55)); break;
    case 'lab': buildLabBench(root, Math.min(width, 4.5), Math.min(depth, 1.3)); break;
    case 'conference': buildConference(root, Math.min(width, 6.5), Math.min(depth, 1.8)); break;
    case 'cooler': buildCooler(root, Math.min(width, 5.5), Math.min(depth, 0.95)); break;
    case 'palletRack': buildPalletRack(root, width, depth); break;
    case 'locker': buildCooler(root, Math.min(width, 4.5), Math.min(depth, 0.65)); break;
    case 'workbench': buildLabBench(root, Math.min(width, 4.5), Math.min(depth, 1.25)); break;
    default: buildCounter(root, width, depth); break;
  }
  root.name = `environment-${type}`;

  // Furniture used to leave every board, leg, cushion and shelf as its own
  // draw call (and its own shadow draw). Bake those local transforms and merge
  // meshes that share a material. A detailed shelf can drop from dozens of
  // draws to four or five while keeping the exact same silhouette/materials.
  root.updateMatrixWorld(true);
  const byMaterial = new Map();
  root.traverse((child) => {
    if (!child.isMesh || Array.isArray(child.material)) return;
    const geometry = child.geometry.clone();
    geometry.applyMatrix4(child.matrixWorld);
    if (!byMaterial.has(child.material)) byMaterial.set(child.material, []);
    byMaterial.get(child.material).push(geometry);
  });
  root.clear();
  for (const [material, geometries] of byMaterial) {
    const geometry = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false);
    if (geometries.length > 1) geometries.forEach((part) => part.dispose());
    if (!geometry) continue;
    const mesh = new THREE.Mesh(geometry, material);
    // Furniture still receives the sun/flashlight, but excluding it from the
    // shadow pass avoids redrawing every detailed prop a second time.
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  return root;
}

export function spawnEnvironmentProp(type, width = 1.6, depth = 1.0) {
  const safeWidth = Math.max(0.5, Math.round(width * 20) / 20);
  const safeDepth = Math.max(0.45, Math.round(depth * 20) / 20);
  const key = `${type}:${safeWidth}:${safeDepth}`;
  if (!cache.has(key)) cache.set(key, buildPrototype(type, safeWidth, safeDepth));
  return cache.get(key).clone(true);
}
