'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const crypto=require('node:crypto');
const {installOperations}=require('../lib/operations');
const {stayPrice,defaults}=require('../lib/rates');

const START='2026-10-12T15:00:00.000Z';
function setup(){
 const db=new DatabaseSync(':memory:');
 for(const n of ['001-legacy','002-professional','003-clients-print','004-day-night','005-handover','006-recurring-pensions','007-client-prices','008-unified-pension','009-manual-pension-debts'])require('../migrations/'+n)(db);
 db.exec('PRAGMA foreign_keys=ON');
 db.transaction=fn=>{const wrapped=(...args)=>{db.exec('BEGIN IMMEDIATE');try{const res=fn(...args);db.exec('COMMIT');return res;}catch(e){db.exec('ROLLBACK');throw e;}};wrapped.immediate=wrapped;return wrapped;};
 db.prepare("INSERT INTO users(id,username,password_hash,role,active,created_at) VALUES(1,'admin','hash','admin',1,?)").run(START);
 const routes=new Map(),app={};for(const v of ['get','post','put'])app[v]=(url,...fns)=>routes.set(v.toUpperCase()+' '+url,fns);
 let now=Date.parse(START);
 const audit=(ticket,action,detail,user)=>db.prepare('INSERT INTO audit(ticket_id,action,at,detail,user_id) VALUES(?,?,?,?,?)').run(ticket,action,new Date(now).toISOString(),JSON.stringify(detail),user);
 installOperations(app,{storage:{db},auth:{allow:()=>((req,res,next)=>next())},audit,clock:()=>now,getPrintSettings:()=>({}),printEntry:async()=>{},printReport:async()=>{},openDrawer:async()=>{}});
 const req=async(method,url,body={})=>{
  const endpoints=[...routes].filter(([key])=>key.startsWith(method+' '));let match=null,params={};
  for(const [key,handlers] of endpoints){const pattern=key.slice(method.length+1).split('/'),parts=url.split('/');if(pattern.length!==parts.length)continue;let yes=true,pp={};for(let i=0;i<pattern.length;i++){if(pattern[i].startsWith(':'))pp[pattern[i].slice(1)]=parts[i];else if(pattern[i]!==parts[i])yes=false;}if(yes){match=handlers;params=pp;break;}}
  assert.ok(match,method+' '+url);
  const request={body,params,headers:{'idempotency-key':crypto.randomUUID()},query:{},user:{id:1,role:'admin'}};
  let result,error;const response={status(){return this},json(data){result=data;return this}};
  for(const handler of match){await handler(request,response,e=>{if(e)error=e});if(error)throw error;}
  return result;
 };
 const create=(name,hours,period,amount,excess,code)=>req('POST','/api/clients',{
  name,plate:'',client_code:code,kind:'pension',discount_bps:0,
  valid_from:START,valid_to:'2099-12-31T23:59:59.000Z',
  window_start:'08:00',window_end:'20:00',notes:'',active:true,
  pension_hours:hours,pension_excess_cents:excess,
  pension_period:period,pension_price_cents:amount,pension_start_at:START,
  opening_debt_cents:5000
 });
 return {db,req,create,advance:hours=>now+=hours*3600000,close:()=>db.close()};
}
test('RC10: pensión 12 h y 24 h usa tarifa específica, no general',()=>{
 const c={...defaults,hourlyCents:99999,nightSurchargeCents:77777};
 for(const h of [12,24]){
  const b={kind:'pension',valid_from:START,valid_to:'2099-12-31T23:59:59.000Z',pension_hours:h,pension_excess_cents:3300};
  const at=ms=>new Date(Date.parse(START)+ms).toISOString();
  assert.equal(stayPrice(START,at(h*3600000),c,b),0);
  assert.equal(stayPrice(START,at(h*3600000+1000),c,b),3300);
  assert.equal(stayPrice(START,at(2*h*3600000),c,b),3300);
  assert.equal(stayPrice(START,at(2*h*3600000+1000),c,b),6600);
  assert.equal(stayPrice(START,at(5*h*3600000),c,{...b,pension_excess_cents:0}),0);
 }
});
test('RC12: clientes individuales nuevos se cobran sólo por semana, sin tarifa por horas',async()=>{
 const r=setup();try{
  const a=await r.create('Ana',12,'weekly',60000,2500,'PANA12');
  const b=await r.create('Beto',24,'monthly',280000,0,'PBETO24');
  const clients=await r.req('GET','/api/clients'),ana=clients.find(x=>x.id===a.id),beto=clients.find(x=>x.id===b.id);
  assert.equal(ana.contract.period,'weekly');assert.equal(beto.contract.period,'weekly');
  assert.equal(ana.pension_weekly_unlimited,1);assert.equal(ana.pension_excess_cents,0);
  assert.equal(ana.balance_cents,65000);assert.equal(beto.balance_cents,285000);
  assert.equal(r.db.prepare('SELECT COUNT(*) n FROM all_payments').get().n,0);
  await r.req('POST','/api/shift/open',{opening_cents:0,shift_type:'DAY'});
  const entry=await r.req('POST','/api/entry',{client_id:ana.id});
  const snap=JSON.parse(r.db.prepare('SELECT benefit_snapshot FROM tickets WHERE code=?').get(entry.code).benefit_snapshot);
  assert.equal(snap.pension_weekly_unlimited,1);
  r.advance(40);const q=await r.req('GET','/api/ticket/'+entry.code);
  assert.equal(q.estimated_cents,0);
  const update={...ana,pension_period:'weekly',pension_price_cents:300000,pension_start_at:ana.contract.anchor_at};
  await r.req('PUT','/api/clients/'+ana.id,update);
  assert.equal((await r.req('GET','/api/ticket/'+entry.code)).estimated_cents,0);
  const next=await r.req('POST','/api/entry',{client_id:ana.id});
  assert.equal(JSON.parse(r.db.prepare('SELECT benefit_snapshot FROM tickets WHERE code=?').get(next.code).benefit_snapshot).pension_weekly_unlimited,1);
 }finally{r.close()}
});
test('RC10: estancia incluida finaliza sin efectivo, libera plaza y no duplica cobros',async()=>{
 const r=setup();try{
  const p=await r.create('Luisa',12,'weekly',75000,3000,'PLUISA');
  await r.req('POST','/api/shift/open',{opening_cents:0,shift_type:'DAY'});
  const first=await r.req('POST','/api/entry',{client_id:p.id});
  r.advance(3);
  const quotation=await r.req('GET','/api/ticket/'+first.code);
  assert.equal(quotation.estimated_cents,0);
  const paid=await r.req('POST','/api/ticket/'+first.code+'/pay',{method:'efectivo',received_cents:0,expected_cents:0,revision:quotation.revision});
  assert.equal(paid.exit_confirmed,true);assert.equal(paid.charged_cents,0);
  assert.ok(r.db.prepare('SELECT exit_at FROM tickets WHERE code=?').get(first.code).exit_at);
  assert.equal(r.db.prepare('SELECT COUNT(*) n FROM payments WHERE ticket_id=1').get().n,1);
  assert.equal(r.db.prepare('SELECT COALESCE(SUM(amount_cents),0) n FROM payments').get().n,0);
  await assert.rejects(()=>r.req('POST','/api/ticket/'+first.code+'/pay',{method:'efectivo',received_cents:0,expected_cents:0,revision:quotation.revision}),/finalizado/);
 }finally{r.close();}
});
test('RC12: nueva pensión semanal requiere precio positivo; no acepta importes negativos',async()=>{
 const r=setup();try{
  await assert.rejects(()=>r.create('Error',12,'weekly',0,0,'ERR00'),/precio|importe|mayor a cero/);
  await assert.rejects(()=>r.create('Error2',12,'weekly',60000,-1,'ERRNEG'),/inválido|importe/);
  assert.equal(r.db.prepare('SELECT COUNT(*) n FROM clients').get().n,0);
 }finally{r.close()}
});
test('RC10: migración 7 a 8 conserva clientes existentes, contratos y folios',()=>{
 const db=new DatabaseSync(':memory:');try{
  for(const n of ['001-legacy','002-professional','003-clients-print','004-day-night','005-handover','006-recurring-pensions','007-client-prices'])require('../migrations/'+n)(db);
  db.prepare('INSERT INTO clients(name,plate,kind,valid_from,valid_to,window_start,window_end,created_at) VALUES(?,?,?,?,?,?,?,?)').run('Antiguo','PLACA1','pension_day',START,'2099-12-31T23:59:59.000Z','08:00','20:00',START);
  const former=db.prepare('SELECT * FROM clients').get();
  require('../migrations/008-unified-pension')(db);
  const migrated=db.prepare('SELECT * FROM clients').get();
  for(const key of Object.keys(former))assert.equal(former[key],migrated[key]);
  assert.equal(migrated.pension_hours,24);assert.equal(migrated.pension_excess_cents,0);
  assert.equal(migrated.kind,'pension_day');
  require('../migrations/008-unified-pension')(db);
  assert.equal(db.prepare('SELECT max(version) n FROM schema_migrations').get().n,8);
 }finally{db.close();}
});

