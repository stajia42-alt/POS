const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pc', {
  isElectron: true,
  listPrinters: () => ipcRenderer.invoke('printers:list'),
  printPreview: (html, printerName, paper) => ipcRenderer.invoke('printer:print-preview', html, printerName, paper),
  printRaw: (printerName, bytes) => ipcRenderer.invoke('printer:raw', { printerName, bytes }),
  openPrintersSettings: () => ipcRenderer.invoke('printers:open-settings'),
  sendEmail: (recipient, subject, body) => ipcRenderer.invoke('email:compose', recipient, subject, body),
  openExternal: (url) => ipcRenderer.invoke('external:open', url)
});
