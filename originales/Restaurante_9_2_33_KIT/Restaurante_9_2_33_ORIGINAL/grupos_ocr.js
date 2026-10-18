'use strict';
// Reconocer solo encabezados inequívocos, sin adivinar el grupo de un producto.
const ALIAS={entradas:['entradas','entrada','appetizers','aperitivos'],bebidas:['bebidas','bebida','drinks'],postres:['postres','postre','desserts'],sopas:['sopas','sopa','soups'],ensaladas:['ensaladas','ensalada','salads'],especialidades:['especialidades','especiales'],desayunos:['desayunos','desayuno'],tacos:['tacos'],hamburguesas:['hamburguesas'],pizzas:['pizzas'],pastas:['pastas'],sushi:['sushi'],rollos:['rollos'],cocteles:['cocteles','cócteles'],cafes:['cafes','cafés','cafe','café']};
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').trim().replace(/\s+/g,' ');
const headings=new Map(Object.entries(ALIAS).flatMap(([canon,values])=>values.map(v=>[norm(v),canon])));
function asignarGruposOCR(lineas,productos,grupos){
 const found=[];
 for(let i=0;i<lineas.length;i++){
  const titulo=headings.get(norm(lineas[i]));
  if(titulo)found.push({i,titulo});
 }
 const groupMatch=titulo=>{
  const candidates=grupos.filter(g=>{
   const n=norm(g.descripcion);
   return n===titulo||headings.get(n)===titulo;
  });
  return candidates.length===1?String(candidates[0].idgrupo):'';
 };
 const resumen=[...new Set(found.map(x=>x.titulo))].map(titulo=>({titulo,idgrupo:groupMatch(titulo)}));
 const resultado=productos.map(p=>{
  // El parser devuelve el índice original de la línea del nombre.
  const idx=Number.isInteger(p.linea_origen)?p.linea_origen:-1;
  const heading=idx<0?null:[...found].reverse().find(h=>h.i<idx);
  if(!heading)return {...p,idgrupo:'',grupo_detectado:'',observacion:p.observacion+' · Grupo pendiente de revisión'};
  const idgrupo=groupMatch(heading.titulo);
  return {...p,idgrupo,grupo_detectado:heading.titulo,observacion:p.observacion+(idgrupo?' · Grupo automático: '+heading.titulo:' · Grupo detectado: '+heading.titulo+' (no existe en SQL; revisar)')};
 });
 return {productos:resultado,categorias:resumen};
}
module.exports={asignarGruposOCR};
