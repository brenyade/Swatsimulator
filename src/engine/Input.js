// First-person controls: pointer-lock mouse-look + WASD held state.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set(); // edge-triggered, cleared once consumed each frame
    this.mouseDown = false;
    this.pointerLocked = false;
    this.yawDelta = 0;
    this.pitchDelta = 0;
    this.canvas = canvas;
    this._bind();
  }

  _bind() {
    const canvas = this.canvas;
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      if (['w', 'a', 's', 'd', ' '].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.key.toLowerCase()); });

    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (!this.pointerLocked) { canvas.requestPointerLock(); return; }
      this.mouseDown = true;
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseDown = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
      if (!this.pointerLocked) this.mouseDown = false;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;
      this.yawDelta += e.movementX || 0;
      this.pitchDelta += e.movementY || 0;
    });
  }

  requestLock() { this.canvas.requestPointerLock(); }
  exitLock() { if (document.exitPointerLock) document.exitPointerLock(); }

  // Returns and clears the accumulated mouse motion since the last call.
  consumeMouseDelta() {
    const d = { x: this.yawDelta, y: this.pitchDelta };
    this.yawDelta = 0; this.pitchDelta = 0;
    return d;
  }

  wasPressed(key) { return this.pressed.has(key); }

  clearFrame() { this.pressed.clear(); }
}
