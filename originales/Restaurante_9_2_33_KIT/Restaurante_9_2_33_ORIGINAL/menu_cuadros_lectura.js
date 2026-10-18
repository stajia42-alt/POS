'use strict';
// Lee recuadros sobre la imagen original, sin insertar registros ni generar claves.
const guide=require('./menu_colores');
const gemini=require('./gemini_gratis');
const {crearOCR}=require('./ocr_proceso');
const {decodeFoto}=require('./menu_visual_fotos');
function validarRegiones(regiones){
  if(!Array.isArray(regiones)||!regiones.length||regiones.length>120)throw Error('Elige entre 1 y 120 cuadros.');
  const ids=new Set();
  for(const r of regiones){
    if(!r||typeof r.id!=='string'||r.id.length>120||ids.has(r.id)||!guide.TIPOS.includes(r.tipo)||!Array.isArray(r.rect)||r.rect.length!==4||r.rect.some(n=>typeof n!=='number'||!Number.isFinite(n)||n<0||n>1)||r.rect[2]<=.003||r.rect[3]<=.003||r.rect[0]+r.rect[2]>1.00001||r.rect[1]+r.rect[3]>1.00001)throw Error('Un recuadro no tiene coordenadas válidas.');
    ids.add(r.id);
  }
  return regiones;
}
function mergeText(regiones,res){
  const ids=new Map(res.map((r,i)=>['R'+(i+1),r.texto]));
  return regiones.map((r,i)=>({id:r.id,tipo:r.tipo,rect:r.rect,texto:String(ids.get('R'+(i+1))||'').trim().slice(0,280),estado:ids.get('R'+(i+1))?.trim()?'leido':'dudoso'}));
}
function createHandler({manual=guide.manual,ocr=null,gem=gemini.extractGuided}={}){
  // Reutiliza el mismo proceso OCR en todas las solicitudes.
  let worker=ocr;
  return async(body)=>{
    if(!body||!['image/jpeg','image/png','image/webp'].includes(body.mime)||typeof body.imagen!=='string'||body.imagen.length>4300000)throw Object.assign(Error('Fotografía inválida o demasiado grande.'),{status:400});
    decodeFoto('00000000-0000-4000-8000-000000000000',body.mime,body.imagen);
    const regiones=validarRegiones(body.regiones);
    const scanned=regiones.filter(r=>r.tipo!=='ignorar'&&(!body.soloPendientes||r.estado!=='confirmado'));
    if(!scanned.length)return {correcto:true,lecturas:[],fuente:'sin_pendientes'};
    const ready=await manual(body.imagen,scanned);
    if(!ready.montaje||!ready.regiones.length)throw Error('No se pudieron preparar las regiones de la fotografía.');
    let lectura,fuente='gemini_gratis',modelo='';
    // Un único montaje para reducir las peticiones a Gemini en vez de una por cuadro.
    try{const output=await gem(ready.montaje,ready.regiones);lectura=output.regiones;modelo=output.modelo;}
    catch(e){
      if(!gemini.requiresLocalFallback(e))throw e;
      if(!worker)worker=crearOCR();
      const result=await worker.extraer(body.imagen);
      lectura=guide.textFromOCR(ready.regiones,result,ready.ancho,ready.alto);
      fuente='paddleocr_local';
    }
    const parsed=guide.parseText(ready.regiones,lectura);
    return {correcto:true,lecturas:mergeText(scanned,parsed),fuente,modelo};
  };
}
function register({app,soloLocal,procesar=createHandler()}){
  app.post('/api/menu-visual/leer-cuadros',soloLocal,async(req,res)=>{
    try{
      if(req.headers['x-csrf-token']!==req.auth?.nonce)return res.status(403).json({correcto:false,error:'Sesión caducada.'});
      return res.json(await procesar(req.body));
    }catch(e){return res.status(e.status||422).json({correcto:false,error:e.message||'No se pudieron leer los recuadros.'});}
  });
}
module.exports={register,createHandler,validarRegiones,mergeText};
