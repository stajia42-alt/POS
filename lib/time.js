'use strict';
const cache=new Map();
function parts(at,zone='America/Tijuana') {
  if(!cache.has(zone))cache.set(zone,new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}));
  return Object.fromEntries(cache.get(zone).formatToParts(new Date(at)).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
}
function dateKey(at,zone){const p=parts(at,zone);return `${p.year}-${p.month}-${p.day}`;}
function addDays(day,n){return new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);}
function localInstant(day,time,zone) {
  const target=Date.parse(day+'T'+time+':00Z');let utc=target;
  for(let i=0;i<4;i++){const p=parts(utc,zone);const wall=Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);const delta=target-wall;if(!delta)break;utc+=delta;}
  return utc;
}
function windows(start,end,from,to,zone) {
  if(end<=start)return [];
  let day=addDays(dateKey(start,zone),-1),last=dateKey(end,zone),result=[],count=0;
  while(day<=last){if(++count>36600)throw Error('Estancia excede el límite de 100 años');
    const a=localInstant(day,from,zone),b=localInstant(from>=to?addDays(day,1):day,to,zone);
    const left=Math.max(start,a),right=Math.min(end,b);if(right>left)result.push([left,right]);day=addDays(day,1);
  }return result;
}
function overlap(...args){return windows(...args).reduce((n,[a,b])=>n+b-a,0);}
function validDate(day){return /^\d{4}-\d{2}-\d{2}$/.test(day||'')&&Number.isFinite(Date.parse(day+'T00:00:00Z'))&&new Date(day+'T00:00:00Z').toISOString().slice(0,10)===day;}
module.exports={parts,dateKey,addDays,localInstant,overlap,windows,validDate};
