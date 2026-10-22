'use strict';
// Comandos ESC/POS sin dependencia de drivers gráficos ni librerías externas.
// Papel de 80 mm: 42 caracteres en fuente A (504 puntos de ancho).
const ESC=0x1b, GS=0x1d, WIDTH=42;
const cp850 = {
 'á':160,'é':130,'í':161,'ó':162,'ú':163,'ñ':164,'Ñ':165,'ü':129,'Ü':154,
 'Á':181,'É':144,'Í':214,'Ó':224,'Ú':233,'¿':168,'¡':173,'°':248,'à':133,'è':138,
 'â':131,'ê':136,'ô':147,'ç':135,'Ç':128,'ö':148,'Ö':153,'ä':132,'Ä':142
};
function textBytes(value){
 const safe=String(value??'').replace(/\r\n?/g,'\n').replace(/[\x00-\x08\x0b-\x1f\x7f]/g,' ').normalize('NFC');
 return Buffer.from(Array.from(safe,x=>{if(x==='\n')return 10;const n=x.codePointAt(0);return cp850[x]??(n>=32&&n<=126?n:63)}));
}
function breakLines(value,width=WIDTH){
 const lines=[];
 for(const original of String(value??'').replace(/\r\n?/g,'\n').split('\n')){
  const words=original.trim().split(/\s+/).filter(Boolean);let line='';
  for(let word of words){
   while(word.length>width){if(line){lines.push(line);line=''}lines.push(word.slice(0,width));word=word.slice(width)}
   if(!word)continue;
   if(!line)line=word;else if(line.length+1+word.length<=width)line+=' '+word;else{lines.push(line);line=word}
  }
  if(line)lines.push(line);
 }
 return lines;
}
function entryDateTime(iso,timeZone='America/Tijuana'){
 const time=new Date(iso);
 if(!Number.isFinite(time.getTime()))throw Error('Fecha de entrada inválida');
 const formatter=new Intl.DateTimeFormat('es-MX',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 const parts=Object.fromEntries(formatter.formatToParts(time).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}:${parts.second}`;
}
function parseLogo(logo){
 if(!logo)return null;
 if(typeof logo!=='object'||!Number.isInteger(logo.widthBytes)||logo.widthBytes<1||logo.widthBytes>48||!Number.isInteger(logo.height)||logo.height<1||logo.height>240||typeof logo.data!=='string'||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(logo.data))throw Error('Formato de logotipo inválido');
 const bytes=Buffer.from(logo.data,'base64');
 if(bytes.length!==logo.widthBytes*logo.height)throw Error('Las dimensiones del logotipo no coinciden con los datos');
 return {...logo,bytes};
}
function buildEntryTicket({name,code,entryAt,address='',policies='',logo=null,autoCut=true,test=false,timeZone='America/Tijuana',pensionCoverageUntil=null,pensionCoverageHours=null,copy='CUSTOMER',reprint=false,reprintReason=''}){
 if(!/^[A-Z0-9]{1,24}$/.test(String(code??'')))throw Error('Folio incompatible con código de barras CODE128');
 if(pensionCoverageUntil&&( ![12,24].includes(pensionCoverageHours)||!Number.isFinite(Date.parse(pensionCoverageUntil))||Date.parse(pensionCoverageUntil)-Date.parse(entryAt)!==pensionCoverageHours*3600000))throw Error('Cobertura de pensión inválida para el boleto');
 const logoData=copy==='INTERNAL'?null:parseLogo(logo);
 const out=[];
 const cmd=(...n)=>out.push(Buffer.from(n));
 const str=(s)=>out.push(textBytes(s+'\n'));
 const align=(n)=>cmd(ESC,0x61,n); // 0 izquierda, 1 centro
 const bold=(v)=>cmd(ESC,0x45,v?1:0);
 const size=(n)=>cmd(ESC,0x21,n);
 const centerLines=(s,max=WIDTH)=>{for(const l of breakLines(s,max))str(l)};
 cmd(ESC,0x40);cmd(ESC,0x74,2); // reset y tabla CP850 Epson-compatible
 align(1);
 if(logoData){const w=logoData.widthBytes,h=logoData.height;
  // Raster GS v 0: x en bytes, y en puntos, a escala 1x1.
  cmd(GS,0x76,0x30,0,w&255,(w>>8)&255,h&255,(h>>8)&255);out.push(logoData.bytes);str('');
 }
 // Comprobante interno deliberadamente corto: no duplicar políticas, dirección ni logotipo.
 if(copy==='INTERNAL'){
  bold(true);size(0x11);str('COPIA ESTACIONAMIENTO');size(0);bold(false);
  bold(true);str('NO ENTREGAR AL CLIENTE');bold(false);
  str('FOLIO');bold(true);size(code.length<=12?0x30:0x10);str(code);size(0);bold(false);
  const dt=entryDateTime(entryAt,timeZone);
  str('HORA DE ENTRADA');bold(true);size(0x30);str(dt.slice(11,16));size(0);bold(false);str(dt);
  if(pensionCoverageUntil){str('PENSION '+pensionCoverageHours+' H - HASTA');str(entryDateTime(pensionCoverageUntil,timeZone));}
  const b=Buffer.from(`{B${code}`,'ascii');
  cmd(GS,0x68,54);cmd(GS,0x77,code.length<=14?2:1);cmd(GS,0x48,2);cmd(GS,0x6b,73,b.length);out.push(b);str('');
  align(0);str('Datos / notas: ________________________');str('______________________________________');
  align(1);str('CONTROL INTERNO');str('');
  if(autoCut)cmd(GS,0x56,0x42,0);
  return Buffer.concat(out);
 }
 bold(true);size(0x10);centerLines(name||'ESTACIONAMIENTO',20);size(0);bold(false);
 centerLines(address,WIDTH);
 str('------------------------------------------');
 bold(true);size(0x11);str(reprint?'REIMPRESION AUTORIZADA':'ORIGINAL - CLIENTE');str('BOLETO DE ENTRADA');size(0);bold(false);
 if(reprint){str('MISMO FOLIO - NO ES OTRA ENTRADA');for(const l of breakLines('Motivo: '+reprintReason,WIDTH))str(l);}
 if(test)str('*** PRUEBA SIN VALOR ***');
 bold(true);str('FOLIO');size(code.length<=12?0x30:0x10);str(code);size(0);bold(false);
 str('HORA DE ENTRADA');const hora=entryDateTime(entryAt,timeZone);bold(true);size(0x30);str(hora.slice(11,16));size(0);bold(false);str(hora);
 if(pensionCoverageUntil){bold(true);str('PENSION '+pensionCoverageHours+' HORAS - HASTA');str(entryDateTime(pensionCoverageUntil,timeZone));bold(false);}
 str('');
 // CODE128 subconjunto B, símbolo con quiet zones. GS k 73 n {B + ASCII.
 // Nuevo folio 14 caracteres para ancho de barras 2 (≈420 puntos).
 const b=Buffer.from(`{B${code}`,'ascii');
 cmd(GS,0x68,75); // alto de barras
 cmd(GS,0x77,code.length<=14?2:1); // folios antiguos largos se conservan
 cmd(GS,0x48,2); // folio legible debajo
 cmd(GS,0x6b,73,b.length);out.push(b);
 str('');bold(true);str('CONSERVE SU BOLETO');bold(false);
 str('------------------------------------------');
 align(0);
 if(copy==='INTERNAL'){str('DATOS PARA ANOTAR:');str('Cliente: ______________________________');str('Vehiculo: _____________________________');str('Telefono: _____________________________');str('Observaciones: ________________________');str('______________________________________');str('Resguardar para boletos extraviados.');}else for(const l of breakLines(policies,WIDTH))str(l);
 align(1);str('');str('ESTACIONE Y CIERRE SU AUTOMOVIL');
 // El cliente recibe un boleto completo, sin talón desprendible.
 // La copia corta se imprime por separado (copy='INTERNAL') con el mismo folio.
 str('');str('');str('');
 if(autoCut)cmd(GS,0x56,0x42,0); // corte total/parcial según firmware de la impresora
 return Buffer.concat(out);
}
module.exports={buildEntryTicket,entryDateTime,breakLines,parseLogo,textBytes};
