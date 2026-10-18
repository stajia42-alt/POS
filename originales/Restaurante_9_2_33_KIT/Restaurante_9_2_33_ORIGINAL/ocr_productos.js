'use strict';
// Interpretación conservadora de líneas OCR: el precio puede venir debajo del nombre.
const PRECIO=/^\s*\$?\s*(\d{1,5})(?:[.,](\d{2}))?\s*(?:\/\s*(\d{1,3})\s*(?:pz|pzas|piezas|pcs))?\s*$/i;
const PRECIO_FINAL=/^(.+?)\s+\$\s*(\d{1,5})(?:[.,](\d{2}))?\s*$/;
const TITULOS=/^(entradas|appetizers|aperitivos|bebidas|drinks|postres|desserts|sopas|soups|ensaladas|salads|especialidades|especiales|men[uú]|menu|yuan|precio|price|清爽|前菜)$/i;
const INGLES=/\b(?:vegetable|tempura|salad|fried|shredded|spring|cheese|wontons|cucumber|potato|roll|with|chicken|beef|pork|appetizers|noodles|rice|soup|spicy|grilled|steamed|crispy|shrimp|dumplings)\b/i;
const ESPANOL=/\b(?:ensalada|fritos?|fritas?|rollo|primavera|tiras|pepino|papa|queso|con|de|del|pollo|cerdo|res|arroz|sopa|camarones|relleno|mixta|tostadas|atún|piezas)\b/i;
function nombreValido(s){return s.length>=3&&s.length<=110&&/[a-záéíóúñ]/i.test(s)&&!TITULOS.test(s)&&!/^\d/.test(s)&&!/^[\W\d]+$/.test(s)&&!/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/u.test(s)}
function propuestasOCR(lineas){
 const lines=lineas.map(x=>String(x||'').trim()).filter(Boolean), out=[];
 const add=(nombre,precio,piezas,linea_origen)=>{nombre=nombre.trim().replace(/\s+/g,' ');if(!nombreValido(nombre))return;
 // Conservar inglés si es el único nombre asociado al precio; nunca duplicar traducciones posteriores.
 const observacion='OCR: verificar precio y categoría'+(piezas?' · '+piezas+' piezas':'');
 out.push({nombre:nombre.slice(0,60),precio,linea_origen,grupo_sugerido:'',confianza:'media',observacion});};
 const used=new Set();
 // Menús en columnas: varios nombres, traducciones y luego varios precios.
 // Asociar los precios por orden solamente cuando los bloques sean inequívocos.
 for(let i=0;i<lines.length;i++){
  const priceBlock=[];let k=i;
  while(k<lines.length&&PRECIO.test(lines[k])&&!used.has(k)){priceBlock.push(k);k++}
  if(priceBlock.length<2){continue}
  let start=i-1;
  while(start>=0&&!PRECIO.test(lines[start])&&!TITULOS.test(lines[start])&&i-start<=12)start--;
  const indices=[];
  for(let n=start+1;n<i;n++)if(nombreValido(lines[n])&&!used.has(n))indices.push(n);
  // Los primeros N nombres son españoles; las traducciones inglesas posteriores se ignoran.
  const blockIndices=indices.length>priceBlock.length*2?indices.slice(-priceBlock.length*2):indices;
  if(blockIndices.length===priceBlock.length*2 || blockIndices.length===priceBlock.length){
   const candidates=blockIndices.slice(0,priceBlock.length);
   const translations=blockIndices.slice(priceBlock.length);
   const hasSpanish=candidates.some(n=>ESPANOL.test(lines[n])||!INGLES.test(lines[n])||/^tempura (camaron|camarón|vegetales)$/i.test(lines[n]));
   if(hasSpanish && (translations.length===0 || translations.every(n=>INGLES.test(lines[n])||lines[n].toLowerCase().includes('tempura')))){
    priceBlock.forEach((pi,n)=>{const m=lines[pi].match(PRECIO);add(lines[candidates[n]],Number(m[1]+'.'+(m[2]||'00')),m[3],candidates[n]);used.add(pi);used.add(candidates[n])});
    i=k-1;continue;
   }
  }
 }

 for(let i=0;i<lines.length;i++){
  if(used.has(i))continue;
  let m=lines[i].match(PRECIO_FINAL);
  if(m&&nombreValido(m[1])){add(m[1],Number(m[2]+'.'+(m[3]||'00')),null,i);used.add(i);continue}
  m=lines[i].match(PRECIO);
  if(!m||i===0)continue;
  let j=i-1;while(j>=0&&TITULOS.test(lines[j]))j--;
  if(j<0||used.has(j)||!nombreValido(lines[j]))continue;
  // Si el renglón anterior es inglés y hay un nombre español cercano, priorizar español.
  if(INGLES.test(lines[j])&&!ESPANOL.test(lines[j])&&j>0&&ESPANOL.test(lines[j-1]))j--;
  add(lines[j],Number(m[1]+'.'+(m[2]||'00')),m[3],j);used.add(i);used.add(j);
 }
 return out.filter((p,i,a)=>a.findIndex(x=>x.nombre.toLocaleLowerCase('es')===p.nombre.toLocaleLowerCase('es')&&x.precio===p.precio)===i).slice(0,80);
}
module.exports={propuestasOCR};
