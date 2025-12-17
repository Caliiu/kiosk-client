const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kioskAPI', {
  // O React chamará window.kioskAPI.getDeviceId()
  getDeviceId: () => ipcRenderer.invoke('get-machine-id'),
});