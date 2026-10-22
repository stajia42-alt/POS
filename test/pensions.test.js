'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {installOperations}=require('../lib/operations');
const pens=require('../lib/pensions');
function rig(){
 const db=new DatabaseSync(':memory:');
 for(const v of ['001-legacy','002-professional','003-clients-print','004-day-night','005-handover','006-recurring-pensions','007-client-prices','008-unified-pension','009-manual-pension-debts'])require('../migrations/'+v)(db);
 db.exec('PRAGMA foreign_keys=ON');
 db.prepare("INSERT INTO users(id,username,password_hash,role,active,created_at) VALUES(1,'admin','hash','admin',1,?)").run('2026-01-01T00:00:00.000Z');
 db.transaction=fn=>{const f=(...args)=>{db.exec('BEGIN IMMEDIATE');try{const result=fn(...args);db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}};f.immediate=f;return f;};
 let now=Date.parse('2026-01-31T20:00:00.000Z');const routes=new Map();
 const app={get:(p,...hs)=>routes.set('GET '+p,hs),put:(p,...hs)=>routes.set('PUT '+p,hs),post:(p,...hs)=>routes.set('POST '+p,hs)};
 const audit=(ticket,action,details,user)=>db.prepare('INSERT INTO audit(ticket_id,action,at,detail,user_id) VALUES(?,?,?,?,?)').run(ticket,action,new Date(now).toISOString(),JSON.stringify(details),user);
 installOperations(app,{storage:{db},auth:{allow:()=>((req,res,next)=>next())},audit,clock:()=>now,getPrintSettings:()=>({}),printEntry:async()=>{},printReport:async()=>{},openDrawer:async()=>{}});
 const req=async(method,url,body={},key=crypto.randomUUID())=>{
  const item=[...routes.entries()].find(([route])=>{const [verb,path]=route.split(' ');return verb===method&&(path===url||new RegExp('^'+path.replace(/:[^/]+/g,'[^/]+')+'$').test(url));});
  assert.ok(item,url);let result,err;const params={};const parts=item[0].split(' ')[1].split('/'),given=url.split('/');for(let i=0;i<parts.length;i++)if(parts[i].startsWith(':'))params[parts[i].slice(1)]=given[i];
  const rq={body,params,headers:{'idempotency-key':key},query:{},user:{id:1,role:'admin'}};
  const rs={status(){return this},json(x){result=x;return this},clearCookie(){return this}};
  for(const handler of item[1]){await handler(rq,rs,e=>{if(e)err=e});if(err)throw err;}
  return result;
 };
 const add=(name,period,price)=>req('POST','/api/clients',{name,plate:'',client_code:name.toUpperCase(),kind:'pension_night',discount_bps:0,valid_from:new Date(now).toISOString(),valid_to:'2099-12-31T23:59:59.000Z',window_start:'20:00',window_end:'08:00',notes:'',active:true,pension_period:period,pension_price_cents:price,pension_start_at:new Date(now).toISOString()});
 return {db,req,add,setNow:iso=>now=Date.parse(iso),incDays:days=>now+=days*86400000,close:()=>db.close()};
}
test('Mensualidades 31 de enero conservan dia de referencia, ajustando febrero',()=>{
 const a='2026-01-31T20:00:00.000Z';
 assert.equal(pens.boundary(a,0,'monthly'),'2026-01-31T20:00:00.000Z');
 assert.equal(pens.boundary(a,1,'monthly'),'2026-02-28T20:00:00.000Z');
 assert.equal(pens.boundary(a,2,'monthly'),'2026-03-31T19:00:00.000Z');
});
test('Pensiones semanales en reloj local conservan hora tras cambio horario',()=>{
 const a='2026-03-02T20:00:00.000Z';
 assert.equal(pens.boundary(a,1,'weekly'),'2026-03-09T19:00:00.000Z');
});
test('Planes independientes cobran importes personalizados sin ingreso hasta que pagan',async()=>{
 const r=rig();try{
  const a=await r.add('luis','weekly',70000),b=await r.add('maria','monthly',250000);
  let rows=await r.req('GET','/api/clients');assert.equal(rows.find(x=>x.id===a.id).balance_cents,70000);assert.equal(rows.find(x=>x.id===b.id).balance_cents,250000);
  assert.equal(r.db.prepare('SELECT COUNT(*) n FROM all_payments').get().n,0);
  r.incDays(15);rows=await r.req('GET','/api/clients');
  assert.equal(rows.find(x=>x.id===a.id).balance_cents,210000);
  assert.equal(rows.find(x=>x.id===b.id).balance_cents,250000);
  assert.equal(r.db.prepare('SELECT COUNT(*) n FROM all_payments').get().n,0);
 }finally{r.close()}
});
test('Pagos parciales se aplican a la semana mas antigua; reintento no cobra doble',async()=>{
 const r=rig();try{
  const c=await r.add('elena','weekly',10000);r.incDays(8);
  await r.req('GET','/api/clients');
  await r.req('POST','/api/shift/open',{opening_cents:100000,shift_type:'DAY'});
  const key=crypto.randomUUID(),body={amount_cents:15000,method:'efectivo',received_cents:20000};
  const pay=await r.req('POST','/api/clients/'+c.id+'/pension-pay',body,key);
  assert.equal(pay.remaining_cents,5000);assert.equal(pay.change_cents,5000);
  const replay=await r.req('POST','/api/clients/'+c.id+'/pension-pay',body,key);
  assert.equal(replay.replayed,true);assert.equal(r.db.prepare('SELECT COUNT(*) n FROM pension_allocations').get().n,2);
  assert.equal(r.db.prepare('SELECT COUNT(*) n FROM payment_adjustments').get().n,1);
  const ledger=await r.req('GET','/api/clients/'+c.id+'/pension-ledger');
  assert.deepEqual(ledger.charges.map(x=>x.due_cents),[0,5000]);
 }finally{r.close()}
});
test('Cambio de precio deja intacta la semana anterior y aplica nuevo importe al siguiente periodo',async()=>{
 const r=rig();try{
  const c=await r.add('juan','weekly',10000);await r.req('GET','/api/clients');
  const row=(await r.req('GET','/api/clients')).find(x=>x.id===c.id);
  await r.req('PUT','/api/clients/'+c.id,{name:row.name,plate:row.plate,client_code:row.client_code,kind:row.kind,discount_bps:0,valid_from:row.valid_from,valid_to:row.valid_to,window_start:row.window_start,window_end:row.window_end,notes:'',active:true,pension_period:'weekly',pension_price_cents:15000,pension_start_at:row.contract.anchor_at});
  assert.equal(r.db.prepare('SELECT amount_cents n FROM pension_charges').get().n,10000);
  r.incDays(8);const ledger=await r.req('GET','/api/clients/'+c.id+'/pension-ledger');
  assert.deepEqual(ledger.charges.map(x=>x.amount_cents),[10000,15000]);
 }finally{r.close()}
});
test('Cambiar semanal a mensual no duplica el periodo existente',async()=>{
 const r=rig();try{
  const c=await r.add('ana','weekly',12000);const row=(await r.req('GET','/api/clients')).find(x=>x.id===c.id);
  await r.req('PUT','/api/clients/'+c.id,{...row,plate:row.plate,pension_period:'monthly',pension_price_cents:80000,pension_start_at:row.contract.anchor_at});
  r.incDays(8);const ledger=await r.req('GET','/api/clients/'+c.id+'/pension-ledger');
  assert.equal(ledger.charges.length,2);assert.deepEqual(ledger.charges.map(x=>x.amount_cents),[12000,80000]);
  assert.equal(ledger.charges[1].period,'monthly');
 }finally{r.close()}
});
test('No se inventan adeudos para pensiones antiguas durante migracion',()=>{
 const db=new DatabaseSync(':memory:');try{
  for(const v of ['001-legacy','002-professional','003-clients-print','004-day-night','005-handover'])require('../migrations/'+v)(db);
  db.prepare('INSERT INTO clients(name,plate,kind,valid_from,valid_to,window_start,window_end,created_at) VALUES(?,?,?,?,?,?,?,?)').run('Viejo','PREVIO','pension_day','2025-01-01T00:00:00.000Z','2026-12-01T00:00:00.000Z','08:00','20:00','2025-01-01T00:00:00.000Z');
  require('../migrations/006-recurring-pensions')(db);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM pension_charges').get().n,0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM pension_contracts').get().n,0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM clients').get().n,1);
 }finally{db.close()}
});
test('No permite que un pago supere el saldo, incluso tras varios periodos',async()=>{
 const r=rig();try{const c=await r.add('iris','weekly',7500);await r.req('POST','/api/shift/open',{opening_cents:100000,shift_type:'DAY'});
  await assert.rejects(()=>r.req('POST','/api/clients/'+c.id+'/pension-pay',{amount_cents:7501,method:'efectivo',received_cents:10000}),/superar la deuda/);
  assert.equal(r.db.prepare('SELECT COUNT(*) n FROM payment_adjustments').get().n,0);
 }finally{r.close()}
});
test('Suspender un contrato detiene cargos futuros pero conserva deuda anterior',async()=>{
 const r=rig();try{
  const c=await r.add('andres','weekly',12500);r.incDays(8);
  const before=(await r.req('GET','/api/clients')).find(x=>x.id===c.id);
  assert.equal(before.balance_cents,25000);
  await r.req('PUT','/api/clients/'+c.id,{...before,active:false,pension_period:'weekly',pension_price_cents:12500,pension_start_at:before.contract.anchor_at});
  r.incDays(40);
  const after=(await r.req('GET','/api/clients')).find(x=>x.id===c.id);
  assert.equal(after.balance_cents,25000);
  assert.ok(after.contract.stopped_at);
  assert.equal(r.db.prepare('SELECT COUNT(*) n FROM pension_charges WHERE client_id=?').get(c.id).n,2);
 }finally{r.close()}
});
test('Se puede cobrar deuda aun con contrato suspendido sin crear nuevos periodos',async()=>{
 const r=rig();try{
  const c=await r.add('pedro','monthly',90000);let row=(await r.req('GET','/api/clients')).find(x=>x.id===c.id);
  await r.req('PUT','/api/clients/'+c.id,{...row,active:false,pension_period:'monthly',pension_price_cents:90000,pension_start_at:row.contract.anchor_at});
  r.incDays(65);
  await r.req('POST','/api/shift/open',{opening_cents:100000,shift_type:'DAY'});
  const paid=await r.req('POST','/api/clients/'+c.id+'/pension-pay',{amount_cents:50000,method:'efectivo',received_cents:50000});
  assert.equal(paid.remaining_cents,40000);
  assert.equal(r.db.prepare('SELECT COUNT(*) n FROM pension_charges').get().n,1);
 }finally{r.close()}
});
test('Saldo anterior al crear pension queda separado, no cuenta venta y se suma a semanas futuras',async()=>{
 const r=rig();try{
  const body={name:'Andrea',plate:'',client_code:'ANDREA',kind:'pension_day',discount_bps:0,valid_from:new Date('2026-01-31T20:00:00.000Z').toISOString(),valid_to:'2099-12-31T23:59:59.000Z',window_start:'08:00',window_end:'20:00',notes:'',active:true,pension_period:'weekly',pension_price_cents:65000,pension_start_at:'2026-01-31T20:00:00.000Z',opening_debt_cents:120000};
  const cl=await r.req('POST','/api/clients',body);
  const state=await r.req('GET','/api/clients/'+cl.id+'/pension-ledger');
  assert.deepEqual(state.charges.map(c=>[c.period,c.amount_cents]),[['opening',120000],['weekly',65000]]);
  assert.equal(state.balance_cents,185000);
  assert.equal(r.db.prepare('SELECT COUNT(*) n FROM all_payments').get().n,0);
  r.incDays(8);
  const next=await r.req('GET','/api/clients/'+cl.id+'/pension-ledger');
  assert.equal(next.balance_cents,250000);
  const prior=r.db.prepare('SELECT COUNT(*) n FROM pension_charges WHERE client_id=? AND period=?').get(cl.id,'opening');
  assert.equal(prior.n,1);
 }finally{r.close()}
});
test('Adeudo previo se puede cargar a cliente existente una vez; las ediciones no lo duplican',async()=>{
 const r=rig();try{
  const cl=await r.add('deudor','monthly',100000);
  const key=crypto.randomUUID();
  const first=await r.req('POST','/api/clients/'+cl.id+'/opening-debt',{amount_cents:55000,reason:'Deuda previa'},key);
  assert.equal(first.balance_cents,155000);
  const replay=await r.req('POST','/api/clients/'+cl.id+'/opening-debt',{amount_cents:55000,reason:'Deuda previa'},key);
  assert.equal(replay.replayed,true);
  await assert.rejects(()=>r.req('POST','/api/clients/'+cl.id+'/opening-debt',{amount_cents:55000}),/Ya se registró/);
  const old=(await r.req('GET','/api/clients')).find(c=>c.id===cl.id);
  await r.req('PUT','/api/clients/'+cl.id,{...old,pension_period:'monthly',pension_price_cents:110000,pension_start_at:old.contract.anchor_at});
  assert.equal((await r.req('GET','/api/clients/'+cl.id+'/pension-ledger')).balance_cents,155000);
 }finally{r.close()}
});
test('Abono aplica primero al adeudo previo y luego a la cuota; corte solo registra pago recibido',async()=>{
 const r=rig();try{
  const cl=await r.add('paga','weekly',70000);
  await r.req('POST','/api/clients/'+cl.id+'/opening-debt',{amount_cents:50000});
  await r.req('POST','/api/shift/open',{opening_cents:100000,shift_type:'DAY'});
  const result=await r.req('POST','/api/clients/'+cl.id+'/pension-pay',{amount_cents:60000,method:'efectivo',received_cents:60000});
  assert.equal(result.remaining_cents,60000);
  const ledger=await r.req('GET','/api/clients/'+cl.id+'/pension-ledger');
  assert.deepEqual(ledger.charges.map(c=>c.due_cents),[0,60000]);
  assert.equal(r.db.prepare('SELECT COALESCE(SUM(amount_cents),0) n FROM all_payments').get().n,60000);
 }finally{r.close()}
});
test('Tarifa especial por dia reconoce 24 horas o fracción y precio de cada cliente',async()=>{
 const rates=require('../lib/rates');
 const from='2026-01-01T10:00:00.000Z';
 for(const [mins,due] of [[1,10000],[60,10000],[1440,10000],[1441,20000],[2880,20000],[2881,30000]]){
  const benefit={kind:'daily_flat',daily_price_cents:10000,valid_from:'2025-12-31T00:00:00.000Z',valid_to:'2027-01-01T00:00:00.000Z'};
  const end=new Date(Date.parse(from)+mins*60000).toISOString();
  assert.equal(rates.stayPrice(from,end,rates.defaults,benefit),due);
 }
 const more={kind:'daily_flat',daily_price_cents:15000,valid_from:'2025-12-31T00:00:00.000Z',valid_to:'2027-01-01T00:00:00.000Z'};
 assert.equal(rates.stayPrice(from,new Date(Date.parse(from)+3600000).toISOString(),rates.defaults,more),15000);
});
test('Tarifa diaria de cliente no modifica cotización de ticket ya creado al editar precio',async()=>{
 const r=rig();try{
  const begin='2026-01-31T20:00:00.000Z';
  const client=await r.req('POST','/api/clients',{name:'Comerciante',plate:'',client_code:'DIARIO100',kind:'daily_flat',daily_price_cents:10000,discount_bps:0,valid_from:'2026-01-01T00:00:00.000Z',valid_to:'2026-12-31T00:00:00.000Z',window_start:'08:00',window_end:'20:00',notes:'',active:true});
  await r.req('POST','/api/shift/open',{opening_cents:100000,shift_type:'DAY'});
  const t=await r.req('POST','/api/entry',{client_id:client.id});
  assert.equal(t.code,'001');
  r.incDays(0.3);
  const before=await r.req('GET','/api/ticket/'+t.code);assert.equal(before.estimated_cents,10000);
  const row=(await r.req('GET','/api/clients')).find(c=>c.id===client.id);
  await r.req('PUT','/api/clients/'+client.id,{...row,daily_price_cents:20000});
  const after=await r.req('GET','/api/ticket/'+t.code);assert.equal(after.estimated_cents,10000);
  const second=await r.req('POST','/api/entry',{client_id:client.id});assert.equal(second.code,'002');
  assert.equal((await r.req('GET','/api/ticket/'+second.code)).estimated_cents,20000);
 }finally{r.close()}
});
test('Migración de RC8 a RC9 mantiene pagos y clientes y asigna precio por defecto',()=>{
 const db=new DatabaseSync(':memory:');try{
  for(const v of ['001-legacy','002-professional','003-clients-print','004-day-night','005-handover','006-recurring-pensions'])require('../migrations/'+v)(db);
  const now='2026-01-01T00:00:00.000Z';
  db.prepare('INSERT INTO clients(name,plate,kind,valid_from,valid_to,window_start,window_end,created_at) VALUES(?,?,?,?,?,?,?,?)').run('Anterior','ORIGINAL1','frequent',now,'2099-12-31T23:59:59.000Z','08:00','20:00',now);
  const before=db.prepare('SELECT * FROM clients').get();
  require('../migrations/007-client-prices')(db);
  const after=db.prepare('SELECT * FROM clients').get();
  for(const key of Object.keys(before))assert.equal(before[key],after[key]);
  assert.equal(after.daily_price_cents,10000);
  require('../migrations/007-client-prices')(db);
  assert.equal(db.prepare('SELECT MAX(version) v FROM schema_migrations').get().v,7);
 }finally{db.close()}
});
test('RC12: permite muchas deudas manuales con fecha y motivo; acumula y abona a las mas antiguas',async()=>{
 const r=rig();try{
  const client=await r.add('multideudas','weekly',10000);
  await r.req('POST','/api/shift/open',{opening_cents:100000,shift_type:'DAY'});
  const path='/api/clients/'+client.id+'/manual-debt';
  const first={amount_cents:20000,effective_at:'2026-01-28T20:00:00.000Z',reason:'Adeudo de enero'};
  const second={amount_cents:35000,effective_at:'2026-01-29T20:00:00.000Z',reason:'Adeudo adicional'};
  const key=crypto.randomUUID();
  const a=await r.req('POST',path,first,key);
  assert.equal(a.balance_cents,30000);
  assert.equal((await r.req('POST',path,first,key)).replayed,true);
  assert.equal((await r.req('POST',path,second)).balance_cents,65000);
  assert.equal(r.db.prepare('SELECT COUNT(*) n FROM pension_manual_debts').get().n,2);
  let account=await r.req('GET','/api/clients/'+client.id+'/pension-ledger');
  assert.equal(account.balance_cents,65000);
  assert.deepEqual(account.charges.filter(x=>x.period==='manual').map(x=>x.amount_cents),[20000,35000]);
  assert.equal((await r.req('GET','/api/clients')).find(c=>c.id===client.id).balance_cents,65000);
  assert.equal(r.db.prepare('SELECT count(*) n FROM all_payments').get().n,0);
  const payment=await r.req('POST','/api/clients/'+client.id+'/pension-pay',{
   amount_cents:25000,method:'efectivo',received_cents:30000
  });
  assert.equal(payment.remaining_cents,40000);
  account=await r.req('GET','/api/clients/'+client.id+'/pension-ledger');
  assert.deepEqual(account.charges.filter(c=>c.period==='manual').map(c=>c.due_cents),[0,30000]);
  assert.equal(r.db.prepare('SELECT SUM(amount_cents) n FROM all_payments').get().n,25000);
  r.incDays(8);
  account=await r.req('GET','/api/clients/'+client.id+'/pension-ledger');
  assert.equal(account.balance_cents,50000);
 }finally{r.close()}
});
test('RC12: rechaza adeudos futuros, vacios o mal descritos sin crear filas',async()=>{
 const r=rig();try{
  const c=await r.add('rechazos','weekly',20000),url='/api/clients/'+c.id+'/manual-debt';
  await assert.rejects(()=>r.req('POST',url,{amount_cents:0,reason:'Sin dinero'}),/mayor/);
  await assert.rejects(()=>r.req('POST',url,{amount_cents:5000,reason:'a'}),/motivo/);
  await assert.rejects(()=>r.req('POST',url,{amount_cents:5000,reason:'Fecha futura',effective_at:'2099-01-01T00:00:00.000Z'}),/futura/);
  assert.equal(r.db.prepare('SELECT COUNT(*) n FROM pension_manual_debts').get().n,0);
 }finally{r.close()}
});
test('RC12: migracion 8 a 9 conserva cobros y contratos anteriores, inicializa modo semanal sin cambiar beneficios anteriores',()=>{
 const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(':memory:');
 try{
  for(const n of ['001-legacy','002-professional','003-clients-print','004-day-night','005-handover','006-recurring-pensions','007-client-prices','008-unified-pension'])require('../migrations/'+n)(db);
  db.prepare('INSERT INTO clients(name,plate,kind,valid_from,valid_to,window_start,window_end,created_at) VALUES(?,?,?,?,?,?,?,?)').run('Historico','PLACA123','pension','2026-01-01T00:00:00.000Z','2099-12-31T00:00:00.000Z','00:00','23:59','2026-01-01T00:00:00.000Z');
  const before=db.prepare('SELECT * FROM clients').get();
  require('../migrations/009-manual-pension-debts')(db);
  const after=db.prepare('SELECT * FROM clients').get();
  for(const [k,v] of Object.entries(before))assert.equal(after[k],v,k);
  assert.equal(after.pension_weekly_unlimited,0);
  assert.equal(db.prepare('SELECT MAX(version) n FROM schema_migrations').get().n,9);
  require('../migrations/009-manual-pension-debts')(db);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM clients').get().n,1);
 }finally{db.close()}
});
