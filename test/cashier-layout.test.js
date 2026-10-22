'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const html=read('public/index.html');
const ui=read('public/cashier-ui.js');

test('Corte con cuatro vistas y un solo resumen; campos de moneda sin duplicados',()=>{
 for(const id of ['cashier-overview','cashier-movements','cashier-reports','cashier-history','shiftPanel','shiftResult','declaredKeys','cashierShiftPill']){
  if(id==='declaredKeys')assert.ok(ui.includes('id="declaredKeys"'));else assert.ok(html.includes('id="'+id+'"'),id);
 }
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(ids.length,new Set(ids).size,'No debe haber IDs repetidos');
 assert.match(html,/data-cashier-tab="overview"/);
 assert.match(html,/data-cashier-tab="history"/);
});

test('Corte X no cierra la caja, corte Z requiere importes, cierre seguro y arqueo opcional',()=>{
 assert.match(ui,/api\('\/api\/shift\/x'\)/);
 assert.match(ui,/api\('\/api\/shift\/close'/);
 assert.match(ui,/declared_cents:declared,declared_usd_cents:declaredUsd/);
 assert.match(ui,/if\(cashierBusy\)return;/);
 assert.match(ui,/diferencia de efectivo/);
 assert.match(ui,/denominationDraft=null/);
 assert.match(ui,/Contar por billetes y monedas/);
});

test('Cerrar usuario no cierra turno, explica consecuencia y oculta los datos',()=>{
 assert.match(ui,/continúa <strong>ABIERTO/);
 assert.match(ui,/api\/auth\/logout/);
 assert.match(ui,/session-locked/);
 const logoutImplementation=ui.slice(ui.indexOf('async function finishLogout()'),ui.indexOf('logout = async function'));
 assert.doesNotMatch(logoutImplementation,/api\/shift\/close/);
});

test('Tarifas avanzadas no aparece siempre en pantalla de caja',()=>{
 const ratesStart=html.indexOf('id="rates"'),extras=html.indexOf('id="professionalExtras"'),settings=html.indexOf('id="settings"');
 assert.ok(ratesStart>0 && extras>ratesStart && settings>extras);
 assert.ok(html.includes('class="advanced-panel"'));
});

test('Interfaz y escáner comparten las mismas rutas sin tocar generación de entradas',()=>{
 assert.match(read('lib/operations.js'),/await printEntry\(cfg,result.code,result.entry_at\)/);
 assert.match(read('public/desktop-ui.js'),/lookup\(\)/);
 assert.match(html,/id="code"/);
 assert.match(html,/id="entryBtn"/);
 assert.match(read('package.json'),/"public\/\*\*\/\*"/);
});

test('JavaScript de la caja, interfaz previa y escáner pasa sintaxis Node',()=>{
 for(const f of ['public/cashier-ui.js','public/professional.js','public/desktop-ui.js','public/preview.js']) {
  assert.doesNotThrow(()=>execFileSync(process.execPath,['--check',path.join(root,f)],{stdio:'pipe'}),f);
 }
});
