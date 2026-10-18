'use strict';
module.exports = function({app,conectar,soloLocal}) {
  app.get('/api/menu-admin/preflight',soloLocal,async(req,res)=>{
    try {
      const db=await conectar();
      const tables=['productos','productosdetalle','grupos','udsmedida','empresas','subgruposproductos'];
      const out={correcto:true,soloLectura:true,objetivo:'Validar antes de crear PAPAS en Soft Restaurant',tablas:{},productoPrueba:{clave:'044986',nombre:'papas',grupo:'04',precio:80,exento:true}};
      for(const table of tables){
        const r=await db.request().input('tabla',table).query(`SELECT c.name AS columna,t.name AS tipo,c.max_length AS longitud,c.is_nullable AS admiteNulo,c.is_identity AS identidad,dc.definition AS valorDefecto,cc.definition AS calculada FROM sys.columns c JOIN sys.tables tb ON c.object_id=tb.object_id JOIN sys.schemas s ON tb.schema_id=s.schema_id JOIN sys.types t ON c.user_type_id=t.user_type_id LEFT JOIN sys.default_constraints dc ON c.default_object_id=dc.object_id LEFT JOIN sys.computed_columns cc ON c.object_id=cc.object_id AND c.column_id=cc.column_id WHERE s.name='dbo' AND tb.name=@tabla ORDER BY c.column_id`);
        out.tablas[table]={columnas:r.recordset};
      }
      out.indices=(await db.request().query(`SELECT tb.name AS tabla,i.name AS indice,i.is_unique AS unico,i.is_primary_key AS llavePrimaria,ic.key_ordinal AS orden,c.name AS columna FROM sys.indexes i JOIN sys.tables tb ON i.object_id=tb.object_id JOIN sys.schemas s ON tb.schema_id=s.schema_id JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id WHERE s.name='dbo' AND tb.name IN ('productos','productosdetalle') AND i.is_hypothetical=0 AND ic.key_ordinal>0 ORDER BY tb.name,i.name,ic.key_ordinal`)).recordset;
      out.triggers=(await db.request().query(`SELECT tb.name AS tabla,tr.name AS nombre,tr.is_disabled AS deshabilitado,OBJECT_DEFINITION(tr.object_id) AS definicion FROM sys.triggers tr JOIN sys.tables tb ON tr.parent_id=tb.object_id WHERE tb.name IN ('productos','productosdetalle')`)).recordset;
      out.constraints=(await db.request().query(`SELECT tb.name AS tabla,ck.name AS nombre,ck.definition AS definicion FROM sys.check_constraints ck JOIN sys.tables tb ON ck.parent_object_id=tb.object_id WHERE tb.name IN ('productos','productosdetalle')`)).recordset;
      out.claveDisponible=!(await db.request().input('clave','044986').query('SELECT TOP (1) 1 AS encontrado FROM dbo.productos WHERE idproducto=@clave')).recordset.length;
      out.grupoExiste=!!(await db.request().input('grupo','04').query('SELECT TOP (1) 1 AS encontrado FROM dbo.grupos WHERE idgrupo=@grupo')).recordset.length;
      out.empresaEjemplo=(await db.request().input('clave','04002').query('SELECT TOP (5) idempresa,idunidad,precio,preciosinimpuestos,excentoimpuestos,precioabierto FROM dbo.productosdetalle WHERE idproducto=@clave')).recordset;
      out.nota='No se ejecutó ninguna operación INSERT, UPDATE o DELETE. Revisar los resultados antes de habilitar escritura.';
      res.set('Cache-Control','no-store').json(out);
    }catch(e){res.status(500).json({correcto:false,error:e.message})}
  });
};
