'use strict';
const crypto = require('node:crypto');
const { assert, text, cents, grams, decimal, roundedProduct, lineTotal, id, dateRange } = require('./values');

class POS {
 constructor(store) { this.s = store; }
 shift() { return this.s.get('SELECT shifts.*, users.name AS user_name FROM shifts JOIN users ON users.id=shifts.user_id WHERE closed_at IS NULL'); }
 cash(shift) {
  const totals = this.s.get('SELECT COALESCE(SUM(mxn),0) mxn, COALESCE(SUM(usd),0) usd FROM cash_moves WHERE shift_id=?', [shift.id]);
  return { mxn: shift.opening_mxn + totals.mxn, usd: shift.opening_usd + totals.usd };
 }
 requireShift(user) {
  const shift = this.shift(); assert(shift, 'Abre un turno de caja antes de operar.', 409);
  assert(user.role === 'admin' || shift.user_id === user.id, 'El turno pertenece a otro usuario.', 403); return shift;
 }
 cashMove(shift, type, mxn, usd, amount, payment, reason, user, tx = null) {
  const expected = this.cash(shift);
  assert(expected.mxn + mxn >= 0 && expected.usd + usd >= 0, 'Efectivo insuficiente en caja. Registra una entrada de efectivo o utiliza transferencia.', 409);
  this.s.run('INSERT INTO cash_moves(shift_id,date,type,mxn,usd,amount_cents,payment,reason,user_name,transaction_id) VALUES(?,?,?,?,?,?,?,?,?,?)', [shift.id, new Date().toISOString(), type, mxn, usd, amount, payment, reason, user.name, tx]);
 }
 stockMove(material, delta, valueDelta, type, reason, user, tx = null) {
  const current = this.s.get('SELECT * FROM materials WHERE id=?', [material.id]);
  assert(current.stock_g + delta >= 0, `Existencias insuficientes: ${current.name}.`, 409);
  assert(current.value_cents + valueDelta >= 0, `No se puede revertir el costo de ${current.name}; su inventario ya cambió.`, 409);
  assert(current.stock_g + delta !== 0 || current.value_cents + valueDelta === 0, `El ajuste dejaría un costo sin existencias en ${current.name}.`, 409);
  this.s.run('UPDATE materials SET stock_g=stock_g+?,value_cents=value_cents+? WHERE id=?', [delta, valueDelta, material.id]);
  this.s.run('INSERT INTO stock_moves(material_id,date,type,delta_g,delta_value,after_g,reason,user_name,transaction_id) VALUES(?,?,?,?,?,?,?,?,?)', [material.id, new Date().toISOString(), type, delta, valueDelta, current.stock_g + delta, reason, user.name, tx]);
 }
 material(body, user, materialId = null) {
  const name = text(body.name, 'Nombre', 80), category = text(body.category, 'Categoría', 50);
  const buy = cents(body.buyPrice, 'Precio de compra'), sale = cents(body.salePrice, 'Precio de venta'), min = grams(body.minKg ?? 0, 'Existencia mínima');
  const initial = materialId ? 0 : grams(body.initialKg ?? 0, 'Existencia inicial');
  return this.s.transaction(() => {
   let mid = materialId;
   if (mid) {
    assert(this.s.get('SELECT id FROM materials WHERE id=?', [mid]), 'Material no encontrado.', 404);
    this.s.run('UPDATE materials SET name=?,category=?,buy_cents=?,sale_cents=?,min_g=?,active=? WHERE id=?', [name, category, buy, sale, min, body.active === false ? 0 : 1, mid]);
   } else {
    mid = this.s.run('INSERT INTO materials(name,category,buy_cents,sale_cents,min_g) VALUES(?,?,?,?,?)', [name, category, buy, sale, min]);
    if (initial) this.stockMove({ id: mid }, initial, lineTotal(initial, buy), 'opening', 'Existencia inicial', user);
   }
   this.s.audit(user, materialId ? 'material.update' : 'material.create', `${mid}: ${name}`);
   return this.s.get('SELECT * FROM materials WHERE id=?', [mid]);
  });
 }
 adjust(body, user) {
  const mid = id(body.materialId), delta = grams(body.deltaKg, 'Ajuste', true), reason = text(body.reason, 'Motivo', 400);
  assert(delta !== 0, 'El ajuste no puede ser cero.');
  return this.s.transaction(() => {
   const m = this.s.get('SELECT * FROM materials WHERE id=?', [mid]); assert(m, 'Material no encontrado.', 404);
   const value = delta > 0 ? lineTotal(delta, m.buy_cents) : -this.stockCost(m, -delta);
   this.stockMove(m, delta, value, 'adjustment', reason, user); this.s.audit(user, 'stock.adjust', `${mid}; ${delta} g; ${reason}`);
   return this.s.get('SELECT * FROM materials WHERE id=?', [mid]);
  });
 }
 stockCost(m, qty) {
  assert(qty <= m.stock_g, `Existencias insuficientes: ${m.name}.`, 409);
  return qty === m.stock_g ? m.value_cents : roundedProduct(qty, m.value_cents, m.stock_g);
 }
 openShift(body, user) {
  const mxn = cents(body.openingMxn, 'Fondo MXN'), usd = cents(body.openingUsd ?? 0, 'Fondo USD');
  const rate = decimal(body.rate, 4, 'Tipo de cambio', { max: 1e7 }); assert(rate > 0, 'El tipo de cambio debe ser positivo.');
  return this.s.transaction(() => {
   assert(!this.shift(), 'Ya existe un turno abierto.', 409);
   const sid = this.s.run('INSERT INTO shifts(opened_at,user_id,opening_mxn,opening_usd,rate) VALUES(?,?,?,?,?)', [new Date().toISOString(), user.id, mxn, usd, rate]);
   this.s.audit(user, 'shift.open', sid); return this.shift();
  });
 }
 closeShift(body, user) {
  const mxn = cents(body.countedMxn, 'Contado MXN'), usd = cents(body.countedUsd ?? 0, 'Contado USD'), note = text(body.note, 'Observación', 500, false);
  const result = this.s.transaction(() => {
   const shift = this.requireShift(user), expected = this.cash(shift);
   this.s.run('UPDATE shifts SET closed_at=?,counted_mxn=?,counted_usd=?,expected_mxn=?,expected_usd=?,note=? WHERE id=?', [new Date().toISOString(), mxn, usd, expected.mxn, expected.usd, note, shift.id]);
   this.s.audit(user, 'shift.close', `${shift.id}; diferencia MXN ${mxn - expected.mxn}; USD ${usd - expected.usd}`);
   return this.s.get('SELECT * FROM shifts WHERE id=?', [shift.id]);
  });
  try { result.backup = this.s.backup(`corte-${result.id}`); } catch { result.warning = 'Corte guardado. No se pudo crear el respaldo automático; descarga un respaldo manual.'; }
  return result;
 }
 manualCash(body, user) {
  assert(['entry','withdrawal','expense'].includes(body.type), 'Tipo de movimiento no válido.');
  const amount = cents(body.amount); assert(amount > 0, 'El importe debe ser mayor a cero.');
  const reason = text(body.reason, 'Concepto', 400), payment = body.type === 'expense' ? body.payment : 'cash';
  assert(['cash','transfer'].includes(payment), 'Forma de pago no válida.');
  return this.s.transaction(() => {
   const shift = this.requireShift(user), mxn = payment === 'cash' ? amount * (body.type === 'entry' ? 1 : -1) : 0;
   this.cashMove(shift, body.type, mxn, 0, amount, payment, reason, user);
   this.s.audit(user, `cash.${body.type}`, `${amount}; ${payment}; ${reason}`); return this.cash(shift);
  });
 }
 post(body, user) {
  assert(['purchase','sale'].includes(body.kind), 'Tipo de operación no válido.');
  const requestId = text(body.requestId, 'Identificador de solicitud', 80);
  assert(/^[a-zA-Z0-9_-]{16,80}$/.test(requestId), 'Identificador de solicitud no válido.');
  const payload = { ...body }; delete payload.requestId;
  const hash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  return this.s.transaction(() => {
   const previous = this.s.get('SELECT id,request_hash,user_id FROM transactions WHERE request_id=?', [requestId]);
   if (previous) { assert(previous.request_hash === hash && previous.user_id === user.id, 'La solicitud ya se utilizó con otros datos.', 409); return this.ticket(previous.id); }
   const shift = this.requireShift(user), isSale = body.kind === 'sale';
   assert(Array.isArray(body.items) && body.items.length > 0 && body.items.length <= 100, 'Agrega entre 1 y 100 renglones.');
   assert((isSale ? ['cash','transfer','card','usd'] : ['cash','transfer']).includes(body.payment), 'Forma de pago no válida.');
   const counterpart = text(body.counterpart, 'Cliente / proveedor', 120, false), note = text(body.note, 'Nota', 500, false);
   const prepared = body.items.map(item => {
    const m = this.s.get('SELECT * FROM materials WHERE id=? AND active=1', [id(item.materialId)]); assert(m, 'Material inexistente o inactivo.');
    const gross = grams(item.grossKg, 'Peso bruto'), tare = grams(item.tareKg ?? 0, 'Tara');
    assert(gross > tare, 'El peso bruto debe ser mayor que la tara.'); const net = gross - tare;
    const price = cents(item.price, 'Precio por kg'); assert(price > 0, 'El precio debe ser mayor a cero.');
    if (user.role !== 'admin') assert(price === (isSale ? m.sale_cents : m.buy_cents), 'Solo el administrador puede cambiar precios en una operación.', 403);
    const total = lineTotal(net, price); assert(total > 0, 'El importe del renglón redondea a cero.');
    return { m, gross, tare, net, price, total };
   });
   const total = prepared.reduce((n, x) => n + x.total, 0); assert(Number.isSafeInteger(total) && total <= 1e11, 'Total fuera de rango.');
   let tender = total, change = 0, mxn = 0, usd = 0;
   if (body.payment === 'usd') {
    tender = cents(body.tender, 'Dólares recibidos');
    const equivalent = roundedProduct(tender, shift.rate, 10000); assert(equivalent >= total, 'Los dólares recibidos no cubren el total.');
    change = equivalent - total; mxn = -change; usd = tender;
   } else if (body.payment === 'cash') {
    if (isSale) { tender = cents(body.tender, 'Efectivo recibido'); assert(tender >= total, 'El efectivo recibido no cubre el total.'); change = tender - total; }
    mxn = isSale ? total : -total;
   }
   const txId = this.s.run('INSERT INTO transactions(request_id,request_hash,kind,date,shift_id,user_id,user_name,counterpart,payment,total_cents,cost_cents,tender_cents,change_cents,rate,note) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [requestId, hash, body.kind, new Date().toISOString(), shift.id, user.id, user.name, counterpart, body.payment, total, 0, tender, change, shift.rate, note]);
   let cost = 0;
   for (const item of prepared) {
    const current = this.s.get('SELECT * FROM materials WHERE id=?', [item.m.id]);
    const cogs = isSale ? this.stockCost(current, item.net) : item.total; cost += cogs;
    this.s.run('INSERT INTO transaction_items(transaction_id,material_id,material_name,gross_g,tare_g,net_g,price_cents,total_cents,cost_cents) VALUES(?,?,?,?,?,?,?,?,?)', [txId, current.id, current.name, item.gross, item.tare, item.net, item.price, item.total, cogs]);
    this.stockMove(current, item.net * (isSale ? -1 : 1), cogs * (isSale ? -1 : 1), body.kind, `${isSale ? 'Venta' : 'Compra'} #${txId}`, user, txId);
   }
   this.s.run('UPDATE transactions SET cost_cents=? WHERE id=?', [cost, txId]);
   this.cashMove(shift, body.kind, mxn, usd, total, body.payment, `${isSale ? 'Venta' : 'Compra'} #${txId}`, user, txId);
   this.s.audit(user, `transaction.${body.kind}`, `${txId}; ${total} centavos`); return this.ticket(txId);
  });
 }
 ticket(txId) {
  const tx = this.s.get('SELECT * FROM transactions WHERE id=?', [id(txId)]); assert(tx, 'Ticket no encontrado.', 404);
  return { ...tx, folio: `${tx.kind === 'sale' ? 'V' : 'C'}-${String(tx.id).padStart(6, '0')}`, items: this.s.all('SELECT * FROM transaction_items WHERE transaction_id=? ORDER BY id', [tx.id]), business: this.s.business() };
 }
 void(txId, body, user) {
  const reason = text(body.reason, 'Motivo de cancelación', 400);
  return this.s.transaction(() => {
   const tx = this.ticket(txId), shift = this.requireShift(user);
   assert(tx.status === 'posted', 'La operación ya está cancelada.', 409);
   assert(tx.shift_id === shift.id, 'Solo puedes cancelar operaciones del turno abierto. Los cortes cerrados se conservan.', 409);
   for (const item of [...tx.items].reverse()) this.stockMove({ id: item.material_id }, item.net_g * (tx.kind === 'sale' ? 1 : -1), item.cost_cents * (tx.kind === 'sale' ? 1 : -1), 'void', reason, user, tx.id);
   const move = this.s.get('SELECT * FROM cash_moves WHERE transaction_id=? AND type=?', [tx.id, tx.kind]);
   this.cashMove(shift, 'void', -move.mxn, -move.usd, tx.total_cents, tx.payment, reason, user, tx.id);
   this.s.run("UPDATE transactions SET status='void',void_reason=?,void_at=?,void_user=? WHERE id=?", [reason, new Date().toISOString(), user.name, tx.id]);
   this.s.audit(user, 'transaction.void', `${tx.id}; ${reason}`); return this.ticket(tx.id);
  });
 }
 day(timestamp) { return new Intl.DateTimeFormat('en-CA', { timeZone: this.s.business().timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(timestamp)); }
 report(query = {}) {
  const { from, to } = dateRange(query.from, query.to), inRange = x => { const d = this.day(x.date); return (!from || d >= from) && (!to || d <= to); };
  const rows = this.s.all('SELECT * FROM transactions ORDER BY id DESC').filter(inRange);
  const posted = rows.filter(x => x.status === 'posted');
  const sales = posted.filter(x => x.kind === 'sale'), purchases = posted.filter(x => x.kind === 'purchase');
  const expenses = this.s.all("SELECT * FROM cash_moves WHERE type='expense'").filter(inRange);
  const sum = (xs, key) => xs.reduce((n, x) => n + x[key], 0);
  const salesTotal = sum(sales, 'total_cents'), purchasesTotal = sum(purchases, 'total_cents'), cost = sum(sales, 'cost_cents'), expenseTotal = sum(expenses, 'amount_cents');
  const payments = {};
  for (const row of posted) { payments[row.payment] ||= { sales: 0, purchases: 0 }; payments[row.payment][row.kind === 'sale' ? 'sales' : 'purchases'] += row.total_cents; }
  const mids = new Map();
  for (const row of posted) for (const item of this.s.all('SELECT * FROM transaction_items WHERE transaction_id=?', [row.id])) {
   const m = mids.get(item.material_id) || { name: item.material_name, purchase_g: 0, sale_g: 0, purchases: 0, sales: 0, cost: 0 };
   if (row.kind === 'sale') { m.sale_g += item.net_g; m.sales += item.total_cents; m.cost += item.cost_cents; }
   else { m.purchase_g += item.net_g; m.purchases += item.total_cents; } mids.set(item.material_id, m);
  }
  return { from, to, timezone: this.s.business().timezone, sales: salesTotal, purchases: purchasesTotal, expenses: expenseTotal, cost, margin: salesTotal - cost, result: salesTotal - cost - expenseTotal, payments, materials: [...mids.values()], rows, expenseRows: expenses, posted: posted.length, cancelled: rows.length - posted.length };
 }
 state() {
  const shift = this.shift();
  return { business: this.s.business(), materials: this.s.all('SELECT * FROM materials ORDER BY name'), contacts: this.s.all('SELECT * FROM contacts ORDER BY name'), shift: shift ? { ...shift, expected: this.cash(shift) } : null,
   transactions: this.s.all('SELECT * FROM transactions ORDER BY id DESC LIMIT 200'), shifts: this.s.all('SELECT shifts.*,users.name AS user_name FROM shifts JOIN users ON users.id=shifts.user_id ORDER BY shifts.id DESC LIMIT 100'),
   cashMoves: shift ? this.s.all('SELECT * FROM cash_moves WHERE shift_id=? ORDER BY id DESC', [shift.id]) : [], today: this.day(new Date().toISOString()) };
 }
 legacyPreview(data) {
  assert(data && Array.isArray(data.materials) && data.business && Array.isArray(data.purchases) && Array.isArray(data.sales), 'No es un respaldo JSON de METales-GV V14/V15.');
  assert(data.materials.length <= 2000, 'Demasiados materiales para importar.');
  assert(!data.currentShift, 'Cierra el turno en V15 y exporta nuevamente antes de importar.');
  const category = name => /fierro|cobre|bronce|aluminio|chatarra/i.test(name) ? 'Metal' : /PET|pl[aá]stico/i.test(name) ? 'Plástico' : /cart[oó]n|archivo|papel|peri[oó]dico/i.test(name) ? 'Papel' : 'Otros';
  const materials = data.materials.map(m => ({ legacyId: String(m.id), name: text(m.name, 'Material', 80), category: text(m.category || category(m.name), 'Categoría', 50), buy: cents(m.price ?? 0), sale: cents(m.salePrice ?? 0), stock: grams(m.initial ?? 0), min: grams(m.minStock ?? m.min ?? 0) }));
  assert(new Set(materials.map(m => m.legacyId)).size === materials.length && new Set(materials.map(m => m.name.toLowerCase())).size === materials.length, 'El respaldo tiene materiales duplicados.');
  const add = (mid, kg, sign) => { const m = materials.find(x => x.legacyId === String(mid)); assert(m, 'Hay movimientos de un material inexistente.'); m.stock += sign * grams(kg); };
  for (const p of data.purchases) for (const item of p.items || [{ mid: p.mid, kg: p.kg }]) add(item.mid, item.kg, 1);
  for (const s of data.sales) add(s.mid, s.kg, -1);
  for (const a of data.adjustments || []) { const d = grams(a.delta, 'Ajuste V15', true); add(a.mid, Math.abs(d) / 1000, d < 0 ? -1 : 1); }
  assert(materials.every(m => m.stock >= 0 && Number.isSafeInteger(m.stock) && m.stock <= 1e10), 'El respaldo contiene existencias negativas o fuera de rango. Corrígelas en V15.');
  return { materials, counts: { materials: materials.length, purchases: data.purchases.length, sales: data.sales.length }, businessName: text(data.business.name || 'METales-GV', 'Negocio', 120) };
 }
 importLegacy(body, user) {
  const preview = this.legacyPreview(body.data); assert(body.confirm === 'IMPORTAR', 'Confirma la importación.');
  return this.s.transaction(() => {
   assert(!this.shift() && !this.s.get('SELECT id FROM materials LIMIT 1') && !this.s.get('SELECT id FROM transactions LIMIT 1') && !this.s.get('SELECT id FROM legacy_imports LIMIT 1'), 'La importación se permite en una instalación sin materiales ni operaciones y con caja cerrada.', 409);
   for (const m of preview.materials) {
    const mid = this.s.run('INSERT INTO materials(name,category,buy_cents,sale_cents,min_g) VALUES(?,?,?,?,?)', [m.name, m.category, m.buy, m.sale, m.min]);
    if (m.stock) this.stockMove({ id: mid }, m.stock, lineTotal(m.stock, m.buy), 'legacy', 'Saldo inicial importado V15; costo estimado al precio de compra del respaldo', user);
   }
   const business = { ...this.s.business(), name: preview.businessName };
   for (const field of ['address','phone','taxId','message']) if (typeof body.data.business[field] === 'string') business[field] = text(body.data.business[field], field, 300, false);
   this.s.run("UPDATE settings SET value=? WHERE key='business'", [JSON.stringify(business)]);
   this.s.run('INSERT INTO legacy_imports(date,filename,json) VALUES(?,?,?)', [new Date().toISOString(), text(body.filename || 'respaldo-v15.json', 'Archivo', 180), JSON.stringify(body.data)]);
   this.s.audit(user, 'legacy.import', JSON.stringify(preview.counts)); return { counts: preview.counts };
  });
 }
}
module.exports = { POS };
