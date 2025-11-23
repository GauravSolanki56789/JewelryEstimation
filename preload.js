const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    downloadUpdate: (downloadUrl) => ipcRenderer.invoke('download-update', downloadUrl),
    installUpdate: (installerPath) => ipcRenderer.invoke('install-update', installerPath)
});

