'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const {crearCola}=require('../menu_trabajos');
const {prepararImagen}=require('../public/menu-imagen');
const delay=ms=>new Promise(r=>setTimeout(r,ms));

// Pruebas de la cola sin API de Google ni servidor SQL real.
test('cola: un mismo envio repetido procesa solo una vez, incluso durante el análisis',async()=>{
  let calls=0;const queue=crearCola({procesar:async data=>{calls++;await delay(20);return {lineas:[data.nombre]};}});
  const a=queue.enqueue('dueño','foto-12345-1',{nombre:'Ensalada'});
  const b=queue.enqueue('dueño','foto-12345-1',{nombre:'OTRO'});
  assert.equal(a.id,b.id);assert.equal(b.repetido,true);
  await delay(70);assert.equal(queue.get('dueño',a.id).estado,'lista');
  assert.deepEqual(queue.get('dueño',a.id).resultado,{lineas:['Ensalada']});
  assert.equal(calls,1);
});
test('cola: los trabajos no se pueden consultar desde otro usuario',async()=>{
  const q=crearCola({procesar:async()=>1});const item=q.enqueue('dueno','foto-12345678',{a:1});
  assert.equal(q.get('invitado',item.id),null);
  await delay(15);assert.equal(q.get('dueno',item.id).estado,'lista');
});
test('cola: errores de IA no se presentan como resultado completado',async()=>{
  const q=crearCola({procesar:async()=>{throw Error('Gemini: limite gratuito alcanzado');}});
  const x=q.enqueue('dueno','foto-error-1',{});await delay(20);
  assert.equal(q.get('dueno',x.id).estado,'error');
  assert.match(q.get('dueno',x.id).error,/limite/);
});
test('cola: limita la cantidad simultánea y rechaza IDs inválidos',async()=>{
  let release;const block=new Promise(r=>{release=r;});
  const q=crearCola({procesar:()=>block,maxPendientes:1});
  assert.throws(()=>q.enqueue('u','<html>',{}),/Identificador/);
  q.enqueue('u','foto-larga-01',{});await delay(10);
  assert.throws(()=>q.enqueue('u','foto-larga-02',{}),e=>e.status===429);
  release(1);await delay(10);
});
function fakeBrowser({fallback=false}={}){
  const old=Object.fromEntries(['Image','FileReader','document','createImageBitmap'].map(k=>[k,global[k]]));
  const oldObject=URL.createObjectURL,oldRevoke=URL.revokeObjectURL;
  let released=0,sourceCalls=0;
  URL.createObjectURL=()=> 'blob:imagen-fake';URL.revokeObjectURL=()=>{released++};
  global.Image=class {
    naturalWidth=3200;naturalHeight=2300;
    set src(v){queueMicrotask(()=>fallback?this.onerror():this.onload());}
  };
  global.createImageBitmap=async()=>{sourceCalls++;return {width:3200,height:2300,close(){}};};
  global.document={createElement(type){assert.equal(type,'canvas');return {width:0,height:0,getContext(){return {fillRect(){},drawImage(){}}},toBlob(callback){callback({size:1000});}}}};
  global.FileReader=class {readAsDataURL(){this.result='data:image/jpeg;base64,QUJD';queueMicrotask(()=>this.onload());}};
  return {release(){URL.createObjectURL=oldObject;URL.revokeObjectURL=oldRevoke;for(const [key,v] of Object.entries(old)){if(v===undefined)delete global[key];else global[key]=v;}},stats(){return {released,sourceCalls};}};
}
test('iPhone: convierte JPEG sin necesitar createImageBitmap',async()=>{
  const env=fakeBrowser();try{assert.deepEqual(await prepararImagen({type:'image/jpeg',size:11000}),{mime:'image/jpeg',imagen:'QUJD'});assert.equal(env.stats().sourceCalls,0);assert.equal(env.stats().released,1);}finally{env.release();}
});
test('iPhone: cuando falla Image usa createImageBitmap como respaldo',async()=>{
  const env=fakeBrowser({fallback:true});try{assert.equal((await prepararImagen({type:'image/jpeg',size:6000})).imagen,'QUJD');assert.equal(env.stats().sourceCalls,1);}finally{env.release();}
});
test('iPhone: rechaza imágenes incompatibles antes de convertir',async()=>{
  await assert.rejects(prepararImagen({type:'image/heic',size:500}),/JPG, PNG o WebP/);
  await assert.rejects(prepararImagen({type:'image/jpeg',size:40*1024*1024}),/25 MB/);
});
