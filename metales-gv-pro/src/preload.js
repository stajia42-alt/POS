'use strict';
// Puente acotado derivado del preload PC V15. No expone Node ni IPC arbitrario.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pc', {
 isElectron: true,
 listPrinters: () => ipcRenderer.invoke('printers:list'),
 print: payload => ipcRenderer.invoke('printer:print', payload),
 openPrintersSettings: () => ipcRenderer.invoke('printers:open-settings')
});
