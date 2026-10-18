'use strict';
// Guardado explícito, limitado a productos exentos y acceso local.
module.exports = function({app, conectar, soloLocal, sql}) {
  app.post('/api/menu-admin/guardar', soloLocal, async (req, res) => {
    const p = req.body || {};
    const clave = String(p.clave || '').trim();
    const nombre = String(p.nombre || '').trim();
    const grupo = String(p.idgrupo || '').trim();
    const unidad = String(p.unidad || '').trim();
    const precio = Number(p.precio);
    if (p.confirmacion !== `GUARDAR ${clave}` || p.exentoImpuestos !== true ||
        !/^[A-Za-z0-9_-]{1,15}$/.test(clave) || !nombre || nombre.length > 60 ||
        !grupo || grupo.length > 5 || !unidad || unidad.length > 50 ||
        p.precio === '' || p.precio == null || !Number.isFinite(precio) || precio < 0 || precio > 9999999 ||
        Math.round(precio * 100) !== precio * 100) {
      return res.status(400).json({correcto:false,guardado:false,error:'Datos o confirmación inválidos. Solo se admiten productos exentos con precio de dos decimales.'});
    }
    let tx, started = false, committed = false;
    try {
      const db = await conectar();
      tx = new sql.Transaction(db);
      await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
      started = true;
      const c = (await new sql.Request(tx)
        .input('clave',sql.VarChar(15),clave).input('grupo',sql.VarChar(5),grupo)
        .input('unidad',sql.VarChar(50),unidad)
        .query("SELECT (SELECT COUNT(*) FROM dbo.productos WITH (UPDLOCK,HOLDLOCK) WHERE idproducto=@clave) duplicados,(SELECT COUNT(*) FROM dbo.grupos WHERE idgrupo=@grupo) grupos,(SELECT COUNT(*) FROM dbo.udsmedida WHERE idunidad=@unidad) unidades,(SELECT COUNT(*) FROM dbo.empresas WHERE idempresa='0000000001') empresas")).recordset[0];
      if (c.duplicados || c.grupos !== 1 || c.unidades !== 1 || c.empresas !== 1) throw Error('No se puede guardar: clave ocupada, grupo, unidad o empresa inexistente. ' + JSON.stringify(c));
      if (p.origenMenuIA === true && p.permitirDuplicadoNombre !== true) {
        const same = (await new sql.Request(tx).input('nombre',sql.VarChar(60),nombre)
          .query("SELECT TOP (1) idproducto FROM dbo.productos WITH (UPDLOCK,HOLDLOCK) WHERE LTRIM(RTRIM(descripcion)) COLLATE Latin1_General_CI_AI = LTRIM(RTRIM(@nombre)) COLLATE Latin1_General_CI_AI")).recordset;
        if (same.length) throw Error('Producto duplicado por nombre en SQL: '+same[0].idproducto+'. No se guardó.');
      }
      await new sql.Request(tx).input('clave',sql.VarChar(15),clave)
        .input('nombre' ,sql.VarChar(60),nombre).input('grupo',sql.VarChar(5),grupo)
        .input('comedor',sql.Bit,p.servicios?.comedor !== false)
        .input('domicilio',sql.Bit,p.servicios?.domicilio !== false)
        .input('rapido',sql.Bit,p.servicios?.rapido !== false)
        .query('INSERT INTO dbo.productos (idproducto,descripcion,idgrupo,usarcomedor,usardomicilio,usarrapido) VALUES (@clave,@nombre,@grupo,@comedor,@domicilio,@rapido)');
      await new sql.Request(tx).input('clave',sql.VarChar(15),clave)
        .input('precio',sql.Money,precio).input('unidad',sql.VarChar(50),unidad)
        .query("INSERT INTO dbo.productosdetalle (idproducto,idempresa,precio,preciosinimpuestos,impuesto1,impuesto2,impuesto3,excentoimpuestos,idunidad,precioabierto,bloqueado) VALUES (@clave,'0000000001',@precio,@precio,0,0,0,1,@unidad,2,0)");
      const rows = (await new sql.Request(tx).input('clave',sql.VarChar(15),clave)
        .query("SELECT p.idproducto,p.descripcion,p.idgrupo,d.idempresa,d.precio,d.preciosinimpuestos,d.excentoimpuestos,d.idunidad FROM dbo.productos p JOIN dbo.productosdetalle d ON p.idproducto=d.idproducto WHERE p.idproducto=@clave AND d.idempresa='0000000001'")).recordset;
      if (rows.length !== 1 || rows[0].descripcion !== nombre || Number(rows[0].precio) !== precio || !rows[0].excentoimpuestos) throw Error('Verificación de inserción fallida; se revierte.');
      await tx.commit(); started = false; committed = true;
      const post = (await db.request().input('clave',sql.VarChar(15),clave)
        .query("SELECT p.idproducto,p.descripcion,p.idgrupo,d.precio,d.excentoimpuestos FROM dbo.productos p JOIN dbo.productosdetalle d ON p.idproducto=d.idproducto WHERE p.idproducto=@clave AND d.idempresa='0000000001'")).recordset;
      return res.json({correcto:true,guardado:true,confirmadoSQL:post.length === 1,producto:post[0] || rows[0],aviso:'Guardado confirmado en SQL. Verificar manualmente su visualización y venta en Soft Restaurant.'});
    } catch (e) {
      let rollbackConfirmado = false;
      if (started) { try { await tx.rollback(); rollbackConfirmado = true; } catch (_) {} }
      return res.status(409).json({correcto:false,guardado:committed,rollbackConfirmado,error:e.message,
        aviso:committed?'El COMMIT se ejecutó, pero falló la verificación posterior. Consultar el catálogo antes de reintentar.':'No se confirmó el guardado. Si el rollback no está confirmado, comprobar el catálogo antes de reintentar.'});
    }
  });
};
