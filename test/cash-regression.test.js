'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {installOperations}=require('../lib/operations');
const {defaults}=require('../lib/rates');
const {passwordHash,verify}=require('../lib/auth');
const {createAdminAuthorizer}=require('../lib/authorization');

function rig(t){
 const db=new DatabaseSync(':memory:');
 for(const v of ['001-legacy','002-professional','003-clients-print','004-day-night','005-handover','006-recurring-pensions','007-client-prices','008-unified-pension','009-manual-pension-debts'])require('../migrations/'+v)(db);
 db.exec('PRAGMA foreign_keys=ON');
 db.transaction=fn=>{const run=(...args)=>{db.exec('BEGIN IMMEDIATE');try{const r=fn(...args);db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}};run.immediate=run;return run;};
 const admin={id:1,username:'owner',role:'admin'},cashier={id:2,username:'cashier',role:'cashier'},supervisor={id:3,username:'supervisor',role:'supervisor'};
 for(const u of [admin,cashier,supervisor])db.prepare('INSERT INTO users(id,username,password_hash,role,created_at) VALUES(?,?,?,?,?)').run(u.id,u.username,passwordHash('2468'),u.role,'2026-10-22T05:00:00.000Z');
 let clock=Date.parse('2026-10-22T06:55:00.000Z'),printerFailure=false;
 const routes=[],prints=[],drawer=[];
 const app=Object.fromEntries(['get','post','put'].map(method=>[method,(route,...handlers)=>routes.push({method:method.toUpperCase(),route,handlers})]));
 const audit=(ticket,action,detail,user)=>db.prepare('INSERT INTO audit(ticket_id,action,at,detail,user_id) VALUES(?,?,?,?,?)').run(ticket,action,new Date(clock).toISOString(),JSON.stringify(detail),user);
 installOperations(app,{storage:{db},auth:{allow:(...roles)=>(req,res,next)=>roles.includes(req.user.role)?next():next(Error('Sin permiso'))},audit,getPrintSettings:()=>({autoCut:true,cashDrawerEnabled:true}),clock:()=>clock,printEntry:async()=>{},openDrawer:async()=>drawer.push(true),printReport:async(cfg,data)=>{
  // A receipt cannot be sent before the payment/exit is committed.
  if(data.type==='PAYMENT')assert.ok(db.prepare('SELECT exit_at FROM tickets WHERE code=?').get(data.ticket.code).exit_at);
  prints.push(data);
  if(printerFailure)throw Error('Impresora desconectada');
 }});
 async function req(method,url,body={},key=crypto.randomUUID(),user=admin){
  const route=routes.find(r=>r.method===method&&new RegExp('^'+r.route.replace(/:[^/]+/g,'[^/]+')+'$').test(url));
  assert.ok(route,url);
  const params={},parts=url.split('/');route.route.split('/').forEach((p,i)=>{if(p[0]===':')params[p.slice(1)]=parts[i];});
  const request={method,path:url,params,body,query:{},headers:{'idempotency-key':key},user};
  let result,error;const response={status(){return this;},json(value){result=value;return this;}};
  for(const handler of route.handlers){await handler(request,response,e=>{if(e)error=e;});if(error)throw error;}
  return result;
 }
 const quote=code=>req('GET','/api/ticket/'+code);
 async function pay(code,extra={},key){const q=await quote(code);return req('POST','/api/ticket/'+code+'/pay',{revision:q.revision,expected_cents:q.estimated_cents,received_cents:q.estimated_cents,...extra},key);}
 async function open(type='DAY',extra={}){return req('POST','/api/shift/open',{shift_type:type,opening_cents:100000,...extra});}
 async function entry(){return (await req('POST','/api/entry')).code;}
 t.after(()=>db.close());
 db.prepare("INSERT INTO config(key,value) VALUES('rates',?)").run(JSON.stringify({...defaults,printerName:'TEST POS80',autoPrint:false}));
 return {db,req,quote,pay,open,entry,prints,drawer,admin,cashier,supervisor,advance:minutes=>clock+=minutes*60000,failPrinter:value=>printerFailure=value};
}

