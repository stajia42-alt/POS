'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),{execFile}=require('child_process');
const {textBytes,breakLines,entryDateTime}=require('../ticket-escpos');
const WIDTH=42;
const money=n=>(Number(n||0)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
function buildReport(cfg,data,settings={}){
 const lines=[];const line=t=>lines.push(...breakLines(t,WIDTH));
 const centered=t=>{for(const x of breakLines(t,WIDTH))lines.push(x.padStart(Math.floor((WIDTH+x.length)/2),' '));};
 const rule=(char='-')=>lines.push(char.repeat(WIDTH));
 const pair=(label,value)=>{
  let text=String(label),v=String(value);if(text.length+v.length+1<=WIDTH)lines.push(text+' '.repeat(WIDTH-text.length-v.length)+v);
  else{line(text);lines.push(v.padStart(WIDTH));}
 };
 const pesos=n=>'$'+money(n);
 const dollars=n=>'US$'+money(n);
 centered(settings.ticketName||cfg.name||'PARKING POS');
 if(settings.address)centered(settings.address);
 rule('=');
 if(data.type==='LOST'){
  const t=data.ticket,q=data.quote||t;
  centered('BOLETO PERDIDO');if(data.reprint)centered('REIMPRESION DEL COMPROBANTE');
  centered('FOLIO '+t.code);rule();
  pair('Entrada',entryDateTime(t.entry_at,cfg.timeZone));
  pair('Reportado',entryDateTime(t.lost_at,cfg.timeZone));
  if(t.plate)pair('Placa',t.plate);
  if(Number.isFinite(q.minutes))pair('Estancia hasta consulta',q.minutes+' min');
  pair('Cargo por boleto perdido',pesos(t.lost_cents));
  const pending=Number.isSafeInteger(q.estimated_cents)?q.estimated_cents:null;
  if(pending!==null&&!t.paid_at&&!t.cancelled_at){pair('Estacionamiento pendiente',pesos(Math.max(0,pending-t.lost_cents)));pair('TOTAL POR COBRAR MXN',pesos(pending));}
  if(t.paid_at)pair('Total cobrado MXN',pesos(t.charged_cents));
  rule();centered(t.cancelled_at?'CANCELADO':t.paid_at?'PAGADO - CONSULTAR COMPROBANTE':'PENDIENTE DE PAGO');
  line('Conserva el folio y hora originales.');
  if(!t.paid_at&&!t.cancelled_at)line('El importe de estancia puede cambiar hasta confirmar el cobro. Este documento no acredita pago ni salida.');
 }else if(data.type==='PAYMENT'){
  const t=data.ticket;centered('COMPROBANTE DE PAGO');centered('FOLIO '+t.code);rule();
  if(data.reprint)centered('REIMPRESION DEL COMPROBANTE');
  pair('Entrada',entryDateTime(t.entry_at,cfg.timeZone));
  if(t.exit_at)pair('Salida',entryDateTime(t.exit_at,cfg.timeZone));
  if(t.lost_cents)pair('Boleto perdido (incluido)',pesos(t.lost_cents));
  const names={stay:'Estacionamiento',additional:'Cobro adicional',refund:'Devolucion',pension:'Pension'};
  for(const p of data.payments){line(entryDateTime(p.paid_at,cfg.timeZone)+' '+(names[p.kind]||p.kind));pair('Importe MXN',pesos(p.amount_cents));pair('Recibido '+(p.method==='usd'?'USD':'MXN'),p.method==='usd'?dollars(p.received_usd_cents):pesos(p.received_cents));if(p.method==='usd')pair('Tipo de cambio',Number(p.usd_rate_used).toFixed(4)+' MXN/USD');pair('Cambio MXN',pesos(p.change_mxn_cents));}
  rule();pair('TOTAL NETO MXN',pesos(data.payments.reduce((a,p)=>a+p.amount_cents,0)));if(t.cancelled_at)centered('CANCELADO');
 }else{
  const s=data.shift,typ=s.shift_type==='DAY'?'DIA':s.shift_type==='NIGHT'?'NOCHE':'ANTERIOR';
  centered('CORTE DE '+typ);centered('TURNO #'+s.id);centered(s.closed_at?'CORTE CERRADO':'CONSULTA DE CAJA');rule();
  pair('Inicio',entryDateTime(s.opened_at,cfg.timeZone));if(s.closed_at)pair('Cierre',entryDateTime(s.closed_at,cfg.timeZone));
  pair('Operaciones',String(s.count||0));rule();
  centered('VENTAS Y COBROS');
  pair('Ventas netas MXN',pesos(s.sales_cents));pair('Pensiones (incluidas)',pesos(s.pension_cents));
  pair('Devoluciones (incluidas)',pesos(s.refunds_cents));
  pair('Pagos en USD (eq. MXN)',pesos(s.usd_sales_mxn_cents));
  pair('Dolares recibidos',dollars(s.received_usd_cents));
  rule();centered('EFECTIVO FISICO');
  pair('Fondo inicial MXN',pesos(s.opening_cents));pair('Pesos recibidos',pesos(s.received_mxn_cents));
  pair('Cambio entregado MXN',pesos(s.change_cents));pair('Ingresos extras MXN',pesos(s.deposits_cents));
  pair('Retiros MXN',pesos(s.withdrawals_cents));
  pair('ESPERADO MXN',pesos(s.expected_cents));pair('ESPERADO USD',dollars(s.expected_usd_cents));
  if(s.closed_at){rule();centered('ARQUEO DE CIERRE');pair('Contado MXN',pesos(s.declared_cents));pair('DIFERENCIA MXN',pesos(s.difference_cents));pair('Contado USD',dollars(s.declared_usd_cents));pair('DIFERENCIA USD',dollars(s.difference_usd_cents));}
  rule();centered('VEHICULOS Y RELEVOS');
  if(s.ownership){pair('Vehiculos pendientes originarios',s.ownership.open_vehicles);pair('Ventas posteriores atribuidas',pesos(s.ownership.other_shift_collected_cents));pair('Pesos recibidos (neto)',pesos(s.ownership.other_shift_cash_mxn_cents));pair('USD recibidos',dollars(s.ownership.other_shift_cash_usd_cents));pair('Entregados al Dia MXN',pesos(s.ownership.settled_mxn_cents));pair('Entregados al Dia USD',dollars(s.ownership.settled_usd_cents));pair('PENDIENTE MXN',pesos(s.ownership.outstanding_mxn_cents));line('USD recibidos: informativos; conciliar FX.');}
  if(s.shift_type==='NIGHT'){
   line('COBROS DE VEHICULOS DEL DIA');
   if(!s.night_dues?.length)line('No hay cobros heredados en este turno.');
   for(const d of s.night_dues||[]){line('Turno dia #'+d.origin_shift_id);pair('Vehiculos heredados cobrados',d.vehicles);pair('Venta atribuida al Dia',pesos(d.collected_cents));pair('Pesos en efectivo netos',pesos(d.cash_mxn_cents));pair('Dolares recibidos',dollars(d.cash_usd_cents));pair('Entregado MXN',pesos(d.settled_mxn_cents));pair('Entregado USD',dollars(d.settled_usd_cents));pair('PENDIENTE PARA DIA MXN',pesos(d.owed_mxn_cents));line('Pendiente informativo: no impide cierre.');}
  }
  if(s.shift_type==='NIGHT'&&s.inherited_tickets?.length){rule();centered('DETALLE FOLIOS DEL DIA COBRADOS');for(const t of s.inherited_tickets){pair('FOLIO '+t.code+' / Dia #'+t.entry_shift_id,pesos(t.sale_cents));}if(s.inherited_tickets.length>=80)line('Solo se muestran los primeros 80.');}
  if(s.handover?.shift?.closed_at){
   rule();centered('FOLIOS ENTREGADOS AL RELEVO');
   pair('Vehiculos entregados',s.handover.summary.handed_over);
   pair('Pagados durante Noche',s.handover.summary.paid_night);
   pair('Siguen dentro ahora',s.handover.summary.inside);
   pair('Pagados en otro turno',s.handover.summary.paid_other);
   pair('Cancelados',s.handover.summary.cancelled);
   if(s.shift_type==='DAY')pair('Cobrado en Noche de esta lista',pesos(s.handover.summary.night_sales_cents));
   for(const t of s.handover.tickets){
    rule('.');
    pair('FOLIO '+t.code,t.status==='PAGADO_NOCHE'?'PAGADO NOCHE':t.status==='PAGADO_OTRO_TURNO'?'PAGADO OTRO TURNO':t.status==='CANCELADO'?'CANCELADO':'SIGUE DENTRO');
    pair('Entrada',entryDateTime(t.entry_at,cfg.timeZone));
    if(t.paid_at)pair('Pago',entryDateTime(t.paid_at,cfg.timeZone));
    if(t.night_paid_cents)pair('Cobrado en Noche',pesos(t.night_paid_cents));
   }
   if(!s.handover.tickets.length)line('No se entregaron vehiculos pendientes.');
   line('La lista original de folios no se modifica.');
   line('Los estados se consultan al imprimir.');
  }

  line('Los cobros se registran una sola vez.');line('Las entregas entre turnos son retiros');line('de efectivo, no ventas adicionales.');
  if(s.closed_at){rule();line('Firma cajero: __________________________');line('Recibio: ______________________________');}
 }
 rule('=');if(cfg.receiptFooter)line(cfg.receiptFooter);
 return Buffer.concat([Buffer.from([27,64,27,116,2,27,97,0]),...lines.flatMap(x=>[textBytes(x),Buffer.from([10])]),Buffer.from([10,10,10]),settings.autoCut===false?Buffer.alloc(0):Buffer.from([29,86,0])]);
}
async function sendRaw(printer,payload){
 if(!printer)throw Error('Configura la impresora');if(process.platform!=='win32')throw Error('Impresión directa requiere Windows');
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'parking-pos-report-'));
 try{const file=path.join(folder,'report.escpos');fs.writeFileSync(file,payload);await new Promise((ok,fail)=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',(process.env.PARKING_PRINT_SCRIPT||path.join(__dirname,'..','print-raw.ps1')),'-PrinterName',printer,'-PayloadFile',file],{windowsHide:true,timeout:25000},(e,out,err)=>e?fail(Error((err||e.message).trim())):ok()));}finally{fs.rmSync(folder,{recursive:true,force:true});}
}
module.exports={buildReport,sendRaw};
