const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: cfg => ipcRenderer.invoke('config:save', cfg),
  scan: () => ipcRenderer.invoke('roms:scan'),
  pickFile: kind => ipcRenderer.invoke('dialog:file', kind),
  pickFolder: () => ipcRenderer.invoke('dialog:folder'),
  importImage: src => ipcRenderer.invoke('image:import', src),
  searchCovers: (consoleKey, term) => ipcRenderer.invoke('cover:search', consoleKey, term),
  pickCover: url => ipcRenderer.invoke('cover:pick', url),
  launch: (rom, consoleKey) => ipcRenderer.invoke('game:launch', rom, consoleKey),
  quit: () => ipcRenderer.invoke('app:quit'),
  openPads: what => ipcRenderer.invoke('pads:open', what),
  steamProfile: () => ipcRenderer.invoke('steam:profile'),
  toggleFullscreen: () => ipcRenderer.invoke('app:fullscreen'),
  onGameExit: cb => ipcRenderer.on('game:exit', cb),
  onGameError: cb => ipcRenderer.on('game:error', (_e, msg) => cb(msg))
});