test('Ventas por turno continúan al pasar medianoche y se reinician sólo al cerrar/abrir',async t=>{
 const r=rig(t);const day=await r.open();const first=await r.entry();r.advance(1);await r.pay(first);
 const before=await r.req('GET','/api/summary');assert.equal(before.paidShift.cents,2500);
 r.advance(10); // Pass midnight in America/Tijuana without closing the shift.
 const midnight=await r.req('GET','/api/summary');assert.equal(midnight.shift_id,day.id);assert.equal(midnight.paidShift.cents,2500);assert.equal(midnight.paidToday.cents,0);
 const s=(await r.req('GET','/api/shift')).shift;
 await r.req('POST','/api/shift/close',{shift_id:day.id,declared_cents:s.expected_cents,declared_usd_cents:0});
 assert.deepEqual((await r.req('GET','/api/summary')).paidShift,{n:0,cents:0});
 const next=await r.open('NIGHT');const zero=await r.req('GET','/api/summary');assert.equal(zero.shift_id,next.id);assert.equal(zero.paidShift.cents,0);
 assert.equal(r.db.prepare('SELECT SUM(amount_cents) cents FROM all_payments').get().cents,2500);
});

test('Cobro MXN/USD y cierre registran efectivo real, cambio y diferencias por divisa',async t=>{
 const r=rig(t);const shift=await r.open('DAY',{opening_usd_cents:500,usd_rate:18.505});
 const mxn=await r.entry();r.advance(1);await r.pay(mxn,{received_cents:5000});
 const usd=await r.entry();r.advance(1);await r.pay(usd,{method:'usd',received_usd_cents:2000,expected_usd_rate:18.505});
 const s=(await r.req('GET','/api/shift')).shift;
 assert.equal(s.sales_cents,5000);assert.equal(s.expected_cents,67990);assert.equal(s.expected_usd_cents,2500);
 const close=await r.req('POST','/api/shift/close',{shift_id:shift.id,declared_cents:67900,declared_usd_cents:2400});
 assert.equal(close.difference_cents,-90);assert.equal(close.difference_usd_cents,-100);
 assert.equal((await r.req('GET','/api/shift/next')).previous_usd_rate,18.505);
 await r.open('NIGHT');const fresh=(await r.req('GET','/api/shift')).shift;
 assert.equal(fresh.sales_cents,0);assert.equal(fresh.opening_usd_cents,0);assert.equal(fresh.expected_usd_cents,0);
});

test('Noche puede cerrar con conciliación Día pendiente sin inventar cambio de moneda',async t=>{
 const r=rig(t);const day=await r.open();const inherited=await r.entry();r.advance(2);
 await r.req('POST','/api/shift/close',{shift_id:day.id,declared_cents:100000});
 const night=await r.open('NIGHT',{usd_rate:18.5});await r.pay(inherited,{method:'usd',received_usd_cents:2000,expected_usd_rate:18.5});
 const s=(await r.req('GET','/api/shift')).shift;
 assert.equal(s.pending_day_settlement_cents,2500);
 const closed=await r.req('POST','/api/shift/close',{shift_id:night.id,declared_cents:s.expected_cents,declared_usd_cents:s.expected_usd_cents});
 assert.equal(closed.difference_cents,0);assert.equal(closed.difference_usd_cents,0);assert.equal(closed.pending_day_settlement_cents,2500);
 assert.equal(r.db.prepare('SELECT COUNT(*) n FROM cash_movements').get().n,0);
 assert.equal(r.db.prepare('SELECT COUNT(*) n FROM all_payments').get().n,1);
});

