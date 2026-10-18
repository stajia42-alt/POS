'use strict';
const t=require('node:test'),a=require('node:assert/strict');
const C=require('../menu_contrato'),X=require('../menu_compuestos');
const diagnosed=require('./compuestos-fixture.json');
function meta(){
 const m=structuredClone(require('./soft11-estructura-revisada.json'));
 for(const key of ['tablas','columnas','indices','relaciones'])m[key].push(...structuredClone(diagnosed[key]));
 return m;
}
function sampleP(tipo='hamburguesa'){
 const isZero=tipo==='chilaquiles';return {id:isZero?'C':'H',nombre:isZero?'CHILAQUILES':'HAMBURGUESA DEMO',clave:isZero?'000092':'000091',
 precio:isZero?0:250,idgrupo:isZero?'02':'03',tipo:'con_opciones',revisado:true,excluido:false,ingredientes:[],
 modificadores:isZero?[{nombre:'SALSA CHILAQUILES',obligatorio:true,minimo:1,maximo:1,opciones:[{nombre:'VERDES',precio:0},{nombre:'ROJOS',precio:0}]},{nombre:'PROTEINA',obligatorio:true,minimo:1,maximo:1,opciones:[{nombre:'SENCILLOS',precio:120},{nombre:'CON POLLO',precio:180}]}]:[{nombre:'OPCION 3',obligatorio:true,minimo:1,maximo:1,opciones:[{nombre:'SIN PAPAS',precio:0},{nombre:'CON PAPAS',precio:30},{nombre:'CON PAPAS SAZONADAS',precio:35}]}]};
}
const cat=[{idproducto:'01004',descripcion:'CON PAPAS',idgrupo:'01'},{idproducto:'01005',descripcion:'SIN PAPAS',idgrupo:'01'},{idproducto:'01006',descripcion:'CON PAPAS SAZONADAS',idgrupo:'01'}];
const grp=[{idgrupo:'01',descripcion:'MODIFICADORES ALIMENTOS',clasificacion:2},{idgrupo:'02',descripcion:'ANTOJITOS',clasificacion:2},{idgrupo:'03',descripcion:'HAMBURGUESAS',clasificacion:2}];
const mods=[{idgruposmodificadores:'01',descripcion:'SALSA CHILAQUILES'},{idgruposmodificadores:'02',descripcion:'PROTEINA'},{idgruposmodificadores:'03',descripcion:'OPCION 3'}];
t('diagnóstico real: tablas, campos y relaciones de modificadores existen',()=>a.doesNotThrow(()=>X.checkedMeta(meta())));
t('hamburguesa: una sola principal, 3 modificadores con precios propios',()=>{
 const m=meta(),p=sampleP(),prepared=X.preparar({productos:[p],grupos:[]},cat,grp,[],m);
 a.equal(prepared.input.productos.length,1);a.deepEqual(prepared.compuestos[0].grupos[0].opciones.map(o=>o.adicional),[0,30,35]);
 const plan={productos:[{id:p.id,clave:p.clave,nombre:p.nombre,idgrupo:p.idgrupo}],grupos:[]};
 const completed=X.completar(plan,prepared,grp,cat,mods,{idCol:C.columna(m,'gruposmodificadores','idgruposmodificadores'),defaults:{forzarcaptura:1,incluidos:0,captura_incluido:0,maximomodificadores:1,secuenciacompuesto:true,finalizarsecuenciacompuesto:true}});
 a.equal(completed.compuestos.length,1);a.equal(completed.compuestos[0].grupos[0].idgrupo,'03');
 a.deepEqual(completed.compuestos[0].grupos[0].opciones.map(o=>o.clave),['01005','01004','01006']);
 a.equal(completed.gruposDeModificadores.length,0);
});
t('chilaquiles: precio base cero y dos grupos, cada uno exige una opción',()=>{
 const m=meta(),p=sampleP('chilaquiles'),prepared=X.preparar({productos:[p],grupos:[]},cat,grp,[],m);
 a.equal(prepared.input.productos[0].precio,0);a.equal(prepared.compuestos[0].grupos.length,2);
 a.deepEqual(prepared.compuestos[0].grupos[1].opciones.map(o=>o.adicional),[120,180]);
});
t('un grupo opcional, precio ausente o elección múltiple no se importan silenciosamente',()=>{
 for(const change of [p=>p.modificadores[0].obligatorio=false,p=>p.modificadores[0].opciones[1].precio=null,p=>p.modificadores[0].maximo=2]){
   const p=sampleP();change(p);a.throws(()=>X.preparar({productos:[p],grupos:[]},cat,grp,[],meta()),/Confirma|Precio/);
 }
});
t('faltan FK o permisos: bloquear escritura antes de transacción',()=>{
 const m=meta();m.relaciones=[];a.throws(()=>X.checkedMeta(m),/No se verificó/);
 const m2=meta();m2.tablas.find(t=>t.tabla==='modificadores').puedeInsertar=0;a.throws(()=>X.checkedMeta(m2),/lectura e inserción/);
});
t('crea grupo auxiliar usando la clasificación real del grupo de alimentos, no un código universal',()=>{
 const m=meta(),p=sampleP();
 const g=grp.filter(x=>x.idgrupo!=='01').map(x=>({...x,clasificacion:2}));
 const prep=X.preparar({productos:[p],grupos:[]},[],g,[],m);
 const aux=prep.input.grupos.find(x=>x.nombre==='MODIFICADORES ALIMENTOS');
 a.equal(aux.clasificacion,2);
 a.equal(prep.input.productos.filter(x=>x.idgrupo==='borrador:__restaurante_mod_2__').length,3);
});
t('integración con el plan transaccional existente: conserva principal y agrega sólo las opciones faltantes',()=>{
 const m=meta(),p=sampleP(),catalogo=[{idproducto:'01005',descripcion:'SIN PAPAS',idgrupo:'01'}];
 const gs=grp.map(x=>({...x,clasificacion:2,color:4235005,colorletra:0}));
 const prep=X.preparar({productos:[p],grupos:[]},catalogo,gs,[],m);
 const reference={idproducto:'03001',idempresa:'0000000001',idunidad:'ACTIVIDAD',precio:250,preciosinimpuestos:250,impuesto1:0,impuesto2:0,impuesto3:0,excentoimpuestos:1,precioabierto:2,bloqueado:0};
 const plan=C.planMenu(m,catalogo,gs,{...prep.input,configuracionConfirmada:true,servicios:{comedor:true,domicilio:true,rapido:true}},reference);
 a.equal(plan.productos.length,3);a.deepEqual(plan.productos.map(x=>x.nombre),['HAMBURGUESA DEMO','CON PAPAS','CON PAPAS SAZONADAS']);
 a.ok(plan.productos.every(x=>x.clave));
 const done=X.completar(plan,prep,gs,catalogo,mods,{idCol:C.columna(m,'gruposmodificadores','idgruposmodificadores'),defaults:{incluidos:0,forzarcaptura:1,maximomodificadores:1,captura_incluido:0,secuenciacompuesto:true,finalizarsecuenciacompuesto:true}});
 a.equal(done.compuestos.length,1);a.deepEqual(done.compuestos[0].grupos[0].opciones.map(x=>x.precio),[0,30,35]);
 a.equal(done.compuestos[0].grupos[0].opciones[0].clave,'01005');
});
t('menús diferentes: bebidas y alimentos no comparten por fuerza el mismo catálogo de modificadores',()=>{
 const m=meta(),alimento=sampleP(),bebida={...sampleP(),id:'B',nombre:'CAFE DEMO',clave:'000093',idgrupo:'04',precio:50,
 modificadores:[{nombre:'TIPO DE LECHE',obligatorio:true,minimo:1,maximo:1,opciones:[{nombre:'ENTERA',precio:0},{nombre:'DESLACTOSADA',precio:10}]}]};
 const gs=[...grp.map(g=>({...g,clasificacion:2})),{idgrupo:'04',descripcion:'CAFETERIA',clasificacion:1}];
 const prep=X.preparar({productos:[alimento,bebida],grupos:[]},[],gs,[],m);
 a.equal(prep.compuestos.length,2);
 a.ok(prep.input.productos.some(p=>p.nombre==='ENTERA'&&p.idgrupo==='borrador:__restaurante_mod_1__'));
 a.ok(prep.input.productos.some(p=>p.nombre==='SIN PAPAS'&&p.idgrupo==='01'));
 a.ok(prep.input.grupos.some(g=>g.nombre==='MODIFICADORES BEBIDAS'&&g.clasificacion===1));
});

