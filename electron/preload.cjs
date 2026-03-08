const { contextBridge, ipcRenderer } = require('electron')

// Expose safe APIs to React app
contextBridge.exposeInMainWorld('electron', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getAppName: () => ipcRenderer.invoke('get-app-name')
})
