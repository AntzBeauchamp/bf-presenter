import { app, BrowserWindow, ipcMain, dialog, screen } from 'electron';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const windowsIconPath = process.platform === 'win32'
  ? path.join(app.isPackaged ? process.resourcesPath : __dirname, 'BF_presenter_icon.ico')
  : undefined;

// Helper to resolve preload path in dev and production (inside asar)
function resolvePreload() {
  const candidates = [
    // packaged: app.asar root
    path.join(__dirname, 'preload.cjs'),
    // dev/build fallbacks
    path.join(__dirname, 'dist-electron', 'preload.cjs'),
    path.join(__dirname, '..', 'dist-electron', 'preload.cjs'),
    path.join(process.cwd(), 'dist-electron', 'preload.cjs'),
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  throw new Error('Preload script not found in any known location');
}

// Store app data next to the executable (true portable mode)
app.setPath('userData', path.join(__dirname, 'userdata'));
if (process.platform === 'win32') {
  app.setAppUserModelId('com.beauchamp.presenter');
}

let controlWin, displayWin;
let fileServerPort = null;
let backgroundImagePath = null;
let repeatEnabled = false;

function encodePathForUrl(p) {
  return Buffer.from(p, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodePathFromUrl(id) {
  let b = id.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b.length % 4;
  if (pad) b += '='.repeat(4 - pad);
  return Buffer.from(b, 'base64').toString('utf8');
}

function startFileServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const m = req.url.match(/^\/file\/([A-Za-z0-9_-]+)$/);
        if (!m) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }
        const p = decodePathFromUrl(m[1]);
        if (!fs.existsSync(p)) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }
        const ext = path.extname(p).slice(1).toLowerCase();
        const map = {
          jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
          mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
          mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4'
        };
        const ct = map[ext] || 'application/octet-stream';
        res.setHeader('Content-Type', ct);
        const stream = fs.createReadStream(p);
        stream.on('error', (err) => {
          res.statusCode = 500;
          res.end('Server error');
        });
        stream.pipe(res);
      } catch (err) {
        res.statusCode = 500;
        res.end('Server error');
      }
    });

    server.listen(0, '127.0.0.1', () => {
      fileServerPort = server.address().port;
      logMain('INFO', 'File server listening', { port: fileServerPort });
      resolve();
    });
    server.on('error', (err) => reject(err));
  });
}

function sendLogToControl(payload) {
  if (controlWin && !controlWin.isDestroyed() && controlWin.webContents) {
    controlWin.webContents.send('log:append', payload);
  }
}

ipcMain.on('log:append', (_evt, payload) => {
  if (!payload) return;
  sendLogToControl(payload);
});

