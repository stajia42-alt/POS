'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const gem=require('../gemini_gratis');
const key='AQ.'+'b'.repeat(45), before=process.env.RESTAURANTE_GEMINI_API_KEY;
const json={candidates:[{content:{parts:[{text:'{"lineas":["Tacos $55"]}'}]}}]};
const model=name=>({name:'models/'+name,supportedGenerationMethods:['generateContent']});
const localList=fn=>({key,request:fn});
function temporaryKey(fn){const original=process.env.RESTAURANTE_GEMINI_API_KEY;process.env.RESTAURANTE_GEMINI_API_KEY=key;return Promise.resolve().then(fn).finally(()=>{if(original===undefined)delete process.env.RESTAURANTE_GEMINI_API_KEY;else process.env.RESTAURANTE_GEMINI_API_KEY=original;});}
test('filtra solamente modelos con nivel gratis documentado y generateContent',()=>{
  assert.deepEqual(gem.modelsFromList([
    model('gemini-futuro-pago'),model('gemini-2.5-flash'),model('gemini-3.5-flash-lite'),
    {name:'models/gemini-3.1-flash-lite',supportedGenerationMethods:['embedContent']},
    model('gemini-3.1-flash-lite'),model('gemini-3.1-flash-lite-preview-image')
  ]),['gemini-3.5-flash-lite','gemini-3.1-flash-lite','gemini-2.5-flash']);
});
test('consulta paginas adicionales sin revelar la clave en el resultado',async()=>{
  let calls=0;
  const models=await gem.listAvailable(localList(async(path,body,received)=>{
    assert.equal(received,key);calls++;
    return calls===1?{models:[model('gemini-2.5-flash')],nextPageToken:'page two'}:{models:[model('gemini-3.5-flash-lite')]};
  }));
  assert.equal(calls,2);assert.deepEqual(models,['gemini-3.5-flash-lite','gemini-2.5-flash']);
  assert.ok(!JSON.stringify(models).includes(key));
});
test('no confunde models.list con cuota o facturacion confirmada',async()=>temporaryKey(async()=>{
  const estado=await gem.disponibilidad({listar:async()=>['gemini-3.5-flash-lite']});
  assert.equal(estado.disponible,true);assert.match(estado.nota,/no se puede verificar facturación/i);
}));
test('extract usa primero nuevo Flash-Lite y devuelve modelo utilizado',async()=>temporaryKey(async()=>{
  const result=await gem.extract('QUJD','image/jpeg',{listar:async()=>['gemini-3.5-flash-lite'],request:async(path)=>{
    assert.match(path,/gemini-3.5-flash-lite:generateContent$/);return json;
  }});
  assert.equal(result.modelo,'gemini-3.5-flash-lite');assert.deepEqual(result,['Tacos $55']);
}));
test('404 avanza al siguiente modelo elegible; nunca prueba uno de pago',async()=>temporaryKey(async()=>{
  const attempted=[];
  const result=await gem.extract('QUJD','image/jpeg',{listar:async()=>['gemini-3.5-flash-lite','gemini-2.5-flash','gemini-pago'],request:async path=>{
    attempted.push(path);
    if(path.includes('3.5'))throw Object.assign(Error('not found'),{code:404});
    return json;
  }});
  assert.equal(result.modelo,'gemini-2.5-flash');
  assert.equal(attempted.length,2);assert.ok(attempted.every(p=>!p.includes('gemini-pago')));
}));
test('429 no evade limite con otros modelos aunque estén disponibles',async()=>temporaryKey(async()=>{
  const attempted=[];
  await assert.rejects(gem.extract('QUJD','image/jpeg',{listar:async()=>gem.FREE_MODELS,request:async path=>{
    attempted.push(path);throw Object.assign(Error('quota'),{code:429});
  }}),e=>e.code===429&&gem.requiresLocalFallback(e));
  assert.equal(attempted.length,1);
}));
test('lista vacia detiene peticiones a IA y permite respaldo OCR',async()=>temporaryKey(async()=>{
  let called=false;
  await assert.rejects(gem.extract('QUJD','image/jpeg',{listar:async()=>[],request:async()=>{called=true;}}),
    e=>e.code==='GEMINI_SIN_MODELO'&&gem.requiresLocalFallback(e));
  assert.equal(called,false);
}));
test('no ejecuta modelos no incluidos aunque el listador los entregue',async()=>temporaryKey(async()=>{
  let called=false;
  await assert.rejects(gem.extract('QUJD','image/jpeg',{listar:async()=>['gemini-3.8-flash-image'],request:async()=>{called=true;}}),e=>e.code==='GEMINI_SIN_MODELO');
  assert.equal(called,false);
}));
