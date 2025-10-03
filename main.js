import { app, BrowserWindow, ipcMain, dialog, screen } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Store app data next to the executable (true portable mode)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', path.join(__dirname, 'userdata'));

let controlWin, displayWin;

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
  displayWin = new BrowserWindow({
    x: secondary.bounds.x,
    y: secondary.bounds.y,
    width: secondary.workArea.width,
    height: secondary.workArea.height,
    fullscreen: secondary.id !== primary.id,
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    },
    autoHideMenuBar: true,
    show: false
  });
  displayWin.loadFile(path.join('ui', 'display.html'));
  displayWin.once('ready-to-show', () => displayWin.show());

  // Presenter (control) window
  controlWin = new BrowserWindow({
    width: 1100,
    height: 800,
    backgroundColor: '#111111',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
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

app.whenReady().then(() => {
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

ipcMain.on('display:show-item', (_evt, item) => {
  console.log('MAIN: forwarding to display', item);
  if (displayWin && !displayWin.isDestroyed()) {
    displayWin.webContents.send('display:show-item', item);
    logMain('INFO', 'Forwarded item to display', { type: item?.type || 'unknown' });
  } else {
    logMain('WARN', 'Cannot forward item, display window unavailable');
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
ipcMain.on('display:ended', () => {
  if (controlWin && !controlWin.isDestroyed()) controlWin.webContents.send('display:ended');
  logMain('INFO', 'Display reported playback ended');
});
ipcMain.on('display:error', (_evt, payload) => {
  if (controlWin && !controlWin.isDestroyed()) controlWin.webContents.send('display:error', payload);
  logMain('ERROR', 'Display error forwarded to control', payload);
});
