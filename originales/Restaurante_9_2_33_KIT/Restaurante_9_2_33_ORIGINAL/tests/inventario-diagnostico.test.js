'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {diagnose,TABLES}=require('../inventario_diagnostico');
const columns={
 almacen:['idalmacen','nombre','tipo','idempresa'],
 gruposi:['idgruposi','descripcion'],
 insumos:['idinsumo','descripcion','idgruposi','unidad'],
 insumosdetalle:['idinsumo','idempresa','costo','merma'],
 insumospresentaciones:['idinsumospresentaciones','descripcion','idinsumo','rendimiento'],
 insumospresentacionesdetalle:['idinsumospresentaciones','idproveedor','costo'],
 proveedores:['idproveedor','nombre','idtipoproveedor'],
 costos:['idproducto','idinsumo','cantidad'],
 recetasalmacenes:['idproducto','idarearestaurant','idalmacen','idempresa','idinsumo']
};
function dbFixture(){
 const seen=[];
 const metadata=Object.entries(columns).flatMap(([tabla,cols])=>cols.map((columna,i)=>({esquema:'dbo',tabla,columna,tipo:'nvarchar',longitud:30,posicion:i+1})));
 const rows={almacen:[{idalmacen:'2',nombre:'ALMACEN PRUEBA'}],gruposi:[{idgruposi:'001',descripcion:'GRUPO PRUEBA'}],insumos:[{idinsumo:'001001',descripcion:'INSUMO DE PRUEBA',unidad:'KGS'}],insumosdetalle:[{idinsumo:'001001',costo:50,merma:10}],insumospresentaciones:[{idinsumospresentaciones:'001001',idinsumo:'001001',rendimiento:1}],insumospresentacionesdetalle:[{idinsumospresentaciones:'001001',idproveedor:'01',costo:0}],costos:[{idproducto:'000017',idinsumo:'001001',cantidad:1}],recetasalmacenes:[{idproducto:'000017',idarearestaurant:'01',idalmacen:'2',idinsumo:'001001'}],proveedores:[{idproveedor:'01',nombre:'PROVEEDOR DE PRUEBA'}]};
 return {seen,request(){return {async query(query){seen.push(query);assert.match(query,/^SELECT\s/i);if(query.includes('DB_NAME()'))return {recordset:[{baseDatos:'softrestaurant11',versionServidor:'12.0.6024'}]};if(query.includes('INFORMATION_SCHEMA.COLUMNS'))return {recordset:metadata};if(query.includes('FROM sys.indexes'))return {recordset:[]};if(query.includes('FROM sys.foreign_key_columns'))return {recordset:[]};const tbl=query.match(/FROM \[dbo\]\.\[(\w+)\]/)?.[1];assert.ok(tbl);return {recordset:rows[tbl]||[]};}}}};
}
test('Diagnóstico de inventarios solo usa SELECT y estructura conocida',async()=>{
 const db=dbFixture();const result=await diagnose(db);
 assert.equal(result.soloLectura,true);assert.equal(result.baseDatos,'softrestaurant11');assert.equal(result.muestras.insumos.filas[0].unidad,'KGS');assert.equal(result.muestras.costos.filas[0].cantidad,1);assert.equal(result.muestras.recetasalmacenes.filas[0].idalmacen,'2');assert.ok(result.resumen.tablasDetectadas>=9);assert.ok(db.seen.length>=12);
});
test('No consulta contactos de proveedores ni campos de credenciales',async()=>{
 const db=dbFixture();await diagnose(db);
 assert.ok(!db.seen.join('\n').match(/\b(telefono|password|rfc|email|direccion)\b/i));
 assert.ok(Object.keys(TABLES).includes('insumospresentacionesdetalle'));
});
test('Informa tablas ausentes sin fallar ni inventar datos',async()=>{
 const db=dbFixture();const result=await diagnose(db);
 assert.equal(result.muestras.stockinsumos.estado,'tabla_no_disponible');
 assert.equal(result.muestras.stockinsumos.filas.length,0);
});
test('Los endpoints están protegidos por autorización de servidor',()=>{
 const routes=[];const guard=(req,res,next)=>{};
 const app={get:(path,...handlers)=>routes.push({path,handlers})};
 require('../inventario_diagnostico')({app,conectar:async()=>dbFixture(),soloLocal:guard});
 assert.equal(routes.length,2);
 for(const route of routes){assert.equal(route.handlers[0],guard);}
});
