'use strict';
// La clasificación corresponde a las tres opciones del catálogo de grupos de productos
// de Soft Restaurant (no a los códigos de la clasificación de insumos).
const CLASES = Object.freeze({alimentos:2,bebidas:1,otros:3});
const ETIQUETAS = Object.freeze({1:'Bebidas',2:'Alimentos',3:'Otros'});
const NARANJA_COLORREF = 0x00A5FF; // RGB(255,165,0) en el orden COLORREF de Windows
const NEGRO_COLORREF = 0;
const compactar = value => String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
function proponerClase(nombre){
  const s=compactar(nombre);
  if(/\b(bebidas?|refrescos?|aguas? frescas?|jugos?|licuados?|cafe|cafes|cervezas?|vinos?|cocteles?|cocktails?|drinks?|te|tes|sodas?|whisk(?:y|ey)|alcohol|cocteleria)\b/.test(s))return CLASES.bebidas;
  if(/\b(otros?|varios?|extras?|servicios?|miscelaneos?|diversos?|adicionales?)\b/.test(s))return CLASES.otros;
  return CLASES.alimentos;
}
function claseValida(v){return Number.isInteger(v)&&[1,2,3].includes(v);}
function conflictosClasificacion(rows=[]){
  // Preferimos detener la escritura antes que usar un código que contradiga
  // a un grupo explícito existente de esa misma instalación.
  return rows.filter(g=>{
    const nombre=compactar(g.descripcion);
    const esperado={alimentos:2,bebidas:1,otros:3}[nombre];
    return esperado!=null&&g.clasificacion!=null&&Number(g.clasificacion)!==esperado;
  }).map(g=>String(g.descripcion)+' (valor SQL '+g.clasificacion+')');
}
function verificarCatalogoSQL(rows){
  if(!Array.isArray(rows))return false;
  for(const [nombre,clave] of Object.entries({alimentos:2,bebidas:1,otros:3})){
    const found=rows.filter(r=>compactar(r.descripcion)===nombre);
    if(found.length!==1||Number(found[0].clasificacionventa)!==clave)return false;
  }
  return true;
}
function colorRGB(value,format){
  if(!Number.isSafeInteger(value)||value<0||value>0xffffff)return null;
  const b=value&255,g=(value>>8)&255,r=(value>>16)&255;
  return format==='COLORREF'?{r:b,g,b:r}:{r,g,b};
}
function parecidoNaranja(n){
  // No replicar negro, azules u otros colores personalizados como si fueran el predeterminado.
  const metrics=['COLORREF','RGB'].map(mode=>{const c=colorRGB(n,mode);if(!c)return Infinity;
    return Math.sqrt((c.r-255)**2+(c.g-165)**2+(c.b-0)**2);
  });
  return Math.min(...metrics);
}
function elegirEstilo(rows=[]){
  const candidatos=rows.filter(g=>Number.isInteger(Number(g.color))&&g.color!=null&&g.colorletra!=null&&Number(g.colorletra)===0)
    .map(g=>({color:Number(g.color),distancia:parecidoNaranja(Number(g.color)),idgrupo:String(g.idgrupo??'').trim()}))
    .filter(g=>g.distancia<110).sort((a,b)=>a.distancia-b.distancia||a.idgrupo.localeCompare(b.idgrupo));
  return {color:candidatos[0]?.color??NARANJA_COLORREF,colorletra:NEGRO_COLORREF,fuente:candidatos.length?'grupo_existente':'colorref_naranja'};
}
module.exports={CLASES,ETIQUETAS,NARANJA_COLORREF,NEGRO_COLORREF,proponerClase,claseValida,conflictosClasificacion,verificarCatalogoSQL,elegirEstilo};
