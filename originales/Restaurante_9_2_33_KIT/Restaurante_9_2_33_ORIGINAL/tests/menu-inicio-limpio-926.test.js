'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const Inicio=require('../menu_inicio_limpio');const C=require('../menu_contrato');
const Compuestos=require('../menu_compuestos');
const PerfilCompuesto=require('../menu_perfil_compuesto');
const esquemaBase=require('./soft11-estructura-revisada.json');
const esquemaCompuestos=require('./compuestos-fixture.json');
const esquema=structuredClone(esquemaBase);
for(const key of ['tablas','columnas','indices','relaciones'])esquema[key].push(...esquemaCompuestos[key]);
const company={estado:'unica',idempresa:'0000000001'};
test('primera instalación sin producto prueba exige confirmación fiscal, no artículos ficticios',()=>{
 const s=Inicio.estadoInicial({empresa:company,referencias:[],unidades:[{idunidad:'ACTIVIDAD'}],modoPrecioRespaldo:true,productosCompatibles:true,modificadoresCompatibles:true});
 assert.equal(s.estado,'primera_configuracion');assert.equal(s.requiereProductoPrueba,false);assert.equal(s.unidadSugerida,'ACTIVIDAD');
 assert.equal(s.requiereConfirmacionFiscal,true);assert.equal(s.requiereConfirmacionModo,true);
 assert.throws(()=>Inicio.validarConfirmacionFiscal({},[]),/Confirma/);
 assert.throws(()=>Inicio.validarConfirmacionFiscal({confirmacionFiscalInicial:true},[]),/modo de precio/);
 assert.equal(Inicio.validarConfirmacionFiscal({confirmacionFiscalInicial:true,confirmacionModoPrecio:true},[]),true);
});
test('catálogo existente no se trata como instalación vacía',()=>{
 const s=Inicio.estadoInicial({empresa:company,referencias:[{idproducto:'02001'}],unidades:[{idunidad:'ACTIVIDAD'}],modoPrecioRespaldo:false});
 assert.equal(s.estado,'catalogo_existente');assert.equal(s.requiereConfirmacionFiscal,false);
});
test('cero empresas o cero unidades bloquean primer guardado',()=>{
 assert.equal(Inicio.estadoInicial({empresa:{estado:'sin_empresa'},referencias:[],unidades:[]}).estado,'empresa_pendiente');
 assert.equal(Inicio.estadoInicial({empresa:company,referencias:[],unidades:[]}).estado,'unidad_pendiente');
});
test('esquema SQL observado permite primer grupo sin grupo modelo',()=>{
 const cap=C.evaluar(esquema);assert.equal(cap.grupos.lista,true);assert.equal(cap.grupos.requiereModelo,false);
 const result=C.planGrupos(esquema,[],[{id:'nuevo',nombre:'HOT DOGS',clasificacion:2}]);
 assert.equal(result.grupos[0].idgrupo,'01');assert.equal(result.grupos[0].accion,'crear');
});
test('esquema compuesto comprobado compatible sin producto de prueba',()=>{
 assert.equal(PerfilCompuesto.compatible(esquema),true);
 assert.equal(PerfilCompuesto.referencia(esquema).defaults.forzarcaptura,1);
 assert.equal(PerfilCompuesto.referencia(esquema).defaults.maximomodificadores,1);
});
test('unidad inexistente, empresa no verificada y tasa inválida no crean un perfil fiscal',()=>{
 assert.throws(()=>require('../menu_perfil_sql').perfilAlternativo({idunidad:'OTRA',impuesto1:0,precioabierto:2},company.idempresa,[{idunidad:'ACTIVIDAD'}],[]),/unidad registrada/);
 assert.throws(()=>require('../menu_perfil_sql').perfilAlternativo({idunidad:'ACTIVIDAD',impuesto1:18,precioabierto:2},company.idempresa,[{idunidad:'ACTIVIDAD'}],[]),/impuestos/);
});
test('primer menú con 0 productos y 0 grupos prepara UN hot dog compuesto y 3 auxiliares (simulación sin INSERT)',()=>{
  const source={id:'principal',nombre:'HOT DOG SENCILLO',clave:'',idgrupo:'borrador:hotdogs',tipo:'con_opciones',precio:70,
    revisado:true,excluido:false,ingredientes:[],modificadores:[{nombre:'TIPO DE PAPAS',minimo:1,maximo:1,obligatorio:true,opciones:[
      {nombre:'SIN PAPAS',precio:0},{nombre:'PAPAS A LA FRANCESA',precio:30},{nombre:'PAPAS SAZONADAS',precio:35}]}]};
  const draft={productos:[source],grupos:[{id:'hotdogs',nombre:'HOT DOGS',clasificacion:2}]};
  const p=Compuestos.preparar(draft,[],[],[],esquema);
  assert.equal(p.input.productos.filter(x=>x.nombre==='HOT DOG SENCILLO').length,1);
  const fiscal=require('../menu_perfil_sql').perfilAlternativo({idunidad:'ACTIVIDAD',impuesto1:0,precioabierto:2},company.idempresa,[{idunidad:'ACTIVIDAD'}],[]);
  const plan=C.planMenu(esquema,[],[],{...p.input,servicios:{comedor:true,domicilio:true,rapido:true},configuracionConfirmada:true},fiscal);
  const result=Compuestos.completar(plan,p,[],[],[],PerfilCompuesto.referencia(esquema));
  Compuestos.validarPlanDeCompuestos(result,esquema);
  assert.equal(result.compuestos.length,1);
  assert.equal(result.productos.filter(x=>x.nombre==='HOT DOG SENCILLO').length,1);
  assert.deepEqual(result.compuestos[0].grupos[0].opciones.map(x=>x.precio),[0,30,35]);
  assert.equal(result.gruposDeModificadores.length,1);
  assert.equal(result.grupos.some(g=>g.nombre==='MODIFICADORES ALIMENTOS'),true);
  assert.equal(result.grupos.some(g=>g.nombre==='MODIFICADORES BEBIDAS'),false);
});
test('primer menú no usa nombre ni ID fijo de empresa o grupos del negocio ejemplo',()=>{
  const result=C.planGrupos(esquema,[],[{id:'lote',nombre:'BEBIDAS NATURALES',clasificacion:1}]);
  assert.equal(result.grupos[0].clasificacion,1);
  assert.equal(result.grupos[0].idgrupo,'01');
  assert.equal(Inicio.estadoInicial({empresa:{estado:'unica',idempresa:'CLIENTE123'},referencias:[],unidades:[{idunidad:'PIEZA'}]}).requiereProductoPrueba,false);
});

test('productos existentes sin referencia fiscal no se confunden con una base vacía',()=>{
 const r=Inicio.estadoInicial({empresa:company,referencias:[],totalProductos:14,unidades:[{idunidad:'ACTIVIDAD'}],modoPrecioRespaldo:true});
 assert.equal(r.limpio,false);assert.equal(r.estado,'catalogo_sin_referencia');assert.equal(r.requiereConfirmacionFiscal,true);
});
