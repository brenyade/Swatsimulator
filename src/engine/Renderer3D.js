import * as THREE from '../vendor/three.module.js';

// One world unit == half a tile (32px). Keeps corridors ~2 units wide and
// rooms human-scaled instead of cavernous.
const SCALE = 1 / 16;
const TILE_W = 32 * SCALE; // 2
const WALL_H = 3.0;
export const EYE_HEIGHT = 1.6;

export const gx = (x) => x * SCALE;
export const gz = (y) => y * SCALE;
export const yawFromFacing = (facing) => -facing - Math.PI / 2;

const STATE_COLOR = {
  idle: 0x8a8a8a, alert: 0xe8b84b, hostile: 0xe63946, surrendering: 0xf2e94e, arrested: 0x555555, dead: 0x333333,
};

function makeCheckerTexture(c1, c2, repeatX, repeatY) {
  const canvas = document.createElement('canvas');
  canvas.width = 2; canvas.height = 2;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = c1; ctx.fillRect(0, 0, 1, 1); ctx.fillRect(1, 1, 1, 1);
  ctx.fillStyle = c2; ctx.fillRect(1, 0, 1, 1); ctx.fillRect(0, 1, 1, 1);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.repeat.set(repeatX, repeatY);
  return tex;
}

function disposeObject(obj) {
  obj.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m) => { m.map?.dispose(); m.dispose(); });
    }
  });
}

function buildHumanoid(bodyColor = 0xffffff) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.28, 0.95, 4, 8),
    new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.7 }),
  );
  body.position.y = 0.28 + 0.475;
  group.add(body);
  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(0.11, 0.28, 8),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x222222 }),
  );
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, body.position.y + 0.25, -0.34);
  group.add(nose);
  group.userData.body = body;
  group.userData.nose = nose;
  return group;
}

function buildEliteMarker() {
  const marker = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.14, 0),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xaaaaaa, emissiveIntensity: 0.6 }),
  );
  marker.position.y = 1.9;
  return marker;
}

