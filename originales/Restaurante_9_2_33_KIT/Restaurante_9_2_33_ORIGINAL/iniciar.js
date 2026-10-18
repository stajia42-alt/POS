'use strict';
const http=require('http');
const {execFile}=require('child_process');
const version=require('./version').version;
const fs=require('fs'),path=require('path');
const marker=path.join(__dirname,'instalacion-local.json');
if(fs.existsSync(marker)){
 try{const data=JSON.parse(fs.readFileSync(marker,'utf8'));if(!path.isAbsolute(data.configDir))throw Error('Ruta no válida');process.env.RESTAURANTE_CONFIG_DIR=process.env.RESTAURANTE_CONFIG_DIR||data.configDir;if(data.ocrPython&&path.isAbsolute(data.ocrPython)&&fs.existsSync(data.ocrPython))process.env.RESTAURANTE_PYTHON=process.env.RESTAURANTE_PYTHON||data.ocrPython;}
 catch(e){console.error('No se pudo leer la configuración de instalación. '+e.message);process.exit(1);}
}
function abrir(){if(process.platform==='win32')execFile('cmd.exe',['/c','start','','http://127.0.0.1:3000'],{windowsHide:true},()=>{});}
function iniciar(){process.env.RESTAURANTE_ABRIR='1';require('./app');}
const request=http.get('http://127.0.0.1:3000/api/estado',{timeout:2500},res=>{
 let body='';res.on('data',chunk=>{body+=chunk;if(body.length>10000)res.destroy();});
 res.on('end',()=>{let status;try{status=JSON.parse(body);}catch{}
  if(status?.version===version&&status.correcto){console.log('Restaurante '+version+' ya está abierto. Abriendo el navegador...');abrir();}
  else{console.error('El puerto 3000 ya está ocupado'+(status?.version?' por Restaurante '+status.version:'.'));console.error('Cierra la ventana o la instancia anterior de Restaurante y vuelve a abrir este archivo. No cierres SQL Server ni Soft Restaurant.');process.exitCode=1;}
 });
});
request.on('timeout',()=>request.destroy(Object.assign(new Error('Tiempo de espera agotado'),{code:'ETIMEDOUT'})));
request.on('error',e=>{if(e.code==='ECONNREFUSED')iniciar();else{console.error('No se pudo comprobar el puerto 3000: '+e.message);console.error('Revisa si hay otra instancia de Restaurante abierta.');process.exitCode=1;}});
