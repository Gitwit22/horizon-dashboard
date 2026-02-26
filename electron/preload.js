const { contextBridge, ipcMain } = require('electron')

// Expose safe APIs to React app
contextBridge.exposeInMainWorld('electron', {
  getAppVersion: () => ipcMain.invoke('get-app-version'),
  getAppName: () => ipcMain.invoke('get-app-name')
})
