'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const core=require('../menu_captura_inteligente');
const {validarProyecto}=require('../public/menu-proyecto');
const gemini=require('../gemini_gratis');
const menu={lineas:['HAMBURGUESAS','Hamburguesa especial $150','Carne y queso','Extra queso +$15','Combo de la casa $200','Papas y bebida','BEBIDAS','Agua $25'],
 categorias:[{nombre:'HAMBURGUESAS',lineas:[0]},{nombre:'BEBIDAS',lineas:[6]}],productos:[
 {nombre:'Hamburguesa especial',precio:150,categoria:'HAMBURGUESAS',descripcion:'Carne y queso',lineas:[1,2,3],modificadores:[{nombre:'Extra queso',precio:15,lineas:[3]}]},
 {nombre:'Combo de la casa',precio:200,categoria:'HAMBURGUESAS',descripcion:'',lineas:[4,5],componentes:['Papas','Bebida']},
 {nombre:'Agua',precio:25,categoria:'BEBIDAS',descripcion:'',lineas:[7]}]};
test('transcripción y productos separados con nombres, precios, descripciones y categorías',()=>{
 const r=core.fromStructured(menu,[]);
 assert.equal(r.productos.length,3);assert.equal(r.productos[0].nombre,'Hamburguesa especial');assert.equal(r.productos[0].precio,150);
 assert.deepEqual(r.productos[0].ingredientes,['Carne y queso']);assert.equal(r.productos[1].precio,200);
 assert.equal(r.categorias.length,2);assert.equal(r.transcripcion.split('\n').length,8);
 assert.equal(r.productos[0].opcionesVisualesPendientes[0].tipo,'modificador');assert.equal(r.productos[1].opcionesVisualesPendientes[0].tipo,'componente');
 assert.equal(r.productos[2].necesitaConfirmacion,false);
});
test('un precio tomado de otro renglón nunca queda listo sin revisión',()=>{
 const m=structuredClone(menu);m.productos[0].precio=200;
 const r=core.fromStructured(m,[]);assert.equal(r.productos[0].necesitaConfirmacion,true);
 assert.match(r.productos[0].revision.join(' '),/Precio no verificable/);
});
test('nombre que Gemini inventó no se deja pasar como listo',()=>{
 const m=structuredClone(menu);m.productos[0].nombre='Hamburguesa extraterrestre';
 const r=core.fromStructured(m,[]);assert.equal(r.productos[0].necesitaConfirmacion,true);
});
test('precio ausente queda sin precio, nunca se infiere',()=>{
 const m=structuredClone(menu);m.productos[0].precio=null;
 const r=core.fromStructured(m,[]);assert.equal(r.productos[0].precio,null);assert.equal(r.productos[0].necesitaConfirmacion,true);
});
test('los datos transcritos se guardan y validan sin depender de SQL',()=>{
 const r=core.fromStructured(menu,[]);
 const project={version:1,gruposPreparados:[],fotografias:[{id:'foto',nombre:'menu.jpg',estado:'lista',resultado:r}],productos:r.productos.map((p,i)=>({...p,id:'id'+i,foto:'foto',clave:'A'+i,excluido:false}))};
 assert.doesNotThrow(()=>validarProyecto(project));
});
test('transcripción manual se puede reorganizar sin repetir OCR',()=>{
 const r=core.fromText('HAMBURGUESAS\nClásica $120\nEspecial $150',[]);
 assert.equal(r.productos.length,2);assert.equal(r.productos[1].precio,150);assert.equal(r.transcripcion.split('\n').length,3);
});
test('no permite solicitar corrección de un precio invisible',()=>{
 assert.throws(()=>core.validateSuggestions({cambios:[{id:'a',campo:'precio',valor:700}]},['a'],'Clásica $150'),/no se ve/i);
});
test('cambios propuestos requieren ids conocidos y campos permitidos',()=>{
 assert.throws(()=>core.validateSuggestions({cambios:[{id:'otro',campo:'nombre',valor:'Nuevo'}]},['a'],'X'),/desconocido/);
 assert.throws(()=>core.validateSuggestions({cambios:[{id:'a',campo:'sql',valor:'DROP'}]},['a'],'X'),/desconocido/);
 const c=core.validateSuggestions({cambios:[{id:'a',campo:'precio',valor:150}]},['a'],'Clásica $150');assert.equal(c[0].valor,150);
});
test('aplicar correcciones no modifica productos importados o revisados',()=>{
 assert.throws(()=>core.applySuggestions([{id:'a',importado:true}], [{id:'a',campo:'nombre',valor:'Otro'}]),/confirmado o importado/);
 const old=[{id:'a',nombre:'Clásica',precio:150,revision:[]}];const changed=core.applySuggestions(old,[{id:'a',campo:'nombre',valor:'Especial'}]);
 assert.equal(old[0].nombre,'Clásica');assert.equal(changed[0].nombre,'Especial');
});
test('rechaza lista inválida o excesiva y no suprime líneas transcritas',()=>{
 assert.throws(()=>core.fromStructured({...menu,lineas:null},[]));
 assert.throws(()=>core.fromStructured({...menu,productos:Array.from({length:400},()=>({nombre:'X'}))},[]));
 const r=core.fromStructured({...menu,productos:[]},[]);assert.equal(r.pendientes.length,6);
});
test('conserva índices aunque existan líneas vacías en la transcripción',()=>{
 const m=structuredClone(menu);m.lineas.splice(1,0,'');m.categorias[1].lineas=[7];m.productos.forEach(p=>p.lineas=p.lineas.map(i=>i>=1?i+1:i));
 const r=core.fromStructured(m,[]);assert.equal(r.bloques[1].texto,'');assert.equal(r.productos[0].necesitaConfirmacion,false);
});
test('Gemini prepara un solo envío de imagen que contiene texto y propuestas',async()=>{
 process.env.RESTAURANTE_GEMINI_API_KEY='clave_de_prueba_012345678901234567890';
 let calls=0;
 const answer={candidates:[{content:{parts:[{text:JSON.stringify(menu)}]}}]};
 const result=await gemini.extractCapture('QUJD','image/jpeg',{listar:async()=>['gemini-2.5-flash-lite'],request:async(path,body)=>{calls++;assert.match(path,/generateContent/);assert.match(body.contents[0].parts[0].text,/TRANSCRIBIR/);return answer;}});
 assert.equal(calls,1);assert.equal(result.data.productos.length,3);
});
test('Gemini genera sólo propuestas de cambios, no ejecuta importación',async()=>{
 process.env.RESTAURANTE_GEMINI_API_KEY='clave_de_prueba_012345678901234567890';
 const a=await gemini.suggestCaptureCorrections({transcripcion:'Clásica $150',instruccion:'Corrige el nombre',productos:[{id:'id1',nombre:'Clásica'}]},
 {listar:async()=>['gemini-2.5-flash-lite'],request:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({cambios:[{id:'id1',campo:'nombre',valor:'Clásica especial'}]})}]}}]})});
 assert.equal(a.cambios[0].id,'id1');
});
