'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const C=require('../public/menu-visual-logica'),{validarProyecto}=require('../public/menu-proyecto');
const photoRoutes=require('../menu_visual_fotos'),suggest=require('../menu_visual_sugerencias');
const {interpretarMenu}=require('../menu_contexto');
function fixture(){
  const r=interpretarMenu(['HAMBURGUESAS','Hamburguesa Especial','$190','Corn dogs','$50']);
  return {version:1,gruposPreparados:[{id:'g1',nombre:'Hamburguesas',clasificacion:1}],fotografias:[{id:'f1',nombre:'foto.jpg',estado:'lista',resultado:r}],productos:r.productos.map((p,i)=>({...p,id:'p'+i, foto:'f1',fotoNombre:'foto.jpg', idgrupo:'borrador:g1',clave:'0000'+i, excluido:false,revisado:false}))};
}
function withBlock(p,text){const b=p.fotografias[0].resultado.bloques.find(b=>b.texto===text);assert.ok(b,'no OCR block '+text);return b.id;}
test('corrección visual agrega un producto desde una categoría errónea sin borrar otros productos',()=>{
  const p=fixture();const r=p.fotografias[0].resultado;
  const id=withBlock(p,'Hamburguesa Especial');
  r.categorias.push({nombre:'Hamburguesa Especial',padre:'',evidencia:[id]});
  p.gruposPreparados.push({id:'g2',nombre:'Hamburguesa Especial',clasificacion:1});
  const other=p.productos.length;
  C.clasificar(p,'f1',id,'producto',{grupo:'Hamburguesas'});
  assert.equal(p.gruposPreparados.some(g=>g.nombre==='Hamburguesa Especial'),false);
  assert.equal(p.productos.length,other); // no data loss
  assert.equal(p.productos.some(x=>x.nombre==='Corn dogs'),true);
  assert.equal(p.productos.find(x=>x.nombre==='Hamburguesa Especial').idgrupo,'borrador:g1');
  assert.doesNotThrow(()=>validarProyecto(p));
});
test('categoria creada desde un producto conserva propuesta anterior como excluida',()=>{
  const p=fixture(),id=withBlock(p,'Corn dogs');
  C.clasificar(p,'f1',id,'categoria');
  assert.equal(p.productos.find(x=>x.nombre==='Corn dogs').excluido,true);
  assert.equal(p.gruposPreparados.some(g=>g.nombre==='Corn dogs'),true);
  assert.doesNotThrow(()=>validarProyecto(p));
});
test('categoría ya presente en SQL no se duplica como borrador',()=>{
  const p=fixture();const id=withBlock(p,'Corn dogs');
  C.clasificar(p,'f1',id,'categoria',{gruposExistentes:[{idgrupo:'006',descripcion:'Corn dogs'}]});
  assert.equal(p.gruposPreparados.filter(g=>g.nombre==='Corn dogs').length,0);
});
test('vincular precio cambia sólo producto indicado y respeta SQL importado',()=>{
  const p=fixture(),id=withBlock(p,'$50'),one=p.productos.find(x=>x.nombre==='Corn dogs'),other=p.productos.find(x=>x.nombre==='Hamburguesa Especial');
  const otherPrice=other.precio;const price=C.vincularPrecio(p,'f1',one.id,id);
  assert.equal(price,50);assert.equal(one.precio,50);assert.equal(other.precio,otherPrice);
  assert.doesNotThrow(()=>validarProyecto(p));
  one.importado=true;assert.throws(()=>C.vincularPrecio(p,'f1',one.id,id),/importado/);
});
test('precios mezclados o texto ambiguo se rechazan',()=>{
  const p=fixture();const id=withBlock(p,'Corn dogs');assert.throws(()=>C.vincularPrecio(p,'f1',p.productos[0].id,id),/cifra/);
});
test('marcado manual normalizado y corrección sobreviven JSON de proyecto',()=>{
  const p=fixture();const id=C.crearBloque(p,'f1','Refrescos',[.15,.31,.5,.06],'categoria');
  const block=p.fotografias[0].resultado.bloques.find(x=>x.id===id);
  assert.deepEqual(block.rectVisual,[.15,.31,.5,.06]);assert.equal(block.tipoVisual,'categoria');
  p.fotografias[0].imagenGuardada=true;p.fotografias[0].ancho=1100;p.fotografias[0].alto=2200;
  const copy=validarProyecto(JSON.parse(JSON.stringify(p)));
  assert.equal(copy.fotografias[0].resultado.bloques.at(-1).texto,'Refrescos');
  assert.deepEqual(copy.fotografias[0].resultado.bloques.at(-1).rectVisual,[.15,.31,.5,.06]);
});
test('rectángulos inválidos no alteran proyecto',()=>{
  const p=fixture(),before=JSON.stringify(p);
  assert.throws(()=>C.crearBloque(p,'f1','Texto',[.9,.9,.2,.2],'producto'),/recuadro/);
  assert.equal(JSON.stringify(p),before);
});
test('corrección de categoría no elimina productos importados por evidencia compartida',()=>{
  const p=fixture(),id=withBlock(p,'HAMBURGUESAS');p.productos.forEach(x=>{x.importado=true;});
  C.clasificar(p,'f1',id,'ignorar');
  assert.ok(p.productos.every(x=>x.importado));
  assert.ok(p.productos.every(x=>!x.excluido));
});
test('texto de usuario para Gemini tiene límites y referencias existentes',()=>{
  const p=fixture();assert.throws(()=>C.instrucciones('sí',p,'f1'),/5 a 600/);
  const data=C.instrucciones('Corn dogs es producto',p,'f1');
  assert.ok(data.lineas.length);assert.equal(data.productos.length,p.productos.length);
});
test('respuesta Gemini sólo acepta IDs y tipos válidos, jamás código arbitrario',()=>{
  const ctx={instruccion:'devolver cambio',lineas:[{id:2,texto:'Hola'}],productos:[{id:'p1',nombre:'Prueba',importado:false},{id:'p2',nombre:'Otro',importado:true}]};
  const changes=suggest.validarRespuesta(JSON.stringify({cambios:[
    {bloqueId:2,tipo:'producto',explicacion:'Es producto'},
    {bloqueId:2,tipo:'precio',productoId:'p2',explicacion:'No permitido'},
    {bloqueId:20,tipo:'categoria',explicacion:'id no existe'},
    {bloqueId:2,tipo:'DROP TABLE',explicacion:'intrusión'}
  ]}),ctx);
  assert.equal(changes.length,1);assert.equal(changes[0].tipo,'producto');
});
test('API foto rechaza id malicioso, imágenes inválidas o mal declaradas',()=>{
  assert.throws(()=>photoRoutes.decodeFoto('../../secreto','image/jpeg','QQ=='),/Identificador/);
  assert.throws(()=>photoRoutes.decodeFoto('123e4567-e89b-12d3-a456-426614174000','image/jpeg',Buffer.alloc(100).toString('base64')),/contenido/);
});
test('subir y recuperar imagen exige rol de dueño y CSRF, sin tocar SQL',async()=>{
  const routes={};const app={post:(route,middleware,fn)=>routes['POST '+route]=[middleware,fn],get:(route,middleware,fn)=>routes['GET '+route]=[middleware,fn]};
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'restaurante-fotos-'));
  try{
    let authorized=0;photoRoutes({app,configDir:folder,soloLocal:(req,res,next)=>{authorized++;if(req.auth?.user?.role==='dueno')next();else res.status(403).json({correcto:false});}});
    const id='123e4567-e89b-12d3-a456-426614174000',bytes=Buffer.concat([Buffer.from([255,216,255,224]),Buffer.alloc(200),Buffer.from([255,217])]);
    const request={params:{id},auth:{nonce:'secret',user:{role:'dueno'}},headers:{'x-csrf-token':'secret'},body:{mime:'image/jpeg',imagen:bytes.toString('base64')}};
    function mock(){return {statusCode:200,status(n){this.statusCode=n;return this;},json(d){this.payload=d;return this;},set(){return this;},type(t){this.mime=t;return this;},send(b){this.binary=b;return this;}};}
    let res=mock();const [gate,post]=routes['POST /api/menu-visual/fotos/:id'];gate(request,res,()=>post(request,res));assert.equal(res.payload.correcto,true);
    const [getGate,get]=routes['GET /api/menu-visual/fotos/:id'];res=mock();getGate(request,res,()=>get(request,res));assert.deepEqual(res.binary,bytes);assert.equal(res.mime,'image/jpeg');
    const bad=mock();gate({...request,headers:{'x-csrf-token':'no'}},bad,()=>post({...request,headers:{'x-csrf-token':'no'}},bad));assert.equal(bad.statusCode,403);
    const viewer=mock();const req={...request,auth:{user:{role:'consulta'},nonce:'secret'}};getGate(req,viewer,()=>get(req,viewer));assert.equal(viewer.statusCode,403);
    assert.ok(authorized>=4);
  }finally{fs.rmSync(folder,{recursive:true,force:true});}
});
test('descripcion se vincula sólo al producto seleccionado',()=>{
  const p=fixture(),id=withBlock(p,'HAMBURGUESAS'),prod=p.productos[0],other=p.productos[1];
  C.clasificar(p,'f1',id,'descripcion',{idProducto:prod.id});
  assert.ok(prod.ingredientes.includes('HAMBURGUESAS'));
  assert.ok(!other.ingredientes.includes('HAMBURGUESAS'));
  assert.doesNotThrow(()=>validarProyecto(p));
});
test('categoría Bebidas marcada visualmente se crea con clasificación de bebidas',()=>{
  const p=fixture(),id=C.crearBloque(p,'f1','BEBIDAS',[.2,.1,.4,.06],'categoria');
  assert.equal(p.gruposPreparados.find(g=>g.nombre==='BEBIDAS').clasificacion,2);
  assert.ok(p.fotografias[0].resultado.bloques.some(b=>b.id===id));
});
