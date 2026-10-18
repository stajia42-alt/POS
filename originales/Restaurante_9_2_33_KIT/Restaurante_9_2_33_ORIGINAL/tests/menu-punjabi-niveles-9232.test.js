'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const X=require('../menu_compuestos');
const C=require('../menu_contrato');
const fs=require('fs');
const path=require('path');
function meta(){const m=structuredClone(require('./soft11-estructura-revisada.json'));const fixture=require('./compuestos-fixture.json');for(const k of ['tablas','columnas','indices','relaciones'])m[k].push(...structuredClone(fixture[k]));return m;}
function producto(id,nombre,idgrupo,modificadores,precio=100){return {id,nombre,idgrupo,clave:'',precio,tipo:'con_opciones',revisado:true,excluido:false,ingredientes:[],modificadores};}
const nivel=()=>({nombre:'NIVEL DE PICOR',obligatorio:true,minimo:1,maximo:1,opciones:Array.from({length:10},(_,i)=>({nombre:'NIVEL '+(i+1),precio:0}))});
const tamano=()=>({nombre:'TAMAÑO',obligatorio:true,minimo:1,maximo:1,opciones:[{nombre:'CHICO',precio:0},{nombre:'GRANDE',precio:55}]});
test('60 productos Punjabi reutilizan diez niveles sin repetir NIVEL 1; tamaño precede al picor',()=>{
 const catalogo=[];const gs=[{idgrupo:'01',descripcion:'POLLO',clasificacion:2},{idgrupo:'02',descripcion:'BEBIDAS',clasificacion:1}];
 const products=Array.from({length:60},(_,i)=>producto('pun-'+i,'PRODUCTO '+i,i===59?'02':'01',i<19?[tamano(),nivel()]:[nivel()]));
 const prep=X.preparar({productos:products,grupos:[]},catalogo,gs,[],meta());
 assert.equal(prep.compuestos.length,60);
 assert.equal(prep.input.productos.filter(p=>p.nombre==='NIVEL 1').length,1);
 assert.equal(prep.input.productos.filter(p=>/^NIVEL (?:[1-9]|10)$/.test(p.nombre)).length,10);
 assert.equal(prep.input.productos.filter(p=>p.nombre==='CHICO').length,1);
 assert.equal(prep.input.productos.filter(p=>p.nombre==='GRANDE').length,1);
 assert.deepEqual(prep.compuestos[0].grupos.map(g=>g.nombre),['TAMAÑO','NIVEL DE PICOR']);
 assert.deepEqual(prep.compuestos[59].grupos.map(g=>g.nombre),['NIVEL DE PICOR']);
 const same=prep.compuestos.map(c=>c.grupos.find(g=>g.nombre==='NIVEL DE PICOR').opciones[0].idCreado);
 assert.equal(new Set(same).size,1);
});
test('regresion: la revisión resuelve NIVEL 1 con categoría nueva y opción compartida',()=>{
 const gs=[{idgrupo:'01',descripcion:'POLLO',clasificacion:2}];
 const products=[producto('a','POLLO 1','borrador:grp',[nivel()]),producto('b','POLLO 2','borrador:grp',[nivel()])];
 const input={productos:products,grupos:[{id:'grp',nombre:'POLLO',clasificacion:2}]};
 const prep=X.preparar(input,[],[],[],meta());
 const planned=prep.input.productos.map((p,i)=>({...p,clave:String(100+i).padStart(6,'0')}));
 const result=X.completar({productos:planned,grupos:[{id:'grp',idgrupo:'01'}]},prep,[],[],[],{idCol:{longitudBytes:5},defaults:{forzarcaptura:1,maximomodificadores:1,incluidos:0}});
 assert.equal(result.compuestos.length,2);
 assert.equal(result.compuestos[0].grupos[0].opciones[0].clave,result.compuestos[1].grupos[0].opciones[0].clave);
});
