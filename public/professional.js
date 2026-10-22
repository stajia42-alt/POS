'use strict';
let user=null,currentShiftId=null,clientRows=[],currentClientId=null;
const pendingRequests=new Map();
function parseMoneyUI(v,places=2){const s=String(v??'').trim().replace(',','.');if(!new RegExp('^\\d+(?:\\.\\d{1,'+places+'})?$').test(s))throw Error('Usa una cantidad válida con hasta '+places+' decimales');const [a,b='']=s.split('.'),n=Number(a)*10**places+Number(b.padEnd(places,'0'));if(!Number.isSafeInteger(n)||n>1000000000)throw Error('Cantidad fuera de límite');return n;}
function rateUnitsUI(v){const n=parseMoneyUI(v,4);if(n<=0||n>10000000)throw Error('Tipo de cambio inválido');return n;}
function convertUsdUI(n,rate){return Number((BigInt(n)*BigInt(rateUnitsUI(rate))+5000n)/10000n);}
moneyInput=id=>parseMoneyUI($(id)?.value);
getReceived=()=>{try{return moneyInput('received')}catch{return null}};
api=async function(url,opt={}){
 const method=opt.method||'GET',mutating=!['GET','HEAD'].includes(method),signature=method+' '+url+' '+(opt.body||''),headers={'Content-Type':'application/json',...(opt.headers||{})};
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(signature));
 const storageKey='parking-pending:'+Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
 if(mutating){if(pendingRequests.has(signature))throw Error('Operación en proceso. Espera su resultado.');let key=sessionStorage.getItem(storageKey)||crypto.randomUUID();headers['Idempotency-Key']=key;sessionStorage.setItem(storageKey,key);pendingRequests.set(signature,key);}
 try{let r;try{r=await fetch(url,{...opt,headers})}catch{throw Error('Sin respuesta del servidor. Reintenta la misma operación; se recuperará sin duplicarla.');}
  const j=await r.json();if(mutating)sessionStorage.removeItem(storageKey);
  if(!r.ok){if(r.status===401&&url!=='/api/auth/login')showLogin(false);throw Error(j.error||'Error de comunicación');}return j;
 }finally{pendingRequests.delete(signature);}
};
function modal(title,content){$('actionModal').innerHTML='<div class="opening-dialog"><h2>'+esc(title)+'</h2>'+content+'<p id="modalError" class="muted"></p><button class="btn full" onclick="hideModal()">Cerrar</button></div>';$('actionModal').style.display='flex';}
function hideModal(){$('actionModal').style.display='none';$('actionModal').innerHTML='';}
function modalError(e){if($('modalError'))$('modalError').textContent=e.message;else msg(e.message);}
function showLogin(setup){hideModal();$('openingOverlay').style.display='none';$('loginOverlay').style.display='flex';$('loginHeading').textContent=setup?'Crear administrador':'Iniciar sesión';$('loginHelp').textContent=setup?'Crea tu usuario administrador. Puedes usar un PIN sencillo de 4 dígitos o una contraseña de 4 a 128 caracteres. Elige uno propio.':'Escribe tu usuario y PIN o contraseña.';$('loginForm').dataset.setup=setup?'yes':'no';$('loginError').textContent='';$('loginUsername').focus();}
async function login(event){event.preventDefault();const btn=$('loginSubmit');btn.disabled=true;try{const setup=$('loginForm').dataset.setup==='yes',r=await api('/api/auth/'+(setup?'setup':'login'),{method:'POST',body:JSON.stringify({username:$('loginUsername').value.trim(),password:$('loginPassword').value})});user=r.user;$('loginPassword').value='';$('loginOverlay').style.display='none';await startSessionUI();}catch(e){$('loginError').textContent=e.message}finally{btn.disabled=false}}
async function logout(){try{await api('/api/auth/logout',{method:'POST'});user=null;sessionStorage.clear();showLogin(false)}catch(e){msg(e.message)}}
async function startSessionUI(){
 current=null;currentShiftId=null;clientRows=[];hideModal();$('notice').classList.remove('show');$('code').value='';$('entryPlate').value='';$('charge').innerHTML='';$('lastEntry').innerHTML='';$('lastEntry').style.display='none';$('clientList').innerHTML='';$('userList').innerHTML='';$('auditList').innerHTML='';$('adminTools').style.display=user.role==='admin'?'block':'none';page('dashboard',document.querySelector('nav button'));
 $('signedUser').textContent=user.username+' · '+({admin:'Administrador',supervisor:'Supervisor',cashier:'Cajero'}[user.role]);
 document.querySelectorAll('nav button').forEach(b=>{if(/rates|settings|clients/.test(b.getAttribute('onclick')||''))b.style.display=user.role==='cashier'?'none':'';});
 await Promise.all([load(),loadShift(),loadExtras(),loadTicketSettings(),loadEntryClients()]);await checkOpening();
 const today=new Date();const date=new Date(today.getTime()-today.getTimezoneOffset()*60000).toISOString().slice(0,10);$('reportStart').value=date;$('reportEnd').value=date;
}
function closeOpening(){$('openingOverlay').style.display='none';}
const originalRenderCharge=renderCharge;
renderCharge=function(){if(!current)return;const c=current;
 if(!c.cancelled_at&&!c.exit_at&&!c.paid_at&&c.estimated_cents===0&&c.benefit_snapshot){
  let benefit=null;try{benefit=JSON.parse(c.benefit_snapshot)}catch{}
  if(benefit?.kind==='pension'){
   $('charge').innerHTML='<div class="charge"><div class="pill">PENSIÓN PERSONALIZADA</div><p>Folio <b class="code">'+esc(c.code)+'</b></p><p class="muted">'+esc(benefit.name||'Cliente pensionado')+(benefit.pension_weekly_unlimited?' · cuota semanal, sin cobro por horas':' · '+benefit.pension_hours+' horas desde la hora impresa en el boleto')+'</p>'+(c.pension_coverage_until?'<p class="muted">Cobertura hasta: <b>'+esc(new Date(c.pension_coverage_until).toLocaleString('es-MX',{timeZone:c.pension_coverage_time_zone||'America/Tijuana'}))+'</b></p>':'')+'<p>Importe a cobrar en esta salida</p><div class="price">'+fmt(0)+'</div><p class="muted">La cuota semanal y cualquier adeudo se administran en Clientes y pensiones. No se aplica el tabulador general.</p><button class="btn primary full" id="finishPensionBtn" onclick="finishPensionExit()">FINALIZAR SALIDA SIN COBRO</button></div>';
   return;
  }
 }
 if(c.cancelled_at||c.exit_at){$('charge').innerHTML='<div class="charge"><div class="pill">'+(c.cancelled_at?'Cancelado':'Salida confirmada')+'</div><p>Folio '+esc(c.code)+'</p><p>Cobrado históricamente: '+fmt(c.charged_cents||0)+'</p></div>';}else originalRenderCharge();
 const host=$('charge');const extra=document.createElement('div');extra.className='actions-row';
 if(c.benefit_snapshot){const b=JSON.parse(c.benefit_snapshot);const p=document.createElement('p');p.className='muted';p.textContent='Cliente: '+b.name+' · '+clientKind(b.kind);host.append(p);}
 if(c.lost_at){const p=document.createElement('p');p.className='muted';p.textContent='Incluye boleto perdido: '+fmt(c.lost_cents);host.append(p);}
 if(c.paid_at&&!c.exit_at&&!c.cancelled_at){
  const p=document.createElement('p');p.className='muted';p.textContent='Boleto pagado en una versión anterior. Solicita a un supervisor regularizar el estado histórico.';host.append(p);
  if(user?.role!=='cashier')extra.innerHTML+='<button class="btn" onclick="confirmExit(current.code)">Regularizar boleto antiguo</button>';
 }
 if(c.paid_at)extra.innerHTML+='<button class="btn" onclick="printPayment(current.code)">Reimprimir comprobante de pago</button>';
 if(c.lost_at)extra.innerHTML+='<button class="btn" onclick="printLost(current.code)">Imprimir constancia de boleto perdido</button>';
 if(!c.paid_at&&!c.cancelled_at&&!c.exit_at&&!c.lost_at)extra.innerHTML+='<button class="btn" onclick="markLost()">Boleto perdido</button>';
 if(!c.cancelled_at)extra.innerHTML+='<button class="btn danger" onclick="showCancel()">Cancelar boleto</button>';
 extra.innerHTML+='<button class="btn" onclick="reprint(current.code)">Reimprimir entrada (administrador)</button>';host.append(extra);
};
async function finishPensionExit(){
 if(!current||busy)return;
 const code=current.code;busy=true;
 const btn=$('finishPensionBtn');if(btn)btn.disabled=true;
 try{
  const result=await api('/api/ticket/'+encodeURIComponent(code)+'/pay',{
   method:'POST',body:JSON.stringify({method:'efectivo',received_cents:0,expected_cents:0,revision:current.revision})
  });
  current=null;$('code').value='';$('charge').innerHTML='<div class="result"><div class="pill">SALIDA DE PENSIÓN CONFIRMADA</div><p>Folio '+esc(code)+'</p><h2>Sin cobro de estancia</h2><p class="muted">Se liberó el espacio. Las cuotas y los adeudos del cliente se conservan en su estado de cuenta.</p>'+receiptStatusHTML(result)+'<button class="btn" onclick="printPayment(\''+esc(code)+'\')">'+(result.receipt_printed?'Reimprimir comprobante':'Reintentar impresión del pago')+'</button><button class="btn primary" onclick="nextCustomer()">Siguiente vehículo</button></div>';
  await refresh();msg('Salida registrada sin cobro, folio '+code);
 }catch(e){msg(e.message)}finally{busy=false;if($('finishPensionBtn'))$('finishPensionBtn').disabled=false;}
}
async function confirmExit(code){try{await api('/api/ticket/'+encodeURIComponent(code)+'/exit',{method:'POST',body:'{}'});msg('Salida confirmada. Cajón liberado.');current=null;nextCustomer();refresh();}catch(e){msg(e.message);$('code').value=code;await lookup();}}
function receiptStatusHTML(result){
 if(result.receipt_state==='pending')return '<p class="muted" role="status">El envío del comprobante sigue en proceso. Revisa la impresora antes de solicitar otra copia.</p>';
 const warning=result.receipt_warning||result.printError;
 if(warning)return '<p class="muted" role="status" style="color:#ffbd80">'+esc(warning)+'</p>';
 if(result.receipt_printed===true||result.printed===true)return '<p class="muted" role="status">Comprobante enviado a la impresora.</p>';
 if(result.replayed)return '<p class="muted" role="status">Operación recuperada sin duplicar el registro ni la impresión. Si falta el comprobante, utiliza Reintentar impresión.</p>';
 return '<p class="muted" role="status">El movimiento está guardado. Si falta el comprobante, puedes reintentar su impresión.</p>';
}
const printJobs=new Set();
async function sendReceiptPrint(code,kind){
 const signature=kind+':'+code;if(printJobs.has(signature))return;printJobs.add(signature);
 try{
  const result=await api('/api/ticket/'+encodeURIComponent(code)+(kind==='lost'?'/lost/print':'/receipt/print'),{method:'POST',body:'{}'});
  if(result.receipt_state==='pending'||result.pending){msg('El envío está en proceso. Revisa la impresora antes de solicitar otra copia.');return;}
  if(result.receipt_warning||result.printError||result.receipt_printed===false||result.printed===false){msg(result.receipt_warning||result.printError||'No se pudo enviar a la impresora. El registro sigue guardado.');return;}
  msg((kind==='lost'?'Constancia de boleto perdido':'Comprobante de pago')+' enviada a la impresora. No se registró otro cobro.');
 }catch(e){msg(e.message)}finally{printJobs.delete(signature)}
}
async function printPayment(code){return sendReceiptPrint(code,'payment')}
async function printLost(code){return sendReceiptPrint(code,'lost')}
async function printShift(id){
 const signature='shift:'+id;if(printJobs.has(signature))return;printJobs.add(signature);
 try{await api('/api/shift/'+id+'/print',{method:'POST',body:'{}'});msg('Corte enviado a la impresora térmica')}
 catch(e){msg(e.message)}finally{printJobs.delete(signature)}
}
function markLost(){
 if(!current||current.lost_at||busy)return;
 modal('Boleto perdido','<p class="muted">Se agregará el cargo configurado para este boleto, además de la estancia, y se imprimirá una constancia. Esta constancia todavía no acredita el pago. Verifica la identidad y el vehículo.</p><label class="field" for="lostReason">Motivo / referencia de identificación</label><input id="lostReason" maxlength="250"><button id="saveLostBtn" class="btn primary full" onclick="saveLost()">Aplicar cargo e imprimir</button>');
 $('lostReason').focus();
}
async function saveLost(){
 if(!current||busy)return;
 const code=current.code,button=$('saveLostBtn');busy=true;if(button)button.disabled=true;
 try{
  const result=await api('/api/ticket/'+encodeURIComponent(code)+'/lost',{method:'POST',body:JSON.stringify({reason:$('lostReason').value})});
  current=result;hideModal();renderCharge();
  msg('Boleto perdido registrado. '+(result.receipt_warning||result.printError||(result.receipt_printed?'Constancia enviada a la impresora.':'El cargo se cobrará al confirmar el pago.')));
 }catch(e){modalError(e)}finally{busy=false;if($('saveLostBtn'))$('saveLostBtn').disabled=false;if($('payBtn'))updateChange()}
}
let reprintCode=null,reprintBusy=false;
async function reprintLastEntry(){
 if(reprintBusy)return;
 const button=$('reprintLastEntryBtn');if(button)button.disabled=true;
 try{
  const {ticket}=await api('/api/tickets/latest-entry');
  if(!ticket)return msg('Todavía no hay una entrada para reimprimir.');
  reprint(ticket.code,ticket.entry_at);
 }catch(e){msg(e.message)}finally{if(button)button.disabled=false}
}
reprint=function(code,entryAt){
 if(reprintBusy)return;
 reprintCode=String(code);
 modal('Autorizar reimpresión de entrada','<p>Folio original: <b class="code">'+esc(code)+'</b>'+(entryAt?'<br>Entrada: '+esc(new Date(entryAt).toLocaleString('es-MX')):'')+'</p><p class="muted">Se imprimirá una copia marcada REIMPRESIÓN, sin crear otra entrada ni registrar una venta. Quedarán guardados el motivo, el cajero y el administrador que autoriza.</p><label class="field" for="reprintReason">Motivo obligatorio</label><input id="reprintReason" maxlength="250" placeholder="Ej. Papel atorado o boleto dañado">'+(user?.role!=='admin'?'<label class="field" for="reprintAuthorizationUsername">Usuario del administrador</label><input id="reprintAuthorizationUsername" autocomplete="off" maxlength="40"><label class="field" for="reprintAuthorizationPassword">PIN o contraseña del administrador</label><input id="reprintAuthorizationPassword" type="password" autocomplete="off" maxlength="128"><p class="muted">La autorización es solo para esta copia. Tu sesión de cajero continúa.</p>':'')+'<button id="confirmReprintBtn" class="btn primary full" onclick="confirmEntryReprint()">Autorizar e imprimir copia</button>');
 $('reprintReason').focus();
};
async function confirmEntryReprint(){
 if(reprintBusy||!reprintCode)return;
 const reason=$('reprintReason')?.value.trim();if(!reason||reason.length<3)return modalError(Error('Escribe un motivo de al menos 3 caracteres.'));
 const body={reason};
 if(user?.role!=='admin'){
  body.authorization_username=$('reprintAuthorizationUsername').value.trim();body.authorization_password=$('reprintAuthorizationPassword').value;
  if(!body.authorization_username||!body.authorization_password)return modalError(Error('El administrador debe autorizar con su usuario y PIN o contraseña.'));
 }
 reprintBusy=true;const code=reprintCode,button=$('confirmReprintBtn');if(button)button.disabled=true;
 try{
  const result=await api('/api/ticket/'+encodeURIComponent(code)+'/reprint',{method:'POST',body:JSON.stringify(body)});
  if(result.pending)return modalError(Error(result.warning||'El envío sigue en proceso. Revisa la impresora antes de solicitar otra copia.'));
  if(result.printed===false)return modalError(Error(result.printError||'No se pudo imprimir. El folio original se conserva.'));
  hideModal();reprintCode=null;msg('Copia autorizada enviada a la impresora. Folio '+code+'. No se creó otra entrada ni venta.'+(result.audit_warning?' '+result.audit_warning:''));
 }catch(e){modalError(e)}finally{reprintBusy=false;if($('confirmReprintBtn'))$('confirmReprintBtn').disabled=false}
}
function showCancel(){modal('Autorizar cancelación','<p class="muted">Se conservarán el boleto y los cobros originales. '+(current.paid_at?'Devolución a entregar en MXN: <b>'+fmt(current.charged_cents||0)+'</b>.':'No tiene pagos para devolver.')+'</p><label class="field">Motivo obligatorio</label><input id="cancelReason" maxlength="250">'+(user.role==='cashier'?'<label class="field">Usuario supervisor</label><input id="authorizeUser" autocomplete="off"><label class="field">Contraseña supervisor</label><input id="authorizePassword" type="password" autocomplete="off">':'')+'<button class="btn danger full" onclick="cancelTicket()">Confirmar cancelación'+(current.paid_at?' y devolución':'')+'</button>');}
async function cancelTicket(){try{const body={reason:$('cancelReason').value,refund_cents:current.charged_cents||0};if(user.role==='cashier'){body.authorization_username=$('authorizeUser').value;body.authorization_password=$('authorizePassword').value;}const r=await api('/api/ticket/'+encodeURIComponent(current.code)+'/cancel',{method:'POST',body:JSON.stringify(body)});hideModal();msg('Boleto cancelado. Devolver '+fmt(r.refund_cents)+' MXN.');await lookup();refresh();loadShift();}catch(e){modalError(e)}}
async function loadLibraReference(){try{if(!confirm('¿Cargar los rangos de referencia Libra 3? Revisa y guarda para aplicarlos a nuevas entradas.'))return;const c=await api('/api/rates/libra3');$('mode').value='blocks';$('grace').value=c.graceMinutes;$('blocks').value=c.blocks.map(b=>b.until+','+b.cents/100).join('\n');$('additional').value=c.additionalHourCents/100;$('additionalMinutes').value=c.additionalMinutes;toggle();msg('Referencia cargada en el formulario. Guarda las tarifas para activarla. Máximo y recargo nocturno se configuran por separado.');}catch(e){msg(e.message)}}
const originalLoadShift=loadShift;
loadShift=async function(){await originalLoadShift();if(user?.role==='cashier'){for(const id of ['newUsdRate','movementKind','movementAmount','movementReason','movementCurrency'])if($(id))$(id).disabled=true;}}
function clientKind(k){return {pension:'Pensión personalizada',pension_day:'Pensión anterior (día)',pension_night:'Pensión anterior (noche)',frequent:'Cliente frecuente',agreement:'Convenio',daily_flat:'Tarifa de día completo',exempt:'Exento'}[k]||k;}
async function loadClients(){try{
 clientRows=await api('/api/clients');
 $('clientList').innerHTML=clientRows.length?'<div style="overflow-x:auto"><table class="table"><thead><tr><th>Cliente / código</th><th>Plan personalizado</th><th>Adeudo acumulado</th><th>Acciones</th></tr></thead><tbody>'+clientRows.map(c=>{
  const ct=c.contract,period=ct?.pending_period||ct?.period,price=ct?.pending_price_cents||ct?.price_cents;
  const plan=ct?(period==='weekly'?'Semanal':'Mensual')+' · '+fmt(price)+(ct.pending_period?' (nuevo precio desde siguiente periodo)':'')+(c.kind==='pension'?(c.pension_weekly_unlimited?' · sin cobro por horas':' · plan anterior de 12/24 h'):''):c.kind==='daily_flat'?'Día completo · '+fmt(c.daily_price_cents||10000)+' por 24 h o fracción':c.kind.startsWith('pension')?'Plan anterior (editar para personalizar)':esc(clientKind(c.kind));
  return '<tr><td><b>'+esc(c.name)+'</b><br><span class="muted">Código: '+esc(c.client_code||'—')+(c.plate?' · '+esc(c.plate):'')+'</span></td><td>'+plan+(c.active?'':' · Suspendido')+'</td><td><b style="color:'+(c.balance_cents?'#f8bc76':'#78d8a7')+'">'+fmt(c.balance_cents||0)+'</b>'+(c.billed_periods?'<br><small class="muted">'+c.billed_periods+' periodos facturados</small>':'')+'</td><td><button class="btn" onclick="editClient('+c.id+')">Editar</button> '+(ct?'<button class="btn primary" onclick="viewPensionDebt('+c.id+')">Ver deuda / Abonar</button> <button class="btn" onclick="addPreviousDebt('+c.id+')">Agregar adeudo</button>':c.kind.startsWith('pension')?'<button class="btn" onclick="renewClient('+c.id+')">Renovación antigua</button>':'')+'</td></tr>';
 }).join('')+'</tbody></table></div>':'<p class="muted">Sin clientes registrados.</p>';
}catch(e){msg(e.message)}}
function localInput(iso){const d=new Date(iso);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
function editClient(id){const c=clientRows.find(c=>c.id===id)||{name:'',plate:'',kind:'pension',pension_hours:24,pension_excess_cents:0,discount_bps:0,valid_from:new Date().toISOString(),valid_to:new Date(Date.now()+30*86400000).toISOString(),window_start:'08:00',window_end:'20:00',notes:'',active:1,contract:null};currentClientId=id||null;
 const contract=c.contract,period=contract?(contract.pending_period||contract.period):'weekly';
 const price=contract?(contract.pending_price_cents||contract.price_cents)/100:'';
 const begin=contract&&!contract.stopped_at?contract.anchor_at:new Date(id&&(!contract)?Math.max(Date.parse(c.valid_to)||0,Date.now()):Date.now()).toISOString();
 modal(id?'Editar cliente':'Nuevo cliente',`<p class="muted">Pensión individual con precio SEMANAL personalizado. Sin cobros por hora, sin excedentes y fuera del tabulador general. Los adeudos pueden agregarse uno a uno.</p>
 <label class="field">Nombre</label><input id="clientName" maxlength="100" value="${esc(c.name)}"><label class="field">Placa (opcional)</label><input id="clientPlate" maxlength="24" value="${esc(c.plate)}"><label class="field">Código / tarjeta de cliente</label><input id="clientCode" maxlength="24" value="${esc(c.client_code||'')}" placeholder="Ej. PENSION01"><label class="field">Tipo de cliente</label><select id="clientKind" onchange="togglePensionFields()">${['pension','frequent','agreement','daily_flat','exempt'].map(k=>'<option value="'+k+'" '+((c.kind==='pension_day'||c.kind==='pension_night'?'pension':c.kind)===k?'selected':'')+'>'+clientKind(k)+'</option>').join('')}</select>
 <div id="pensionConfig" style="padding:12px;border:1px solid #344557;border-radius:12px;margin-top:12px">
 <input id="clientPensionPeriod" type="hidden" value="weekly"><input id="clientPensionHours" type="hidden" value="24"><input id="clientPensionExcess" type="hidden" value="0"><p class="muted" style="font-size:12px">Cobro individual solamente por semana. Cada boleto de esta pensión se liquida sin tarifa por tiempo. La deuda semanal y los adeudos manuales se cobran desde Estado de cuenta.</p>
 <div id="pensionPriceOptions"><label class="field">Precio de esta pensión por SEMANA (MXN)</label><input id="clientPensionPrice" inputmode="decimal" value="${price}" placeholder="Ej. 750.00"><label class="field">Comenzar a generar cargos desde</label><input id="clientPensionBegin" type="datetime-local" value="${localInput(begin)}" ${contract&&!contract.stopped_at?'disabled':''}><p class="muted" style="font-size:12px">${contract&&!contract.stopped_at?'El inicio del contrato no se modifica para conservar los periodos anteriores. Los cambios de precio se aplican desde la siguiente semana.':'En una pensión antigua comienza después del periodo ya pagado, para no cobrarlo dos veces.'} Los cargos se acumulan aunque el cliente no pague; solo se registran como venta al recibir el dinero.</p></div></div>
 <div id="dailyPriceConfig"><label class="field">Precio por día completo (24 horas o fracción, MXN)</label><input id="clientDailyPrice" inputmode="decimal" value="${(c.daily_price_cents||10000)/100}" placeholder="100.00"><p class="muted">Para este cliente se cobrará este importe por cada bloque de 24 horas iniciado. No genera deuda recurrente.</p></div>
 <div id="openingDebtConfig" style="margin:12px 0;padding:12px;border:1px solid #344557;border-radius:12px"><label class="field">¿Ya te debe dinero de antes? (MXN)</label><input id="clientOpeningDebt" value="0.00" inputmode="decimal" placeholder="0.00"><p class="muted">Solo al crear una nueva pensión. Se añade una vez a su estado de cuenta, sin registrar una venta ni modificar adeudos anteriores.</p></div>
 <label class="field">Descuento % (solo frecuentes / convenios)</label><input id="clientDiscount" value="${c.discount_bps/100}" inputmode="decimal"><div id="clientLegacyValidity"><label class="field">Vigencia desde</label><input id="clientFrom" type="datetime-local" value="${localInput(c.valid_from)}"><label class="field">Vigencia hasta</label><input id="clientTo" type="datetime-local" value="${localInput(c.valid_to)}"></div><div id="legacyPensionWindow"><label class="field">Horario del convenio (solo planes anteriores)</label><div class="formrow"><input id="clientStart" type="time" value="${c.window_start}"><input id="clientEnd" type="time" value="${c.window_end}"></div></div><label class="field">Notas</label><input id="clientNotes" maxlength="500" value="${esc(c.notes)}"><label class="field"><input id="clientActive" type="checkbox" style="width:auto" ${c.active?'checked':''}> Cliente activo (suspender manualmente detiene los cargos nuevos)</label><button class="btn primary full" onclick="saveClient()">Guardar cliente y plan</button>`);
 togglePensionFields();
}
// La pensión unificada no requiere elegir día o noche.
function togglePensionFields(){const eligible=$('clientKind').value==='pension';$('pensionConfig').style.display=eligible?'block':'none';$('pensionPriceOptions').style.display=eligible?'block':'none';$('clientLegacyValidity').style.display=eligible?'none':'block';$('dailyPriceConfig').style.display=$('clientKind').value==='daily_flat'?'block':'none';$('legacyPensionWindow').style.display=eligible?'none':'block';$('openingDebtConfig').style.display=eligible&&!currentClientId?'block':'none';}

async function saveClient(){try{
 const period=$('clientKind').value==='pension'?'weekly':null;
 const validityStart=new Date($('clientFrom').value).toISOString(),validityEnd=new Date($('clientTo').value).toISOString();
 const start=period?new Date($('clientPensionBegin').value).toISOString():null;
 const body={name:$('clientName').value,plate:$('clientPlate').value,client_code:$('clientCode').value,kind:$('clientKind').value,discount_bps:parseMoneyUI($('clientDiscount').value),valid_from:validityStart,valid_to:period?'2099-12-31T23:59:59.000Z':validityEnd,window_start:$('clientStart').value,window_end:$('clientEnd').value,notes:$('clientNotes').value,active:$('clientActive').checked,pension_period:period,pension_start_at:start,pension_price_cents:period?moneyInput('clientPensionPrice'):null,daily_price_cents:$('clientKind').value==='daily_flat'?moneyInput('clientDailyPrice'):10000,pension_hours:24,pension_excess_cents:0,opening_debt_cents:period&&!currentClientId?moneyInput('clientOpeningDebt'):0};
 if(!body.active&&!confirm('Suspender al cliente detendrá la generación de cargos nuevos. La deuda pendiente seguirá registrada. ¿Continuar?'))return;
 await api('/api/clients'+(currentClientId?'/'+currentClientId:''),{method:currentClientId?'PUT':'POST',body:JSON.stringify(body)});
 hideModal();await loadClients();await loadEntryClients();msg('Cliente guardado. Cada periodo guarda su precio y los adeudos pendientes se acumulan.');
}catch(e){modalError(e)}}
async function addPreviousDebt(id){
 const c=clientRows.find(x=>x.id===id);
 if(!c?.contract)return msg('Configura primero una pensión semanal');
 modal('Agregar adeudo · '+c.name,`<p class="muted">Puedes agregar cuantos cargos necesites. Cada uno conserva fecha, motivo e importe. No entra como dinero en caja hasta que se abone.</p>
 <label class="field">Importe (MXN)</label><input id="olderDebt" inputmode="decimal" placeholder="Ej. 350.00">
 <label class="field">Fecha del adeudo</label><input id="olderDebtDate" type="date" value="${localInput(new Date().toISOString()).slice(0,10)}">
 <label class="field">Motivo del adeudo</label><input id="olderDebtNote" maxlength="250" placeholder="Ej. Cuota pendiente / adeudo anterior">
 <button class="btn primary full" onclick="savePreviousDebt(${id})">Agregar y sumar al saldo</button>`);
}
async function savePreviousDebt(id){try{
 const amount=moneyInput('olderDebt');if(!amount)throw Error('Escribe un adeudo mayor a cero');
 const reason=$('olderDebtNote').value.trim();if(reason.length<3)throw Error('Escribe un motivo de al menos 3 caracteres');
 const day=$('olderDebtDate').value;if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('Elige una fecha válida');
 const effective=new Date(day+'T00:00:00').toISOString();
 if(!confirm('¿Sumar '+fmt(amount)+' a los adeudos de este cliente?'))return;
 const result=await api('/api/clients/'+id+'/manual-debt',{method:'POST',body:JSON.stringify({amount_cents:amount,reason,effective_at:effective})});
 hideModal();await loadClients();msg('Adeudo agregado. Saldo pendiente: '+fmt(result.balance_cents));
}catch(e){modalError(e)}}
let pensionPaymentClient=null,pensionPaymentRate=null,pensionPaymentDue=0;
async function viewPensionDebt(id){try{
 const c=clientRows.find(r=>r.id===id);if(!c)throw Error('Cliente no encontrado');
 const data=await api('/api/clients/'+id+'/pension-ledger');pensionPaymentClient=id;pensionPaymentDue=data.balance_cents;
 const rows=data.charges;
 modal('Estado de cuenta · '+c.name,`<p class="muted">${c.contract?.period==='weekly'?'Pensión semanal':'Contrato anterior mensual'} · Precio configurado: ${fmt(c.contract?.price_cents||0)}. Los importes ya facturados se conservan aunque cambie el plan.</p>
 <div style="font-size:24px;font-weight:800;margin:14px 0">Total pendiente: ${fmt(data.balance_cents)}</div>
 <div style="max-height:250px;overflow-y:auto"><table class="table"><thead><tr><th>Periodo</th><th>Cargo</th><th>Abonado</th><th>Saldo</th></tr></thead><tbody>${rows.map(r=>'<tr><td>'+(r.period==='opening'?'Adeudo inicial':r.period==='manual'?'Adeudo: '+esc(r.reason)+' ('+new Date(r.period_start).toLocaleDateString('es-MX')+')':new Date(r.period_start).toLocaleDateString('es-MX')+' → '+new Date(r.period_end).toLocaleDateString('es-MX'))+'</td><td>'+fmt(r.amount_cents)+'</td><td>'+fmt(r.paid_cents)+'</td><td>'+fmt(r.due_cents)+'</td></tr>').join('')}</tbody></table></div>
 ${data.balance_cents?'<label class="field">Importe a abonar (MXN)</label><input id="pensionPayAmount" value="'+(data.balance_cents/100).toFixed(2)+'" inputmode="decimal"><label class="field">Moneda</label><select id="pensionPayMethod" onchange="pensionMethodChange()"><option value="efectivo">Pesos MXN</option><option value="usd">Dólares USD</option></select><label class="field">Recibido</label><input id="pensionPayReceived" inputmode="decimal" placeholder="Dinero entregado por el cliente"><p class="muted">El abono se aplica primero a los cargos más antiguos (cuotas y adeudos manuales). La deuda disminuye al confirmar el pago.</p><button class="btn primary full" onclick="payPensionDebt()">Confirmar abono</button>':'<p style="color:#76d8aa">Pensión al corriente. No hay adeudos.</p>'}`);
 const shift=(await api('/api/shift')).shift;pensionPaymentRate=shift?.usd_rate||null;
}catch(e){modalError(e)}}
function pensionMethodChange(){if($('pensionPayMethod')?.value==='usd'&&!pensionPaymentRate)modalError(Error('Configura primero el tipo de cambio desde Caja'));}
async function payPensionDebt(){try{
 const amount=moneyInput('pensionPayAmount'),received=moneyInput('pensionPayReceived'),method=$('pensionPayMethod').value;
 if(amount<1||amount>pensionPaymentDue)throw Error('El importe debe ser positivo y no exceder la deuda');
 if(!confirm('¿Registrar el pago de '+fmt(amount)+' en la pensión?'))return;
 const body={amount_cents:amount,method,expected_usd_rate:pensionPaymentRate,...(method==='usd'?{received_usd_cents:received}:{received_cents:received})};
 const r=await api('/api/clients/'+pensionPaymentClient+'/pension-pay',{method:'POST',body:JSON.stringify(body)});
 hideModal();msg('Abono registrado: '+fmt(r.charged_cents)+' · Saldo restante: '+fmt(r.remaining_cents)+' · Cambio en pesos: '+fmt(r.change_cents));await loadClients();await loadShift();await refresh();
}catch(e){modalError(e)}}
// Renovación manual de clientes anteriores sin plan recurrente.
async function renewClient(id){try{const c=clientRows.find(c=>c.id===id),s=(await api('/api/shift')).shift;if(!s)throw Error('Abre caja antes de cobrar la pensión');activeUsdRate=s.usd_rate;currentClientId=id;modal('Renovación manual · '+c.name,`<p class="muted">Esta pensión utiliza el método antiguo de fechas manuales. Para que la deuda se acumule automáticamente, edita el cliente y configura su plan semanal o mensual.</p><label class="field">Vigencia desde</label><input id="renewFrom" type="datetime-local" value="${localInput(c.valid_from)}"><label class="field">Nueva vigencia hasta</label><input id="renewTo" type="datetime-local" value="${localInput(new Date(Date.parse(c.valid_to)+30*86400000).toISOString())}"><label class="field">Costo MXN</label><input id="renewAmount" inputmode="decimal"><label class="field">Forma de pago</label><select id="renewMethod"><option value="efectivo">Efectivo MXN</option><option value="usd">Dólares USD</option></select><label class="field">Recibido en moneda elegida</label><input id="renewReceived" inputmode="decimal"><button class="btn primary full" onclick="saveRenewal()">Confirmar cobro</button>`);}catch(e){msg(e.message)}}
async function saveRenewal(){try{const method=$('renewMethod').value,received=moneyInput('renewReceived'),body={valid_from:new Date($('renewFrom').value).toISOString(),valid_to:new Date($('renewTo').value).toISOString(),amount_cents:moneyInput('renewAmount'),method,expected_usd_rate:activeUsdRate,...(method==='usd'?{received_usd_cents:received}:{received_cents:received})};const r=await api('/api/clients/'+currentClientId+'/renew',{method:'POST',body:JSON.stringify(body)});hideModal();msg('Pensión cobrada: '+fmt(r.charged_cents)+'. Cambio a entregar en MXN: '+fmt(r.change_cents));loadClients();loadShift();refresh();}catch(e){modalError(e)}}
async function loadAdministration(){
 $('adminTools').style.display=user?.role==='admin'?'block':'none';if(user?.role!=='admin')return;
 try{const [users,backups]=await Promise.all([api('/api/users'),api('/api/backups')]);$('userList').innerHTML='<table class="table"><thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>'+users.map(u=>'<tr><td>'+esc(u.username)+'</td><td>'+esc(u.role)+'</td><td>'+(u.active?'Activo':'Inactivo')+'</td><td><button class="btn" onclick="editUser('+u.id+',\''+u.role+'\','+u.active+')">Editar / contraseña</button></td></tr>').join('')+'</tbody></table>';$('backupStatus').textContent=backups.lastBackupError?'Error de respaldo: '+backups.lastBackupError:'Respaldo automático cada hora; se conservan los 48 automáticos más recientes. Los manuales y de seguridad se conservan.';}catch(e){msg(e.message)}}
function newUser(){modal('Crear usuario','<label class="field">Usuario</label><input id="newUsername" autocomplete="off"><label class="field">PIN o contraseña (mínimo 4 caracteres)</label><input id="newPassword" type="password" autocomplete="new-password"><label class="field">Permiso</label><select id="newRole"><option value="cashier">Cajero</option><option value="supervisor">Supervisor</option><option value="admin">Administrador</option></select><button class="btn primary full" onclick="saveUser()">Crear usuario</button>');}
async function saveUser(){try{await api('/api/users',{method:'POST',body:JSON.stringify({username:$('newUsername').value,password:$('newPassword').value,role:$('newRole').value})});hideModal();loadAdministration();}catch(e){modalError(e)}}
function editUser(id,role,active){modal('Modificar usuario',`<label class="field">Permiso</label><select id="editRole">${['cashier','supervisor','admin'].map(k=>'<option '+(k===role?'selected':'')+'>'+k+'</option>').join('')}</select><label class="field">Nuevo PIN o contraseña (mínimo 4; vacío: conservar)</label><input id="editPassword" type="password" autocomplete="new-password"><label class="field"><input id="editActive" type="checkbox" style="width:auto" ${active?'checked':''}> Activo</label><button class="btn primary full" onclick="updateUser(${id})">Guardar</button>`);}
async function updateUser(id){try{await api('/api/users/'+id,{method:'PUT',body:JSON.stringify({role:$('editRole').value,active:$('editActive').checked,password:$('editPassword').value})});hideModal();loadAdministration();}catch(e){modalError(e)}}
function changePassword(){modal('Cambiar mi contraseña','<label class="field">Contraseña actual</label><input id="oldPassword" type="password" autocomplete="current-password"><label class="field">Nuevo PIN o contraseña (mínimo 4)</label><input id="ownPassword" type="password" autocomplete="new-password"><button class="btn primary full" onclick="saveOwnPassword()">Guardar y volver a iniciar sesión</button>');}
async function saveOwnPassword(){try{await api('/api/auth/password',{method:'POST',body:JSON.stringify({current_password:$('oldPassword').value,password:$('ownPassword').value})});hideModal();user=null;showLogin(false);}catch(e){modalError(e)}}
async function backupNow(){try{const r=await api('/api/backup',{method:'POST'});msg('Respaldo creado: '+r.name);loadAdministration();}catch(e){msg(e.message)}}
function resetParkingFromZero(){
 const confirmed=window.confirm('¿Borrar absolutamente todos los registros de Parking POS?\n\nSe eliminarán vehículos activos, tickets, pagos, cortes, clientes, usuarios, tarifas y respaldos internos. No se puede deshacer.');
 if(!confirmed)return;
 api('/api/factory-reset',{method:'POST',body:JSON.stringify({confirm:true})})
  .then(r=>{
   sessionStorage.clear();
   if(r.backupCleanupError)alert('Se vació la base, pero hubo problemas al borrar respaldos: '+r.backupCleanupError);
   else alert('Parking POS se reinició desde cero. Ya no hay vehículos ni movimientos registrados.');
   window.location.reload();
  }).catch(e=>msg('No se pudo reiniciar: '+e.message));
}
async function showAudit(){try{const rows=await api('/api/audit');$('auditList').innerHTML='<table class="table"><thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+new Date(r.at).toLocaleString('es-MX')+'</td><td>'+esc(r.username||'Anterior')+'</td><td>'+esc(r.action)+'</td><td style="overflow-wrap:anywhere">'+esc(r.detail)+'</td></tr>').join('')+'</tbody></table>';}catch(e){msg(e.message)}}
function mountProfessional(){
 $('rates').append($('professionalExtras'));
 const clients=document.createElement('div');clients.id='clients';clients.className='page';clients.innerHTML='<div class="card"><div class="sectionhead"><h2>Clientes, pensiones y convenios</h2><button class="btn primary" onclick="editClient()">Nuevo cliente</button></div><p class="muted">Pensiones individuales de cuota semanal personalizada, sin cobro por hora y con adeudos acumulables. Separadas del tabulador general y sin placa obligatoria.</p><div id="clientList"></div></div>';document.querySelector('main').append(clients);
 const admin=document.createElement('div');admin.id='administration';admin.className='page';admin.innerHTML='<div class="card"><h2>Administración</h2><button class="btn" onclick="changePassword()">Cambiar mi contraseña</button><div id="adminTools"><h3>Usuarios y permisos</h3><p class="muted">Cajero: entradas, cobros, salidas y cortes. Supervisor: además tarifas, clientes, movimientos y autorizaciones. Administrador: además usuarios y restauración.</p><button class="btn primary" onclick="newUser()">Crear usuario</button><div id="userList"></div><h3>Respaldo de datos</h3><p id="backupStatus" class="muted"></p><button class="btn" onclick="backupNow()">Crear respaldo</button><h3>Empezar desde cero</h3><p class="muted">Elimina todos los vehículos, tickets, cobros, cortes, usuarios y configuraciones del estacionamiento. No pide contraseña adicional ni palabra de seguridad: solo una confirmación.</p><button class="btn danger full" onclick="resetParkingFromZero()">Reiniciar Parking POS desde cero</button></div><h3>Bitácora</h3><button class="btn" onclick="showAudit()">Consultar bitácora</button><div id="auditList"></div></div>';document.querySelector('main').append(admin);
 const login=document.createElement('div');login.id='loginOverlay';login.className='opening-overlay';login.style.zIndex='11000';login.innerHTML='<form id="loginForm" class="opening-dialog" onsubmit="login(event)"><div class="eyebrow">PARKING POS</div><h2 id="loginHeading"></h2><p id="loginHelp" class="muted"></p><label class="field">Usuario</label><input id="loginUsername" autocomplete="username" required maxlength="40"><label class="field">PIN o contraseña</label><input id="loginPassword" type="password" autocomplete="current-password" required maxlength="128"><button id="loginSubmit" class="btn primary full" type="submit">Continuar</button><p id="loginError" class="muted"></p></form>';document.body.append(login);
 const action=document.createElement('div');action.id='actionModal';action.className='opening-overlay';action.style.zIndex='12000';document.body.append(action);
}
mountProfessional();
(async()=>{try{const status=await api('/api/auth/status');if(status.setupRequired)return showLogin(true);const r=await api('/api/auth/me');user=r.user;await startSessionUI();}catch(e){showLogin(false);if(!/Inicia sesión/.test(e.message))$('loginError').textContent=e.message;}})();
setInterval(()=>{if(user)refresh()},30000);

async function loadEntryClients(){try{const clients=await api('/api/clients');const sel=$('entryClient');if(!sel)return;const old=sel.value;sel.innerHTML='<option value="">Cliente normal · tarifa general</option>'+clients.filter(c=>c.active&&Date.parse(c.valid_from)<=Date.now()&&Date.parse(c.valid_to)>Date.now()&&(user?.role!=='cashier'||c.kind!=='exempt')).map(c=>'<option value="'+c.id+'">'+esc(c.name)+' · '+esc(clientKind(c.kind))+'</option>').join('');sel.value=old;}catch(e){msg(e.message)}}

// Arqueo opcional por denominaciones: los dos métodos (captura manual y conteo)
// permanecen disponibles, sin interferir con los cortes X existentes.
const showCloseOriginal=showClose;
showClose=function(){
 denominationDraft=null;showCloseOriginal();
 const panel=$('declaredUsdKeys');if(!panel)return;
 const details=document.createElement('details');details.style.margin='18px 0';details.innerHTML='<summary style="cursor:pointer;font-weight:750">Contar billetes y monedas (arqueo opcional)</summary><p class="muted">Ingresa la cantidad de cada denominación. Se completarán automáticamente los importes de MXN y USD para el corte del turno.</p><div id="denominationsArea"></div><button class="btn" type="button" onclick="applyDenominations()">Utilizar montos contados</button>';
 panel.after(details);
 const sections=[['MXN',[100000,50000,20000,10000,5000,2000,1000,500,200,100,50]],['USD',[10000,5000,2000,1000,500,200,100,25,10,5,1]]];
 $('denominationsArea').innerHTML=sections.map(([currency,denoms])=>'<h3>'+currency+'</h3><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(125px,1fr));gap:9px">'+denoms.map(value=>'<label style="display:flex;flex-direction:column;gap:4px;font-size:12px">'+(value/100).toFixed(2)+' '+currency+'<input type="number" min="0" max="100000" step="1" inputmode="numeric" value="0" data-currency="'+currency+'" data-cents="'+value+'" oninput="recalculateDenominations()"></label>').join('')+'</div>').join('')+'<p id="countPreview" class="muted">Contado por denominaciones: $0.00 MXN · US$0.00</p>';
};
let denominationDraft=null;
function recalculateDenominations(){const detail={MXN:[],USD:[]};for(const node of document.querySelectorAll('#denominationsArea input')){const count=Number(node.value),value_cents=Number(node.dataset.cents);if(!Number.isSafeInteger(count)||count<0||count>100000){$('countPreview').textContent='Revisa las cantidades; utiliza números enteros no negativos.';denominationDraft=null;return;};detail[node.dataset.currency].push({value_cents,count});}
 denominationDraft=detail;const total=key=>detail[key].reduce((v,x)=>v+x.count*x.value_cents,0);$('countPreview').textContent='Contado: '+fmt(total('MXN'))+' MXN · US$'+(total('USD')/100).toFixed(2);}
function applyDenominations(){recalculateDenominations();if(!denominationDraft)return;$('declared').value=(denominationDraft.MXN.reduce((n,x)=>n+x.value_cents*x.count,0)/100).toFixed(2);$('declaredUsd').value=(denominationDraft.USD.reduce((n,x)=>n+x.value_cents*x.count,0)/100).toFixed(2);msg('Arqueo aplicado. Confirma las cantidades antes de cerrar turno.');}
const apiBeforeZ=api;
api=async function(url,opt={}){
 if(url==='/api/shift/close'&&opt.method==='POST'&&denominationDraft){
  const body=JSON.parse(opt.body||'{}');
  // No se manda el detalle si el cajero modificó manualmente los importes.
  const total=k=>denominationDraft[k].reduce((n,x)=>n+x.count*x.value_cents,0);
  if(total('MXN')===body.declared_cents&&total('USD')===body.declared_usd_cents){body.denomination_detail=denominationDraft;opt={...opt,body:JSON.stringify(body)}}
 }
 const r=await apiBeforeZ(url,opt);
 if(url==='/api/shift/close')denominationDraft=null;
 return r;
};