t('menú OCR con categoría larga no excede 30 caracteres del grupo auxiliar SQL',()=>{
 const m=meta(), p=sampleP();
 p.grupo_detectado='HOT DOGS EL SONORENSE - TRADICIONALES Y SABROSOS';
 const gs=[{idgrupo:'03',descripcion:'TRADICIONALES Y SABROSOS',clasificacion:2}];
 const prep=X.preparar({productos:[p],grupos:[]},[],gs,[],m);
 const auxiliar=prep.input.grupos.find(g=>g.id==='__restaurante_mod_2__');
 a.equal(auxiliar.nombre,'MODIFICADORES ALIMENTOS');
 a.ok(auxiliar.nombre.length<=30);
 a.equal(prep.compuestos.length,1);
 a.equal(prep.compuestos[0].grupos[0].opciones.length,3);
});

t('reutiliza SIN PAPAS de otro catálogo compatible sin duplicarlo',()=>{
 const m=meta(),p=sampleP(), catalogo=[{idproducto:'01901',descripcion:'SIN PAPAS',idgrupo:'09'}];
 const gs=[...grp.map(g=>({...g,clasificacion:2})),{idgrupo:'09',descripcion:'PRUEBA MODIFICADORES',clasificacion:2}];
 const prepared=X.preparar({productos:[p],grupos:[]},catalogo,gs,[],m);
 a.equal(prepared.input.productos.filter(v=>v.nombre==='SIN PAPAS').length,0);
 const ref={idproducto:'03001',idempresa:'0000000001',idunidad:'ACTIVIDAD',precio:250,preciosinimpuestos:250,impuesto1:0,impuesto2:0,impuesto3:0,excentoimpuestos:1,precioabierto:2,bloqueado:0};
 const plan=C.planMenu(m,catalogo,gs,{...prepared.input,configuracionConfirmada:true,servicios:{comedor:true,domicilio:true,rapido:true}},ref);
 const done=X.completar(plan,prepared,gs,catalogo,mods,{idCol:C.columna(m,'gruposmodificadores','idgruposmodificadores'),defaults:{incluidos:0,forzarcaptura:1,maximomodificadores:1,captura_incluido:0,secuenciacompuesto:true,finalizarsecuenciacompuesto:true}});
 a.equal(done.compuestos[0].grupos[0].opciones[0].clave,'01901');
});
t('productos auxiliares con nombre repetido en distintos catálogos no se adivinan',()=>{
 const p=sampleP(), gs=[...grp.map(g=>({...g,clasificacion:2})),{idgrupo:'09',descripcion:'OTRO GRUPO',clasificacion:2},{idgrupo:'08',descripcion:'OTRO GRUPO 2',clasificacion:2}];
 const catalogo=[{idproducto:'01901',descripcion:'SIN PAPAS',idgrupo:'09'},{idproducto:'01801',descripcion:'SIN PAPAS',idgrupo:'08'}];
 a.throws(()=>X.preparar({productos:[p],grupos:[]},catalogo,gs,[],meta()),/varios productos existentes/);
});

