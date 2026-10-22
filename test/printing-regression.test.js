'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const {createApp}=require('../server');
const {buildEntryTicket}=require('../ticket-escpos');
const {buildReport}=require('../lib/print-report');
const {buildDrawerPulse}=require('../lib/cash-drawer');
const {PersistentSpooler}=require('../lib/print-spooler');

async function fixture(t,overrides={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'parking-print-regression-'));
 const entries=[];
 const ctx=await createApp({dir,printEntry:async(...args)=>entries.push(args),printReport:async()=>{},...overrides});
 const server=ctx.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 let cookie='';
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));await ctx.close();fs.rmSync(dir,{recursive:true,force:true});});
 async function req(url,body,method=body===undefined?'GET':'POST',key=crypto.randomUUID()){
  const headers={'Content-Type':'application/json',Cookie:cookie};if(key)headers['Idempotency-Key']=key;
  const response=await fetch('http://127.0.0.1:'+server.address().port+url,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
  return {status:response.status,body:await response.json()};
 }
 assert.equal((await req('/api/auth/setup',{username:'dueno',password:'1357'})).status,201);
 const cfg=(await req('/api/config')).body;
 assert.equal((await req('/api/config',{...cfg,printerName:'TERMICA'},'PUT')).status,200);
 assert.equal((await req('/api/shift/open',{opening_cents:10000})).status,201);
 const code=(await req('/api/entry',{})).body.code;entries.length=0;
 return {...ctx,req,code,entries,dir,server,baseURL:'http://127.0.0.1:'+server.address().port,cookie:()=>cookie};
}

test('Reimpresión: el dueño imprime una copia marcada y el reintento no duplica envío ni venta',async t=>{
 const f=await fixture(t),key=crypto.randomUUID(),body={reason:'Cliente extravió su copia'};
 const first=await f.req('/api/ticket/'+f.code+'/reprint',body,'POST',key);
 assert.equal(first.status,200);assert.equal(first.body.printed,true);
 const replay=await f.req('/api/ticket/'+f.code+'/reprint',body,'POST',key);
 assert.equal(replay.body.replayed,true);assert.equal(f.entries.length,1);
 assert.equal(f.entries[0][1],f.code);assert.equal(f.entries[0][3].reprint,true);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM tickets').get().n,1);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM payments').get().n,0);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM reprints').get().n,1);
 const log=f.db.prepare("SELECT * FROM audit WHERE action='REPRINT'").get();
 assert.equal(JSON.parse(log.detail).authorized_by,1);assert.equal(JSON.parse(log.detail).reason,body.reason);
 assert.equal((await f.req('/api/ticket/'+f.code+'/reprint',{reason:'Otra razón'},'POST',key)).status,409);
});

test('Reimpresión: cajero y supervisor requieren autorización de ADMIN sin cambiar de sesión',async t=>{
 const f=await fixture(t);
 for(const role of ['cashier','supervisor'])assert.equal((await f.req('/api/users',{username:role,password:'2468',role})).status,201);
 for(const role of ['cashier','supervisor']){
  await f.req('/api/auth/login',{username:role,password:'2468'});
  assert.equal((await f.req('/api/ticket/'+f.code+'/reprint',{reason:'Comprobar permiso'})).status,403);
  assert.equal((await f.req('/api/ticket/'+f.code+'/reprint',{reason:'Comprobar permiso',authorization_username:'supervisor',authorization_password:'2468'})).status,403);
  const approved=await f.req('/api/ticket/'+f.code+'/reprint',{reason:'Autorización del dueño',authorization_username:'dueno',authorization_pin:'1357'});
  assert.equal(approved.status,200);assert.equal(approved.body.printed,true);
  assert.equal((await f.req('/api/auth/me')).body.user.username,role);
 }
 const logs=f.db.prepare("SELECT * FROM audit WHERE action='REPRINT' ORDER BY id").all();
 assert.deepEqual(logs.map(x=>JSON.parse(x.detail).authorized_by),[1,1]);
 assert.deepEqual(logs.map(x=>x.user_id),[2,3]);
});

test('Reimpresión: requiere motivo e identificador y un fallo de envío no se repite automáticamente',async t=>{
 let calls=0,fail=false;
 const f=await fixture(t,{printEntry:async()=>{if(fail){calls++;throw Error('No se confirmó en Windows');}}});fail=true;
 assert.equal((await f.req('/api/ticket/'+f.code+'/reprint',{reason:''})).status,409);
 assert.equal((await f.req('/api/ticket/'+f.code+'/reprint',{reason:'Sin identificador'},'POST','')).status,409);
 const body={reason:'Recuperar boleto'},key=crypto.randomUUID();
 const failed=await f.req('/api/ticket/'+f.code+'/reprint',body,'POST',key);
 assert.equal(failed.status,200);assert.equal(failed.body.printed,false);assert.match(failed.body.printError,/Comprueba la impresora/);
 assert.equal((await f.req('/api/ticket/'+f.code+'/reprint',body,'POST',key)).body.replayed,true);
 assert.equal(calls,1);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM reprints').get().n,0);
 assert.equal(f.db.prepare("SELECT COUNT(*) n FROM audit WHERE action='REPRINT_FAILED'").get().n,1);
});

