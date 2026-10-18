'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../menu_contrato');
// Estructura SINTÉTICA para comprobar reglas. No es un contrato de Soft Restaurant validado.
function estructura(){
 const m={completo:true,entorno:[{baseDatos:'PRUEBA_SINTETICA',servidorSQL:'doble-unitario',verDefinicionBase:1}],tablas:[],columnas:[],indices:[],relaciones:[],comprobaciones:[],disparadores:[]};
 const add=(tabla,fields,keys)=>{
  m.tablas.push({esquema:'dbo',tabla,puedeLeer:1,puedeInsertar:1});
  for(const [columna,tipo,longitudBytes] of fields)m.columnas.push({esquema:'dbo',tabla,columna,tipo,longitudBytes,precision:18,escala:2,admiteNulo:false,identidad:false,calculada:false,valorDefecto:null});
  keys.forEach((columna,i)=>m.indices.push({esquema:'dbo',tabla,indice:'PK_'+tabla,unico:true,primaria:true,deshabilitado:false,filtrado:false,incluida:false,orden:i+1,columna}));
 };
 add('grupos',[['idgrupo','varchar',5],['descripcion','nvarchar',120]],['idgrupo']);
 add('productos',[['idproducto','varchar',15],['descripcion','nvarchar',120],['idgrupo','varchar',5],...['usarcomedor','usardomicilio','usarrapido'].map(k=>[k,'bit',1])],['idproducto']);
 add('productosdetalle',[['idproducto','varchar',15],['idempresa','varchar',10],['idunidad','varchar',50],...['precio','preciosinimpuestos','impuesto1','impuesto2','impuesto3'].map(k=>[k,'money',8]),...['excentoimpuestos','bloqueado'].map(k=>[k,'bit',1]),['precioabierto','int',4]],['idproducto','idempresa']);
 add('empresas',[['idempresa','varchar',10]],['idempresa']);add('udsmedida',[['idunidad','varchar',50]],['idunidad']);
 return m;
}
const plantilla={idproducto:'BASE',idempresa:'EMPRESA02',idunidad:'PIEZA',precio:50,preciosinimpuestos:50,excentoimpuestos:1,impuesto1:0,impuesto2:0,impuesto3:0,precioabierto:2,bloqueado:0};
function producto(){return {nombre:'Agua',precio:28.50,clave:'B001',idgrupo:'01',tipo:'independiente',modificadores:[],ingredientes:[],revisado:true};}
function input(){return {productos:[producto()],exentoConfirmado:true,servicios:{comedor:true,domicilio:true,rapido:false}};}
const grupos=[{idgrupo:'01',descripcion:'Bebidas'}];
test('diagnóstico real: contratos reconocidos sin alterar triggers ni claves',()=>{
 const m=require('./soft11-estructura-revisada.json'),cap=C.evaluar(m);
 assert.equal(cap.grupos.lista,true,cap.grupos.motivos.join(' '));assert.equal(cap.productos.lista,true,cap.productos.motivos.join(' '));assert.equal(cap.modificadores.lista,false);
 assert.equal(cap.grupos.requiereModelo,false);
 assert.deepEqual(C.planGrupos(m,[],[{id:'g',nombre:'Entradas'}]).grupos[0].ajustes,{clasificacion:1,color:42495,colorletra:0});
 assert.equal(C.planGrupos(m,[],[{id:'g',nombre:'Entradas'}],{idgrupo:'02',clasificacion:2}).grupos[0].ajustes.clasificacion,1);
 const changed=structuredClone(m);changed.disparadores.find(t=>t.nombre==='TR_productosdetalle_insert').definicion+=' -- cambio no revisado';
 assert.equal(C.evaluar(changed).productos.lista,false);
 const noProfile=structuredClone(m);noProfile.disparadores=noProfile.disparadores.filter(t=>t.nombre!=='TR_productosdetalle_insert');assert.equal(C.evaluar(noProfile).productos.lista,false);
});
test('impuesto simple sólo se admite si concuerda con el precio real de referencia',()=>{
 const ref={...plantilla,excentoimpuestos:0,impuesto1:16,precio:116,preciosinimpuestos:100};
 const b={...input(),exentoConfirmado:false,configuracionConfirmada:true};b.productos[0].precio=232;
 const plan=C.planProductos(estructura(),[],grupos,b,ref);assert.equal(plan.productos[0].preciosinimpuestos,200);assert.equal(plan.plantilla.impuesto1,16);
 for(const change of [{preciosinimpuestos:116},{impuesto2:8},{impuestoimporte3:2},{dev_impuestoimporte3:true},{impuesto1:null},{impuesto1:150},{excentoimpuestos:null}])assert.throws(()=>C.planProductos(estructura(),[],grupos,b,{...ref,...change}),/configuración/);
});
test('grupos y claves automáticas se revisan como un solo menú',()=>{
 const b={...input(),grupos:[{id:'entrada',nombre:'Entradas'},{id:'logo',nombre:'Logotipo no usado'}]};b.productos[0]={...producto(),id:'p1',clave:'',idgrupo:'borrador:entrada'};
 const p=C.planMenu(estructura(),[{idproducto:'000001',descripcion:'Otro'}],[],b,plantilla);
 assert.equal(p.grupos.length,1);assert.equal(p.productos[0].clave,'000002');assert.equal(p.productos[0].idgrupo,p.grupos[0].idgrupo);
 assert.equal(p.tipo,'menu');assert.equal(b.productos[0].clave,'');
});
test('metadatos completos habilitan sólo contratos cubiertos; modificadores siguen sin inferirse',()=>{
 const c=C.evaluar(estructura());assert.equal(c.grupos.lista,true);assert.equal(c.productos.lista,true);assert.equal(c.modificadores.lista,false);
});
test('sin permisos de metadatos o inserción no hay escritura',()=>{
 const m=estructura();m.completo=false;assert.equal(C.evaluar(m).grupos.lista,false);m.completo=true;m.tablas[0].puedeInsertar=0;assert.equal(C.evaluar(m).grupos.lista,false);
});
test('clave única deshabilitada, filtrada o incompleta no se acepta',()=>{
 for(const change of [{deshabilitado:true},{filtrado:true},{incluida:true}]){
  const m=estructura();Object.assign(m.indices[0],change);assert.equal(C.evaluar(m).grupos.lista,false);
 }
 const m=estructura();m.indices=m.indices.filter(x=>!(x.tabla==='productosdetalle'&&x.columna==='idempresa'));assert.equal(C.evaluar(m).productos.lista,false);
});
test('triggers activos y relaciones desconocidas bloquean antes de generar un plan',()=>{
 const m=estructura();m.disparadores.push({esquema:'dbo',tabla:'grupos',deshabilitado:false,nombre:'T'});assert.throws(()=>C.planGrupos(m,[],[{id:'a',nombre:'Sopas'}]),/disparadores/);
 m.disparadores=[];m.relaciones.push({esquemaOrigen:'dbo',tablaOrigen:'grupos',columnaOrigen:'idgrupo',esquemaDestino:'dbo',tablaDestino:'secreto',columnaDestino:'id',relacion:'FK'});assert.equal(C.evaluar(m).grupos.lista,false);
});
test('campo obligatorio desconocido no recibe un valor inventado',()=>{
 const m=estructura();m.columnas.push({...m.columnas[0],columna:'reglaNoConocida'});assert.throws(()=>C.planGrupos(m,[],[{id:'a',nombre:'Sopas'}]),/obligatorio/);
});
test('ajuste obligatorio conocido requiere modelo existente; se conserva su valor',()=>{
 const m=estructura();m.columnas.push({...m.columnas[0],columna:'color',tipo:'int',longitudBytes:4});
 assert.equal(C.evaluar(m).grupos.requiereModelo,true);assert.throws(()=>C.planGrupos(m,[],[{id:'a',nombre:'Sopas'}]),/modelo/);
 assert.equal(C.planGrupos(m,[],[{id:'a',nombre:'Sopas'}],{idgrupo:'02',color:44}).grupos[0].ajustes.color,42495);
});
test('evita grupos duplicados por acentos, espacios y equivalencia, sin descartar asignaciones',()=>{
 const p=C.planGrupos(estructura(),[{idgrupo:'02',descripcion:'BEBIDAS'}],[{id:'a',nombre:' Bebidas '},{id:'b',nombre:'SOPAS'},{id:'c',nombre:'sopas'}]);
 assert.equal(p.grupos.length,3);assert.deepEqual(p.grupos.map(x=>x.accion),['existente','crear','existente']);assert.equal(p.grupos[1].idgrupo,p.grupos[2].idgrupo);
});
test('catálogo ambiguo y grupos con ID de proyecto repetido requieren revisión',()=>{
 assert.throws(()=>C.planGrupos(estructura(),[{idgrupo:'01',descripcion:'Bebidas'},{idgrupo:'02',descripcion:'BEBIDAS'}],[{id:'a',nombre:'Bebidas'}]),/varios/);
 assert.throws(()=>C.planGrupos(estructura(),[],[{id:'a',nombre:'Sopas'},{id:'a',nombre:'Bebidas'}]),/único/);
});
test('nombres no latinos distintos no colapsan a la misma categoría vacía',()=>{
 const p=C.planGrupos(estructura(),[{idgrupo:'01',descripcion:'飲料'}],[{id:'a',nombre:'湯'}]);assert.equal(p.grupos[0].accion,'crear');assert.notEqual(p.grupos[0].idgrupo,'01');
});
test('nombres y claves respetan la longitud real; no se recorta el texto',()=>{
 assert.throws(()=>C.planGrupos(estructura(),[],[{id:'a',nombre:'X'.repeat(61)}]),/máximo/);
 const m=estructura();m.columnas[0].longitudBytes=1;const gs=Array.from({length:9},(_,i)=>({idgrupo:String(i+1),descripcion:'g'+i}));assert.throws(()=>C.planGrupos(m,gs,[{id:'a',nombre:'Sopas'}]),/No hay claves/);
});
test('producto usa empresa y unidad de referencia real; decimal 28.50 es válido',()=>{
 const p=C.planProductos(estructura(),[],grupos,input(),plantilla);
 assert.equal(p.plantilla.idempresa,'EMPRESA02');assert.equal(p.plantilla.idunidad,'PIEZA');assert.equal(p.productos[0].precio,28.5);
});
test('nunca guarda un padre de $0 omitiendo modificadores',()=>{
 const b=input();b.productos[0]={...producto(),precio:0,tipo:'con_opciones',modificadores:[{nombre:'Cantidad'}]};
 assert.throws(()=>C.planProductos(estructura(),[],grupos,b,plantilla),e=>e.codigo==='MODIFICADORES_PENDIENTES');
 b.productos[0].tipo='independiente';assert.throws(()=>C.planProductos(estructura(),[],grupos,b,plantilla),/opciones/);
});
test('exención no se presume, incluso si el producto de referencia es exento',()=>{
 const b=input();b.exentoConfirmado=false;assert.throws(()=>C.planProductos(estructura(),[],grupos,b,plantilla),/Confirma/);
 assert.throws(()=>C.planProductos(estructura(),[],grupos,input(),{...plantilla,impuesto1:16}),/configuración exenta/);
});
test('clave, nombre, grupo y revisión se vuelven a validar en servidor',()=>{
 assert.throws(()=>C.planProductos(estructura(),[{idproducto:'B001',descripcion:'Otro'}],grupos,input(),plantilla),/Clave ocupada/);
 assert.throws(()=>C.planProductos(estructura(),[{idproducto:'XX',descripcion:'agua'}],grupos,input(),plantilla),/ya existente/);
 assert.throws(()=>C.planProductos(estructura(),[],[],input(),plantilla),/no existe/);
 const b=input();b.productos[0].revisado=false;assert.throws(()=>C.planProductos(estructura(),[],grupos,b,plantilla),/revisados/);
});
test('presentaciones quedan en el nombre; ingredientes requieren un campo real',()=>{
 const b=input();b.productos[0].presentacion='4 piezas';assert.equal(C.planProductos(estructura(),[],grupos,b,plantilla).productos[0].nombre,'Agua (4 piezas)');
 b.productos[0].ingredientes=['Cerdo','Napa'];assert.throws(()=>C.planProductos(estructura(),[],grupos,b,plantilla),/Ingredientes/);
 const m=estructura();m.columnas.push({...m.columnas.find(x=>x.tabla==='productos'&&x.columna==='descripcion'),columna:'descripcion_detalle',longitudBytes:1000,admiteNulo:true});
 assert.equal(C.planProductos(m,[],grupos,b,plantilla).productos[0].detalle,'Cerdo\nNapa');
});
test('precios inválidos y duplicados dentro del lote impiden todo el plan',()=>{
 for(const value of [null,'',-1,1.001,Infinity,NaN,10000000]){const b=input();b.productos[0].precio=value;assert.throws(()=>C.planProductos(estructura(),[],grupos,b,plantilla),/Precio inválido/);}
 const b=input();b.productos.push({...producto(),clave:'B002'});assert.throws(()=>C.planProductos(estructura(),[],grupos,b,plantilla),/repetido/);
});
test('nombre mal formado y servicios vacíos no pasan por campos adicionales del cliente',()=>{
 const b=input();b.productos[0].nombre=123;assert.throws(()=>C.planProductos(estructura(),[],grupos,b,plantilla),/nombre/);
 const a=input();a.servicios={comedor:false,domicilio:false,rapido:false,otro:true};assert.throws(()=>C.planProductos(estructura(),[],grupos,a,plantilla),/servicios/);
});
// Dobles de transacción sólo para verificar errores, orden de llamadas y recuperación.
// No certifican el dialecto T-SQL ni la compatibilidad con una instalación real.
const fs=require('fs'),os=require('os'),path=require('path'),realSql=require('mssql');
const {crearServicio,historial}=require('../menu_operaciones');
const {consulta}=require('../menu_diagnostico');
function servicioPrueba(options={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'menu-contract-')),db={rows:options.rows?structuredClone(options.rows):options.forProducts?structuredClone(grupos):[],products:[],details:[],log:[],connects:0},m=estructura();
 if(options.grupoCampos)for(const [columna,tipo,bytes] of [['clasificacion','numeric',5],['color','numeric',9],['colorletra','numeric',9]])m.columnas.push({...m.columnas[0],columna,tipo,longitudBytes:bytes,admiteNulo:true});
 class Request{
  constructor(ctx){this.ctx=ctx;this.params={};}input(k,type,value){this.params[k]=value;return this;}
  async query(s){
   db.log.push(s);
   if(s===consulta)return {recordsets:['entorno','tablas','columnas','indices','relaciones','comprobaciones','disparadores'].map(k=>m[k])};
   if(s.includes('sp_getapplock'))return {recordset:[{resultado:0}]};
   if(s.startsWith('SELECT TOP (2) idempresa FROM dbo.empresas'))return {recordset:structuredClone(options.empresas??[{idempresa:plantilla.idempresa}])};
   if(s.startsWith('SELECT DISTINCT TOP (2) d.idempresa'))return {recordset:structuredClone(options.empresaUsada??options.empresas??[{idempresa:plantilla.idempresa}])};
   if(s.startsWith('SELECT TOP (201) idunidad FROM dbo.udsmedida'))return {recordset:structuredClone(options.unidades??[{idunidad:plantilla.idunidad}])};
   if(s.startsWith('SELECT DISTINCT TOP (10) precioabierto FROM dbo.productosdetalle'))return {recordset:[{precioabierto:2}]};
   if(s.startsWith('SELECT TOP (2000) d.idproducto'))return {recordset:structuredClone(options.referencias??[{...plantilla,descripcion:'Agua de prueba',idgrupo:'01'}])};
   if(s.startsWith('SELECT idgrupo,descripcion')&&s.includes('FROM dbo.grupos'))return {recordset:structuredClone((this.ctx.rows||db.rows).filter(x=>!s.includes('@clave')||x.idgrupo===this.params.clave))};
   if(s.startsWith('SELECT HAS_PERMS_BY_NAME'))return {recordset:[{puedeActualizar:1}]};
   if(s.startsWith('SELECT idproducto,descripcion FROM dbo.productos'))return {recordset:structuredClone(this.ctx.products||db.products)};
   if(s.includes('FROM dbo.productosdetalle')&&s.includes('WHERE idproducto=@idproducto AND idempresa=@idempresa'))return {recordset:[structuredClone(options.reference||plantilla)]};
   if(s.startsWith('SELECT idproducto,idempresa FROM dbo.productosdetalle WITH (TABLOCKX,HOLDLOCK)'))return {recordset:structuredClone((this.ctx.details||db.details).filter(d=>d.idproducto===this.params.clave))};
   if(s.startsWith('SELECT [idempresa] FROM dbo.[empresas]'))return {recordset:[{idempresa:plantilla.idempresa}]};
   if(s.startsWith('SELECT [idunidad] FROM dbo.[udsmedida]'))return {recordset:[{idunidad:plantilla.idunidad}]};
   if(s.startsWith('INSERT INTO [dbo].[productos')){
    this.ctx.inserts++;if(options.failInsert===this.ctx.inserts)throw Error('Falla unitaria de producto');
    const cols=s.match(/\((.+)\) VALUES/)[1].split(',').map(x=>x.slice(1,-1)),row=Object.fromEntries(cols.map((k,i)=>[k,this.params['v'+i]]));
    (s.startsWith('INSERT INTO [dbo].[productosdetalle]')?this.ctx.details:this.ctx.products).push(row);return {rowsAffected:[1]};
   }
   if(s.startsWith('SELECT p.descripcion,p.idgrupo,p.usarcomedor')){
    const p=this.ctx.products.find(x=>x.idproducto===this.params.clave),d=this.ctx.details.find(x=>x.idproducto===this.params.clave&&x.idempresa===this.params.empresa);
    return {recordset:p&&d?[{...p,...d,...(options.tamperPrice?{precio:999}:{} )}]:[]};
   }
   if(s.startsWith('INSERT INTO [dbo].[grupos]')){
    const tx=this.ctx;tx.inserts++;
    if(options.failInsert===tx.inserts)throw Error('ERROR SINTÉTICO: falla de inserción');
    const cols=s.match(/\((.+)\) VALUES/)[1].split(',').map(x=>x.slice(1,-1));tx.rows.push(Object.fromEntries(cols.map((k,i)=>[k,this.params['v'+i]])));return {rowsAffected:[1]};
   }
   if(s.startsWith('UPDATE dbo.grupos SET ')){const row=this.ctx.rows.find(g=>g.idgrupo===this.params.id);if(!row)return {rowsAffected:[0]};Object.assign(row,{clasificacion:this.params.clasificacion,color:this.params.color,colorletra:this.params.colorletra});return {rowsAffected:[1]};}
   if(s.startsWith('SELECT idgrupo,descripcion,clasificacion,color,colorletra FROM dbo.grupos WHERE idgrupo=@id'))return {recordset:structuredClone((this.ctx.rows||db.rows).filter(g=>g.idgrupo===this.params.id))};
   throw Error('Consulta no prevista por el doble unitario: '+s.slice(0,100));
  }
 }
 db.request=()=>new Request(db);
 class Transaction{
  constructor(){this.rows=structuredClone(db.rows);this.products=structuredClone(db.products);this.details=structuredClone(db.details);this.inserts=0;}async begin(){db.log.push('BEGIN');}on(){}request(){return new Request(this);}
  async commit(){db.log.push('COMMIT');db.rows=this.rows;db.products=this.products;db.details=this.details;if(options.ambiguousCommit)throw Error('Confirmación perdida (prueba)');}
  async rollback(){db.log.push('ROLLBACK');}
 }
 const sql={...realSql,Request,Transaction};let now=1000;
 const service=crearServicio({conectar:async()=>{db.connects++;return db;},sql,configDir:options.badDir?path.join(dir,'file'):dir,now:()=>now});
 if(options.badDir)fs.writeFileSync(path.join(dir,'file'),'not a directory');
 return {service,db,m,dir,expire:()=>now+=11*60000,close:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
test('transacción unitaria: confirma todo el lote, registra y no repite un INSERT al reintentar',async()=>{
 const h=servicioPrueba();try{
  const preview=await h.service.previsualizar('grupos',{grupos:[{id:'a',nombre:'Entradas'},{id:'b',nombre:'Sopas'}]},'owner');
  assert.equal(h.db.rows.length,0);const body={token:preview.token,confirmacion:'CREAR GRUPOS'};
  const result=await h.service.confirmar('grupos',body,'owner');assert.equal(result.correcto,true);assert.equal(result.creados,2);assert.equal(h.db.rows.length,2);
  const before=h.db.log.length;assert.equal((await h.service.confirmar('grupos',body,'owner')).repetida,true);assert.equal(h.db.log.length,before);
  assert.equal(historial(path.join(h.dir,'menu-operaciones'),preview.token).estado,'confirmada');
 }finally{h.close();}
});
test('transacción unitaria: falla la segunda inserción y revierte la primera, sin COMMIT',async()=>{
 const h=servicioPrueba({failInsert:2});try{
  const p=await h.service.previsualizar('grupos',{grupos:[{id:'a',nombre:'Sopas'},{id:'b',nombre:'Bebidas'}]},'owner');
  const r=await h.service.confirmar('grupos',{token:p.token,confirmacion:'CREAR GRUPOS'},'owner');
  assert.equal(r.correcto,false);assert.equal(r.rollbackConfirmado,true);assert.equal(h.db.rows.length,0);assert.ok(h.db.log.includes('ROLLBACK'));assert.ok(!h.db.log.includes('COMMIT'));
 }finally{h.close();}
});
test('transacción unitaria: conexión o estructura cambiada impide INSERT',async()=>{
 const h=servicioPrueba();try{
  const p=await h.service.previsualizar('grupos',{grupos:[{id:'a',nombre:'Sopas'}]},'owner');h.m.entorno[0].servidorSQL='OTRO';
  const r=await h.service.confirmar('grupos',{token:p.token,confirmacion:'CREAR GRUPOS'},'owner');assert.equal(r.codigo,'ESTRUCTURA_CAMBIADA');assert.ok(!h.db.log.some(x=>x.startsWith('INSERT')));
 }finally{h.close();}
});
test('transacción unitaria: cambio concurrente del catálogo exige una revisión nueva',async()=>{
 const h=servicioPrueba();try{
  const p=await h.service.previsualizar('grupos',{grupos:[{id:'a',nombre:'Sopas'}]},'owner');h.db.rows.push({idgrupo:'01',descripcion:'Sopas'});
  const r=await h.service.confirmar('grupos',{token:p.token,confirmacion:'CREAR GRUPOS'},'owner');assert.equal(r.codigo,'CATALOGO_CAMBIADO');assert.equal(h.db.rows.length,1);assert.ok(!h.db.log.some(x=>x.startsWith('INSERT')));
 }finally{h.close();}
});
test('transacción unitaria: sin copia de recuperación no comienza una escritura SQL',async()=>{
 const h=servicioPrueba({badDir:true});try{
  const p=await h.service.previsualizar('grupos',{grupos:[{id:'a',nombre:'Sopas'}]},'owner');const n=h.db.connects;
  await assert.rejects(()=>h.service.confirmar('grupos',{token:p.token,confirmacion:'CREAR GRUPOS'},'owner'),e=>e.codigo==='REGISTRO_NO_DISPONIBLE');assert.equal(h.db.connects,n);assert.ok(!h.db.log.includes('BEGIN'));
 }finally{h.close();}
});
test('transacción unitaria: COMMIT de resultado incierto no se anuncia como éxito ni se reintenta',async()=>{
 const h=servicioPrueba({ambiguousCommit:true});try{
  const p=await h.service.previsualizar('grupos',{grupos:[{id:'a',nombre:'Sopas'}]},'owner'),body={token:p.token,confirmacion:'CREAR GRUPOS'};
  const r=await h.service.confirmar('grupos',body,'owner');assert.equal(r.correcto,false);assert.equal(r.resultadoIncierto,true);assert.equal(historial(path.join(h.dir,'menu-operaciones'),p.token).estado,'resultado_incierto');
  await assert.rejects(()=>h.service.confirmar('grupos',body,'owner'),/ya tiene un registro/);
 }finally{h.close();}
});
test('tokens vencidos, de otra sesión o sin confirmación no inician transacciones',async()=>{
 const h=servicioPrueba();try{
  const p=await h.service.previsualizar('grupos',{grupos:[{id:'a',nombre:'Sopas'}]},'owner'),body={token:p.token,confirmacion:'CREAR GRUPOS'};
  await assert.rejects(()=>h.service.confirmar('grupos',body,'other'),/otra sesión/);
  await assert.rejects(()=>h.service.confirmar('grupos',{...body,confirmacion:''},'owner'),/Confirma/);
  h.expire();await assert.rejects(()=>h.service.confirmar('grupos',body,'owner'),/venció/);assert.ok(!h.db.log.includes('BEGIN'));
 }finally{h.close();}
});
test('transacción unitaria: producto y precio se verifican juntos con empresa elegida',async()=>{
 const h=servicioPrueba({forProducts:true});try{
  const b={...input(),plantilla:{idproducto:plantilla.idproducto,idempresa:plantilla.idempresa}};
  const p=await h.service.previsualizar('productos',b,'owner');const r=await h.service.confirmar('productos',{token:p.token,confirmacion:'IMPORTAR PRODUCTOS'},'owner');
  assert.equal(r.correcto,true);assert.equal(h.db.products.length,1);assert.equal(h.db.details[0].idempresa,'EMPRESA02');assert.equal(h.db.details[0].precio,28.5);assert.equal(h.db.details[0].idunidad,'PIEZA');
 }finally{h.close();}
});
test('transacción unitaria: segundo precio falla y no queda ningún producto parcial',async()=>{
 const h=servicioPrueba({forProducts:true,failInsert:4});try{
  const b={...input(),plantilla:{idproducto:plantilla.idproducto,idempresa:plantilla.idempresa}};b.productos.push({...producto(),clave:'B002',nombre:'Agua mineral'});
  const p=await h.service.previsualizar('productos',b,'owner');const r=await h.service.confirmar('productos',{token:p.token,confirmacion:'IMPORTAR PRODUCTOS'},'owner');
  assert.equal(r.correcto,false);assert.equal(r.rollbackConfirmado,true);assert.equal(h.db.products.length,0);assert.equal(h.db.details.length,0);assert.ok(!h.db.log.includes('COMMIT'));
 }finally{h.close();}
});
test('transacción unitaria: precio verificado distinto revierte la operación',async()=>{
 const h=servicioPrueba({forProducts:true,tamperPrice:true});try{
  const b={...input(),plantilla:{idproducto:plantilla.idproducto,idempresa:plantilla.idempresa}};
  const p=await h.service.previsualizar('productos',b,'owner');const r=await h.service.confirmar('productos',{token:p.token,confirmacion:'IMPORTAR PRODUCTOS'},'owner');
  assert.equal(r.correcto,false);assert.match(r.error,/verificación/);assert.equal(h.db.products.length,0);
 }finally{h.close();}
});
test('transacción unitaria: crear categoría y producto juntos; reintentar no duplica',async()=>{
 const h=servicioPrueba();try{
  const b={...input(),plantilla:{idproducto:plantilla.idproducto,idempresa:plantilla.idempresa},grupos:[{id:'entrada',nombre:'Entradas'}]};b.productos[0]={...producto(),clave:'',idgrupo:'borrador:entrada'};
  const p=await h.service.previsualizar('menu',b,'owner');assert.equal(h.db.rows.length,0);
  const body={token:p.token,confirmacion:'IMPORTAR MENU'},r=await h.service.confirmar('menu',body,'owner');
  assert.equal(r.correcto,true,r.error);assert.equal(h.db.rows.length,1);assert.equal(h.db.products.length,1);assert.equal(h.db.details.length,1);assert.equal(r.gruposCreados,1);
  assert.equal((await h.service.confirmar('menu',body,'owner')).repetida,true);
 }finally{h.close();}
});
test('transacción unitaria: precio fallido revierte también el grupo nuevo',async()=>{
 const h=servicioPrueba({failInsert:3});try{
  const b={...input(),plantilla:{idproducto:plantilla.idproducto,idempresa:plantilla.idempresa},grupos:[{id:'entrada',nombre:'Entradas'}]};b.productos[0]={...producto(),clave:'',idgrupo:'borrador:entrada'};
  const p=await h.service.previsualizar('menu',b,'owner'),r=await h.service.confirmar('menu',{token:p.token,confirmacion:'IMPORTAR MENU'},'owner');
  assert.equal(r.correcto,false);assert.equal(r.rollbackConfirmado,true);assert.equal(h.db.rows.length,0);assert.equal(h.db.products.length,0);assert.ok(!h.db.log.includes('COMMIT'));
 }finally{h.close();}
});
test('transacción unitaria: un precio huérfano impide disparar reemplazos de otra empresa',async()=>{
 const h=servicioPrueba({forProducts:true});try{
  h.db.details.push({idproducto:'B001',idempresa:'OTRA',precio:99});
  const b={...input(),plantilla:{idproducto:plantilla.idproducto,idempresa:plantilla.idempresa}},p=await h.service.previsualizar('productos',b,'owner');
  const r=await h.service.confirmar('productos',{token:p.token,confirmacion:'IMPORTAR PRODUCTOS'},'owner');
  assert.equal(r.correcto,false);assert.match(r.error,/No se reemplazarán/);assert.equal(h.db.details[0].precio,99);assert.ok(!h.db.log.some(q=>q.startsWith('INSERT')));
 }finally{h.close();}
});

// Empresa única y alternativa sin producto modelo: no se supone el ID.
test('compatibilidad detecta la empresa real aunque no haya referencias fiscales válidas',async()=>{
 const h=servicioPrueba({forProducts:true,empresas:[{idempresa:'EMPRESA-REAL'}],referencias:[]});
 try{const c=await h.service.compatibilidad();assert.equal(c.empresa.idempresa,'EMPRESA-REAL');assert.deepEqual(c.referencias,[]);assert.deepEqual(c.modosPrecio,[2]);}
 finally{h.close();}
});
test('alternativa confirmada utiliza empresa real, unidad SQL e impuestos sin inventar ID',async()=>{
 const h=servicioPrueba({forProducts:true,empresas:[{idempresa:'EMPRESA-REAL'}],referencias:[]});
 try{
  const b={...input(),exentoConfirmado:false,configuracionConfirmada:true,configuracionAlternativa:{idunidad:'PIEZA',impuesto1:8,precioabierto:2}};
  const p=await h.service.previsualizar('productos',b,'owner');
  assert.equal(p.plan.plantilla.idempresa,'EMPRESA-REAL');assert.equal(p.plan.plantilla.impuesto1,8);
  const r=await h.service.confirmar('productos',{token:p.token,confirmacion:'IMPORTAR PRODUCTOS'},'owner');
  assert.equal(r.correcto,true,r.error);assert.equal(h.db.details[0].idempresa,'EMPRESA-REAL');assert.equal(h.db.details[0].excentoimpuestos,0);
 }finally{h.close();}
});
test('una segunda empresa bloquea la importación sin iniciar transacción',async()=>{
 const h=servicioPrueba({forProducts:true,empresas:[{idempresa:'E1'},{idempresa:'E2'}]});
 try{
  const c=await h.service.compatibilidad();assert.equal(c.empresa.estado,'multiple');
  await assert.rejects(()=>h.service.previsualizar('productos',{...input(),configuracionConfirmada:true},'owner'),e=>e.codigo==='EMPRESA_NO_UNICA');
  assert.ok(!h.db.log.includes('BEGIN'));
 }finally{h.close();}
});

test('empresas históricas: si solo una empresa tiene productos, selecciona esa sin adivinar',async()=>{
 const h=servicioPrueba({forProducts:true,empresas:[{idempresa:'E1'},{idempresa:'E2'}],empresaUsada:[{idempresa:'E2'}],referencias:[]});
 try{const c=await h.service.compatibilidad();assert.equal(c.empresa.estado,'unica');assert.equal(c.empresa.idempresa,'E2');assert.match(c.empresa.origen,/usada/);}
 finally{h.close();}
});

test('clasificacion nullable sin DEFAULT no requiere un modelo, pero NOT NULL sin DEFAULT si',()=>{
 const m=estructura();m.columnas.push({...m.columnas[0],columna:'clasificacion',tipo:'numeric',longitudBytes:5,admiteNulo:true});
 assert.equal(C.evaluar(m).grupos.requiereModelo,false);
 assert.deepEqual(C.planGrupos(m,[],[{id:'x',nombre:'Comidas'}]).grupos[0].ajustes,{clasificacion:1});
 m.columnas.at(-1).admiteNulo=false;assert.equal(C.evaluar(m).grupos.requiereModelo,true);
 assert.throws(()=>C.planGrupos(m,[],[{id:'x',nombre:'Comidas'}]),/grupo existente/);
 m.columnas.at(-1).valorDefecto='((1))';assert.equal(C.evaluar(m).grupos.requiereModelo,false);
});

test('grupo nuevo almacena clasificación 1/2/3 y estilo naranja, preserva color real naranja si hay uno',()=>{
 const m=require('./soft11-estructura-revisada.json');
 for(const [name,n] of [['Entradas',1],['BEBIDAS',2],['Otros',3]]){
   const g=C.planGrupos(m,[],[{id:'x',nombre:name,clasificacion:n}]).grupos[0];
   assert.equal(g.ajustes.clasificacion,n);assert.equal(g.ajustes.color,42495);assert.equal(g.ajustes.colorletra,0);
 }
 const g=C.planGrupos(m,[{idgrupo:'10',descripcion:'Postres',clasificacion:1,color:33023,colorletra:0}], [{id:'x',nombre:'Entradas'}]).grupos[0];
 assert.equal(g.ajustes.color,33023);
 assert.throws(()=>C.planGrupos(m,[],[{id:'x',nombre:'Alimentos',clasificacion:8}]),/clasificación/);
});
test('actualizar grupo existente sólo prepara clasificación y colores, nunca un INSERT de producto',async()=>{
 const h=servicioPrueba({grupoCampos:true,rows:[{idgrupo:'01',descripcion:'Entradas',clasificacion:null,color:0,colorletra:0}]});
 try{
   const p=await h.service.previsualizar('grupo_ajustes',{idgrupo:'01',clasificacion:1},'owner');
   assert.equal(p.plan.grupo.color,42495);assert.equal(h.db.rows[0].color,0);
   const r=await h.service.confirmar('grupo_ajustes',{token:p.token,confirmacion:'ACTUALIZAR GRUPO'},'owner');
   assert.equal(r.correcto,true,JSON.stringify(r));assert.equal(h.db.rows[0].clasificacion,1);
   assert.equal(h.db.rows[0].color,42495);assert.equal(h.db.products.length,0);
   assert.equal(h.db.log.filter(q=>q.startsWith('UPDATE dbo.grupos')).length,1);
 }finally{h.close();}
});
test('corrección rechaza datos de clasificación inválidos y grupos inexistentes antes del UPDATE',async()=>{
 const h=servicioPrueba({grupoCampos:true,rows:[{idgrupo:'01',descripcion:'Entradas',clasificacion:null,color:0,colorletra:0}]});
 try{
   await assert.rejects(()=>h.service.previsualizar('grupo_ajustes',{idgrupo:'01',clasificacion:0},'owner'),/Alimentos/);
   await assert.rejects(()=>h.service.previsualizar('grupo_ajustes',{idgrupo:'99',clasificacion:1},'owner'),/no existe/);
   assert.equal(h.db.log.filter(q=>q.startsWith('UPDATE ')).length,0);
 }finally{h.close();}
});

test('cambio del grupo después de la revisión impide el UPDATE',async()=>{
 const h=servicioPrueba({grupoCampos:true,rows:[{idgrupo:'01',descripcion:'Entradas',clasificacion:null,color:0,colorletra:0}]});
 try{
  const p=await h.service.previsualizar('grupo_ajustes',{idgrupo:'01',clasificacion:1},'owner');
  h.db.rows[0].color=128;
  const r=await h.service.confirmar('grupo_ajustes',{token:p.token,confirmacion:'ACTUALIZAR GRUPO'},'owner');
  assert.equal(r.codigo,'CATALOGO_CAMBIADO');assert.equal(h.db.rows[0].color,128);
  assert.equal(h.db.log.filter(q=>q.startsWith('UPDATE dbo.grupos')).length,0);
 }finally{h.close();}
});
test('regresión: menú guarda grupo clasificado y productos en una única transacción simulada',async()=>{
 const h=servicioPrueba({grupoCampos:true,forProducts:true});
 try{
  const b={...input(),configuracionConfirmada:true,grupos:[{id:'entrada',nombre:'Entradas',clasificacion:1}],plantilla:{idproducto:plantilla.idproducto,idempresa:plantilla.idempresa}};
  b.productos=[{...producto(),id:'p1',clave:'',idgrupo:'borrador:entrada'}];
  const p=await h.service.previsualizar('menu',b,'owner');
  assert.equal(p.plan.grupos[0].ajustes.clasificacion,1);assert.equal(p.plan.grupos[0].ajustes.colorletra,0);
  const result=await h.service.confirmar('menu',{token:p.token,confirmacion:'IMPORTAR MENU'},'owner');
  assert.equal(result.correcto,true,JSON.stringify(result));assert.equal(result.creados,1);assert.equal(result.gruposCreados,1);
  assert.equal(h.db.products.length,1);assert.equal(h.db.details.length,1);assert.equal(h.db.rows.length,2);
  assert.equal(h.db.rows.find(x=>x.descripcion==='Entradas').clasificacion,1);
  assert.ok(h.db.log.includes('COMMIT'));
 }finally{h.close();}
});
test('9.2.19: importación inicia sin esperar HTTP y se consulta hasta confirmación',async()=>{
 const h=servicioPrueba();try{
  const preview=await h.service.previsualizar('grupos',{grupos:[{id:'a',nombre:'Comidas rápidas'}]},'owner');
  const body={token:preview.token,confirmacion:'CREAR GRUPOS'};
  const start=h.service.iniciar('grupos',body,'owner');
  assert.equal(start.aceptado,true);assert.equal(start.operacion,preview.token);
  assert.equal(h.service.iniciar('grupos',body,'owner').operacion,preview.token);
  for(let tries=0;tries<20&&h.service.operacion(preview.token,'owner')?.estado!=='confirmada';tries++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(h.service.operacion(preview.token,'owner').estado,'confirmada');
  assert.equal(h.db.rows.length,1);
  assert.equal(h.service.operacion(preview.token,'intruso'),null);
  h.service.iniciar('grupos',body,'owner');assert.equal(h.db.rows.length,1);
 }finally{h.close();}
});
test('9.2.19: un error de inserción queda registrado y no confirma SQL',async()=>{
 const h=servicioPrueba({failInsert:2});try{
  const preview=await h.service.previsualizar('grupos',{grupos:[{id:'a',nombre:'Sopas'},{id:'b',nombre:'Postres'}]},'owner');
  h.service.iniciar('grupos',{token:preview.token,confirmacion:'CREAR GRUPOS'},'owner');
  for(let i=0;i<20&&h.service.operacion(preview.token,'owner')?.estado==='procesando';i++)await new Promise(r=>setTimeout(r,5));
  assert.equal(h.service.operacion(preview.token,'owner').estado,'error');
  assert.equal(h.db.rows.length,0);
  assert.ok(h.db.log.includes('ROLLBACK'));
 }finally{h.close();}
});
test('9.2.19: la revisión SQL también puede consultarse en segundo plano',async()=>{
 const h=servicioPrueba();try{
  const start=h.service.preparar('grupos',{grupos:[{id:'a',nombre:'Sopas'}]},'owner');
  assert.equal(start.estado,'procesando');
  for(let i=0;i<20&&h.service.consultarPreparacion(start.id,'owner')?.estado==='procesando';i++)await new Promise(r=>setTimeout(r,5));
  const result=h.service.consultarPreparacion(start.id,'owner');
  assert.equal(result.estado,'lista');assert.equal(result.resultado.plan.grupos[0].nombre,'Sopas');
  assert.equal(h.service.consultarPreparacion(start.id,'intruso'),null);
  assert.equal(h.db.rows.length,0);
 }finally{h.close();}
});
