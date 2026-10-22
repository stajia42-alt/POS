'use strict';
const time=require('./time');
const MAX_PERIODS=1040;
const FOREVER='2099-12-31T23:59:59.000Z';
function assertPeriod(period){if(!['weekly','monthly'].includes(period))throw Error('La pensión debe ser semanal o mensual');return period;}
function boundary(anchor,index,period,zone='America/Tijuana'){
 assertPeriod(period);
 if(!Number.isSafeInteger(index)||index<0||index>MAX_PERIODS)throw Error('El periodo solicitado excede el límite admitido');
 const p=time.parts(anchor,zone),start=`${p.year}-${p.month}-${p.day}`,clock=`${p.hour}:${p.minute}`;
 let day;
 if(period==='weekly')day=time.addDays(start,7*index);
 else{
  const first=new Date(Date.UTC(Number(p.year),Number(p.month)-1+index,1));
  const year=first.getUTCFullYear(),month=first.getUTCMonth();
  const last=new Date(Date.UTC(year,month+1,0)).getUTCDate();
  day=`${year}-${String(month+1).padStart(2,'0')}-${String(Math.min(Number(p.day),last)).padStart(2,'0')}`;
 }
 return new Date(time.localInstant(day,clock,zone)).toISOString();
}
function plans(db,nowIso,zone){
 // A lazy accrual creates debt only once for each started week/month; never writes payments.
 const contracts=db.prepare('SELECT * FROM pension_contracts WHERE stopped_at IS NULL').all();
 for(const row of contracts)accrue(db,row.client_id,nowIso,zone);
}
function accrue(db,clientId,nowIso,zone){
 const row=db.prepare('SELECT * FROM pension_contracts WHERE client_id=?').get(clientId);
 if(!row||row.stopped_at)return;
 const client=db.prepare('SELECT active FROM clients WHERE id=?').get(clientId);
 if(!client||!client.active)return;
 let {anchor_at,period,price_cents,next_index,pending_period,pending_price_cents}=row;
 let changed=false,count=0;
 for(;count<MAX_PERIODS;count++){
  const start=boundary(anchor_at,next_index,period,zone);
  if(start>nowIso)break;
  // A new price or periodicity takes effect at the NEXT unbilled period.
  if(pending_period){anchor_at=start;next_index=0;period=pending_period;price_cents=pending_price_cents;pending_period=null;pending_price_cents=null;}
  const begin=boundary(anchor_at,next_index,period,zone);
  const end=boundary(anchor_at,next_index+1,period,zone);
  if(end<=begin)throw Error('Error al calcular los periodos de pensión');
  db.prepare('INSERT OR IGNORE INTO pension_charges(client_id,period_start,period_end,period,amount_cents,created_at) VALUES(?,?,?,?,?,?)').run(clientId,begin,end,period,price_cents,nowIso);
  next_index++;changed=true;
 }
 if(count===MAX_PERIODS)throw Error('La pensión acumula demasiados periodos; revisa la fecha de inicio');
 if(changed)db.prepare(`UPDATE pension_contracts SET anchor_at=?,period=?,price_cents=?,next_index=?,pending_period=?,pending_price_cents=?,updated_at=? WHERE client_id=?`).run(anchor_at,period,price_cents,next_index,pending_period,pending_price_cents,nowIso,clientId);
}
function ledger(db,clientId){
 const charges=db.prepare(`SELECT ch.*,COALESCE(SUM(a.amount_cents),0) paid_cents
 FROM pension_charges ch LEFT JOIN pension_allocations a ON a.charge_id=ch.id
 WHERE ch.client_id=? GROUP BY ch.id ORDER BY ch.period_start,ch.id`).all(clientId);
 const manual=db.prepare(`SELECT d.id,d.client_id,d.effective_at period_start,d.effective_at period_end,
 'manual' period,d.reason,d.amount_cents,d.created_at,COALESCE(SUM(a.amount_cents),0) paid_cents
 FROM pension_manual_debts d LEFT JOIN pension_manual_allocations a ON a.manual_debt_id=d.id
 WHERE d.client_id=? GROUP BY d.id`).all(clientId);
 return [...charges.map(c=>({...c,source:'period',reason:c.period==='opening'?'Adeudo anterior':null,due_cents:c.amount_cents-c.paid_cents})),
  ...manual.map(c=>({...c,source:'manual',due_cents:c.amount_cents-c.paid_cents}))]
  .sort((a,b)=>a.period_start.localeCompare(b.period_start)||(a.source===b.source?a.id-b.id:a.source==='period'?-1:1));

}
function debt(db,clientId){return ledger(db,clientId).reduce((x,c)=>x+c.due_cents,0);}
function attachBalances(db,clients){
 const contracts=db.prepare('SELECT * FROM pension_contracts').all();
 const byId=new Map(contracts.map(c=>[c.client_id,c]));
 const summary=db.prepare(`SELECT ch.client_id,COUNT(*) periods,
 COALESCE(SUM(ch.amount_cents),0) total_cents,
 COALESCE(SUM(p.paid),0) paid_cents
 FROM pension_charges ch LEFT JOIN (
 SELECT charge_id,SUM(amount_cents) paid FROM pension_allocations GROUP BY charge_id
 ) p ON p.charge_id=ch.id GROUP BY ch.client_id`).all();
 const manual=db.prepare(`SELECT d.client_id,COUNT(*) periods,COALESCE(SUM(d.amount_cents),0) total_cents,
 COALESCE(SUM(COALESCE(p.paid,0)),0) paid_cents
 FROM pension_manual_debts d LEFT JOIN (
 SELECT manual_debt_id,SUM(amount_cents) paid FROM pension_manual_allocations GROUP BY manual_debt_id
 ) p ON p.manual_debt_id=d.id GROUP BY d.client_id`).all();
 const amounts=new Map(summary.map(r=>[r.client_id,r]));
 for(const row of manual){const old=amounts.get(row.client_id)||{total_cents:0,paid_cents:0,periods:0};amounts.set(row.client_id,{total_cents:old.total_cents+row.total_cents,paid_cents:old.paid_cents+row.paid_cents,periods:old.periods+row.periods});}

 return clients.map(c=>{const ct=byId.get(c.id),s=amounts.get(c.id);return {...c,contract:ct||null,
 balance_cents:(s?.total_cents||0)-(s?.paid_cents||0), billed_periods:s?.periods||0};});
}
function allocate(db,clientId,adjustmentId,amount){
 if(!Number.isSafeInteger(amount)||amount<=0)throw Error('Pago inválido');
 const due=ledger(db,clientId).filter(c=>c.due_cents>0);
 const total=due.reduce((n,c)=>n+c.due_cents,0);
 if(amount>total)throw Error('El abono es mayor que la deuda');
 const allocated=[];let remaining=amount;
 for(const row of due){if(!remaining)break;const applied=Math.min(row.due_cents,remaining);
  if(row.source==='manual')db.prepare('INSERT INTO pension_manual_allocations(manual_debt_id,adjustment_id,amount_cents) VALUES(?,?,?)').run(row.id,adjustmentId,applied);
  else db.prepare('INSERT INTO pension_allocations(charge_id,adjustment_id,amount_cents) VALUES(?,?,?)').run(row.id,adjustmentId,applied);
  allocated.push({source:row.source,charge_id:row.id,amount_cents:applied});remaining-=applied;
 }
 if(remaining)throw Error('No se pudo aplicar el abono');return allocated;
}
module.exports={FOREVER,boundary,plans,accrue,ledger,debt,attachBalances,allocate};