test('Reimpresión: solicitudes simultáneas con misma clave reservan un único envío',async t=>{
 let release,started;const waiting=new Promise(resolve=>started=resolve);
 let blocking=false,calls=0;
 const f=await fixture(t,{printEntry:async()=>{if(blocking){calls++;started();await new Promise(resolve=>release=resolve);}}});blocking=true;
 const key=crypto.randomUUID(),body={reason:'Autorizada una sola copia'};
 const first=f.req('/api/ticket/'+f.code+'/reprint',body,'POST',key);
 await waiting;
 const second=await f.req('/api/ticket/'+f.code+'/reprint',body,'POST',key);
 assert.equal(second.body.replayed,true);assert.equal(second.body.pending,true);
 release();assert.equal((await first).body.printed,true);assert.equal(calls,1);
});

test('Cierre: un socket abortado no cierra SQLite mientras la reimpresión termina su auditoría',async t=>{
 let blocking=false,release,announce;
 const started=new Promise(resolve=>announce=resolve);
 const f=await fixture(t,{printEntry:async()=>{if(blocking){await new Promise(resolve=>{release=resolve;announce();});}}});blocking=true;
 const controller=new AbortController(),key=crypto.randomUUID();
 const request=fetch(f.baseURL+'/api/ticket/'+f.code+'/reprint',{
  method:'POST',signal:controller.signal,
  headers:{'Content-Type':'application/json',Cookie:f.cookie(),'Idempotency-Key':key},
  body:JSON.stringify({reason:'Copia autorizada antes de cerrar'})
 }).catch(error=>error);
 await started;
 controller.abort();await request;
 await new Promise(resolve=>{f.server.close(resolve);f.server.closeAllConnections();});
 let completed=false;
 const closing=f.close().then(()=>completed=true);
 try{
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(completed,false,'Debe esperar al handler aunque su socket ya se haya cerrado');
  assert.equal(f.db.open,true);
 }finally{release();await closing;}
 assert.equal(f.db.open,false);
 const db=new (require('better-sqlite3'))(path.join(f.dir,'parking.db'),{readonly:true});
 try{
  assert.equal(db.prepare('SELECT COUNT(*) n FROM reprints').get().n,1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM audit WHERE action='REPRINT'").get().n,1);
  assert.equal(JSON.parse(db.prepare('SELECT response FROM requests WHERE key=?').get(key).response).printed,true);
 }finally{db.close();}
});

test('Última entrada: devuelve el folio original más reciente sin generar tickets ni pagos',async t=>{
 const f=await fixture(t),second=(await f.req('/api/entry',{})).body;
 const result=await f.req('/api/tickets/latest-entry');
 assert.equal(result.status,200);assert.equal(result.body.ticket.code,second.code);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM tickets').get().n,2);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM payments').get().n,0);
});

test('ESC/POS: la reimpresión conserva folio y CODE128 pero nunca dice ORIGINAL',()=>{
 const bytes=buildEntryTicket({code:'001',name:'Parking',entryAt:'2026-10-21T16:00:00.000Z',reprint:true,reprintReason:'Autorización del dueño'});
 const text=bytes.toString('latin1');
 assert.match(text,/REIMPRESION AUTORIZADA/);assert.match(text,/MISMO FOLIO/);assert.doesNotMatch(text,/ORIGINAL - CLIENTE/);
 assert.ok(bytes.includes(Buffer.from([29,107,73,5,123,66,48,48,49])));
});

test('ESC/POS: boleto perdido imprime el recargo y saldo, sin presentarlo como pago',()=>{
 const ticket={code:'002',entry_at:'2026-10-21T16:00:00.000Z',lost_at:'2026-10-21T17:00:00.000Z',lost_cents:20000};
 const bytes=buildReport({name:'Parking',timeZone:'America/Tijuana'},{type:'LOST',ticket,quote:{estimated_cents:22500,minutes:60}});
 const text=bytes.toString('latin1');assert.match(text,/BOLETO PERDIDO/);assert.match(text,/FOLIO 002/);
 assert.match(text,/Cargo por boleto perdido\s+\$200.00/);assert.match(text,/Estacionamiento pendiente\s+\$25.00/);
 assert.match(text,/TOTAL POR COBRAR MXN\s+\$225.00/);assert.match(text,/PENDIENTE DE PAGO/);assert.match(text,/no\s+acredita pago/);
 assert.deepEqual([...bytes.subarray(-3)],[29,86,0]);
});

