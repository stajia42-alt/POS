'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { start } = require('../src/server');
const { Store } = require('../src/database');

async function fixture(t, { material=true, initial='0', opening='1000', shift=true }={}) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mgv-test-')), service=await start({port:0,dataDir:dir});
 t.after(async()=>{await service.stop();fs.rmSync(dir,{recursive:true,force:true});});
 function client() {
  return { cookie:'', nonce:'', async req(url,method='GET',body,headers={}) {
   const response=await fetch(service.url+url,{method,headers:{'Content-Type':'application/json',Cookie:this.cookie,'X-CSRF-Token':this.nonce,...headers},body:body===undefined?undefined:JSON.stringify(body)});
   if(response.headers.get('set-cookie'))this.cookie=response.headers.get('set-cookie').split(';')[0];
   const type=response.headers.get('content-type')||'';
   const data=type.includes('json')?await response.json():Buffer.from(await response.arrayBuffer());
   if(data.nonce)this.nonce=data.nonce;return {status:response.status,data,headers:response.headers};
  }};
 }
 const admin=client();await admin.req('/api/session');
 const created=await admin.req('/api/setup','POST',{name:'Ana',password:'Clave-Larga-123',business:'Metales de prueba'});assert.equal(created.status,201);
 let mid;
 if(material){const r=await admin.req('/api/materials','POST',{name:'Cobre',category:'Metal',buyPrice:'5',salePrice:'10',initialKg:initial,minKg:'1'});assert.equal(r.status,201);mid=r.data.id;}
 if(shift)assert.equal((await admin.req('/api/shifts/open','POST',{openingMxn:opening,openingUsd:'0',rate:'20'})).status,201);
 const purchase=(items=[{materialId:mid,grossKg:'10',tareKg:'0',price:'5'}],extra={})=>({requestId:crypto.randomUUID(),kind:'purchase',payment:'cash',items,...extra});
 const sale=(items=[{materialId:mid,grossKg:'2',tareKg:'0',price:'10'}],extra={})=>({requestId:crypto.randomUUID(),kind:'sale',payment:'cash',tender:'100',items,...extra});
 const state=async()=> (await admin.req('/api/state')).data;
 return {service,dir,admin,client,mid,purchase,sale,state};
}
test('configuración sin contraseña predeterminada; sesión, nonce y cookie HttpOnly',async t=>{
 const f=await fixture(t,{shift:false});const anonymous=f.client();
 assert.equal((await anonymous.req('/api/state')).status,401);
 assert.equal((await anonymous.req('/api/setup','POST',{})).status,403);
 assert.equal((await f.admin.req('/api/setup','POST',{})).status,403);
 const ses=await f.admin.req('/api/session');assert.equal(ses.data.user.role,'admin');assert.equal(ses.data.needsSetup,false);
 const u=f.service.store.get('SELECT * FROM users');assert.notEqual(u.hash,'Clave-Larga-123');assert.equal(u.hash.length,128);
 const login=f.client();await login.req('/api/session');const r=await login.req('/api/login','POST',{name:'ana',password:'Clave-Larga-123'});assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
});
test('bloqueo de cinco intentos fallidos de contraseña',async t=>{
 const f=await fixture(t);const c=f.client();await c.req('/api/session');
 for(let i=0;i<5;i++)assert.equal((await c.req('/api/login','POST',{name:'Ana',password:'incorrecta'})).status,401);
 assert.equal((await c.req('/api/login','POST',{name:'Ana',password:'Clave-Larga-123'})).status,429);
});
test('seguridad local: origen, Host, proxy, CSRF y CSP',async t=>{
 const f=await fixture(t);
 assert.equal((await f.admin.req('/api/state','GET',undefined,{Origin:'https://evil.example'})).status,403);
 const rawHostStatus = await new Promise((resolve,reject)=>{const req=require('node:http').get(f.service.url+'/api/state',{headers:{Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);});
 assert.equal(rawHostStatus,403);
 assert.equal((await f.admin.req('/api/state','GET',undefined,{'X-Forwarded-For':'1.2.3.4'})).status,403);
 assert.equal((await f.admin.req('/api/cash','POST',{}, {'X-CSRF-Token':'bad'})).status,403);
 const r=await f.admin.req('/api/health');assert.match(r.headers.get('content-security-policy'),/script-src 'self'/);
});
test('requiere turno abierto para operar',async t=>{
 const f=await fixture(t,{shift:false});assert.equal((await f.admin.req('/api/transactions','POST',f.purchase())).status,409);assert.equal((await f.state()).transactions.length,0);
});
test('compra en efectivo reduce caja, aumenta stock y conserva nombre y precio histórico',async t=>{
 const f=await fixture(t);const r=await f.admin.req('/api/transactions','POST',f.purchase());assert.equal(r.status,201);assert.equal(r.data.total_cents,5000);
 let s=await f.state();assert.equal(s.shift.expected.mxn,95000);assert.equal(s.materials[0].stock_g,10000);assert.equal(s.materials[0].value_cents,5000);
 await f.admin.req('/api/materials/'+f.mid,'PUT',{name:'Cobre renombrado',category:'Metal',buyPrice:'8',salePrice:'15',minKg:'1',active:true});
 const ticket=(await f.admin.req('/api/tickets/'+r.data.id)).data;assert.equal(ticket.items[0].material_name,'Cobre');assert.equal(ticket.items[0].price_cents,500);assert.match(ticket.text,/Cobre/);
});
test('venta con bruto y tara calcula neto, cambio, costo promedio y margen',async t=>{
 const f=await fixture(t);await f.admin.req('/api/transactions','POST',f.purchase());
 const r=await f.admin.req('/api/transactions','POST',f.sale([{materialId:f.mid,grossKg:'3.125',tareKg:'0.125',price:'10'}],{tender:'50'}));
 assert.equal(r.status,201);assert.equal(r.data.total_cents,3000);assert.equal(r.data.change_cents,2000);assert.equal(r.data.cost_cents,1500);
 const s=await f.state();assert.equal(s.shift.expected.mxn,98000);assert.equal(s.materials[0].stock_g,7000);
 const report=(await f.admin.req('/api/report')).data;assert.equal(report.margin,1500);assert.equal(report.cost,1500);assert.equal(report.sales,3000);
});
test('costo promedio ponderado de dos compras y venta',async t=>{
 const f=await fixture(t);await f.admin.req('/api/transactions','POST',f.purchase());await f.admin.req('/api/transactions','POST',f.purchase([{materialId:f.mid,grossKg:'10',price:'7'}]));
 const r=await f.admin.req('/api/transactions','POST',f.sale());assert.equal(r.data.cost_cents,1200);assert.equal((await f.state()).materials[0].value_cents,10800);
});
test('rollback completo cuando dos renglones exceden stock agregado',async t=>{
 const f=await fixture(t,{initial:'3'});const before=await f.state();
 const r=await f.admin.req('/api/transactions','POST',f.sale([{materialId:f.mid,grossKg:'2',price:'10'},{materialId:f.mid,grossKg:'2',price:'10'}]));assert.equal(r.status,409);
 const after=await f.state();assert.deepEqual(after.materials,before.materials);assert.equal(after.transactions.length,0);assert.equal(after.cashMoves.length,0);
 assert.equal(f.service.store.get('SELECT COUNT(*) n FROM stock_moves').n,1);
});
test('efectivo insuficiente cancela también compra e inventario',async t=>{
 const f=await fixture(t,{opening:'1'});assert.equal((await f.admin.req('/api/transactions','POST',f.purchase())).status,409);
 const s=await f.state();assert.equal(s.materials[0].stock_g,0);assert.equal(s.transactions.length,0);assert.equal(s.shift.expected.mxn,100);
});
test('redondeo exacto a centavos con pesos de tres decimales',async t=>{
 const f=await fixture(t);const r=await f.admin.req('/api/transactions','POST',f.purchase([{materialId:f.mid,grossKg:'0.001',price:'5'}]));assert.equal(r.status,201);assert.equal(r.data.total_cents,1);
 assert.equal((await f.admin.req('/api/transactions','POST',f.purchase([{materialId:f.mid,grossKg:'0.0001',price:'5'}]))).status,400);
 assert.equal((await f.admin.req('/api/transactions','POST',f.purchase([{materialId:f.mid,grossKg:'1e3',price:'5'}]))).status,400);
 assert.equal((await f.admin.req('/api/transactions','POST',f.purchase([{materialId:f.mid,grossKg:'1',tareKg:'2',price:'5'}]))).status,400);
});
test('idempotencia evita doble cobro con solicitudes concurrentes y rechaza cambios',async t=>{
 const f=await fixture(t),body=f.purchase();const r=await Promise.all([f.admin.req('/api/transactions','POST',body),f.admin.req('/api/transactions','POST',body)]);
 assert.equal(r[0].data.id,r[1].data.id);const s=await f.state();assert.equal(s.transactions.length,1);assert.equal(s.shift.expected.mxn,95000);
 assert.equal((await f.admin.req('/api/transactions','POST',{...body,note:'otro'})).status,409);
});
test('USD conserva cambio en MXN, dólares en caja y reversa exacta',async t=>{
 const f=await fixture(t,{initial:'10'});const r=await f.admin.req('/api/transactions','POST',f.sale(undefined,{payment:'usd',tender:'2'}));assert.equal(r.status,201);assert.equal(r.data.change_cents,2000);
 let s=await f.state();assert.equal(s.shift.expected.mxn,98000);assert.equal(s.shift.expected.usd,200);
 assert.equal((await f.admin.req('/api/transactions/'+r.data.id+'/void','POST',{reason:'Error de captura'})).status,200);
 s=await f.state();assert.equal(s.shift.expected.mxn,100000);assert.equal(s.shift.expected.usd,0);assert.equal(s.materials[0].stock_g,10000);
 assert.equal((await f.admin.req('/api/report')).data.sales,0);
});
test('transferencias y tarjeta no afectan efectivo',async t=>{
 const f=await fixture(t);assert.equal((await f.admin.req('/api/transactions','POST',f.purchase(undefined,{payment:'transfer'}))).status,201);
 await f.admin.req('/api/transactions','POST',f.sale(undefined,{payment:'card'}));assert.equal((await f.state()).shift.expected.mxn,100000);
});
test('pago incompleto y material inactivo no generan operación',async t=>{
 const f=await fixture(t,{initial:'10'});assert.equal((await f.admin.req('/api/transactions','POST',f.sale(undefined,{tender:'1'}))).status,400);
 await f.admin.req('/api/materials/'+f.mid,'PUT',{name:'Cobre',category:'Metal',buyPrice:'5',salePrice:'10',minKg:'0',active:false});
 assert.equal((await f.admin.req('/api/transactions','POST',f.sale())).status,400);assert.equal((await f.state()).transactions.length,0);
});
test('cancelación de compra se impide si el material fue consumido',async t=>{
 const f=await fixture(t);const p=await f.admin.req('/api/transactions','POST',f.purchase());await f.admin.req('/api/transactions','POST',f.sale());
 assert.equal((await f.admin.req('/api/transactions/'+p.data.id+'/void','POST',{reason:'Revertir'})).status,409);
 const s=await f.state();assert.equal(s.materials[0].stock_g,8000);assert.equal(s.transactions.find(x=>x.id===p.data.id).status,'posted');
});
test('ajustes dejan kardex, motivo obligatorio y no permiten saldos negativos',async t=>{
 const f=await fixture(t,{initial:'10'});assert.equal((await f.admin.req('/api/stock/adjust','POST',{materialId:f.mid,deltaKg:'-1.25',reason:'Merma'})).status,200);
 assert.equal((await f.state()).materials[0].stock_g,8750);assert.equal((await f.admin.req('/api/stock/adjust','POST',{materialId:f.mid,deltaKg:'-100',reason:'Error'})).status,409);
 assert.equal((await f.admin.req('/api/stock/adjust','POST',{materialId:f.mid,deltaKg:'1',reason:''})).status,400);
 const rows=(await f.admin.req('/api/stock/moves?materialId='+f.mid)).data;assert.equal(rows[0].type,'adjustment');assert.equal(rows[0].after_g,8750);
});
test('gastos, entrada y retiro; cierre y respaldo automático con diferencias',async t=>{
 const f=await fixture(t);await f.admin.req('/api/transactions','POST',f.purchase());
 for(const body of [{type:'entry',amount:'100',reason:'Fondo extra'},{type:'withdrawal',amount:'50',reason:'Banco'},{type:'expense',amount:'20',payment:'cash',reason:'Flete'},{type:'expense',amount:'5',payment:'transfer',reason:'Servicio'}])assert.equal((await f.admin.req('/api/cash','POST',body)).status,201);
 assert.equal((await f.state()).shift.expected.mxn,98000);
 const r=await f.admin.req('/api/shifts/close','POST',{countedMxn:'979',countedUsd:'0',note:'Falta un peso'});assert.equal(r.status,200);assert.equal(r.data.expected_mxn,98000);assert.equal(r.data.counted_mxn,97900);assert.ok(r.data.backup);
 assert.ok(fs.existsSync(path.join(f.dir,'backups',r.data.backup)));assert.equal((await f.state()).shift,null);
 const cut=await f.admin.req('/api/cuts/'+r.data.id);assert.match(cut.data.text,/Diferencia MXN\s+-?\$1.00/);assert.equal((await f.admin.req('/api/report')).data.expenses,2500);
});
test('permisos reales en API, restricción de precios y revocación de sesiones',async t=>{
 const f=await fixture(t,{initial:'10'});
 const created=await f.admin.req('/api/users','POST',{name:'Luis',role:'cashier',password:'Mi-Clave-Segura-2'});assert.equal(created.status,201);
 const cashier=f.client();await cashier.req('/api/session');await cashier.req('/api/login','POST',{name:'Luis',password:'Mi-Clave-Segura-2'});
 assert.equal((await cashier.req('/api/materials','POST',{})).status,403);assert.equal((await cashier.req('/api/backup')).status,403);
 assert.equal((await cashier.req('/api/transactions','POST',f.sale())).status,403); // turno de Ana
 await f.admin.req('/api/shifts/close','POST',{countedMxn:'1000',countedUsd:'0'});await cashier.req('/api/shifts/open','POST',{openingMxn:'100',rate:'20'});
 assert.equal((await cashier.req('/api/transactions','POST',f.sale([{materialId:f.mid,grossKg:'1',price:'11'}]))).status,403);
 assert.equal((await cashier.req('/api/transactions','POST',f.sale())).status,201);
 await f.admin.req('/api/users/'+created.data.id,'PATCH',{active:false});assert.equal((await cashier.req('/api/state')).status,401);
});
test('usuario consulta solo lee; no puede mover caja ni inventario',async t=>{
 const f=await fixture(t);await f.admin.req('/api/users','POST',{name:'Consulta',role:'viewer',password:'Mi-Clave-Segura-3'});
 const c=f.client();await c.req('/api/session');await c.req('/api/login','POST',{name:'Consulta',password:'Mi-Clave-Segura-3'});
 assert.equal((await c.req('/api/report')).status,200);assert.equal((await c.req('/api/transactions','POST',f.purchase())).status,403);assert.equal((await c.req('/api/cash','POST',{})).status,403);
});
test('fechas inválidas se rechazan y zona horaria define el día del reporte',async t=>{
 const f=await fixture(t);const p=await f.admin.req('/api/transactions','POST',f.purchase());f.service.store.transaction(()=>f.service.store.run('UPDATE transactions SET date=? WHERE id=?',['2026-05-01T03:00:00.000Z',p.data.id]));
 assert.equal((await f.admin.req('/api/report?from=2026-04-30&to=2026-04-30')).data.purchases,5000);
 assert.equal((await f.admin.req('/api/report?from=2026-05-01&to=2026-05-01')).data.purchases,0);
 assert.equal((await f.admin.req('/api/report?from=2026-02-30')).status,400);assert.equal((await f.admin.req('/api/report?from=2026-05-02&to=2026-05-01')).status,400);
});
test('CSV neutraliza fórmulas y tickets no ejecutan texto HTML',async t=>{
 const f=await fixture(t);const p=await f.admin.req('/api/transactions','POST',f.purchase(undefined,{counterpart:'=CMD("x")',note:'<script>alert(1)</script>'}));assert.equal(p.status,201);
 const csv=await f.admin.req('/api/report.csv');assert.match(csv.data.toString(),/'=CMD/);
 const tx=(await f.admin.req('/api/tickets/'+p.data.id)).data;assert.match(tx.text,/<script>/);
});
test('SQLite real, respaldo completo, restauración y reautenticación',async t=>{
 const f=await fixture(t,{shift:false,initial:'10'});const backup=(await f.admin.req('/api/backup')).data;assert.equal(backup.subarray(0,15).toString(),'SQLite format 3');
 await f.admin.req('/api/stock/adjust','POST',{materialId:f.mid,deltaKg:'-2',reason:'Prueba'});assert.equal((await f.state()).materials[0].stock_g,8000);
 const restored=await f.admin.req('/api/restore','POST',{base64:backup.toString('base64'),confirm:'RESTAURAR'});assert.equal(restored.status,200);assert.ok(restored.data.previous);
 assert.equal((await f.admin.req('/api/state')).status,401);await f.admin.req('/api/session');await f.admin.req('/api/login','POST',{name:'Ana',password:'Clave-Larga-123'});assert.equal((await f.state()).materials[0].stock_g,10000);
});
test('bloqueo de restauración con turno abierto y de archivo corrupto',async t=>{
 const f=await fixture(t);assert.equal((await f.admin.req('/api/restore','POST',{base64:'AAAA',confirm:'RESTAURAR'})).status,409);
 await f.admin.req('/api/shifts/close','POST',{countedMxn:'1000',countedUsd:'0'});assert.equal((await f.admin.req('/api/restore','POST',{base64:'AAAA',confirm:'RESTAURAR'})).status,400);
 assert.equal((await f.state()).materials.length,1);
});
test('importación V15 calcula saldo, conserva mínimo e historial; no importa PIN',async t=>{
 const f=await fixture(t,{material:false,shift:false});
 const data={business:{name:'Negocio V15'},materials:[{id:'cu',name:'Cobre',price:5,salePrice:10,initial:10,minStock:2}],purchases:[{items:[{mid:'cu',kg:3.125}]}],sales:[{mid:'cu',kg:2}],adjustments:[{mid:'cu',delta:-0.125}],users:[{pin:'1234'}],currentShift:null};
 const preview=await f.admin.req('/api/legacy/preview','POST',{data});assert.equal(preview.status,200);assert.equal(preview.data.materials[0].stock,11000);
 const r=await f.admin.req('/api/legacy/import','POST',{data,filename:'v15.json',confirm:'IMPORTAR'});assert.equal(r.status,201);
 const s=await f.state();assert.equal(s.materials[0].stock_g,11000);assert.equal(s.materials[0].min_g,2000);assert.equal(s.transactions.length,0);
 const archived=await f.admin.req('/api/legacy/1');assert.deepEqual(archived.data,data);assert.equal(f.service.store.get('SELECT COUNT(*) n FROM users').n,1);
 assert.equal((await f.admin.req('/api/legacy/import','POST',{data,filename:'v15.json',confirm:'IMPORTAR'})).status,409);
});
test('importación rechaza stock negativo y turnos abiertos del respaldo',async t=>{
 const f=await fixture(t,{material:false,shift:false}),data={business:{},materials:[{id:'x',name:'X',price:1,salePrice:1,initial:0}],purchases:[],sales:[{mid:'x',kg:1}]};
 assert.equal((await f.admin.req('/api/legacy/preview','POST',{data})).status,400);
 data.sales=[];data.currentShift={id:'open'};assert.equal((await f.admin.req('/api/legacy/preview','POST',{data})).status,400);
});
test('persistencia tras reinicio y bloqueo de segundo escritor',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mgv-persist-'));let store=await Store.open(dir);t.after(()=>{store?.close();fs.rmSync(dir,{recursive:true,force:true});});
 store.transaction(()=>store.run("INSERT INTO settings VALUES('prueba','persistente')"));await assert.rejects(Store.open(dir),/otro proceso/);
 store.close();store=await Store.open(dir);assert.equal(store.get("SELECT value FROM settings WHERE key='prueba'").value,'persistente');
});
test('fallo de escritura no deja cambios confirmados en memoria',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mgv-disk-')),store=await Store.open(dir);t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true});});
 const original=store.file;store.file=path.join(dir,'no-existe','db.sqlite');assert.throws(()=>store.transaction(()=>store.run("INSERT INTO settings VALUES('fallo','x')")),/ENOENT/);store.file=original;
 assert.equal(store.get("SELECT value FROM settings WHERE key='fallo'"),undefined);
 store.transaction(()=>store.run("INSERT INTO settings VALUES('correcto','si')"));assert.equal(store.get("SELECT value FROM settings WHERE key='correcto'").value,'si');
});
