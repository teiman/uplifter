const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('modeditor', {
  ping: () => ipcRenderer.invoke('app:ping'),

  defaults: () => ipcRenderer.invoke('app:defaults'),

  wad: {
    listDefault: () => ipcRenderer.invoke('wad:listDefault'),
    load: (wadPath) => ipcRenderer.invoke('wad:load', wadPath),
  },

  tilemap: {
    save:       (payload) => ipcRenderer.invoke('tilemap:save',      payload ?? {}),
    loadLast:   (payload) => ipcRenderer.invoke('tilemap:loadLast',  payload ?? {}),
    exportMap:  (payload) => ipcRenderer.invoke('tilemap:exportMap', payload ?? {}),
  },

  // Reusable map-area props (.tprop): save a copied selection, list saved
  // ones, and load one back to paste.
  prop: {
    save: (payload) => ipcRenderer.invoke('prop:save', payload ?? {}),
    list: () => ipcRenderer.invoke('prop:list'),
    load: (payload) => ipcRenderer.invoke('prop:load', payload ?? {}),
    delete: (payload) => ipcRenderer.invoke('prop:delete', payload ?? {}),
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
    findExisting: (opts) => ipcRenderer.invoke('bsp:findExisting', opts ?? {}),
  },

  quake: {
    launch: (opts) => ipcRenderer.invoke('quake:launch', opts ?? {}),
  },

  // Log al main para entornos sin DevTools accesibles. Escribe a
  // tmp/debug.log con timestamp. Sin retorno — fire-and-forget.
  debug: {
    log: (...args) => {
      const line = args.map(a => {
        if (typeof a === 'string') return a;
        try { return JSON.stringify(a); } catch { return String(a); }
      }).join(' ');
      ipcRenderer.invoke('debug:log', line);
    },
  },
});
