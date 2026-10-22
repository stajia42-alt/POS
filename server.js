'use strict';
const express=require('express'),path=require('path'),crypto=require('crypto');
const {shared:printSpooler}=require('./lib/print-spooler');
const {buildEntryTicket,parseLogo}=require('./ticket-escpos');
const {pensionCoverage}=require('./lib/pension-coverage');
const {openStorage}=require('./lib/storage');
const {installAuth}=require('./lib/auth');
const {installOperations}=require('./lib/operations');
const {buildReport}=require('./lib/print-report');
const {createAdminAuthorizer}=require('./lib/authorization');
async function createApp(options={}) {
 const storage=await openStorage(options.dir||process.env.PARKING_DATA_DIR||path.join(process.env.LOCALAPPDATA||__dirname,'ParkingPOS'));
 const db=storage.db,app=express(),now=()=>new Date(options.clock?options.clock():Date.now()).toISOString();
 app.disable('x-powered-by');app.use(express.json({limit:'256kb'}));
 app.use((req,res,next)=>{if(app.locals.closing&&req.path.startsWith('/api/'))return res.status(503).json({error:'Parking POS se está cerrando. Espera a que termine.'});if(app.locals.maintenance&&req.path.startsWith('/api/'))return res.status(503).json({error:'Restauración preparada: reinicia el servidor'});next();});
 app.get('/api/health',(req,res)=>res.json({ok:true,version:'1.0.11-caja-turnos-rc13',maintenance:!!app.locals.maintenance}));
 const audit=(ticket,action,detail,user)=>db.prepare('INSERT INTO audit(ticket_id,action,at,detail,user_id) VALUES(?,?,?,?,?)').run(ticket,action,now(),JSON.stringify(detail||{}),user||null);
 const auth=installAuth(app,db,audit);
 const bad=(res,msg,status=400)=>res.status(status).json({error:msg});
const defaultPrintSettings={ticketName:'',address:'',policies:'',autoCut:true,logo:null,cashDrawerEnabled:true,cashDrawerPin:0};
const getPrintSettings=()=>({...defaultPrintSettings,...JSON.parse(db.prepare("SELECT value FROM config WHERE key='ticket_print'").get()?.value||'{}')});
app.get('/api/print-settings',(req,res)=>{const c=getPrintSettings();res.json({...c,logo:c.logo?{widthBytes:c.logo.widthBytes,height:c.logo.height,data:c.logo.data}:null});});
app.put('/api/print-settings',auth.allow('admin','supervisor'),(req,res)=>{
 try {
  const {ticketName,address,policies,autoCut,logo,cashDrawerEnabled,cashDrawerPin}=req.body||{};
  if(typeof ticketName!=='string'||ticketName.length>100||typeof address!=='string'||address.length>300||typeof policies!=='string'||policies.length>1200||typeof autoCut!=='boolean')return bad(res,'Datos del boleto inválidos');
  const prior=getPrintSettings();
  if(logo!==undefined&&logo!==null)parseLogo(logo);
  if(cashDrawerEnabled!==undefined&&typeof cashDrawerEnabled!=='boolean')return bad(res,'Configuración del cajón inválida');
  if(cashDrawerPin!==undefined&&![0,1].includes(cashDrawerPin))return bad(res,'Pin del cajón inválido');
  const next={ticketName:ticketName.trim(),address:address.replace(/[\x00-\x08\x0b-\x1f\x7f]/g,' ').trim(),policies:policies.replace(/[\x00-\x08\x0b-\x1f\x7f]/g,' ').trim(),autoCut,logo:logo===undefined?prior.logo:logo,cashDrawerEnabled:cashDrawerEnabled===undefined?prior.cashDrawerEnabled:cashDrawerEnabled,cashDrawerPin:cashDrawerPin===undefined?prior.cashDrawerPin:cashDrawerPin};
  db.prepare("INSERT INTO config(key,value) VALUES('ticket_print',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(next));
  res.json({ok:true});
 }catch(e){bad(res,e.message);}
});

 const sendEntry=options.printEntry||((cfg,code,at,settings)=>new Promise((ok,fail)=>printTicket(cfg,code,at,e=>e?fail(e):ok(),settings)));
 const ops=installOperations(app,{storage,auth,audit,getPrintSettings,clock:options.clock,
  openDrawer:options.openDrawer||((cfg,settings)=>printSpooler.send(cfg.printerName,require('./lib/cash-drawer').buildDrawerPulse(settings.cashDrawerPin))),
  printEntry:sendEntry,
  printReport:options.printReport||((cfg,data,settings)=>printSpooler.send(cfg.printerName,buildReport(cfg,data,settings)))
 });
 const getCfg=ops.getCfg;
 app.get('/api/tickets/latest-entry',(req,res)=>res.json({ticket:db.prepare('SELECT code,entry_at,plate FROM tickets ORDER BY id DESC LIMIT 1').get()||null}));
app.get('/api/print/preview/:code',(req,res)=>{const code=String(req.params.code).toUpperCase();const t=db.prepare('SELECT code,entry_at,print_snapshot,rate_snapshot,benefit_snapshot FROM tickets WHERE code=?').get(code);if(!t)return bad(res,'Boleto no encontrado',404);const setup=t.print_snapshot?JSON.parse(t.print_snapshot):getPrintSettings(),cfg=JSON.parse(t.rate_snapshot);const coverage=pensionCoverage(t.entry_at,t.benefit_snapshot?JSON.parse(t.benefit_snapshot):null);res.json({code:t.code,entry_at:t.entry_at,settings:setup,name:setup.ticketName||cfg.name,timeZone:cfg.timeZone,pension_coverage_hours:coverage?.hours??null,pension_coverage_until:coverage?.until??null});});
 const authorizeAdmin=createAdminAuthorizer(db);
 const pendingReprints=new Set();
 const trackReprint=handler=>(req,res,next)=>{
  const task=Promise.resolve().then(()=>handler(req,res,next));
  pendingReprints.add(task);
  task.then(()=>pendingReprints.delete(task),error=>{pendingReprints.delete(task);next(error);});
 };
 app.post('/api/ticket/:code/reprint',trackReprint(async(req,res,next)=>{
  try {
   const authorizer=authorizeAdmin(req);
   const reason=typeof req.body.reason==='string'?req.body.reason.trim():'';
   if(reason.length<3||reason.length>300)throw Error('Escribe el motivo de reimpresión (3 a 300 caracteres)');
   const key=req.headers['idempotency-key'];
   if(typeof key!=='string'||!/^[a-zA-Z0-9_-]{16,100}$/.test(key))throw Error('Falta identificador de operación. Actualiza la pantalla.');
   const ticket=db.prepare('SELECT * FROM tickets WHERE code=?').get(req.params.code.toUpperCase());
   if(!ticket)return bad(res,'Ticket no encontrado',404);
   const cfg=getCfg();if(!cfg.printerName)return bad(res,'Configura la impresora');
   const fingerprint=crypto.createHash('sha256').update(JSON.stringify([req.method,req.path,ticket.code,reason,req.user.id,authorizer.id])).digest('hex');
   const claimed=db.transaction(()=>{
    const prior=db.prepare('SELECT fingerprint,response FROM requests WHERE key=?').get(key);
    if(prior){if(prior.fingerprint!==fingerprint)throw Error('Identificador reutilizado para otra operación');return {prior:JSON.parse(prior.response)};}
    // Persist the reservation before contacting Windows. A lost response or a
    // process restart must never silently send another entrance ticket.
    const pending={ok:true,code:ticket.code,reprinted:true,printed:false,pending:true,printError:'Envío de reimpresión pendiente de confirmación. Comprueba la impresora antes de autorizar otra copia.'};
    db.prepare('INSERT INTO requests VALUES(?,?,?,?,?)').run(key,fingerprint,JSON.stringify(pending),now(),req.user.id);
    audit(ticket.id,'REPRINT_REQUESTED',{reason,authorized_by:authorizer.id,printer:cfg.printerName},req.user.id);
    return {pending};
   }).immediate();
   if(claimed.prior)return res.json({...claimed.prior,replayed:true});
   const result={ok:true,code:ticket.code,reprinted:true,printed:false};
   try {
    await sendEntry(cfg,ticket.code,ticket.entry_at,{reprint:true,reason,authorized_by:authorizer.username});
    result.printed=true;
   } catch(e) {
    result.printError='No se confirmó la reimpresión: '+e.message+'. Comprueba la impresora antes de autorizar otra copia.';
   }
   try{db.transaction(()=>{
    if(result.printed)db.prepare('INSERT INTO reprints(ticket_id,created_at) VALUES(?,?)').run(ticket.id,now());
    audit(ticket.id,result.printed?'REPRINT':'REPRINT_FAILED',{reason,authorized_by:authorizer.id,printer:cfg.printerName,error:result.printError||null},req.user.id);
    db.prepare('UPDATE requests SET response=? WHERE key=?').run(JSON.stringify(result),key);
   })();}catch(e){
    result.audit_warning='El intento está registrado, pero no se pudo actualizar su confirmación. Comprueba la impresora antes de solicitar otra copia.';
   }
   res.json(result);
  } catch(e){next(e);}
 }));
function printTicket(cfg,code,entry,done,printOptions={}){
 if(process.platform!=='win32')return done(new Error('Impresión directa requiere Windows'));
 try {
  const saved=db.prepare('SELECT print_snapshot,rate_snapshot,entry_at,benefit_snapshot FROM tickets WHERE code=?').get(code);
  const setup=saved?.print_snapshot?JSON.parse(saved.print_snapshot):getPrintSettings();
  const originalCfg=saved?.rate_snapshot?JSON.parse(saved.rate_snapshot):cfg;
  const coverage=saved?pensionCoverage(saved.entry_at,saved.benefit_snapshot?JSON.parse(saved.benefit_snapshot):null):null;
  const props={name:setup.ticketName||originalCfg.name,code,entryAt:entry,pensionCoverageUntil:coverage?.until??null,pensionCoverageHours:coverage?.hours??null,address:setup.address,policies:setup.policies,logo:setup.logo,autoCut:setup.autoCut,test:code==='PRUEBA000000',timeZone:originalCfg.timeZone,reprint:printOptions.reprint===true,reprintReason:printOptions.reason||''};
  // Una entrada y dos copias consecutivas con idéntico folio y código, en un solo envío RAW.
  const payload=printOptions.reprint?buildEntryTicket({...props,copy:'CUSTOMER'}):Buffer.concat([buildEntryTicket({...props,copy:'CUSTOMER'}),buildEntryTicket({...props,copy:'INTERNAL'})]);
  // Se manda directamente el Buffer a una cola RAW persistente, sin archivos temporales.
  // Se confirma envío al spool de Windows, NO impresión física completada.
  printSpooler.send(cfg.printerName,payload).then(()=>done(null),done);
 }catch(e){done(e)}
}

 app.post('/api/print/test',auth.allow('admin','supervisor'),(req,res)=>{const cfg=getCfg();if(!cfg.printerName)return bad(res,'Configura primero el nombre de la impresora');printTicket(cfg,'PRUEBA000000',now(),err=>err?bad(res,err.message,500):res.json({ok:true}));});
 app.use(express.static(path.join(__dirname,'public')));
 app.use('/api',(req,res)=>res.status(404).json({error:'Ruta no encontrada'}));
 app.use((err,req,res,next)=>{if(res.headersSent)return next(err);const internal=/SQLITE_|no such|syntax error/i.test(err.message);if(internal)console.error(err);res.status(err.status||409).json({error:internal?'No se pudo completar la operación SQLite; no se confirmó el movimiento.':err.message});});
 let closing;
 function close(){
  if(!closing){
   app.locals.closing=true;
   closing=(async()=>{
    // An aborted HTTP socket does not cancel its async handler. Let committed
    // payments and print attempts finish their audit/status writes first.
    await Promise.all([
     ops.waitForIdle(),
     (async()=>{while(pendingReprints.size)await Promise.allSettled([...pendingReprints]);})()
    ]);
    await storage.close();
   })();
  }
  return closing;
 }
 return {app,db,storage,ops,close};
}
module.exports={createApp};
if(require.main===module)createApp().then(ctx=>{
 const server=ctx.app.listen(Number(process.env.PORT||3785),'127.0.0.1',()=>console.log('Parking POS: http://127.0.0.1:'+server.address().port));
 let stopping=false;
 const stop=()=>{if(stopping)return;stopping=true;server.close(async()=>{await ctx.close();process.exit(0);});server.closeIdleConnections();};
 server.on('error',async e=>{console.error(e.message);await ctx.close();process.exitCode=1;});
 process.on('SIGINT',stop);process.on('SIGTERM',stop);
}).catch(e=>{console.error('No se inició Parking POS:',e.message);process.exitCode=1;});
