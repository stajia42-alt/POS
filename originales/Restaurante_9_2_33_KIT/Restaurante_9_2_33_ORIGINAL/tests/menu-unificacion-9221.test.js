'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fromStructured}=require('../menu_captura_inteligente');
const {consolidar}=require('../public/menu-consolidar');
const valid=require('../public/menu-proyecto');
const rows=['HOT DOGS','HOT DOG SENCILLO SIN PAPAS $70','HOT DOG SENCILLO CON PAPAS $100','HOT DOG SENCILLO CON PAPAS SAZONADAS $105'];
const products=[{nombre:'HOT DOG SENCILLO SIN PAPAS',precio:70,categoria:'HOT DOGS',lineas:[1]},
 {nombre:'HOT DOG SENCILLO CON PAPAS',precio:100,categoria:'HOT DOGS',lineas:[2]},
 {nombre:'HOT DOG SENCILLO CON PAPAS SAZONADAS',precio:105,categoria:'HOT DOGS',lineas:[3]}];
test('regresión del usuario: tres entradas Gemini se convierten en UN hot dog compuesto',()=>{
 const result=fromStructured({lineas:rows,categorias:[{nombre:'HOT DOGS',lineas:[0]}],productos:products},[]);
 assert.equal(result.productos.length,1);
 const p=result.productos[0];
 assert.equal(p.nombre,'HOT DOG SENCILLO');assert.equal(p.precio,70);
 assert.equal(p.tipo,'con_opciones');assert.equal(p.modificadores[0].obligatorio,true);
 assert.deepEqual(p.modificadores[0].opciones.map(o=>o.precio),[0,30,35]);
 assert.equal(p.modificadores[0].maximo,1);
});
test('un borrador anterior se puede reparar sin tocar SQL ni tocar otros platos',()=>{
 const draft=products.map((p,i)=>({...p,id:String(i),tipo:'independiente',modificadores:[],ingredientes:[],revision:[],foto:'f1',grupo_detectado:'HOT DOGS',idgrupo:'',revisado:false}));
 const extras={id:'4',nombre:'Nachos sencillos',precio:70,tipo:'independiente',modificadores:[],foto:'f1'};
 const grouped=consolidar([...draft,extras]);
 assert.equal(grouped.cambios,1);assert.equal(grouped.productos.length,2);
 assert.equal(grouped.productos[0].nombre,'HOT DOG SENCILLO');assert.equal(grouped.productos[1].nombre,'Nachos sencillos');
 assert.equal(grouped.productos[0].tipo,'con_opciones');
});
test('sin diferencia de precios verificable no se completa un valor por suposición',()=>{
 const change=products.map((p,i)=>({...p,id:String(i),tipo:'independiente',modificadores:[],ingredientes:[],revision:[],foto:'f1'}));
 change[2].precio=null;
 const d=consolidar(change);assert.equal(d.productos.length,1);
 assert.equal(d.productos[0].modificadores[0].opciones[2].precio,null);
 assert.ok(valid.validarProducto(d.productos[0],true).some(x=>x.includes('precio')));
});
test('dos opciones semánticamente repetidas no se importan accidentalmente como independientes',()=>{
 const change=products.map((p,i)=>({...p,id:String(i),tipo:'independiente',modificadores:[],ingredientes:[],revision:[],foto:'f1'}));
 change[2].nombre='HOT DOG SENCILLO PAPAS A LA FRANCESA';
 const r=consolidar(change);assert.equal(r.ambiguos,1);
 assert.equal(r.productos.length,3);assert.ok(r.productos.every(p=>p.tipo==='variante'));
});
test('variantes de otros menús no se convierten en papas',()=>{
 const d=consolidar([{nombre:'Cafe mediano',precio:40},{nombre:'Cafe grande',precio:60}]);
 assert.equal(d.cambios,0);assert.equal(d.productos.length,2);
});
test('precios numéricos de otra categoría NO se llaman papas por defecto',()=>{
 const p={nombre:'Pizza especial',precio:90,categoria:'PIZZAS',lineas:[1],precios:[90,120,155]};
 const d=fromStructured({lineas:['PIZZAS','Pizza especial $90 $120 $155'],categorias:[],productos:[p]},[]);
 assert.equal(d.productos.length,3);
 assert.ok(d.productos.every(x=>!x.nombre.toLowerCase().includes('papas')));
});
test('importe detectado fuera de la evidencia bloquea el compuesto en vez de inventar recargo',()=>{
 const first={...products[0],id:'1',tipo:'independiente',modificadores:[],revision:[],ingredientes:[],foto:'f'};
 const second={...products[1],id:'2',tipo:'independiente',modificadores:[],revision:['Precio no verificable junto a este producto: confirmar en la fotografía.'],ingredientes:[],foto:'f'};
 const g=consolidar([first,second]);
 assert.equal(g.cambios,1);assert.equal(g.productos[0].tipo,'con_opciones');
 assert.equal(g.productos[0].modificadores[0].opciones[1].precio,null);
 assert.ok(valid.validarProducto(g.productos[0],true).length);
});
