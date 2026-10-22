'use strict';
// Run only after electron-builder produced a COMPLETE Windows x64 distribution.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function assertWindowsX64(file){
 const fd=fs.openSync(file,'r');
 try{
  const dos=Buffer.alloc(64);if(fs.readSync(fd,dos,0,64,0)!==64||dos.readUInt16LE(0)!==0x5a4d)throw Error('Falta binario Windows x64: '+path.basename(file));
  const offset=dos.readUInt32LE(60),pe=Buffer.alloc(6);
  if(offset<64||fs.readSync(fd,pe,0,6,offset)!==6||pe.readUInt32LE(0)!==0x4550||pe.readUInt16LE(4)!==0x8664)throw Error('Binario distinto de Windows x64: '+path.basename(file));
 }finally{fs.closeSync(fd);}
}
function readAsarPackage(file){
 const fd=fs.openSync(file,'r');
 try{
  const prefix=Buffer.alloc(16);if(fs.readSync(fd,prefix,0,16,0)!==16||prefix.readUInt32LE(0)!==4)throw Error('ASAR inválido');
  const headerSize=prefix.readUInt32LE(4),jsonSize=prefix.readUInt32LE(12);
  if(headerSize<8||headerSize>64*1024*1024||jsonSize>headerSize-8)throw Error('Cabecera ASAR inválida');
  const header=Buffer.alloc(jsonSize);if(fs.readSync(fd,header,0,jsonSize,16)!==jsonSize)throw Error('ASAR incompleto');
  const item=JSON.parse(header.toString('utf8')).files?.['package.json'];
  if(!item||item.unpacked||!Number.isSafeInteger(item.size)||item.size<1||item.size>1024*1024||!/^\d+$/.test(item.offset))throw Error('Falta package.json válido dentro de app.asar');
  const content=Buffer.alloc(item.size);if(fs.readSync(fd,content,0,item.size,8+headerSize+Number(item.offset))!==item.size)throw Error('package.json incompleto');
  return JSON.parse(content.toString('utf8'));
 }finally{fs.closeSync(fd);}
}
function inventory(root){
 const files=[];
 function walk(dir){
  for(const item of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
   const full=path.join(dir,item.name),relative=path.relative(root,full).split(path.sep).join('/');
   if(item.isSymbolicLink())throw Error('No se permiten enlaces en la distribución: '+relative);
   if(item.isDirectory())walk(full);
   else if(item.isFile()){
    if(/(^|\/)parking\.db(?:-wal|-shm)?$/i.test(relative))throw Error('La distribución contiene datos operativos: '+relative);
    files.push({path:relative,size:fs.statSync(full).size,sha256:sha(full)});
   }else throw Error('Archivo no regular: '+relative);
  }
 }
 walk(root);return files;
}
function buildUpdate(project=path.join(__dirname,'..'),payload=path.join(project,'INSTALADOR_WINDOWS','win-unpacked')){
 const pkg=JSON.parse(fs.readFileSync(path.join(project,'package.json'),'utf8'));
 const packed=readAsarPackage(path.join(payload,'resources','app.asar'));
 if(packed.name!=='parking-pos-desktop'||packed.main!=='desktop/main.js'||packed.version!==pkg.version)throw Error('La distribución no corresponde a esta versión de Parking POS');
 if(!fs.statSync(path.join(payload,'Parking POS.exe')).isFile())throw Error('Falta Parking POS.exe');
 const files=inventory(payload);
 if(!files.some(f=>/better_sqlite3\.node$/.test(f.path)))throw Error('Falta SQLite nativo de Windows en la distribución');
 assertWindowsX64(path.join(payload,'Parking POS.exe'));
 for(const item of files.filter(f=>/better_sqlite3\.node$/.test(f.path)))assertWindowsX64(path.join(payload,item.path));
 if(!files.some(f=>f.path==='resources/print-worker.ps1')||!files.some(f=>f.path==='resources/print-raw.ps1'))throw Error('Faltan controladores de impresión');
 const manifest={format:1,product:'Parking POS',name:pkg.name,version:pkg.version,platform:'win32',arch:'x64',executable:'Parking POS.exe',files};
 const out=path.join(project,'INSTALADOR_WINDOWS','ACTUALIZADOR');fs.mkdirSync(out,{recursive:true});
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 fs.copyFileSync(path.join(project,'scripts','update-windows.ps1'),path.join(out,'update-windows.ps1'));
 fs.copyFileSync(path.join(project,'ACTUALIZAR_WINDOWS.cmd'),path.join(out,'ACTUALIZAR_WINDOWS.cmd'));
 return {out,version:pkg.version,files:files.length};
}
module.exports={readAsarPackage,inventory,assertWindowsX64,buildUpdate};
if(require.main===module){try{const r=buildUpdate();console.log('Actualizador completo preparado:',r.out,'versión',r.version,'archivos',r.files);}catch(e){console.error('No se generó actualizador:',e.message);process.exitCode=1;}}
