'use strict';
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('node:path');
const { start } = require('./server');
const { rawPrint } = require('./printer');
const { assert } = require('./values');
let service, win, stopping = false, stopped = false;
app.setName('METales-GV Pro');
const escape = s => s.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
if (!app.requestSingleInstanceLock()) app.quit();
else {
 app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
 app.whenReady().then(async () => {
  service = await start({ port: 0, dataDir: process.env.METALES_DATA_DIR || path.join(app.getPath('userData'), 'data') });
  win = new BrowserWindow({ width: 1460, height: 940, minWidth: 980, minHeight: 680, backgroundColor: '#f3f6fa', icon: path.join(__dirname, '../public/brand.png'), autoHideMenuBar: true,
   webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-prevent-unload', event => {
   const choice = dialog.showMessageBoxSync(win, { type: 'question', buttons: ['Seguir trabajando', 'Descartar y salir'], defaultId: 0, cancelId: 0,
    message: 'Hay un ticket sin registrar.', detail: 'Los renglones sin confirmar no están guardados. ¿Quieres descartarlos?' });
   if (choice === 1) event.preventDefault();
  });
  win.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== service.url) event.preventDefault(); });
  win.webContents.session.setPermissionRequestHandler((contents, permission, callback) => callback(false));
  await win.loadURL(service.url);
  const trusted = event => { assert(event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame && new URL(event.senderFrame.url).origin === service.url, 'Origen IPC no permitido.', 403); };
  ipcMain.handle('printers:list', async event => { trusted(event); return event.sender.getPrintersAsync(); });
  ipcMain.handle('printers:open-settings', async event => { trusted(event); assert(process.platform === 'win32', 'Disponible en Windows.'); await shell.openExternal('ms-settings:printers'); return { success: true }; });
  ipcMain.handle('printer:print', async (event, payload) => {
   try {
    trusted(event); assert(payload && typeof payload.text === 'string' && payload.text.length > 0 && payload.text.length < 12000, 'Ticket demasiado largo o no válido.');
    assert(['58mm','80mm'].includes(payload.paper) && ['raw','driver'].includes(payload.mode), 'Formato de impresión no válido.');
    const printers = await event.sender.getPrintersAsync(); assert(printers.some(p => p.name === payload.printerName), 'La impresora no está instalada. Actualiza la lista y vuelve a seleccionarla.');
    if (payload.mode === 'raw') { assert(process.platform === 'win32', 'La impresión RAW requiere Windows.'); return await rawPrint(payload.printerName, payload.text, payload.cut === true); }
    const printWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true, nodeIntegration: false, javascript: false } });
    try {
     const width = payload.paper === '58mm' ? 58 : 80;
     await printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<!doctype html><html lang="es"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>@page{size:${width}mm auto;margin:0}body{width:${width-6}mm;margin:3mm;font:11px 'Courier New',monospace;color:#000}pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:0}</style><pre>${escape(payload.text)}</pre></html>`));
     return await new Promise(resolve => {
      let done = false;
      const finish = result => { if (done) return; done = true; clearTimeout(timer); resolve(result); };
      const timer = setTimeout(() => finish({ success: false, error: 'La impresora no respondió en 25 segundos. Comprueba la cola antes de reimprimir.' }), 25000);
      printWindow.webContents.print({ silent: true, deviceName: payload.printerName, printBackground: true, margins: { marginType: 'none' }, pageSize: { width: width * 1000, height: Math.min(2000000, Math.max(150000, payload.text.split('\n').length * 4500 + 12000)) } }, (success, reason) => finish({ success, error: reason || '' }));
     });
    } finally { if (!printWindow.isDestroyed()) printWindow.destroy(); }
   } catch (e) { return { success: false, error: e.message }; }
  });
 }).catch(error => { dialog.showErrorBox('No se pudo iniciar METales-GV Pro', error.message); app.quit(); });
 app.on('window-all-closed', () => app.quit());
 app.on('will-quit', event => {
  if (!service || stopped) return;
  event.preventDefault(); if (stopping) return;
  stopping = true; service.stop().finally(() => { stopped = true; app.quit(); });
 });
}
