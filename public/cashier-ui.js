'use strict';
/*
 * Desktop cash counter layout. Keeps the existing /api/shift and payment logic.
 * No database changes; the screen is intentionally shorter and tabbed.
 */
const CURRENCY_USD = cents => 'US$' + (Number(cents || 0) / 100).toFixed(2);
let cashierSection = 'overview';
let cashierBusy = false;

function cashierTab(section) {
  if (!['overview','movements','reports','history'].includes(section)) return;
  cashierSection = section;
  document.querySelectorAll('.cashier-section').forEach(panel => panel.classList.toggle('active', panel.id === 'cashier-' + section));
  document.querySelectorAll('[data-cashier-tab]').forEach(btn => {
    const active = btn.dataset.cashierTab === section;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  if (section === 'reports' && user?.role === 'cashier') {
    cashierTab('overview'); msg('Los reportes por periodo requieren supervisor.'); return;
  }
  if (section === 'history') loadShifts();
  if (section === 'movements') loadMovements();
}
function toggleCashierKeyboard(hostId, inputId) {
  const host = $(hostId);
  if (!host) return;
  if ($(inputId)?.disabled) return;
  const opening = host.hidden;
  host.hidden = !opening;
  if (opening) {
    mountKeys(hostId, inputId);
    $(inputId)?.focus();
    keyTarget = inputId;
  }
}
function cashierSummaryCard(label, value) {
  return `<div><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`;
}
// Override only the visual renderer. Source-of-truth stays on the server.
loadShift = async function loadShiftCompact() {
  try {
    const {shift: s} = await api('/api/shift');
    activeUsdRate = s?.usd_rate || null;
    currentShiftId = s?.id || null;
    const pill = $('cashierShiftPill');
    if (pill) pill.textContent = s ? 'Turno ' + (s.shift_type==='DAY'?'DÍA':s.shift_type==='NIGHT'?'NOCHE':'ANTERIOR') + ' #' + s.id + ' · Abierto' : 'Sin turno abierto';
    if (!s) {
      $('shiftPanel').innerHTML = '<div class="card compact-card"><h2>La caja está cerrada</h2><p class="muted">Abre un turno para registrar entradas y cobros.</p><button class="btn primary" onclick="showOpening()">Abrir caja</button></div>';
      return;
    }
    $('shiftPanel').innerHTML = `
      <div class="cashier-summary">
        ${cashierSummaryCard('Ventas del turno', fmt(s.sales_cents))}
        ${cashierSummaryCard('Efectivo esperado MXN', fmt(s.expected_cents))}
        ${cashierSummaryCard('Dólares en caja', CURRENCY_USD(s.expected_usd_cents))}
        ${cashierSummaryCard('Operaciones', String(s.count ?? 0))}
      </div><p class="cashier-subtext">Las ventas son los cobros del turno. El efectivo esperado también incluye el fondo inicial y los movimientos, menos el cambio y los retiros. Cuenta pesos y dólares por separado.</p>
      <div class="cashier-operation">
       <div class="card compact-card">
        <h2>Tipo de cambio del dólar</h2>
        <div class="cashier-rate-row">
          <input id="newUsdRate" type="text" inputmode="decimal" placeholder="Ej. 16.50" value="${s.usd_rate ?? ''}" aria-label="Tipo de cambio MXN por USD">
          <button class="btn" type="button" onclick="saveUsdRate()" ${user?.role==='cashier'?'disabled title="Requiere supervisor"':''}>Guardar</button>
          <button class="btn" type="button" onclick="toggleCashierKeyboard('usdRateKeys','newUsdRate')" ${user?.role==='cashier'?'disabled':''} aria-label="Teclado del tipo de cambio">⌨</button>
        </div>
        <div id="usdRateKeys" class="cashier-keyboard" hidden></div>
        <p class="cashier-subtext">1 USD = ${s.usd_rate ? '$'+Number(s.usd_rate).toFixed(4)+' MXN':'sin configurar'}. Los cobros anteriores no cambian.</p>
       </div>
       ${s.shift_type==='DAY'?`<div class="card compact-card"><h2>Vehículos que pasarán al turno Noche</h2><div class="cashier-summary">${cashierSummaryCard('Pendientes del turno Día',String(s.ownership?.open_vehicles||0))}</div><p class="cashier-subtext">Conservan folio y hora de entrada. Si se cobran de noche, figurarán como atribuidos al Día.</p></div>`:''}
       ${s.shift_type==='NIGHT'?`<div class="card compact-card"><h2>Dinero cobrado por Noche que corresponde a Día</h2>${(s.night_dues||[]).length?(s.night_dues||[]).map(d=>`<div class="cashier-transfer"><b>Turno Día #${d.origin_shift_id} · ${d.vehicles} vehículo(s)</b><div class="line"><span>Venta atribuida al Día</span><b>${fmt(d.collected_cents)}</b></div><div class="line"><span>Pendiente de entregar (MXN)</span><b>${fmt(d.owed_mxn_cents)}</b></div><div class="line"><span>Dólares recibidos (informativo)</span><b>${CURRENCY_USD(d.cash_usd_cents)}</b></div><div class="actions-row">${d.owed_mxn_cents>0?`<button class="btn" onclick="settleDay(${d.origin_shift_id},'MXN',${d.owed_mxn_cents})" ${user?.role==='cashier'?'disabled title="Requiere supervisor"':''}>Entregar pesos al Día</button>`:''}</div></div>`).join(''):'<p class="cashier-subtext">Todavía no se cobraron vehículos heredados del Día.</p>'}<p class="cashier-subtext">La conciliación es informativa y no impide cerrar este turno. Registra una entrega solo cuando retires físicamente pesos para el Día; si cambias USD por MXN, registra ambos movimientos de efectivo. No se duplican ventas ni se obliga a convertir dólares.</p></div>`:''}
       <div class="card compact-card" id="liveHandoverSection"><h2>Folios heredados</h2><p class="cashier-subtext">Consultando los vehículos que entregó el último turno de Día…</p></div>
       <div class="card compact-card">
        <h2>Corte de ${s.shift_type==='DAY'?'Día':s.shift_type==='NIGHT'?'Noche':'turno anterior'}</h2>
        <div class="cashier-actions"><button class="btn" type="button" onclick="showX()">Ver resumen</button><button class="btn primary" type="button" onclick="showClose()">Cerrar corte</button></div>
        <p class="cashier-subtext">El turno termina únicamente al pulsar Cerrar corte, nunca por la hora. Los vehículos pendientes continúan al siguiente turno.</p>
       </div>
      </div>`;
    loadLatestDayHandover(s.id, s.shift_type);
    const moveButton=document.querySelector('#cashier-movements button[onclick="registerMovement()"]');
    if(moveButton){moveButton.disabled=user?.role==='cashier';moveButton.title=user?.role==='cashier'?'Requiere supervisor':'';}
    for (const id of ['movementKind','movementAmount','movementReason','movementCurrency']) {
      if ($(id)) $(id).disabled = user?.role === 'cashier';
    }
  } catch (err) {
    $('shiftPanel').textContent = 'No se pudo consultar el turno: ' + err.message;
    msg(err.message);
  }
};

function renderShiftFigures(s) {
  return `
    <div class="cashier-summary">
       ${cashierSummaryCard('Cobros', String(s.count ?? 0))}
       ${cashierSummaryCard('Ventas MXN', fmt(s.sales_cents))}
       ${cashierSummaryCard('Efectivo esperado', fmt(s.expected_cents))}
       ${cashierSummaryCard('USD esperados', CURRENCY_USD(s.expected_usd_cents))}
    </div>
    <details class="compact-detail"><summary>Ver desglose del corte</summary>
      <div class="line"><span>Fondo inicial MXN</span><b>${fmt(s.opening_cents)}</b></div>
      <div class="line"><span>Pesos recibidos</span><b>${fmt(s.received_mxn_cents || 0)}</b></div>
      <div class="line"><span>Cambio y devoluciones MXN</span><b>${fmt(s.change_cents || 0)}</b></div>
      <div class="line"><span>Entradas extra MXN</span><b>${fmt(s.deposits_cents || 0)}</b></div>
      <div class="line"><span>Retiros MXN</span><b>${fmt(s.withdrawals_cents || 0)}</b></div>
      <div class="line"><span>Fondo inicial USD</span><b>${CURRENCY_USD(s.opening_usd_cents)}</b></div>
      <div class="line"><span>USD recibidos</span><b>${CURRENCY_USD(s.received_usd_cents)}</b></div>
      <div class="line"><span>Entradas extra USD</span><b>${CURRENCY_USD(s.deposits_usd_cents)}</b></div>
      <div class="line"><span>Retiros USD</span><b>${CURRENCY_USD(s.withdrawals_usd_cents)}</b></div>
      <div class="line"><span>Ventas pagadas en USD (equiv. MXN)</span><b>${fmt(s.usd_sales_mxn_cents)}</b></div>
    </details>`;
}
showX = async function showCompactX() {
  try {
    cashierTab('overview');
    const {shift:s} = await api('/api/shift/x');
    $('shiftResult').innerHTML = `<div class="card compact-card" style="margin-top:12px"><div class="sectionhead"><h2>Resumen del turno ${s.shift_type==='DAY'?'Día':'Noche'} #${s.id}</h2><span class="pill">Solo consulta · Caja abierta</span></div>${renderShiftFigures(s)}<div class="actions-row"><button class="btn" type="button" onclick="printShift(${s.id})">Imprimir resumen</button><button class="btn" type="button" onclick="cancelClose()">Cerrar resumen</button></div></div>`;
  } catch (err) { msg(err.message); }
};

function closeDenominationHTML() {
  const sections = [
    ['MXN', [100000,50000,20000,10000,5000,2000,1000,500,200,100,50]],
    ['USD', [10000,5000,2000,1000,500,200,100,25,10,5,1]]
  ];
  return sections.map(([currency,denoms]) =>
    `<h3>${currency}</h3><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:7px">` +
    denoms.map(value => `<label style="display:flex;flex-direction:column;gap:4px;font-size:12px">${(value/100).toFixed(2)} ${currency}<input type="number" min="0" max="100000" step="1" value="0" data-currency="${currency}" data-cents="${value}" oninput="recalculateDenominations()"></label>`).join('') + '</div>'
  ).join('');
}
// Una sola ventana de cierre de turno: el cajero ve primero lo que debe contar.
let shiftZExpected = null;
function closeZLiveBalance() {
 const host=$('zLiveDifference');if(!host||!shiftZExpected)return;
 let pesos=null,dolares=null;
 try { pesos=moneyInput('declared');dolares=moneyInput('declaredUsd'); } catch(_){/* Todavía se está escribiendo. */}
 if(pesos===null||dolares===null){host.textContent='Introduce el efectivo contado para conocer la diferencia.';return;}
 const mxnDiff=pesos-shiftZExpected.expected_cents;
 const usdDiff=dolares-shiftZExpected.expected_usd_cents;
 host.textContent='Diferencia: '+fmt(mxnDiff)+' MXN · '+CURRENCY_USD(usdDiff);
 host.classList.toggle('cashier-unbalanced',mxnDiff!==0||usdDiff!==0);
}
showClose = async function showEasyZ() {
 if(!currentShiftId||cashierBusy){msg('Abre primero un turno.');return;}
 try {
  const data=await api('/api/shift/x');
  const s=data.shift;
  if(s.id!==currentShiftId)throw Error('El turno cambió. Vuelve a entrar a Cortes.');
  shiftZExpected=s;denominationDraft=null;
  const expectedUsd=(s.expected_usd_cents||0)>0;
  const html=`
   <div class="cashier-modal-content simple-z">
    <p class="muted">Cuenta el dinero de la caja. Solo captura lo que realmente tienes.</p>
    <div class="z-expected">
      <div><small>Pesos esperados</small><strong>${fmt(s.expected_cents)}</strong></div>
      <div><small>Dólares esperados</small><strong>${CURRENCY_USD(s.expected_usd_cents)}</strong></div>
    </div>
    <label class="field" for="declared">¿Cuántos pesos hay en caja?</label>
    <input id="declared" class="z-amount" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00" onfocus="keyTarget='declared'" oninput="closeZLiveBalance()"/>
    <label class="field" for="declaredUsd">¿Cuántos dólares hay en caja?</label><input id="declaredUsd" class="z-amount" type="text" inputmode="decimal" value="${expectedUsd?'':'0.00'}" placeholder="0.00" onfocus="keyTarget='declaredUsd'" oninput="closeZLiveBalance()"/><p class="cashier-subtext">Cuenta MXN y USD por separado; no conviertas los dólares a pesos. Si no tienes dólares, captura 0.00. Una diferencia se registra y no impide cerrar.</p>
    <div id="zLiveDifference" class="z-difference" aria-live="polite">Introduce el efectivo contado para conocer la diferencia.</div>
    <details class="compact-detail"><summary>Teclado táctil (opcional)</summary>
     <div class="actions-row"><button type="button" class="btn" onclick="keyTarget='declared';$('declared').focus()">Escribir pesos</button><button type="button" class="btn" onclick="keyTarget='declaredUsd';$('declaredUsd').focus()">Escribir dólares</button></div><div id="declaredKeys"></div>
    </details>
    <details class="compact-detail"><summary>Contar por billetes y monedas (opcional)</summary><div id="denominationsArea">${closeDenominationHTML()}</div><p id="countPreview" class="muted">Suma: $0.00 MXN · US$0.00</p><button type="button" class="btn" onclick="applyDenominations();closeZLiveBalance()">Utilizar suma</button></details>
    ${s.pending_day_settlement_cents>0?`<p class="muted">Hay ${fmt(s.pending_day_settlement_cents)} de conciliación con Día pendientes de entregar. Puedes cerrar; el pendiente queda registrado.</p>`:''}<p class="muted">Cuenta el efectivo antes de retirarlo. Al cerrar se guardan los importes, movimientos y diferencias; luego se intenta imprimir el corte.</p>
    <div id="closeZError" role="alert" class="error-text"></div>
    <div class="cashier-z-actions"><button class="btn" type="button" onclick="hideModal()">Volver</button><button class="btn primary" id="confirmCloseZ" type="button" onclick="closeShift()">CERRAR CORTE DE ${s.shift_type==='DAY'?'DÍA':'NOCHE'}</button></div>
   </div>`;
  modal('Cerrar corte de '+(s.shift_type==='DAY'?'Día':'Noche')+' · Turno #'+s.id, html);
  const frame=$('actionModal').querySelector('.opening-dialog');
  frame.style.width='min(570px, 100%)';
  // El modal genérico agrega otro botón Cerrar; aquí sobraría.
  const redundant=frame.querySelector(':scope > button.btn.full');if(redundant)redundant.remove();
  keyTarget='declared';mountKeys('declaredKeys','declared');$('declared').focus();
 }catch(e){msg(e.message);}
};
closeShift = async function closeEasyShift() {
 if(cashierBusy)return;
 try {
  if(!currentShiftId||!shiftZExpected||shiftZExpected.id!==currentShiftId)throw Error('La caja cambió. Consulta el turno de nuevo.');
  const declared=moneyInput('declared');const declaredUsd=moneyInput('declaredUsd');
  const diff=declared-shiftZExpected.expected_cents,usdDiff=declaredUsd-shiftZExpected.expected_usd_cents;
  if((diff!==0||usdDiff!==0)&&!confirm('Hay diferencia de efectivo: '+fmt(diff)+' y '+CURRENCY_USD(usdDiff)+'. ¿Registrar el corte con esta diferencia?'))return;
  cashierBusy=true;
  const btn=$('confirmCloseZ');if(btn)btn.disabled=true;
  const s=await api('/api/shift/close',{method:'POST',body:JSON.stringify({shift_id:currentShiftId,declared_cents:declared,declared_usd_cents:declaredUsd})});
  hideModal();shiftZExpected=null;denominationDraft=null;
  await loadShift();await refresh();cashierTab('overview');
  $('shiftResult').innerHTML=`<div class="card compact-card"><h2>Corte de ${s.shift_type==='DAY'?'Día':'Noche'} #${s.id} cerrado</h2><div class="cashier-summary">${cashierSummaryCard('Ventas',fmt(s.sales_cents))}${cashierSummaryCard('Contado en pesos',fmt(s.declared_cents))}${cashierSummaryCard('Diferencia MXN',fmt(s.difference_cents))}${cashierSummaryCard('Diferencia USD',CURRENCY_USD(s.difference_usd_cents))}</div>${s.pending_day_settlement_cents>0?`<p class="muted">Entrega al Día pendiente (informativa): ${fmt(s.pending_day_settlement_cents)}. No genera una venta adicional.</p>`:''}<div class="actions-row"><button class="btn primary" onclick="printShift(${s.id})">Imprimir corte</button><button class="btn" onclick="showOpening()">Abrir nuevo turno</button></div></div>`;
  showHandoverForShift(s.id,'shiftResult',false).catch(e=>msg(e.message));
  msg('Corte cerrado. Los vehículos pendientes siguen dentro para el turno siguiente.');
  printShift(s.id).catch?.(()=>{});
 }catch(e){const host=$('closeZError');if(host)host.textContent=e.message;else msg(e.message);}
 finally{cashierBusy=false;const btn=$('confirmCloseZ');if(btn)btn.disabled=false;}
};

// Closing a login session must never silently close a monetary shift.
const originalShowLoginCompact=showLogin;
showLogin = function(setup) {
  document.body.classList.add('session-locked');
  originalShowLoginCompact(setup);
};
const originalStartSessionCompact=startSessionUI;
startSessionUI = async function() {
  await originalStartSessionCompact();
  document.body.classList.remove('session-locked');
  const reportsTab=document.querySelector('[data-cashier-tab="reports"]');
  if(reportsTab)reportsTab.hidden=user?.role==='cashier';
  const backupButton=document.querySelector('#professionalExtras button[onclick="makeBackup()"]');
  if(backupButton) backupButton.hidden=user?.role!=='admin';
  const auditButton=document.querySelector('#administration button[onclick="showAudit()"]');
  if(auditButton) auditButton.hidden=user?.role==='cashier';
  const accountName=$('adminNav')?.querySelector('span');
  if(accountName)accountName.textContent=user?.role==='admin'?' Administración':' Mi cuenta';
  cashierTab('overview');
};
async function finishLogout() {
  try {
    await api('/api/auth/logout',{method:'POST',body:'{}'});
    user=null;current=null;currentShiftId=null;activeUsdRate=null;
    $('shiftPanel').replaceChildren();$('shiftResult').replaceChildren();
    $('charge').replaceChildren();$('historyList').replaceChildren();$('activeList').replaceChildren();
    $('signedUser').textContent='Sesión cerrada';
    try {sessionStorage.clear();}catch(_){}
    hideModal();showLogin(false);
  }catch(err){modalError(err)}
}
logout = async function logoutWithChoice() {
  try {
    const data = await api('/api/shift');
    const open = data.shift;
    modal('Cambiar usuario', `<p class="muted">${open
      ? `El turno #${open.id} continúa <strong>ABIERTO</strong>. Salir del usuario no hace un corte ni cierra la caja.`
      : 'No hay un turno de caja abierto.'}</p>
      <div class="logout-options">
       ${open?'<button class="btn primary" onclick="hideModal();page(\'cashier\',document.querySelectorAll(\'aside nav button\')[3]);cashierTab(\'overview\')">Ir al corte antes de salir</button>':''}
       <button class="btn" onclick="finishLogout()">${open?'Cambiar usuario y dejar turno abierto':'Cerrar sesión'}</button>
      </div>`);
  } catch(err) { msg('No se pudo comprobar el turno: '+err.message); }
};

// Make the initial state and focus obvious at the next login.
document.addEventListener('DOMContentLoaded',()=>cashierTab('overview'));

// Apertura simple Día/Noche: solo efectivo inicial. Los vehículos quedan en la base.
showOpening=async function openingDayNight(){
 $('openingOverlay').style.display='flex';$('openError').textContent='';$('openingStart').value='0.00';$('openingUsdStart').value='0.00';
 try{const data=await api('/api/shift/next');$('openingShiftType').value=data.recommended||'DAY';$('usdStart').value=data.previous_usd_rate==null?'':String(data.previous_usd_rate);$('inheritedOpening').textContent=(data.pending_vehicles||0)+' vehículo(s) continúan dentro. Se conservan folio, hora de entrada y tarifa.';}
 catch(e){$('inheritedOpening').textContent='Selecciona Día o Noche antes de abrir.';}
 keyTarget='openingStart';mountKeys('openingKeys','openingStart');$('openingStart').focus();
};
openShiftFromStart=async function openDayNightShift(){
 const btn=$('openShiftStartBtn');if(btn.disabled)return;btn.disabled=true;
 try{const opening=moneyInput('openingStart'),openingUsd=moneyInput('openingUsdStart'),type=$('openingShiftType').value;
  const rateText=$('usdStart').value.trim(),usdRate=rateText?rateUnitsUI(rateText)/10000:null;
  if(!['DAY','NIGHT'].includes(type))throw Error('Selecciona Día o Noche');
  await api('/api/shift/open',{method:'POST',body:JSON.stringify({opening_cents:opening,opening_usd_cents:openingUsd,usd_rate:usdRate,shift_type:type})});
  $('openingOverlay').style.display='none';await loadShift();await refresh();
  msg('Turno '+(type==='DAY'?'Día':'Noche')+' abierto. Los vehículos anteriores siguen dentro.');
 }catch(e){$('openError').textContent=e.message}finally{btn.disabled=false}
};
async function settleDay(origin,currency,max){
 if(!Number.isSafeInteger(max)||max<1)return msg('No hay importe pendiente');
 if(!confirm('¿Confirmas que estás ENTREGANDO FÍSICAMENTE '+(currency==='MXN'?fmt(max):CURRENCY_USD(max))+' al turno Día #'+origin+'? Se registrará como retiro de efectivo de Noche.'))return;
 try{await api('/api/shift/day-settlement',{method:'POST',body:JSON.stringify({origin_shift_id:origin,currency,amount_cents:max})});await loadShift();msg('Entrega en '+currency+' registrada correctamente.');}
 catch(e){msg(e.message)}
}

// Relevo de turnos: lista inmóvil de folios, con estados y pagos actualizados.
function handoverDetailHTML(h, title) {
 if(!h) return '<p class="cashier-subtext">Todavía no hay un corte de Día registrado con la nueva versión.</p>';
 const a=h.summary||{};
 const list=h.tickets||[];
 const sourceLabel=h.shift.shift_type==='NIGHT'?'Noche':h.shift.shift_type==='DAY'?'Día':'turno anterior';
 const statusName={SIGUE_DENTRO:'Sigue dentro',PAGADO_NOCHE:'Pagado en Noche',PAGADO_OTRO_TURNO:'Pagado en otro turno',CANCELADO:'Cancelado'};
 return `<h2>${esc(title||'Folios heredados')} · ${sourceLabel} #${h.shift.id}</h2>
 <div class="handover-counters">
  ${cashierSummaryCard('Entregados',String(a.handed_over||0))}
  ${cashierSummaryCard('Pagados en Noche',String(a.paid_night||0))}
  ${cashierSummaryCard('Siguen dentro',String(a.inside||0))}
  ${cashierSummaryCard('Cobrado en Noche',fmt(a.night_sales_cents||0))}
 </div>
 ${list.length?`<details class="handover-details" open><summary>Ver los ${list.length} folios y su estado</summary>
  <div class="handover-table-scroll"><table class="table handover-table"><thead><tr><th>Folio</th><th>Entrada</th><th>Estado</th><th>Cobrado en Noche</th></tr></thead><tbody>
  ${list.map(x=>`<tr><td><strong>${esc(x.code)}</strong></td><td>${new Date(x.entry_at).toLocaleString('es-MX',{dateStyle:'short',timeStyle:'short'})}</td><td><span class="handover-state ${esc(x.status)}">${esc(statusName[x.status]||x.status)}</span></td><td>${x.night_paid_cents?fmt(x.night_paid_cents):'—'}</td></tr>`).join('')}
  </tbody></table></div></details>`:'<p class="cashier-subtext">Ese turno no dejó vehículos pendientes.</p>'}
 <p class="cashier-subtext">Los folios entregados quedan guardados. Los estados se actualizan conforme se cobran los vehículos.</p>
 <button class="btn" type="button" onclick="printShift(${h.shift.id})">Imprimir corte de ${sourceLabel} #${h.shift.id}</button>`;
}
async function loadLatestDayHandover(activeId, activeType){
 const host=$('liveHandoverSection');if(!host)return;
 try{
  const {handover}=await api('/api/shift/day-handover/latest');
  if(currentShiftId!==activeId||host!==$('liveHandoverSection'))return;
  host.innerHTML=handoverDetailHTML(handover, activeType==='DAY'?'Seguimiento del Día anterior':'Vehículos recibidos del Día');
 }catch(e){host.textContent='No se pudo consultar el relevo: '+e.message;}
}
async function showHandoverForShift(id,containerId,clear=false){
 const {handover}=await api('/api/shift/'+encodeURIComponent(id)+'/handover');
 const root=$(containerId);if(!root)return;
 let target=root.querySelector('#handoverFollowup');
 if(!target){target=document.createElement('div');target.id='handoverFollowup';target.className='card compact-card';root.appendChild(target);}
 target.innerHTML=handoverDetailHTML(handover,'Folios entregados al siguiente turno');
 return handover;
}
// Historia de cortes: cada turno puede abrir su lista original sin perderla.
const originalLoadShiftsHandover=loadShifts;
loadShifts=async function loadShiftsWithHandover(){
 await originalLoadShiftsHandover();
 const root=$('shiftHistory');if(!root)return;
 root.querySelectorAll('tbody tr').forEach(row=>{
  const first=row.querySelector('td');if(!first)return;
  const button=first.querySelector('button');const shiftId=Number(button?.getAttribute('onclick')?.match(/\d+/)?.[0]);
  if(!Number.isSafeInteger(shiftId))return;
  const link=document.createElement('button');link.type='button';link.className='btn';link.textContent='Folios';link.style.marginLeft='6px';
  link.onclick=()=>showHandoverForShift(shiftId,'shiftHistory').catch(e=>msg(e.message));
  first.appendChild(link);
 });
};
