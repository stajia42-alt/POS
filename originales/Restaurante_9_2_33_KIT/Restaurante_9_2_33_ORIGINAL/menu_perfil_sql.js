'use strict';
// Una sola empresa: se lee de SQL; nunca se usa un identificador supuesto.
const {trim,error,plantillaValida}=require('./menu_contrato');
function perfilEmpresa(rows){
  const ids=[...new Set((rows||[]).map(x=>trim(x.idempresa)).filter(Boolean))];
  if(ids.length===1)return {estado:'unica',idempresa:ids[0]};
  return {estado:ids.length?'multiple':'sin_empresa',idempresa:null};
}
function seleccionarReferencia(refs,grupo){
  const valid=(refs||[]).filter(plantillaValida);
  if(!valid.length)return null;
  const group=trim(grupo);
  const candidates=group?valid.filter(r=>trim(r.idgrupo)===group):[];
  const scope=candidates.length?candidates:valid;
  // Determinista: se usa el perfil fiscal/unidad más frecuente del catálogo (no el primero alfabético).
  const firma=r=>[trim(r.idempresa),trim(r.idunidad),Number(r.excentoimpuestos),Number(r.impuesto1),Number(r.precioabierto)].join('|');
  const count=new Map();for(const r of scope)count.set(firma(r),(count.get(firma(r))||0)+1);
  return scope.slice().sort((a,b)=>(count.get(firma(b))-count.get(firma(a)))||trim(a.idproducto).localeCompare(trim(b.idproducto)))[0];
}
// El proyecto original utilizaba precioabierto=2 en altas anteriores.
// Solo se permite como compatibilidad explicita si SQL no contiene ningun modo registrado.
function modosCompatibles(modos){return modos.length?modos:[2];}
function perfilAlternativo(input,empresa,unidades,modos){
  const u=trim(input?.idunidad),rate=Number(input?.impuesto1),mode=Number(input?.precioabierto);
  if(!empresa||!u||!unidades.some(x=>trim(x.idunidad)===u))throw error('Selecciona una unidad registrada en Soft Restaurant.');
  if(![0,8,16].includes(rate)||!Number.isInteger(mode)||!modosCompatibles(modos).includes(mode))throw error('Confirma los impuestos y el modo de precio con datos existentes en SQL.');
  const base=100,precio=100*(1+rate/100);
  return {idproducto:'CONFIGURACION_VERIFICADA',idempresa:empresa,idunidad:u,precio,preciosinimpuestos:base,excentoimpuestos:rate===0?1:0,impuesto1:rate,impuesto2:0,impuesto3:0,precioabierto:mode,bloqueado:0};
}
module.exports={perfilEmpresa,seleccionarReferencia,perfilAlternativo,modosCompatibles};
