'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Core=require('../public/menu-visual-logica');
const {validarProyecto}=require('../public/menu-proyecto');
function demo(){return {version:1,productos:[],gruposPreparados:[],fotografias:[{id:'f1',nombre:'menu.jpg',estado:'lista',ancho:1000,alto:1000,resultado:{bloques:[{id:1,texto:'ENTRADAS',caja:[200,200,600,250],uso:[]}],categorias:[],pendientes:[],productos:[]}}]};}
test('todos los colores tienen un rectángulo predeterminado dentro de la fotografía',()=>{
 for(const kind of ['categoria','producto','precio','descripcion','ignorar']){
  const b=Core.recuadroListo(kind);assert.equal(b.length,4);assert.doesNotThrow(()=>Core.rectangle(b));assert.ok(b[2]>.05);assert.ok(b[3]>.05);
 }
 assert.throws(()=>Core.recuadroListo('otro'),/no reconocido/);
});
test('el recuadro listo se arrastra sin cambiar dimensiones y se limita al borde',()=>{
 const orig=Core.recuadroListo('categoria'),r=Core.moverRecuadro(orig,.30,.25);
 assert.deepEqual(r.slice(2),orig.slice(2));assert.ok(r[0]>orig[0]);assert.ok(r[1]>orig[1]);
 const last=Core.moverRecuadro(r,5,5);assert.ok(last[0]+last[2]<=1.00001);assert.ok(last[1]+last[3]<=1.00001);
 assert.doesNotThrow(()=>Core.rectangle(last));
});
test('el asa cambia el tamaño sin mover el origen ni salir de la imagen',()=>{
 const r=Core.recuadroListo('precio'),big=Core.moverRecuadro(r,.1,.04,true);
 assert.deepEqual(big.slice(0,2),r.slice(0,2));assert.ok(big[2]>r[2]);assert.ok(big[3]>r[3]);
 assert.doesNotThrow(()=>Core.rectangle(Core.moverRecuadro(big,5,5,true)));
 assert.throws(()=>Core.moverRecuadro(r,NaN,0),/inválido/);
});
test('recupera automáticamente texto sólo cuando hay una coincidencia de OCR',()=>{
 const p=demo(),rect=[.18,.18,.46,.09];
 assert.deepEqual(Core.sugerirBloqueEnRecuadro(p,'f1',rect),{id:1,texto:'ENTRADAS'});
 p.fotografias[0].resultado.bloques.push({id:2,texto:'Otro texto',caja:[210,205,340,245]});
 assert.equal(Core.sugerirBloqueEnRecuadro(p,'f1',rect),null);
});
test('guardado del cuadro rojo reutiliza el bloque OCR sin duplicarlo y no realiza SQL',()=>{
 const p=demo();const rect=[.18,.18,.46,.09];
 const id=Core.guardarRecuadro(p,'f1',rect,'categoria','ENTRADAS',{idBloque:1});
 assert.equal(id,1);assert.equal(p.fotografias[0].resultado.bloques.length,1);
 assert.equal(p.fotografias[0].resultado.bloques[0].tipoVisual,'categoria');
 assert.equal(p.gruposPreparados[0].nombre,'ENTRADAS');
 assert.doesNotThrow(()=>validarProyecto(p));
});
test('cuadro amarillo crea propuesta y no altera productos ya importados',()=>{
 const p=demo();p.productos.push({id:'sql',nombre:'Importado',precio:35,importado:true,foto:'otro',evidencia:[]});
 const id=Core.guardarRecuadro(p,'f1',[.1,.3,.55,.1],'producto','Hamburguesa');
 assert.equal(p.productos.length,2);
 assert.equal(p.productos[1].nombre,'Hamburguesa');assert.equal(p.productos[0].precio,35);
 assert.equal(p.fotografias[0].resultado.bloques.find(b=>b.id===id).tipoVisual,'producto');
});
test('UI integra cinco botones listos, arrastre táctil y botón cancelar',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../public/menu.html'),'utf8');
 const script=fs.readFileSync(path.join(__dirname,'../public/menu-visual.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'../public/menu.css'),'utf8');
 for(const kind of ['categoria','producto','descripcion','precio','ignorar'])assert.match(html,new RegExp('data-preset="'+kind+'"'));
 for(const name of ['visualPresetLayer','visualPresetBox','visualPresetResize','visualPresetSave','visualPresetCancel'])assert.match(html,new RegExp('id="'+name+'"'));
 assert.match(script,/addEventListener\('pointermove',presetMove\)/);
 assert.match(script,/addEventListener\('keydown',presetKeyboard\)/);
 assert.match(css,/\.visual-preset-box\{[^}]*touch-action:none/);
});
