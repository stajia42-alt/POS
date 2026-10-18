'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const basedir=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(basedir,'public','menu.html'),'utf8');
const client=fs.readFileSync(path.join(basedir,'public','menu.js'),'utf8');
const sql=fs.readFileSync(path.join(basedir,'public','menu-sql.js'),'utf8');
const bundled=require('../interfaz');
test('acciones de menú nuevo, unificación y creación independiente se incluyen en paquete Windows',()=>{
 for(const id of ['newMenu','consolidateVariants','goGroupsFirst','cleanDraftGroups','createGroups']){
   assert.match(html,new RegExp('id="'+id+'"'));
   assert.match(client+sql,new RegExp('\\$\\(\''+id+'\'\\)'));
 }
 assert.ok(bundled.menuCliente.indexOf('MenuConsolidar=api')>=0);
 assert.ok(bundled.menuCliente.indexOf('MenuConsolidar.consolidar')>=0);
 assert.ok(bundled.menu.includes('id="newMenu"'));
});
test('limpiar menú conserva SQL: no hay instrucciones de DELETE, DROP ni ALTER desde la acción',()=>{
 const block=client.split("$('newMenu').onclick=()=>{")[1].split("$('cleanDraftGroups').onclick")[0];
 assert.ok(block.includes('backup()'));
 assert.ok(block.includes('gruposPreparados:[]'));
 assert.doesNotMatch(block,/\/api\/menu-admin|DELETE FROM|DROP TABLE|ALTER TABLE/i);
});
test('creación de grupos tiene ruta independiente sin requerir un lote de productos',()=>{
 assert.ok(sql.includes("prepararSQL('grupos',{grupos:project.gruposPreparados.map"));
 assert.ok(sql.includes("tipo==='grupos'?'grupos/crear'"));
});
