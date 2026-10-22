'use strict';
const Database=require('better-sqlite3'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const stamp=()=>new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(3).toString('hex');
function validateFile(file){const d=new Database(file,{readonly:true,fileMustExist:true});try{if(d.pragma('integrity_check',{simple:true})!=='ok')throw Error('Respaldo SQLite dañado');for(const t of ['tickets','payments','shifts','config','audit'])if(!d.prepare('SELECT name FROM sqlite_master WHERE type=? AND name=?').get('table',t))throw Error('No es una base de Parking POS');if(d.pragma('foreign_key_check').length)throw Error('Referencias SQLite inválidas');return true;}finally{d.close();}}
function assertPreservesHistory(db,file){
 validateFile(file);const other=new Database(file,{readonly:true});
 try{
  // Restoring an older snapshot must never silently discard or rewrite history.
  for(const table of ['tickets','payments','payment_adjustments','shifts','cash_movements','shift_settlements','clients','users','audit','exchange_rate_changes','reprints','shift_prints','requests','shift_handoffs','pension_contracts','pension_charges','pension_allocations','pension_manual_debts','pension_manual_allocations']){
   const exists=db.prepare('SELECT name FROM sqlite_master WHERE type=? AND name=?').get('table',table);if(!exists)continue;
   const rows=db.prepare('SELECT * FROM '+table).iterate();
   const there=other.prepare('SELECT name FROM sqlite_master WHERE type=? AND name=?').get('table',table);
   // Most ledgers use id, but requests uses key and pension_contracts uses
   // client_id. Resolve the declared key instead of assuming every row has id.
   const keys=db.prepare('PRAGMA table_info('+table+')').all().filter(c=>c.pk).sort((a,b)=>a.pk-b.pk).map(c=>c.name);
   if(!keys.length)throw Error('No se puede verificar la clave del historial de '+table);
   const where=keys.map(k=>'"'+k.replace(/"/g,'""')+'"=?').join(' AND ');
   for(const row of rows){if(!there)throw Error('El respaldo omite históricos de '+table);
    const old=other.prepare(`SELECT * FROM ${table} WHERE ${where}`).get(...keys.map(k=>row[k]));
    if(!old||Object.keys(row).some(k=>row[k]!==old[k]))throw Error('El respaldo es anterior o diferente al historial actual ('+table+'). Se bloqueó la restauración para conservar los registros.');
   }
  }
 }finally{other.close();}
}
// Restablecimiento de fábrica: elimina únicamente datos de la aplicación,
// nunca tablas ni migraciones. Transacción indivisible y SQLite secure_delete.
function eraseAllOperationalData(db){
 db.pragma('secure_delete = ON');
 const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> 'schema_migrations'").all().map(r=>r.name);
 db.pragma('foreign_keys = OFF');
 try{
  db.exec('BEGIN IMMEDIATE');
  try{
   for(const name of tables)db.prepare('DELETE FROM "'+name.replace(/"/g,'""')+'"').run();
   if(db.prepare("SELECT name FROM sqlite_master WHERE name='sqlite_sequence'").get())db.exec('DELETE FROM sqlite_sequence');
   db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
 }finally{db.pragma('foreign_keys = ON');}
 for(const name of tables){const n=db.prepare('SELECT COUNT(*) AS n FROM "'+name.replace(/"/g,'""')+'"').get().n;if(n)throw Error('Persisten registros en '+name);}
 if(db.pragma('foreign_key_check').length)throw Error('La base no pasó la validación de referencias');
 db.exec('VACUUM');
 db.pragma('wal_checkpoint(TRUNCATE)');
 return tables.length;
}
function acquireLock(dir){
 const file=path.join(dir,'server.lock');
 try{fs.writeFileSync(file,String(process.pid),{flag:'wx'});}catch(e){
  if(e.code!=='EEXIST')throw e;const pid=Number(fs.readFileSync(file,'utf8'));let alive=true;
  try{process.kill(pid,0);}catch(err){if(err.code==='ESRCH')alive=false;else throw Error('No se pudo verificar el proceso que usa SQLite');}
  if(alive)throw Error('Parking POS ya está abierto. No inicies una segunda instancia.');
  fs.unlinkSync(file);fs.writeFileSync(file,String(process.pid),{flag:'wx'});
 }
 return ()=>{try{if(fs.readFileSync(file,'utf8')===String(process.pid))fs.unlinkSync(file);}catch{}};
}
async function openStorage(dir){
 fs.mkdirSync(dir,{recursive:true});const release=acquireLock(dir),file=path.join(dir,'parking.db'),backupDir=path.join(dir,'backups');fs.mkdirSync(backupDir,{recursive:true});let db;
 try{
  db=new Database(file);db.pragma('busy_timeout = 5000');
  const pending=path.join(dir,'restore-pending.json');
  if(fs.existsSync(pending)){
   const {name}=JSON.parse(fs.readFileSync(pending,'utf8'));
   if(!/^parking-[\w.-]+\.db$/.test(name))throw Error('Respaldo inválido');const source=path.join(backupDir,name);
   assertPreservesHistory(db,source);
   await db.backup(path.join(backupDir,'parking-before-restore-'+stamp()+'.db'));
   db.pragma('wal_checkpoint(TRUNCATE)');db.close();db=null;
   const temporary=path.join(dir,'restore-verified.db');fs.copyFileSync(source,temporary);validateFile(temporary);
   // Rename old database aside first; a crash cannot erase it.
   fs.renameSync(file,path.join(backupDir,'parking-displaced-'+stamp()+'.db'));
   fs.renameSync(temporary,file);fs.unlinkSync(pending);db=new Database(file);
   if(db.prepare("SELECT name FROM sqlite_master WHERE name='sessions'").get())db.exec('DELETE FROM sessions');
  }
  const version=db.prepare("SELECT name FROM sqlite_master WHERE name='schema_migrations'").get()?db.prepare('SELECT MAX(version) v FROM schema_migrations').get().v:0;
  if(version>9)throw Error('La base pertenece a una versión posterior. No se abrirá con esta versión.');
  if(version<9){
   if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tickets'").get())await db.backup(path.join(backupDir,'parking-before-migration-'+stamp()+'.db'));
   db.transaction(()=>{if(version<2){require('../migrations/001-legacy')(db);require('../migrations/002-professional')(db);}if(version<3)require('../migrations/003-clients-print')(db);if(version<4)require('../migrations/004-day-night')(db);if(version<5)require('../migrations/005-handover')(db);if(version<6)require('../migrations/006-recurring-pensions')(db);if(version<7)require('../migrations/007-client-prices')(db);if(version<8)require('../migrations/008-unified-pension')(db);if(version<9)require('../migrations/009-manual-pension-debts')(db);}).immediate();
  }
  db.pragma('journal_mode = WAL');db.pragma('foreign_keys = ON');db.pragma('busy_timeout = 5000');
  if(db.pragma('quick_check',{simple:true})!=='ok')throw Error('SQLite no pasó la comprobación de integridad');
  let backupRunning=null,lastBackupError=null,lastBackup=null;
  async function backup(kind='manual'){
   if(backupRunning)return backupRunning;
   backupRunning=(async()=>{const name='parking-'+kind+'-'+stamp()+'.db',dest=path.join(backupDir,name);
    try{await db.backup(dest);validateFile(dest);lastBackup=name;lastBackupError=null;
     const autos=fs.readdirSync(backupDir).filter(n=>n.startsWith('parking-auto-')&&n.endsWith('.db')).sort().reverse();
     for(const n of autos.slice(48))fs.unlinkSync(path.join(backupDir,n));
     return {ok:true,name,file:dest};
    }catch(e){lastBackupError=e.message;try{fs.unlinkSync(dest);}catch{}throw e;}
   })();try{return await backupRunning;}finally{backupRunning=null;}
  }
  const timer=setInterval(()=>backup('auto').catch(e=>console.error('RESPALDO:',e.message)),60*60*1000);timer.unref();
  await backup('auto');
  // El restablecimiento no toma un respaldo previo: el usuario pidió borrar todo.
  // Se espera a cualquier respaldo en curso antes de vaciar el archivo activo.
  async function resetAll(){
   if(backupRunning)await backupRunning;
   const tables=eraseAllOperationalData(db);
   // Evita que un restablecimiento pendiente vuelva a llenar la base al reiniciar.
   for(const obsolete of [pending,path.join(dir,'restore-verified.db')]){
    if(fs.existsSync(obsolete))fs.unlinkSync(obsolete);
   }
   let deleted=0,failed=[];
   for(const name of fs.readdirSync(backupDir)){
    if(!/^parking-[\w.-]+\.db$/.test(name))continue;
    try{fs.unlinkSync(path.join(backupDir,name));deleted++;}catch(e){failed.push(name+': '+e.message);}
   }
   // Las actualizaciones anteriores guardaban copias del SQLite junto al ASAR.
   // Borra SOLAMENTE esas copias de datos; deja los ASAR necesarios para revertir código.
   const updateDir=path.join(dir,'Respaldos_Actualizaciones');
   if(fs.existsSync(updateDir))for(const item of fs.readdirSync(updateDir,{withFileTypes:true})){
    if(!item.isDirectory())continue;
    for(const databaseFile of ['parking.db','parking.db-wal','parking.db-shm']){
     const old=path.join(updateDir,item.name,databaseFile);
     try{if(fs.existsSync(old)){fs.unlinkSync(old);deleted++;}}catch(e){failed.push(old+': '+e.message);}
    }
   }
   lastBackup=null;lastBackupError=failed.length?'No se pudieron borrar todas las copias locales: '+failed.join('; '):null;
   return {ok:true,tables,deletedBackups:deleted,backupCleanupError:lastBackupError};
  }
  return {db,dir,backupDir,backup,resetAll,status:()=>({lastBackup,lastBackupError}),list:()=>fs.readdirSync(backupDir).filter(n=>/^parking-[\w.-]+\.db$/.test(n)).sort().reverse().map(name=>({name,bytes:fs.statSync(path.join(backupDir,name)).size})),stageRestore(name){if(!/^parking-[\w.-]+\.db$/.test(name))throw Error('Nombre de respaldo inválido');assertPreservesHistory(db,path.join(backupDir,name));fs.writeFileSync(pending,JSON.stringify({name}),{flag:'wx'});},async close(){clearInterval(timer);if(backupRunning)await backupRunning.catch(()=>{});if(db.open){db.pragma('wal_checkpoint(TRUNCATE)');db.close();}release();}};
 }catch(e){if(db?.open)db.close();release();throw e;}
}
module.exports={openStorage,validateFile,assertPreservesHistory,acquireLock,eraseAllOperationalData};
