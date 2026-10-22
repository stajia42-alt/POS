'use strict';
// La vista previa genera la misma información que el ticket ESC/POS.
// CODE128-B: tabla de patrones oficial (índices 0-106).
const CODE128_PATTERNS=('212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112').split(' ');
function barcode128Svg(code){
 if(!/^[A-Z0-9]{1,24}$/.test(code))throw Error('Código de barras inválido');
 const encoded=[104,...Array.from(code,ch=>ch.charCodeAt(0)-32)];let check=104;
 for(let i=1;i<encoded.length;i++)check+=i*encoded[i];encoded.push(check%103,106);
 let x=12,rect='';for(const sym of encoded){const pattern=CODE128_PATTERNS[sym];if(!pattern)throw Error('Patrón de barras no disponible');for(let i=0;i<pattern.length;i++){const width=Number(pattern[i]);if(i%2===0)rect+=`<rect x="${x}" y="3" width="${width}" height="68" fill="#111"/>`;x+=width;}}
 const width=x+12;
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 94" role="img" aria-label="Código de barras CODE128 ${code}" style="width:100%;height:auto;display:block"><rect width="${width}" height="94" fill="#fff"/>${rect}<text x="${width/2}" y="89" text-anchor="middle" fill="#111" font-size="12" font-family="monospace">${code}</text></svg>`;
}
function previewEscape(t){return String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function lineFormat(t){return previewEscape(t).replace(/\r\n?|\n/g,'<br>');}
function previewDate(iso,z='America/Tijuana'){
 try{const dt=new Date(iso);return new Intl.DateTimeFormat('es-MX',{timeZone:z,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(dt).replace(',', '');}catch{return iso}
}
function logoCanvas(data){if(!data)return '';try{const raw=atob(data.data),w=data.widthBytes*8,h=data.height;const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');const img=ctx.createImageData(w,h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const dark=raw.charCodeAt(y*data.widthBytes+(x>>3))&(128>>(x%8));const idx=(y*w+x)*4;img.data[idx]=img.data[idx+1]=img.data[idx+2]=dark?0:255;img.data[idx+3]=255;}ctx.putImageData(img,0,0);return canvas.toDataURL('image/png');}catch{return '';}}
async function previewTicket(code){
 try{
  let data;
  if(typeof code==='string'&&code.trim())data=await api('/api/print/preview/'+encodeURIComponent(code.trim().toUpperCase()));
  else {const config=await api('/api/config');const setup=await api('/api/print-settings');data={code:'PRUEBA000000',entry_at:new Date().toISOString(),name:setup.ticketName||config.name,timeZone:config.timeZone,settings:{...setup,ticketName:$('ticketName')?.value.trim()||setup.ticketName,address:$('ticketAddress')?.value||setup.address,policies:$('ticketPolicies')?.value||setup.policies}};
    if(typeof ticketLogoChange!=='undefined'&&ticketLogoChange!==undefined)data.settings.logo=ticketLogoChange;
  }
  const settings=data.settings||{},date=previewDate(data.entry_at,data.timeZone),img=logoCanvas(settings.logo);
  const html=`<div style="max-width:340px;max-height:72vh;overflow:auto;margin:15px auto;padding:22px 17px 25px;background:#fff;color:#111;font-family:Arial,sans-serif;text-align:center;box-shadow:0 12px 30px #0005;border-radius:4px;overflow-wrap:anywhere">
    ${img?`<img src="${img}" alt="Logotipo" style="max-width:90%;max-height:140px;object-fit:contain;margin:auto auto 8px;display:block">`:''}
    <div style="font-size:19px;font-weight:900;letter-spacing:.3px;line-height:1.12">${previewEscape(data.name)}</div>
    <div style="font-size:12px;margin-top:7px;white-space:normal">${lineFormat(settings.address||'')}</div>
    <hr style="border:0;border-top:1px dashed #333;margin:13px 0">
    <div style="font-weight:900;font-size:13px">ORIGINAL — CLIENTE</div><div style="font-weight:900;font-size:19px">BOLETO DE ENTRADA</div>
    <div style="font-size:12px;font-weight:700">FOLIO</div><div style="font-weight:900;font-size:36px;letter-spacing:.9px;margin-top:4px">${previewEscape(data.code)}</div>
    <div style="font-weight:800;font-size:12px">HORA DE ENTRADA</div><div style="font-size:34px;font-weight:900;margin:4px 0">${previewEscape(date.match(/\d\d:\d\d/)?.[0]||date)}</div><div style="font-size:12px;margin:7px 0 9px">${previewEscape(date)}</div>
    ${data.pension_coverage_until?`<div style="margin:9px 0;font-size:13px;font-weight:bold">PENSIÓN ${data.pension_coverage_hours} HORAS — HASTA<br>${previewEscape(previewDate(data.pension_coverage_until,data.timeZone))}</div>`:''}
    ${barcode128Svg(data.code)}
    <div style="font-weight:800;font-size:14px;margin:7px 0">CONSERVE SU BOLETO</div>
    <hr style="border:0;border-top:1px dashed #333;margin:14px 0">
    <div style="font-size:12px;text-align:left;white-space:pre-wrap;line-height:1.4">${previewEscape(settings.policies||'')}</div>
    <div style="margin-top:13px;font-size:13px;font-weight:800">ESTACIONE Y CIERRE SU AUTOMÓVIL</div>

  </div><div style="max-width:340px;margin:12px auto;padding:12px 16px;background:#fff;color:#111;text-align:center;font-family:Arial,sans-serif;border-radius:4px"><div style="font-size:17px;font-weight:900">COPIA ESTACIONAMIENTO</div><div style="font-size:13px;font-weight:900">NO ENTREGAR AL CLIENTE</div><div style="font-size:12px;margin-top:6px">FOLIO</div><div style="font-size:36px;font-weight:900">${previewEscape(data.code)}</div><div style="font-size:11px">HORA DE ENTRADA</div><div style="font-size:29px;font-weight:900">${previewEscape(date.match(/\d\d:\d\d/)?.[0]||date)}</div><div style="font-size:11px">${previewEscape(date)}</div>${data.pension_coverage_until?`<div style="font-size:12px">PENSIÓN ${data.pension_coverage_hours} H - HASTA ${previewEscape(previewDate(data.pension_coverage_until,data.timeZone))}</div>`:''}${barcode128Svg(data.code)}<div style="text-align:left;font-size:12px;margin-top:5px">Datos / notas: __________________<div style="margin-top:7px">____________________________</div></div></div><p class="muted" style="font-size:12px">Vista previa del contenido para papel térmico de 80 mm; no sustituye una prueba con el modelo real de impresora. El código de barras representa el mismo folio que se envía por ESC/POS.</p>`;
  modal('Vista previa de ticket · 80 mm',html);
  const dlg=$('actionModal').querySelector('.opening-dialog');if(dlg)dlg.style.width='min(520px,100%)';
 }catch(e){msg('Vista previa: '+e.message)}
}
