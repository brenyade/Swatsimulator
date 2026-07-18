import { Mission } from './Mission.js';
import { Input } from './Input.js';
import { Renderer3D } from './Renderer3D.js';
import { updateHUD, initCommandBar } from './HUD.js';
import {
  commandFollow, commandHold, commandMoveTo, commandBreach, orderSurrender, contextInteract, findNearestDoor,
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

    this.hint = document.getElementById('pointer-lock-hint');
    this.hint.addEventListener('click', () => this.input.requestLock());
  }

  start(missionDef, callbacks) {
    this.mission = new Mission(missionDef);
    this.renderer3d.buildScene(this.mission);
    this.callbacks = callbacks || {};
    this.running = true;
    this.paused = false;
    this.marker = null;
    this._lastT = performance.now();
    initCommandBar();
    requestAnimationFrame(this._onFrame);
  }

  stop() { this.running = false; this.input.exitLock(); }

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
    if (input.wasPressed(' ')) orderSurrender(mission);
    if (input.wasPressed('e')) {
      contextInteract(mission);
      mission.secureEvidenceNear(mission.player.x, mission.player.y);
    }
    if (input.wasPressed('q')) mission.player.switchSlot();
    if (input.wasPressed('r')) mission.player.reload();
    if (input.wasPressed('f')) {
      const door = findNearestDoor(mission, mission.player.x, mission.player.y, 55);
      if (door && !mission.map.openDoors.has(`${door.tx},${door.ty}`)) {
        mission.openDoor(door.tx, door.ty);
        const angle = Math.atan2(door.worldY - mission.player.y, door.worldX - mission.player.x);
        mission.spawnFlashbang(mission.player.x, mission.player.y, angle, true);
        mission.banner('DYNAMIC ENTRY');
      } else {
        mission.player.throwFlashbang(mission);
      }
    }
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
    updateHUD(this.mission, this.input);
    requestAnimationFrame(this._onFrame);
  }
}