t('reutiliza una opción única creada antes con clasificación distinta sin tocar el producto existente',()=>{
 const p=sampleP(),gs=[...grp.map(g=>({...g,clasificacion:2})),{idgrupo:'09',descripcion:'CATALOGO PRUEBA',clasificacion:1}];
 const existing=[{idproducto:'01901',descripcion:'SIN PAPAS',idgrupo:'09'}];
 const prepared=X.preparar({productos:[p],grupos:[]},existing,gs,[],meta());
 a.equal(prepared.input.productos.filter(v=>v.nombre==='SIN PAPAS').length,0);
 a.equal(prepared.compuestos[0].grupos[0].opciones[0].grupoAux,'09');
});

t('no reutiliza MODIFICADORES BEBIDAS para alimento aunque tenga clasificación invertida',()=>{
 const m=meta(),p=sampleP();
 const g=[{idgrupo:'03',descripcion:'HAMBURGUESAS',clasificacion:2},{idgrupo:'01',descripcion:'MODIFICADORES BEBIDAS',clasificacion:2}];
 const prep=X.preparar({productos:[p],grupos:[]},[],g,[],m);
 a.equal(prep.input.grupos[0].nombre,'MODIFICADORES ALIMENTOS');
});
t('reutiliza el catálogo genérico MODIFICADORES de la misma clasificación',()=>{
 const p=sampleP();
 const g=[{idgrupo:'03',descripcion:'HAMBURGUESAS',clasificacion:2},{idgrupo:'09',descripcion:'MODIFICADORES',clasificacion:2}];
 const prep=X.preparar({productos:[p],grupos:[]},[],g,[],meta());
 a.equal(prep.input.grupos.length,0);
 a.ok(prep.input.productos.some(x=>x.nombre==='SIN PAPAS'&&x.idgrupo==='09'));
});
