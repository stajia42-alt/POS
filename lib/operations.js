'use strict';
const crypto=require('crypto');
const {recordHandover,readHandover,lastDayHandover}=require('./handover');
const {cents,convertUSD,rateUnits}=require('./money');
const rates=require('./rates'),time=require('./time'),pensions=require('./pensions');
const {pensionCoverage}=require('./pension-coverage');
const {passwordHash,validUsername,verify}=require('./auth');
function installOperations(app,{storage,auth,audit,printEntry,printReport,getPrintSettings,openDrawer,clock=()=>Date.now()}){
 const db=storage.db,now=()=>new Date(clock()).toISOString(),authorizationFailures=new Map(),inFlight=new Set();
 const getCfg=()=>({...rates.defaults,...JSON.parse(db.prepare("SELECT value FROM config WHERE key='rates'").get()?.value||'{}')});
 const activeShift=()=>db.prepare('SELECT * FROM shifts WHERE closed_at IS NULL ORDER BY id DESC LIMIT 1').get();
 const inside="exit_at IS NULL AND cancelled_at IS NULL";
 const label=t=>t==='DAY'?'DÍA':t==='NIGHT'?'NOCHE':'ANTERIOR';
 function shiftOwnership(shiftId){
  const shift=db.prepare('SELECT id,shift_type FROM shifts WHERE id=?').get(shiftId);if(!shift)return null;
  const open=db.prepare(`SELECT COUNT(*) n FROM tickets WHERE entry_shift_id=? AND ${inside}`).get(shiftId).n;
  // Los ingresos se registran en el turno que recibe el dinero. La atribución
  // del turno de entrada se presenta por separado para no duplicar ventas.
  const fromOther=db.prepare(`SELECT COALESCE(SUM(p.amount_cents),0) sold_cents,
   COALESCE(SUM(p.received_cents-p.change_mxn_cents),0) mxn_net_cents,
   COALESCE(SUM(p.received_usd_cents),0) usd_cents FROM all_payments p
   JOIN tickets t ON t.id=p.ticket_id WHERE t.entry_shift_id=? AND p.shift_id<>?`).get(shiftId,shiftId);
  const settled=db.prepare(`SELECT currency,COALESCE(SUM(amount_cents),0) amount FROM shift_settlements WHERE origin_shift_id=? GROUP BY currency`).all(shiftId);
  const sum=currency=>settled.find(x=>x.currency===currency)?.amount||0;
  return {open_vehicles:open,other_shift_collected_cents:fromOther.sold_cents,
   other_shift_cash_mxn_cents:fromOther.mxn_net_cents,other_shift_cash_usd_cents:fromOther.usd_cents,
   settled_mxn_cents:sum('MXN'),settled_usd_cents:sum('USD'),
   outstanding_mxn_cents:Math.max(0,fromOther.sold_cents-sum('MXN')),
   outstanding_usd_cents:Math.max(0,fromOther.usd_cents-sum('USD'))};
 }
 function nightDues(shiftId){
  const items=db.prepare(`SELECT origin.id origin_shift_id,origin.opened_at origin_opened_at,
   COUNT(DISTINCT t.id) vehicles,
   COALESCE(SUM(p.amount_cents),0) collected_cents,
   COALESCE(SUM(p.received_cents-p.change_mxn_cents),0) cash_mxn_cents,
   COALESCE(SUM(p.received_usd_cents),0) cash_usd_cents
   FROM all_payments p JOIN tickets t ON t.id=p.ticket_id
   JOIN shifts origin ON origin.id=t.entry_shift_id
   WHERE p.shift_id=? AND origin.shift_type='DAY' AND origin.id<>?
   GROUP BY origin.id ORDER BY origin.id`).all(shiftId,shiftId);
  const settled=db.prepare(`SELECT origin_shift_id,currency,COALESCE(SUM(amount_cents),0) amount
    FROM shift_settlements WHERE collecting_shift_id=? GROUP BY origin_shift_id,currency`).all(shiftId);
  const done=(id,cur)=>settled.find(x=>x.origin_shift_id===id&&x.currency===cur)?.amount||0;
  return items.map(x=>({...x,settled_mxn_cents:done(x.origin_shift_id,'MXN'),settled_usd_cents:done(x.origin_shift_id,'USD'),
   owed_mxn_cents:Math.max(0,x.collected_cents-done(x.origin_shift_id,'MXN')),
   owed_usd_cents:Math.max(0,x.cash_usd_cents-done(x.origin_shift_id,'USD'))}));
 }

 const needShift=()=>{const s=activeShift();if(!s)throw Error('Abre la caja antes de operar');return s;};
 const getTicket=code=>{const t=db.prepare('SELECT * FROM tickets WHERE code=?').get(String(code).toUpperCase());if(!t)throw Error('Boleto no encontrado');return t;};
 const supervisor=auth.allow('admin','supervisor'),admin=auth.allow('admin');
 const wrap=f=>async(req,res,next)=>{
  // A disconnected HTTP client does not cancel a payment or its print attempt.
  // Shutdown must keep SQLite open until post-commit delivery/audit finishes.
  let finished;const task=new Promise(resolve=>{finished=resolve;});inFlight.add(task);
  try{await f(req,res);}catch(e){next(e);}finally{inFlight.delete(task);finished();}
 };
 const waitForIdle=async()=>{while(inFlight.size)await Promise.all([...inFlight]);};
 function idem(req,fn){
  const key=req.headers['idempotency-key'];if(typeof key!=='string'||!/^[a-zA-Z0-9_-]{16,100}$/.test(key))throw Error('Falta identificador de operación. Actualiza la pantalla.');
  const fingerprint=crypto.createHash('sha256').update(JSON.stringify([req.method,req.path,req.body,req.user.id])).digest('hex');
  return db.transaction(()=>{const old=db.prepare('SELECT * FROM requests WHERE key=?').get(key);if(old){if(old.fingerprint!==fingerprint)throw Error('Identificador reutilizado para otra operación');return {...JSON.parse(old.response),replayed:true};}
   const result=fn();db.prepare('INSERT INTO requests VALUES(?,?,?,?,?)').run(key,fingerprint,JSON.stringify(result),now(),req.user.id);return result;
  }).immediate();
 }
 function saveOutcome(req,result){
  // The business transaction is already durable. Updating its delivery status must
  // never turn a successful payment into an apparent failed charge.
  try{db.prepare('UPDATE requests SET response=? WHERE key=?').run(JSON.stringify(result),req.headers['idempotency-key']);}
  catch{result.delivery_status_warning='El movimiento está guardado; consulta el folio antes de intentar otra operación.';}
 }
 async function receipt(req,result,type,{reprint=false}={}){
  if(result.replayed)return result;
  result.receipt_printed=false;result.receipt_state='pending';result.printed=false;
  saveOutcome(req,result); // Reserve this attempt before waiting for the spooler.
  const ticket=getTicket(result.code),currentCfg=getCfg();
  const prefix=type==='PAYMENT'?'Pago guardado':'Boleto perdido registrado';
  try{
   if(!currentCfg.printerName)throw Error('Configura la impresora para imprimir el comprobante');
   const cfg={...currentCfg,...JSON.parse(ticket.rate_snapshot),printerName:currentCfg.printerName};
   const setup=ticket.print_snapshot?JSON.parse(ticket.print_snapshot):getPrintSettings();
   const payments=type==='PAYMENT'?db.prepare('SELECT * FROM all_payments WHERE ticket_id=? ORDER BY paid_at,source,id').all(ticket.id):undefined;
   await printReport(cfg,{type,ticket,quote:result,payments,reprint},setup);
   result.receipt_printed=true;result.printed=true;result.receipt_state='sent';
   try{audit(ticket.id,type+'_PRINT_SENT',{payment_id:result.payment_id||null,reprint},req.user.id);}catch{}
  }catch(e){
   result.receipt_state='failed';result.receipt_warning=prefix+', pero no se pudo confirmar la impresión: '+e.message;
   result.printError=result.receipt_warning;
   try{audit(ticket.id,type+'_PRINT_FAILED',{payment_id:result.payment_id||null,reprint,detail:e.message},req.user.id);}catch{}
  }
  saveOutcome(req,result);
  return result;
 }
 function totals(id){
  const s=db.prepare('SELECT * FROM shifts WHERE id=?').get(id);if(!s)throw Error('Turno no encontrado');
  const t=db.prepare(`SELECT COUNT(*) count,COALESCE(SUM(amount_cents),0) sales_cents,
   COALESCE(SUM(received_cents),0) received_mxn_cents,COALESCE(SUM(received_usd_cents),0) received_usd_cents,
   COALESCE(SUM(change_mxn_cents),0) change_cents,
   COALESCE(SUM(CASE WHEN method='usd' THEN amount_cents ELSE 0 END),0) usd_sales_mxn_cents,
   COALESCE(SUM(CASE WHEN kind='refund' THEN -amount_cents ELSE 0 END),0) refunds_cents,
   COALESCE(SUM(CASE WHEN kind='pension' THEN amount_cents ELSE 0 END),0) pension_cents
   FROM all_payments WHERE shift_id=?`).get(id);
  const m={net_cents:0,deposits_cents:0,withdrawals_cents:0,net_usd_cents:0,deposits_usd_cents:0,withdrawals_usd_cents:0,movement_count:0};
  for(const row of db.prepare('SELECT * FROM cash_movements WHERE shift_id=?').all(id)){const suffix=row.currency==='USD'?'_usd_cents':'_cents';m['net'+suffix]+=(row.kind==='in'?1:-1)*row.amount_cents;m[(row.kind==='in'?'deposits':'withdrawals')+suffix]+=row.amount_cents;m.movement_count++;}
  const inheritedTickets=s.shift_type==='NIGHT'?db.prepare(`SELECT t.code,t.entry_shift_id,COUNT(p.id) movements,
      COALESCE(SUM(p.amount_cents),0) sale_cents FROM all_payments p JOIN tickets t ON t.id=p.ticket_id
      JOIN shifts origin ON origin.id=t.entry_shift_id
      WHERE p.shift_id=? AND origin.shift_type='DAY' AND origin.id<>?
      GROUP BY t.id ORDER BY t.id LIMIT 80`).all(id,id):[];
  const expected=s.opening_cents+t.received_mxn_cents-t.change_cents+m.net_cents,usd=s.opening_usd_cents+t.received_usd_cents+m.net_usd_cents;
  const dues=s.shift_type==='NIGHT'?nightDues(id):[];
  return {...s,...t,...m,handover:readHandover(db,id),ownership:shiftOwnership(id),inherited_tickets:inheritedTickets,night_dues:dues,pending_day_settlement_cents:dues.reduce((sum,d)=>sum+d.owed_mxn_cents,0),shift_label:label(s.shift_type),expected_cents:s.closed_at?s.expected_cents:expected,expected_usd_cents:s.closed_at?s.expected_usd_cents:usd,usd_cash_cents:usd,difference_cents:s.closed_at?s.declared_cents-s.expected_cents:null,difference_usd_cents:s.closed_at?s.declared_usd_cents-s.expected_usd_cents:null,kind:s.shift_type==='LEGACY'?(s.closed_at?'ANTERIOR':'ANTERIOR'):s.shift_type};
 }
 function quote(t){
  if(clock()<Date.parse(t.entry_at)||((t.last_payment_at||t.paid_at)&&clock()<Date.parse(t.last_payment_at||t.paid_at)))throw Error('La hora de la PC es anterior a la entrada o al último pago. Corrige el reloj antes de continuar.');
  const c={...rates.defaults,...JSON.parse(t.rate_snapshot)},minutes=Math.max(0,Math.ceil((clock()-Date.parse(t.entry_at))/60000)),last=t.last_payment_at||t.paid_at,until=last?Date.parse(last)+c.exitToleranceMinutes*60000:null;
  const covered=last&&clock()<=until,paid=t.charged_cents||0;
  const benefit=t.benefit_snapshot?JSON.parse(t.benefit_snapshot):null;
  const pensionWindow=pensionCoverage(t.entry_at,benefit);
  const total=covered?paid:rates.stayPrice(t.entry_at,now(),c,benefit)+t.lost_cents;
  return {...t,pension_coverage_hours:pensionWindow?.hours??null,pension_coverage_until:pensionWindow?.until??null,pension_coverage_time_zone:c.timeZone,minutes,estimated_cents:t.exit_at||t.cancelled_at?0:Math.max(0,total-paid),total_cents:Math.max(paid,total),exit_deadline:until?new Date(until).toISOString():null,can_exit:!!last&&!t.exit_at&&!t.cancelled_at&&total<=paid,usd_rate:activeShift()?.usd_rate??null};
 }
 function payment(body,amount,s){
  cents(amount);const method=body.method||'efectivo';let received=0,usd=0,rate=null,units=null,equivalent;
  if(method==='efectivo'){received=cents(body.received_cents);equivalent=received;}
  else if(method==='usd'){rate=s.usd_rate;if(!rate)throw Error('Configura el tipo de cambio');units=rateUnits(rate);if(body.expected_usd_rate===undefined||rateUnits(body.expected_usd_rate)!==units)throw Error('El tipo de cambio cambió. Consulta de nuevo el boleto.');usd=cents(body.received_usd_cents);equivalent=convertUSD(usd,rate);}
  else throw Error('Forma de pago inválida');
  if(equivalent<amount)throw Error('Pago insuficiente');const change=equivalent-amount;
  if(totals(s.id).expected_cents+received<change)throw Error('No hay suficientes pesos en caja para entregar el cambio');
  return {method,received_cents:received,received_usd_cents:usd,usd_rate_used:rate,rate_units:units,change_cents:change,change_mxn_cents:change};
 }
 function adjustment(ticket,client,amount,p,s,user,kind,detail){return db.prepare(`INSERT INTO payment_adjustments(ticket_id,client_id,amount_cents,method,paid_at,received_cents,change_cents,shift_id,received_usd_cents,usd_rate_used,rate_units,change_mxn_cents,user_id,kind,detail) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(ticket,client,amount,p.method,now(),p.received_cents,p.change_cents,s.id,p.received_usd_cents,p.usd_rate_used,p.rate_units,p.change_mxn_cents,user,kind,JSON.stringify(detail||{})).lastInsertRowid;}
 app.get('/api/config',(req,res)=>res.json(getCfg()));
 app.put('/api/config',supervisor,wrap((req,res)=>{const c=rates.validate(req.body);db.transaction(()=>{db.prepare("INSERT INTO config VALUES('rates',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(c));audit(null,'CONFIG_UPDATED',{config:c},req.user.id);})();res.json({ok:true});}));
 app.get('/api/rates/libra3',(req,res)=>res.json(rates.libra3));
 app.post('/api/entry',wrap(async(req,res)=>{
  const result=idem(req,()=>{needShift();const c=getCfg();if(db.prepare('SELECT COUNT(*) n FROM tickets WHERE '+inside).get().n>=c.capacity)throw Error('Estacionamiento lleno');
   const plate=normalizePlate(req.body.plate||'');let client=null;
   if(plate){if(db.prepare('SELECT id FROM tickets WHERE plate=? AND '+inside).get(plate))throw Error('Ese vehículo ya está dentro');client=db.prepare("SELECT * FROM clients WHERE plate=? AND plate NOT LIKE 'PCLIENT%' AND active=1 AND valid_from<=? AND valid_to>?").get(plate,now(),now());}
   const clientCode=String(req.body.client_code||'').trim().toUpperCase();
   if(req.body.client_id!=null||clientCode){
     if(req.body.client_id!=null&&(!Number.isSafeInteger(req.body.client_id)||req.body.client_id<=0))throw Error('Cliente inválido');
     const selected=req.body.client_id!=null?db.prepare('SELECT * FROM clients WHERE id=? AND active=1 AND valid_from<=? AND valid_to>?').get(req.body.client_id,now(),now()):db.prepare('SELECT * FROM clients WHERE client_code=? AND active=1 AND valid_from<=? AND valid_to>?').get(clientCode,now(),now());
     if(!selected)throw Error('El código o convenio no existe, está inactivo o vencido');
     if(selected.kind==='exempt'&&req.user.role==='cashier')throw Error('Los vehículos exentos requieren un supervisor');
     client=selected;
   }
   // Siguiente folio numérico del estacionamiento; los antiguos alfanuméricos permanecen válidos.
   const latest=db.prepare("SELECT code FROM tickets WHERE code NOT GLOB '*[^0-9]*' AND code<>'' ORDER BY length(code) DESC,code DESC LIMIT 1").get();
   const seq=latest?BigInt(latest.code)+1n:1n;
   if(seq>999999999999n)throw Error('Se alcanzó el límite de folios');
   const code=seq.toString().padStart(3,'0'),at=now();const id=db.prepare('INSERT INTO tickets(code,plate,entry_at,rate_snapshot,client_id,benefit_snapshot,print_snapshot,entry_shift_id) VALUES(?,?,?,?,?,?,?,?)').run(code,plate,at,JSON.stringify(c),client?.id??null,client?JSON.stringify(client):null,JSON.stringify(getPrintSettings()),needShift().id).lastInsertRowid;
   const coverage=pensionCoverage(at,client);
   audit(id,'ENTRY',{plate,client_id:client?.id??null,pension_coverage_until:coverage?.until??null},req.user.id);return {code,entry_at:at,client_name:client?.name??null,client_code:client?.client_code??null,pension_coverage_hours:coverage?.hours??null,pension_coverage_until:coverage?.until??null,pension_coverage_time_zone:c.timeZone};
  });
  const cfg=getCfg();if(!result.replayed&&cfg.autoPrint&&cfg.printerName){try{await printEntry(cfg,result.code,result.entry_at);result.printed=true;}catch(e){result.printed=false;result.printError=e.message;}}
  else {result.printed=false;result.printError=result.replayed?'Entrada recuperada sin duplicarla. Reimprime si hace falta.':'Impresión automática desactivada o no configurada';}
  if(!result.replayed){const ticket=db.prepare('SELECT id FROM tickets WHERE code=?').get(result.code);if(ticket){db.prepare('INSERT INTO print_attempts(ticket_id,printed,created_at,error_message) VALUES(?,?,?,?)').run(ticket.id,result.printed?1:0,now(),result.printError||null);audit(ticket.id,result.printed?'ENTRY_PRINT_SENT':'ENTRY_PRINT_FAILED',{detail:result.printError||null},req.user.id);}}
  res.status(201).json(result);
 }));
 app.get('/api/ticket/:code',(req,res)=>{try{res.json(quote(getTicket(req.params.code)));}catch(e){res.status(404).json({error:e.message});}});
 app.post('/api/ticket/:code/pay',wrap(async(req,res)=>{
  const result=idem(req,()=>{
  const s=needShift(),t=getTicket(req.params.code),q=quote(t);if(t.exit_at||t.cancelled_at)throw Error('Boleto finalizado');
  if(req.body.revision!==t.revision)throw Error('El boleto cambió. Consulta de nuevo.');if(t.paid_at&&q.estimated_cents===0)throw Error('El boleto ya está pagado. No se puede cobrar dos veces.');
  if(req.body.expected_cents!==q.estimated_cents)throw Error('El importe cambió. Consulta de nuevo.');
  const p=payment(req.body,q.estimated_cents,s),at=now();let paymentId,source;
  if(!t.paid_at){source='payment';paymentId=db.prepare('INSERT INTO payments(ticket_id,amount_cents,method,paid_at,received_cents,change_cents,shift_id,received_usd_cents,usd_rate_used,change_mxn_cents,rate_units,user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(t.id,q.estimated_cents,p.method,at,p.received_cents,p.change_cents,s.id,p.received_usd_cents,p.usd_rate_used,p.change_mxn_cents,p.rate_units,req.user.id).lastInsertRowid;}
  else {source='adjustment';paymentId=adjustment(t.id,null,q.estimated_cents,p,s,req.user.id,'additional');}
  db.prepare('UPDATE tickets SET paid_at=COALESCE(paid_at,?),last_payment_at=?,exit_at=?,charged_cents=?,revision=revision+1 WHERE id=?').run(at,at,at,(t.charged_cents||0)+q.estimated_cents,t.id);
  audit(t.id,'PAYMENT_AND_EXIT',{...p,amount_cents:q.estimated_cents,shift_id:s.id,paymentId,source},req.user.id);
  return {code:t.code,charged_cents:q.estimated_cents,...p,paid_at:at,exit_at:at,shift_id:s.id,payment_id:paymentId,source,exit_confirmed:true};
  });
  // El cobro se confirma primero en SQLite. El pulso del cajon nunca revierte pagos.
  if(!result.replayed && result.charged_cents>0){
   const setup=getPrintSettings(),cfg=getCfg();
   if(setup.cashDrawerEnabled!==false && cfg.printerName && openDrawer){
    try{await openDrawer(cfg,setup);result.drawer_sent=true;}catch(e){result.drawer_sent=false;result.drawer_warning='Pago guardado, pero no se pudo abrir el cajon: '+e.message;
     try{audit(null,'CASH_DRAWER_FAILED',{payment_id:result.payment_id,detail:e.message},req.user.id)}catch(_){}
    }
   }
  }
  await receipt(req,result,'PAYMENT');
  if(!result.replayed)saveOutcome(req,result);
  res.json(result);
 }));
 // Compatibility for paid tickets created before automatic exit. New payments exit atomically.
 app.post('/api/ticket/:code/exit',supervisor,wrap((req,res)=>res.json(idem(req,()=>{const t=getTicket(req.params.code),q=quote(t);if(t.exit_at)return {ok:true,exit_at:t.exit_at};if(t.cancelled_at)throw Error('Boleto cancelado');if(!q.can_exit)throw Error(t.paid_at?'Tolerancia vencida: cobra el saldo de '+(q.estimated_cents/100).toFixed(2)+' MXN':'Primero registra el pago');db.prepare('UPDATE tickets SET exit_at=?,revision=revision+1 WHERE id=?').run(now(),t.id);audit(t.id,'EXIT',{},req.user.id);return {ok:true,exit_at:now()};}))));
 app.post('/api/ticket/:code/lost',wrap(async(req,res)=>{
  const result=idem(req,()=>{const t=getTicket(req.params.code);if(t.paid_at||t.exit_at||t.cancelled_at)throw Error('Marca el boleto perdido antes de cobrar');if(t.lost_at)return {...quote(t),already_lost:true};const reason=validReason(req.body.reason),fee=({...rates.defaults,...JSON.parse(t.rate_snapshot)}).lostTicketCents;db.prepare('UPDATE tickets SET lost_at=?,lost_cents=?,revision=revision+1 WHERE id=?').run(now(),fee,t.id);audit(t.id,'LOST_TICKET',{reason,fee},req.user.id);return quote(getTicket(t.code));});
  if(!result.already_lost)await receipt(req,result,'LOST');
  res.json(result);
 }));
 app.post('/api/ticket/:code/cancel',wrap((req,res)=>res.json(idem(req,()=>{
  let authorizer=req.user;
  if(req.user.role==='cashier'){
   const attempt=authorizationFailures.get(req.user.id);if(attempt&&attempt.until>Date.now()&&attempt.count>=8)throw Error('Demasiados intentos de autorización. Espera 10 minutos.');
   authorizer=db.prepare("SELECT * FROM users WHERE username=? AND active=1 AND role IN ('admin','supervisor')").get(String(req.body.authorization_username||''));
   if(!authorizer||!verify(req.body.authorization_password,authorizer.password_hash)){authorizationFailures.set(req.user.id,{count:attempt&&attempt.until>Date.now()?attempt.count+1:1,until:Date.now()+600000});throw Error('Se requiere autorización de supervisor');}
   authorizationFailures.delete(req.user.id);
  }
  const t=getTicket(req.params.code);if(t.cancelled_at)throw Error('Boleto ya cancelado');const reason=validReason(req.body.reason);let refund=0;
  if(t.paid_at){const s=needShift();refund=t.charged_cents||0;if(totals(s.id).expected_cents<refund)throw Error('No hay pesos suficientes para la devolución');if(req.body.refund_cents!==refund)throw Error('Confirma el importe exacto de devolución en MXN');if(refund)adjustment(t.id,null,-refund,{method:'efectivo',received_cents:0,received_usd_cents:0,usd_rate_used:null,rate_units:null,change_cents:refund,change_mxn_cents:refund},s,req.user.id,'refund',{reason,authorized_by:authorizer.id});}
  db.prepare('UPDATE tickets SET cancelled_at=?,cancel_reason=?,revision=revision+1 WHERE id=?').run(now(),reason,t.id);audit(t.id,'CANCEL',{reason,refund_cents:refund,authorized_by:authorizer.id},req.user.id);return {ok:true,refund_cents:refund};
 }))));
 app.get('/api/shift',(req,res)=>{const s=activeShift();res.json({shift:s?totals(s.id):null});});
 app.get('/api/shift/next',(req,res)=>{const last=db.prepare("SELECT id,shift_type,usd_rate FROM shifts ORDER BY id DESC LIMIT 1").get(),recommend=last?.shift_type==='DAY'?'NIGHT':last?.shift_type==='NIGHT'?'DAY':'DAY';res.json({recommended:recommend,pending_vehicles:db.prepare('SELECT COUNT(*) n FROM tickets WHERE '+inside).get().n,previous_shift:last??null,previous_usd_rate:last?.usd_rate??null});});
 app.post('/api/shift/open',wrap((req,res)=>res.status(201).json(idem(req,()=>{if(activeShift())throw Error('Ya existe un turno abierto');const opening=cents(req.body.opening_cents),usd=cents(req.body.opening_usd_cents??0),rate=req.body.usd_rate==null?null:rateUnits(req.body.usd_rate)/10000;const latest=db.prepare('SELECT shift_type FROM shifts ORDER BY id DESC LIMIT 1').get();const type=req.body.shift_type|| (latest?.shift_type==='DAY'?'NIGHT':'DAY');if(!['DAY','NIGHT'].includes(type))throw Error('Selecciona turno Día o Noche');const id=db.prepare('INSERT INTO shifts(opened_at,opening_cents,opening_usd_cents,usd_rate,user_id,shift_type) VALUES(?,?,?,?,?,?)').run(now(),opening,usd,rate,req.user.id,type).lastInsertRowid;const inherited=db.prepare('SELECT COUNT(*) n FROM tickets WHERE '+inside+' AND entry_shift_id<>?').get(id).n;audit(null,'SHIFT_OPEN',{id,opening,usd,rate,shift_type:type,inherited},req.user.id);return {ok:true,id,shift_type:type,inherited};}))));
 app.get('/api/shift/day-handover/latest',(req,res)=>res.json({handover:lastDayHandover(db)}));
 app.get('/api/shift/:id/handover',wrap((req,res)=>{const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)throw Error('Turno inválido');res.json({handover:readHandover(db,id)});}));
 app.get('/api/shift/day-debts',wrap((req,res)=>res.json({shift:needShift().id,debts:needShift().shift_type==='NIGHT'?nightDues(needShift().id):[]})));
 app.post('/api/shift/day-settlement',supervisor,wrap((req,res)=>res.status(201).json(idem(req,()=>{
  const shift=needShift();if(shift.shift_type!=='NIGHT')throw Error('Solo Noche puede registrar entregas al turno Día');
  const origin=Number(req.body.origin_shift_id),currency=req.body.currency||'MXN',amount=cents(req.body.amount_cents);
  if(!Number.isSafeInteger(origin)||origin<1||currency!=='MXN'||amount<=0)throw Error('Entrega solo en MXN; si recibiste USD, conviértelo primero y registra los movimientos de efectivo');
  const debt=nightDues(shift.id).find(x=>x.origin_shift_id===origin);
  const outstanding=debt?.owed_mxn_cents;
  if(!debt||amount>outstanding)throw Error('La cantidad supera lo cobrado pendiente de entregar al Día');
  if(amount>totals(shift.id)[currency==='MXN'?'expected_cents':'expected_usd_cents'])throw Error('No hay efectivo suficiente en caja');
  const at=now(),mov=db.prepare('INSERT INTO cash_movements(shift_id,kind,amount_cents,reason,created_at,currency,user_id) VALUES(?,?,?,?,?,?,?)')
   .run(shift.id,'out',amount,'Entrega al turno Día #'+origin,at,currency,req.user.id).lastInsertRowid;
  const id=db.prepare('INSERT INTO shift_settlements(origin_shift_id,collecting_shift_id,amount_cents,currency,cash_movement_id,created_at,user_id) VALUES(?,?,?,?,?,?,?)')
   .run(origin,shift.id,amount,currency,mov,at,req.user.id).lastInsertRowid;
  audit(null,'DAY_SETTLEMENT',{id,origin,night_shift:shift.id,currency,amount},req.user.id);
  return {ok:true,id,currency,amount_cents:amount,remaining_cents:outstanding-amount};
 }))));
 app.put('/api/shift/usd-rate',supervisor,wrap((req,res)=>res.json(idem(req,()=>{const s=needShift(),rate=rateUnits(req.body.usd_rate)/10000;db.prepare('UPDATE shifts SET usd_rate=? WHERE id=?').run(rate,s.id);db.prepare('INSERT INTO exchange_rate_changes(shift_id,old_rate,new_rate,changed_at) VALUES(?,?,?,?)').run(s.id,s.usd_rate,rate,now());audit(null,'EXCHANGE_RATE',{shift_id:s.id,old:s.usd_rate,new:rate},req.user.id);return {ok:true,shift:totals(s.id)};}))));
 app.get('/api/shift/movements',wrap((req,res)=>res.json(db.prepare('SELECT * FROM cash_movements WHERE shift_id=? ORDER BY id DESC LIMIT 200').all(needShift().id))));
 app.post('/api/shift/movements',supervisor,wrap((req,res)=>res.status(201).json(idem(req,()=>{const s=needShift(),amount=cents(req.body.amount_cents),reason=validReason(req.body.reason),kind=req.body.kind,currency=req.body.currency||'MXN';if(!amount||!['in','out'].includes(kind)||!['MXN','USD'].includes(currency))throw Error('Movimiento inválido');const available=totals(s.id)[currency==='USD'?'expected_usd_cents':'expected_cents'];if(kind==='out'&&amount>available)throw Error('Retiro mayor al efectivo disponible');const id=db.prepare('INSERT INTO cash_movements(shift_id,kind,amount_cents,reason,created_at,currency,user_id) VALUES(?,?,?,?,?,?,?)').run(s.id,kind,amount,reason,now(),currency,req.user.id).lastInsertRowid;audit(null,'CASH_MOVEMENT',{id,shift_id:s.id,kind,amount,currency,reason},req.user.id);return {ok:true,id,shift:totals(s.id)};}))));
 app.get('/api/shift/x',wrap((req,res)=>res.json({type:needShift().shift_type,shift:totals(needShift().id)})));
 app.post('/api/shift/close',wrap((req,res)=>res.json(idem(req,()=>{const s=totals(needShift().id);if(req.body.shift_id!==s.id)throw Error('El turno cambió. Actualiza la pantalla.');const declared=cents(req.body.declared_cents),usd=cents(req.body.declared_usd_cents??0);
  // El arqueo declara el efectivo real de ambas monedas. Una conciliación
  // pendiente con Día es informativa y nunca obliga a inventar una conversión.

  let detail=null;
  if(req.body.denomination_detail!=null){
   detail=req.body.denomination_detail;
   if(typeof detail!=='object'||Array.isArray(detail)||!detail.MXN||!detail.USD)throw Error('Desglose de billetes inválido');
   for(const [currency,expected] of [['MXN',declared],['USD',usd]]){
    const items=detail[currency];if(!Array.isArray(items)||items.length>20)throw Error('Arqueo inválido');
    const actual=items.reduce((sum,item)=>{
     if(!Number.isSafeInteger(item.value_cents)||item.value_cents<1||!Number.isSafeInteger(item.count)||item.count<0||item.count>100000)throw Error('Cantidad inválida en arqueo');
     return sum+item.value_cents*item.count;
    },0);
    if(actual!==expected)throw Error('El arqueo en '+currency+' no coincide con el importe contado');
   }
  }
  const closedAt=now();const handed=recordHandover(db,s.id,closedAt);db.prepare('UPDATE shifts SET closed_at=?,declared_cents=?,expected_cents=?,declared_usd_cents=?,expected_usd_cents=?,closed_by=?,denomination_detail=? WHERE id=?').run(closedAt,declared,s.expected_cents,usd,s.expected_usd_cents,req.user.id,detail?JSON.stringify(detail):null,s.id);audit(null,'SHIFT_CLOSE',{id:s.id,declared,usd,denomination_detail:detail,handed_vehicles:handed},req.user.id);return {...totals(s.id),type:s.shift_type};}))));
 app.get('/api/shifts',(req,res)=>res.json(db.prepare('SELECT * FROM shifts WHERE closed_at IS NOT NULL ORDER BY id DESC LIMIT 100').all()));
 app.get('/api/shift/:id/receipt',wrap((req,res)=>res.json(totals(Number(req.params.id)))));
 app.post('/api/shift/:id/print',wrap(async(req,res)=>{const s=totals(Number(req.params.id));await printReport(getCfg(),{type:s.shift_type==='DAY'?'DIA':s.shift_type==='NIGHT'?'NOCHE':'ANTERIOR',shift:s},getPrintSettings());db.prepare('INSERT INTO shift_prints(shift_id,kind,printed_at) VALUES(?,?,?)').run(s.id,s.shift_type,now());audit(null,'SHIFT_PRINT',{id:s.id,kind:s.shift_type},req.user.id);res.json({ok:true});}));
 app.post('/api/ticket/:code/receipt/print',wrap(async(req,res)=>{
  const result=idem(req,()=>{const t=getTicket(req.params.code);if(!t.paid_at)throw Error('Boleto sin pago');audit(t.id,'PAYMENT_REPRINT_REQUESTED',{},req.user.id);return {ok:true,code:t.code};});
  await receipt(req,result,'PAYMENT',{reprint:true});res.json(result);
 }));
 app.post('/api/ticket/:code/lost/print',wrap(async(req,res)=>{
  const result=idem(req,()=>{const t=getTicket(req.params.code);if(!t.lost_at)throw Error('Este boleto no está marcado como perdido');audit(t.id,'LOST_REPRINT_REQUESTED',{},req.user.id);return {ok:true,...quote(t)};});
  await receipt(req,result,'LOST',{reprint:true});res.json(result);
 }));
 app.get('/api/active',(req,res)=>res.json(db.prepare('SELECT code,plate,entry_at,paid_at FROM tickets WHERE '+inside+' ORDER BY entry_at DESC LIMIT 1000').all()));
 app.get('/api/history',(req,res)=>res.json(db.prepare('SELECT code,plate,entry_at,paid_at,exit_at,charged_cents,cancelled_at FROM tickets ORDER BY id DESC LIMIT 200').all()));
 app.get('/api/summary',(req,res)=>{
  const c=getCfg(),s=activeShift(),day=time.dateKey(clock(),c.timeZone),from=new Date(time.localInstant(day,'00:00',c.timeZone)).toISOString(),to=new Date(time.localInstant(time.addDays(day,1),'00:00',c.timeZone)).toISOString();
  const paidShift=s?db.prepare('SELECT COUNT(*) n,COALESCE(SUM(amount_cents),0) cents FROM all_payments WHERE shift_id=?').get(s.id):{n:0,cents:0};
  res.json({capacity:c.capacity,active:db.prepare('SELECT count(*) n FROM tickets WHERE '+inside).get().n,paidShift,shift_id:s?.id??null,shift_type:s?.shift_type??null,paidToday:db.prepare('SELECT COUNT(*) n,COALESCE(SUM(amount_cents),0) cents FROM all_payments WHERE paid_at>=? AND paid_at<?').get(from,to)});
 });
 function period(req){const {start,end}=req.query;if(!time.validDate(start)||!time.validDate(end)||start>end)throw Error('Fechas inválidas');const z=getCfg().timeZone;return [new Date(time.localInstant(start,'00:00',z)).toISOString(),new Date(time.localInstant(time.addDays(end,1),'00:00',z)).toISOString()];}
 app.get('/api/reports/period',supervisor,wrap((req,res)=>res.json({...req.query,...db.prepare("SELECT COUNT(*) operations,COALESCE(SUM(amount_cents),0) revenue_cents,COALESCE(SUM(CASE WHEN method='usd' THEN amount_cents ELSE 0 END),0) usd_revenue_mxn_cents,COALESCE(SUM(received_usd_cents),0) received_usd_cents FROM all_payments WHERE paid_at>=? AND paid_at<?").get(...period(req))})));
 app.get('/api/reports/daily',supervisor,wrap((req,res)=>{const rows=db.prepare('SELECT * FROM all_payments WHERE paid_at>=? AND paid_at<?').all(...period(req)),days=new Map();for(const row of rows){const day=time.dateKey(row.paid_at,getCfg().timeZone),d=days.get(day)||{day,operations:0,revenue_cents:0};d.operations++;d.revenue_cents+=row.amount_cents;days.set(day,d);}res.json([...days.values()].sort((a,b)=>a.day.localeCompare(b.day)));}));
 app.get('/api/reports/occupancy',(req,res)=>res.json({active:db.prepare('SELECT COUNT(*) n FROM tickets WHERE '+inside).get().n,capacity:getCfg().capacity,over24h:db.prepare('SELECT COUNT(*) n FROM tickets WHERE '+inside+' AND entry_at<?').get(new Date(clock()-86400000).toISOString()).n,averageMinutes:Math.round(db.prepare('SELECT AVG((julianday(exit_at)-julianday(entry_at))*1440) n FROM tickets WHERE exit_at IS NOT NULL').get().n||0)}));
 app.get('/api/audit',supervisor,(req,res)=>res.json(db.prepare('SELECT a.*,u.username FROM audit a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 300').all()));
 app.get('/api/users',admin,(req,res)=>res.json(db.prepare('SELECT id,username,role,active,created_at FROM users ORDER BY username').all()));
 app.post('/api/users',admin,wrap((req,res)=>{const name=validUsername(req.body.username),hash=passwordHash(req.body.password);if(!['admin','supervisor','cashier'].includes(req.body.role))throw Error('Rol inválido');const id=db.transaction(()=>{const r=db.prepare('INSERT INTO users(username,password_hash,role,created_at) VALUES(?,?,?,?)').run(name,hash,req.body.role,now());audit(null,'USER_CREATED',{username:name,role:req.body.role},req.user.id);return r.lastInsertRowid;})();res.status(201).json({ok:true,id});}));
 app.put('/api/users/:id',admin,wrap((req,res)=>{db.transaction(()=>{const u=db.prepare('SELECT * FROM users WHERE id=?').get(Number(req.params.id));if(!u)throw Error('Usuario no encontrado');const role=req.body.role??u.role,active=req.body.active===undefined?u.active:req.body.active?1:0;if(!['admin','supervisor','cashier'].includes(role))throw Error('Rol inválido');if(u.id===req.user.id&&(!active||role!=='admin'))throw Error('No puedes quitarte el acceso de administrador');if(u.active&&u.role==='admin'&&(!active||role!=='admin')&&db.prepare("SELECT COUNT(*) n FROM users WHERE role='admin' AND active=1").get().n<=1)throw Error('Debe permanecer un administrador activo');const hash=req.body.password?passwordHash(req.body.password):u.password_hash;db.prepare('UPDATE users SET role=?,active=?,password_hash=? WHERE id=?').run(role,active,hash,u.id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);audit(null,'USER_UPDATED',{id:u.id,role,active},req.user.id);})();res.json({ok:true});}));
 const pensionKind=k=>['pension','pension_day','pension_night'].includes(k);
 const pensionPeriod=v=>{if(v!==null&&v!==undefined&&!['weekly','monthly'].includes(v))throw Error('Elige pensión semanal o mensual');return v||null;};
 const pensionZone=()=>getCfg().timeZone;
 function pensionClients(){
  db.transaction(()=>pensions.plans(db,now(),pensionZone()))();
  return pensions.attachBalances(db,db.prepare("SELECT id,name,CASE WHEN plate LIKE 'PCLIENT%' THEN '' ELSE plate END plate,client_code,kind,daily_price_cents,pension_hours,pension_excess_cents,pension_weekly_unlimited,discount_bps,valid_from,valid_to,window_start,window_end,active,notes,created_at FROM clients ORDER BY name").all());
 }
 app.get('/api/clients',(req,res)=>res.json(pensionClients()));
 function clientData(body){const c={...body};if(typeof c.name!=='string'||!c.name.trim()||c.name.length>100)throw Error('Nombre de cliente inválido');c.plate=normalizePlate(c.plate||'');c.client_code=String(c.client_code||'').trim().toUpperCase();if(c.client_code&&!/^[A-Z0-9_-]{3,24}$/.test(c.client_code))throw Error('Código de cliente inválido (3 a 24 caracteres)');if(!['pension','pension_day','pension_night','frequent','agreement','exempt','daily_flat'].includes(c.kind))throw Error('Tipo de cliente inválido');if(!Number.isSafeInteger(c.discount_bps)||c.discount_bps<0||c.discount_bps>10000)throw Error('Descuento inválido');if(!isISO(c.valid_from)||!isISO(c.valid_to)||c.valid_from>=c.valid_to)throw Error('Vigencia inválida');if(c.kind==='pension'){c.window_start='00:00';c.window_end='23:59';}else if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(c.window_start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(c.window_end)||c.window_start===c.window_end)throw Error('Horario inválido');if(typeof c.notes!=='string'||c.notes.length>500)throw Error('Notas inválidas');
  c.daily_price_cents=c.kind==='daily_flat'?cents(c.daily_price_cents,100000000):10000;
  if(c.kind==='daily_flat'&&!c.daily_price_cents)throw Error('Indica el precio diario del cliente');
  if(c.kind==='pension'){
   if(![12,24].includes(c.pension_hours))c.pension_hours=24;
   c.pension_excess_cents=cents(c.pension_excess_cents,100000000);
  }else{c.pension_hours=24;c.pension_excess_cents=0;}

  // Pensión individual nueva = cuota SEMANAL fija y SIN recargos por estancia.
  // Una pensión histórica sólo cambia cuando se edita explícitamente.
  if(c.kind==='pension'){c.pension_period='weekly';c.pension_excess_cents=0;c.pension_weekly_unlimited=1;}
  else c.pension_weekly_unlimited=0;
  c.pension_period=pensionPeriod(c.pension_period);if(c.pension_period&&!pensionKind(c.kind))throw Error('Selecciona un cliente de pensión para el plan recurrente');if(c.kind==='pension'&&c.pension_period!=='weekly')throw Error('La pensión individual se cobra semanalmente');
  if(c.pension_period){c.pension_price_cents=cents(c.pension_price_cents,100000000);if(!c.pension_price_cents)throw Error('Indica un precio semanal o mensual mayor a cero');if(!isISO(c.pension_start_at))throw Error('Indica la fecha inicial del contrato');}
  return c;}
 function applyPensionPlan(id,c,old){
  const existing=db.prepare('SELECT * FROM pension_contracts WHERE client_id=?').get(id);
  const nowValue=now();
  if(existing&&!existing.stopped_at&&!c.active){
   // Una suspension explicita deja todos los periodos iniciados hasta hoy en deuda.
   // No es lo mismo que un cliente moroso: la mora NO suspende el contrato.
   pensions.accrue(db,id,nowValue,pensionZone());
   db.prepare('UPDATE pension_contracts SET stopped_at=?,updated_at=? WHERE client_id=?').run(nowValue,nowValue,id);
   return;
  }
  if(!c.pension_period){if(existing&&!existing.stopped_at){pensions.accrue(db,id,nowValue,pensionZone());db.prepare('UPDATE pension_contracts SET stopped_at=?,updated_at=? WHERE client_id=?').run(nowValue,nowValue,id);}return;}
  if(!existing||existing.stopped_at){
   // Activar un plan sobre cliente antiguo nunca cobra periodos que no se hayan
   // contratado; la fecha elegida se usa como el inicio real de sus obligaciones.
   const start=c.pension_start_at;
   const duplicated=db.prepare('SELECT id FROM pension_charges WHERE client_id=? AND period_start=?').get(id,start);
   if(duplicated)throw Error('Ya existen cargos en esa fecha de inicio. Selecciona el siguiente periodo.');
   db.prepare(`INSERT INTO pension_contracts(client_id,anchor_at,period,price_cents,next_index,pending_period,pending_price_cents,stopped_at,created_at,updated_at)
     VALUES(?,?,?,?,0,NULL,NULL,NULL,?,?) ON CONFLICT(client_id) DO UPDATE SET
     anchor_at=excluded.anchor_at,period=excluded.period,price_cents=excluded.price_cents,next_index=0,pending_period=NULL,pending_price_cents=NULL,stopped_at=NULL,updated_at=excluded.updated_at`).run(id,start,c.pension_period,c.pension_price_cents,nowValue,nowValue);
   if(!c.active)db.prepare('UPDATE pension_contracts SET stopped_at=? WHERE client_id=?').run(nowValue,id);
  }else{
   // Se conserva siempre lo facturado. Cambiar precio/frecuencia se programa
   // para el proximo periodo, sin recalcular semanas ni meses pasados.
   pensions.accrue(db,id,nowValue,pensionZone());
   const updated=db.prepare('SELECT * FROM pension_contracts WHERE client_id=?').get(id);
   const differs=c.pension_period!==updated.period||c.pension_price_cents!==updated.price_cents;
   db.prepare('UPDATE pension_contracts SET pending_period=?,pending_price_cents=?,updated_at=? WHERE client_id=?')
     .run(differs?c.pension_period:null,differs?c.pension_price_cents:null,nowValue,id);
  }
  // La cobertura del estacionamiento se conserva aunque haya recibos vencidos;
  // las deudas se gestionan por separado y no se cobra la estancia dos veces.
  db.prepare('UPDATE clients SET valid_to=? WHERE id=?').run(pensions.FOREVER,id);
  pensions.accrue(db,id,nowValue,pensionZone());
 }
 // Prior balance: one explicitly authorized opening charge per pension client.
 // This is NOT a cash receipt. It is an existing amount owed, oldest in the ledger.
 const OPENING_DATE='0000-01-01T00:00:00.000Z';
 function openingDebt(clientId,amount,reason,userId){
  const value=cents(amount,100000000);
  if(!value)throw Error('El adeudo anterior debe ser mayor a cero');
  if(!db.prepare('SELECT 1 FROM pension_contracts WHERE client_id=?').get(clientId))throw Error('Este cliente no tiene pensión semanal o mensual');
  if(db.prepare("SELECT id FROM pension_charges WHERE client_id=? AND period='opening'").get(clientId))throw Error('Ya se registró el adeudo inicial de este cliente; no se puede volver a cargar');
  db.prepare('INSERT INTO pension_charges(client_id,period_start,period_end,period,amount_cents,created_at) VALUES(?,?,?,?,?,?)')
    .run(clientId,OPENING_DATE,OPENING_DATE,'opening',value,now());
  audit(null,'PENSION_OPENING_DEBT',{client_id:clientId,amount_cents:value,reason:String(reason||'Adeudo anterior').slice(0,250)},userId);
 }
 app.post('/api/clients/:id/opening-debt',supervisor,wrap((req,res)=>res.status(201).json(idem(req,()=>{
  const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<=0||!db.prepare('SELECT id FROM clients WHERE id=?').get(id))throw Error('Cliente no encontrado');
  openingDebt(id,req.body.amount_cents,req.body.reason,req.user.id);
  return {ok:true,balance_cents:pensions.debt(db,id)};
 }))));
 // Cada adeudo manual se registra como cargo independiente: NUNCA sustituye el anterior.
 // No genera entrada de caja ni modifica periodos facturados ni pagos anteriores.
 app.post('/api/clients/:id/manual-debt',supervisor,wrap((req,res)=>res.status(201).json(idem(req,()=>{
  const id=Number(req.params.id);
  if(!Number.isSafeInteger(id)||id<=0||!db.prepare('SELECT id FROM clients WHERE id=?').get(id))throw Error('Cliente no encontrado');
  if(!db.prepare('SELECT 1 FROM pension_contracts WHERE client_id=?').get(id))throw Error('Primero configura una pensión semanal');
  const amount=cents(req.body.amount_cents,100000000);
  if(amount<=0)throw Error('El adeudo debe ser mayor que cero');
  const reason=validReason(req.body.reason);
  const effective=req.body.effective_at??now();
  if(!isISO(effective))throw Error('Fecha del adeudo inválida');
  if(Date.parse(effective)>clock()+60000)throw Error('El adeudo no puede tener fecha futura');
  pensions.accrue(db,id,now(),pensionZone());
  const entry=db.prepare('INSERT INTO pension_manual_debts(client_id,amount_cents,effective_at,reason,created_at,user_id) VALUES(?,?,?,?,?,?)').run(id,amount,effective,reason,now(),req.user.id);
  audit(null,'PENSION_MANUAL_DEBT',{client_id:id,debt_id:entry.lastInsertRowid,amount_cents:amount,reason,effective_at:effective},req.user.id);
  return {ok:true,id:entry.lastInsertRowid,balance_cents:pensions.debt(db,id)};
 }))));
 app.post('/api/clients',supervisor,wrap((req,res)=>{const c=clientData(req.body);const id=db.transaction(()=>{const identifier=c.plate||'PCLIENT'+crypto.randomBytes(10).toString('hex').toUpperCase();const r=db.prepare('INSERT INTO clients(name,plate,client_code,kind,daily_price_cents,pension_hours,pension_excess_cents,pension_weekly_unlimited,discount_bps,valid_from,valid_to,window_start,window_end,notes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(c.name.trim(),identifier,c.client_code||null,c.kind,c.daily_price_cents,c.pension_hours,c.pension_excess_cents,c.pension_weekly_unlimited,c.discount_bps,c.pension_period?c.pension_start_at:c.valid_from,c.pension_period?pensions.FOREVER:c.valid_to,c.window_start,c.window_end,c.notes,now());if(c.active===false||c.active===0)db.prepare('UPDATE clients SET active=0 WHERE id=?').run(r.lastInsertRowid);applyPensionPlan(r.lastInsertRowid,c,null);if(c.pension_period&&req.body.opening_debt_cents!=null&&req.body.opening_debt_cents!==0)openingDebt(r.lastInsertRowid,req.body.opening_debt_cents,req.body.opening_debt_reason,req.user.id);audit(null,'CLIENT_CREATED',{id:r.lastInsertRowid,client:c},req.user.id);return r.lastInsertRowid;})();res.status(201).json({ok:true,id});}));
 app.put('/api/clients/:id',supervisor,wrap((req,res)=>{const c=clientData(req.body);db.transaction(()=>{const old=db.prepare('SELECT * FROM clients WHERE id=?').get(Number(req.params.id));if(!old)throw Error('Cliente no encontrado');const identifier=c.plate||(old.plate.startsWith('PCLIENT')?old.plate:'PCLIENT'+crypto.randomBytes(10).toString('hex').toUpperCase());
  const r=db.prepare('UPDATE clients SET name=?,plate=?,client_code=?,kind=?,daily_price_cents=?,pension_hours=?,pension_excess_cents=?,pension_weekly_unlimited=?,discount_bps=?,valid_from=?,valid_to=?,window_start=?,window_end=?,notes=?,active=? WHERE id=?').run(c.name.trim(),identifier,c.client_code||null,c.kind,c.daily_price_cents,c.pension_hours,c.pension_excess_cents,c.pension_weekly_unlimited,c.discount_bps,old.valid_from,c.pension_period?pensions.FOREVER:c.valid_to,c.window_start,c.window_end,c.notes,c.active===false||c.active===0?0:1,Number(req.params.id));
  if(!r.changes)throw Error('Cliente no encontrado');applyPensionPlan(Number(req.params.id),c,old);if(!c.pension_period&&db.prepare('SELECT 1 FROM pension_contracts WHERE client_id=?').get(old.id)){db.prepare('UPDATE clients SET valid_to=? WHERE id=?').run(now(),old.id);}audit(null,'CLIENT_UPDATED',{id:Number(req.params.id),client:c},req.user.id);})();res.json({ok:true});}));
 app.get('/api/clients/:id/pension-ledger',supervisor,wrap((req,res)=>{
  const id=Number(req.params.id);if(!db.prepare('SELECT id FROM clients WHERE id=?').get(id))throw Error('Cliente no encontrado');
  db.transaction(()=>pensions.accrue(db,id,now(),pensionZone()))();
  res.json({client_id:id,charges:pensions.ledger(db,id),balance_cents:pensions.debt(db,id)});
 }));
 app.post('/api/clients/:id/pension-pay',supervisor,wrap((req,res)=>res.json(idem(req,()=>{
  const s=needShift(),id=Number(req.params.id),client=db.prepare('SELECT * FROM clients WHERE id=?').get(id),plan=db.prepare('SELECT * FROM pension_contracts WHERE client_id=?').get(id);
  if(!client||!plan)throw Error('El cliente no tiene una pensión recurrente configurada');
  pensions.accrue(db,id,now(),pensionZone());const due=pensions.debt(db,id);
  if(!due)throw Error('Esta pensión no tiene adeudos');const amount=cents(req.body.amount_cents);
  if(!amount||amount>due)throw Error('El abono debe ser positivo y no puede superar la deuda');
  const p=payment(req.body,amount,s);
  const adjustmentId=adjustment(null,id,amount,p,s,req.user.id,'pension',{recurring:true});
  const allocated=pensions.allocate(db,id,adjustmentId,amount);
  audit(null,'PENSION_PAYMENT',{client_id:id,adjustment_id:adjustmentId,amount,allocated,remaining_cents:due-amount},req.user.id);
  return {ok:true,id:adjustmentId,charged_cents:amount,remaining_cents:due-amount,allocated,...p};
 }))));
 // Se mantiene el procedimiento de renovación anterior solamente para los
 // clientes que aun no han contratado un plan semanal/mensual recurrente.
 app.post('/api/clients/:id/renew',supervisor,wrap((req,res)=>res.json(idem(req,()=>{const s=needShift(),c=db.prepare('SELECT * FROM clients WHERE id=?').get(Number(req.params.id));if(!c)throw Error('Cliente no encontrado');if(db.prepare('SELECT 1 FROM pension_contracts WHERE client_id=?').get(c.id))throw Error('Esta pensión tiene cobro automático por periodos; utiliza Pagar adeudo');if(!pensionKind(c.kind))throw Error('Solo las pensiones se renuevan con cobro');const from=req.body.valid_from,to=req.body.valid_to;if(!isISO(from)||!isISO(to)||from>=to||to<=c.valid_to)throw Error('La renovación debe extender la vigencia');const amount=cents(req.body.amount_cents);if(!amount)throw Error('La pensión requiere importe mayor a cero');const p=payment(req.body,amount,s);const id=adjustment(null,c.id,amount,p,s,req.user.id,'pension',{valid_from:from,valid_to:to});db.prepare('UPDATE clients SET valid_from=?,valid_to=?,active=1 WHERE id=?').run(from,to,c.id);audit(null,'PENSION_RENEWAL',{client_id:c.id,id,amount,from,to},req.user.id);return {ok:true,id,charged_cents:amount,...p};}))));
 app.get('/api/backups',admin,(req,res)=>res.json({files:storage.list(),...storage.status()}));
 app.post('/api/backup',admin,wrap(async(req,res)=>res.json(await storage.backup())));
 // Una sola confirmación desde la UI, sin contraseña adicional ni palabra clave.
 // Se conserva el requisito de tener sesión de administrador para no permitir
 // que cualquier cajero borre de forma accidental los datos del cliente.
 app.post('/api/factory-reset',admin,wrap(async(req,res)=>{
  if(req.body?.confirm!==true)throw Error('Confirma el restablecimiento');
  const result=await storage.resetAll();
  res.clearCookie('parking_session',{path:'/'});
  res.json({...result,message:'Parking POS quedó vacío. Configura nuevamente el administrador.'});
 }));
 app.post('/api/restore',admin,wrap(async(req,res)=>{if(activeShift())throw Error('Cierra el turno antes de restaurar');const u=db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);if(!verify(req.body.password,u.password_hash))throw Error('Contraseña incorrecta');if(req.body.confirm!=='RESTAURAR')throw Error('Escribe RESTAURAR');await storage.backup('before-restore');storage.stageRestore(req.body.name);app.locals.maintenance=true;res.json({ok:true,restartRequired:true,message:'Restauración preparada. Cierra la ventana del servidor y vuelve a iniciar Parking POS.'});}));
 return {getCfg,totals,quote,activeShift,waitForIdle};
}
function validReason(v){if(typeof v!=='string'||v.trim().length<3||v.length>250)throw Error('Escribe un motivo de 3 a 250 caracteres');return v.trim();}
function normalizePlate(v){if(typeof v!=='string'||v.length>24||!/^[a-zA-Z0-9 -]*$/.test(v))throw Error('Placa inválida');return v.replace(/[ -]/g,'').toUpperCase();}
function isISO(s){return typeof s==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString()===s;}
module.exports={installOperations};
