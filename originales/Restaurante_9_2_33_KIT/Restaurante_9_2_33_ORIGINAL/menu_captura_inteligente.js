'use strict';
// Propuestas a partir de una transcripción íntegra, sin escribir en SQL.
const {interpretarMenu,precio,grupoCoincidente,normalizar}=require('./menu_contexto');
const Variantes=require('./menu_precios_multiples');
const {consolidar}=require('./public/menu-consolidar');
const text=(v,max=400)=>typeof v==='string'?v.trim().slice(0,max):'';
const linesOf=d=>{
  if(!Array.isArray(d?.lineas)||d.lineas.length>600)throw Error('Transcripción no válida.');
  if(d.lineas.some(s=>typeof s!=='string'))throw Error('La transcripción contiene líneas inválidas.');
  return d.lineas.map(s=>s.trim().slice(0,500));
};
function isPriceVisible(value,lines){
  const p=precio(value);if(p===null)return false;
  return lines.some(s=>Array.from(s.matchAll(/(?:\$\s*)?\b\d{1,7}(?:[.,]\d{1,2})?\b/g)).some(m=>precio(m[0].replace(/\$\s*/,''))===p));
}
function evidence(ids,lines){
  const list=Array.isArray(ids)?ids:[];
  return [...new Set(list.filter(n=>Number.isInteger(n)&&n>=0&&n<lines.length))].slice(0,25);
}
function fromStructured(raw,groups=[]){
  const lineas=linesOf(raw);
  if(!lineas.some(Boolean))throw Error('Gemini no devolvió texto visible.');
  if(!Array.isArray(raw.productos)||raw.productos.length>350)throw Error('Gemini no devolvió propuestas de productos válidas.');
  const bloques=lineas.map((texto,id)=>({id,texto,pagina:0,caja:null,confianza:null,uso:[]}));
  const productos=[],categorias=[],incidencias=[],recognized=new Set();
  const used=new Set();
  for(const category of (Array.isArray(raw.categorias)?raw.categorias:[]).slice(0,120)){
    const nombre=text(category?.nombre,120);if(!nombre)continue;
    const ev=evidence(category?.lineas,lineas);const match=grupoCoincidente(nombre,groups);
    categorias.push({nombre,padre:text(category?.padre,120),conocido:!!ev.length,evidencia:ev,...match});
    ev.forEach(id=>{recognized.add(id);bloques[id].uso.push('categoria');});
  }
  for(const entry of raw.productos){
    const nombre=text(entry?.nombre,180),grupo=text(entry?.categoria,120);
    if(!nombre||!/[\p{L}]/u.test(nombre))continue;
    const ev=evidence(entry?.lineas,lineas),warnings=[];
    const visibleName=ev.some(i=>normalizar(lineas[i]).includes(normalizar(nombre)))||normalizar(ev.map(i=>lineas[i]).join(' ')).includes(normalizar(nombre));
    if(!visibleName)warnings.push('Nombre no verificable en la transcripción: comprobar fotografía.');
    const inputPrice=entry?.precio;
    const amount=(typeof inputPrice==='number'||typeof inputPrice==='string')?precio(inputPrice):null;
    const visiblePrice=amount!==null && ev.some(i=>isPriceVisible(inputPrice,[lineas[i]]));
    if(amount===null)warnings.push('Precio ausente o ambiguo: confirmar en la fotografía.');
    else if(!visiblePrice)warnings.push('Precio no verificable junto a este producto: confirmar en la fotografía.');
    if(!grupo)warnings.push('Categoría no identificada.');
    const matches=grupoCoincidente(grupo,groups);
    if(!matches.idgrupo)warnings.push('Asignar un grupo existente o preparar su creación.');
    if(nombre.length>60)warnings.push('Nombre superior a 60 caracteres: revisar antes de importar.');
    const description=text(entry.descripcion,1500);
    if(description && !lineas.some(s=>normalizar(s).includes(normalizar(description))) && !ev.some(i=>normalizar(description).includes(normalizar(lineas[i]))))warnings.push('Descripción interpretada: contrastar con la foto.');
    const modifiers=Array.isArray(entry.modificadores)?entry.modificadores.slice(0,40):[];
    const options=modifiers.map(m=>{
      if(typeof m==='string')m={nombre:m};
      return {nombre:text(m?.nombre,150),precio:m?.precio==null?null:precio(m.precio),evidencia:evidence(m?.lineas,lineas)};
    }).filter(m=>m.nombre);
    const components=(Array.isArray(entry.componentes)?entry.componentes:[]).slice(0,40).map(c=>text(typeof c==='string'?c:c?.nombre,160)).filter(Boolean);
    const parsedGroups=(Array.isArray(entry.grupos_modificadores)?entry.grupos_modificadores:[]).slice(0,8).map(g=>{
      const list=(Array.isArray(g?.opciones)?g.opciones:[]).slice(0,35).map(o=>({nombre:text(o?.nombre,60),precio:o?.precio==null?null:precio(o.precio),evidencia:evidence(o?.lineas,lineas)})).filter(o=>o.nombre);
      return {nombre:text(g?.nombre,30),obligatorio:g?.obligatorio===true?true:null,minimo:g?.obligatorio===true?1:null,maximo:g?.obligatorio===true?1:null,opciones:list,origen:'gemini_grupos'};
    }).filter(g=>g.nombre&&g.opciones.length);
    const p={id:'p'+(productos.length+1),nombre,precio:amount,idgrupo:matches.idgrupo,grupo_detectado:grupo,categoria_padre:'',
      tipo:parsedGroups.length||options.length?'con_opciones':'independiente',modificadores:parsedGroups.length?parsedGroups:options.length?[{nombre:'Opciones detectadas',obligatorio:null,minimo:null,maximo:null,opciones:options,origen:'gemini_transcripcion'}]:[],
      ingredientes:description?[description]:[],evidencia:ev,precios_detectados:amount===null?[]:[amount],confianza:warnings.length?'baja':'media',
      revisado:false,requiere_revision:!!warnings.length,necesitaConfirmacion:(!visibleName||amount===null||!visiblePrice||ev.length===0),revision:warnings};
    if(options.length||components.length){p.opcionesVisualesPendientes=[...options.map((m,i)=>({marcaId:'ia-mod-'+i,tipo:'modificador',texto:m.nombre})),
      ...components.map((c,i)=>({marcaId:'ia-comp-'+i,tipo:'componente',texto:c}))];
      p.revision.push('Opciones o componentes pendientes de validar en SQL; no se importan automáticamente.');}
    if(ev.length===0)p.revision.push('No hay líneas de evidencia vinculadas a este producto.');
    ev.forEach(id=>{recognized.add(id);bloques[id].uso.push('producto');});
    const alternatives=Variantes.propuestas(entry,lineas,ev);
    if(alternatives.length>1){
      const checked=Variantes.validarMontos(alternatives,lineas);
      const compound=Variantes.propuestaCompuesta(checked,entry,lineas);
      if(compound && !components.length){
        // Conservar otros modificadores que Gemini encontró; nunca borrar salsas
        // u otras elecciones sólo porque también detectamos el tipo de papas.
        const extra=p.modificadores.filter(m=>normalizar(m.nombre)!==normalizar(compound.modificadores[0].nombre));
        p.precio=compound.precio;p.tipo='con_opciones';p.modificadores=[...compound.modificadores,...extra];
        p.opcionesVisualesPendientes=[];p.precios_detectados=checked.map(x=>x.precio).filter(x=>x!==null);
        p.revision=p.revision.filter(w=>!/^Precio ausente|^Precio no verificable/.test(w));
        p.necesitaConfirmacion=!visibleName||!checked.every(x=>x.verificado)||!ev.length;
        if(p.modificadores.some(m=>m.opciones.some(o=>o.precio===null)))p.revision.push('Una presentación tiene el precio sin comprobar. No se importará hasta corregirlo.');
        productos.push(p);used.add(normalizar(nombre));continue;
      }
      for(const opt of checked){
        const fullName=Variantes.nombreVariante(nombre,opt.nombre);
        const variant={...p,id:'p'+(productos.length+1),nombre:fullName,precio:opt.precio,tipo:'independiente',modificadores:[],
          presentacionMenu:opt.nombre,productoBase:nombre,precios_detectados:checked.map(x=>x.precio).filter(x=>x!==null),
          evidencia:[...new Set([...ev,...evidence(opt.evidencia,lineas)])],revision:warnings.filter(w=>!/^Precio ausente|^Precio no verificable/.test(w)),
          necesitaConfirmacion:!visibleName||!opt.verificado||ev.length===0,opcionesVisualesPendientes:[]};
        if(!opt.verificado){variant.revision.push('El precio de esta presentación no aparece con claridad en el texto.');variant.necesitaConfirmacion=true;}
        if(fullName.length>60)variant.revision.push('El nombre con presentación supera 60 caracteres.');
        productos.push(variant);used.add(normalizar(fullName));
      }
      continue;
    }
    productos.push(p);
    used.add(normalizar(nombre));
  }
  const unificados=consolidar(productos).productos;
  for(let i=0;i<unificados.length;i++)if(unificados.findIndex(p=>normalizar(p.nombre)===normalizar(unificados[i].nombre))<i)unificados[i].revision.push('Nombre duplicado en esta fotografía: comprobar.');
  // Las líneas no usadas se preservan para recuperar posibles productos omitidos.
  const pendientes=bloques.filter(b=>b.texto&&!b.uso.length);
  return {version:1,productos:unificados,categorias,bloques,pendientes,incidencias,
    transcripcion:lineas.join('\n'),lineasTranscritas:lineas,fuente:'gemini_captura',
    resumen:{lineas:lineas.length,propuestas:unificados.length,sinAsignar:pendientes.length,preciosSinProducto:0},
    advertencia:'Propuestas para revisión. La lectura no registra datos en SQL.'};
}
function fromText(texto,groups=[]){
  if(typeof texto!=='string'||texto.length>120000)throw Error('Texto demasiado largo.');
  const lineas=texto.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  if(!lineas.length)throw Error('No hay texto para organizar.');
  if(lineas.length>600)throw Error('Máximo 600 líneas por fotografía.');
  const result=interpretarMenu(lineas,groups);
  return {...result,productos:consolidar(result.productos||[]).productos,transcripcion:lineas.join('\n'),lineasTranscritas:lineas,fuente:'organizador_texto',
    advertencia:'Organizado desde el texto. Revisa descripciones, grupos y precios antes de importar.'};
}
const allowedOps=new Set(['nombre','precio','categoria','descripcion','modificador','quitar']);
function validateSuggestions(input,validIds,transcripcion){
  if(!Array.isArray(input?.cambios)||input.cambios.length>60)throw Error('Gemini no devolvió una lista de cambios válida.');
  const ids=new Set(validIds);
  return input.cambios.map(c=>{
    const id=text(c?.id,100),campo=text(c?.campo,30),valor=c?.valor;
    if(!ids.has(id)||!allowedOps.has(campo))throw Error('La IA propuso un cambio desconocido. No se aplicó nada.');
    if(campo==='precio' && (precio(valor)===null || !isPriceVisible(valor,String(transcripcion).split('\n'))))
      throw Error('La IA propuso un precio que no se ve en la transcripción. Compruébalo manualmente.');
    if(campo==='quitar')return {id,campo,valor:true};
    if(campo!=='precio'&&(!text(valor,200)||String(valor).length>200))throw Error('Texto de corrección inválido.');
    return {id,campo,valor:campo==='precio'?precio(valor):text(valor,200)};
  });
}
function applySuggestions(products,changes){
  const copy=structuredClone(products);const byId=new Map(copy.map(p=>[p.id,p]));
  for(const c of changes){const p=byId.get(c.id);if(!p||p.importado||p.revisado)throw Error('No se modifica un producto ya confirmado o importado.');
    if(c.campo==='nombre')p.nombre=c.valor;
    if(c.campo==='precio')p.precio=c.valor;
    if(c.campo==='categoria'){p.grupo_detectado=c.valor;p.idgrupo='';}
    if(c.campo==='descripcion')p.ingredientes=[c.valor];
    if(c.campo==='modificador'){p.opcionesVisualesPendientes=p.opcionesVisualesPendientes||[];p.opcionesVisualesPendientes.push({marcaId:'instruccion-'+p.opcionesVisualesPendientes.length,tipo:'modificador',texto:c.valor});}
    if(c.campo==='quitar')p.excluido=true;
    p.revision=[...new Set([...(p.revision||[]),'Revisar corrección solicitada a Gemini.'])];p.revisado=false;
  }
  return copy;
}
module.exports={fromStructured,fromText,isPriceVisible,validateSuggestions,applySuggestions};
