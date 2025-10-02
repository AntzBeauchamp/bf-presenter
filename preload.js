import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('presenterAPI', {
  pickMedia: () => ipcRenderer.invoke('pick-media'),
  showOnProgram: (item) => ipcRenderer.send('display:show-item', item),
  black: () => ipcRenderer.send('display:black'),
  unblack: () => ipcRenderer.send('display:unblack'),
  pause: () => ipcRenderer.send('display:pause'),
  play: () => ipcRenderer.send('display:play'),
  onProgramEvent: (channel, cb) => ipcRenderer.on(channel, (_e, data) => cb(data))
});
