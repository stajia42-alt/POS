'use strict';
module.exports = function({app, conectar, soloLocal, sql}) {
  app.get('/api/menu-ia/producto-04002', soloLocal, async (req,res) => {
    try {
      const db = await conectar();
      const target = ['productos','productosdetalle','grupos','subgrupos'];
      const columns = (await db.request().query(`SELECT TABLE_SCHEMA esquema,TABLE_NAME tabla,COLUMN_NAME columna,DATA_TYPE tipo,IS_NULLABLE admiteNulo,CHARACTER_MAXIMUM_LENGTH longitud,COLUMN_DEFAULT valorDefecto FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME IN ('productos','productosdetalle','grupos','subgrupos') ORDER BY TABLE_NAME,ORDINAL_POSITION`)).recordset;
      const result = {};
      for (const table of target) {
        const cc=columns.filter(c=>c.tabla===table);
        if (!cc.length) {result[table]={existe:false};continue;}
        const keys=cc.filter(c=>/^(idproducto|clave|idgrupo|idsubgrupo)$/i.test(c.columna)).map(c=>c.columna);
        const wanted=table==='productos'||table==='productosdetalle' ? ['idproducto','clave'] : table==='grupos'?['idgrupo']:['idsubgrupo','idgrupo'];
        const key=wanted.find(k=>keys.some(c=>c.toLowerCase()===k));
        if (!key) {result[table]={existe:true,advertencia:'No se identificó clave para consulta',columnas:cc};continue;}
        const val=(table==='grupos'||table==='subgrupos')?'04':'04002';
        const selected=cc.filter(c=> !/binary|image|text|xml|sql_variant/i.test(c.tipo) && !/password|token|secret|contrase|credential|claveacceso/i.test(c.columna)).map(c=>`[${c.columna.replace(/]/g,']]')}]`);
        const rows=(await db.request().input('valor',sql.NVarChar(100),val).query(`SELECT TOP (15) ${selected.join(',')} FROM [dbo].[${table}] WHERE CONVERT(NVARCHAR(100),[${key}])=@valor`)).recordset;
        result[table]={existe:true,claveBusqueda:key,valorBuscado:val,filas:rows};
      }
      const constraints=(await db.request().query(`SELECT fk.name relacion,OBJECT_NAME(fk.parent_object_id) tablaOrigen,COL_NAME(fkc.parent_object_id,fkc.parent_column_id) columnaOrigen,OBJECT_NAME(fk.referenced_object_id) tablaDestino,COL_NAME(fkc.referenced_object_id,fkc.referenced_column_id) columnaDestino FROM sys.foreign_keys fk JOIN sys.foreign_key_columns fkc ON fk.object_id=fkc.constraint_object_id WHERE OBJECT_NAME(fk.parent_object_id) IN ('productos','productosdetalle','grupos','subgrupos') OR OBJECT_NAME(fk.referenced_object_id) IN ('productos','productosdetalle','grupos','subgrupos')`)).recordset;
      res.json({correcto:true,soloLectura:true,producto:'04002',fecha:new Date().toISOString(),columnas:columns,relacionesDeclaradas:constraints,registros:result,nota:'Los vínculos no declarados como claves foráneas requieren investigación adicional. No contiene escrituras SQL.'});
    } catch(e) {res.status(503).json({correcto:false,error:e.message});}
  });
  app.get('/menu-ia/producto-04002',soloLocal,(req,res)=>res.type('html').send(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Producto 04002 · Diagnóstico</title><style>body{margin:0;background:#edf2f7;color:#20354a;font:16px system-ui}main{max-width:720px;margin:45px auto;padding:20px}section{background:#fff;border-radius:18px;padding:28px;box-shadow:0 10px 28px #102a4212}button{padding:13px 18px;background:#087e79;color:#fff;border:0;border-radius:10px;cursor:pointer;font-weight:700}button:disabled{opacity:.5}pre{white-space:pre-wrap;background:#f3f6f9;padding:16px;border-radius:10px}p{line-height:1.6}</style><main><p><a href="/">← Volver a Restaurante</a></p><section><h1>Diagnóstico del producto 04002</h1><p>Consulta el producto PRUEBA APP IA, sus precios, la estructura de categorías y las relaciones declaradas en SQL. No realiza modificaciones.</p><button id="run">Ejecutar diagnóstico</button> <button id="download" hidden>Descargar JSON</button><pre id="status">Listo para consultar.</pre><small>Revisa el JSON antes de compartirlo, porque puede contener información del catálogo.</small></section></main><script>let report;document.getElementById('run').onclick=async()=>{let b=document.getElementById('run');b.disabled=true;document.getElementById('status').textContent='Consultando...';try{let r=await fetch('/api/menu-ia/producto-04002');report=await r.json();if(!r.ok)throw Error(report.error||'Error');document.getElementById('status').textContent='Consulta completa. Registros encontrados: '+Object.entries(report.registros).map(([k,v])=>k+': '+(v.filas||[]).length).join(', ');document.getElementById('download').hidden=false}catch(e){document.getElementById('status').textContent='Error: '+e.message}finally{b.disabled=false}};document.getElementById('download').onclick=()=>{let u=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));let a=document.createElement('a');a.href=u;a.download='Restaurante_Producto_04002.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),2000)};</script></html>`));
};
