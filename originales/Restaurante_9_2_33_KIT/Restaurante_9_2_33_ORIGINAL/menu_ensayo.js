'use strict';
// Ensayo de inserción SQL con ROLLBACK incondicional. Nunca confirma cambios.
module.exports=function({app,conectar,soloLocal,sql}){
 app.post('/api/menu-admin/ensayo',soloLocal,async(req,res)=>{
  const p=req.body||{};
  const clave=String(p.clave||'').trim(),nombre=String(p.nombre||'').trim(),grupo=String(p.idgrupo||'').trim(),unidad=String(p.unidad||'ACTIVIDAD').trim();
  const precio=Number(p.precio);
  if(!/^[A-Za-z0-9_-]{1,15}$/.test(clave)||!nombre||nombre.length>60||!grupo||grupo.length>5||!unidad||unidad.length>50||!Number.isFinite(precio)||precio<0||precio>9999999||p.exentoImpuestos!==true)
   return res.status(400).json({correcto:false,error:'Datos inválidos. El ensayo admite únicamente productos exentos.'});
  let tx,started=false;
  try{
   const db=await conectar();tx=new sql.Transaction(db);await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);started=true;
   const q=(statement)=>new sql.Request(tx).query(statement);
   const check=await new sql.Request(tx).input('clave',sql.VarChar(15),clave).input('grupo',sql.VarChar(5),grupo).input('unidad',sql.VarChar(50),unidad).query("SELECT (SELECT COUNT(*) FROM dbo.productos WITH (UPDLOCK,HOLDLOCK) WHERE idproducto=@clave) AS duplicados,(SELECT COUNT(*) FROM dbo.grupos WHERE idgrupo=@grupo) AS grupos,(SELECT COUNT(*) FROM dbo.udsmedida WHERE idunidad=@unidad) AS unidades,(SELECT COUNT(*) FROM dbo.empresas WHERE idempresa='0000000001') AS empresas");
   const c=check.recordset[0];if(c.duplicados||c.grupos!==1||c.unidades!==1||c.empresas!==1)throw Error('Precondiciones no cumplidas: '+JSON.stringify(c));
   await new sql.Request(tx).input('clave',sql.VarChar(15),clave).input('nombre',sql.VarChar(60),nombre).input('grupo',sql.VarChar(5),grupo).input('comedor',sql.Bit,p.servicios?.comedor!==false).input('domicilio',sql.Bit,p.servicios?.domicilio!==false).input('rapido',sql.Bit,p.servicios?.rapido!==false).query('INSERT INTO dbo.productos (idproducto,descripcion,idgrupo,usarcomedor,usardomicilio,usarrapido) VALUES (@clave,@nombre,@grupo,@comedor,@domicilio,@rapido)');
   // El campo preciosinimpuestos se ensaya igual al precio al ser exento; requiere validación posterior.
   await new sql.Request(tx).input('clave',sql.VarChar(15),clave).input('precio',sql.Money,precio).input('unidad',sql.VarChar(50),unidad).query("INSERT INTO dbo.productosdetalle (idproducto,idempresa,precio,preciosinimpuestos,impuesto1,impuesto2,impuesto3,excentoimpuestos,idunidad,precioabierto,bloqueado) VALUES (@clave,'0000000001',@precio,@precio,0,0,0,1,@unidad,2,0)");
   const visible=await new sql.Request(tx).input('clave',sql.VarChar(15),clave).query('SELECT p.idproducto,p.descripcion,p.idgrupo,d.precio,d.preciosinimpuestos,d.excentoimpuestos,d.idunidad FROM dbo.productos p JOIN dbo.productosdetalle d ON p.idproducto=d.idproducto WHERE p.idproducto=@clave');
   await tx.rollback();started=false;
   res.json({correcto:true,ensayo:true,guardado:false,rollback:true,resultadoDentroTransaccion:visible.recordset,advertencia:'Ensayo revertido. NO existe un producto nuevo en SQL. Verificar reglas fiscales y lógica del sistema antes de habilitar guardado definitivo.'});
  }catch(e){if(started)try{await tx.rollback()}catch(_){}res.status(409).json({correcto:false,ensayo:true,guardado:false,rollbackSolicitado:started,error:e.message})}
 });
};
