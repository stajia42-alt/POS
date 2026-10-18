'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),os=require('os');
const express=require('express');
const gestion=require('../gestion'),seguridad=require('../menu_seguridad'),menu=require('../menu_ia');
async function harness(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'menu-audit-')),app=express();app.use(express.json());
 gestion({app,configDir:dir,esLocal:()=>true});seguridad({app});
 let connects=0;
 const conectar=async()=>{connects++;throw Error('SQL no disponible en esta prueba');};
 require('../menu_operaciones')({app,conectar,sql:require('mssql'),configDir:dir,soloLocal:(req,res,next)=>next()});
 menu({app,conectar,soloLocal:(req,res,next)=>next()});
 app.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base='http://127.0.0.1:'+server.address().port;
 return {get connects(){return connects;},async call(url,body,headers={}){const r=await fetch(base+url,{headers:{'Content-Type':'application/json',...headers},...(body!==undefined?{method:'POST',body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};},async close(){app.locals.ocr.cerrar();await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}};
}
test('interpretación funciona sin SQL; POST exige nonce y mismo origen',async()=>{
 const h=await harness();try{
  const s=(await h.call('/api/v9/session')).data;
  const body={lineas:['ARROZ FRITO','Pollo $219'],grupos:[{idgrupo:'03',descripcion:'FRIED RICE'}]};
  assert.equal((await h.call('/api/menu-ia/interpretar',body)).status,403);
  assert.equal((await h.call('/api/menu-ia/interpretar',body,{'X-CSRF-Token':s.nonce,Origin:'https://otra-pagina.invalid'})).status,403);
  const r=await h.call('/api/menu-ia/interpretar',body,{'X-CSRF-Token':s.nonce});assert.equal(r.status,200);assert.equal(r.data.productos[0].nombre,'Arroz frito pollo');assert.equal(r.data.productos[0].idgrupo,'03');assert.equal(h.connects,0);
 }finally{await h.close();}
});
test('guardar, ensayar y crear grupos no alcanzan SQL antes de validar estructura',async()=>{
 const h=await harness();try{
  const s=(await h.call('/api/v9/session')).data;
  for(const route of ['guardar','ensayo']){
   const r=await h.call('/api/menu-admin/'+route,{confirmacion:'GUARDAR X'},{'X-CSRF-Token':s.nonce});
   assert.equal(r.status,409);assert.equal(r.data.codigo,'ESTRUCTURA_PENDIENTE');assert.equal(r.data.guardado,false);
  }
  const r=await h.call('/api/menu-admin/grupos/crear',{confirmacion:'CREAR GRUPOS'},{'X-CSRF-Token':s.nonce});
  assert.equal(r.status,409);assert.equal(r.data.codigo,'PREVIA_REQUERIDA');
  assert.equal((await h.call('/api/menu-admin/menu/revisar',{})).status,403);
  const unified=await h.call('/api/menu-admin/menu/confirmar',{confirmacion:'IMPORTAR MENU'},{'X-CSRF-Token':s.nonce});
  assert.equal(unified.status,409);assert.equal(unified.data.codigo,'PREVIA_REQUERIDA');
  assert.equal(h.connects,0);
 }finally{await h.close();}
});
test('compatibilidad devuelve error real cuando no hay SQL; no inventa una instalación válida',async()=>{
 const h=await harness();try{
  const r=await h.call('/api/menu-admin/compatibilidad');assert.equal(r.status,503);assert.equal(r.data.correcto,false);assert.equal(r.data.codigo,'SQL_NO_DISPONIBLE');assert.equal(h.connects,1);
 }finally{await h.close();}
});
test('un usuario de consulta no obtiene permisos de menú desde el servidor local',async()=>{
 const h=await harness();try{
  const s=(await h.call('/api/v9/session')).data;
  const owner=await h.call('/api/v9/setup',{name:'Dueño',password:'clave-segura-menu'},{'X-CSRF-Token':s.nonce});
  await h.call('/api/v9/users',{name:'Consulta',password:'clave-consulta-menu',role:'consulta',modules:['ventas']},{Cookie:owner.cookie,'X-CSRF-Token':owner.data.nonce});
  const viewer=await h.call('/api/v9/login',{name:'Consulta',password:'clave-consulta-menu'});
  const auth={Cookie:viewer.cookie,'X-CSRF-Token':viewer.data.nonce};
  assert.equal((await h.call('/api/menu-ia/interpretar',{lineas:['Agua $30']},auth)).status,403);
  assert.equal((await h.call('/api/menu-ia/nombres',undefined,auth)).status,403);assert.equal(h.connects,0);
 }finally{await h.close();}
});
test('diagnóstico contiene siete consultas de sólo lectura, claves y campos obligatorios',()=>{
 const q=require('../menu_diagnostico').consulta;
 const withoutComments=q.replace(/--[^\n]*/g,'').replace(/'[^']*'/g,"''");
 assert.equal((withoutComments.match(/;\s*(?=SELECT|$)/g)||[]).length,7);
 assert.ok(!/\b(INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|CREATE|EXEC|BACKUP|RESTORE|TRUNCATE)\b/i.test(withoutComments));
 for(const token of ['is_nullable','default_constraints','foreign_key_columns','is_primary_key','is_unique','sys.triggers'])assert.ok(q.includes(token));
});
