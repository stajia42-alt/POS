'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {installOperations}=require('../lib/operations');
const {buildEntryTicket}=require('../ticket-escpos');
function rig({drawerFails=false}={}){
 const db=new DatabaseSync(':memory:');
 for(const v of ['001-legacy','002-professional','003-clients-print','004-day-night','005-handover','006-recurring-pensions','007-client-prices','008-unified-pension','009-manual-pension-debts'])require('../migrations/'+v)(db);
 db.exec('PRAGMA foreign_keys=ON');
 db.prepare("INSERT INTO users(id,username,password_hash,role,active,created_at) VALUES(1,'test-admin','test','admin',1,?)").run('2026-10-12T14:00:00Z');
 db.transaction=fn=>{const run=(...args)=>{db.exec('BEGIN IMMEDIATE');try{const r=fn(...args);db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}};run.immediate=run;return run;};
 let now=Date.parse('2026-10-12T14:00:00Z');let copies=[];let prints=[];let drawerPulses=0;const endpoints=new Map();
 const app={get:(p,...h)=>endpoints.set('GET '+p,h),post:(p,...h)=>endpoints.set('POST '+p,h),put:(p,...h)=>endpoints.set('PUT '+p,h)};
 const audit=(ticket,action,data,user)=>db.prepare('INSERT INTO audit(ticket_id,action,at,detail,user_id) VALUES(?,?,?,?,?)').run(ticket,action,new Date(now).toISOString(),JSON.stringify(data||{}),user);
 const ops=installOperations(app,{storage:{db},auth:{allow:()=>((req,res,next)=>next())},audit,clock:()=>now,getPrintSettings:()=>({ticketName:'LIBRA 3',autoCut:true}),printEntry:async(c,code,at)=>copies.push({code,at}),printReport:async(c,data)=>prints.push(data),openDrawer:async()=>{drawerPulses++;if(drawerFails)throw Error('Impresora desconectada')}});
 const req=async(method,path,body={},idempotencyKey=crypto.randomUUID())=>{
  const pair=[...endpoints.entries()].find(([k])=>{const [m,p]=k.split(' ');return method===m&&(p===path||new RegExp('^'+p.replace(/:[^/]+/g,'[^/]+')+'$').test(path));});
  assert.ok(pair,method+' '+path);const [route,handlers]=pair;let result,error;
  const vars=route.split(' ')[1].split('/'),values=path.split('/'),params={};vars.forEach((v,i)=>{if(v.startsWith(':'))params[v.slice(1)]=values[i]});
  const rq={body,params,headers:{'idempotency-key':idempotencyKey},query:{},user:{id:1,role:'admin'}};
  const rs={status(){return this},json(v){result=v;return this},clearCookie(){return this}};
  for(const h of handlers){await h(rq,rs,e=>{if(e)error=e});if(error)throw error;}
  return result;
 };
 return {db,req,ops,clock:m=>{now+=m*60000},copies,prints,get drawerPulses(){return drawerPulses},close:()=>db.close()};
}
test('Turnos Día y Noche: hereda vehículo sin perder folio, atribuye venta y liquida a Día',async()=>{
 const r=rig();try{
  const day=await r.req('POST','/api/shift/open',{opening_cents:200000,shift_type:'DAY'});
  assert.equal(day.shift_type,'DAY');
  const entry=await r.req('POST','/api/entry',{});assert.equal(entry.code,'001');
  const second=await r.req('POST','/api/entry',{});assert.equal(second.code,'002');
  assert.equal(r.db.prepare("SELECT entry_shift_id FROM tickets WHERE code='001'").get().entry_shift_id,day.id);
  const dayShift=(await r.req('GET','/api/shift')).shift;
  assert.equal(dayShift.ownership.open_vehicles,2);
  await r.req('POST','/api/shift/close',{shift_id:day.id,declared_cents:dayShift.expected_cents,declared_usd_cents:0});
  assert.equal(r.db.prepare('SELECT COUNT(*) n FROM tickets WHERE exit_at IS NULL').get().n,2);
  const night=await r.req('POST','/api/shift/open',{opening_cents:200000,shift_type:'NIGHT'});
  assert.equal(night.inherited,2);
  r.clock(150);
  const quote=await r.req('GET','/api/ticket/001');assert.ok(quote.estimated_cents>0);
  const paid=await r.req('POST','/api/ticket/001/pay',{method:'efectivo',received_cents:50000,expected_cents:quote.estimated_cents,revision:quote.revision});
  assert.equal(paid.exit_confirmed,true);
  const nights=(await r.req('GET','/api/shift')).shift;
  assert.equal(nights.night_dues.length,1);
  assert.equal(nights.night_dues[0].collected_cents,quote.estimated_cents);
  assert.equal(nights.night_dues[0].owed_mxn_cents,quote.estimated_cents);
  assert.equal(nights.pending_day_settlement_cents,quote.estimated_cents);
  // Entregas parciales y completas sólo retiran efectivo; no generan ventas.
  const partial=Math.floor(quote.estimated_cents/2);
  const firstTransfer=await r.req('POST','/api/shift/day-settlement',{origin_shift_id:day.id,currency:'MXN',amount_cents:partial});
  assert.equal(firstTransfer.remaining_cents,quote.estimated_cents-partial);
  const midway=(await r.req('GET','/api/shift')).shift;
  assert.equal(midway.expected_cents,nights.expected_cents-partial);
  assert.equal(midway.sales_cents,nights.sales_cents);
  const transferred=await r.req('POST','/api/shift/day-settlement',{origin_shift_id:day.id,currency:'MXN',amount_cents:quote.estimated_cents-partial});
  assert.equal(transferred.remaining_cents,0);
  const after=(await r.req('GET','/api/shift')).shift;
  assert.equal(after.night_dues[0].owed_mxn_cents,0);
  assert.equal(after.expected_cents,nights.expected_cents-quote.estimated_cents);
  const closed=await r.req('POST','/api/shift/close',{shift_id:night.id,declared_cents:after.expected_cents,declared_usd_cents:0});
  assert.equal(closed.difference_cents,0);
  assert.equal((await r.req('GET','/api/shift/:id/receipt'.replace(':id',day.id))).ownership.open_vehicles,1);
  assert.equal(r.db.prepare('SELECT COUNT(*) n FROM all_payments').get().n,1);
 }finally{r.close()}
});
test('Dos boletos térmicos con folio/hora grandes y CODE128 idéntico',()=>{
 const data={name:'LIBRA 3',code:'001',entryAt:'2026-10-12T21:35:20Z',policies:'Conserve el boleto.',timeZone:'America/Tijuana'};
 const customer=buildEntryTicket({...data,copy:'CUSTOMER'}),internal=buildEntryTicket({...data,copy:'INTERNAL'});
 assert.equal(customer.includes(Buffer.from('001')),true);assert.equal(internal.includes(Buffer.from('001')),true);
 assert.ok(customer.includes(Buffer.from([0x1b,0x21,0x30])));
 assert.ok(internal.includes(Buffer.from([0x1d,0x6b,73])));
 assert.ok(internal.includes(Buffer.from('CONTROL INTERNO')));
 assert.ok(internal.includes(Buffer.from('Datos / notas')));
 assert.ok(!internal.includes(Buffer.from('CONSERVE SU BOLETO')));
 assert.ok(internal.length<customer.length*0.80, 'La copia interna debe ser sensiblemente mas corta');
 const joined=Buffer.concat([customer,internal]);assert.equal(joined.length,customer.length+internal.length);
});
test('Migración antigua conserva vehículos y añade turno de origen sin asignarlo retroactivamente',()=>{
 const db=new DatabaseSync(':memory:');try{
  for(const m of ['001-legacy','002-professional','003-clients-print'])require('../migrations/'+m)(db);
  db.prepare("INSERT INTO tickets(code,plate,entry_at,rate_snapshot) VALUES('ABC001','',?,?)").run('2026-10-12T10:00:00.000Z','{}');
  const before=db.prepare('SELECT COUNT(*) n FROM tickets').get().n;
  require('../migrations/004-day-night')(db);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM tickets').get().n,before);
  assert.equal(db.prepare("SELECT entry_shift_id FROM tickets WHERE code='ABC001'").get().entry_shift_id,null);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{db.close()}
});
test('Cobro heredado en USD: deuda al Día se expresa por venta MXN, no todos los dólares recibidos',async()=>{
 const r=rig();try{
  const day=await r.req('POST','/api/shift/open',{shift_type:'DAY',opening_cents:100000});
  const entry=await r.req('POST','/api/entry',{});r.clock(60);
  const a=(await r.req('GET','/api/shift')).shift;
  await r.req('POST','/api/shift/close',{shift_id:day.id,declared_cents:a.expected_cents,declared_usd_cents:0});
  const night=await r.req('POST','/api/shift/open',{shift_type:'NIGHT',opening_cents:100000});
  await r.req('PUT','/api/shift/usd-rate',{usd_rate:16.5});
  const quote=await r.req('GET','/api/ticket/'+entry.code);
  await r.req('POST','/api/ticket/'+entry.code+'/pay',{method:'usd',received_usd_cents:2000,expected_usd_rate:16.5,expected_cents:quote.estimated_cents,revision:quote.revision});
  const due=(await r.req('GET','/api/shift')).shift.night_dues[0];
  assert.equal(due.owed_mxn_cents,quote.estimated_cents);
  assert.equal(due.cash_usd_cents,2000);
  await assert.rejects(r.req('POST','/api/shift/day-settlement',{origin_shift_id:day.id,currency:'USD',amount_cents:2000}),/solo en MXN/);
  // Los dólares se cambian físicamente, registrando retiro en USD e ingreso en MXN.
  await r.req('POST','/api/shift/movements',{kind:'out',currency:'USD',amount_cents:2000,reason:'Cambio de 20 USD'});
  await r.req('POST','/api/shift/movements',{kind:'in',currency:'MXN',amount_cents:33000,reason:'Conversión de 20 USD a MXN'});
  await r.req('POST','/api/shift/day-settlement',{origin_shift_id:day.id,currency:'MXN',amount_cents:quote.estimated_cents});
  const last=(await r.req('GET','/api/shift')).shift;
  assert.equal(last.night_dues[0].owed_mxn_cents,0);
  assert.equal(last.expected_usd_cents,0);
  assert.equal(last.sales_cents,quote.estimated_cents);
 }finally{r.close()}
});

test('Corte Dia congela folios, Noche actualiza su estado, Dia siguiente consulta los mismos folios',async()=>{
 const r=rig();try{
  const day=await r.req('POST','/api/shift/open',{shift_type:'DAY',opening_cents:100000});
  await r.req('POST','/api/entry',{});await r.req('POST','/api/entry',{});
  const before=(await r.req('GET','/api/shift')).shift;
  await r.req('POST','/api/shift/close',{shift_id:day.id,declared_cents:before.expected_cents,declared_usd_cents:0});
  const delivered=(await r.req('GET','/api/shift/'+day.id+'/handover')).handover;
  assert.deepEqual(delivered.tickets.map(t=>t.code),['001','002']);
  assert.equal(delivered.summary.handed_over,2);assert.equal(delivered.summary.inside,2);
  const night=await r.req('POST','/api/shift/open',{shift_type:'NIGHT',opening_cents:100000});
  // Entrada de la noche no debe aparecer en el relevo previo.
  const newNight=await r.req('POST','/api/entry',{});assert.equal(newNight.code,'003');
  r.clock(75);
  const quote=await r.req('GET','/api/ticket/001');
  await r.req('POST','/api/ticket/001/pay',{method:'efectivo',received_cents:100000,expected_cents:quote.estimated_cents,revision:quote.revision});
  const status=(await r.req('GET','/api/shift/day-handover/latest')).handover;
  assert.deepEqual(status.tickets.map(t=>t.code),['001','002']);
  assert.equal(status.summary.paid_night,1);assert.equal(status.summary.inside,1);
  assert.equal(status.summary.night_sales_cents,quote.estimated_cents);
  assert.equal(status.tickets[0].status,'PAGADO_NOCHE');assert.equal(status.tickets[1].status,'SIGUE_DENTRO');
  const dues=(await r.req('GET','/api/shift')).shift.night_dues[0];
  await r.req('POST','/api/shift/day-settlement',{origin_shift_id:day.id,amount_cents:dues.owed_mxn_cents});
  const nightSummary=(await r.req('GET','/api/shift')).shift;
  await r.req('POST','/api/shift/close',{shift_id:night.id,declared_cents:nightSummary.expected_cents,declared_usd_cents:0});
  const dayAgain=await r.req('POST','/api/shift/open',{shift_type:'DAY',opening_cents:100000});
  assert.equal(dayAgain.shift_type,'DAY');
  const after=(await r.req('GET','/api/shift/day-handover/latest')).handover;
  assert.equal(after.shift.id,day.id);assert.equal(after.summary.paid_night,1);assert.equal(after.summary.inside,1);
  assert.equal(after.tickets[0].code,'001');assert.equal(after.tickets[1].code,'002');
  assert.equal(r.db.prepare('SELECT COUNT(*) n FROM shift_handoffs WHERE from_shift_id=?').get(day.id).n,2);
  assert.equal(r.db.prepare('SELECT COUNT(*) n FROM all_payments').get().n,1);
 }finally{r.close()}
});
test('Corte impreso muestra folios entregados y estados; migracion no borra datos',async()=>{
 const r=rig();try{
  const day=await r.req('POST','/api/shift/open',{shift_type:'DAY',opening_cents:50000});
  const e=await r.req('POST','/api/entry',{});
  const current=(await r.req('GET','/api/shift')).shift;
  await r.req('POST','/api/shift/close',{shift_id:day.id,declared_cents:current.expected_cents,declared_usd_cents:0});
  const snapshot=(await r.req('GET','/api/shift/'+day.id+'/receipt')).handover;
  assert.equal(snapshot.tickets[0].code,e.code);
  const {buildReport}=require('../lib/print-report');
  const text=buildReport({name:'LIBRA 3',timeZone:'America/Tijuana'}, {type:'DIA',shift:(await r.req('GET','/api/shift/'+day.id+'/receipt'))}).toString('latin1');
  assert.ok(text.includes('FOLIOS ENTREGADOS AL RELEVO'));assert.ok(text.includes('FOLIO '+e.code));assert.ok(text.includes('SIGUE DENTRO'));
  require('../migrations/005-handover')(r.db);
  assert.equal(r.db.prepare('SELECT COUNT(*) n FROM shift_handoffs').get().n,1);
  assert.equal(r.db.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{r.close()}
});

test('Cajon: un pulso por pago real, ningun pulso en reintento ni escaneo',async()=>{
 const r=rig();try{
  const shift=await r.req('POST','/api/shift/open',{shift_type:'DAY',opening_cents:100000});
  const e=await r.req('POST','/api/entry',{});r.clock(10);
  const quote=await r.req('GET','/api/ticket/'+e.code);
  const setup=r.db.prepare("INSERT INTO config(key,value) VALUES('ticket_print',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
  setup.run(JSON.stringify({cashDrawerEnabled:true,cashDrawerPin:0}));
  const cfg={...require('../lib/rates').defaults};
  cfg.printerName='PRUEBA POS80';r.db.prepare("INSERT INTO config(key,value) VALUES('rates',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(cfg));
  const key=crypto.randomUUID();const body={method:'efectivo',received_cents:10000,expected_cents:quote.estimated_cents,revision:quote.revision};
  const p=await r.req('POST','/api/ticket/'+e.code+'/pay',body,key);
  assert.equal(p.drawer_sent,true);assert.equal(r.drawerPulses,1);
  const replay=await r.req('POST','/api/ticket/'+e.code+'/pay',body,key);
  assert.equal(replay.replayed,true);assert.equal(r.drawerPulses,1);
  await r.req('GET','/api/ticket/'+e.code);assert.equal(r.drawerPulses,1);
 }finally{r.close()}
});
test('Fallo del cajon informa sin revertir el cobro ni duplicar el pago',async()=>{
 const r=rig({drawerFails:true});try{
  await r.req('POST','/api/shift/open',{shift_type:'DAY',opening_cents:100000});
  const e=await r.req('POST','/api/entry',{});
  r.db.prepare("INSERT INTO config(key,value) VALUES('ticket_print',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify({cashDrawerEnabled:true,cashDrawerPin:0}));
  const cfg={...require('../lib/rates').defaults};cfg.printerName='POS80';r.db.prepare("INSERT INTO config(key,value) VALUES('rates',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(cfg));
  r.clock(10);const q=await r.req('GET','/api/ticket/'+e.code);
  const paid=await r.req('POST','/api/ticket/'+e.code+'/pay',{method:'efectivo',received_cents:10000,expected_cents:q.estimated_cents,revision:q.revision});
  assert.match(paid.drawer_warning,/Pago guardado/);assert.equal(r.db.prepare('SELECT COUNT(*) n FROM payments').get().n,1);
  assert.ok(r.db.prepare('SELECT exit_at FROM tickets WHERE code=?').get(e.code).exit_at);
  assert.equal(r.drawerPulses,1);
 }finally{r.close()}
});
test('Pulso ESC/POS para cajon: pines validos y datos RAW minimos',()=>{
 const {buildDrawerPulse}=require('../lib/cash-drawer');
 assert.deepEqual([...buildDrawerPulse(0)],[27,64,27,112,0,50,50,10]);
 assert.deepEqual([...buildDrawerPulse(1)],[27,64,27,112,1,50,50,10]);
 assert.throws(()=>buildDrawerPulse(2));
});
