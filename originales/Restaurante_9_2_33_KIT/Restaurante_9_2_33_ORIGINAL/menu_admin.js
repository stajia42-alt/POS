'use strict';
const {equivalenciasGrupos}=require('./menu_contexto');
module.exports=function({app,conectar,soloLocal}){
app.get('/api/menu-admin/catalogo',soloLocal,async(req,res)=>{try{const db=await conectar();const productos=(await db.request().query("SELECT TOP (500) p.idproducto,p.descripcion,p.idgrupo,g.descripcion AS grupo, pd.precio FROM dbo.productos p LEFT JOIN dbo.grupos g ON g.idgrupo=p.idgrupo OUTER APPLY (SELECT TOP (1) precio FROM dbo.productosdetalle d WHERE d.idproducto=p.idproducto ORDER BY d.idempresa) pd ORDER BY p.descripcion,p.idproducto")).recordset;const grupos=(await db.request().query("SELECT idgrupo,descripcion,clasificacion,color,colorletra FROM dbo.grupos ORDER BY descripcion")).recordset;res.json({correcto:true,soloLectura:true,productos,grupos,equivalenciasGrupos})}catch(e){res.status(503).json({correcto:false,error:e.message})}});
app.get('/menu-admin',soloLocal,(req,res)=>res.redirect('/menu-ia'));
};
