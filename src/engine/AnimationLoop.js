export class AnimationLoop {
  constructor(onFrame) {
    this.onFrame = onFrame;
    this.frameId = null;
    this._tick = this._tick.bind(this);
  }

  start() {
    this.stop();
    this.schedule();
  }

  schedule() {
    if (this.frameId !== null) return;
    this.frameId = requestAnimationFrame(this._tick);
  }

  stop() {
    if (this.frameId === null) return;
    cancelAnimationFrame(this.frameId);
    this.frameId = null;
  }

  _tick(timestamp) {
    this.frameId = null;
    this.onFrame(timestamp);
  }
}
