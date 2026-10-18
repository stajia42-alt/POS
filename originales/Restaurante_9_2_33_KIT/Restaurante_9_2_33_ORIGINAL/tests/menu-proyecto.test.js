'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validarProyecto}=require('../public/menu-proyecto');
const {interpretarMenu}=require('../menu_contexto');
function example(){const result=interpretarMenu(['BEBIDAS','Agua $30']);return {version:1,gruposPreparados:[{id:'g1',nombre:'Bebidas'}],fotografias:[{id:'f1',nombre:'Texto OCR 1',estado:'lista',resultado:result}],productos:result.productos.map(p=>({...p,id:'p1',foto:'f1',idgrupo:'borrador:g1',clave:'',excluido:false}))};}
test('un proyecto valido conserva propuestas y evidencia sin mutar el original',()=>{
 const input=example(),before=JSON.stringify(input),result=validarProyecto(input);
 assert.deepEqual(result,{...input,clasificacionEsquema:'sql11'});assert.notEqual(result,input);assert.equal(JSON.stringify(input),before);
});
test('categorias nulas se rechazan antes de reemplazar el proyecto activo',()=>{
 const d=example();d.fotografias[0].resultado.categorias=[null];assert.throws(()=>validarProyecto(d),/categoría/);
});
test('las referencias de foto, evidencia y grupos deben existir',()=>{
 for(const change of [d=>d.productos[0].foto='otra',d=>d.productos[0].evidencia=[999],d=>d.productos[0].idgrupo='borrador:otro']){
  const d=example();change(d);assert.throws(()=>validarProyecto(d),/falta/);
 }
});
test('valores y claves peligrosas no llegan al editor',()=>{
 const price=example();price.productos[0].precio='30';assert.throws(()=>validarProyecto(price),/precio/);
 const options=example();options.productos[0].modificadores=[{nombre:'Cantidad',obligatorio:true,minimo:1,maximo:1,opciones:[null]}];assert.throws(()=>validarProyecto(options),/opciones/);
 const polluted=JSON.parse(JSON.stringify(example()).replace('"version":1','"version":1,"__proto__":{"injected":true}'));assert.throws(()=>validarProyecto(polluted),/propiedades/);assert.equal({}.injected,undefined);
});
test('una revision incompleta vuelve a pendiente y conserva todos los datos',()=>{
 const d=example();d.productos[0].revisado=true;d.productos[0].precio=null;const r=validarProyecto(d);
 assert.equal(r.productos[0].revisado,false);assert.equal(r.productos[0].precio,null);assert.equal(d.productos[0].revisado,true);assert.match(r.productos[0].revision.at(-1),/confirmar/);
});
test('recuperar una lectura interrumpida no la muestra como si siguiera ejecutandose',()=>{
 const d=example();d.fotografias[0].estado='analizando';const r=validarProyecto(d);assert.equal(r.fotografias[0].estado,'pendiente');assert.equal(r.productos.length,1);
});

test('migra clasificaciones preparadas antiguas sin cambiar grupos SQL',()=>{
 const input=example(); input.gruposPreparados[0].clasificacion=2;
 const r=validarProyecto(input);
 assert.equal(r.gruposPreparados[0].clasificacion,1); // Anterior: 2 = Bebidas
 assert.equal(r.clasificacionEsquema,'sql11');
 assert.equal(input.gruposPreparados[0].clasificacion,2);
 assert.equal(validarProyecto(r).gruposPreparados[0].clasificacion,1);
});
