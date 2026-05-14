const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('modeditor', {
  ping: () => ipcRenderer.invoke('app:ping'),

  defaults: () => ipcRenderer.invoke('app:defaults'),

  wad: {
    listDefault: () => ipcRenderer.invoke('wad:listDefault'),
  },

  tilemap: {
    exportMap: (payload) => ipcRenderer.invoke('tilemap:exportMap', payload ?? {}),
  },

  compile: {
    run: (payload) => ipcRenderer.invoke('compile:run', payload ?? {}),
    onLog: (handler) => {
      const wrapped = (_evt, entry) => handler(entry);
      ipcRenderer.on('compile:log', wrapped);
      return () => ipcRenderer.off('compile:log', wrapped);
    },
  },

  bsp: {
    deploy: (opts) => ipcRenderer.invoke('bsp:deploy', opts ?? {}),
  },

  quake: {
    launch: (opts) => ipcRenderer.invoke('quake:launch', opts ?? {}),
  },
});
