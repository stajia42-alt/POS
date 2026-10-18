'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const core=require('../public/menu-visual-logica');
const {validarProyecto}=require('../public/menu-proyecto');
function proyecto(){return {version:1,productos:[],gruposPreparados:[],fotografias:[{id:'foto',nombre:'carta.jpg',estado:'lista',ancho:1000,alto:1500,resultado:{bloques:[{id:1,texto:'COMIDAS',caja:[100,150,450,220],uso:[]}],categorias:[],pendientes:[]}}]};}
test('permite guardar múltiples cuadros pendientes del mismo color sin borrar ninguno',()=>{
 const p=proyecto();
 for(let i=0;i<15;i++)core.guardarMarca(p,'foto',core.recuadroListo('producto',i),'producto');
 assert.equal(core.marcas(p,'foto').length,15);
 assert.equal(new Set(core.marcas(p,'foto').map(m=>m.id)).size,15);
 assert.doesNotThrow(()=>validarProyecto(p));
});
test('guardar cuadros de cinco colores no crea grupos ni productos en SQL',()=>{
 const p=proyecto();for(const kind of core.types)core.guardarMarca(p,'foto',core.recuadroListo(kind),kind);
 assert.equal(p.productos.length,0);assert.equal(p.gruposPreparados.length,0);
 assert.equal(core.marcas(p,'foto').length,7);
 assert.deepEqual(core.marcas(p,'foto').map(x=>x.tipo),core.types);
});
test('mover y redimensionar un cuadro pendiente no afecta otros cuadros',()=>{
 const p=proyecto();const id=core.guardarMarca(p,'foto',[.1,.1,.3,.1],'categoria');
 const other=core.guardarMarca(p,'foto',[.5,.5,.3,.1],'producto');
 core.guardarMarca(p,'foto',[.2,.2,.4,.2],'categoria',{id});
 assert.deepEqual(core.marcas(p,'foto')[0].rect,[.2,.2,.4,.2]);
 assert.deepEqual(core.marcas(p,'foto')[1].rect,[.5,.5,.3,.1]);
 assert.equal(core.marcas(p,'foto')[1].id,other);
});
test('eliminar solo el cuadro seleccionado no destruye los demás',()=>{
 const p=proyecto();const a=core.guardarMarca(p,'foto',[.1,.1,.3,.1],'categoria');
 const b=core.guardarMarca(p,'foto',[.5,.5,.3,.1],'producto');
 assert.equal(core.borrarMarca(p,'foto',a),true);assert.equal(core.marcas(p,'foto').length,1);
 assert.equal(core.marcas(p,'foto')[0].id,b);
 assert.throws(()=>core.borrarMarca(p,'foto',a),/no se encontró/i);
});
test('cuadros guardados se recuperan al exportar/importar proyectos anteriores y nuevos',()=>{
 const p=proyecto();core.guardarMarca(p,'foto',[.2,.2,.4,.1],'precio');
 const restored=validarProyecto(JSON.parse(JSON.stringify(p)));
 assert.equal(restored.fotografias[0].marcasVisuales.length,1);
 const old=proyecto();assert.doesNotThrow(()=>validarProyecto(old));
});
test('rechaza marcas malformadas antes de recuperar un proyecto',()=>{
 const p=proyecto();p.fotografias[0].marcasVisuales=[{id:'x',tipo:'producto',rect:[.8,.3,.4,.2]}];
 assert.throws(()=>validarProyecto(p),/sale de la fotografía/);
});
test('UI muestra Guardar arriba de la foto, y conserva la anterior al agregar otra',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../public/menu.html'),'utf8');
 const js=fs.readFileSync(path.join(__dirname,'../public/menu-visual.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'../public/menu.css'),'utf8');
 assert.ok(html.indexOf('id="visualPresetSave"')<html.indexOf('id="visualStage"'));
 for(const n of ['visualSavedArea','visualSavedList','visualPresetDelete'])assert.ok(html.includes('id="'+n+'"'));
 assert.match(js,/if\(preset&&storePreset\(\{silencioso:true\}\)===null\)return/);
 assert.match(css,/\.visual-preset-panel:not\(\[hidden\]\)\{position:sticky/);
});
