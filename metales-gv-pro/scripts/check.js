'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
for(const dir of ['src','public','scripts','tests']) for(const file of fs.readdirSync(path.join(__dirname,'..',dir))) if(/\.(js|cjs)$/.test(file)) execFileSync(process.execPath,['--check',path.join(__dirname,'..',dir,file)],{stdio:'inherit'});
console.log('Sintaxis JavaScript válida.');
