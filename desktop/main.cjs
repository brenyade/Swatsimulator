// Electron entry point — runs SWAT Simulator as a native desktop application
// with no browser chrome, its own menu-less fullscreen window, and the game
// served straight off disk. `npm run desktop` after `npm install`.
const { app, BrowserWindow, globalShortcut, screen } = require('electron');
const path = require('node:path');
const http = require('node:http');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.SWAT_PORT || 8123);

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.glb': 'model/gltf-binary',
};

// ES modules can't be loaded over file:// (module scripts are CORS-checked),
// so the desktop build serves the same tree over a loopback port.
function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let reqPath = decodeURIComponent(req.url.split('?')[0]);
      if (reqPath === '/') reqPath = '/index.html';
      const filePath = path.join(ROOT, reqPath);
      if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const win = new BrowserWindow({
    width: Math.min(1920, width),
    height: Math.min(1080, height),
    backgroundColor: '#0b0f0d',
    title: 'SWAT Simulator',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });
  win.loadURL(`http://127.0.0.1:${PORT}/`);

  // F11 fullscreen, F12 devtools — the usual PC-game expectations.
  globalShortcut.register('F11', () => win.setFullScreen(!win.isFullScreen()));
  globalShortcut.register('F12', () => win.webContents.toggleDevTools());
  return win;
}

app.whenReady().then(async () => {
  await startServer();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  if (process.platform !== 'darwin') app.quit();
});
