'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const {interpretarMenu,grupoCoincidente,precio}=require('../menu_contexto');
const example=['DUMPLINGS','6 piezas','10 piezas','Cerdo con napa','$128 / $198','Cerdo con cebollino','$128 / $198','Cerdo hongo camarón huevo','$128 / $198','Res apio','$148 / $218','Hervidos / Fritos en sartén'];
test('YUAN: cuatro dumplings, nombres completos y Opción A con precios por cantidad',()=>{
 const r=interpretarMenu(example,[{idgrupo:'09',descripcion:'Dumplings'}]);
 assert.equal(r.productos.length,4);assert.equal(r.pendientes.length,0);
 assert.equal(r.productos[0].nombre,'Dumplings cerdo con napa');assert.equal(r.productos[3].nombre,'Dumplings res apio');
 for(const [i,p] of r.productos.entries()){
  assert.equal(p.precio,0);assert.equal(p.idgrupo,'09');assert.equal(p.revisado,false);
  const m=p.modificadores[0];assert.equal(m.obligatorio,true);assert.equal(m.minimo,1);assert.equal(m.maximo,1);
  assert.deepEqual(m.opciones.map(x=>x.nombre),['6 piezas','10 piezas']);
  assert.deepEqual(m.opciones.map(x=>x.precio),i===3?[148,218]:[128,198]);
  assert.deepEqual(p.modificadores[1].opciones.map(x=>x.nombre),['Hervidos','Fritos en sartén']);
  assert.ok(p.modificadores[1].opciones.every(x=>x.precio===null));
 }
});
test('OCR con posiciones: filas y columnas conservan cantidades, precios y evidencia',()=>{
 const b=(texto,x,y,width=160,confianza=.96)=>({texto,caja:[x,y,x+width,y+20],confianza});
 const r=interpretarMenu([b('DUMPLINGS',0,0),b('10 piezas',520,40),b('6 piezas',380,40),b('$198',520,80,50),b('Cerdo con napa',0,80),b('$128',380,80,50,.2)]);
 assert.equal(r.productos.length,1);assert.deepEqual(r.productos[0].modificadores[0].opciones.map(o=>o.precio),[128,198]);
 assert.equal(r.productos[0].confianza,'baja');assert.equal(r.bloques.length,6);assert.equal(r.productos[0].evidencia.length,6);
});
test('no se recortan 100 productos ni nombres largos',()=>{
 const name='Platillo '+ 'extra '.repeat(20);
 const r=interpretarMenu([...Array.from({length:100},(_,i)=>'Platillo '+i+' $128'),name+'$150']);
 assert.equal(r.productos.length,101);assert.ok(r.productos.at(-1).nombre.length>60);assert.match(r.productos.at(-1).revision.join(' '),/no se recortó/);
});
test('arroz frito conserva contexto; ramen ambiguo no inventa caldo ni proteínas',()=>{
 const r=interpretarMenu(['ARROZ FRITO','Chashu $239','Camarón $239','Carne $239','Pollo $219','Vegetales $219','RAMEN / UDON','Pollo $219']);
 assert.deepEqual(r.productos.slice(0,5).map(p=>p.precio),[239,239,239,219,219]);
 assert.equal(r.productos[0].nombre,'Arroz frito chashu');assert.equal(r.productos[5].modificadores.length,0);assert.match(r.productos[5].revision.join(' '),/caldo/);
});
test('precios múltiples sin presentaciones permanecen sin asignación inventada',()=>{
 const r=interpretarMenu(['DUMPLINGS','Cerdo con napa $128 / $198']);
 assert.equal(r.productos[0].precio,null);assert.equal(r.productos[0].modificadores.length,0);assert.deepEqual(r.productos[0].precios_detectados,[128,198]);
});
test('nombres y precios ambiguos permanecen visibles en la evidencia',()=>{
 const r=interpretarMenu(['Pollo','Cerdo','$128','$198','Texto ilegible']);
 assert.equal(r.productos.length,0);assert.equal(r.pendientes.length,5);assert.equal(r.resumen.sinAsignar,5);
});
test('las páginas y los encabezados no heredan productos ni precios anteriores',()=>{
 const r=interpretarMenu([{texto:'DUMPLINGS',pagina:0},{texto:'Cerdo con napa',pagina:0},{texto:'$128',pagina:1}]);
 assert.equal(r.productos.length,0);assert.equal(r.pendientes.length,2);
 const s=interpretarMenu(['DUMPLINGS','Cerdo con napa','BEBIDAS','$128']);assert.equal(s.productos.length,0);
});
test('líneas vacías no desplazan evidencia y traducción conserva el español',()=>{
 const r=interpretarMenu(['ENTRADAS','','Cerdo con napa','Pork with napa','$128']);
 assert.equal(r.productos[0].nombre,'Cerdo con napa');assert.deepEqual(r.productos[0].evidencia.sort(),[0,2,3,4]);
 assert.equal(r.bloques[3].uso[0],'posible_traduccion');
});
test('grupos únicos, acentos, alias y coincidencias ambiguas',()=>{
 assert.equal(grupoCoincidente('Bebidas',[{idgrupo:'01',descripcion:'DRINKS'}]).idgrupo,'01');
 assert.equal(grupoCoincidente('Cafe',[{idgrupo:'01',descripcion:'Café'},{idgrupo:'02',descripcion:'CAFE'}]).estado,'ambiguo');
 assert.equal(grupoCoincidente('Refrescos',[]).estado,'faltante');
 const r=interpretarMenu(['BEBIDAS','REFRESCOS','Cola $30']);assert.equal(r.productos[0].categoria_padre,'Bebidas');assert.equal(r.productos[0].grupo_detectado,'Refrescos');
});
test('repetidos y precios cero se conservan, nunca borrados silenciosamente',()=>{
 const r=interpretarMenu(['Salsa $0','Salsa $0']);assert.equal(r.productos.length,2);assert.equal(r.productos[1].duplicado_de,'p1');assert.equal(r.productos[0].precio,0);
});
test('importes decimales válidos no sufren comparación de coma flotante',()=>{
 assert.equal(precio('19.99'),19.99);assert.equal(precio(0.29),.29);assert.equal(precio('128,50'),128.5);
 for(const value of [null,'',true,'-2','NaN',Infinity,'1.234','1e2'])assert.equal(precio(value),null);
 assert.equal(interpretarMenu(['Agua $ 19.99']).productos[0].precio,19.99);
});
test('demasiadas líneas provocan error visible, nunca truncamiento',()=>assert.throws(()=>interpretarMenu(Array(5001).fill('a')),/no se recortó/));
test('ingredientes explícitos se adjuntan; palabras sueltas no crean productos',()=>{
 const r=interpretarMenu(['Ramen $219','Ingredientes: pollo, cebolla','picante','opcional']);assert.equal(r.productos.length,1);assert.deepEqual(r.productos[0].ingredientes,['pollo, cebolla']);assert.equal(r.pendientes.length,2);
});
test('dos columnas independientes no fusionan sus nombres',()=>{
 const r=interpretarMenu([{texto:'Pollo $219',caja:[0,0,180,20]},{texto:'Agua $30',caja:[400,0,550,20]}]);
 assert.equal(r.productos.length,2);assert.equal(r.incidencias.length,1);assert.deepEqual(r.productos.map(p=>p.nombre),['Pollo','Agua']);
});
test('regresión del texto OCR YUAN: traducciones posteriores y precio por cuatro piezas',()=>{
 const r=interpretarMenu(['YUAN','清爽','ENTRADAS','前菜','Appetizers','Ensalada de pepino','$98','Cucumber salad','Ensalada de tiras de papa','$98','Shredded potato salad','Ensalada spring mixta','$98','Spring salad mix','Wontones fritos con queso','$90 / 4 pz','Fried Chesse wontones','Rollo primavera','$88 / 4 pz','Spring roll']);
 assert.deepEqual(r.productos.map(p=>p.precio),[98,98,98,90,88]);
 assert.equal(r.productos[3].presentacion,'4 pz');assert.equal(r.productos[4].nombre,'Rollo primavera');assert.equal(r.productos[4].traduccion,'Spring roll');
 assert.deepEqual([...new Set(r.categorias.map(c=>c.nombre))],['Entradas']);
 assert.ok(r.bloques[0].uso.includes('encabezado_menu'));
});
test('traducciones entre nombre y precio no descartan el plato español',()=>{
 const r=interpretarMenu(['ENTRADAS','Ensalada de pepino','Cucumber salad','$98','Rollo primavera','春卷','Spring roll','$88 / 4 pz','Wontones fritos con queso','Fried cheese wontones','$90 / 4 pz']);
 assert.deepEqual(r.productos.map(p=>p.nombre),['Ensalada de pepino','Rollo primavera','Wontones fritos con queso']);
 assert.deepEqual(r.productos.map(p=>p.precio),[98,88,90]);assert.equal(r.pendientes.length,0);
});
test('dos nombres posibles y un precio quedan visibles con aviso',()=>{
 const r=interpretarMenu(['ENTRADAS','Cerdo con napa','Res apio','$128']);
 assert.equal(r.productos.length,0);assert.equal(r.resumen.preciosSinProducto,1);assert.equal(r.pendientes.length,3);
});
test('nombre en mayúsculas seguido de precio no se convierte en categoría',()=>{
 const r=interpretarMenu(['YUAN','ENTRADAS','ENSALADA DE PEPINO','$98']);
 assert.equal(r.productos.length,1);assert.equal(r.productos[0].nombre,'ENSALADA DE PEPINO');assert.deepEqual(r.categorias.map(c=>c.nombre),['Entradas']);
});
test('nombre español y traducción con precio permanecen en un mismo producto',()=>{
 const r=interpretarMenu(['ENTRADAS','Rollo primavera','Spring roll $88']);assert.equal(r.productos.length,1);assert.equal(r.productos[0].nombre,'Rollo primavera');assert.equal(r.productos[0].precio,88);
});
test('precios con miles y decimales se conservan sin confundir coma decimal',()=>{
 const r=interpretarMenu(['Parrillada $1,280.50','Combo $2,000','Agua $28,50']);
 assert.deepEqual(r.productos.map(p=>p.precio),[1280.5,2000,28.5]);assert.equal(r.pendientes.length,0);
 assert.equal(precio('1,28,0'),null);
});
test('preparaciones sin columnas de cantidad producen un producto con opciones',()=>{
 const p=interpretarMenu(['DUMPLINGS','Cerdo $128','Hervidos / Fritos en sartén']).productos[0];
 assert.equal(p.tipo,'con_opciones');assert.equal(p.precio,128);assert.equal(p.modificadores[0].opciones[0].precio,null);
});