test('ESC/POS: comprobante de pago distingue USD, tipo de cambio, salida y recargo incluido',()=>{
 const ticket={code:'003',entry_at:'2026-10-21T16:00:00.000Z',exit_at:'2026-10-21T17:00:00.000Z',lost_cents:20000};
 const payments=[{paid_at:ticket.exit_at,kind:'stay',method:'usd',amount_cents:22500,received_usd_cents:2000,usd_rate_used:18.505,change_mxn_cents:14510}];
 const text=buildReport({name:'Parking',timeZone:'America/Tijuana'},{type:'PAYMENT',ticket,payments,reprint:true}).toString('latin1');
 assert.match(text,/COMPROBANTE DE PAGO/);assert.match(text,/REIMPRESION DEL COMPROBANTE/);assert.match(text,/Salida/);
 assert.match(text,/Tipo de cambio\s+18.5050 MXN\/USD/);assert.match(text,/Recibido USD\s+US\$20.00/);
 assert.match(text,/Cambio MXN\s+\$145.10/);assert.match(text,/TOTAL NETO MXN\s+\$225.00/);
});

test('ESC/POS: constancias de boleto perdido pagado o cancelado no solicitan otro cobro',()=>{
 const original={code:'004',entry_at:'2026-10-21T16:00:00.000Z',lost_at:'2026-10-21T17:00:00.000Z',lost_cents:20000,charged_cents:22500};
 for(const [state,label] of [[{paid_at:'2026-10-21T18:00:00.000Z'},'PAGADO'],[{cancelled_at:'2026-10-21T18:00:00.000Z'},'CANCELADO']]){
  const text=buildReport({name:'Parking',timeZone:'America/Tijuana'},{type:'LOST',ticket:{...original,...state},quote:{estimated_cents:0},reprint:true}).toString('latin1');
  assert.match(text,new RegExp(label));assert.doesNotMatch(text,/PENDIENTE DE PAGO|TOTAL POR COBRAR/);
 }
});

function fakeWorker(){
 const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{};
 child.jobs=[];child.stdin.on('data',chunk=>{for(const line of chunk.toString().trim().split('\n')){const job=JSON.parse(line);child.jobs.push(job);setImmediate(()=>child.stdout.write('OK\t'+job.id+'\n'));}});
 setImmediate(()=>child.stdout.write('READY\n'));return child;
}

test('Cajón: el comando corto llega completo a la cola y cumple los mínimos de ambos workers RAW',async()=>{
 const child=fakeWorker(),spool=new PersistentSpooler({spawn:()=>child});
 try{
  const pulse=buildDrawerPulse(1);assert.ok(pulse.includes(Buffer.from([27,112,1,50,50])));
  await spool.send('KARSTCOM',pulse);assert.deepEqual(Buffer.from(child.jobs[0].payload,'base64'),pulse);
  for(const script of ['print-worker.ps1','print-raw.ps1']){
   const source=fs.readFileSync(path.join(__dirname,'..',script),'utf8');
   const minimum=Number(source.match(/\$bytes\.Length -lt (\d+)/)[1]);assert.ok(pulse.length>=minimum,script+' debe aceptar el pulso ESC/POS');
  }
 }finally{spool.close();}
});

test('Cola RAW: la salida tardía del worker anterior no mata el proceso de reemplazo',async()=>{
 const first=fakeWorker(),second=fakeWorker();let starts=0;
 const spool=new PersistentSpooler({spawn:()=>++starts===1?first:second});
 try{
  await spool.warm();first.emit('error',Error('Fallo del primer worker'));
  // READY belongs to each specific worker, so explicitly announce the second
  // only once its startup listeners are attached.
  const replacement=spool.warm();second.stdout.write('READY\n');await replacement;
  first.emit('exit',1);
  await spool.send('TERMICA',Buffer.alloc(20,1));
  assert.equal(starts,2);assert.equal(second.jobs.length,1);assert.equal(spool.ready,true);
 }finally{spool.close();}
});

test('Cola RAW: después de cerrar no inicia un worker ni usa impresión de respaldo',async()=>{
 let starts=0;const spool=new PersistentSpooler({spawn:()=>{starts++;return fakeWorker();}});spool.close();
 await assert.rejects(()=>spool.send('TERMICA',Buffer.alloc(20)),/Impresora detenida/);assert.equal(starts,0);
});

test('Cola RAW: cerrar durante la espera de un worker listo rechaza la petición sin dejarla colgada',async()=>{
 const worker=fakeWorker(),spool=new PersistentSpooler({spawn:()=>worker});
 await spool.warm();
 const printing=spool.send('TERMICA',Buffer.alloc(20));spool.close();
 await assert.rejects(()=>printing,/Impresora detenida/);assert.equal(worker.jobs.length,0);
});
