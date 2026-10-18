'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const instalar=require('../menu_ia');const gemini=require('../gemini_gratis');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function appFake(){const r=new Map();return {r,locals:{},get(path,...f){r.set('GET '+path,f[f.length-1]);},post(path,...f){r.set('POST '+path,f[f.length-1]);}};}
function reply(){const res={code:200,data:null,status(n){this.code=n;return this;},json(v){this.data=v;return this;}};return res;}
function getRequest(user,id){return {auth:{user:{id:user,role:'dueno'}},params:{id},body:{},headers:{}};}
test('API de trabajos: aceptar, idempotencia, resultado, aislamiento y validación',async()=>{
  const app=appFake();const original=gemini.extract;
  gemini.extract=async()=>['Entradas','Ensalada de pepino $98'];
  try{
    instalar({app,conectar:async()=>{throw Error('No conectar SQL en una captura');},soloLocal:(req,res,next)=>next()});
    const post=app.r.get('POST /api/menu-ia/trabajos');const get=app.r.get('GET /api/menu-ia/trabajos/:id');
    const payload={cliente:'foto-abcde123-1',foto:{mime:'image/jpeg',imagen:'QUJD',modo:'gemini',grupos:[]}};
    const request={...getRequest('dueno-1'),body:payload};
    const accepted=reply();post(request,accepted);assert.equal(accepted.code,202,JSON.stringify(accepted.data));const id=accepted.data.id;
    const twice=reply();post(request,twice);assert.equal(twice.data.id,id);assert.equal(twice.data.repetido,true);
    const foreign=reply();get(getRequest('otro',id),foreign);assert.equal(foreign.code,404);
    await wait(30);
    const result=reply();get(getRequest('dueno-1',id),result);
    assert.equal(result.data.estado,'lista');assert.equal(result.data.resultado.fuente,'gemini_gratis');
    assert.ok(Array.isArray(result.data.resultado.productos));
    const invalid=reply();post({...request,body:{...payload,cliente:'foto-abcde123-2',foto:{...payload.foto,mime:'image/heic'}}},invalid);
    assert.equal(invalid.code,400);
  }finally{gemini.extract=original;}
});
