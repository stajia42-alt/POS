'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Compuestos=require('../menu_compuestos');
const C=require('../menu_contrato');
const actual=require('./compuestos-fixture.json');
function meta(){
 const m=structuredClone(require('./soft11-estructura-revisada.json'));
 for(const key of ['tablas','columnas','indices','relaciones'])m[key].push(...structuredClone(actual[key]));
 return m;
}
const plan={
 tipo:'menu',productos:[
  {id:'uno',clave:'000001',nombre:'El sonorense Original',idgrupo:'03',precio:70},
  {id:'dos',clave:'000002',nombre:'El sonorense doble',idgrupo:'03',precio:85},
  {id:'aux0',clave:'000005',nombre:'SIN PAPAS',idgrupo:'04',precio:0},
  {id:'aux1',clave:'000006',nombre:'PAPAS A LA FRANCESA',idgrupo:'04',precio:0},
  {id:'aux2',clave:'000007',nombre:'PAPAS SAZONADAS',idgrupo:'04',precio:0}
 ],
 gruposDeModificadores:[{idgrupo:'04',descripcion:'TIPO DE PAPAS'}],
 compuestos:[{clave:'000001',grupos:[{idgrupo:'04',nombre:'TIPO DE PAPAS',orden:1,opciones:[{clave:'000005',precio:0},{clave:'000006',precio:30},{clave:'000007',precio:35}]}]},
 {clave:'000002',grupos:[{idgrupo:'04',nombre:'TIPO DE PAPAS',orden:1,opciones:[{clave:'000005',precio:0},{clave:'000006',precio:30},{clave:'000007',precio:35}]}]}],
 referenciaCompuesta:{incluidos:0,forzarcaptura:1,maximomodificadores:1,captura_incluido:0,secuenciacompuesto:true,finalizarsecuenciacompuesto:true}
};
test('regresión real: grupo nuevo utiliza IDGRUPOSMODIFICADORES, jamás IDGRUPO',()=>{
 const m=meta();
 const registro=Compuestos.valoresGrupoModificador(plan.gruposDeModificadores[0],m);
 assert.deepEqual(registro,{idgruposmodificadores:'04',descripcion:'TIPO DE PAPAS'});
 for(const key of Object.keys(registro))assert.ok(C.columna(m,'gruposmodificadores',key),'La columna '+key+' no existe en SQL');
 assert.equal(C.columna(m,'gruposmodificadores','idgrupo'),undefined);
});
test('regresión de 9.2.23: validación de varios padres y el mismo catálogo compartido, antes de escritura',()=>{
 assert.doesNotThrow(()=>Compuestos.validarPlanDeCompuestos(plan,meta()));
});
test('referencia obligatoria errónea: no se inicia una importación incompleta',()=>{
 const wrong=structuredClone(plan);wrong.referenciaCompuesta.forzarcaptura=0;
 assert.throws(()=>Compuestos.validarPlanDeCompuestos(wrong,meta()),/obligatoria/);
});
test('schema incompatible: no admitir una columna nueva de manera implícita',()=>{
 const broken=meta();broken.columnas=broken.columnas.filter(c=>!(c.tabla==='gruposmodificadores'&&c.columna==='idgruposmodificadores'));
 assert.throws(()=>Compuestos.validarPlanDeCompuestos(plan,broken),/Faltan columnas/);
});
test('duplicados de catálogo u opciones: fallan antes de comenzar transacción SQL',()=>{
 const copy=structuredClone(plan);
 copy.gruposDeModificadores.push({...copy.gruposDeModificadores[0]});
 assert.throws(()=>Compuestos.validarPlanDeCompuestos(copy,meta()),/repite un grupo/);
 const copy2=structuredClone(plan);copy2.compuestos[0].grupos[0].opciones[1].clave='000005';
 assert.throws(()=>Compuestos.validarPlanDeCompuestos(copy2,meta()),/duplicada/);
});
test('no se inventa importe para la opción',()=>{
 const copy=structuredClone(plan);copy.compuestos[0].grupos[0].opciones[2].precio=null;
 assert.throws(()=>Compuestos.validarPlanDeCompuestos(copy,meta()),/importe inválido/);
});
test('se puede reutilizar un grupo sin crear otro',()=>{
 const copy=structuredClone(plan);copy.gruposDeModificadores=[];
 assert.doesNotThrow(()=>Compuestos.validarPlanDeCompuestos(copy,meta()));
});
