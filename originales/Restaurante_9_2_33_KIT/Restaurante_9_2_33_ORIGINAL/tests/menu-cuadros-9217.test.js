 'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),cp=require('child_process');
const core=require('../public/menu-visual-logica'),{validarProyecto}=require('../public/menu-proyecto');
const api=require('../menu_cuadros_lectura'),guide=require('../menu_colores');
function draft(){return {version:1,gruposPreparados:[],productos:[],fotografias:[{id:'f1',nombre:'menu.png',estado:'lista',ancho:800,alto:800,resultado:{bloques:[],categorias:[],pendientes:[]}}]};}
function add(project,tipo,rect){return core.guardarMarca(project,'f1',rect,tipo);}
function data(project,mapping){return core.marcas(project,'f1').map(m=>({id:m.id,tipo:m.tipo,texto:mapping[m.id]||''}));}
test('los 7 tipos de marca pueden guardarse sin solicitar transcripción manual',()=>{
 const project=draft();for(const type of core.types)add(project,type,core.recuadroListo(type));
 assert.equal(core.types.length,7);assert.equal(project.productos.length,0);
 assert.doesNotThrow(()=>validarProyecto(JSON.parse(JSON.stringify(project))));
});
test('leer cuadro rojo, amarillo, verde y azul crea una ficha de borrador, nunca SQL',()=>{
 const p=draft(),c=add(p,'categoria',[.05,.05,.65,.07]),n=add(p,'producto',[.05,.2,.5,.075]),pr=add(p,'precio',[.62,.2,.18,.075]),d=add(p,'descripcion',[.05,.3,.5,.08]);
 const r=core.aplicarLecturas(p,'f1',data(p,{[c]:'Hamburguesas',[n]:'Hamburguesa especial',[pr]:'$150',[d]:'Queso y tocino'}));
 assert.equal(r.leidos,4);assert.equal(p.productos.length,1);assert.equal(p.productos[0].precio,150);
 assert.equal(p.productos[0].ingredientes[0],'Queso y tocino');assert.equal(p.productos[0].grupo_detectado,'Hamburguesas');
 assert.equal(p.productos[0].idgrupo.startsWith('borrador:'),true);
 assert.doesNotThrow(()=>validarProyecto(JSON.parse(JSON.stringify(p))));
 const before=p.productos[0].id;
 core.aplicarLecturas(p,'f1',data(p,{[c]:'Hamburguesas',[n]:'Hamburguesa especial',[pr]:'$150',[d]:'Queso y tocino'}));
 assert.equal(p.productos.length,1);assert.equal(p.productos[0].id,before);
});
test('el precio dudoso no se asigna a un producto lejano, queda pendiente',()=>{
 const p=draft(),name=add(p,'producto',[.05,.2,.3,.08]),price=add(p,'precio',[.8,.85,.12,.06]);
 const result=core.aplicarLecturas(p,'f1',data(p,{[name]:'Taco especial',[price]:'$65'}));
 assert.equal(p.productos.length,1);assert.equal(p.productos[0].precio,null);
 assert.equal(core.marcas(p,'f1').find(x=>x.id===price).estadoLectura,'dudoso');
 assert.equal(result.pendientes,1);
});
test('el precio previamente confirmado nunca se pisa por una nueva sugerencia automática',()=>{
 const p=draft(),name=add(p,'producto',[.08,.2,.35,.06]),price=add(p,'precio',[.68,.2,.2,.06]);
 core.aplicarLecturas(p,'f1',data(p,{[name]:'Nachos',[price]:'$80'}));
 const product=p.productos[0];product.precio=150;product.revisado=true;
 core.aplicarLecturas(p,'f1',data(p,{[name]:'Nachos',[price]:'$90'}));
 assert.equal(p.productos[0].precio,150);
});
test('morados y turquesas se vinculan al producto sin importar recetas u opciones sin esquema SQL',()=>{
 const p=draft(),n=add(p,'producto',[.1,.2,.5,.06]),m=add(p,'modificador',[.1,.29,.55,.06]),t=add(p,'componente',[.1,.36,.55,.06]);
 core.aplicarLecturas(p,'f1',data(p,{[n]:'Combo especial',[m]:'Extra queso +$15',[t]:'Papas y bebida'}));
 assert.equal(p.productos.length,1);assert.equal(p.productos[0].opcionesVisualesPendientes.length,2);
 assert.equal(p.productos[0].excluido,true);assert.equal(p.productos[0].revisado,false);
 assert.equal(p.productos[0].modificadores.length,0);
 assert.doesNotThrow(()=>validarProyecto(JSON.parse(JSON.stringify(p))));
});
test('sin vinculación confiable no asigna modificador al producto incorrecto',()=>{
 const p=draft(),n=add(p,'producto',[.02,.05,.3,.07]),m=add(p,'modificador',[.7,.75,.2,.07]);
 core.aplicarLecturas(p,'f1',data(p,{[n]:'Tacos',[m]:'Extra $20'}));
 assert.equal(p.productos[0].opcionesVisualesPendientes,undefined);
 assert.equal(core.marcas(p,'f1').find(x=>x.id===m).estadoLectura,'dudoso');
});
test('releer un cuadro movido exige una nueva lectura sin borrar las otras marcas',()=>{
 const p=draft(),a=add(p,'producto',[.05,.1,.4,.1]),b=add(p,'precio',[.64,.1,.2,.1]);
 core.aplicarLecturas(p,'f1',data(p,{[a]:'Ensalada',[b]:'$40'}));
 core.guardarMarca(p,'f1',[.05,.3,.4,.1],'producto',{id:a});
 assert.equal(core.marcas(p,'f1').find(m=>m.id===a).estadoLectura,'pendiente');
 assert.equal(core.marcas(p,'f1').length,2);
});
test('lectura requiere CSRF y contexto autenticado; SQL nunca es consultado',async()=>{
 let calls=0;const routes={};const app={post:(url,gate,handler)=>routes[url]=[gate,handler]};
 api.register({app,soloLocal:(req,res,next)=>{if(req.auth?.user?.role==='dueno')next();else res.status(403).json({correcto:false});},procesar:async()=>{calls++;return {correcto:true,lecturas:[]};}});
 const [gate,handler]=routes['/api/menu-visual/leer-cuadros'];const req={auth:{nonce:'abc',user:{role:'dueno'}},headers:{'x-csrf-token':'wrong'},body:{}};
 const mock=()=>({code:200,status(c){this.code=c;return this;},json(v){this.body=v;return this;}});
 let res=mock();await new Promise(resolve=>gate(req,res,resolve));await handler(req,res);assert.equal(res.code,403);assert.equal(calls,0);
 req.headers['x-csrf-token']='abc';res=mock();await new Promise(resolve=>gate(req,res,resolve));await handler(req,res);assert.equal(calls,1);
});
test('prepara un montaje real usando coordenadas manuales, sin detectar colores',async(t)=>{
 let img;try{img=cp.execFileSync('python3',['-c',`from PIL import Image,ImageDraw
import base64,io
im=Image.new('RGB',(800,500),'white');d=ImageDraw.Draw(im);d.text((100,100),'Hamburguesa especial',fill='black');buf=io.BytesIO();im.save(buf,'PNG');print(base64.b64encode(buf.getvalue()).decode())`],{encoding:'utf8'}).trim();}catch(e){t.skip('Pillow no disponible');return;}
 const regs=[{id:'mk-1',tipo:'producto',rect:[.1,.12,.48,.17]}];
 const montage=await guide.manual(img,regs,{python:'python3'});
 assert.equal(montage.regiones.length,1);assert.equal(montage.regiones[0].tipo,'producto');assert.ok(montage.montaje.length>500);
});
test('API envía todos los recortes a Gemini simulado en una petición y conserva IDs de marca',async()=>{
 const img=cp.execFileSync('python3',['-c',`from PIL import Image
import io,base64
x=Image.new('RGB',(550,360),'white');b=io.BytesIO();x.save(b,'PNG');print(base64.b64encode(b.getvalue()).decode())`],{encoding:'utf8'}).trim();
 let calls=0;const handler=api.createHandler({manual:async(_im,regions)=>({montaje:'QUJD',regiones:regions.map((r,i)=>({id:'R'+(i+1),tipo:r.tipo,rect:r.rect})),ancho:550,alto:360}),gem:async(_montage,rs)=>{calls++;return {regiones:rs.map(r=>({id:r.id,texto:'Prueba'})),modelo:'gemini-simulado'};}});
 const result=await handler({imagen:img,mime:'image/png',regiones:[{id:'marca-producto',tipo:'producto',rect:[.1,.1,.3,.1]},{id:'marca-precio',tipo:'precio',rect:[.7,.1,.2,.1]}]});
 assert.equal(calls,1);assert.deepEqual(result.lecturas.map(r=>r.id),['marca-producto','marca-precio']);
 assert.equal(result.fuente,'gemini_gratis');
});
