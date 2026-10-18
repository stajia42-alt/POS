'use strict';
// Adaptado de normalizeTicketText, padTicket y ESC/POS de METales-GV V15.
// Corrige wrapTicket: no pierde palabras largas y compara la longitud del texto completo.
function normalizeTicketText(s) {
 return String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\x7e\n]/g, '?');
}
function wrapTicket(value, width) {
 const lines = []; let line = '';
 for (let word of normalizeTicketText(value).split(/\s+/)) {
  if (!word) continue;
  if (line && (line + ' ' + word).length <= width) { line += ' ' + word; continue; }
  if (line) { lines.push(line); line = ''; }
  while (word.length > width) { lines.push(word.slice(0, width)); word = word.slice(width); }
  line = word;
 }
 if (line) lines.push(line); return lines;
}
function padTicket(a, b, width) {
 a = normalizeTicketText(a); b = normalizeTicketText(b);
 return a + ' '.repeat(Math.max(1, width - a.length - b.length)) + b;
}
const money = n => (n < 0 ? '-$' : '$') + (Math.abs(n) / 100).toFixed(2);
const kg = n => (n / 1000).toFixed(3);
const paymentNames = { cash: 'Efectivo MXN', transfer: 'Transferencia', card: 'Tarjeta', usd: 'Efectivo USD' };
function businessHeader(b, add) {
 add(b.name); if (b.address) add(b.address); if (b.phone) add('Tel. ' + b.phone); if (b.taxId) add('RFC: ' + b.taxId);
}
function ticketText(tx) {
 const width = tx.business.paper === '58mm' ? 32 : 48, lines = [], add = s => lines.push(...wrapTicket(s, width)), rule = () => lines.push('-'.repeat(width));
 businessHeader(tx.business, add); rule();
 add(tx.kind === 'sale' ? 'TICKET DE VENTA' : 'TICKET DE COMPRA'); add(tx.folio);
 add(new Date(tx.date).toLocaleString('es-MX', { timeZone: tx.business.timezone }));
 add('Usuario: ' + tx.user_name); if (tx.counterpart) add((tx.kind === 'sale' ? 'Cliente: ' : 'Proveedor: ') + tx.counterpart);
 if (tx.status === 'void') { rule(); add('*** CANCELADO ***'); add(tx.void_reason); } rule();
 for (const item of tx.items) {
  add(item.material_name); add(`Bruto ${kg(item.gross_g)} - Tara ${kg(item.tare_g)} kg`);
  add(`${kg(item.net_g)} kg x ${money(item.price_cents)}/kg`); lines.push(padTicket('Subtotal', money(item.total_cents), width));
 }
 rule(); lines.push(padTicket('TOTAL MXN', money(tx.total_cents), width)); add('Pago: ' + paymentNames[tx.payment]);
 if (tx.kind === 'sale' && ['cash','usd'].includes(tx.payment)) {
  add('Recibido ' + (tx.payment === 'usd' ? 'USD ' : 'MXN ') + money(tx.tender_cents));
  if (tx.payment === 'usd') add('TC MXN/USD: ' + (tx.rate / 10000).toFixed(4));
  add('Cambio MXN: ' + money(tx.change_cents));
 }
 if (tx.note) add('Nota: ' + tx.note); rule(); add(tx.business.message); add('Comprobante interno. No es factura fiscal.');
 return lines.join('\n');
}
function cutText(shift, business) {
 const width = business.paper === '58mm' ? 32 : 48, lines = [], add = s => lines.push(...wrapTicket(s, width)), pair = (a,b) => lines.push(padTicket(a,b,width));
 businessHeader(business, add); add('CORTE DE CAJA #' + shift.id); add('Usuario: ' + shift.user_name);
 add('Abierto: ' + new Date(shift.opened_at).toLocaleString('es-MX', { timeZone: business.timezone }));
 if (shift.closed_at) add('Cerrado: ' + new Date(shift.closed_at).toLocaleString('es-MX', { timeZone: business.timezone }));
 lines.push('-'.repeat(width)); pair('Fondo MXN', money(shift.opening_mxn)); pair('Esperado MXN', money(shift.expected_mxn)); pair('Contado MXN', money(shift.counted_mxn)); pair('Diferencia MXN', money(shift.counted_mxn - shift.expected_mxn));
 lines.push('-'.repeat(width)); pair('Fondo USD', money(shift.opening_usd)); pair('Esperado USD', money(shift.expected_usd)); pair('Contado USD', money(shift.counted_usd)); pair('Diferencia USD', money(shift.counted_usd - shift.expected_usd));
 const names = { purchase:'Compras',sale:'Ventas',expense:'Gastos',entry:'Entradas',withdrawal:'Retiros',void:'Cancelaciones' };
 for (const row of shift.summary || []) pair(`${names[row.type] || row.type} ${paymentNames[row.payment] || row.payment}`, money(row.amount));
 if (shift.note) add('Observación: ' + shift.note); return lines.join('\n');
}
function escpos(text, cut = true) {
 const out = [0x1b, 0x40, 0x1b, 0x61, 0];
 out.push(...Buffer.from(normalizeTicketText(text), 'ascii'), 10, 10, 10);
 if (cut) out.push(0x1d, 0x56, 0); return Buffer.from(out);
}
module.exports = { normalizeTicketText, wrapTicket, padTicket, ticketText, cutText, escpos, paymentNames };
