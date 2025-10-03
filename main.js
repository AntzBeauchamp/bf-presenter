import { app, BrowserWindow, ipcMain, dialog, screen } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Store app data next to the executable (true portable mode)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', path.join(__dirname, 'userdata'));

let controlWin, displayWin;

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
      preload: path.join(process.cwd(), 'preload.js'),
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
      preload: path.join(process.cwd(), 'preload.js'),
      contextIsolation: true
    },
    autoHideMenuBar: true,
    show: false
  });
  controlWin.loadFile(path.join('ui', 'control.html'));
  controlWin.once('ready-to-show', () => controlWin.show());

  displayWin.on('closed', () => { displayWin = null; if (controlWin) controlWin.close(); });
  controlWin.on('closed', () => { controlWin = null; if (displayWin) displayWin.close(); });
}

app.whenReady().then(() => {
  createWindows();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindows(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.handle('pick-media', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(controlWin, {
    title: 'Add media',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Media', extensions: ['mp4','mov','webm','mp3','wav','m4a','jpg','jpeg','png'] }
    ]
  });
  if (canceled) return [];
  return filePaths.filter(p => fs.existsSync(p));
});

ipcMain.on('display:show-item', (_evt, item) => {
  if (displayWin) displayWin.webContents.send('display:show-item', item);
});
ipcMain.on('display:black', () => {
  if (displayWin) displayWin.webContents.send('display:black');
});
ipcMain.on('display:unblack', () => {
  if (displayWin) displayWin.webContents.send('display:unblack');
});
ipcMain.on('display:pause', () => {
  if (displayWin) displayWin.webContents.send('display:pause');
});
ipcMain.on('display:play', () => {
  if (displayWin) displayWin.webContents.send('display:play');
});
ipcMain.on('display:ended', () => {
  if (controlWin) controlWin.webContents.send('display:ended');
});
ipcMain.on('display:error', (_evt, payload) => {
  if (controlWin) controlWin.webContents.send('display:error', payload);
});
