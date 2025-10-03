import { contextBridge, ipcRenderer } from 'electron';
import { pathToFileURL } from 'url';

contextBridge.exposeInMainWorld('presenterAPI', {
  pickMedia: (opts) => ipcRenderer.invoke('pick-media', opts || {}),
  showOnProgram: (item) => ipcRenderer.send('display:show-item', item),
  play: () => ipcRenderer.send('display:play'),
  pause: () => ipcRenderer.send('display:pause'),
  black: () => ipcRenderer.send('display:black'),
  unblack: () => ipcRenderer.send('display:unblack'),
  toFileURL: (absPath) => {
    try {
      return pathToFileURL(absPath).href;
    } catch (err) {
      console.error('Failed to convert path to file URL', err);
      return absPath;
    }
  },
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
    onAppend: (cb) => ipcRenderer.on('log:append', (_e, payload) => cb(payload)),
    download: () => ipcRenderer.invoke?.('log:download')
  }
});
