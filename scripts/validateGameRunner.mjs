import assert from 'node:assert/strict';
import { AnimationLoop } from '../src/engine/AnimationLoop.js';

let nextFrameId = 1;
const queuedFrames = new Map();
const cancelledFrames = [];

globalThis.requestAnimationFrame = (callback) => {
  const id = nextFrameId++;
  queuedFrames.set(id, callback);
  return id;
};
globalThis.cancelAnimationFrame = (id) => {
  cancelledFrames.push(id);
  queuedFrames.delete(id);
};

const ticks = [];
const loop = new AnimationLoop((timestamp) => ticks.push(timestamp));

loop.start();
assert.equal(queuedFrames.size, 1, 'initial start should queue one animation frame');
const firstFrameId = loop.frameId;

loop.start();
assert.deepEqual(cancelledFrames, [firstFrameId], 'restart should cancel the previous queued frame');
assert.equal(queuedFrames.size, 1, 'restart should still leave exactly one animation frame queued');
assert.notEqual(loop.frameId, firstFrameId, 'restart should queue a fresh frame');

const activeFrameId = loop.frameId;
const activeFrame = queuedFrames.get(activeFrameId);
queuedFrames.delete(activeFrameId);
activeFrame(1234);
assert.deepEqual(ticks, [1234], 'the queued callback should receive its timestamp');
assert.equal(loop.frameId, null, 'a completed frame should no longer count as queued');

loop.schedule();
const finalFrameId = loop.frameId;
loop.schedule();
assert.equal(queuedFrames.size, 1, 'repeated scheduling should not create duplicate frames');

loop.stop();
assert.deepEqual(cancelledFrames, [firstFrameId, finalFrameId], 'stop should cancel the active frame');
assert.equal(queuedFrames.size, 0, 'stop should leave no animation frame queued');
assert.equal(loop.frameId, null, 'stop should reset the scheduler state');

console.log('GAME RUNNER LIFECYCLE VALID');
