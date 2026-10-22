'use strict';
// Se cuenta a partir de la fecha/hora de EMISIÓN de cada boleto, sin horario fijo.
// La fecha de emisión es la que se guarda en tickets.entry_at y se imprime en
// ambas copias. No se cambia en reimpresiones ni con el relevo Día/Noche.
const HOUR_MS=60*60*1000;
function pensionCoverage(entryAt,benefit){
 if(!benefit||benefit.kind!=='pension'||(benefit.pension_weekly_unlimited===true||benefit.pension_weekly_unlimited===1))return null;
 const start=Date.parse(entryAt),validFrom=Date.parse(benefit.valid_from),validTo=Date.parse(benefit.valid_to);
 if(!Number.isFinite(start))throw Error('Fecha de entrada inválida');
 if(!Number.isFinite(validFrom)||!Number.isFinite(validTo)||start<validFrom||start>=validTo)return null;
 const hours=benefit.pension_hours;
 if(![12,24].includes(hours))throw Error('La pensión debe cubrir 12 o 24 horas');
 return {hours,from:new Date(start).toISOString(),until:new Date(start+hours*HOUR_MS).toISOString(),durationMs:hours*HOUR_MS};
}
module.exports={pensionCoverage};
