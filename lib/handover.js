'use strict';
// Immutable inventory handed over at the moment a shift closes.
// Payment status is joined live; the snapshot is never rewritten.
function recordHandover(db, fromShiftId, at){
 return db.prepare(`INSERT OR IGNORE INTO shift_handoffs
  (from_shift_id,ticket_id,code,entry_at,entry_shift_id,handed_at)
  SELECT ?,id,code,entry_at,entry_shift_id,?
  FROM tickets WHERE exit_at IS NULL AND cancelled_at IS NULL`).run(fromShiftId,at).changes;
}
function readHandover(db, fromShiftId){
 const shift=db.prepare('SELECT id,shift_type,opened_at,closed_at FROM shifts WHERE id=?').get(fromShiftId);
 if(!shift)throw Error('Turno no encontrado');
 const rows=db.prepare(`SELECT h.id,h.ticket_id,h.code,h.entry_at,h.entry_shift_id,h.handed_at,
   t.exit_at,t.cancelled_at,t.charged_cents,
   (SELECT p.paid_at FROM all_payments p WHERE p.ticket_id=h.ticket_id AND p.paid_at>=h.handed_at ORDER BY p.paid_at ASC LIMIT 1) paid_at,
   (SELECT s.shift_type FROM all_payments p JOIN shifts s ON s.id=p.shift_id
    WHERE p.ticket_id=h.ticket_id AND p.paid_at>=h.handed_at ORDER BY p.paid_at ASC LIMIT 1) paid_shift_type,
   (SELECT p.shift_id FROM all_payments p WHERE p.ticket_id=h.ticket_id AND p.paid_at>=h.handed_at ORDER BY p.paid_at ASC LIMIT 1) paid_shift_id,
   COALESCE((SELECT SUM(p.amount_cents) FROM all_payments p JOIN shifts s ON s.id=p.shift_id
    WHERE p.ticket_id=h.ticket_id AND p.paid_at>=h.handed_at AND s.shift_type='NIGHT'),0) night_paid_cents
  FROM shift_handoffs h JOIN tickets t ON t.id=h.ticket_id
  WHERE h.from_shift_id=? ORDER BY h.id`).all(fromShiftId);
 const tickets=rows.map(row=>({
  ...row,
  status:row.cancelled_at?'CANCELADO':row.exit_at?(row.paid_shift_type==='NIGHT'?'PAGADO_NOCHE':'PAGADO_OTRO_TURNO'):'SIGUE_DENTRO'
 }));
 const summary={handed_over:tickets.length,paid_night:0,paid_other:0,inside:0,cancelled:0,night_sales_cents:0};
 for(const t of tickets){
  if(t.status==='PAGADO_NOCHE')summary.paid_night++;
  else if(t.status==='PAGADO_OTRO_TURNO')summary.paid_other++;
  else if(t.status==='CANCELADO')summary.cancelled++;
  else summary.inside++;
  summary.night_sales_cents+=t.night_paid_cents;
 }
 return {shift,summary,tickets};
}
function lastDayHandover(db){
 const last=db.prepare("SELECT id FROM shifts WHERE shift_type='DAY' AND closed_at IS NOT NULL ORDER BY id DESC LIMIT 1").get();
 return last?readHandover(db,last.id):null;
}
module.exports={recordHandover,readHandover,lastDayHandover};
