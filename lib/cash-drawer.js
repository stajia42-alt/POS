'use strict';
// Comando ESC p m t1 t2: pin 0 (cajon 2) o pin 1 (cajon 5).
// Preparar la cola en una orden RAW independiente SOLO despues de guardar pago.
function buildDrawerPulse(pin=0){
 if(![0,1].includes(pin))throw Error('Pin del cajón inválido');
 return Buffer.from([0x1b,0x40,0x1b,0x70,pin,50,50,10]);
}
module.exports={buildDrawerPulse};