const {pensionCoverage}=require('../lib/pension-coverage');
const {buildEntryTicket}=require('../ticket-escpos');
test('RC11: 12 horas empiezan desde el folio, no desde 08:00 o 20:00',()=>{
 const entry='2026-10-12T21:35:00.000Z'; // 14:35 de Tijuana
 const b={kind:'pension',pension_hours:12,pension_excess_cents:4900,
  valid_from:'2026-01-01T00:00:00.000Z',valid_to:'2099-12-31T23:59:59.000Z',window_start:'08:00',window_end:'20:00'};
 const cover=pensionCoverage(entry,b);
 assert.equal(cover.from,entry);
 assert.equal(cover.until,'2026-10-13T09:35:00.000Z'); // 02:35 mañana en Tijuana
 assert.equal(stayPrice(entry,cover.until,{...defaults,hourlyCents:99999,nightSurchargeCents:99999},b),0);
 assert.equal(stayPrice(entry,'2026-10-13T09:35:01.000Z',defaults,b),4900);
 assert.equal(stayPrice(entry,'2026-10-13T21:35:00.000Z',defaults,b),4900);
});
test('RC12: entradas nuevas no vencen por 12/24 horas; beneficio histórico sí conserva su fecha',async()=>{
 const r=setup();try{
  const c=await r.create('Elena',12,'weekly',40000,1800,'ELENA12');
  await r.req('POST','/api/shift/open',{opening_cents:0,shift_type:'DAY'});
  const first=await r.req('POST','/api/entry',{client_id:c.id});
  assert.equal(first.pension_coverage_hours,null);
  assert.equal(first.pension_coverage_until,null);
  r.advance(60);
  assert.equal((await r.req('GET','/api/ticket/'+first.code)).estimated_cents,0);
  const client=(await r.req('GET','/api/clients')).find(x=>x.id===c.id);
  await r.req('PUT','/api/clients/'+c.id,{...client,pension_period:'weekly',pension_price_cents:49000,pension_start_at:client.contract.anchor_at});
  assert.equal((await r.req('GET','/api/ticket/'+first.code)).estimated_cents,0);
  const old={kind:'pension',pension_hours:12,pension_excess_cents:1800,valid_from:START,valid_to:'2099-12-31T23:59:59.000Z'};
  assert.equal(stayPrice(START,new Date(Date.parse(START)+13*3600000).toISOString(),defaults,old),1800);
 }finally{r.close()}
});
test('RC11: boleto original y copia interna muestran el mismo vencimiento y folio',()=>{
 const entryAt='2026-10-12T21:35:00.000Z',pensionCoverageUntil='2026-10-13T09:35:00.000Z';
 const props={name:'LIBRA 3',code:'001',entryAt,pensionCoverageUntil,pensionCoverageHours:12};
 const original=buildEntryTicket({...props,copy:'CUSTOMER'}).toString('latin1');
 const internal=buildEntryTicket({...props,copy:'INTERNAL'}).toString('latin1');
 for(const ticket of [original,internal]){
  assert.match(ticket,/PENSION 12/);assert.match(ticket,/02:35:00/);assert.match(ticket,/001/);
 }
 assert.ok(original.length>internal.length);
 assert.ok(!buildEntryTicket({name:'LIBRA 3',code:'002',entryAt}).toString('latin1').includes('PENSION'));
});
test('RC11: 24 horas es duración real a través de cambio de horario, no hora fija',()=>{
 const at='2026-11-01T06:30:00.000Z';
 const b={kind:'pension',pension_hours:24,pension_excess_cents:2000,valid_from:'2026-01-01T00:00:00.000Z',valid_to:'2099-12-31T23:59:59.000Z'};
 const until=new Date(Date.parse(at)+86400000).toISOString();
 assert.equal(pensionCoverage(at,b).until,until);
 assert.equal(stayPrice(at,until,defaults,b),0);
 assert.equal(stayPrice(at,new Date(Date.parse(until)+1000).toISOString(),defaults,b),2000);
});
