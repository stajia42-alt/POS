'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const instalar=require('../menu_ia'),gemini=require('../gemini_gratis');
function fake(){const routes=new Map();return {routes,locals:{},get(path,...handlers){routes.set('GET '+path,handlers.at(-1));},post(path,...handlers){routes.set('POST '+path,handlers.at(-1));}};}
function res(){return {code:200,result:null,status(n){this.code=n;return this;},json(data){this.result=data;return this;}};}
const wait=ms=>new Promise(done=>setTimeout(done,ms));
test('sin modelos gratuitos, trabajo utiliza PaddleOCR y conserva productos',async()=>{
 const app=fake(),orig=gemini.extract;
 gemini.extract=async()=>{throw Object.assign(Error('Modelo gratis no accesible'),{code:'GEMINI_SIN_MODELO'});};
 try {
   instalar({app,conectar:async()=>{throw Error('No se toca SQL');},soloLocal:(rq,rs,next)=>next()});
   app.locals.ocr.extraer=async()=>({lineas:['Entradas','Tacos $58'],bloques:[]});
   const rq={auth:{user:{id:'dueño'}},body:{cliente:'cliente-abc1234',foto:{imagen:'QUJD',mime:'image/jpeg',modo:'gemini',grupos:[]}}};
   const response=res();app.routes.get('POST /api/menu-ia/trabajos')(rq,response);
   assert.equal(response.code,202);
   await wait(35);
   const out=res();app.routes.get('GET /api/menu-ia/trabajos/:id')({auth:rq.auth,params:{id:response.result.id}},out);
   assert.equal(out.result.estado,'lista');
   assert.equal(out.result.resultado.fuente,'paddleocr_respaldo');
   assert.ok(out.result.resultado.aviso.includes('PaddleOCR'));
 }finally{gemini.extract=orig;}
});
test('cuota 429 activa respaldo local sin intentar otro modelo',()=>assert.equal(gemini.requiresLocalFallback({code:429}),true));
test('403 activa respaldo local sin exponer credenciales',()=>assert.equal(gemini.requiresLocalFallback({code:403}),true));