export class Renderer3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(canvas.width, canvas.height, false);

    this.camera = new THREE.PerspectiveCamera(78, canvas.width / canvas.height, 0.05, 90);
    this.camera.rotation.order = 'YXZ';

    this.headlamp = new THREE.PointLight(0xffedc4, 1.3, 12, 2);
    this.camera.add(this.headlamp);

    this.viewmodel = this._buildViewmodel();
    this.camera.add(this.viewmodel);

    this.scene = null;
    this.entityMeshes = new Map();
    this.doorMeshes = [];
    this.evidenceMeshes = [];
    this.tracerGroup = null;
    this.markerRing = null;
    this._clock = 0;
  }

  _buildViewmodel() {
    const group = new THREE.Group();
    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.14, 0.55),
      new THREE.MeshStandardMaterial({ color: 0x4a4f4a, roughness: 0.35, metalness: 0.5 }),
    );
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.35, 8),
      new THREE.MeshStandardMaterial({ color: 0x232623, roughness: 0.3, metalness: 0.6 }),
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.03, -0.45);
    const sight = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.05, 0.05),
      new THREE.MeshStandardMaterial({ color: 0x111111 }),
    );
    sight.position.set(0, 0.1, -0.15);
    const light = new THREE.PointLight(0xffffff, 0.4, 2);
    light.position.set(0, 0.3, 0.3);
    group.add(gun, barrel, sight, light);
    group.position.set(0.24, -0.26, -0.5);
    return group;
  }

  disposeScene() {
    if (this.scene) disposeObject(this.scene);
    this.entityMeshes.clear();
    this.doorMeshes = [];
    this.evidenceMeshes = [];
  }

  buildScene(mission) {
    this.disposeScene();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07090a);
    scene.fog = new THREE.FogExp2(0x07090a, 0.032);
    scene.add(this.camera);

    scene.add(new THREE.HemisphereLight(0x9fb3c8, 0x232920, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 0.45);
    sun.position.set(6, 10, 4);
    scene.add(sun);

    const { map } = mission;
    const w = map.width * TILE_W, h = map.height * TILE_W;

    const floorTex = makeCheckerTexture('#1c2118', '#1a1f17', map.width, map.height);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.95 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(w / 2 - TILE_W / 2, 0, h / 2 - TILE_W / 2);
    scene.add(floor);

    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ color: 0x11140f, roughness: 1 }),
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(w / 2 - TILE_W / 2, WALL_H, h / 2 - TILE_W / 2);
    scene.add(ceiling);

    // walls — single instanced mesh for every solid tile
    const wallTiles = [];
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        if (map.grid[ty][tx] === '#') wallTiles.push([tx, ty]);
      }
    }
    const wallGeo = new THREE.BoxGeometry(TILE_W, WALL_H, TILE_W);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x2a322b, roughness: 0.95 });
    const wallMesh = new THREE.InstancedMesh(wallGeo, wallMat, Math.max(1, wallTiles.length));
    const m4 = new THREE.Matrix4();
    wallTiles.forEach(([tx, ty], i) => {
      m4.makeTranslation(gx(tx * 32 + 16), WALL_H / 2, gz(ty * 32 + 16));
      wallMesh.setMatrixAt(i, m4);
    });
    wallMesh.count = wallTiles.length;
    scene.add(wallMesh);

    // doors — individual meshes so they can be hidden once opened
    this.doorMeshes = [];
    for (const d of mission.doorTiles) {
      const door = new THREE.Mesh(
        new THREE.BoxGeometry(TILE_W * 0.92, WALL_H * 0.9, TILE_W * 0.92),
        new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.8 }),
      );
      door.position.set(gx(d.wx), WALL_H * 0.45, gz(d.wy));
      door.userData.key = `${d.tx},${d.ty}`;
      scene.add(door);
      this.doorMeshes.push(door);
    }

    // evidence markers
    this.evidenceMeshes = mission.evidencePoints.map((e) => {
      const mesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.22, 0),
        new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0x554400, emissiveIntensity: 0.4 }),
      );
      mesh.position.set(gx(e.x), 1.1, gz(e.y));
      mesh.userData.evidence = e;
      scene.add(mesh);
      return mesh;
    });

    // move-to-marker ring (hidden until used)
    this.markerRing = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.5, 24),
      new THREE.MeshBasicMaterial({ color: 0x3ddc84, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
    );
    this.markerRing.rotation.x = -Math.PI / 2;
    this.markerRing.visible = false;
    scene.add(this.markerRing);

    // tracer group
    this.tracerGroup = new THREE.Group();
    scene.add(this.tracerGroup);

    this.scene = scene;
  }

  _meshFor(entity) {
    let mesh = this.entityMeshes.get(entity.id);
    if (!mesh) {
      mesh = buildHumanoid();
      if (entity.elite) mesh.add(buildEliteMarker());
      this.scene.add(mesh);
      this.entityMeshes.set(entity.id, mesh);
    }
    return mesh;
  }

  _updateHumanoid(entity, baseColor, extra) {
    const visible = entity.alive && !(entity.state === 'dead');
    const mesh = this._meshFor(entity);
    mesh.visible = visible;
    if (!visible) return;
    mesh.position.set(gx(entity.x), 0, gz(entity.y));
    mesh.rotation.y = yawFromFacing(entity.facing);
    mesh.userData.body.material.color.setHex(baseColor);
    extra?.(mesh);
  }

  update(mission, dt, marker) {
    this._clock += dt;

    for (const t of mission.teammates) this._updateHumanoid(t, 0x3ddcd0);
    for (const s of mission.suspects) this._updateHumanoid(s, STATE_COLOR[s.state] ?? 0x8a8a8a);
    for (const h of mission.hostages) this._updateHumanoid(h, h.state === 'freed' ? 0x8fd6ff : 0xf2e94e);
    for (const c of mission.civilians) this._updateHumanoid(c, c.state === 'panic' ? 0xe0a458 : 0x5fb46a);

    // doors
    for (const d of this.doorMeshes) d.visible = !mission.map.openDoors.has(d.userData.key);

    // evidence spin
    for (const mesh of this.evidenceMeshes) {
      mesh.visible = !mesh.userData.evidence.collected;
      mesh.rotation.y += dt * 1.4;
      mesh.position.y = 1.1 + Math.sin(this._clock * 2) * 0.08;
    }

    // move-to marker
    if (marker) {
      this.markerRing.visible = true;
      this.markerRing.position.set(gx(marker.x), 0.05, gz(marker.y));
    } else {
      this.markerRing.visible = false;
    }

    // tracers
    this.tracerGroup.clear();
    for (const t of mission.tracers) {
      const points = [
        new THREE.Vector3(gx(t.x0), EYE_HEIGHT - 0.15, gz(t.y0)),
        new THREE.Vector3(gx(t.x1), EYE_HEIGHT - 0.15, gz(t.y1)),
      ];
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({ color: 0xffe791, transparent: true, opacity: 1 - t.age / 0.08 });
      this.tracerGroup.add(new THREE.Line(geo, mat));
    }

    // camera
    const p = mission.player;
    this.camera.position.set(gx(p.x), EYE_HEIGHT, gz(p.y));
    this.camera.rotation.y = yawFromFacing(p.facing);
    this.camera.rotation.x = p.pitch;

    // viewmodel recoil + fov kick
    this.viewmodel.position.z = -0.5 + p.recoil * 0.12;
    this.viewmodel.rotation.x = -p.recoil * 0.25;
    const targetFov = 78 + p.recoil * 4;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = targetFov;
      this.camera.updateProjectionMatrix();
    }

    this.headlamp.intensity = 1.3;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
