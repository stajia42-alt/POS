'use strict';
// Solo propuestas: jamás ejecuta escrituras SQL. Recuadros y tipos prevalecen sobre inferencias.
const {spawn}=require('child_process');
const path=require('path'),fs=require('fs');
const DEFAULT=Object.freeze({categoria:'#e53935',producto:'#facc15',descripcion:'#2563eb',precio:'#16a34a',ignorar:'#6b7280',modificador:'#9333ea',componente:'#0891b2'});
const TIPOS=Object.keys(DEFAULT);
const {precio:priceParse,grupoCoincidente}=require('./menu_contexto');
function colors(v={}){
  if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Colores guía incorrectos.');
  const result={...DEFAULT};
  for(const [key,value] of Object.entries(v)){
    if(!TIPOS.includes(key)||typeof value!=='string'||!/^#[0-9a-fA-F]{6}$/.test(value))throw Error('Color guía incorrecto: '+key);
    result[key]=value.toLowerCase();
  }
  if(new Set(Object.values(result)).size!==TIPOS.length)throw Error('Cada tipo debe utilizar un color diferente.');
  return result;
}
function detected(image,colores,{spawnFn=spawn,python=null,timeout=35000,regiones=null}={}){
  colors(colores);
  if(typeof image!=='string'||image.length>9000000||!/^[A-Za-z0-9+/]*={0,2}$/.test(image))return Promise.reject(Error('Imagen inválida para análisis guiado.'));
  const root=process.pkg?path.dirname(process.execPath):__dirname;
  const py=path.join(root,'ocr-env',process.platform==='win32'?'Scripts/python.exe':'bin/python');
  const cmd=python||process.env.RESTAURANTE_PYTHON||(fs.existsSync(py)?py:(process.platform==='win32'?'py':'python3'));
  const args=[...(cmd==='py'?['-3.11']:[]),path.join(root,'menu_colores_detector.py')];
  return new Promise((resolve,reject)=>{
    const child=spawnFn(cmd,args,{windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONIOENCODING:'utf-8'}});
    let finished=false,output='',stderr='';
    const done=(err,val)=>{if(finished)return;finished=true;clearTimeout(timer);if(err){child.kill();reject(err);}else resolve(val);};
    const timer=setTimeout(()=>done(Error('La detección guiada excedió '+Math.round(timeout/1000)+' segundos.')),timeout);
    child.on('error',e=>done(Error('No se pudo iniciar la detección de colores. Comprueba el entorno OCR local: '+e.message)));
    child.stdout.on('data',b=>{output+=b.toString();if(output.length>11000000)done(Error('Respuesta de regiones demasiado extensa.'));});
    child.stderr.on('data',b=>{stderr=(stderr+b.toString()).slice(-500);});
    child.on('close',code=>{
      try{
        const line=output.split(/\r?\n/).findLast(x=>x.startsWith('RESTAURANTE_GUIA:'));
        if(!line)throw Error('El detector de colores no devolvió resultados. '+stderr);
        const d=JSON.parse(line.slice('RESTAURANTE_GUIA:'.length));
        if(!d.correcto)throw Error(d.error||'No se detectaron recuadros.');
        if(!Array.isArray(d.regiones)||d.regiones.length>120)throw Error('Resultado de detección inválido.');
        done(null,d);
      }catch(e){done(e);}
    });
    child.stdin.on('error',e=>done(e));
    child.stdin.end(JSON.stringify({imagen:image,colores:colors(colores),...(regiones!==null?{regiones}: {})})+'\n');
  });
}
function validRegions(regions){
  if(!Array.isArray(regions)||regions.length>120)throw Error('Demasiadas regiones marcadas.');
  const ids=new Set();
  return regions.map(r=>{
    if(!r||!/^R\d{1,3}$/.test(r.id)||ids.has(r.id)||!TIPOS.includes(r.tipo)||!Array.isArray(r.rect)||r.rect.length!==4||r.rect.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>1)||r.rect[0]+r.rect[2]>1.00001||r.rect[1]+r.rect[3]>1.00001)throw Error('Región de color inválida.');
    ids.add(r.id);return {...r};
  });
}
function parseText(regions,answers){
  const rs=validRegions(regions);
  if(!Array.isArray(answers))throw Error('La IA no devolvió textos de las regiones.');
  const map=new Map();
  for(const a of answers){
    if(!a||typeof a.id!=='string'||!rs.some(r=>r.id===a.id)||map.has(a.id)||typeof a.texto!=='string'||a.texto.length>280)throw Error('Gemini devolvió una región desconocida o mal formada.');
    map.set(a.id,a.texto.trim());
  }
  return rs.map(r=>({...r,texto:map.get(r.id)||''}));
}
function interpret(regions, answers, grupos=[], width=1,height=1){
  const entries=parseText(regions,answers);
  const sorted=entries.map((r,i)=>({...r,indice:i,x:r.rect[0]+r.rect[2]/2,y:r.rect[1]+r.rect[3]/2}));
  const blocks=sorted.map((r,i)=>({id:i,texto:r.texto,caja:[r.rect[0]*width,r.rect[1]*height,(r.rect[0]+r.rect[2])*width,(r.rect[1]+r.rect[3])*height],rectVisual:r.rect,tipoVisual:r.tipo,guiaColor:true,confianza:null,pagina:0,uso:[r.tipo+'_guiado']}));
  const typed=t=>sorted.filter(r=>r.tipo===t&&r.texto);
  const categories=typed('categoria');
  const categorias=categories.map(r=>{const g=grupoCoincidente(r.texto,grupos);return {nombre:r.texto,padre:'',conocido:false,evidencia:[r.indice],...g};});
  const products=typed('producto');
  const prices=typed('precio');
  const descriptions=typed('descripcion');
  const usedPrices=new Set(),usedDescriptions=new Set(),incidencias=[];
  function nearestPrice(p){
    const options=[];
    for(const candidate of prices){
      if(usedPrices.has(candidate.id))continue;
      const dy=Math.abs(candidate.y-p.y);
      const dx=candidate.x-p.x;
      // Precio junto al producto en la misma fila, o justo debajo en la misma columna.
      const sameRow=dy<=Math.max(.035,p.rect[3]*.90)&&dx>-.02&&dx<.53;
      const below=candidate.y>=p.y&&candidate.y-p.y<.075&&Math.abs(dx)<.13;
      if(!sameRow&&!below)continue;
      const value=priceParse(candidate.texto.replace(/^MXN\s*/i,''));if(value===null)continue;
      const score=(sameRow?dy*3+Math.abs(dx)*.18:dy*2+.24+Math.abs(dx));
      options.push({candidate,value,score});
    }
    options.sort((a,b)=>a.score-b.score);
    if(options.length>1&&options[1].score-options[0].score<.012)return null;
    const one=options[0];if(one)usedPrices.add(one.candidate.id);return one||null;
  }
  function nearestCategory(p){
    const choices=categories.filter(c=>c.rect[1]<=p.rect[1]+.008&&(
      Math.abs(c.x-p.x)<.26 || c.rect[2]>=.48 // Encabezado de sección que abarca ambas columnas.
    ));
    return choices.sort((a,b)=>b.rect[1]-a.rect[1]||Math.abs(a.x-p.x)-Math.abs(b.x-p.x))[0]||null;
  }
  const productos=products.map(r=>{
    const category=nearestCategory(r);
    const name=r.texto.slice(0,200);
    const linked=nearestPrice(r);
    const desc=descriptions.filter(d=>!usedDescriptions.has(d.id)&&d.y>=r.y-.014&&d.y-r.y<.16&&Math.abs(d.x-r.x)<.18).sort((a,b)=>Math.abs(a.y-r.y)-Math.abs(b.y-r.y))[0];
    if(desc)usedDescriptions.add(desc.id);
    const group=category?grupoCoincidente(category.texto,grupos):{idgrupo:''};
    const rev=[];
    if(!linked)rev.push('Precio por confirmar: el recuadro verde no se pudo relacionar de forma segura.');
    if(!category)rev.push('Asigna una categoría al producto.');
    if(name.length>60)rev.push('Confirma el nombre: Soft Restaurant podría requerir hasta 60 caracteres.');
    return {id:'guia-'+r.id,nombre:name,precio:linked?.value??null,idgrupo:group.idgrupo,grupo_detectado:category?.texto||'',categoria_padre:'',tipo:'independiente',modificadores:[],ingredientes:desc?[desc.texto]:[],evidencia:[r.indice,...(category?[category.indice]:[]),...(linked?[linked.candidate.indice]:[]),...(desc?[desc.indice]:[])],precios_detectados:linked?[linked.value]:[],confianza:'media',revisado:false,requiere_revision:rev.length>0,revision:rev};
  });
  for(const p of prices.filter(p=>!usedPrices.has(p.id)))incidencias.push({tipo:'precio_sin_producto',texto:p.texto,evidencia:[p.indice],mensaje:'Precio marcado sin producto vinculado; corrígelo en la imagen.'});
  const pendientes=sorted.filter(r=>r.texto&&(r.tipo==='precio'&&!usedPrices.has(r.id)||r.tipo==='descripcion'&&!usedDescriptions.has(r.id))).map(r=>blocks[r.indice]);
  return {correcto:true,productos,categorias,bloques:blocks,pendientes,incidencias,ocr_lineas:blocks.map(b=>b.texto),resumen:{lineas:blocks.length,propuestas:productos.length,sinAsignar:pendientes.length,preciosSinProducto:incidencias.length},advertencia:'Propuestas guiadas por colores: confirma nombres, precios y categorías antes de SQL.'};
}
function textFromOCR(regions,ocr,width,height){
  const blocks=Array.isArray(ocr?.bloques)?ocr.bloques:[];
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw Error('La foto no tiene dimensiones para usar OCR por coordenadas.');
  if(!blocks.some(b=>Array.isArray(b.caja)))throw Error('El OCR local no devolvió coordenadas verificables para asociar los colores. Corrige los recuadros manualmente o vuelve a probar Gemini.');
  return validRegions(regions).map(r=>{
    const [x,y,w,h]=r.rect;
    const selected=blocks.filter(b=>Array.isArray(b.caja)&&b.caja.length===4&&b.caja.every(Number.isFinite)&&b.texto&&
      (b.caja[0]+b.caja[2])/(2*width)>x && (b.caja[0]+b.caja[2])/(2*width)<x+w &&
      (b.caja[1]+b.caja[3])/(2*height)>y && (b.caja[1]+b.caja[3])/(2*height)<y+h);
    selected.sort((a,b)=>a.caja[1]-b.caja[1]||a.caja[0]-b.caja[0]);
    return {id:r.id,texto:selected.map(b=>b.texto).join(' ').slice(0,280)};
  });
}
function manual(image,entries,options={}){
  if(!Array.isArray(entries)||entries.length<1||entries.length>120)throw Error('Elige de 1 a 120 cuadros.');
  const regiones=entries.map((r,i)=>{
    if(!r||typeof r.id!=='string'||r.id.length>120||!TIPOS.includes(r.tipo)||!Array.isArray(r.rect)||r.rect.length!==4||r.rect.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>1)||r.rect[2]<=.003||r.rect[3]<=.003||r.rect[0]+r.rect[2]>1.00001||r.rect[1]+r.rect[3]>1.00001)throw Error('Cuadro incorrecto.');
    return {id:r.id,tipo:r.tipo,rect:r.rect};
  });
  if(new Set(regiones.map(r=>r.id)).size!==regiones.length)throw Error('Existen cuadros duplicados.');
  return detected(image,DEFAULT,{...options,regiones});
}
module.exports={DEFAULT,TIPOS,colors,detected,manual,validRegions,parseText,interpret,textFromOCR};
