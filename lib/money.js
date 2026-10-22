'use strict';
// Money is integer cents; exchange rates are integer ten-thousandths.
function decimal(value, places=2) {
  const s=String(value??'').trim();
  if(!new RegExp('^\\d+(?:\\.\\d{1,'+places+'})?$').test(s)) throw Error('Cantidad inválida: usa hasta '+places+' decimales');
  const [a,b='']=s.split('.'), n=Number(a)*10**places+Number(b.padEnd(places,'0'));
  if(!Number.isSafeInteger(n)) throw Error('Cantidad fuera de límite');
  return n;
}
function cents(n, max=1000000000) {if(!Number.isSafeInteger(n)||n<0||n>max)throw Error('Importe inválido');return n;}
function rateUnits(rate) {const n=decimal(rate,4);if(n<=0||n>10000000)throw Error('Tipo de cambio inválido');return n;}
function convertUSD(usd,rate) {cents(usd);return Number((BigInt(usd)*BigInt(rateUnits(rate))+5000n)/10000n);}
module.exports={decimal,cents,rateUnits,convertUSD};