function logMain(level, msg, data) {
  const payload = {
    ts: Date.now(),
    level,
    source: 'MAIN',
    msg,
    data: data ?? null
  };
  sendLogToControl(payload);

  const serializedMsg =
    typeof msg === 'string' ? msg : (() => { try { return JSON.stringify(msg); } catch { return String(msg); } })();
  const serializedData = data !== undefined && data !== null ? (() => { try { return ` ${JSON.stringify(data)}`; } catch { return ` ${String(data)}`; } })() : '';

  const line = `[MAIN][${level}] ${serializedMsg}${serializedData}`;
  if (level === 'ERROR') {
    console.error(line);
  } else if (level === 'WARN') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

global.logMain = logMain;

function createWindows() {
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  const secondary = displays.find(d => d.id !== primary.id) || primary;

  // Program (audience) window
  console.log('[preload]', resolvePreload());

  displayWin = new BrowserWindow({
    x: secondary.bounds.x,
    y: secondary.bounds.y,
    width: secondary.workArea.width,
    height: secondary.workArea.height,
    fullscreen: secondary.id !== primary.id,
    backgroundColor: '#000000',
    webPreferences: {
      preload: resolvePreload(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    autoHideMenuBar: true,
    show: false,
    icon: windowsIconPath
  });
  displayWin.loadFile(path.join('ui', 'display.html'));
  displayWin.webContents.once('did-finish-load', () => {
    displayWin?.webContents.send('display:set-repeat', repeatEnabled);
  });
  displayWin.once('ready-to-show', () => displayWin.show());

  // Presenter (control) window
  controlWin = new BrowserWindow({
    width: 1100,
    height: 800,
    backgroundColor: '#111111',
    icon: windowsIconPath,
    webPreferences: {
      preload: resolvePreload(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    autoHideMenuBar: true,
    show: false
  });
  controlWin.loadFile(path.join('ui', 'control.html'));
  // When control window is ready, send a test log
  controlWin.webContents.once('did-finish-load', () => {
    const payload = {
      ts: Date.now(),
      level: 'INFO',
      source: 'MAIN',
      msg: 'Smoke test: Control window loaded',
      data: null
    };
    controlWin.webContents.send('log:append', payload);
  });
  controlWin.once('ready-to-show', () => controlWin.show());

  displayWin.on('closed', () => { displayWin = null; if (controlWin) controlWin.close(); });
  controlWin.on('closed', () => { controlWin = null; if (displayWin) displayWin.close(); });
}

app.whenReady().then(async () => {
  try {
    await startFileServer();
  } catch (err) {
    console.warn('Failed to start file server', err);
  }
  createWindows();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindows(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.handle('pick-media', async (_evt, opts = {}) => {
  const allowImagesOnly = Boolean(opts?.imagesOnly);
  const filters = allowImagesOnly
    ? [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png'] }]
    : [{ name: 'Media', extensions: ['mp4', 'mov', 'webm', 'mp3', 'wav', 'm4a', 'jpg', 'jpeg', 'png'] }];

  const { canceled, filePaths } = await dialog.showOpenDialog(controlWin, {
    title: allowImagesOnly ? 'Choose image' : 'Add media',
    properties: ['openFile', 'multiSelections'],
    filters
  });
  if (canceled) return [];
  return filePaths.filter(p => fs.existsSync(p));
});

ipcMain.handle('pick-image', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }]
  });
  return canceled ? null : filePaths[0];
});

ipcMain.on('display:set-background', (_evt, absPath) => {
  backgroundImagePath = absPath || null;
  if (displayWin && !displayWin.isDestroyed()) {
    displayWin.webContents.send('display:set-background', backgroundImagePath);
  }
});

ipcMain.on('display:set-repeat', (_evt, enabled) => {
  repeatEnabled = !!enabled;
  if (displayWin && !displayWin.isDestroyed()) {
    displayWin.webContents.send('display:set-repeat', repeatEnabled);
  }
});

ipcMain.on('display:get-background', (event) => {
  if (backgroundImagePath) {
    event.reply('display:set-background', backgroundImagePath);
  }
});

ipcMain.on('display:show-item', (_evt, item) => {
  if (!item || !item.path) {
    console.warn('[MAIN] Ignored display:show-item without path', item);
    return;
  }

  try {
    console.log('MAIN: forwarding to display', item);
    const forwarded = { ...item };
    // If file server is running, convert local paths to http URLs
    if (fileServerPort && item?.path) {
      forwarded.url = `http://127.0.0.1:${fileServerPort}/file/${encodePathForUrl(item.path)}`;
    }
    if (displayWin && !displayWin.isDestroyed()) {
      displayWin.webContents.send('display:show-item', forwarded);
      logMain('INFO', 'Forwarded item to display', { type: item?.type || 'unknown' });
    } else {
      logMain('WARN', 'Cannot forward item, display window unavailable');
    }
  } catch (err) {
    logMain('ERROR', 'Error forwarding item to display', String(err));
  }
});
ipcMain.on('display:black', () => {
  if (displayWin && !displayWin.isDestroyed()) displayWin.webContents.send('display:black');
});
ipcMain.on('display:unblack', () => {
  if (displayWin && !displayWin.isDestroyed()) displayWin.webContents.send('display:unblack');
});
ipcMain.on('display:pause', () => {
  if (displayWin && !displayWin.isDestroyed()) displayWin.webContents.send('display:pause');
});
ipcMain.on('display:play', () => {
  if (displayWin && !displayWin.isDestroyed()) displayWin.webContents.send('display:play');
});
ipcMain.on('display:seek', (_evt, payload) => {
  // display:seek is forwarded from Control to the Display window here.
  console.log('[MAIN] forwarding display:seek', payload);
  if (displayWin && !displayWin.isDestroyed()) displayWin.webContents.send('display:seek', payload);
});
ipcMain.on('display:ended', () => {
  if (controlWin && !controlWin.isDestroyed()) controlWin.webContents.send('display:ended');
  logMain('INFO', 'Display reported playback ended');
});
ipcMain.on('display:playback-progress', (_evt, payload) => {
  if (controlWin && !controlWin.isDestroyed()) controlWin.webContents.send('display:playback-progress', payload);
});
ipcMain.on('display:error', (_evt, payload) => {
  if (controlWin && !controlWin.isDestroyed()) controlWin.webContents.send('display:error', payload);
  logMain('ERROR', 'Display error forwarded to control', payload);
});
