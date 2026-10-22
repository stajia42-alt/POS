 'use strict';
/**
 * Parking POS desktop launcher. No browser, no network listener outside loopback.
 * It runs the SAME Express/SQLite core used by the existing local project.
 */
const {app, BrowserWindow, dialog, ipcMain, session} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const {listenLocal, legacyDataDir, formatStartupError} = require('./runtime');

const productTitle = 'Parking POS';
let win = null;
let server = null;
let core = null;
let stopping = false;
let baseUrl = null;
let quittingAfterStop = false;
let logDir = null;

// Block a second instance before touching the SQLite database.
const hasInstanceLock = app.requestSingleInstanceLock();
if (!hasInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
  });
}

function log(message) {
  const line = new Date().toISOString() + ' ' + String(message).replace(/[\r\n]+/g,' ') + '\n';
  try { if(logDir){fs.mkdirSync(logDir,{recursive:true});fs.appendFileSync(path.join(logDir,'desktop.log'),line);} }catch(_){}
  console.error(line.trim());
}

function makeWindow() {
  win = new BrowserWindow({
    title:productTitle,
    width:1380,minWidth:1000,height:850,minHeight:690,
    show:false,backgroundColor:'#0a1423',
    icon:path.join(__dirname,'icon.png'),
    autoHideMenuBar:true,
    webPreferences:{
      nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,
      preload:path.join(__dirname,'preload.js'),
      devTools:!app.isPackaged,
      spellcheck:false
    }
  });
  win.once('ready-to-show',()=>win && win.show());
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event,url)=>{
    if(!baseUrl || !url.startsWith(baseUrl+'/'))event.preventDefault();
  });
  win.webContents.on('will-redirect',(event,url)=>{
    if(!baseUrl || !url.startsWith(baseUrl+'/'))event.preventDefault();
  });
  win.webContents.on('did-fail-load',(_e,code,description,url,isMainFrame)=>{
    if(isMainFrame) log(`Error cargando la aplicación: ${code} ${description} ${url}`);
  });
  win.on('closed',()=>{win=null;});
  win.loadURL(baseUrl+'/').catch(e=>log('No se pudo abrir la interfaz: '+e.message));
  return win;
}

async function start() {
  // Existing versions save data here. NEVER relocate/create a second silent copy.
  const dir=legacyDataDir(process.env,app.getPath('userData'));
  process.env.PARKING_DATA_DIR=dir;
  process.env.PARKING_PRINT_WORKER=app.isPackaged
    ?path.join(process.resourcesPath,'print-worker.ps1')
    :path.join(__dirname,'..','print-worker.ps1');
  process.env.PARKING_PRINT_SCRIPT=app.isPackaged
    ?path.join(process.resourcesPath,'print-raw.ps1')
    :path.join(__dirname,'..','print-raw.ps1');
  logDir=path.join(dir,'logs');
  log('Iniciando Parking POS Desktop. Datos existentes: '+dir);
  log('Controlador RAW ESC/POS: '+process.env.PARKING_PRINT_SCRIPT);
  const {createApp}=require('../server');
  const started=await createApp({dir});
  // Precalienta impresión RAW al iniciar; evita arrancar PowerShell al recibir el primer auto.
  if(process.platform==='win32')require('../lib/print-spooler').shared.warm().catch(e=>log('Impresión rápida no disponible, se usará respaldo: '+e.message));
  core=started;
  try {
    server=await listenLocal(started.app,'127.0.0.1',0);
    const address=server.address();
    baseUrl='http://127.0.0.1:'+address.port;
    log('Servidor privado en '+baseUrl+' (no accesible desde otras computadoras)');
    makeWindow();
  }catch(error){
    try {await started.close();}catch(e){log('No se pudo cerrar SQLite: '+e.message);}
    core=null;
    throw error;
  }
}

// List only already-installed Windows printers; printer drivers cannot be installed generically.
ipcMain.handle('parking:list-printers',async(event)=>{
  if(!win || event.sender!==win.webContents)return [];
  try{
    const found=await win.webContents.getPrintersAsync();
    return found.map(p=>({name:p.name,displayName:p.displayName||p.name,isDefault:!!p.isDefault}));
  }catch(e){log('Error detectando impresoras: '+e.message);return [];}
});

app.on('window-all-closed',()=>app.quit());
app.on('activate',()=>{if(!win&&baseUrl)makeWindow();});
app.on('before-quit',event=>{
  if(quittingAfterStop || (!core&&!server))return;
  event.preventDefault();
  if(stopping)return;
  stopping=true;
  (async()=>{
    if(server){
      const listening=server;
      // A payment may already be committed while its receipt waits for the RAW
      // spooler. Wait for active requests to finish before closing SQLite.
      await new Promise(resolve=>{listening.close(()=>resolve());listening.closeIdleConnections?.();});
      server=null;
    }
    if(core){require('../lib/print-spooler').shared.close();await core.close();core=null;}
  })().catch(e=>log('Error al cerrar: '+e.stack)).finally(()=>{
    quittingAfterStop=true;
    app.quit();
  });
});

app.whenReady().then(async()=>{
  if(!hasInstanceLock)return;
  try {
    // Electron's embedded Chromium loads only our random-port local service.
    session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
    session.defaultSession.setPermissionCheckHandler(()=>false);
    await start();
  }catch(e){
    log('ERROR AL INICIAR: '+(e.stack||e));
    dialog.showErrorBox('Parking POS no pudo iniciar',formatStartupError(e));
    app.quit();
  }
});
