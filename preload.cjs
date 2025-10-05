const { contextBridge, ipcRenderer } = require('electron');
const { pathToFileURL } = require('url');

contextBridge.exposeInMainWorld('presenterAPI', {
  pickMedia: (opts) => ipcRenderer.invoke('pick-media', opts || {}),
  pickImage: () => ipcRenderer.invoke('pick-image'),
  setBackground: (absPath) => ipcRenderer.send('display:set-background', absPath),
  showOnProgram: (item) => ipcRenderer.send('display:show-item', item),
  play: () => ipcRenderer.send('display:play'),
  pause: () => ipcRenderer.send('display:pause'),
  black: () => ipcRenderer.send('display:black'),
  unblack: () => ipcRenderer.send('display:unblack'),
  toFileURL: (absPath) => pathToFileURL(absPath).href,
  send: (channel, payload) => ipcRenderer.send(channel, payload),
  onProgramEvent: (channel, cb) => ipcRenderer.on(channel, (_e, data) => cb(data)),
  log: {
    append: (level, source, msg, data = null) => {
      ipcRenderer.send('log:append', {
        ts: Date.now(),
        level,
        source,
        msg,
        data
      });
    },
    onAppend: (cb) => {
      ipcRenderer.on('log:append', (_e, payload) => cb(payload));
    }
  }
});
