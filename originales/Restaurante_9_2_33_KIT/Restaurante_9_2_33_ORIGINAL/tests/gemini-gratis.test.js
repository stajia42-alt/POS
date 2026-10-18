'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const gem=require('../gemini_gratis');
test('respuestas JSON validas',()=>assert.deepEqual(gem.decode('{"lineas":["Ensalada $98","Bebidas"]}'),['Ensalada $98','Bebidas']));
test('rechaza respuesta sin lineas',()=>assert.throws(()=>gem.decode('{"productos":[]}'),/líneas/));
test('rechaza JSON incorrecto',()=>assert.throws(()=>gem.decode('texto sin formato'),/JSON/));
test('no usa Gemini sin clave',async()=>{const saved=process.env.RESTAURANTE_GEMINI_API_KEY;delete process.env.RESTAURANTE_GEMINI_API_KEY;try{await assert.rejects(gem.extract('AAAA','image/jpeg'),/no está configurado/)}finally{if(saved)process.env.RESTAURANTE_GEMINI_API_KEY=saved}});
test('envia imagen al modelo gratuito y valida resultado',async()=>{const saved=process.env.RESTAURANTE_GEMINI_API_KEY;process.env.RESTAURANTE_GEMINI_API_KEY='AIza'+'X'.repeat(35);try{const output=await gem.extract('AAAA','image/jpeg',{listar:async()=>['gemini-3.5-flash-lite'],request:async(path,body,key)=>{assert.match(path,/gemini-3.5-flash-lite/);assert.equal(key,'AIza'+'X'.repeat(35));assert.equal(body.contents[0].parts[1].inline_data.mime_type,'image/jpeg');return {candidates:[{content:{parts:[{text:'{"lineas":["Tacos $30"]}'}]}}]}}});assert.deepEqual(output,['Tacos $30']);}finally{if(saved)process.env.RESTAURANTE_GEMINI_API_KEY=saved;else delete process.env.RESTAURANTE_GEMINI_API_KEY;}});

// Regression: the previous release sent arbitrary Windows text directly in x-goog-api-key.
test('rechaza claves con espacios, comillas, caracteres invisibles y Unicode sin iniciar HTTP',()=>{
  const gem=require('../gemini_gratis');
  for(const sample of ['AIza'+'X'.repeat(35)+'\u200b', '\"AIza'+ 'X'.repeat(35)+'\"', 'AIza'+ 'X'.repeat(34)+'\nY', 'AIza'+ 'X'.repeat(34)+'ñ','AIza'+ 'X'.repeat(34)+' Y','test_only']) {
    assert.throws(()=>gem.validarClave(sample),e=>e.code==='GEMINI_CLAVE_FORMATO' && !e.message.includes(sample));
    assert.throws(()=>gem.postJSON('/v1beta/models/test:generateContent',{},sample),/(caracteres|no válidos)/);
  }
});
test('clave válida se acepta y se consulta su estado sin exponerla',()=>{
  const saved=process.env.RESTAURANTE_GEMINI_API_KEY;
  const val='AIza'+'X'.repeat(35);process.env.RESTAURANTE_GEMINI_API_KEY=val;
  try{assert.equal(gem.validarClave(' '+val+' '),val);assert.equal(gem.estado().configurada,true);assert.match(gem.estado().modelo,/automático/);}
  finally{if(saved===undefined)delete process.env.RESTAURANTE_GEMINI_API_KEY;else process.env.RESTAURANTE_GEMINI_API_KEY=saved;}
});
test('estado explica clave incorrecta sin devolver la credencial',()=>{
  const saved=process.env.RESTAURANTE_GEMINI_API_KEY;const val='AIza'+'X'.repeat(35)+'\u200b';
  process.env.RESTAURANTE_GEMINI_API_KEY=val;
  try{const status=gem.estado();assert.equal(status.configurada,false);assert.match(status.error,/(caracteres|no válidos)/);assert.ok(!JSON.stringify(status).includes(val));}
  finally{if(saved===undefined)delete process.env.RESTAURANTE_GEMINI_API_KEY;else process.env.RESTAURANTE_GEMINI_API_KEY=saved;}
});
test('extracción no inicia una solicitud con clave inválida',async()=>{
  const saved=process.env.RESTAURANTE_GEMINI_API_KEY;process.env.RESTAURANTE_GEMINI_API_KEY='AIza'+'X'.repeat(34)+'ñ';
  let sent=false;try{await assert.rejects(gem.extract('QUJD','image/jpeg',{request:async()=>{sent=true;return {}}}),/(caracteres|no válidos)/);assert.equal(sent,false);}
  finally{if(saved===undefined)delete process.env.RESTAURANTE_GEMINI_API_KEY;else process.env.RESTAURANTE_GEMINI_API_KEY=saved;}
});

test('acepta clave Google con punto y la pasa sin modificar al transporte',async()=>{
 const key='AQ.'+'aB8RN6L4qTz5ZoKVIHBoXr3xxUFjQGu8q_Y3_Rfh_uIzAdp7Gg';
 assert.equal(gem.validarClave(key),key);
 const previous=process.env.RESTAURANTE_GEMINI_API_KEY;process.env.RESTAURANTE_GEMINI_API_KEY=key;
 try {const lines=await gem.extract('QUJD','image/jpeg',{listar:async()=>['gemini-3.5-flash-lite'],request:async(path,body,received)=>{assert.equal(received,key);return {candidates:[{content:{parts:[{text:'{"lineas":["Taco $25"]}'}]}}]};}});assert.deepEqual(lines,['Taco $25']);}
 finally {if(previous===undefined)delete process.env.RESTAURANTE_GEMINI_API_KEY;else process.env.RESTAURANTE_GEMINI_API_KEY=previous;}
});
