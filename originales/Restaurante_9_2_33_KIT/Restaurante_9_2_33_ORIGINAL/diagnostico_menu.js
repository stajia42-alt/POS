'use strict';
module.exports=function({app,conectar,soloLocal,sql}){
 const safeName=x=>/^\w+$/.test(x);
 app.get('/api/menu-ia/diagnostico',soloLocal,async(req,res)=>{
  try{
   const db=await conectar();
   const cols=(await db.request().query("SELECT TABLE_SCHEMA esquema,TABLE_NAME tabla,COLUMN_NAME columna,DATA_TYPE tipo,IS_NULLABLE admiteNulo FROM INFORMATION_SCHEMA.COLUMNS WHERE LOWER(TABLE_NAME) LIKE '%product%' OR LOWER(TABLE_NAME) LIKE '%grupo%' OR LOWER(TABLE_NAME) LIKE '%subgrupo%' OR LOWER(TABLE_NAME) LIKE '%modific%' OR LOWER(TABLE_NAME) LIKE '%comentario%' OR LOWER(TABLE_NAME) LIKE '%impuesto%' ORDER BY TABLE_SCHEMA,TABLE_NAME,ORDINAL_POSITION")).recordset;
   const tables=[...new Map(cols.map(c=>[c.esquema+'.'+c.tabla,{esquema:c.esquema,tabla:c.tabla}])).values()];
   const matches=[];
   for(const t of tables){
    const cc=cols.filter(c=>c.esquema===t.esquema&&c.tabla===t.tabla);
    const candidates=cc.filter(c=>/^(idproducto|clave|descripcion)$/i.test(c.columna));
    const where=candidates.filter(c=>/^(idproducto|clave)$/i.test(c.columna));
    if(!where.length)continue;
    if(!safeName(t.esquema)||!safeName(t.tabla))continue;
    const col=where[0].columna;
    const query=`SELECT TOP (10) * FROM [${t.esquema}].[${t.tabla}] WHERE TRY_CONVERT(NVARCHAR(100),[${col}]) = @clave`;
    try{
     const rows=(await db.request().input('clave',sql.NVarChar(100),'04002').query(query)).recordset;
     if(rows.length)matches.push({tabla:t.esquema+'.'+t.tabla,columnaBusqueda:col,filas:rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,Buffer.isBuffer(v)?'[dato binario omitido]':v])))});
    }catch(e){matches.push({tabla:t.esquema+'.'+t.tabla,error:'No se pudo consultar: '+(e.code||'SQL')});}
   }
   res.json({correcto:true,soloLectura:true,producto:'04002',fecha:new Date().toISOString(),estructura:cols,coincidencias:matches,nota:'Diagnóstico de estructura y producto. No realiza cambios. Revisa datos antes de compartir.'});
  }catch(e){res.status(503).json({correcto:false,error:e.message});}
 });
 app.get('/menu-ia/diagnostico',soloLocal,(req,res)=>res.type('html').send(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Diagnóstico de menú · Restaurante</title><style>body{background:#eef3f8;color:#19344a;font:16px system-ui;margin:0}main{max-width:760px;margin:35px auto;padding:22px}section{background:white;padding:30px;border-radius:20px;box-shadow:0 10px 30px #18334b14}button{border:0;border-radius:10px;padding:13px 20px;background:#087f76;color:white;font-weight:700;cursor:pointer}button:disabled{opacity:.5}#descargar{background:#284f74}p{line-height:1.6}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f6f9;padding:15px;border-radius:10px}</style><main><p><a href="/">← Volver a Restaurante</a></p><section><h1>Diagnóstico · Gestor de menú con IA</h1><p>Buscaremos el producto <b>04002 — PRUEBA APP IA</b>, las tablas relacionadas y sus columnas. Solo lectura: no se modifica Soft Restaurant.</p><button id="ejecutar">Ejecutar diagnóstico</button> <button id="descargar" hidden>Descargar JSON</button><pre id="estado">Listo para comenzar.</pre><p><small>Ejecutar únicamente en la computadora servidor. Revisa el archivo antes de compartirlo; puede incluir información del catálogo.</small></p></section></main><script>let informe;document.getElementById('ejecutar').onclick=async()=>{const b=document.getElementById('ejecutar'),s=document.getElementById('estado');b.disabled=true;s.textContent='Consultando SQL...';try{const r=await fetch('/api/menu-ia/diagnostico');informe=await r.json();if(!r.ok)throw Error(informe.error||'Error SQL');s.textContent='Diagnóstico completo. Tablas detectadas: '+new Set(informe.estructura.map(x=>x.tabla)).size+'. Coincidencias: '+informe.coincidencias.length+'.\nDescarga el JSON para revisarlo.';document.getElementById('descargar').hidden=false}catch(e){s.textContent='No se pudo completar: '+e.message}finally{b.disabled=false}};document.getElementById('descargar').onclick=()=>{const u=URL.createObjectURL(new Blob([JSON.stringify(informe,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download='Restaurante_Diagnostico_Menu_04002.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),2000)};</script></html>`));
};
