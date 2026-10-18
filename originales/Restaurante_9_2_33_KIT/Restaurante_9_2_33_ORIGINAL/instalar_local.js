'use strict';
// Instalación por usuario; nunca detiene procesos ni reemplaza configuración o túneles.
const fs=require('fs'),path=require('path'),{spawnSync,execFileSync}=require('child_process');
const {version}=require('./version');
function instalar(){
 if(process.platform!=='win32')throw Error('Este instalador se ejecuta únicamente en Windows.');
 if(Number(process.versions.node.split('.')[0])<24)throw Error('Necesitas Node.js 24 o posterior.');
 if(!process.env.LOCALAPPDATA)throw Error('Windows no proporcionó la carpeta del usuario.');
 const base=path.join(process.env.LOCALAPPDATA,'AvilesTecnologias','Restaurante');
 const data=path.join(base,'datos'),stamp=new Date().toISOString().replace(/[:.]/g,'-');
 const stage=path.join(base,'versiones',version+'-'+stamp),stateFile=path.join(base,'instalacion.json');
 const old=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')):null;
 const legacy=process.env.PROGRAMDATA&&path.join(process.env.PROGRAMDATA,'Restaurante');
 const configDir=old?.configDir||(legacy&&fs.existsSync(path.join(legacy,'conexion.json'))?legacy:data);
 const source=__dirname;
 // Lista cerrada: los archivos de configuración, credenciales y bases del negocio no se copian.
 const manifest=JSON.parse(fs.readFileSync(path.join(source,'MANIFIESTO_APLICACION.json'),'utf8'));
 if(manifest.version!==version||!Array.isArray(manifest.files))throw Error('La distribución no coincide con su manifiesto.');
 const crypto=require('crypto');
 for(const item of manifest.files){
  if(typeof item.path!=='string'||path.isAbsolute(item.path)||item.path.split(/[\\/]/).includes('..'))throw Error('Ruta inválida en la distribución.');
  const bytes=fs.readFileSync(path.join(source,item.path));
  if(crypto.createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw Error('El archivo '+item.path+' está incompleto o cambió. Vuelve a extraer la distribución.');
 }
 console.log('Preparando Restaurante '+version+' en una carpeta nueva…');
 fs.mkdirSync(stage,{recursive:true});
 try{
  for(const item of manifest.files){const dest=path.join(stage,item.path);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(source,item.path),dest);}
  fs.copyFileSync(path.join(source,'MANIFIESTO_APLICACION.json'),path.join(stage,'MANIFIESTO_APLICACION.json'));
  // Reutilizar un entorno OCR existente: no actualiza sus paquetes ni modelos.
  const candidates=[path.join(source,'ocr-env','Scripts','python.exe'),old?.ocrPython,legacy&&path.join(legacy,'ocr-env','Scripts','python.exe')].filter(Boolean);
  let ocrPython=candidates.find(p=>fs.existsSync(p))||'';
  const installed={version,configDir,ocrPython,fecha:new Date().toISOString()};
  fs.writeFileSync(path.join(stage,'instalacion-local.json'),JSON.stringify(installed,null,2));
  const npm=path.join(path.dirname(process.execPath),'node_modules','npm','bin','npm-cli.js');
  if(!fs.existsSync(npm))throw Error('No se encontró npm junto a Node.js. Repara la instalación de Node.js.');
  console.log('Instalando las dependencias fijadas del programa…');
  const result=spawnSync(process.execPath,[npm,'ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],{cwd:stage,stdio:'inherit',windowsHide:true});
  if(result.error||result.status!==0)throw Error('No se pudieron instalar las dependencias. La versión anterior sigue disponible.');
  const probe=spawnSync(process.execPath,['-e',"require('express');require('mssql');require('exceljs');require('./interfaz');require('./menu_operaciones');console.log('Archivos y dependencias comprobados.');"],{cwd:stage,stdio:'inherit',windowsHide:true});
  if(probe.error||probe.status!==0)throw Error('La comprobación local no terminó correctamente.');
  fs.mkdirSync(configDir,{recursive:true});
  const start=path.join(stage,'ABRIR_RESTAURANTE.cmd');
  // Rutas por entorno; los datos del negocio nunca se interpolan en comandos.
  const script="$ErrorActionPreference='Stop'; $w=New-Object -ComObject WScript.Shell; $s=$w.CreateShortcut([IO.Path]::Combine([Environment]::GetFolderPath('Desktop'),'Restaurante 9.2.lnk')); $s.TargetPath=$env:RESTAURANTE_LAUNCHER; $s.WorkingDirectory=$env:RESTAURANTE_FOLDER; $s.Description='Restaurante - Aviles Tecnologias'; $s.Save()";
  execFileSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,RESTAURANTE_LAUNCHER:start,RESTAURANTE_FOLDER:stage}});
  // El puntero se publica sólo cuando terminaron la copia, instalación y acceso directo.
  if(old)fs.copyFileSync(stateFile,stateFile+'.anterior');
  fs.writeFileSync(stateFile+'.tmp',JSON.stringify({...installed,carpeta:stage,anterior:old?.carpeta||null},null,2));fs.renameSync(stateFile+'.tmp',stateFile);
  console.log('\nInstalación local preparada. Acceso directo: Restaurante 9.2.');
  console.log('Configuración conservada en: '+configDir);
  console.log('Cierra la versión anterior de Restaurante antes de abrir ésta. No cierres SQL Server ni Soft Restaurant.');
  console.log('Esta edición requiere validación en Soft Restaurant antes de distribuirse a clientes.');
 }catch(e){
  console.error('No se cambió la configuración del negocio. Carpeta de esta instalación: '+stage);
  // Se conserva la carpeta incompleta para diagnóstico; no se borra ninguna versión previa.
  throw e;
 }
}
if(require.main===module)try{instalar();}catch(e){console.error('ERROR: '+e.message);process.exitCode=1;}
module.exports={instalar};
