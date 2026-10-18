'use strict';
// Perfil portable comprobado en Soft Restaurant 11 (referencia real LA NORTEÑA,
// CHILAQUILES). NO guarda empresas, claves ni impuestos de otro cliente.
// Utilizarlo sólo si los campos SQL esenciales coinciden con el diagnóstico.
const C=require('./menu_contrato');
const {error,columna}=C;
const estructura={
  gruposmodificadores:{idgruposmodificadores:['varchar',5],descripcion:['varchar',30]},
  gruposmodificadoresproductos:{idproducto:['varchar',15],idgruposmodificadores:['varchar',5],idempresa:['varchar',15],incluidos:['numeric',5],prioridad:['numeric',5],forzarcaptura:['bit',1],maximomodificadores:['smallint',2],captura_incluido:['bit',1]},
  modificadores:{idproducto:['varchar',15],idmodificador:['varchar',15],idempresa:['varchar',15],idgruposmodificadores:['varchar',5],precio:['money',8]},
  productosdetalle:{secuenciacompuesto:['bit',1],finalizarsecuenciacompuesto:['bit',1]}
};
const observados=Object.freeze({incluidos:0,forzarcaptura:1,maximomodificadores:1,captura_incluido:0,secuenciacompuesto:true,finalizarsecuenciacompuesto:true});
function compatible(meta){
  return Object.entries(estructura).every(([table,fields])=>Object.entries(fields).every(([name,expected])=>{
    const c=columna(meta,table,name);
    return c&&String(c.tipo).toLowerCase()===expected[0]&&Number(c.longitudBytes)===expected[1]
      &&!c.identidad&&!c.calculada;
  }));
}
function referencia(meta){
  if(!compatible(meta))throw error('Esta instalación no coincide con el perfil SQL de compuestos verificado. No se crearán referencias ficticias ni se escribirán relaciones sin validar.','PERFIL_COMPUESTO_NO_COMPATIBLE');
  return {idCol:columna(meta,'gruposmodificadores','idgruposmodificadores'),defaults:{...observados},origen:'perfil_sin_producto_de_prueba'};
}
module.exports={compatible,referencia,estructura,observados};
