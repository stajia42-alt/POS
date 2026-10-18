'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const guide=require('../menu_colores');
const {execFileSync}=require('node:child_process');
const ROOT=require('node:path').join(__dirname,'..');
function region(id,tipo,x,y,w=.20,h=.05){return {id,tipo,rect:[x,y,w,h],confianzaColor:.94};}
const regions=[
  region('R1','categoria',.06,.05,.47,.07),
  region('R2','producto',.08,.21,.28,.07),
  region('R3','precio',.43,.21,.10,.07),
  region('R4','descripcion',.08,.30,.32,.06),
  region('R5','producto',.08,.44,.28,.07),
  region('R6','precio',.43,.44,.10,.07),
  region('R7','ignorar',.05,.67,.18,.05)
];
const answers=[
 {id:'R1',texto:'HAMBURGUESAS'},
 {id:'R2',texto:'Hamburguesa especial'},
 {id:'R3',texto:'$150'},
 {id:'R4',texto:'Carne de res y queso'},
 {id:'R5',texto:'Hamburguesa doble'},
 {id:'R6',texto:'$200'},
 {id:'R7',texto:'OFERTA'}
];
test('colores predeterminados mapean grupos/productos/precios, sin duplicados',()=>{
 const d=guide.interpret(regions,answers,[{idgrupo:'05',descripcion:'HAMBURGUESAS'}],900,730);
 assert.equal(d.productos.length,2);assert.equal(d.categorias.length,1);
 assert.equal(d.productos[0].precio,150);assert.equal(d.productos[1].precio,200);
 assert.deepEqual(d.productos[0].ingredientes,['Carne de res y queso']);
 assert.equal(d.productos[0].idgrupo,'05');assert.equal(d.productos[1].grupo_detectado,'HAMBURGUESAS');
 assert.equal(d.bloques[0].tipoVisual,'categoria');assert.deepEqual(d.bloques[0].rectVisual,regions[0].rect);
 assert.equal(d.productos.every(p=>p.revisado===false),true);
 assert.equal(d.productos.some(p=>p.nombre==='OFERTA'),false);
});
test('nunca inventa precio que no coincide ni asigna grupo por palabra en nombre',()=>{
 const d=guide.interpret([region('R1','producto',.05,.1),region('R2','precio',.77,.7)],[{id:'R1',texto:'Café clásico'},{id:'R2',texto:'$100'}]);
 assert.equal(d.productos[0].precio,null);assert.equal(d.productos[0].grupo_detectado,'');assert.equal(d.incidencias.length,1);
 assert.match(d.productos[0].revision.join(' '),/confirma|confirmar|confirmar|asigna|precio/i);
});
test('las regiones desconocidas, repetidas o inventadas se rechazan',()=>{
 assert.throws(()=>guide.interpret(regions,[...answers,{id:'R99',texto:'inventado'}]),/desconocida/);
 assert.throws(()=>guide.interpret(regions,[answers[0],answers[0]]),/desconocida/);
 assert.throws(()=>guide.validRegions([regions[0],regions[0]]),/inválida/);
});
test('los colores del usuario requieren valores distintos y hexadecimales correctos',()=>{
 assert.deepEqual(guide.colors({}),guide.DEFAULT);
 assert.equal(guide.colors({categoria:'#ff2200'}).categoria,'#ff2200');
 assert.throws(()=>guide.colors({producto:'#garbage'}));
 assert.throws(()=>guide.colors({categoria:guide.DEFAULT.producto}),/diferente/);
});
test('asociación OCR local respeta la geometría; no etiqueta líneas lejanas',()=>{
 const arr=guide.textFromOCR(regions,{bloques:[
   {texto:'Hamburguesa especial',caja:[85,165,320,206]},
   {texto:'$150',caja:[400,165,470,202]},
   {texto:'Fuera',caja:[850,620,899,685]}
 ]},900,730);
 assert.equal(arr.find(x=>x.id==='R2').texto,'Hamburguesa especial');
 assert.equal(arr.find(x=>x.id==='R3').texto,'$150');
 assert.equal(arr.find(x=>x.id==='R1').texto,'');
 assert.throws(()=>guide.textFromOCR(regions,{bloques:[{texto:'Foo',caja:null}]},900,730),/coordenadas/);
});
test('detector OpenCV encuentra 5 colores en una imagen de prueba real',async(t)=>{
 let img;
 try{img=execFileSync('python3',['-c',`from PIL import Image,ImageDraw\nimport io,base64\nim=Image.new('RGB',(900,800),'white');d=ImageDraw.Draw(im)\nfor box,c in [((60,50,650,120),'#e53935'),((60,160,650,235),'#facc15'),((60,280,650,355),'#2563eb'),((690,160,840,235),'#16a34a'),((60,410,650,485),'#6b7280')]:d.rectangle(box,outline=c,width=7)\nb=io.BytesIO();im.save(b,'PNG');print(base64.b64encode(b.getvalue()).decode())`],{encoding:'utf8'}).trim();}
 catch{t.skip('Python/Pillow no disponible para esta prueba');return;}
 try{
  const res=await guide.detected(img,{}, {python:'python3'});
  assert.equal(res.regiones.length,5);
  assert.deepEqual(new Set(res.regiones.map(r=>r.tipo)),new Set(['categoria','producto','descripcion','precio','ignorar']));
  assert.ok(res.montaje.length>1000);
 }catch(e){if(/No module named '(cv2|numpy)'/.test(e.message))t.skip('OpenCV ausente');else throw e;}
});
test('regiones de menús sin marco real no se etiquetan por decoración sólida',async()=>{
 const img=execFileSync('python3',['-c',`from PIL import Image,ImageDraw\nimport io,base64\ni=Image.new('RGB',(700,400),'white');d=ImageDraw.Draw(i);d.rectangle((90,100,540,200),fill='#e53935');b=io.BytesIO();i.save(b,'PNG');print(base64.b64encode(b.getvalue()).decode())`],{encoding:'utf8'}).trim();
 const res=await guide.detected(img,{}, {python:'python3'});
 assert.equal(res.regiones.length,0);
});
test('proyectos antiguos y resultados coloreados conservan esquema compatible',()=>{
 const validate=require('../public/menu-proyecto').validarProyecto;
 const result=guide.interpret(regions,answers,[],900,730);
 const photo={id:'foto-1',nombre:'prueba.jpg',estado:'lista',ancho:900,alto:730,resultado:result};
 const products=result.productos.map((p,i)=>({...p,id:'producto-'+i,foto:'foto-1',fotoNombre:'prueba.jpg',clave:'0000'+i,excluido:false}));
 const project={version:1,productos:products,fotografias:[photo],gruposPreparados:[],coloresGuia:{...guide.DEFAULT}};
 assert.equal(validate(project).fotografias[0].resultado.bloques[0].tipoVisual,'categoria');
 assert.equal(validate({...project,coloresGuia:undefined}).productos.length,2);
});
test('Gemini guiado sólo acepta transcripciones de IDs reales',async()=>{
 const gemini=require('../gemini_gratis');
 const old=process.env.RESTAURANTE_GEMINI_API_KEY;
 process.env.RESTAURANTE_GEMINI_API_KEY='ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789';
 try{
  const d=await gemini.extractGuided('QUJD',regions,{listar:async()=>['gemini-2.5-flash-lite'],request:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({regiones:answers})}]}}]})});
  assert.equal(d.regiones.length,7);assert.equal(d.modelo,'gemini-2.5-flash-lite');
  await assert.rejects(gemini.extractGuided('QUJD',regions,{listar:async()=>['gemini-2.5-flash-lite'],request:async()=>({candidates:[{content:{parts:[{text:'{"regiones":[{"id":"R999","texto":"Mal"}]}'}]}}]})}),/identificador/);
 }finally{if(old===undefined)delete process.env.RESTAURANTE_GEMINI_API_KEY;else process.env.RESTAURANTE_GEMINI_API_KEY=old;}
});
test('ruta de análisis guiado integra detección y transcripción, sin consultar SQL',async()=>{
 const img=execFileSync('python3',['-c',`from PIL import Image,ImageDraw\nimport io,base64\ni=Image.new('RGB',(900,570),'white');d=ImageDraw.Draw(i)\nfor b,c in [((40,35,580,100),'#e53935'),((40,130,580,205),'#facc15'),((640,130,805,205),'#16a34a')]:d.rectangle(b,outline=c,width=7)\nx=io.BytesIO();i.save(x,'PNG');print(base64.b64encode(x.getvalue()).decode())`],{encoding:'utf8'}).trim();
 const gemini=require('../gemini_gratis');const original=gemini.extractGuided;
 let count=0;
 gemini.extractGuided=async (montage,found)=>{assert.ok(montage.length>100);assert.equal(found.length,3);return {regiones:found.map(r=>({id:r.id,texto:({categoria:'ENTRADAS',producto:'Tacos de asada',precio:'$89'})[r.tipo]})),modelo:'gemini-mock'};};
 try{
  const routes=new Map(),app={locals:{},get(){},post(path,...args){routes.set(path,args.at(-1));}};
  require('../menu_ia')({app,conectar:()=>{count++;throw Error('No se permite SQL');},soloLocal:(req,res,next)=>next()});
  let result;const response={status(n){this.code=n;return this;},json(d){result=d;return this;}};
  await routes.get('/api/menu-ia/extraer')({body:{imagen:img,mime:'image/png',modo:'guiado',grupos:[]}},response);
  assert.equal(result.correcto,true);assert.equal(result.fuente,'gemini_guiado');
  assert.equal(result.productos[0].nombre,'Tacos de asada');
  assert.equal(result.productos[0].precio,89);assert.equal(result.productos[0].grupo_detectado,'ENTRADAS');
  assert.equal(result.regionesGuia.length,3);assert.equal(count,0);
 }finally{gemini.extractGuided=original;}
});
