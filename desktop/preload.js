 'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('parkingDesktop',Object.freeze({
  isDesktop:true,
  listPrinters:()=>ipcRenderer.invoke('parking:list-printers')
}));
