'use strict';
// Tests reales sobre SQLite integrado en Node; no dependen de Express ni Electron.
const {test}=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const {DatabaseSync}=require('node:sqlite');
const {installOperations}=require('../lib/operations');
const {PersistentSpooler}=require('../lib/print-spooler');
function fixture(){
 const db=new DatabaseSync(':memory:');
 for(const migration of ['001-legacy','002-professional','003-clients-print','004-day-night','005-handover'])require('../migrations/'+migration)(db);
 db.exec('PRAGMA foreign_keys=ON');
 db.transaction=fn=>{const transact=(...args)=>{db.exec('BEGIN IMMEDIATE');try{const result=fn(...args);db.exec('COMMIT');return result}catch(e){db.exec('ROLLBACK');throw e}};transact.immediate=transact;return transact;};
 let stamp=Date.parse('2026-10-12T15:00:00.000Z'),nprints=0;
 const routes=new Map();const app={get:(p,...handlers)=>routes.set('GET '+p,handlers),post:(p,...handlers)=>routes.set('POST '+p,handlers),put:(p,...handlers)=>routes.set('PUT '+p,handlers)};
 const audit=(ticket,action,detail,user)=>db.prepare('INSERT INTO audit(ticket_id,action,at,detail,user_id) VALUES(?,?,?,?,?)').run(ticket,action,new Date(stamp).toISOString(),JSON.stringify(detail),user);
 const ops=installOperations(app,{storage:{db},auth:{allow:()=>((_req,_res,next)=>next())},audit,getPrintSettings:()=>({ticketName:'LIBRA 3'}),printEntry:async()=>{nprints++},printReport:async()=>{},clock:()=>stamp});
 const request=async(method,path,body={},key=crypto.randomUUID(),role='admin')=>{
  const record=[...routes.entries()].find(([name])=>{const [verb,route]=name.split(' ');return verb===method&&(route===path||new RegExp('^'+route.replace(/:[^/]+/g,'[^/]+')+'$').test(path))});
  assert.ok(record,'Ruta no encontrada: '+method+' '+path);
  const [route,handlers]=record;let status=200,result;
  const vars=route.split(' ')[1].split('/'),parts=path.split('/'),params={};vars.forEach((v,i)=>{if(v.startsWith(':'))params[v.slice(1)]=parts[i]});
  const req={params,body,headers:{'idempotency-key':key},user:{id:1,role},query:{}};
  const res={status(code){status=code;return this},json(obj){result=obj;return this}};
  let caught;
  const next=e=>{if(e)caught=e};
  for(const handler of handlers){await handler(req,res,next);if(caught)break;}
  if(caught)throw caught;
  return {status,body:result};
 };
 return {db,request,ops,advance:minutes=>{stamp+=minutes*60000},prints:()=>nprints,close:()=>db.close()};
}
test('RC3: abrir sin dólares, registrar entrada, cobrar y liberar espacio en una sola transacción',async()=>{
 const f=fixture();try{
  const a=await f.request('POST','/api/shift/open',{opening_cents:100000});assert.equal(a.status,201);
  const shift=(await f.request('GET','/api/shift')).body.shift;
  assert.equal(shift.opening_cents,100000);assert.equal(shift.opening_usd_cents,0);assert.equal(shift.usd_rate,null);
  const entry=await f.request('POST','/api/entry',{});assert.equal(entry.status,201);assert.equal(f.prints(),0,'impresora no configurada');
  const code=entry.body.code;assert.equal((await f.request('GET','/api/summary')).body.active,1);
  f.advance(35);
  const quote=(await f.request('GET','/api/ticket/'+code)).body;
  const paid=await f.request('POST','/api/ticket/'+code+'/pay',{method:'efectivo',received_cents:10000,expected_cents:quote.estimated_cents,revision:quote.revision,expected_usd_rate:null});
  assert.equal(paid.status,200);assert.equal(paid.body.exit_confirmed,true);
  const ticket=f.db.prepare('SELECT paid_at,exit_at FROM tickets WHERE code=?').get(code);
  assert.equal(ticket.paid_at,ticket.exit_at);
  assert.equal((await f.request('GET','/api/summary')).body.active,0);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM payments').get().n,1);
  await assert.rejects(f.request('POST','/api/ticket/'+code+'/pay',{method:'efectivo',received_cents:10000,expected_cents:quote.estimated_cents,revision:quote.revision}),/Boleto finalizado/);
  const next=await f.request('POST','/api/entry',{});assert.equal(next.status,201);
  assert.notEqual(next.body.code,code);
 }finally{f.close()}
});
test('RC3: cobrar y salir es idempotente con el mismo identificador; corte X/Z no pierde historial',async()=>{
 const f=fixture();try{
  const shift=(await f.request('POST','/api/shift/open',{opening_cents:50000})).body.id;
  const t=(await f.request('POST','/api/entry',{})).body;f.advance(65);
  const q=(await f.request('GET','/api/ticket/'+t.code)).body;
  const payment={method:'efectivo',received_cents:20000,expected_cents:q.estimated_cents,revision:q.revision};
  const key=crypto.randomUUID();const a=await f.request('POST','/api/ticket/'+t.code+'/pay',payment,key);
  const b=await f.request('POST','/api/ticket/'+t.code+'/pay',payment,key);
  assert.equal(a.body.exit_confirmed,true);assert.equal(b.body.replayed,true);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM payments').get().n,1);
  const x=(await f.request('GET','/api/shift/x')).body.shift;
  const z=await f.request('POST','/api/shift/close',{shift_id:shift,declared_cents:x.expected_cents,declared_usd_cents:0});
  assert.equal(z.body.difference_cents,0);assert.equal(z.body.difference_usd_cents,0);
  assert.equal((await f.request('GET','/api/shift')).body.shift,null);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM tickets').get().n,1);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM audit WHERE action=?').get('PAYMENT_AND_EXIT').n,1);
 }finally{f.close()}
});
test('RC3: turno permite dólar durante el turno aunque la apertura no pregunte cambio',async()=>{
 const f=fixture();try{
  await f.request('POST','/api/shift/open',{opening_cents:100000});
  const changed=await f.request('PUT','/api/shift/usd-rate',{usd_rate:16.5});
  assert.equal(changed.body.shift.usd_rate,16.5);
  const t=(await f.request('POST','/api/entry',{})).body;f.advance(75);
  const q=(await f.request('GET','/api/ticket/'+t.code)).body;
  const paid=await f.request('POST','/api/ticket/'+t.code+'/pay',{method:'usd',received_usd_cents:1000,expected_usd_rate:16.5,revision:q.revision,expected_cents:q.estimated_cents});
  assert.equal(paid.body.exit_confirmed,true);assert.equal((await f.request('GET','/api/shift')).body.shift.received_usd_cents,1000);
 }finally{f.close()}
});
function fakePowerShell(){
 const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.kill=()=>{};
 let commands='';child.stdin.on('data',bytes=>{commands+=bytes.toString();while(commands.includes('\n')){const i=commands.indexOf('\n'),line=commands.slice(0,i);commands=commands.slice(i+1);const msg=JSON.parse(line);setImmediate(()=>child.stdout.write('OK\t'+msg.id+'\n'));}});
 setImmediate(()=>child.stdout.write('READY\n'));
 return child;
}
test('RC3: servicio RAW mantiene un proceso para varios tickets y entrega ordenada',async()=>{
 let started=0;
 const spool=new PersistentSpooler({spawn:()=>{started++;return fakePowerShell()}});
 try{
  await spool.warm();
  await Promise.all([spool.send('TERMICA',Buffer.alloc(80,1)),spool.send('TERMICA',Buffer.alloc(64,2))]);
  assert.equal(started,1);
 }finally{spool.close()}
});
test('RC3: un error RAW no reimprime automáticamente ni duplica un ticket',async()=>{
 let jobs=0;const child=new EventEmitter();
 child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.kill=()=>{};
 let partial='';
 child.stdin.on('data',chunk=>{partial+=chunk.toString();while(partial.includes('\n')){const i=partial.indexOf('\n'),row=partial.slice(0,i);partial=partial.slice(i+1);const d=JSON.parse(row);jobs++;setImmediate(()=>child.stdout.write('ERR\t'+d.id+'\tImpresora sin papel\n'));}});
 const spool=new PersistentSpooler({spawn:()=>{setImmediate(()=>child.stdout.write('READY\n'));return child}});
 try{
  await assert.rejects(()=>spool.send('POS80',Buffer.alloc(90,1)),/Impresora sin papel/);
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(jobs,1,'El sistema no debe repetir automáticamente una impresión ambigua');
 }finally{spool.close()}
});
