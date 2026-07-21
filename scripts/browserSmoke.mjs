import fs from 'node:fs';

const [
  debugPort = '9223',
  pageUrl = 'http://127.0.0.1:8080/',
  outputPath = 'browser-smoke.png',
  viewportWidth = '2048',
  viewportHeight = '1152',
  interiorOutputPath = '',
] = process.argv.slice(2);
const debugBase = `http://127.0.0.1:${debugPort}`;

async function waitFor(check, message, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(message);
}

const target = await waitFor(async () => {
  try {
    const targets = await fetch(`${debugBase}/json/list`).then((res) => res.json());
    return targets.find((entry) => entry.type === 'page');
  } catch {
    return null;
  }
}, 'Browser debugging endpoint did not become available');

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let commandId = 0;
const pending = new Map();
const runtimeErrors = [];
const browserLogs = [];
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  }
  if (message.method === 'Runtime.exceptionThrown') {
    const details = message.params.exceptionDetails;
    runtimeErrors.push(details.exception?.description || details.text || 'Runtime exception');
  }
  if (message.method === 'Runtime.consoleAPICalled') {
    browserLogs.push(message.params.args.map((arg) => arg.value || arg.description || '').join(' '));
  }
  if (message.method === 'Log.entryAdded') browserLogs.push(message.params.entry.text);
});

function send(method, params = {}) {
  const id = ++commandId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: Number(viewportWidth), height: Number(viewportHeight), deviceScaleFactor: 1, mobile: false,
});
await send('Page.navigate', { url: pageUrl });

try {
  await waitFor(
    () => evaluate("document.querySelector('#screen-menu')?.classList.contains('active') || document.querySelector('#loading-text')?.textContent.includes('Failed')"),
    'Game did not finish loading',
    30000,
  );
} catch (error) {
  const pageState = await evaluate(`({
    readyState: document.readyState,
    url: location.href,
    loadingText: document.querySelector('#loading-text')?.textContent,
    activeScreen: document.querySelector('.screen.active')?.id
  })`);
  throw new Error(`${error.message}: ${JSON.stringify(pageState)}; logs=${browserLogs.join(' | ')}; errors=${runtimeErrors.join(' | ')}`);
}

const loadFailure = await evaluate("document.querySelector('#loading-text')?.textContent.includes('Failed')");
if (loadFailure) throw new Error('Asset preload failed in the browser');

await evaluate("document.querySelector('#btn-play-now').click()");
await evaluate("document.querySelector('#btn-deploy').click()");

try {
  await waitFor(
    () => evaluate("window.__game?.runner?.mission?.def?.id === 'quickplay-house' && !!window.__game.runner.renderer3d.scene"),
    'Copper Cove House Raid did not deploy',
    20000,
  );
} catch (error) {
  const missionState = await evaluate(`({
    activeScreen: document.querySelector('.screen.active')?.id,
    briefing: document.querySelector('#briefing-title')?.textContent,
    mission: window.__game?.runner?.mission?.def?.id,
    running: window.__game?.runner?.running
  })`);
  throw new Error(`${error.message}: ${JSON.stringify(missionState)}; logs=${browserLogs.join(' | ')}; errors=${runtimeErrors.join(' | ')}`);
}
await new Promise((resolve) => setTimeout(resolve, 2500));
await evaluate("window.__game.runner.input.pointerLocked = true; document.querySelector('#pointer-lock-hint').style.display = 'none'");
await new Promise((resolve) => setTimeout(resolve, 350));

const summary = await evaluate(`(async () => {
  const THREE = await import('./src/vendor/three.module.js');
  const runner = window.__game.runner;
  const canvasRect = runner.canvas.getBoundingClientRect();
  const viewmodelBox = new THREE.Box3().setFromObject(runner.renderer3d.viewmodelMesh);
  const viewmodelSize = new THREE.Vector3();
  viewmodelBox.getSize(viewmodelSize);
  let largestEntityDimension = 0;
  for (const rec of runner.renderer3d.entityInstances.values()) {
    const size = new THREE.Vector3();
    new THREE.Box3().setFromObject(rec.instance.root).getSize(size);
    largestEntityDimension = Math.max(largestEntityDimension, size.x, size.y, size.z);
  }
  return {
    mission: runner.mission.def.id,
    weapon: runner.mission.player.currentWeaponId,
    cssWidth: canvasRect.width,
    cssHeight: canvasRect.height,
    bufferWidth: runner.canvas.width,
    bufferHeight: runner.canvas.height,
    cameraAspect: runner.renderer3d.camera.aspect,
    viewmodelSize: viewmodelSize.toArray(),
    largestEntityDimension,
    fullscreenButton: document.querySelector('#btn-pause-fullscreen')?.textContent,
  };
})()`);
const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
fs.writeFileSync(outputPath, Buffer.from(screenshot.data, 'base64'));

if (interiorOutputPath) {
  await evaluate(`(() => {
    const runner = window.__game.runner;
    for (const door of runner.mission.doorTiles) runner.mission.openDoor(door.tx, door.ty, 'normal');
    runner.mission.player.x = 14 * 32 + 16;
    runner.mission.player.y = 9 * 32 + 16;
    runner.mission.player.facing = -2.36;
    runner.mission.player.pitch = -0.04;
  })()`);
  await new Promise((resolve) => setTimeout(resolve, 700));
  const interior = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(interiorOutputPath, Buffer.from(interior.data, 'base64'));
}
socket.close();

const unexpectedErrors = runtimeErrors.filter((message) => !/pointer lock|NotAllowedError|user gesture/i.test(message));
if (unexpectedErrors.length) throw new Error(`Browser runtime errors: ${unexpectedErrors.join('; ')}`);
if (Math.abs(summary.cssWidth - Number(viewportWidth)) > 1 || Math.abs(summary.cssHeight - Number(viewportHeight)) > 1) {
  throw new Error(`Canvas does not fill viewport: ${JSON.stringify(summary)}`);
}
if (Math.max(...summary.viewmodelSize) > 0.65 || summary.largestEntityDimension > 4) {
  throw new Error(`Weapon or attached entity model is oversized: ${JSON.stringify(summary)}`);
}
console.log(JSON.stringify(summary));
