'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const os=require('os');
const path=require('path');
const Database=require('better-sqlite3');
const {openStorage,assertPreservesHistory,validateFile}=require('../lib/storage');

const AT='2026-10-12T15:00:00.000Z';
async function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'parking-history-regression-'));
 let storage=await openStorage(dir);
 t.after(async()=>{await storage.close();fs.rmSync(dir,{recursive:true,force:true});});
 const db=storage.db;
 db.transaction(()=>{
  db.prepare('INSERT INTO users(id,username,password_hash,role,created_at) VALUES(1,?,?,?,?)').run('owner','test-fixture-only','admin',AT);
  db.prepare(`INSERT INTO clients(id,name,plate,kind,valid_from,valid_to,window_start,window_end,created_at)
   VALUES(1,'Cliente semanal','TEST123','pension',?,?,'00:00','23:59',?)`).run(AT,'2099-12-31T23:59:59.000Z',AT);
  db.prepare(`INSERT INTO pension_contracts(client_id,anchor_at,period,price_cents,next_index,created_at,updated_at)
   VALUES(1,?,'weekly',50000,1,?,?)`).run(AT,AT,AT);
  db.prepare(`INSERT INTO requests(key,fingerprint,response,created_at,user_id)
   VALUES('history-test-request','fixture-fingerprint','{"ok":true}',?,1)`).run(AT);
 })();
 return {dir,get storage(){return storage;},get db(){return storage.db;},
  async restart(){await storage.close();storage=await openStorage(dir);return storage;}};
}
function addSettlement(db){
 db.transaction(()=>{
  db.prepare(`INSERT INTO shifts(id,opened_at,closed_at,shift_type,user_id)
   VALUES(1,?,?,'DAY',1)`).run(AT,AT);
  db.prepare(`INSERT INTO shifts(id,opened_at,shift_type,user_id)
   VALUES(2,?,'NIGHT',1)`).run(AT);
  db.prepare(`INSERT INTO cash_movements(id,shift_id,kind,amount_cents,reason,created_at,currency,user_id)
   VALUES(1,2,'out',2500,'Entrega al turno Día #1',?,'MXN',1)`).run(AT);
  db.prepare(`INSERT INTO shift_settlements(id,origin_shift_id,collecting_shift_id,amount_cents,currency,cash_movement_id,created_at,user_id)
   VALUES(1,1,2,2500,'MXN',1,?,1)`).run(AT);
 })();
}
function alterBackup(file,sql){
 const copy=new Database(file);
 try{copy.exec(sql);}finally{copy.close();}
}

test('SQLite: respaldo con pensión y solicitudes conserva claves client_id/key y restaura al reiniciar',async t=>{
 const f=await fixture(t);
 const contract=f.db.prepare('SELECT * FROM pension_contracts WHERE client_id=1').get();
 const request=f.db.prepare('SELECT * FROM requests').get();
 const b=await f.storage.backup();
 assert.doesNotThrow(()=>assertPreservesHistory(f.db,b.file));
 assert.doesNotThrow(()=>f.storage.stageRestore(b.name));
 await f.restart();
 assert.deepEqual(f.db.prepare('SELECT * FROM pension_contracts WHERE client_id=1').get(),contract);
 assert.deepEqual(f.db.prepare('SELECT * FROM requests').get(),request);
 assert.equal(f.db.pragma('integrity_check',{simple:true}),'ok');
});

test('SQLite: la restauración rechaza una entrega al Día eliminada aunque el retiro siga registrado',async t=>{
 const f=await fixture(t);addSettlement(f.db);
 const b=await f.storage.backup();
 alterBackup(b.file,'DELETE FROM shift_settlements WHERE id=1');
 assert.equal(validateFile(b.file),true);
 assert.throws(()=>assertPreservesHistory(f.db,b.file),/shift_settlements/);
 assert.throws(()=>f.storage.stageRestore(b.name),/shift_settlements/);
 assert.equal(fs.existsSync(path.join(f.dir,'restore-pending.json')),false);
 assert.equal(f.db.prepare('SELECT amount_cents FROM shift_settlements WHERE id=1').get().amount_cents,2500);
});

test('SQLite: la restauración rechaza importes alterados en la conciliación entre turnos',async t=>{
 const f=await fixture(t);addSettlement(f.db);
 const b=await f.storage.backup();
 alterBackup(b.file,'UPDATE shift_settlements SET amount_cents=1500 WHERE id=1');
 assert.equal(validateFile(b.file),true);
 assert.throws(()=>assertPreservesHistory(f.db,b.file),/shift_settlements/);
 assert.equal(f.db.prepare('SELECT amount_cents FROM cash_movements WHERE id=1').get().amount_cents,2500);
});

test('SQLite: la restauración rechaza un contrato semanal modificado sin tocar el actual',async t=>{
 const f=await fixture(t);
 const b=await f.storage.backup();
 alterBackup(b.file,'UPDATE pension_contracts SET price_cents=10000,next_index=3 WHERE client_id=1');
 assert.equal(validateFile(b.file),true);
 assert.throws(()=>assertPreservesHistory(f.db,b.file),/pension_contracts/);
 assert.equal(f.db.prepare('SELECT price_cents FROM pension_contracts WHERE client_id=1').get().price_cents,50000);
});
