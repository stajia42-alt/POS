const {test}=require('node:test');const assert=require('node:assert/strict');
const {cents,grams,lineTotal}=require('../src/values');const {wrapTicket,escpos,padTicket}=require('../src/tickets');
test('gramos y centavos exactos; rechaza precisión excesiva, negativos y valores no numéricos',()=>{
 assert.equal(grams('0.001'),1);assert.equal(cents('1.01'),101);assert.equal(lineTotal(1,500),1);assert.equal(lineTotal(333,3),1);
 for(const value of ['NaN','Infinity','1e2','0x10',true,null,{},'-1','1.001'])assert.throws(()=>cents(value));
});
test('wrapTicket conserva palabras largas y respeta ancho en 58 y 80 mm',()=>{
 for(const width of [32,48]){const original='Cobre '+ 'a'.repeat(110)+' Plástico reciclado';const lines=wrapTicket(original,width);assert.ok(lines.every(s=>s.length<=width));assert.equal(lines.join('').replace(/ /g,''),original.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ /g,''));}
 assert.equal(padTicket('Total','$5.00',32).length,32);
});
test('ESC/POS agrega inicialización y corte y elimina controles de texto',()=>{
 const bytes=escpos('Texto\x1b@\n',true);assert.deepEqual([...bytes.subarray(0,2)],[27,64]);assert.deepEqual([...bytes.subarray(-3)],[29,86,0]);assert.equal([...bytes].filter(n=>n===27).length,2);
 const noCut=escpos('Prueba',false);assert.notDeepEqual([...noCut.subarray(-3)],[29,86,0]);
});