test('Confirmar pago imprime una vez, pulso de cajón una vez y replay conserva estado',async t=>{
 const r=rig(t);await r.open();const code=await r.entry();r.advance(1);const q=await r.quote(code),key=crypto.randomUUID();
 const body={revision:q.revision,expected_cents:q.estimated_cents,received_cents:5000};
 const [one,two]=await Promise.all([r.req('POST','/api/ticket/'+code+'/pay',body,key),r.req('POST','/api/ticket/'+code+'/pay',body,key)]);
 assert.equal(one.receipt_printed,true);assert.equal(r.prints.length,1);assert.equal(r.prints[0].type,'PAYMENT');assert.equal(r.drawer.length,1);assert.equal(two.replayed,true);
 const replay=await r.req('POST','/api/ticket/'+code+'/pay',body,key);assert.equal(replay.receipt_printed,true);assert.equal(replay.drawer_sent,true);
 assert.equal(r.db.prepare('SELECT COUNT(*) n FROM payments').get().n,1);
});

test('Falla impresión no revierte cobro; reimprimir sólo comprobante no duplica ingreso',async t=>{
 const r=rig(t);await r.open();const code=await r.entry();r.advance(1);r.failPrinter(true);
 const q=await r.quote(code),body={revision:q.revision,expected_cents:q.estimated_cents,received_cents:2500},key=crypto.randomUUID();
 const paid=await r.req('POST','/api/ticket/'+code+'/pay',body,key);assert.equal(paid.receipt_printed,false);assert.match(paid.receipt_warning,/Pago guardado/);assert.ok((await r.quote(code)).exit_at);
 const replay=await r.req('POST','/api/ticket/'+code+'/pay',body,key);assert.equal(replay.receipt_printed,false);assert.match(replay.receipt_warning,/desconectada/);assert.equal(r.prints.length,1);
 r.failPrinter(false);const retry=crypto.randomUUID();
 const receipt=await r.req('POST','/api/ticket/'+code+'/receipt/print',{},retry);assert.equal(receipt.receipt_printed,true);
 await r.req('POST','/api/ticket/'+code+'/receipt/print',{},retry);assert.equal(r.prints.length,2);assert.equal(r.prints[1].reprint,true);
 assert.equal(r.db.prepare('SELECT COUNT(*) n FROM payments').get().n,1);assert.equal((await r.req('GET','/api/shift')).shift.sales_cents,2500);
});

test('Boleto perdido imprime al marcar, no duplica recargo y permite reintento explícito',async t=>{
 const r=rig(t);await r.open();const code=await r.entry();r.advance(1);const key=crypto.randomUUID(),body={reason:'Cliente extravió el boleto'};
 const lost=await r.req('POST','/api/ticket/'+code+'/lost',body,key);assert.equal(lost.receipt_printed,true);assert.equal(lost.lost_cents,20000);assert.equal(lost.estimated_cents,22500);
 await r.req('POST','/api/ticket/'+code+'/lost',body,key);
 const again=await r.req('POST','/api/ticket/'+code+'/lost',body);assert.equal(again.already_lost,true);assert.equal(r.prints.length,1);assert.equal(r.prints[0].type,'LOST');
 await r.req('POST','/api/ticket/'+code+'/lost/print',{});assert.equal(r.prints.length,2);assert.equal(r.prints[1].reprint,true);
 assert.equal(r.db.prepare('SELECT COUNT(*) n FROM all_payments').get().n,0);await r.pay(code);assert.equal((await r.req('GET','/api/shift')).shift.sales_cents,22500);
});

test('Arqueo opcional valida su suma sin exigir denominaciones para cerrar',async t=>{
 const r=rig(t);const shift=await r.open();
 await assert.rejects(r.req('POST','/api/shift/close',{shift_id:shift.id,declared_cents:100000,declared_usd_cents:0,denomination_detail:{MXN:[{value_cents:50000,count:1}],USD:[]}}),/arqueo en MXN/);
 assert.equal((await r.req('GET','/api/shift')).shift.closed_at,null);
 const close=await r.req('POST','/api/shift/close',{shift_id:shift.id,declared_cents:99900});assert.equal(close.difference_cents,-100);assert.equal(close.declared_usd_cents,0);
});

