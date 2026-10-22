'use strict';
const {cents}=require('./money');
const {overlap,windows}=require('./time');
const {pensionCoverage}=require('./pension-coverage');
const defaults={printerName:'',autoPrint:true,name:'Mi estacionamiento',mode:'hourly',hourlyCents:2500,graceMinutes:0,blocks:[{until:60,cents:2500},{until:120,cents:4000},{until:180,cents:5500}],additionalHourCents:1500,additionalMinutes:60,capacity:50,nightSurchargeCents:0,nightStart:'22:00',nightEnd:'06:00',dailyMaxCents:0,exitToleranceMinutes:10,lostTicketCents:20000,receiptFooter:'Conserve su boleto',timeZone:'America/Tijuana'};
const libra3={mode:'blocks',graceMinutes:0,blocks:[{until:60,cents:5000},{until:120,cents:7000},{until:360,cents:10000},{until:720,cents:13000},{until:1440,cents:20000}],additionalMinutes:720,additionalHourCents:20000,lostTicketCents:20000,dailyMaxCents:0,nightSurchargeCents:0};
const clock=x=>/^([01]\d|2[0-3]):[0-5]\d$/.test(x);
function validate(input){
 const c={...defaults,...input};
 if(!['hourly','blocks'].includes(c.mode)||typeof c.name!=='string'||!c.name.trim()||c.name.length>100||typeof c.printerName!=='string'||c.printerName.length>120||typeof c.autoPrint!=='boolean')throw Error('Configuración inválida');
 for(const k of ['hourlyCents','additionalHourCents','dailyMaxCents','nightSurchargeCents','lostTicketCents'])cents(c[k],100000000);
 for(const [k,min,max] of [['capacity',1,100000],['graceMinutes',0,1440],['exitToleranceMinutes',0,1440],['additionalMinutes',1,525600]])if(!Number.isSafeInteger(c[k])||c[k]<min||c[k]>max)throw Error('Valor inválido: '+k);
 if(!Array.isArray(c.blocks)||!c.blocks.length||c.blocks.length>100)throw Error('Agrega entre 1 y 100 rangos');
 c.blocks.forEach((b,i)=>{cents(b.cents,100000000);if(!Number.isSafeInteger(b.until)||b.until<1||b.until>525600||(i&&b.until<=c.blocks[i-1].until)||(i&&b.cents<c.blocks[i-1].cents))throw Error('Rangos deben aumentar en tiempo y no disminuir en precio');});
 if(!clock(c.nightStart)||!clock(c.nightEnd)||c.nightStart===c.nightEnd)throw Error('Horario nocturno inválido');
 if(typeof c.receiptFooter!=='string'||c.receiptFooter.length>180)throw Error('Pie de recibo inválido');
 try{new Intl.DateTimeFormat('es',{timeZone:c.timeZone}).format();}catch{throw Error('Zona horaria inválida');}
 return c;
}
function basePrice(minutes,c){
 if(minutes<=c.graceMinutes)return 0;
 if(c.mode==='hourly')return Math.ceil(minutes/60)*c.hourlyCents;
 const b=c.blocks.find(x=>minutes<=x.until),last=c.blocks.at(-1);
 return b?b.cents:last.cents+Math.ceil((minutes-last.until)/(c.additionalMinutes||60))*c.additionalHourCents;
}
function price(minutes,input,entryAt){
 const c={...defaults,...input},m=Math.max(0,minutes);let total=basePrice(m,c);
 // Each started 24-hour period has its own cap, avoiding a cap jump at 24h+1m.
 if(c.dailyMaxCents>0&&m>c.graceMinutes){const days=Math.floor(m/1440),remainder=m%1440;total=Math.min(total,days*Math.min(basePrice(1440,c),c.dailyMaxCents)+(remainder?Math.min(basePrice(remainder,{...c,graceMinutes:0}),c.dailyMaxCents):0));}
 if(m>c.graceMinutes&&entryAt&&c.nightSurchargeCents>0&&overlap(Date.parse(entryAt),Date.parse(entryAt)+m*60000,c.nightStart,c.nightEnd,c.timeZone)>0)total+=c.nightSurchargeCents;
 return cents(total,Number.MAX_SAFE_INTEGER);
}
function stayPrice(entryAt,at,input,benefit){
 const c={...defaults,...input},start=Date.parse(entryAt),end=Date.parse(at);let duration=Math.max(0,end-start),b=benefit,uncovered=end>start?[[start,end]]:[];
 // Unified pension: its recurring fee is accounted for in the pension ledger.
 // At checkout, only periods beyond the client's included 12/24h stay are billed,
 // using THIS CLIENT'S rate, never the public hourly/block tariff.
 // Nueva pensión individual: sólo se factura una cuota SEMANAL en el estado de cuenta.
 // No se cobran horas, fracciones ni excedentes del tabulador normal.
 // Los beneficios históricos sin esta marca conservan su cálculo original.
 if(b?.kind==='pension'&&(b.pension_weekly_unlimited===true||b.pension_weekly_unlimited===1))return 0;
 const coverage=pensionCoverage(entryAt,b);
 if(coverage){
  const excess=b.pension_excess_cents;
  if(!Number.isSafeInteger(excess)||excess<0||excess>100000000)throw Error('Precio excedente de pensión inválido');
  // Ejemplo: entra 14:35 -> termina mañana 02:35 (12 h exactas).
  // El cruce de medianoche, de turno o el horario diurno/nocturno no intervienen.
  const extraBlocks=Math.max(0,Math.ceil((end-Date.parse(coverage.until))/coverage.durationMs));
  return cents(extraBlocks*excess,Number.MAX_SAFE_INTEGER);
 }

 if(b){const from=Math.max(start,Date.parse(b.valid_from)),to=Math.min(end,Date.parse(b.valid_to));
   if(to>from&&['exempt','pension_day','pension_night'].includes(b.kind)){
    const covered=b.kind==='exempt'?[[from,to]]:windows(from,to,b.window_start,b.window_end,c.timeZone);
    for(const [a,z] of covered)uncovered=uncovered.flatMap(([s,e])=>z<=s||a>=e?[[s,e]]:[...(a>s?[[s,a]]:[]),...(z<e?[[z,e]]:[])]);
    duration=uncovered.reduce((sum,[s,e])=>sum+e-s,0);
   }
 }
 // Fixed daily customer pass: 100 MXN by default per started 24-hour block.
 // It is only granted if the entire stay falls inside the customer's validity.
 // Existing ticket benefits remain frozen in benefit_snapshot.
 if(b?.kind==='daily_flat'&&start>=Date.parse(b.valid_from)&&end<=Date.parse(b.valid_to)){
  const daily=b.daily_price_cents;
  if(!Number.isSafeInteger(daily)||daily<=0)throw Error('Tarifa diaria del cliente inválida');
  return cents(Math.max(1,Math.ceil((end-start)/86400000))*daily,Number.MAX_SAFE_INTEGER);
 }
 let amount=price(Math.ceil(duration/60000),{...c,nightSurchargeCents:0});
 if(Math.ceil(duration/60000)>c.graceMinutes&&c.nightSurchargeCents>0&&uncovered.some(([a,b])=>overlap(a,b,c.nightStart,c.nightEnd,c.timeZone)>0))amount+=c.nightSurchargeCents;
 // Frequent/customer agreements are applied only while the whole stay is eligible.
 if(b&&['frequent','agreement'].includes(b.kind)&&start>=Date.parse(b.valid_from)&&end<=Date.parse(b.valid_to))amount=Number((BigInt(amount)*BigInt(10000-b.discount_bps)+5000n)/10000n);
 return amount;
}
module.exports={defaults,libra3,validate,price,stayPrice};
