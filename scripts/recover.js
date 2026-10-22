'use strict';
// Offline disaster recovery. The whole previous database family is preserved.
const fs=require('fs'),path=require('path'),Database=require('better-sqlite3'),readline=require('readline/promises');
const {validateFile,assertPreservesHistory,acquireLock}=require('../lib/storage');
async function recover(dir,source,confirmation){
 if(confirmation!=='RECUPERAR')throw Error('Confirmación requerida: RECUPERAR');
 source=path.resolve(source);validateFile(source);fs.mkdirSync(dir,{recursive:true});const release=acquireLock(dir),file=path.join(dir,'parking.db');let current;
 try{
  if(source===path.resolve(file))throw Error('Selecciona un respaldo, no la base activa');
  let readable=false;
  if(fs.existsSync(file)){
   try{current=new Database(file,{readonly:true,fileMustExist:true});readable=current.pragma('integrity_check',{simple:true})==='ok';}catch{readable=false;}
   if(readable){try{assertPreservesHistory(current,source);}finally{current.close();current=null;}}
   else if(current){current.close();current=null;}
  }
  const archive=path.join(dir,'recovery-archive',new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(archive,{recursive:true});
  // All files are copied before any are moved. The copy remains if power fails.
  const names=['parking.db','parking.db-wal','parking.db-shm','restore-pending.json'];
  for(const name of names)if(fs.existsSync(path.join(dir,name)))fs.copyFileSync(path.join(dir,name),path.join(archive,name));
  fs.writeFileSync(path.join(archive,'RECOVERY.json'),JSON.stringify({at:new Date().toISOString(),source,priorReadable:readable,note:'Archivos originales conservados. Si estaban dañados, los movimientos posteriores al respaldo requieren recuperación y conciliación manual.'},null,2));
  const temp=path.join(dir,'recovery-ready.db');fs.copyFileSync(source,temp);validateFile(temp);
  const candidate=new Database(temp);try{if(candidate.prepare("SELECT name FROM sqlite_master WHERE name='sessions'").get())candidate.exec('DELETE FROM sessions');candidate.pragma('wal_checkpoint(TRUNCATE)');}finally{candidate.close();}
  // If any rename fails, restore all already-displaced originals before returning.
  // Leaving parking.db absent would allow the next start to create an empty DB.
  const displaced=[];
  try{
   for(const name of names)if(fs.existsSync(path.join(dir,name))){
    fs.renameSync(path.join(dir,name),path.join(archive,'displaced-'+name));
    displaced.push(name);
   }
   fs.renameSync(temp,file);
  }catch(error){
   const rollbackErrors=[];
   for(const name of displaced.reverse()){
    try{fs.renameSync(path.join(archive,'displaced-'+name),path.join(dir,name));}
    catch(e){rollbackErrors.push(name+': '+e.message);}
   }
   if(rollbackErrors.length)throw Error(error.message+'; recuperación pendiente de los originales en '+archive+': '+rollbackErrors.join('; '));
   throw error;
  }
  return {ok:true,archive,priorReadable:readable};
 }finally{if(current?.open)current.close();release();}
}
module.exports={recover};
if(require.main===module)(async()=>{
 const rl=readline.createInterface({input:process.stdin,output:process.stdout});
 try{
  const dir=process.env.PARKING_DATA_DIR||path.join(process.env.LOCALAPPDATA||path.join(__dirname,'..'),'ParkingPOS');
  console.log('RECUPERACION SIN SERVIDOR. Cierra Parking POS y cualquier otra aplicación que use esta base.');
  console.log('Los archivos originales se conservarán en recovery-archive. No se permite retroceder una base sana perdiendo históricos.');
  const source=(await rl.question('Ruta completa del respaldo .db: ')).trim().replace(/^"|"$/g,'');
  const confirmation=await rl.question('Escribe RECUPERAR para continuar: ');
  const r=await recover(dir,source,confirmation);console.log('Respaldo recuperado. Originales:',r.archive);
  if(!r.priorReadable)console.log('La base anterior no era legible o no existía. Concilia los movimientos posteriores al respaldo antes de operar.');
 }finally{rl.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