test('PIN sencillo, claves anteriores y autorización exclusiva del administrador',async t=>{
 const r=rig(t);const authorize=createAdminAuthorizer(r.db);
 const short=passwordHash('2468'),old=passwordHash('ClaveAnterior123');assert.equal(verify('2468',short),true);assert.equal(verify('ClaveAnterior123',old),true);assert.throws(()=>passwordHash('123'));
 assert.equal(verify('2468','corrupt'),false);
 assert.equal(authorize({user:r.admin,body:{}}).id,r.admin.id);
 assert.throws(()=>authorize({user:r.cashier,body:{}}),/administrador/);
 assert.throws(()=>authorize({user:r.cashier,body:{authorization_username:'supervisor',authorization_password:'2468'}}),/administrador/);
 assert.equal(authorize({user:r.cashier,body:{authorization_username:'owner',authorization_pin:'2468'}}).id,r.admin.id);
 assert.equal(authorize({user:r.supervisor,body:{authorization_username:'owner',authorization_password:'2468'}}).id,r.admin.id);
 for(let i=0;i<8;i++)assert.throws(()=>authorize({user:r.cashier,body:{authorization_username:'owner',authorization_password:'0000'}}));
 assert.throws(()=>authorize({user:r.cashier,body:{authorization_username:'owner',authorization_password:'2468'}}),/Demasiados/);
});

test('Cerrar con petición de cobro abortada espera impresión y auditoría antes de cerrar SQLite',async t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const {setImmediate}=require('node:timers/promises');
 const {createApp}=require('../server');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'parking-shutdown-payment-'));
 let releasePrint,signalPrint;
 const printStarted=new Promise(resolve=>{signalPrint=resolve;});
 const printRelease=new Promise(resolve=>{releasePrint=resolve;});
 let clock=Date.parse('2026-10-22T15:00:00.000Z');
 const ctx=await createApp({dir,clock:()=>clock,openDrawer:async()=>{},printEntry:async()=>{},printReport:async()=>{signalPrint();await printRelease;}});
 const server=ctx.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const origin='http://127.0.0.1:'+server.address().port;let cookie='';
 const controller=new AbortController();
 t.after(async()=>{
  releasePrint();controller.abort();
  if(server.listening){await new Promise(resolve=>{server.close(resolve);server.closeIdleConnections();});}
  if(ctx.db.open)await ctx.close();
  fs.rmSync(dir,{recursive:true,force:true});
 });
 async function request(url,body,method='POST'){
  const response=await fetch(origin+url,{method,headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID(),Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body)});
  if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
  const data=await response.json();assert.equal(response.ok,true,JSON.stringify(data));return data;
 }
 await request('/api/auth/setup',{username:'owner',password:'2468'});
 await request('/api/config',{...defaults,printerName:'TEST POS80',autoPrint:false},'PUT');
 await request('/api/shift/open',{opening_cents:100000,shift_type:'DAY'});
 const entry=await request('/api/entry',{});clock+=60000;
 const q=await request('/api/ticket/'+entry.code,undefined,'GET'),key=crypto.randomUUID();
 const payment=fetch(origin+'/api/ticket/'+entry.code+'/pay',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json','Idempotency-Key':key,Cookie:cookie},body:JSON.stringify({revision:q.revision,expected_cents:q.estimated_cents,received_cents:q.estimated_cents})}).catch(error=>error);
 await printStarted;controller.abort();await payment;
 await new Promise(resolve=>{server.close(resolve);server.closeIdleConnections();});
 let closed=false;const closing=ctx.close().then(()=>{closed=true;});
 await setImmediate();
 assert.equal(closed,false,'La impresión pendiente debe mantener SQLite abierto aunque ya no haya socket');
 assert.equal(ctx.db.open,true);
 assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM payments').get().n,1);
 releasePrint();await closing;assert.equal(ctx.db.open,false);
 const saved=new DatabaseSync(path.join(dir,'parking.db'),{readOnly:true});
 try{
  assert.equal(saved.prepare("SELECT COUNT(*) n FROM audit WHERE action='PAYMENT_PRINT_SENT'").get().n,1);
  assert.equal(JSON.parse(saved.prepare('SELECT response FROM requests WHERE key=?').get(key).response).receipt_state,'sent');
  assert.equal(saved.prepare('SELECT COUNT(*) n FROM payments').get().n,1);
 }finally{saved.close();}
});
