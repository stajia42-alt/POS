'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const asar=require('@electron/asar');
const archive=path.resolve('dist/win-unpacked/resources/app.asar'),files=asar.listPackage(archive).map(file=>file.replace(/\\/g,'/'));
for(const directory of ['src','public']) for(const name of fs.readdirSync(directory)) {
 const file=directory+'/'+name;if(!fs.statSync(file).isFile())continue;
 assert.deepEqual(asar.extractFile(archive,file),fs.readFileSync(file),'Paquete desactualizado: '+file);
}
assert.ok(files.includes('/node_modules/sql.js/dist/sql-wasm.wasm'),'Falta el motor SQLite');
assert.ok(!files.some(f=>/\/(originales|mssql|playwright|electron-builder)\//.test(f)),'Dependencia ajena al runtime');
const installer=path.resolve(`dist/METales-GV-Pro-Setup-${require('../package.json').version}-x64.exe`);
const stat=fs.statSync(installer);assert.ok(stat.size>20*1024*1024,'Instalador incompleto');
const fd=fs.openSync(installer,'r'),header=Buffer.alloc(2);fs.readSync(fd,header,0,2,0);fs.closeSync(fd);assert.equal(header.toString(),'MZ');
console.log(`Paquete verificado: ${files.length} entradas; código fuente coincidente; instalador ${(stat.size/1024/1024).toFixed(1)} MiB.`);
