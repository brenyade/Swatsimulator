import { Mission } from './Mission.js';
import { Input } from './Input.js';
import { Renderer3D } from './Renderer3D.js';
import { AnimationLoop } from './AnimationLoop.js';
import { updateHUD, initCommandBar } from './HUD.js';
import {
  commandFollow, commandHold, commandMoveTo, commandBreach, commandAutonomous, orderSurrender, contextInteract, findNearestDoor,
} from '../core/CommandSystem.js';

const MAX_DT = 1 / 20;
const MOVE_ORDER_DISTANCE = 130; // px ahead of the player's facing direction

export class GameRunner {
  constructor(canvas) {
    this.canvas = canvas;
    this.input = new Input(canvas);
    this.renderer3d = new Renderer3D(canvas);
    this.mission = null;
    this.running = false;
    this.paused = false;
    this.marker = null;
    this.markerTimer = 0;
    this._onFrame = this._onFrame.bind(this);
    this._animationLoop = new AnimationLoop(this._onFrame);

    this.hint = document.getElementById('pointer-lock-hint');
    this.hint.addEventListener('click', () => this.input.requestLock());
    window.addEventListener('resize', () => this.resize());
  }

  start(missionDef, callbacks) {
    const mission = new Mission(missionDef);
    this.renderer3d.buildScene(mission);
    this.resize(true);

    this.mission = mission;
    this.callbacks = callbacks || {};
    this.running = true;
    this.paused = false;
    this.marker = null;
    this._lastT = performance.now();
    initCommandBar();
    this._animationLoop.start();
  }

  stop() {
    this.running = false;
    this._animationLoop.stop();
    this.input.exitLock();
  }

  resize(force = false) {
    return this.renderer3d.resizeToDisplaySize(force);
  }

  // Rebuilds the 3D scene around the live mission state, so quality settings
  // that are baked at build time can be changed without losing the mission.
  rebuildScene() {
    if (!this.mission) return;
    this.renderer3d.buildScene(this.mission);
    this.resize(true);
  }

  setPaused(v) {
    this.paused = v;
    if (v) this.input.exitLock();
  }

  _handleCommandKeys() {
    const input = this.input;
    const mission = this.mission;
    if (input.wasPressed('1')) commandFollow(mission);
    if (input.wasPressed('2')) commandHold(mission);
    if (input.wasPressed('3')) {
      const p = mission.player;
      const target = { x: p.x + Math.cos(p.facing) * MOVE_ORDER_DISTANCE, y: p.y + Math.sin(p.facing) * MOVE_ORDER_DISTANCE };
      commandMoveTo(mission, target);
      this.marker = target;
      this.markerTimer = 2.5;
    }
    if (input.wasPressed('4')) commandBreach(mission);
    if (input.wasPressed('5')) commandAutonomous(mission);
    if (input.wasPressed(' ')) orderSurrender(mission);
    if (input.wasPressed('f')) {
      contextInteract(mission);
      mission.secureEvidenceNear(mission.player.x, mission.player.y);
    }
    if (input.wasPressed('x')) mission.player.switchSlot();
    if (input.wasPressed('r')) mission.player.reload();
    if (input.wasPressed('b')) {
      const door = findNearestDoor(mission, mission.player.x, mission.player.y, 55);
      if (door && !mission.map.openDoors.has(`${door.tx},${door.ty}`)) {
        mission.openDoor(door.tx, door.ty, 'breach');
        mission.markLoudEvent(door.worldX, door.worldY);
        mission.banner('DOOR KICKED IN');
      }
    }
    if (input.wasPressed('g')) mission.player.throwFlashbang(mission);
  }

  _onFrame(t) {
    if (!this.running) return;
    const dt = Math.min(MAX_DT, (t - this._lastT) / 1000);
    this._lastT = t;

    this.hint.style.display = (!this.paused && !this.input.pointerLocked) ? 'flex' : 'none';

    if (!this.paused) {
      this._handleCommandKeys();
      this.mission.update(dt, this.input);

      if (this.markerTimer > 0) { this.markerTimer -= dt; if (this.markerTimer <= 0) this.marker = null; }

      if (this.mission.state !== 'running') {
        this.input.clearFrame();
        this.running = false;
        this.input.exitLock();
        this.callbacks.onEnd?.(this.mission);
        return;
      }
    }
    this.input.clearFrame();

    this.renderer3d.update(this.mission, this.paused ? 0 : dt, this.marker);
    this.renderer3d.render();
    updateHUD(this.mission, this.input, dt);
    this._animationLoop.schedule();
  }
}
