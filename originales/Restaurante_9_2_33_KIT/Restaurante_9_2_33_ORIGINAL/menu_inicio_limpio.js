'use strict';
// Detección de primera instalación de catálogo. NO contiene credenciales,
// IDs de empresa, precios ni referencias copiadas de otro restaurante.
const {trim,error}=require('./menu_contrato');
function estadoInicial({empresa,referencias=[],totalProductos=null,unidades=[],modosPrecio=[],modoPrecioRespaldo=false,modeloGrupos,productosCompatibles,modificadoresCompatibles}={}){
  // No confundir 'sin referencia fiscal válida' con 'SQL sin productos'.
  const sinReferencia=Array.isArray(referencias)&&referencias.length===0;
  const limpio=totalProductos==null?sinReferencia:Number(totalProductos)===0;
  let estado='catalogo_existente';
  if(empresa?.estado!=='unica'||!empresa?.idempresa)estado='empresa_pendiente';
  else if(!Array.isArray(unidades)||!unidades.length)estado='unidad_pendiente';
  else if(limpio)estado='primera_configuracion';
  else if(sinReferencia)estado='catalogo_sin_referencia';
  return {
    estado,limpio,requiereProductoPrueba:false,
    requiereConfirmacionFiscal:estado==='primera_configuracion'||estado==='catalogo_sin_referencia',
    requiereConfirmacionModo:(estado==='primera_configuracion'||estado==='catalogo_sin_referencia')&&!!modoPrecioRespaldo,
    unidadSugerida:(estado==='primera_configuracion'||estado==='catalogo_sin_referencia')&&unidades.length===1?trim(unidades[0].idunidad):null,
    requiereModeloGrupo:!!modeloGrupos?.requiereModelo&&!modeloGrupos?.automatico,
    capacidades:{productos:productosCompatibles===true,compuestos:modificadoresCompatibles===true},
    descripcion:estado==='primera_configuracion'?'Catálogo sin productos. Puedes crear el primer grupo y sus productos compuestos sin crear artículos de prueba; confirma únicamente la unidad y el tratamiento fiscal.':
      estado==='catalogo_existente'?'Catálogo existente. Se reutilizan referencias y se conservan los datos de Soft Restaurant.':
      estado==='catalogo_sin_referencia'?'Hay productos SQL pero ninguno aporta una referencia fiscal compatible; revisa los datos antes de agregar otros.':
      'La instalación requiere completar primero sus catálogos de empresa o unidad en Soft Restaurant.'
  };
}
function validarConfirmacionFiscal(input,modosSQL=[]){
  if(input?.confirmacionFiscalInicial!==true)throw error('Confirma que la unidad y los impuestos corresponden a este negocio. No se necesita un producto de prueba.','CONFIRMACION_INICIAL');
  if(!Array.isArray(modosSQL)||modosSQL.length===0){
    if(input?.confirmacionModoPrecio!==true)throw error('Confirma el modo de precio inicial de respaldo antes de guardar en una base sin productos.','MODO_PRECIO_INICIAL');
  }
  return true;
}
module.exports={estadoInicial,validarConfirmacionFiscal};
