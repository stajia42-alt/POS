'use strict';
// Sólo prueba el protocolo y ciclo de vida; no simula una lectura real de PaddleOCR.
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('events');
const {crearOCR}=require('../ocr_proceso');
function fakeFactory(reply){let launches=0,writes=0,kills=0;return {get launches(){return launches;},get writes(){return writes;},get kills(){return kills;},spawn(){launches++;const c=new EventEmitter();c.stdout=new EventEmitter();c.stdout.setEncoding=()=>{};c.stderr=new EventEmitter();c.stdin=new EventEmitter();c.stdin.write=s=>{writes++;reply(c,JSON.parse(s),writes);};c.kill=()=>{kills++;queueMicrotask(()=>c.emit('close',0));};return c;}};}
test('OCR serializa fotos y reutiliza el proceso; ignora logs fuera del protocolo',async()=>{
 const f=fakeFactory((c,p)=>setTimeout(()=>c.stdout.emit('data','Log del modelo\nRESTAURANTE_OCR:'+JSON.stringify({lineas:[p.imagen]})+'\n'),5));
 const o=crearOCR({spawnFn:f.spawn,command:()=>({exe:'test',args:[]}),timeout:1000});
 try{const r=await Promise.all([o.extraer('foto1'),o.extraer('foto2')]);assert.equal(f.launches,1);assert.deepEqual(r.map(x=>x.lineas[0]),['foto1','foto2']);}finally{o.cerrar();}assert.equal(f.kills,1);
});
test('respuesta inválida rechaza sin dejar una promesa pendiente y permite reiniciar',async()=>{
 const f=fakeFactory((c,p,n)=>queueMicrotask(()=>c.stdout.emit('data',n===1?'RESTAURANTE_OCR:null\n':'RESTAURANTE_OCR:{"lineas":["SOPA $10"]}\n')));
 const o=crearOCR({spawnFn:f.spawn,command:()=>({exe:'test',args:[]}),timeout:1000});
 try{await assert.rejects(o.extraer('foto'),/inválida/);assert.deepEqual((await o.extraer('otra')).lineas,['SOPA $10']);assert.equal(f.launches,2);}finally{o.cerrar();}
});
test('cero líneas nunca es éxito y una foto posterior puede procesarse',async()=>{
 const f=fakeFactory((c,p,n)=>queueMicrotask(()=>c.stdout.emit('data','RESTAURANTE_OCR:'+JSON.stringify(n===1?{lineas:[],bloques:[]}:{lineas:['SOPA $10']})+'\n')));
 const o=crearOCR({spawnFn:f.spawn,command:()=>({exe:'test',args:[]}),timeout:1000});
 try{await assert.rejects(o.extraer('vacía'),/0 líneas/);assert.deepEqual((await o.extraer('otra')).lineas,['SOPA $10']);assert.equal(f.launches,1);}finally{o.cerrar();}
});
test('timeout mata el proceso; cerrar no vuelve a lanzar trabajos pendientes',async()=>{
 const f=fakeFactory(()=>{}),o=crearOCR({spawnFn:f.spawn,command:()=>({exe:'test',args:[]}),timeout:15});
 await assert.rejects(o.extraer('foto'),/tiempo/);assert.equal(f.kills,1);
 const a=o.extraer('segunda'),b=o.extraer('tercera');o.cerrar();
 const r=await Promise.allSettled([a,b]);assert.ok(r.every(x=>x.status==='rejected'));assert.equal(f.launches,1);
});
