import fs from 'node:fs';

const [
  debugPort = '9224',
  pageUrl = 'http://127.0.0.1:8080/',
  closedOutput = 'door-closed.png',
  breachedOutput = 'door-breached.png',
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

async function capture(outputPath) {
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(outputPath, Buffer.from(shot.data, 'base64'));
}

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
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
    loadingText: document.querySelector('#loading-text')?.textContent,
    activeScreen: document.querySelector('.screen.active')?.id
  })`);
  throw new Error(`${error.message}: ${JSON.stringify(pageState)}; logs=${browserLogs.join(' | ')}; errors=${runtimeErrors.join(' | ')}`);
}

if (await evaluate("document.querySelector('#loading-text')?.textContent.includes('Failed')")) {
  throw new Error(`Asset preload failed: ${browserLogs.join(' | ')}`);
}

await evaluate(`window.__game.career.data.unlockedIndex = 5;
document.querySelector('#btn-career').click();`);
await evaluate("[...document.querySelectorAll('.mission-card')].at(-1).click()");
await evaluate("document.querySelector('#btn-deploy').click()");

await waitFor(
  () => evaluate("window.__game?.runner?.mission?.def?.id === 'm6' && !!window.__game.runner.renderer3d.scene"),
  'Operation Night Current did not deploy',
  20000,
);
await new Promise((resolve) => setTimeout(resolve, 1500));

await evaluate(`(() => {
  const runner = window.__game.runner;
  const mission = runner.mission;
  mission.player.x = 8 * 32 + 16;
  mission.player.y = 17 * 32 + 16;
  mission.player.facing = -Math.PI / 2;
  mission.player.pitch = 0;
  runner.input.pointerLocked = true;
  document.querySelector('#pointer-lock-hint').style.display = 'none';
})()`);
await new Promise((resolve) => setTimeout(resolve, 450));

const closedState = await evaluate(`(async () => {
  const THREE = await import('./src/vendor/three.module.js');
  const record = window.__game.runner.renderer3d.doorMeshes.find((door) => door.key === '8,16');
  const leaf = record?.root.getObjectByName('door-leaf');
  const viewmodelSize = new THREE.Vector3();
  new THREE.Box3().setFromObject(window.__game.runner.renderer3d.viewmodelMesh).getSize(viewmodelSize);
  let meshCount = 0;
  leaf?.traverse((child) => { if (child.isMesh) meshCount++; });
  return {
    found: !!record,
    hingeFound: !!record?.hinge,
    leafFound: !!leaf,
    meshCount,
    openAmount: record?.openAmount,
    hingeAngle: record?.hinge.rotation.y,
    viewmodelSize: viewmodelSize.toArray(),
  };
})()`);
if (!closedState.found || !closedState.hingeFound || !closedState.leafFound || closedState.meshCount < 2) {
  throw new Error(`Door model hierarchy is incomplete: ${JSON.stringify(closedState)}`);
}
if (closedState.openAmount > 0.01 || Math.abs(closedState.hingeAngle) > 0.01) {
  throw new Error(`Door was not closed before interaction: ${JSON.stringify(closedState)}`);
}
if (Math.max(...closedState.viewmodelSize) > 1.2) {
  throw new Error(`Long-gun viewmodel is oversized: ${JSON.stringify(closedState)}`);
}
await capture(closedOutput);

await evaluate("window.__game.runner.mission.openDoor(8, 16, 'breach')");
await waitFor(
  () => evaluate("window.__game.runner.renderer3d.doorMeshes.find((door) => door.key === '8,16')?.openAmount > 0.98"),
  'Door breach animation did not complete',
  // Generous because this runs against a software rasteriser in CI, where the
  // full-quality scene renders at only a couple of frames per second.
  20000,
);
await capture(breachedOutput);

const breachedState = await evaluate(`(() => {
  const record = window.__game.runner.renderer3d.doorMeshes.find((door) => door.key === '8,16');
  return {
    mode: window.__game.runner.mission.map.doorModes.get('8,16'),
    openAmount: record.openAmount,
    hingeAngle: record.hinge.rotation.y,
  };
})()`);
socket.close();

const unexpectedErrors = runtimeErrors.filter((message) => !/pointer lock|NotAllowedError|user gesture/i.test(message));
if (unexpectedErrors.length) throw new Error(`Browser runtime errors: ${unexpectedErrors.join('; ')}`);
if (breachedState.mode !== 'breach' || Math.abs(breachedState.hingeAngle) < 1.5) {
  throw new Error(`Door breach state is invalid: ${JSON.stringify(breachedState)}`);
}

console.log(JSON.stringify({ closedState, breachedState, browserLogs }));
