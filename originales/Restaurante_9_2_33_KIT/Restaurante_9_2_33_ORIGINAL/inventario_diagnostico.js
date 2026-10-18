'use strict';
// Diagnóstico del módulo de inventarios. SOLO SELECT, sin escritura SQL.
// Su función es descubrir el esquema real antes de implementar cualquier alta.
const TABLES = Object.freeze({
  almacen:['idalmacen','nombre','tipo','idempresa'],
  tipoproveedores:['idtipoproveedor','descripcion'],
  proveedores:['idproveedor','nombre','idtipoproveedor','estatus'],
  empresa_proveedor:['idempresa','idproveedor','descarga'],
  gruposi:['idgruposi','descripcion','idgruposiclasificacion'],
  insumos:['idinsumo','descripcion','idgruposi','unidad','elaborado'],
  insumosdetalle:['idinsumo','idempresa','inventariable','costo','costopromedio','merma','descargar','impuesto1','impuesto2','impuesto3'],
  insumospresentaciones:['idinsumospresentaciones','descripcion','idinsumo','idgruposi','rendimiento','unidad'],
  insumospresentacionesdetalle:['idinsumospresentaciones','idempresa','costo','costopromedio','idproveedor','stockminimogeneral','stockmaximogeneral','estatus'],
  insumoscostoproveedor:['idproveedor','idpresentacion','costo'],
  costos:['idproducto','idinsumo','cantidad','idempresa'],
  recetasalmacenes:['idproducto','idarearestaurant','idalmacen','idempresa','idinsumo'],
  stockinsumos:['idinsumo','idalmacen','idempresa','existencia'],
  productos:['idproducto','descripcion','idgrupo']
});
const escapeName = x => '['+String(x).replace(/]/g,']]')+']';
const tableKeys = Object.keys(TABLES);
const namesSql = tableKeys.map(s=>"'"+s+"'").join(',');
const META_SQL = `SELECT TABLE_SCHEMA AS esquema, TABLE_NAME AS tabla, COLUMN_NAME AS columna, DATA_TYPE AS tipo, CHARACTER_MAXIMUM_LENGTH AS longitud, NUMERIC_PRECISION AS precisionNumero, NUMERIC_SCALE AS escala, IS_NULLABLE AS admiteNulos, COLUMN_DEFAULT AS valorDefecto, ORDINAL_POSITION AS posicion FROM INFORMATION_SCHEMA.COLUMNS WHERE LOWER(TABLE_NAME) IN (${namesSql}) ORDER BY TABLE_SCHEMA,TABLE_NAME,ORDINAL_POSITION`;
const INDEX_SQL = `SELECT s.name AS esquema,t.name AS tabla,i.name AS indice,i.is_primary_key AS llavePrimaria,i.is_unique AS unico,ic.key_ordinal AS orden,c.name AS columna FROM sys.indexes i JOIN sys.tables t ON t.object_id=i.object_id JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id WHERE LOWER(t.name) IN (${namesSql}) AND i.is_hypothetical=0 AND ic.is_included_column=0 ORDER BY t.name,i.name,ic.key_ordinal`;
const FOREIGN_SQL = `SELECT so.name AS esquemaOrigen, t.name AS tablaOrigen, co.name AS columnaOrigen, sr.name AS esquemaDestino,tr.name AS tablaDestino,cr.name AS columnaDestino,fk.name AS relacion FROM sys.foreign_key_columns fkc JOIN sys.foreign_keys fk ON fk.object_id=fkc.constraint_object_id JOIN sys.tables t ON t.object_id=fkc.parent_object_id JOIN sys.schemas so ON so.schema_id=t.schema_id JOIN sys.columns co ON co.object_id=t.object_id AND co.column_id=fkc.parent_column_id JOIN sys.tables tr ON tr.object_id=fkc.referenced_object_id JOIN sys.schemas sr ON sr.schema_id=tr.schema_id JOIN sys.columns cr ON cr.object_id=tr.object_id AND cr.column_id=fkc.referenced_column_id WHERE LOWER(t.name) IN (${namesSql}) OR LOWER(tr.name) IN (${namesSql}) ORDER BY t.name,fk.name,fkc.constraint_column_id`;
function trimErrors(e){const c=String(e?.code||'SQL').slice(0,40);return 'Consulta de solo lectura fallida ('+c+').';}
async function diagnose(db){
  const result = {version:1,modulo:'inventarios',soloLectura:true,fecha:new Date().toISOString(),
    referencia:'LOTE28.ZIP: muestras de insumo, presentación, proveedor, almacén y receta',
    nota:'Solo consulta el esquema y hasta tres registros por tabla. No incluye contraseñas ni teléfonos de proveedores. El XML exportado no prueba la validez de INSERT en SQL.',
    baseDatos:null,versionServidor:null,columnas:[],indices:[],relacionesSQL:[],muestras:{},advertencias:[]};
  const info=await db.request().query("SELECT DB_NAME() AS baseDatos, CONVERT(NVARCHAR(128),SERVERPROPERTY('ProductVersion')) AS versionServidor");
  result.baseDatos=info.recordset?.[0]?.baseDatos||null;
  result.versionServidor=info.recordset?.[0]?.versionServidor||null;
  result.columnas=(await db.request().query(META_SQL)).recordset||[];
  try {result.indices=(await db.request().query(INDEX_SQL)).recordset||[];}
  catch(e){result.advertencias.push('Índices: '+trimErrors(e));}
  try {result.relacionesSQL=(await db.request().query(FOREIGN_SQL)).recordset||[];}
  catch(e){result.advertencias.push('Claves foráneas: '+trimErrors(e));}
  for(const [table,requested] of Object.entries(TABLES)) {
    const definitions=result.columnas.filter(x=>x.tabla?.toLowerCase()===table);
    if(!definitions.length){result.muestras[table]={estado:'tabla_no_disponible',filas:[]};continue;}
    const real=new Map(definitions.map(x=>[x.columna.toLowerCase(),x.columna]));
    const cols=requested.map(x=>real.get(x.toLowerCase())).filter(Boolean);
    if(!cols.length){result.muestras[table]={estado:'sin_columnas_de_muestra',filas:[]};continue;}
    // Solo columnas públicas de negocio: NO incluir direcciones, RFC, teléfonos, contraseñas.
    const schema=definitions[0].esquema;
    const query=`SELECT TOP (3) ${cols.map(escapeName).join(',')} FROM ${escapeName(schema)}.${escapeName(definitions[0].tabla)} ORDER BY ${escapeName(cols[0])}`;
    try{
      const rows=(await db.request().query(query)).recordset||[];
      result.muestras[table]={estado:rows.length?'muestra_obtenida':'sin_registros',filas:rows.map(x=>Object.fromEntries(Object.entries(x).map(([k,v])=>[k,Buffer.isBuffer(v)?'[dato binario omitido]':v])))};
    }catch(e){result.muestras[table]={estado:'consulta_error',filas:[],error:trimErrors(e)};result.advertencias.push(table+': '+trimErrors(e));}
  }
  result.resumen={tablasDetectadas:tableKeys.filter(t=>result.muestras[t]?.estado!=='tabla_no_disponible').length,tablasBuscadas:tableKeys.length,filasDeMuestra:Object.values(result.muestras).reduce((n,t)=>n+t.filas.length,0),columnas:result.columnas.length,indices:result.indices.length,clavesForaneas:result.relacionesSQL.length};
  return result;
}
const page = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Diagnóstico de inventarios | Restaurante</title><style>body{font:16px system-ui,sans-serif;background:#f3f6f7;color:#1c3238;margin:0}main{max-width:820px;margin:3rem auto;padding:16px}section{background:white;border:1px solid #dae2e4;border-radius:18px;padding:25px;box-shadow:0 8px 30px #001a2010}h1{margin:5px 0 15px;font-size:1.8rem}p{line-height:1.6}button{border:0;border-radius:9px;padding:12px 16px;background:#076c67;color:white;font-weight:bold;cursor:pointer;margin:4px 8px 4px 0}button:disabled{opacity:.5}#download{background:#224759}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#eff3f3;border-radius:10px;padding:15px}a{color:#086660}</style></head><body><main><a href="/">← Volver a Restaurante</a><section><small>INVENTARIOS · ETAPA 1 · SOLO LECTURA</small><h1>Diagnóstico de Soft Restaurant 11</h1><p>Vamos a comprobar las tablas, columnas, índices, relaciones y una muestra pequeña de almacenes, proveedores, insumos, presentaciones y recetas. <b>No se crea, cambia ni elimina ningún registro.</b></p><p>Se utiliza la conexión SQL guardada en Restaurante. Solo puede abrirlo una cuenta administradora autorizada.</p><button id="run">Analizar mi SQL</button><button id="download" hidden>Descargar diagnóstico JSON</button><pre id="message" role="status">Listo para iniciar.</pre><p><small>Revisa el JSON antes de compartirlo. Contiene nombres de productos y proveedores, pero no credenciales ni datos de contacto.</small></p></section></main><script>let report;document.getElementById('run').onclick=async()=>{const b=document.getElementById('run'),m=document.getElementById('message');b.disabled=true;m.textContent='Consultando SQL...';try{const response=await fetch('/api/inventarios/diagnostico',{cache:'no-store'});const data=await response.json();if(!response.ok||!data.correcto)throw Error(data.error||'No se completó la consulta');report=data.diagnostico;m.textContent='Diagnóstico completado. Tablas detectadas: '+report.resumen.tablasDetectadas+'/'+report.resumen.tablasBuscadas+'. Columnas: '+report.resumen.columnas+'. Muestras: '+report.resumen.filasDeMuestra+'. Advertencias: '+report.advertencias.length+'. Descarga el JSON para continuar.';document.getElementById('download').hidden=false;}catch(e){m.textContent='No se pudo completar: '+e.message;}finally{b.disabled=false;}};document.getElementById('download').onclick=()=>{if(!report)return;const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='Restaurante_Diagnostico_Inventarios.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};</script></body></html>`;
function register({app,conectar,soloLocal}){
  app.get('/inventarios/diagnostico',soloLocal,(_,res)=>res.type('html').send(page));
  app.get('/api/inventarios/diagnostico',soloLocal,async(req,res)=>{
    try{const db=await conectar();const diagnostico=await diagnose(db);res.json({correcto:true,diagnostico});}
    catch(e){res.status(503).json({correcto:false,error:'No se pudo consultar el esquema del inventario: '+trimErrors(e)});}
  });
}
module.exports=register;
module.exports.diagnose=diagnose;
module.exports.TABLES=TABLES;
