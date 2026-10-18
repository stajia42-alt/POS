'use strict';
// Lee importes por presentación: nunca calcula recargos ni reparte precios de otro platillo.
const {precio,normalizar}=require('./menu_contexto');
const nombres=['Sin papas','Papas a la francesa','Papas sazonadas'];
const limpios=(s)=>String(s||'').replace(/\s+/g,' ').trim();
function cabeceras(lineas){
  const all=lineas.map(normalizar).join(' ');
  return /sin papas/.test(all)&&/papas a la francesa|papas francesas|papas fritas/.test(all)&&/papas sazonadas/.test(all);
}
function montos(line){
  const text=limpios(line);
  const chunks=[...text.matchAll(/\$\s*(\d{1,6}(?:[.,]\d{1,2})?)\b/g)].map(x=>precio(x[1]));
  if(chunks.length===3)return chunks;
  // Sin $ sólo cuando son EXACTAMENTE tres cantidades al final de una línea y sin unidades.
  const match=text.match(/(?:^|\s)((?:\d{2,5}\s+){2}\d{2,5})\s*$/);
  if(match)return match[1].trim().split(/\s+/).map(precio);
  return [];
}
function importeSuelto(s){
  const t=limpios(s);
  return /^(?:\$\s*)?\d{2,6}(?:[.,]\d{1,2})?$/.test(t)?precio(t.replace(/^\$\s*/,'')):null;
}
function propuestas(row,lineas,ev){
  const raw=Array.isArray(row?.presentaciones)?row.presentaciones:Array.isArray(row?.precios)?row.precios:null;
  if(raw?.length){
    const namesConfirmed=cabeceras(lineas);
    // Una lista de importes sin encabezados NO significa automáticamente papas.
    return raw.slice(0,20).map((v,i)=>({nombre:limpios(typeof v==='object'?(v.nombre||v.presentacion||v.opcion):(namesConfirmed?nombres[i]:'')||'Presentación '+(i+1)),
      precio:precio(typeof v==='object'?v.precio:v),evidencia:Array.isArray(v?.lineas)?v.lineas:ev})).filter(v=>v.nombre);
  }
  if(!cabeceras(lineas))return [];
  // Solo reconstruir la tabla si los TRES importes están en una misma línea de evidencia.
  for(const ix of ev){
    const found=montos(lineas[ix]);
    if(found.length===3&&found.every(n=>n!==null))return nombres.map((nombre,i)=>({nombre,precio:found[i],evidencia:[ix]}));
  }
  // Si Gemini escribe los 3 precios en tres renglones consecutivos dentro de
  // la evidencia de ESTE producto, conservamos la secuencia exacta.
  const ordered=[...new Set(ev)].sort((a,b)=>a-b);
  for(let i=0;i<=ordered.length-3;i++){
    const triplet=ordered.slice(i,i+3);
    if(triplet[2]!==triplet[0]+2)continue;
    const values=triplet.map(j=>importeSuelto(lineas[j]));
    if(values.every(v=>v!==null))return nombres.map((nombre,j)=>({nombre,precio:values[j],evidencia:[triplet[j]]}));
  }
  return [];
}
function validarMontos(options,lineas){
  return options.map(option=>{
    const ids=Array.isArray(option.evidencia)?option.evidencia.filter(i=>Number.isInteger(i)&&i>=0&&i<lineas.length):[];
    // Nunca verificar el precio con el de otro producto de la misma fotografia.
    const local=new Set(ids.flatMap(i=>{
      const s=lineas[i];return [...String(s).matchAll(/\$\s*(\d{1,6}(?:[.,]\d{1,2})?)\b/g)].map(m=>precio(m[1])).concat(montos(s),importeSuelto(s)).filter(v=>v!==null);
    }));
    const ok=option.precio!==null&&local.has(option.precio);
    return {...option,precio:ok?option.precio:null,verificado:ok};
  });
}
function propuestaCompuesta(opciones,entry,lineas){
  // La alternativa necesita precios literales verificables y una selección
  // excluyente identificada por el menú. No se convierte cualquier lista de tamaños.
  if(!Array.isArray(opciones)||opciones.length<2||opciones.length>25)return null;
  const header=Array.isArray(lineas)?lineas.map(normalizar).join(' '):'';
  const direct=entry?.seleccionUnica===true||entry?.tipoPresentaciones==='modificadores';
  // Los encabezados pueden quedar fuera del recorte de evidencia de Gemini.
  // Reconocemos la elección por sus opciones explícitas, nunca por recargos globales.
  const sideDish=opciones.some(x=>/^sin papas$/i.test(x.nombre.trim())) &&
    opciones.some(x=>/^(?:con )?papas(?: a la francesa| francesas| fritas| sazonadas)?$/i.test(x.nombre.trim()) && !/^sin papas$/i.test(x.nombre.trim()));
  if(!direct&&!sideDish)return null;
  const base=opciones.find(x=>/^sin papas$/i.test(x.nombre))||opciones[0];
  if(base.precio!==null && opciones.some(x=>x.precio!==null && x.precio<base.precio))return null;
  const labels=new Set(opciones.map(x=>normalizar(x.nombre)));
  if(labels.size!==opciones.length)return null;
  // No usar una tabla entera como evidencia para productos ambiguos.
  const name=String(entry?.grupoPresentaciones|| (sideDish?'TIPO DE PAPAS':'PRESENTACIÓN')).trim();
  if(!name||name.length>30)return null;
  return {precio:base.precio,modificadores:[{nombre:name,obligatorio:true,minimo:1,maximo:1,
    opciones:opciones.map(x=>({nombre:x.nombre,precio:base.precio!==null&&x.precio!==null?Math.round((x.precio-base.precio)*100)/100:null,evidencia:x.evidencia||[]}))}]};
}
function nombreVariante(nombre,opcion){return limpios(nombre)+' ('+limpios(opcion)+')';}
module.exports={cabeceras,montos,propuestas,validarMontos,propuestaCompuesta,nombreVariante,nombres};
