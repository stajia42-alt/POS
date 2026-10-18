'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../menu_perfil_compuesto');
const G=require('../menu_grupo_config');
const C=require('../menu_contrato');
const X=require('../menu_compuestos');
function fixture(){
 const m=structuredClone(require('./soft11-estructura-revisada.json'));
 const d=structuredClone(require('./compuestos-fixture.json'));
 for(const key of ['tablas','columnas','indices','relaciones'])m[key].push(...d[key]);
 return m;
}
test('el perfil incorporado reconoce el esquema de compuestos observado sin un registro de prueba',()=>{
 const m=fixture();
 assert.equal(P.compatible(m),true);
 const ref=P.referencia(m);
 assert.equal(ref.origen,'perfil_sin_producto_de_prueba');
 assert.deepEqual(ref.defaults,{incluidos:0,forzarcaptura:1,maximomodificadores:1,captura_incluido:0,secuenciacompuesto:true,finalizarsecuenciacompuesto:true});
 X.checkedMeta(m);
});
test('un campo incompatible bloquea el perfil, no inventa parámetros',()=>{
 const m=fixture();
 C.columna(m,'gruposmodificadoresproductos','maximomodificadores').tipo='int';
 assert.equal(P.compatible(m),false);
 assert.throws(()=>P.referencia(m),/no coincide con el perfil SQL/);
});
test('clasificaciones SQL verificadas: alimentos 2 y bebidas 1',()=>{
 assert.deepEqual(G.CLASES,{alimentos:2,bebidas:1,otros:3});
 assert.equal(G.proponerClase('Hamburguesas'),2);
 assert.equal(G.proponerClase('BEBIDAS'),1);
 assert.equal(G.proponerClase('Otros'),3);
 assert.deepEqual(G.conflictosClasificacion([{idgrupo:'01',descripcion:'Alimentos',clasificacion:2},{idgrupo:'02',descripcion:'Bebidas',clasificacion:1}]),[]);
 assert.equal(G.conflictosClasificacion([{idgrupo:'02',descripcion:'Bebidas',clasificacion:2}]).length,1);
});
test('un menú nuevo no registra un producto de prueba para obtener compuestos',()=>{
 const m=fixture();
 const source={id:'p1',nombre:'HOT DOG',clave:'000101',idgrupo:'03',tipo:'con_opciones',precio:70,
   revisado:true,excluido:false,ingredientes:[],
   modificadores:[{nombre:'TIPO DE PAPAS',minimo:1,maximo:1,obligatorio:true,opciones:[
    {nombre:'SIN PAPAS',precio:0},{nombre:'PAPAS FRANCESAS',precio:30},{nombre:'PAPAS SAZONADAS',precio:35}]}]};
 const grupo=[{idgrupo:'03',descripcion:'HOT DOGS',clasificacion:2}];
 const prepared=X.preparar({productos:[source],grupos:[]},[],grupo,[],m);
 assert.equal(prepared.input.productos.filter(x=>x.nombre==='HOT DOG').length,1);
 assert.equal(prepared.input.grupos[0].nombre,'MODIFICADORES ALIMENTOS');
 assert.equal(prepared.input.grupos[0].clasificacion,2);
 const ref=P.referencia(m);
 assert.equal(ref.defaults.maximomodificadores,1);
});

test('el catálogo SQL oficial confirma la clasificación en esta instalación, no en otras sin comprobar',()=>{
 assert.equal(G.verificarCatalogoSQL([{descripcion:'ALIMENTOS',clasificacionventa:2},{descripcion:'BEBIDAS',clasificacionventa:1},{descripcion:'OTROS',clasificacionventa:3}]),true);
 assert.equal(G.verificarCatalogoSQL([{descripcion:'ALIMENTOS',clasificacionventa:1},{descripcion:'BEBIDAS',clasificacionventa:2},{descripcion:'OTROS',clasificacionventa:3}]),false);
});
