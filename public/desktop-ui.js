 'use strict';
async function detectDesktopPrinters(){
 const output=document.getElementById('installedPrinters');
 const help=document.getElementById('installedPrintersHelp');
 if (!window.parkingDesktop?.listPrinters){
   help.textContent='La detección está disponible dentro de la aplicación de Windows. Puedes introducir el nombre manualmente.';
   return;
 }
 help.textContent='Buscando impresoras configuradas en Windows...';
 try{
   const printers=await window.parkingDesktop.listPrinters();
   output.replaceChildren(new Option('Seleccionar impresora',''));
   for(const printer of printers){
     const opt=new Option(printer.displayName+(printer.isDefault?' (predeterminada)':''),printer.name);
     output.add(opt);
   }
   const current=document.getElementById('printerName').value;
   output.value=printers.some(p=>p.name===current)?current:'';
   help.textContent=printers.length?'Selecciona tu impresora de 80 mm y pulsa Guardar impresión.':'Windows no reporta impresoras instaladas. Instala primero el controlador de tu modelo.';
 }catch(e){help.textContent='No fue posible detectar impresoras: '+e.message;}
}
document.addEventListener('DOMContentLoaded',()=>{
 const select=document.getElementById('installedPrinters');
 if(select)select.addEventListener('change',()=>{if(select.value)document.getElementById('printerName').value=select.value;});
 if(window.parkingDesktop?.isDesktop){document.getElementById('installedPrintersHelp').textContent='Aplicación de Windows detectada. Puedes buscar la impresora directamente.';}
});

// Los lectores USB estándar actúan como teclado. F8 deja la caja preparada.
// Si la caja tiene foco (no se está editando un campo), también detectamos
// escaneos rápidos de folios 001, 002… y de folios antiguos CODE128 + Enter.
(function attachDesktopBarcodeListener(){
 let buffered='',lastKeyAt=0;
 document.addEventListener('keydown',event=>{
  if(!window.parkingDesktop?.isDesktop)return;
  if(event.key==='F8'){
   event.preventDefault();
   const nav=document.querySelector('aside nav button');
   if(nav&&typeof page==='function')page('dashboard',nav);
   const code=document.getElementById('code');
   if(code){code.focus();code.select();}
   buffered='';
   return;
  }
  if(event.ctrlKey||event.altKey||event.metaKey||event.isComposing)return;
  const active=document.activeElement;
  if(active?.matches('input,textarea,select,[contenteditable="true"]'))return;
  if(document.getElementById('loginOverlay')?.style.display==='flex')return;
  if(document.getElementById('openingOverlay')?.style.display==='flex')return;
  if(document.getElementById('actionModal')?.style.display==='flex')return;
  const now=performance.now();
  if(now-lastKeyAt>150)buffered='';
  lastKeyAt=now;
  if(/^[0-9a-z]$/i.test(event.key)){
   buffered=(buffered+event.key.toUpperCase()).slice(-24);
  }else if(event.key==='Enter'&&/^(?:[0-9]{3,12}|[A-F0-9]{14})$/.test(buffered)){
   event.preventDefault();
   const code=document.getElementById('code'),nav=document.querySelector('aside nav button');
   if(code&&nav&&typeof page==='function'&&typeof lookup==='function'){
    page('dashboard',nav);
    code.value=buffered;
    lookup();
   }
   buffered='';
  }else{
   buffered='';
  }
 },true);
})();
