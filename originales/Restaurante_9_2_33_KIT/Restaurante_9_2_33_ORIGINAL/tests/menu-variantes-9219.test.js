'use strict';
const t=require('node:test'),a=require('node:assert/strict');
const parse=require('../menu_captura_inteligente');
const precios=require('../menu_precios_multiples');
const {validarProyecto}=require('../public/menu-proyecto');
const group='HAMBURGUESAS';
function entrada(lineas,producto){return {lineas,categorias:[{nombre:group,lineas:[0]}],productos:[producto]};}
t('3 importes visibles producen 1 producto compuesto, con recargos propios',()=>{
 const rows=['HAMBURGUESAS','SIN PAPAS','PAPAS A LA FRANCESA','PAPAS SAZONADAS','Pizza burger $140 $170 $175','Carne de res y pepperoni'];
 const d=entrada(rows,{nombre:'Pizza burger',precio:140,categoria:group,descripcion:'Carne de res y pepperoni',lineas:[4,5]});
 const r=parse.fromStructured(d,[]);
 a.equal(r.productos.length,1);
 a.equal(r.productos[0].nombre,'Pizza burger');a.equal(r.productos[0].precio,140);
 a.equal(r.productos[0].tipo,'con_opciones');
 a.deepEqual(r.productos[0].modificadores[0].opciones.map(o=>o.precio),[0,30,35]);
 a.equal(r.productos[0].modificadores[0].obligatorio,true);
 const project={version:1,productos:r.productos.map((p,i)=>({...p,id:'sku'+i,foto:'f',clave:'00000'+i,excluido:false})),fotografias:[{id:'f',nombre:'menu.jpg',estado:'lista',resultado:r}],gruposPreparados:[]};
 a.doesNotThrow(()=>validarProyecto(project));
});
t('cada platillo respeta sus propios tres precios, sin incremento global',()=>{
 const lineas=['HAMBURGUESAS','SIN PAPAS','PAPAS A LA FRANCESA','PAPAS SAZONADAS',
 'Cheese burger doble $170 $200 $205','Carne y queso', 'Guacamole ranchera $150 $180 $185'];
 const productos=[{nombre:'Cheese burger doble',precio:170,categoria:group,lineas:[4,5]},
   {nombre:'Guacamole ranchera',precio:150,categoria:group,lineas:[6]}];
 const r=parse.fromStructured({...entrada(lineas,null),productos},[]);
 a.deepEqual(r.productos.map(p=>p.precio),[170,150]);
 a.deepEqual(r.productos.map(p=>p.modificadores[0].opciones.map(o=>o.precio)),[[0,30,35],[0,30,35]]);
});
t('alternativas 2 o 4 con precio literal propio, sin inventar',()=>{
 const lineas=['PIZZAS','Pizza familiar $200 $270 $320 $390','Masa a elegir'];
 const prod={nombre:'Pizza familiar',precio:null,categoria:'PIZZAS',lineas:[1],presentaciones:[
 {nombre:'Individual',precio:200,lineas:[1]},{nombre:'Mediana',precio:270,lineas:[1]},
 {nombre:'Grande',precio:320,lineas:[1]},{nombre:'Familiar',precio:390,lineas:[1]}]};
 const r=parse.fromStructured({...entrada(lineas,prod),productos:[prod]},[]);
 a.deepEqual(r.productos.map(p=>p.precio),[200,270,320,390]);
 a.ok(r.productos.every(p=>!p.necesitaConfirmacion || p.precio!==null));
});
t('cuando falta importe no se aplica aumento estándar ni se inventa',()=>{
 const lineas=['HAMBURGUESAS','Hamburguesa $100','Sin papas / con papas $130'];
 const prod={nombre:'Hamburguesa',precio:100,categoria:'HAMBURGUESAS',lineas:[1,2],presentaciones:[
 {nombre:'Sin papas',precio:100,lineas:[1]},{nombre:'Papas francesas',precio:130,lineas:[2]},{nombre:'Papas sazonadas',precio:135,lineas:[2]}]};
 const r=parse.fromStructured({...entrada(lineas,prod),productos:[prod]},[]);
 a.equal(r.productos.length,1);
 a.equal(r.productos[0].tipo,'con_opciones');
 a.deepEqual(r.productos[0].modificadores[0].opciones.map(o=>o.precio),[0,30,null]);
 a.equal(r.productos[0].necesitaConfirmacion,true);
});
t('sin tres encabezados, tres números sueltos no crean presentaciones',()=>{
 const lineas=['OTROS','Producto $100 $130 $135'];
 const r=parse.fromStructured(entrada(lineas,{nombre:'Producto',precio:100,categoria:'OTROS',lineas:[1]}),[]);
 a.equal(r.productos.length,1);
});
