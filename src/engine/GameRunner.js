import { Mission } from './Mission.js';
import { Input } from './Input.js';
import { render } from './Renderer.js';
import { updateHUD, initCommandBar } from './HUD.js';
import {
  commandFollow, commandHold, commandMoveTo, commandBreach, orderSurrender, contextInteract, findNearestDoor,
} from '../core/CommandSystem.js';

const MAX_DT = 1 / 20;

export class GameRunner {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = new Input(canvas);
    this.mission = null;
    this.running = false;
    this.paused = false;
    this.moveMarkerMode = false;
    this.marker = null;
    this.markerTimer = 0;
    this._onFrame = this._onFrame.bind(this);

    canvas.addEventListener('click', (e) => this._onCanvasClick(e));
  }

  start(missionDef, callbacks) {
    this.mission = new Mission(missionDef);
    this.callbacks = callbacks || {};
    this.running = true;
    this.paused = false;
    this.moveMarkerMode = false;
    this.marker = null;
    this._lastT = performance.now();
    initCommandBar();
    requestAnimationFrame(this._onFrame);
  }

  stop() { this.running = false; }
  setPaused(v) { this.paused = v; }

  _onCanvasClick(e) {
    if (!this.running || this.paused || !this.mission) return;
    if (this.moveMarkerMode) {
      const rect = this.canvas.getBoundingClientRect();
      const cx = (e.clientX - rect.left) * (this.canvas.width / rect.width);
      const cy = (e.clientY - rect.top) * (this.canvas.height / rect.height);
      const world = { x: cx - this.mission.offsetX, y: cy - this.mission.offsetY };
      commandMoveTo(this.mission, world);
      this.marker = world;
      this.markerTimer = 3;
      this.moveMarkerMode = false;
      this.input.suppressFire = false;
    }
  }

  _handleCommandKeys() {
    const input = this.input;
    const mission = this.mission;
    if (input.wasPressed('1')) commandFollow(mission);
    if (input.wasPressed('2')) commandHold(mission);
    if (input.wasPressed('3')) {
      this.moveMarkerMode = true;
      input.suppressFire = true;
      mission.banner('CLICK A LOCATION TO SEND YOUR TEAM');
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

    if (!this.paused) {
      this.input.updateMouseWorld(this.mission);
      this._handleCommandKeys();
      this.mission.update(dt, this.input);

      if (this.markerTimer > 0) { this.markerTimer -= dt; if (this.markerTimer <= 0) this.marker = null; }

      if (this.mission.state !== 'running') {
        this.input.clearFrame();
        this.running = false;
        this.callbacks.onEnd?.(this.mission);
        return;
      }
    }
    this.input.clearFrame();

    render(this.ctx, this.mission, { marker: this.marker });
    updateHUD(this.mission, this.input);
    requestAnimationFrame(this._onFrame);
  }
}
