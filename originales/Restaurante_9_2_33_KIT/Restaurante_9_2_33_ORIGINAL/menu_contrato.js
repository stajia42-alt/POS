'use strict';
// Las capacidades se deducen de metadatos leídos del servidor, nunca del cliente.
// Las pruebas de este módulo usan estructuras sintéticas explícitas, no una conexión SQL simulada.
const crypto = require('crypto');
const {normalizar, equivalenciasGrupos} = require('./menu_contexto');
const GrupoConfig = require('./menu_grupo_config');
const textTypes = new Set(['varchar','nvarchar','char','nchar']);
const numberTypes = new Set(['tinyint','smallint','int','bigint','numeric','decimal','money','smallmoney','float','real','bit']);
const ajustesGrupo = new Set(['clasificacion','prioridad','color','colorletra','prioridadimpresion','cambiacolorcuenta','colorcuenta','colorletracuenta','solicitaautorizacion','porcentajepropina','alcohol']);
const camposProducto = ['idproducto','descripcion','idgrupo','usarcomedor','usardomicilio','usarrapido'];
const camposDetalle = ['idproducto','idempresa','precio','preciosinimpuestos','impuesto1','impuesto2','impuesto3','excentoimpuestos','idunidad','precioabierto','bloqueado'];
const lower = s => String(s).toLowerCase();
const q = s => '['+String(s).replace(/]/g,']]')+']';
const trim = v => String(v ?? '').trim();
const groupNorm = s => equivalenciasGrupos[normalizar(s)] || String(s??'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const hash = x => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
// Definiciones completas revisadas en el diagnóstico enviado el 08/10/2026.
// Se permiten sólo estas definiciones exactas; jamás se deshabilita un trigger.
const triggersRevisados = {
  'grupos.actualizaciongrupo':'c9a57ad53aa54ad9d1efbd0aff421536bd48867f0e36f4bb1793690ce18f18f2',
  'productos.actualizacionproducto':'0a99c06030916d8f7d8cfb04d9f1043b880139f3262a8a15f975a1114cf90150',
  'productos.ax_productos_trigger':'cdbf7ce5602f32f2087fe655083e6f62d4db2c255abec61fbf47563b6486d039',
  'productosdetalle.actualizacionproductodetalle':'cda7e01403bef2a0ec1cd0f0a0f0248ac39d866d3df4863df90398a2466af27d',
  'productosdetalle.tr_productosdetalle_insert':'7377e9c23355836ec2d10bac338cdffd154d8ce26f6205c4a850ff5a92c1eba0'
};
function triggerRevisado(t) {
  return typeof t.definicion==='string'&&triggersRevisados[lower(t.tabla)+'.'+lower(t.nombre)]===crypto.createHash('sha256').update(t.definicion.trim()).digest('hex');
}
function detalleSinIndice(meta) {
  // Instalación observada: la tabla de precios no tiene índice; el servicio exige
  // TABLOCKX + ausencia de CUALQUIER precio previo de la clave antes del INSERT.
  return !meta.indices.some(r=>lower(r.esquema)==='dbo'&&lower(r.tabla)==='productosdetalle')&&
    meta.disparadores.some(t=>lower(t.esquema)==='dbo'&&lower(t.tabla)==='productosdetalle'&&lower(t.nombre)==='tr_productosdetalle_insert'&&!t.deshabilitado&&triggerRevisado(t));
}
function error(message, codigo='VALIDACION_MENU') {return Object.assign(Error(message), {codigo});}
function columna(meta, tabla, nombre) {return meta.columnas.find(c=>lower(c.esquema)==='dbo'&&lower(c.tabla)===tabla&&lower(c.columna)===nombre);}
function columnas(meta, tabla) {return meta.columnas.filter(c=>lower(c.esquema)==='dbo'&&lower(c.tabla)===tabla);}
function generated(c) {return c.identidad===true||c.identidad===1||c.calculada===true||c.calculada===1||['timestamp','rowversion'].includes(lower(c.tipo));}
function required(c) {return !generated(c)&&!c.admiteNulo&&c.valorDefecto==null;}
function length(c) {return c.longitudBytes===-1?Infinity:c.longitudBytes/(/^n/.test(lower(c.tipo))?2:1);}
function stringValue(c, value, label, multiline=false) {
  if(!c||!textTypes.has(lower(c.tipo))||typeof value!=='string'||!value.trim()||(multiline?/[\u0000-\u0009\u000b-\u001f]/:/[\u0000-\u001f]/).test(value))throw error(label+': texto no válido.');
  value=value.trim();
  if(value.length>length(c))throw error(label+': el máximo real de SQL es '+length(c)+' caracteres.');
  // NVARCHAR conserva Unicode. VARCHAR debe comprobarse además por lectura tras INSERT.
  return value;
}
function validMoney(v) {return typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=9999999&&Math.abs(Math.round(v*100)-v*100)<0.000001;}
function unico(meta,tabla,keys) {
  const map = new Map();
  for(const r of meta.indices.filter(r=>lower(r.esquema)==='dbo'&&lower(r.tabla)===tabla&&r.unico&&!r.deshabilitado&&!r.filtrado&&!r.incluida&&r.orden>0)){
    if(!map.has(r.indice))map.set(r.indice,[]);map.get(r.indice).push(lower(r.columna));
  }
  return [...map.values()].some(a=>a.length===keys.length&&keys.every(k=>a.includes(k)));
}
function tableContract(meta, tabla, provided, keys, knownFK) {
  const reasons=[], t=meta.tablas.find(t=>lower(t.esquema)==='dbo'&&lower(t.tabla)===tabla), cols=columnas(meta,tabla);
  if(!meta.completo||!meta.entorno[0]?.baseDatos)reasons.push('Falta permiso VIEW DEFINITION para comprobar la estructura completa.');
  if(!t||!cols.length)return {tabla,lista:false,motivos:[...reasons,'No se encontró dbo.'+tabla+'.'],columnas:[],faltantes:[]};
  if(!t.puedeLeer||!t.puedeInsertar)reasons.push('Faltan permisos de lectura o inserción en '+tabla+'.');
  if(cols.some(c=>!Object.hasOwn(c,'admiteNulo')||!Object.hasOwn(c,'identidad')||!Object.hasOwn(c,'calculada')||!Object.hasOwn(c,'valorDefecto')||!Number.isInteger(c.longitudBytes)))reasons.push('Los metadatos de '+tabla+' están incompletos.');
  for(const key of provided)if(!cols.some(c=>lower(c.columna)===key&&!generated(c)))reasons.push('Campo no disponible para captura: '+tabla+'.'+key+'.');
  if(!unico(meta,tabla,keys)&&!(tabla==='productosdetalle'&&detalleSinIndice(meta)))reasons.push('No se verificó una clave única para '+tabla+' ('+keys.join(', ')+').');
  const triggers=meta.disparadores.filter(r=>lower(r.esquema)==='dbo'&&lower(r.tabla)===tabla&&!r.deshabilitado);
  if(triggers.some(t=>!triggerRevisado(t)))reasons.push(tabla+' tiene disparadores activos no revisados; requieren revisión antes de insertar.');
  if(triggers.some(t=>lower(t.nombre).startsWith('actualizacion'))){
    const history=columnas(meta,'historialactualizaciones');
    if(!history.length||!meta.tablas.some(t=>lower(t.esquema)==='dbo'&&lower(t.tabla)==='ws_cloud')||history.some(c=>required(c)&&!['tipooperacion','entidad'].includes(lower(c.columna)))||meta.disparadores.some(t=>lower(t.esquema)==='dbo'&&lower(t.tabla)==='historialactualizaciones'&&!t.deshabilitado))reasons.push('La bitácora de los disparadores necesita revisión.');
  }
  for(const fk of meta.relaciones.filter(r=>lower(r.esquemaOrigen)==='dbo'&&lower(r.tablaOrigen)===tabla)){
    const link=lower(fk.columnaOrigen)+'>'+lower(fk.esquemaDestino)+'.'+lower(fk.tablaDestino)+'.'+lower(fk.columnaDestino);
    // noVerificada describe datos históricos. Las referencias NUEVAS se vuelven
    // a consultar dentro de la transacción; no se ALTERa ninguna restricción.
    if(fk.deshabilitada||!knownFK.includes(link))reasons.push('Relación pendiente de validar en '+tabla+': '+fk.relacion+'.');
  }
  if(meta.comprobaciones.some(r=>lower(r.esquema)==='dbo'&&lower(r.tabla)===tabla&&(r.deshabilitada||r.noVerificada||!r.definicion)))reasons.push('Hay restricciones no verificadas en '+tabla+'.');
  const faltantes=cols.filter(c=>required(c)&&!provided.includes(lower(c.columna))).map(c=>lower(c.columna));
  return {tabla,lista:reasons.length===0,motivos:[...new Set(reasons)],columnas:cols,faltantes};
}
function evaluar(meta) {
  for(const name of ['entorno','tablas','columnas','indices','relaciones','comprobaciones','disparadores'])if(!Array.isArray(meta[name]))throw error('Faltan metadatos SQL.','ESTRUCTURA_PENDIENTE');
  const service=columna(meta,'grupos','servicecode');
  const g=tableContract(meta,'grupos',['idgrupo','descripcion'],['idgrupo'],service?.admiteNulo&&service.valorDefecto==null?['servicecode>dbo.servicecodes.servicecode']:[]);
  // No inventar una clasificacion, ni obligar a seleccionar un grupo modelo si
  // dbo.grupos.clasificacion permite NULL o dispone de DEFAULT. SQL puede
  // crear el registro omitiendo esa columna. Solo copiar campos realmente
  // obligatorios segun el contrato de la instalacion.
  for(const name of ['idgrupo','descripcion'])if(!textTypes.has(lower(columna(meta,'grupos',name)?.tipo)))g.motivos.push('Tipo de '+name+' en grupos no compatible.');
  for(const name of ['clasificacion','color','colorletra']) {const c=columna(meta,'grupos',name);if(c&&!numberTypes.has(lower(c.tipo)))g.motivos.push('Tipo del campo '+name+' no compatible con grupos.');}
  for(const name of g.faltantes)if(!ajustesGrupo.has(name)||!numberTypes.has(lower(columna(meta,'grupos',name)?.tipo)))g.motivos.push('Campo obligatorio de grupos sin regla comprobada: '+name+'.');
  const p=tableContract(meta,'productos',camposProducto,['idproducto'],['idgrupo>dbo.grupos.idgrupo']);
  const d=tableContract(meta,'productosdetalle',camposDetalle,['idproducto','idempresa'],['idproducto>dbo.productos.idproducto','idempresa>dbo.empresas.idempresa','idunidad>dbo.udsmedida.idunidad']);
  for(const [table,field] of [['productos','idproducto'],['productos','descripcion'],['productos','idgrupo'],['productosdetalle','idproducto'],['productosdetalle','idempresa'],['productosdetalle','idunidad']])if(!textTypes.has(lower(columna(meta,table,field)?.tipo)))p.motivos.push('Tipo de '+table+'.'+field+' no compatible.');
  for(const [table,fields] of [['productos',['usarcomedor','usardomicilio','usarrapido']],['productosdetalle',['precio','preciosinimpuestos','impuesto1','impuesto2','impuesto3','excentoimpuestos','precioabierto','bloqueado']]])for(const field of fields)if(!numberTypes.has(lower(columna(meta,table,field)?.tipo)))p.motivos.push('Tipo de '+table+'.'+field+' no compatible.');
  for(const c of [...p.faltantes,...d.faltantes])p.motivos.push('Campo obligatorio de productos sin regla comprobada: '+c+'.');
  const motivos=[...new Set([...p.motivos,...d.motivos])];
  return {huella:hash(meta),baseDatos:meta.entorno[0]?.baseDatos||'',grupos:{lista:g.lista&&!g.motivos.length,motivos:g.motivos,requiereModelo:g.faltantes.length>0,ajustes:g.faltantes},productos:{lista:p.lista&&d.lista&&!motivos.length,motivos,alcance:'Productos independientes con configuración de un producto existente confirmada por el usuario. Impuestos simples sólo si el precio neto de referencia concuerda.'},modificadores:{lista:false,motivos:['Falta comprobar un producto con modificadores configurado en esta instalación. No se importará un producto de precio $0 sin sus opciones.'],tablasCandidatas:meta.tablas.filter(t=>/modific|complement|opcion/i.test(t.tabla)).map(t=>t.esquema+'.'+t.tabla)}};
}
function exigir(cap) {if(!cap.lista)throw error(cap.motivos.join(' '),'ESTRUCTURA_PENDIENTE');}
function planGrupos(meta, catalogo, proposed, modelo=null) {
  const cap=evaluar(meta);exigir(cap.grupos);
  const conflictos=GrupoConfig.conflictosClasificacion(catalogo);
  if(conflictos.length)throw error('La clasificación de esta base no coincide con los códigos de grupos esperados. Verifica en Soft Restaurant: '+conflictos.join(', ')+'.');
  if(!Array.isArray(proposed)||!proposed.length||proposed.length>200)throw error('Selecciona entre 1 y 200 grupos.');
  const idCol=columna(meta,'grupos','idgrupo'), nameCol=columna(meta,'grupos','descripcion');
  if(!Number.isFinite(length(idCol))||length(idCol)<1)throw error('Longitud de clave de grupo no compatible.');
  const ajustes={};
  for(const key of cap.grupos.ajustes){
    if(!modelo||modelo[key]==null)throw error('Selecciona un grupo existente como modelo para sus ajustes obligatorios: '+cap.grupos.ajustes.join(', ')+'.');
    if(typeof modelo[key]!=='number'&&typeof modelo[key]!=='boolean')throw error('El ajuste '+key+' del modelo no es válido.');
    if(typeof modelo[key]==='number'&&!Number.isFinite(modelo[key]))throw error('El ajuste '+key+' no es finito.');
    ajustes[key]=modelo[key];
  }
  if(modelo)for(const key of ajustesGrupo){
    const c=columna(meta,'grupos',key),value=modelo[key];
    if(c&&!generated(c)&&numberTypes.has(lower(c.tipo))&&value!=null&&(typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value)))ajustes[key]=value;
  }
  // Estilo tomado de un grupo naranja real si existe; si no, COLORREF naranja y negro.
  // Ninguno de estos valores se obtiene de un JSON de proyecto sin validar.
  const estilo=GrupoConfig.elegirEstilo(catalogo);
  const used=new Set(catalogo.map(g=>trim(g.idgrupo).toUpperCase())), all=[...catalogo], result=[], ids=new Set();
  // Claves cortas, deterministas, verificadas contra TODO el catálogo. No usa MAX convertido.
  const width=Math.min(2,length(idCol)), max=10**Math.min(5,length(idCol))-1;let next=1;
  for(const input of proposed){
    if(!input||typeof input.id!=='string'||!input.id||input.id.length>100||ids.has(input.id))throw error('Cada grupo necesita un identificador de proyecto único.');ids.add(input.id);
    const nombre=stringValue(nameCol,input.nombre,'Nombre del grupo'), matches=all.filter(g=>groupNorm(g.descripcion)===groupNorm(nombre));
    if(matches.length>1)throw error('Hay varios grupos equivalentes a '+nombre+'. Elige uno manualmente.');
    if(matches.length===1){result.push({id:input.id,nombre,idgrupo:trim(matches[0].idgrupo),accion:'existente'});continue;}
    while(next<=max&&used.has(String(next).padStart(width,'0').toUpperCase()))next++;
    if(next>max)throw error('No hay claves disponibles con la longitud admitida para grupos.');
    const idgrupo=String(next++).padStart(width,'0');used.add(idgrupo.toUpperCase());all.push({idgrupo,descripcion:nombre});
    const clasificacion=input.clasificacion==null?GrupoConfig.proponerClase(nombre):input.clasificacion;
    if(!GrupoConfig.claseValida(clasificacion))throw error('La clasificación de '+nombre+' debe ser Alimentos, Bebidas u Otros.');
    const atributos={...ajustes};
    for(const [key,value] of Object.entries({clasificacion,color:estilo.color,colorletra:estilo.colorletra})){
      if(columna(meta,'grupos',key))atributos[key]=value;
    }
    result.push({id:input.id,nombre,idgrupo,accion:'crear',clasificacion,estilo:estilo.fuente,ajustes:atributos});
  }
  return {tipo:'grupos',baseDatos:cap.baseDatos,huella:cap.huella,grupos:result,modelo:modelo?trim(modelo.idgrupo):null};
}
// Ajusta únicamente los tres atributos solicitados de un grupo ya creado.
// Nunca se recrean productos ni se alteran precios o ventas.
function planAjusteGrupo(meta,catalogo,input){
  const cap=evaluar(meta);exigir(cap.grupos);
  const conflictos=GrupoConfig.conflictosClasificacion(catalogo);
  if(conflictos.length)throw error('La clasificación de esta base no coincide con los códigos esperados: '+conflictos.join(', ')+'.');
  for(const key of ['clasificacion','color','colorletra'])if(!columna(meta,'grupos',key))throw error('La tabla de grupos no tiene el campo '+key+'.');
  if(!input||typeof input.idgrupo!=='string'||!input.idgrupo.trim())throw error('Elige el grupo existente a corregir.');
  if(!GrupoConfig.claseValida(input.clasificacion))throw error('Elige Alimentos, Bebidas u Otros para el grupo.');
  const key=stringValue(columna(meta,'grupos','idgrupo'),input.idgrupo,'Grupo existente');
  const found=catalogo.filter(g=>trim(g.idgrupo)===key);
  if(found.length!==1)throw error('El grupo no existe o no es único. Actualiza el catálogo.');
  const estilo=GrupoConfig.elegirEstilo(catalogo.filter(g=>trim(g.idgrupo)!==key));
  const anterior=Object.fromEntries(['clasificacion','color','colorletra'].map(k=>[k,found[0][k]??null]));
  return {tipo:'grupo_ajustes',baseDatos:cap.baseDatos,huella:cap.huella,grupo:{idgrupo:key,nombre:trim(found[0].descripcion),clasificacion:input.clasificacion,color:estilo.color,colorletra:estilo.colorletra,estilo:estilo.fuente,anterior}};
}
function plantillaValida(t) {
  return !!configuracionPrecio(t);
}
function configuracionPrecio(t) {
  if(!t||!trim(t.idempresa)||!trim(t.idunidad)||t.bloqueado==null||Number(t.bloqueado)!==0||t.precioabierto==null||!Number.isFinite(Number(t.precioabierto)))return null;
  for(const k of ['precio','preciosinimpuestos','impuesto1','impuesto2','impuesto3','excentoimpuestos'])if(t[k]==null||!Number.isFinite(Number(t[k]))||Number(t[k])<0)return null;
  // No deducir recargos fijos ni impuestos compuestos; conservarlos para revisión.
  if(Number(t.impuesto2)!==0||Number(t.impuesto3)!==0||Number(t.impuesto1)>100||Number(t.impuestoimporte3||0)!==0||Number(t.dev_impuestoimporte3||0)!==0)return null;
  const rate=Number(t.impuesto1),exento=Number(t.excentoimpuestos);
  if(exento!==0&&exento!==1||exento===1&&rate!==0)return null;
  const factor=1+rate/100;
  if(rate>0&&Number(t.precio)<=0)return null;
  if(Math.abs(Number(t.precio)-Number(t.preciosinimpuestos)*factor)>.0051)return null;
  return {factor,tasa:rate,exento};
}
function planProductos(meta,catalogo,grupos,input,plantilla) {
  const cap=evaluar(meta);exigir(cap.productos);
  if(input.configuracionConfirmada!==true&&input.exentoConfirmado!==true)throw error('Confirma la configuración del producto de referencia para este lote.');
  const pricing=configuracionPrecio(plantilla);
  if(!pricing||(input.exentoConfirmado===true&&pricing.exento!==1))throw error('El producto de referencia no tiene una configuración exenta o de impuesto simple comprobable.');
  const services=input.servicios;
  if(!services||['comedor','domicilio','rapido'].some(k=>typeof services[k]!=='boolean')||!['comedor','domicilio','rapido'].some(k=>services[k]===true))throw error('Selecciona explícitamente los servicios del lote.');
  if(!Array.isArray(input.productos)||!input.productos.length||input.productos.length>200)throw error('Selecciona entre 1 y 200 productos por lote.');
  const keys=new Set(catalogo.map(p=>trim(p.idproducto).toUpperCase())), names=new Set(catalogo.map(p=>normalizar(p.descripcion))), productos=[];
  for(const p of input.productos){
    if(!p||p.revisado!==true||p.excluido===true)throw error('Todos los productos del lote deben estar revisados e incluidos.');
    if(p.tipo!=='independiente'||!Array.isArray(p.modificadores)||p.modificadores.length)throw error('El producto '+(p.nombre||'sin nombre')+' tiene variantes u opciones pendientes de compatibilidad. No se guardará incompleto.','MODIFICADORES_PENDIENTES');
    let proposed=p.clave;
    if(proposed==null||proposed===''){
      const max=CantidadClaves(meta);let n=1;
      while(n<=max&&keys.has(String(n).padStart(Math.min(6,length(columna(meta,'productos','idproducto'))),'0')))n++;
      if(n>max)throw error('No hay claves automáticas disponibles.');proposed=String(n).padStart(Math.min(6,length(columna(meta,'productos','idproducto'))),'0');
    }
    const clave=stringValue(columna(meta,'productos','idproducto'),proposed,'Clave');
    if(!/^[A-Za-z0-9_-]+$/.test(clave))throw error('La clave sólo admite letras, números, guion y guion bajo.');
    if(typeof p.presentacion!=='undefined'&&typeof p.presentacion!=='string')throw error('Presentación inválida.');
    if(typeof p.nombre!=='string'||!p.nombre.trim())throw error('Indica el nombre del producto.');
    const nombre=stringValue(columna(meta,'productos','descripcion'),p.nombre.trim()+(p.presentacion?.trim()?' ('+p.presentacion.trim()+')':''),'Nombre completo');
    if(keys.has(clave.toUpperCase()))throw error('Clave ocupada o repetida: '+clave+'.');
    if(names.has(normalizar(nombre))||names.has(normalizar(p.nombre)))throw error('Producto ya existente o repetido: '+nombre+'.');
    if(!validMoney(p.precio))throw error('Precio inválido en '+nombre+'.');
    const grupo=stringValue(columna(meta,'productos','idgrupo'),p.idgrupo,'Grupo');
    if(grupos.filter(g=>trim(g.idgrupo)===grupo).length!==1)throw error('El grupo de '+nombre+' no existe en SQL. Crea o asigna el grupo primero.');
    if(!Array.isArray(p.ingredientes)||p.ingredientes.some(x=>typeof x!=='string'))throw error('Ingredientes inválidos en '+nombre+'.');
    let detalle='';
    if(p.ingredientes.length){
      const c=columna(meta,'productos','descripcion_detalle');
      if(c&&generated(c))throw error('Ingredientes: el campo de detalle no permite captura.');
      detalle=stringValue(c,p.ingredientes.join('\n'),'Ingredientes',true);
    }
    keys.add(clave.toUpperCase());names.add(normalizar(nombre));names.add(normalizar(p.nombre));
    productos.push({id:p.id||null,clave,nombre,idgrupo:grupo,precio:p.precio,preciosinimpuestos:Math.round(p.precio/pricing.factor*10000)/10000,detalle});
  }
  return {tipo:'productos',baseDatos:cap.baseDatos,huella:cap.huella,productos,servicios:{comedor:services.comedor,domicilio:services.domicilio,rapido:services.rapido},plantilla:Object.fromEntries(['idproducto','idempresa','idunidad','precioabierto','excentoimpuestos','impuesto1','impuesto2','impuesto3','bloqueado'].map(k=>[k,plantilla[k]]))};
}
function CantidadClaves(meta){return 10**Math.min(6,length(columna(meta,'productos','idproducto')))-1;}
function planMenu(meta,catalogo,grupos,input,plantilla,modelo=null){
  const draft=Array.isArray(input.grupos)?input.grupos:[],used=new Set((input.productos||[]).map(p=>p.idgrupo).filter(g=>typeof g==='string'&&g.startsWith('borrador:')).map(g=>g.slice(9)));
  if([...used].some(id=>!draft.some(g=>g.id===id)))throw error('Falta el nombre de un grupo del lote.');
  const g=used.size?planGrupos(meta,grupos,draft.filter(g=>used.has(g.id)),modelo):{grupos:[],modelo:null};
  const resolved=(input.productos||[]).map(p=>({...p,idgrupo:g.grupos.find(g=>'borrador:'+g.id===p.idgrupo)?.idgrupo||p.idgrupo}));
  const all=[...grupos,...g.grupos.filter(g=>g.accion==='crear').map(g=>({idgrupo:g.idgrupo,descripcion:g.nombre}))];
  const p=planProductos(meta,catalogo,all,{...input,productos:resolved},plantilla);
  return {...p,tipo:'menu',grupos:g.grupos,modelo:g.modelo};
}
module.exports={evaluar,planAjusteGrupo,planGrupos,planProductos,planMenu,plantillaValida,configuracionPrecio,detalleSinIndice,columna,columnas,camposProducto,camposDetalle,ajustesGrupo,q,trim,hash,error,stringValue,validMoney,length};
