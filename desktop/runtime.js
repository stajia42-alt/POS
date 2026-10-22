 'use strict';
const path=require('node:path');
const fs=require('node:fs');
function legacyDataDir(env=process.env,fallback=process.cwd()){
 const candidate=env.LOCALAPPDATA;
 if (typeof candidate==='string' && candidate.trim()) return path.join(candidate,'ParkingPOS');
 // Linux/macOS only for development. Windows installed clients normally have LOCALAPPDATA.
 return path.join(fallback,'ParkingPOS');
}
function listenLocal(expressApp,host='127.0.0.1',port=0){
 if(host!=='127.0.0.1')throw Error('Se requiere interfaz local 127.0.0.1');
 return new Promise((resolve,reject)=>{
  const server=expressApp.listen(port,host);
  server.once('listening',()=>resolve(server));
  server.once('error',reject);
 });
}
function formatStartupError(e){
 const message=(e?.message||String(e)).slice(0,1500);
 return 'No se pudo completar el inicio de Parking POS. No borres ni reemplaces la base de datos.\n\n'
  +message+'\n\nSi ya está abierto Parking POS, cierra la otra ventana.\n'
  +'Revisa el registro en %LOCALAPPDATA%\\ParkingPOS\\logs\\desktop.log.';
}
module.exports={legacyDataDir,listenLocal,formatStartupError};
