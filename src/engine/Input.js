export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set(); // edge-triggered, cleared once consumed each frame
    this.mouseDown = false;
    this.suppressFire = false;
    this.mouseCanvas = { x: 0, y: 0 };
    this.mouseWorld = { x: 0, y: 0 };
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
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouseCanvas.x = (e.clientX - rect.left) * (canvas.width / rect.width);
      this.mouseCanvas.y = (e.clientY - rect.top) * (canvas.height / rect.height);
    });
    canvas.addEventListener('mousedown', (e) => { if (e.button === 0) this.mouseDown = true; });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseDown = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  updateMouseWorld(mission) {
    this.mouseWorld.x = this.mouseCanvas.x - mission.offsetX;
    this.mouseWorld.y = this.mouseCanvas.y - mission.offsetY;
  }

  wasPressed(key) { return this.pressed.has(key); }

  clearFrame() { this.pressed.clear(); }
}
