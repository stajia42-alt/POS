'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Perfil=require('../menu_perfil_sql');
const ref={idproducto:'BASE',idempresa:'0000000001',idunidad:'PIEZA',precio:116,preciosinimpuestos:100,impuesto1:16,impuesto2:0,impuesto3:0,excentoimpuestos:0,precioabierto:2,bloqueado:0};
test('empresa única conserva ID real y no inventa 0000-001',()=>{
  assert.deepEqual(Perfil.perfilEmpresa([{idempresa:'EMPRESA-REAL'}]),{estado:'unica',idempresa:'EMPRESA-REAL'});
  assert.equal(Perfil.perfilEmpresa([]).estado,'sin_empresa');
  assert.equal(Perfil.perfilEmpresa([{idempresa:'A'},{idempresa:'B'}]).estado,'multiple');
});
test('referencia automática prioriza mismo grupo y la configuración comprobable frecuente',()=>{
 const refs=[{...ref,idproducto:'Z1',idgrupo:'11'}, {...ref,idproducto:'A1',idgrupo:'02',idunidad:'ACTIVIDAD'}, {...ref,idproducto:'C1',idgrupo:'11'}, {...ref,idproducto:'B1',idgrupo:'11',precio:1,preciosinimpuestos:9}];
 assert.equal(Perfil.seleccionarReferencia(refs,'02').idproducto,'A1');
 assert.equal(Perfil.seleccionarReferencia(refs,'11').idproducto,'C1');
});
test('configuración alternativa exige unidad y modo reales, tasa confirmada 0 8 16',()=>{
 const u=[{idunidad:'PIEZA'}],m=[2];
 assert.throws(()=>Perfil.perfilAlternativo({idunidad:'NO_EXISTE',impuesto1:16,precioabierto:2},'REAL',u,m),/unidad registrada/);
 assert.throws(()=>Perfil.perfilAlternativo({idunidad:'PIEZA',impuesto1:12,precioabierto:2},'REAL',u,m),/impuestos/);
 assert.throws(()=>Perfil.perfilAlternativo({idunidad:'PIEZA',impuesto1:16,precioabierto:3},'REAL',u,m),/modo de precio/);
 const r=Perfil.perfilAlternativo({idunidad:'PIEZA',impuesto1:8,precioabierto:2},'REAL',u,m);
 assert.equal(r.idempresa,'REAL');assert.equal(r.impuesto1,8);assert.equal(r.precio,108);assert.equal(r.preciosinimpuestos,100);
});

test('sin modos registrados se ofrece solo el modo 2 usado anteriormente por el proyecto',()=>{
 assert.deepEqual(Perfil.modosCompatibles([]),[2]);
 assert.deepEqual(Perfil.modosCompatibles([0,1]),[0,1]);
 const r=Perfil.perfilAlternativo({idunidad:'PIEZA',impuesto1:0,precioabierto:2},'REAL',[{idunidad:'PIEZA'}],[]);
 assert.equal(r.precioabierto,2);
 assert.throws(()=>Perfil.perfilAlternativo({idunidad:'PIEZA',impuesto1:0,precioabierto:3},'REAL',[{idunidad:'PIEZA'}],[]),/modo de precio/);
});
