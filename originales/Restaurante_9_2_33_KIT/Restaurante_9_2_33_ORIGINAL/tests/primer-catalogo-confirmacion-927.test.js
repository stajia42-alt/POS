'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../public/menu-sql.js'),'utf8');
test('la confirmación fiscal no depende de una casilla escondida',()=>{
  assert.doesNotMatch(source,/confirmarFiscalInicial/);
  assert.match(source,/confirmacionFiscalInicial:true,confirmacionModoPrecio:true/);
  assert.match(source,/Predeterminado: ACTIVIDAD · Exento \(0%\)/);
});
test('no se habilita guardar si no se han seleccionado unidad e impuestos',()=>{
  assert.match(source,/!\$\('importUnit'\)\?\.value/);
  assert.match(source,/\$\('importTax'\)\?\.value===''/);
});
test('la confirmación final del lote se conserva después de preparar',()=>{
  assert.match(source,/showPlan\(d\)/);
  assert.match(source,/confirmSql/);
});
