(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.MenuConsolidar=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const clean=s=>String(s||'').trim().replace(/\s+/g,' ');
 const norm=s=>clean(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 // Únicamente identifica variantes de papas con nombre explícito, no tamaños arbitrarios.
 const suffix=/\s+(?:\((sin papas|con papas(?: a la francesa| francesas| fritas| sazonadas)?|papas(?: a la francesa| francesas| fritas| sazonadas))\)|(sin papas|con papas(?: a la francesa| francesas| fritas| sazonadas)?|papas(?: a la francesa| francesas| fritas| sazonadas)))\s*$/i;
 const kind=s=>{const t=norm(s);if(t==='sin papas')return 'sin';if(/^(?:con )?papas(?: a la francesa| francesas| fritas)?$/.test(t))return 'francesas';if(/^(?:con )?papas sazonadas$/.test(t))return 'sazonadas';return null;};
 function identity(p){
   if(p.importado||p.excluido||p.tipo==='con_opciones'||(p.modificadores||[]).length)return null;
   let parent='',option='';
   if(clean(p.productoBase)&&clean(p.presentacionMenu)){
     parent=clean(p.productoBase);option=clean(p.presentacionMenu);
   }else {
     const match=clean(p.nombre).match(suffix);
     if(!match)return null;
     parent=clean(p.nombre).slice(0,match.index).trim();option=match[1]||match[2];
   }
   const type=kind(option);
   if(!parent||!type)return null;
   return {parent,option:clean(option),type,key:[norm(parent),norm(p.grupo_detectado||p.idgrupo||''),p.foto||''].join('|')};
 }
 function consolidateGroup(rows,ids){
   const variants=rows.map((row,i)=>({row,...ids[i]}));
   if(variants.length<2||!variants.some(v=>v.type==='sin'))return null;
   const types=variants.map(v=>v.type);
   if(new Set(types).size!==types.length)return {ambiguo:true};
   const base=variants.find(v=>v.type==='sin');
   if(typeof base.row.precio!=='number'||!Number.isFinite(base.row.precio))return {ambiguo:true};
   const unreliable=variants.some(v=>(v.row.revision||[]).some(w=>/^Precio ausente|^Precio no verificable/i.test(w)));
   const opts=variants.map(v=>{
     const amount=v.row.precio;
     const verified=!(v.row.revision||[]).some(w=>/^Precio ausente|^Precio no verificable/i.test(w));
     const extra=verified&&!unreliable&&typeof amount==='number'&&Number.isFinite(amount)&&amount>=base.row.precio?Math.round((amount-base.row.precio)*100)/100:null;
     return {nombre:v.option,precio:extra,evidencia:v.row.evidencia||[]};
   });
   // Sin completar recargos por diferencias de otros platillos.
   const pending=opts.some(o=>o.precio===null)||variants.some(v=>v.row.necesitaConfirmacion);
   const names=new Set(variants.map(v=>norm(v.option)));
   if(names.size!==variants.length)return {ambiguo:true};
   const main={...base.row,nombre:base.parent,precio:base.row.precio,tipo:'con_opciones',
     modificadores:[{nombre:'TIPO DE PAPAS',obligatorio:true,minimo:1,maximo:1,opciones:opts}],
     ingredientes:[...new Set(variants.flatMap(v=>v.row.ingredientes||[]))],
     evidencia:[...new Set(variants.flatMap(v=>v.row.evidencia||[]))],
     precios_detectados:variants.map(v=>v.row.precio).filter(v=>typeof v==='number'&&Number.isFinite(v)),
     opcionesVisualesPendientes:[],necesitaConfirmacion:pending,revisado:false,
     revision:[...new Set(variants.flatMap(v=>v.row.revision||[]).filter(x=>!/^precio ausente|^precio no verificable/i.test(x)).concat(pending?['Confirma los precios de las presentaciones antes de importar.']:[]))]};
   delete main.presentacionMenu;delete main.productoBase;
   return {main};
 }
 function consolidar(productos){
   if(!Array.isArray(productos))return {productos:[],cambios:0,ambiguos:0};
   const groups=new Map();
   productos.forEach((p,index)=>{const id=identity(p);if(!id)return;
     const list=groups.get(id.key)||[];list.push({index,id,p});groups.set(id.key,list);});
   const keep=new Set(),replace=new Map();let changes=0,ambiguous=0;
   for(const entries of groups.values()){
     const converted=consolidateGroup(entries.map(x=>x.p),entries.map(x=>x.id));
     if(!converted)continue;
     if(converted.ambiguo){ambiguous++;
       // Nunca importar de manera automática opciones repetidas o ambiguas.
       for(const x of entries){x.p.tipo='variante';x.p.revisado=false;
         x.p.revision=[...new Set([...(x.p.revision||[]),'Las opciones de papas parecen repetidas o ambiguas: revisa antes de guardar en SQL.'])];}
       continue;
     }
     const first=Math.min(...entries.map(x=>x.index));replace.set(first,converted.main);
     entries.forEach(x=>keep.add(x.index));changes++;
   }
   return {productos:productos.flatMap((p,i)=>replace.has(i)?[replace.get(i)]:keep.has(i)?[]:[p]),cambios:changes,ambiguos:ambiguous};
 }
 return Object.freeze({consolidar,kind,identity});
});
