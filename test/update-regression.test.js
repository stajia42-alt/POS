'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
const {readAsarPackage,assertWindowsX64,buildUpdate}=require('../scripts/build-update');
function fakeWindowsX64(file){
 const pe=Buffer.alloc(128);pe.writeUInt16LE(0x5a4d,0);pe.writeUInt32LE(64,60);pe.writeUInt32LE(0x4550,64);pe.writeUInt16LE(0x8664,68);fs.writeFileSync(file,pe);
}
function fakeAsar(file,pkg){
 const body=Buffer.from(JSON.stringify(pkg));
 const json=Buffer.from(JSON.stringify({files:{'package.json':{size:body.length,offset:'0'}}}));
 const headerSize=8+json.length,prefix=Buffer.alloc(16);
 prefix.writeUInt32LE(4,0);prefix.writeUInt32LE(headerSize,4);prefix.writeUInt32LE(headerSize-4,8);prefix.writeUInt32LE(json.length,12);
 fs.writeFileSync(file,Buffer.concat([prefix,json,body]));
}
test('Actualizador identifica el paquete ASAR y rechaza archivos truncados',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'parking-asar-'));
 try{
  const file=path.join(dir,'app.asar');fakeAsar(file,{name:'parking-pos-desktop',version:'1.0.11',main:'desktop/main.js'});
  assert.equal(readAsarPackage(file).version,'1.0.11');
  fs.truncateSync(file,17);assert.throws(()=>readAsarPackage(file),/incompleto/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
function fakeDistribution(root){
 const pkg={name:'parking-pos-desktop',version:'1.0.11',main:'desktop/main.js'};
 fs.writeFileSync(path.join(root,'package.json'),JSON.stringify(pkg));
 const payload=path.join(root,'INSTALADOR_WINDOWS','win-unpacked');
 fs.mkdirSync(path.join(payload,'resources','app.asar.unpacked'),{recursive:true});
 fakeAsar(path.join(payload,'resources','app.asar'),pkg);
 for(const name of ['Parking POS.exe','resources/app.asar.unpacked/better_sqlite3.node','resources/print-worker.ps1','resources/print-raw.ps1'])fs.writeFileSync(path.join(payload,name),name);
 fakeWindowsX64(path.join(payload,'Parking POS.exe'));fakeWindowsX64(path.join(payload,'resources/app.asar.unpacked/better_sqlite3.node'));
 fs.mkdirSync(path.join(root,'scripts'));fs.writeFileSync(path.join(root,'scripts','update-windows.ps1'),'# placeholder');fs.writeFileSync(path.join(root,'ACTUALIZAR_WINDOWS.cmd'),'@echo off');
 return payload;
}
test('Actualizador genera inventario de distribución completa y detecta datos o enlaces impropios',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'parking-update-'));
 try{
  const payload=fakeDistribution(dir);const result=buildUpdate(dir,payload);
  const manifest=JSON.parse(fs.readFileSync(path.join(result.out,'manifest.json')));
  assert.equal(manifest.version,'1.0.11');assert.equal(manifest.files.length,5);
  assert.ok(manifest.files.every(x=>/^[a-f0-9]{64}$/.test(x.sha256)));
  fs.writeFileSync(path.join(payload,'parking.db'),'never ship client data');
  assert.throws(()=>buildUpdate(dir,payload),/datos operativos/);
  fs.unlinkSync(path.join(payload,'parking.db'));
  // Windows permits directory junctions without Developer Mode/admin privileges.
  fs.symlinkSync(payload,path.join(payload,'linked-runtime'),process.platform==='win32'?'junction':'dir');
  assert.throws(()=>buildUpdate(dir,payload),/enlaces/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Actualizador no acepta un módulo SQLite de Linux o Windows de otra arquitectura',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'parking-update-abi-'));
 try{
  const payload=fakeDistribution(dir),file=path.join(payload,'resources/app.asar.unpacked/better_sqlite3.node');
  fs.writeFileSync(file,Buffer.from([0x7f,0x45,0x4c,0x46]));
  assert.throws(()=>buildUpdate(dir,payload),/Windows x64/);
  fakeWindowsX64(file);const pe=fs.readFileSync(file);pe.writeUInt16LE(0x14c,68);fs.writeFileSync(file,pe);
  assert.throws(()=>assertWindowsX64(file),/Windows x64/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Actualizador rechaza un ASAR viejo dentro de un runtime nuevo',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'parking-update-old-'));
 try{
  const payload=fakeDistribution(dir);
  fakeAsar(path.join(payload,'resources','app.asar'),{name:'parking-pos-desktop',version:'1.0.10',main:'desktop/main.js'});
  assert.throws(()=>buildUpdate(dir,payload),/no corresponde/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Recuperación revierte desplazamiento si falla colocar la base recuperada',async()=>{
 const {openStorage}=require('../lib/storage');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'parking-recover-rollback-'));
 try{
  const storage=await openStorage(dir);const backup=await storage.backup('regression');await storage.close();
  const file=path.join(dir,'parking.db'),before=fs.readFileSync(file);
  fs.writeFileSync(path.join(dir,'restore-pending.json'),'{"must":"survive rollback"}');
  const nativeRequire=createRequire(path.join(__dirname,'..','scripts','recover.js'));let injected=false;
  const patchedFS=Object.create(fs);
  patchedFS.renameSync=(from,to)=>{
   if(from===path.join(dir,'recovery-ready.db')&&to===file&&!injected){injected=true;throw Error('Simulated disk error');}
   return fs.renameSync(from,to);
  };
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','scripts','recover.js'),'utf8'),{
   module,exports:module.exports,require:name=>name==='fs'?patchedFS:nativeRequire(name),process,console,__dirname:path.join(__dirname,'..','scripts')
  });
  await assert.rejects(module.exports.recover(dir,backup.file,'RECUPERAR'),/Simulated disk error/);
  assert.equal(injected,true);assert.deepEqual(fs.readFileSync(file),before);
  assert.equal(fs.readFileSync(path.join(dir,'restore-pending.json'),'utf8'),'{"must":"survive rollback"}');
  assert.equal(fs.existsSync(path.join(dir,'server.lock')),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
