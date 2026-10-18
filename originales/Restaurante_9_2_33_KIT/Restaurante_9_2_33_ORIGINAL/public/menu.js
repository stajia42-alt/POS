'use strict';
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const money = v => v === null || v === '' || !Number.isFinite(Number(v)) ? 'Por confirmar' : Number(v).toLocaleString('es-MX',{style:'currency',currency:'MXN'});
const uid = () => crypto.randomUUID();
const STORAGE = 'restaurante-menu-proyecto-v1';
let project = {version:1,clasificacionEsquema:'sql11',productos:[],fotografias:[],gruposPreparados:[]};
let protectedDraft = '', newProduct = null;
let grupos = [], catalogo = [], connected = false, nonce = '', busy = false, selected = new Set(), editing = null, editMods = [];
let equivalenciasGrupos = {};
const normGroup = name => equivalenciasGrupos[norm(name)] || String(name??'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const files = new Map();
const transcriptDrafts=new Map();
let proposedChanges=[];let proposedPhotoId='';
function fotoUrl(f){return f.imagenGuardada?'/api/menu-visual/fotos/'+encodeURIComponent(f.id):(files.get(f.id)?.url||'');}
let tab = 'fotos';
function status(text, bad=false) {$('notice').textContent=text;$('notice').classList.toggle('bad',bad);}
async function api(url, body, timeout=30000) {
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),timeout);
  try {
    const r=await fetch(url,{signal:controller.signal,cache:'no-store',headers:{'Content-Type':'application/json','X-CSRF-Token':nonce},...(body!==undefined?{method:'POST',body:JSON.stringify(body)}:{})});
    const raw=await r.text();let d;
    try{d=JSON.parse(raw);}catch{throw Object.assign(Error(r.status===413?'La foto es demasiado grande para el servidor.':
      'El servidor devolvió una respuesta inesperada (HTTP '+r.status+'). Comprueba que Restaurante esté iniciado.'),{status:r.status});}
    if(!r.ok||d.correcto===false)throw Object.assign(Error(d.error||'No se pudo completar la operación (HTTP '+r.status+').'),{details:d,status:r.status});
    return d;
  } catch(e) {
    if(e.name==='AbortError')throw Error('La conexión tardó demasiado. El trabajo puede continuar en el servidor.');
    if(e instanceof TypeError)throw Error('Se perdió la comunicación con Restaurante. Revisa Internet y vuelve a intentar; las fotografías completadas se conservan.');
    throw e;
  } finally{clearTimeout(timer);}
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function solicitudReintentable(url,body,timeout=30000){
  let last;
  for(let n=0;n<3;n++){
    try{return await api(url,body,timeout);}
    catch(e){last=e;if([400,401,403,404,413,422].includes(e.status)||n===2)break;await pause(900*(n+1));}
  }
  throw last;
}
async function consultarTrabajo(id){
  for(let intento=0;intento<450;intento++){
    const r=await solicitudReintentable('/api/menu-ia/trabajos/'+encodeURIComponent(id),undefined,16000);
    if(r.estado==='lista')return r.resultado;
    if(r.estado==='error')throw Object.assign(Error(r.error||'No fue posible interpretar la imagen.'),{estadoFinal:true});
    if(!['pendiente','procesando'].includes(r.estado))throw Error('El servidor devolvió un estado desconocido para esta fotografía.');
    await pause(1600);
  }
  throw Error('El análisis continúa demasiado tiempo. Prueba recuperar el trabajo después, sin eliminar la foto.');
}
async function analizarFotoRemota(photo){
  let clientId=photo.trabajo;
  if(!clientId){photo.intento=(Number(photo.intento)||0)+1;clientId=photo.id+'-'+photo.intento;photo.trabajo=clientId;persist();}
  let serverId=photo.servidorTrabajo;
  if(!serverId){
    const local=files.get(photo.id);
    if(!local&&!photo.imagenGuardada)throw Error('Vuelve a adjuntar la fotografía: el archivo original ya no está en este navegador.');
    let foto;
    try {
      let source=local?.file;
      if(!source&&photo.imagenGuardada){const r=await fetch('/api/menu-visual/fotos/'+encodeURIComponent(photo.id),{cache:'no-store'});if(!r.ok)throw Error('No se encontró la imagen persistida.');source=await r.blob();}
      const prepared=await compress(source);
      photo.ancho=prepared.ancho;photo.alto=prepared.alto;
      if(!photo.imagenGuardada){
        try{await solicitudReintentable('/api/menu-visual/fotos/'+photo.id,{mime:prepared.mime,imagen:prepared.imagen},25000);photo.imagenGuardada=true;photo.avisoImagen='';}
        catch(e){photo.avisoImagen='La imagen no se pudo conservar en el servidor; el OCR continuará, pero el editor visual podría necesitar que vuelvas a adjuntarla: '+e.message;}
      }
      const guiaCorrecciones=project.memoriaActiva===false?[]:project.fotografias.filter(f=>f.id!==photo.id).flatMap(f=>(f.resultado?.bloques||[]).filter(b=>b.tipoVisual).map(b=>({texto:b.texto,tipo:b.tipoVisual}))).slice(-20);
      foto={...prepared,modo:$('mode').value,grupos,guiaCorrecciones,...($('mode').value==='guiado'?{coloresGuia:readGuideColors()}: {})};persist();
    }
    catch(e){photo.trabajo=null;throw Error('Preparación de la foto: '+e.message);}
    let r;
    try{r=await solicitudReintentable('/api/menu-ia/trabajos',{cliente:clientId,foto},35000);}
    catch(e){if([400,401,403,413,422].includes(e.status))photo.trabajo=null;throw Error('Subida de la foto: '+e.message);}
    serverId=r.id;photo.servidorTrabajo=serverId;persist();
  }
  try {return await consultarTrabajo(serverId);}
  catch(e){
    if(e.estadoFinal||e.status===404){photo.trabajo=null;photo.servidorTrabajo=null;}
    throw Error('Análisis: '+e.message);
  }
}

function persist() {
  try {
    if(protectedDraft){
      if(!project.productos.length&&!project.fotografias.length&&!project.gruposPreparados.length){$('savedState').textContent='Borrador anterior protegido: no se reemplazó por un proyecto vacío.';return;}
      localStorage.setItem(STORAGE+'-recuperacion-'+Date.now(),protectedDraft);protectedDraft='';
    }
    localStorage.setItem(STORAGE,JSON.stringify(project));$('savedState').textContent='Borrador conservado en este navegador · '+new Date().toLocaleTimeString('es-MX');$('savedState').classList.remove('error');
  }
  catch {$('savedState').textContent='No se pudo guardar el borrador: usa Guardar proyecto para conservar los cambios.';$('savedState').classList.add('error');status($('savedState').textContent,true);}
}
function download(name, data) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})), a=document.createElement('a');
  a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
function backup() {download('Restaurante_Menu_Revision.json',{...project,exportado:new Date().toISOString(),estadoSQL:'Sin importar'});}
function switchTab(name) {
  tab=name;document.querySelectorAll('.tab').forEach(x=>x.hidden=x.id!=='tab-'+name);
  document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x.dataset.tab===name));
}
function groupOptions(value='') {
  const missing=value&&!grupos.some(g=>String(g.idgrupo).trim()===value)&&!project.gruposPreparados.some(g=>'borrador:'+g.id===value);
  return '<option value="">Elegir grupo…</option>'+(missing?'<option selected value="'+esc(value)+'">Grupo '+esc(value)+' · pendiente de consulta</option>':'')+grupos.map(g=>'<option value="'+esc(String(g.idgrupo).trim())+'" '+(String(g.idgrupo).trim()===value?'selected':'')+'>'+esc(g.descripcion)+'</option>').join('')+
    project.gruposPreparados.map(g=>'<option value="borrador:'+esc(g.id)+'" '+('borrador:'+g.id===value?'selected':'')+'>'+esc(g.nombre)+' · preparado</option>').join('');
}
function groupName(id) {
  if(String(id||'').startsWith('borrador:'))return project.gruposPreparados.find(g=>'borrador:'+g.id===id)?.nombre+' · preparado';
  return grupos.find(g=>String(g.idgrupo).trim()===id)?.descripcion || (id?'Grupo '+id:'Sin grupo asignado');
}
function categories() {
  const map=new Map();
  for(const f of project.fotografias)for(const c of f.resultado?.categorias||[]){
    const key=norm(c.padre)+'/'+norm(c.nombre);
    if(!map.has(key))map.set(key,{...c});
  }
  for(const p of project.productos)if(p.grupo_detectado){
    const key=norm(p.categoria_padre)+'/'+norm(p.grupo_detectado);
    if(!map.has(key))map.set(key,{nombre:p.grupo_detectado,padre:p.categoria_padre||''});
  }
  return [...map.values()].map(c=>{
    const matches=grupos.filter(g=>normGroup(g.descripcion)===normGroup(c.nombre));
    const draft=project.gruposPreparados.find(g=>normGroup(g.nombre)===normGroup(c.nombre));
    return {...c,idgrupo:matches.length===1?String(matches[0].idgrupo).trim():'',estado:matches.length===1?'existente':matches.length>1?'ambiguo':draft?'preparado':'faltante'};
  });
}
function duplicates() {
  const seen=new Map(), keys=new Map(catalogo.map(p=>[String(p.idproducto).trim().toUpperCase(),p.descripcion])), projectKeys=new Map();
  for(const p of project.productos)if(p.clave&&!p.excluido){const k=p.clave.toUpperCase();projectKeys.set(k,(projectKeys.get(k)||0)+1);}
  for(const p of project.productos){
    const n=norm(p.nombre), existing=catalogo.find(x=>norm(x.descripcion)===n), earlier=!p.excluido&&!p.importado&&seen.get(n);
    p.duplicado=existing?'Ya existe en SQL: '+existing.idproducto:earlier?'Nombre repetido en este proyecto':'';
    p.claveProblema=p.clave&&keys.has(p.clave.toUpperCase())?'Clave ocupada en SQL':p.clave&&!p.excluido&&projectKeys.get(p.clave.toUpperCase())>1?'Clave repetida en este proyecto':'';
    p.claveOcupada=!!p.claveProblema;
    if(!p.excluido&&!p.importado&&!seen.has(n)&&n)seen.set(n,p.id);
  }
}
function assignDetected() {
  for(const p of project.productos){
    if(p.idgrupo && !p.idgrupo.startsWith('borrador:'))continue;
    const draft=project.gruposPreparados.find(g=>'borrador:'+g.id===p.idgrupo);
    const name=draft?draft.nombre:p.grupo_detectado;
    const matches=grupos.filter(g=>normGroup(g.descripcion)===normGroup(name));
    if(matches.length===1){p.idgrupo=String(matches[0].idgrupo).trim();p.revisado=false;}
  }
}
// Generación local, determinista y sin reutilizar claves. Se reconcilia con SQL al conectarse.
// La clave automática no depende de que el grupo ya exista: también funciona en borradores.
function suggestKeys({regenerate=false}={}) {
  const used=new Set(catalogo.map(p=>String(p.idproducto||'').trim().toUpperCase()));
  for(const p of project.productos){
    if(p.importado)continue;
    if(p.clave && !p.claveAutomatica)used.add(String(p.clave).trim().toUpperCase());
  }
  for(const p of project.productos){
    if(p.importado)continue;
    const automatic=p.claveAutomatica===true;
    if(p.clave && !automatic)continue; // Nunca sobreescribir una clave tecleada.
    if(p.clave && automatic && !regenerate && !used.has(p.clave.toUpperCase())){
      used.add(p.clave.toUpperCase());continue;
    }
    p.clave='';
    for(let n=1;n<=999999;n++){
      const candidate=String(n).padStart(6,'0');
      if(!used.has(candidate)){
        p.clave=candidate;p.claveAutomatica=true;used.add(candidate);break;
      }
    }
  }
}
function normalizePresentation(p){
  // Compatibilidad con proyectos anteriores: la cantidad va al final del nombre.
  const extra=String(p.presentacion||'').trim();
  if(extra && !p.nombre.toLowerCase().includes(extra.toLowerCase()))p.nombre=p.nombre.trim()+' ('+extra+')';
  delete p.presentacion;
}
function productIssues(p){
  const errors=[];
  if(!p.nombre?.trim()||p.nombre.length>60)errors.push('Revisar nombre (máximo 60 caracteres)');
  if(!validPrice(p.precio))errors.push('Falta precio válido');
  if(!p.idgrupo)errors.push('Falta grupo');
  if(!p.clave||!(/^[A-Za-z0-9_-]{1,15}$/.test(p.clave)))errors.push('Falta clave válida');
  if(p.claveProblema||p.duplicado)errors.push(p.claveProblema||p.duplicado);
  if(p.tipo==='con_opciones'){
    if(!Array.isArray(p.modificadores)||!p.modificadores.length||p.modificadores.some(m=>
      m.obligatorio!==true||Number(m.minimo)!==1||Number(m.maximo)!==1||!m.nombre||
      !Array.isArray(m.opciones)||!m.opciones.length||m.opciones.some(o=>!o.nombre||!validPrice(o.precio))))
      errors.push('Confirma los grupos, opciones y precios de este producto compuesto');
  }else if(p.tipo!=='independiente'||p.modificadores?.length)errors.push('Tipo de producto y opciones sin resolver');
  if(p.opcionesVisualesPendientes?.some(o=>o.tipo==='componente'))errors.push('Componentes del combo por revisar');
  return errors;
}
function prepareNewGroups(rows){
  for(const p of rows){
    if(!p.idgrupo&&p.grupo_detectado){prepareGroup(p.grupo_detectado);}
  }
  assignDetected();
}

async function catalog() {
  try {
    const [data,names]=await Promise.all([api('/api/menu-admin/catalogo'),api('/api/menu-ia/nombres')]);
    grupos=data.grupos;equivalenciasGrupos=data.equivalenciasGrupos||{};catalogo=names.productos;connected=true;
    assignDetected();suggestKeys();duplicates();
    $('catalogState').textContent=grupos.length+' grupos y '+catalogo.length+' claves consultadas en SQL. No se modificó el catálogo.';
    if(!grupos.length||!catalogo.length){
      $('catalogState').textContent+=' Atención: la consulta devolvió un catálogo vacío o incompleto. Comprueba que la conexión apunte a la base del negocio antes de importar.';
      status('No se encontraron grupos o productos en la consulta SQL. Revisa la conexión y conserva el diagnóstico para verificar la base; esto no demuestra que se hayan perdido datos.',true);
    }
    render();persist();window.MenuSQL?.actualizarGrupos();
  }catch(e){connected=false;$('catalogState').textContent='Catálogo sin verificar: '+e.message;status('Puedes preparar el menú. El catálogo SQL sigue sin verificar: '+e.message,true);render();}
}
function filtered() {
  const query=norm($('search').value), filter=$('filter').value;
  return project.productos.filter(p=>(!query||norm(p.nombre+' '+p.grupo_detectado).includes(query)) &&
    (filter==='todos'||filter==='pendientes'&&productIssues(p).length||filter==='duplicados'&&(p.duplicado||p.claveProblema)||filter==='revisados'&&!productIssues(p).length&&!p.excluido&&!p.importado));
}
function render() {
  duplicates();
  $('sPhotos').textContent=project.fotografias.length;
  $('sPhotoState').textContent=project.fotografias.filter(f=>f.estado==='lista').length+' analizadas';
  $('sProducts').textContent=project.productos.length;
  $('sReviewed').textContent=project.productos.filter(p=>!p.excluido&&!p.importado&&!productIssues(p).length).length;
  const included=project.productos.filter(p=>!p.excluido&&!p.importado);
  const ready=included.filter(p=>!productIssues(p).length).length;
  $('includedCount').textContent=ready+' listos · '+(included.length-ready)+' necesitan revisión';
  $('sGroups').textContent=categories().filter(c=>c.estado!=='existente').length;
  const value=$('bulkGroup').value;$('bulkGroup').innerHTML=groupOptions(value);
  $('selectionCount').textContent=selected.size+' seleccionados';
  $('gallery').innerHTML=project.fotografias.map(f=>'<article class="photo">'+(fotoUrl(f)?'<img alt="'+esc(f.nombre)+'" src="'+esc(fotoUrl(f))+'">':'<div class="placeholder">▤</div>')+
    '<small title="'+esc(f.nombre)+'">'+esc(f.nombre)+'</small><small class="state">'+esc({pendiente:'Por analizar',analizando:'Leyendo…',lista:'Analizada',error:'Error · reintentar'}[f.estado]||f.estado)+'</small>'+
    (f.error?'<details class="photo-error"><summary>Ver error</summary><small>'+esc(f.error)+'</small></details>':'')+
    (f.resultado?'<button type="button" class="visual-open" data-open-visual="'+esc(f.id)+'">⋯ Opcional: cuadros sobre la foto</button>':'')+
    (f.avisoImagen?'<p class="muted">'+esc(f.avisoImagen)+'</p>':'')+
    (f.resultado&&!f.imagenGuardada?'<label class="photo-reattach">Vincular foto original<input type="file" accept="image/jpeg,image/png,image/webp" data-reattach="'+esc(f.id)+'" aria-label="Volver a adjuntar '+esc(f.nombre)+'"></label>':'')+
    (f.estado==='error'?'<button type="button" class="retry-photo" data-retry-photo="'+esc(f.id)+'" '+(busy?'disabled':'')+'>Reintentar</button>':'')+'<button data-remove-photo="'+esc(f.id)+'" aria-label="Quitar '+esc(f.nombre)+'" '+(busy?'disabled':'')+'>×</button></article>').join('');
  const by=new Map();
  for(const p of filtered()){const key=p.idgrupo?groupName(p.idgrupo).replace(/ · preparado$/,''):p.grupo_detectado||'Sin categoría';if(!by.has(key))by.set(key,[]);by.get(key).push(p);}
  $('productList').innerHTML=by.size?[...by].map(([name,rows])=>'<section class="product-section"><h3>'+esc(name)+' <span class="count">'+rows.length+'</span></h3><div class="cards">'+rows.map(p=>{
    const issues=productIssues(p),ready=!issues.length, on=!p.excluido&&!p.importado;
    return '<article class="product quick-product '+(p.excluido?'off ':'')+(on&&ready?'ready':'')+'">'+
    '<div class="product-head"><label class="batch-select" title="Seleccionar para acciones de grupo"><input type="checkbox" aria-label="Seleccionar '+esc(p.nombre)+'" data-select="'+esc(p.id)+'" '+(selected.has(p.id)?'checked':'')+'><span>Lote</span></label><span class="key-pill">'+esc(p.clave||'Sin clave')+(p.claveAutomatica&&!connected?' · local':'')+'</span><span class="tag '+(ready&&on?'ok':'')+'">'+(p.importado?'Ya importado':p.excluido?'Descartado':ready?'Listo':'Requiere ajuste')+'</span></div>'+
    '<div class="quick-data"><div><h4>'+esc(p.nombre)+'</h4><p>'+esc(groupName(p.idgrupo)||p.grupo_detectado||'Sin grupo')+'</p></div><div class="price">'+money(p.precio)+'</div></div>'+
    (p.opcionesVisualesPendientes?.length?'<p class="option-prices">Pendiente de configurar en Soft Restaurant: '+p.opcionesVisualesPendientes.map(x=>esc(x.tipo+': '+x.texto)).join(' · ')+'</p>':'')+
    (p.modificadores?.length?'<p class="option-prices">'+p.modificadores.flatMap(m=>m.opciones.map(o=>esc(o.nombre)+': '+money(o.precio))).join(' · ')+'</p>':'')+
    (p.ingredientes?.length?'<p class="product-description">'+esc(p.ingredientes.join(' · '))+'</p>':'')+

    (issues.length?'<p class="issue">'+esc(issues[0])+'</p>':'')+
    '<div class="product-bottom">'+(p.foto?'<button class="light" data-visual-product="'+esc(p.foto)+'">Ver imagen</button>':'')+'<button class="light" data-edit="'+esc(p.id)+'">Editar</button>'+
    (p.importado?'<strong class="imported-note">Guardado en SQL</strong>':'<button class="'+(on?'include-active':'light')+'" data-toggle="'+esc(p.id)+'">'+(on?'✓ Incluir':'Incluir')+'</button>')+'</div></article>';
  }).join('')+'</div></section>').join(''):'<div class="empty">Aquí aparecerán tus productos, listos para aceptar o descartar.</div>';
  const cats=categories();
  $('categoryList').innerHTML=cats.map(c=>'<article class="group"><label>Nombre de la categoría<input data-category-name="'+esc(c.nombre)+'" value="'+esc(c.nombre)+'" maxlength="120"></label><p>'+esc(c.padre||'Categoría principal')+'</p><span class="tag '+(c.estado==='existente'?'ok':'')+'">'+esc({existente:'Existe en SQL',ambiguo:'Elegir coincidencia',preparado:'Se creará al importar',faltante:connected?'Nueva categoría':'Sin verificar en SQL'}[c.estado])+'</span><div class="actions"><button class="light" data-rename-category="'+esc(c.nombre)+'">Guardar nombre</button><button class="light" data-remove-category="'+esc(c.nombre)+'">Quitar del menú</button></div></article>').join('')||'<p class="muted">Todavía no hay categorías detectadas.</p>';
  $('draftGroups').innerHTML=project.gruposPreparados.map(g=>'<article class="group"><p><strong>'+esc(g.nombre)+'</strong></p><label>Clasificación<select data-group-class="'+esc(g.id)+'">'+[1,2,3].map(k=>'<option value="'+k+'" '+(Number(g.clasificacion??suggestedClass(g.nombre))===k?'selected':'')+'>'+{1:'Bebidas',2:'Alimentos',3:'Otros'}[k]+'</option>').join('')+'</select></label><p class="muted">Botón naranja, letras negras (automático)</p><button class="light" data-remove-draft="'+esc(g.id)+'">Quitar del menú</button></article>').join('');
  $('sqlGroups').innerHTML=grupos.map(g=>'<span>'+esc(g.idgrupo+' · '+g.descripcion)+'</span>').join('')||'<p class="muted">Consulta el catálogo para ver los grupos existentes.</p>';
  const selectedGroup=$('fixGroup').value;
  $('fixGroup').innerHTML='<option value="">Selecciona un grupo…</option>'+grupos.map(g=>'<option value="'+esc(String(g.idgrupo).trim())+'">'+esc(g.descripcion)+'</option>').join('');
  if(grupos.some(g=>String(g.idgrupo).trim()===selectedGroup))$('fixGroup').value=selectedGroup;
  const pending=project.fotografias.reduce((n,f)=>n+(f.resultado?.pendientes?.length||0),0);
  $('pendingCount').textContent='· '+pending+' líneas sin asignar';
  // Avisar sólo precios sin relación con las propuestas finales; el texto OCR
  // complementario queda consultable, pero no obliga a editar cada producto.
  const unresolvedPrices=project.fotografias.flatMap(f=>{
    const amounts=project.productos.filter(p=>p.foto===f.id).map(p=>p.precio);
    return (f.resultado?.incidencias||[]).filter(i=>i.tipo==='precio_sin_producto'&&
      [...String(i.texto||'').matchAll(/\$\s*([0-9]+(?:[.,][0-9]{1,2})?)/g)]
        .some(m=>!amounts.includes(Number(m[1].replace(',','.')))));
  });
  $('reviewNotice').hidden=!unresolvedPrices.length;
  $('reviewNotice').textContent=unresolvedPrices.length+' precios no tienen un producto asociado. Abre el texto pendiente sólo para verificar esos precios.';
  $('evidence').innerHTML=project.fotografias.filter(f=>f.resultado).map(f=>'<details><summary>'+esc(f.nombre)+' · '+f.resultado.bloques.length+' líneas</summary>'+
    (f.resultado.pendientes.length?'<div class="pending-lines">'+f.resultado.pendientes.map(b=>'<div><span>'+esc(b.texto)+'</span><button class="light" data-from-evidence="'+esc(f.id)+'" data-block="'+b.id+'">Revisar como producto</button></div>').join('')+'</div>':'')+
    '<pre>'+esc(f.resultado.bloques.map(b=>'['+(b.id+1)+'] '+b.texto+' — '+(b.uso.length?b.uso.join(', '):'SIN ASIGNAR')).join('\n'))+'</pre>'+
    (f.resultado.ayudaIA?'<p class="muted">Ayuda de IA · propuesta no aplicada</p><pre>'+esc(JSON.stringify(f.resultado.ayudaIA,null,2))+'</pre>':'')+'</details>').join('');
  renderCaptureUi();
}
function suggestedClass(name) {
  const v=String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(/\b(bebidas?|refrescos?|aguas? frescas?|jugos?|licuados?|cafes?|cervezas?|vinos?|cocteles?|drinks?|sodas?)\b/.test(v))return 1;
  if(/\b(otros?|varios?|extras?|servicios?|diversos?)\b/.test(v))return 3;
  return 2;
}
function prepareGroup(name,clasificacion=null) {
  name=String(name||'').trim();if(!name||name.length>120)throw Error('El grupo necesita un nombre de hasta 120 caracteres.');
  if(grupos.some(g=>normGroup(g.descripcion)===normGroup(name)))return;
  let g=project.gruposPreparados.find(g=>normGroup(g.nombre)===normGroup(name));
  if(!g){g={id:uid(),nombre:name,clasificacion:clasificacion??suggestedClass(name)};project.gruposPreparados.push(g);}
  if(clasificacion!=null)g.clasificacion=clasificacion;
  for(const p of project.productos)if(!p.idgrupo&&normGroup(p.grupo_detectado)===normGroup(name)){p.idgrupo='borrador:'+g.id;p.revisado=false;}
}
function removeCategory(name){
  const matching=project.gruposPreparados.filter(g=>normGroup(g.nombre)===normGroup(name));
  for(const f of project.fotografias){
    if(!f.resultado)continue;
    const ids=new Set(f.resultado.categorias.filter(c=>normGroup(c.nombre)===normGroup(name)).flatMap(c=>c.evidencia||[]));
    f.resultado.categorias=f.resultado.categorias.filter(c=>normGroup(c.nombre)!==normGroup(name));
    for(const c of f.resultado.categorias)if(normGroup(c.padre)===normGroup(name))c.padre='';
    for(const b of f.resultado.bloques)if(ids.has(b.id))b.uso=[...b.uso.filter(r=>!r.startsWith('categoria')),'categoria_descartada_por_usuario'];
  }
  for(const p of project.productos){
    if(normGroup(p.grupo_detectado)===normGroup(name)||matching.some(g=>p.idgrupo==='borrador:'+g.id)){p.grupo_detectado='';p.idgrupo='';p.revisado=false;}
    if(normGroup(p.categoria_padre)===normGroup(name))p.categoria_padre='';
  }
  project.gruposPreparados=project.gruposPreparados.filter(g=>!matching.includes(g));render();persist();
  status('Categoría retirada del proyecto. Sus productos siguen disponibles para asignarlos a otro grupo.');
}
function renameCategory(oldName,name){
  name=String(name||'').trim();if(!name||name.length>120)throw Error('Indica un nombre de categoría de hasta 120 caracteres.');
  const oldDrafts=project.gruposPreparados.filter(g=>normGroup(g.nombre)===normGroup(oldName));
  for(const f of project.fotografias)for(const c of f.resultado?.categorias||[]){if(normGroup(c.nombre)===normGroup(oldName))c.nombre=name;if(normGroup(c.padre)===normGroup(oldName))c.padre=name;}
  for(const p of project.productos){
    if(normGroup(p.grupo_detectado)===normGroup(oldName)||oldDrafts.some(g=>p.idgrupo==='borrador:'+g.id)){p.grupo_detectado=name;p.idgrupo='';p.revisado=false;}
    if(normGroup(p.categoria_padre)===normGroup(oldName))p.categoria_padre=name;
  }
  project.gruposPreparados=project.gruposPreparados.filter(g=>!oldDrafts.includes(g));prepareGroup(name);assignDetected();render();persist();
}
function consume(result, photo) {
  if(project.productos.some(p=>p.foto===photo.id))throw Error('Esta fotografía ya tiene propuestas: se evitó duplicarlas. Conserva los productos y descarga el proyecto antes de volver a analizarla.');
  if(!result.bloques?.some(b=>typeof b.texto==='string'&&b.texto.trim())&&!result.ocr_lineas?.some(t=>typeof t==='string'&&t.trim()))
    throw Error('No se recibió texto OCR. La fotografía no se considera analizada; vuelve a intentarlo.');
  photo.resultado=result;photo.estado='lista';photo.error='';
  const incoming=MenuConsolidar.consolidar(result.productos.map(p=>({...p,id:uid(),foto:photo.id,fotoNombre:photo.nombre,clave:'',claveAutomatica:true,excluido:false}))).productos;
  for(const p of incoming)normalizePresentation(p);
  project.productos.push(...incoming);prepareNewGroups(incoming);suggestKeys();render();persist();
}
async function compress(file) { return RestauranteImagen.prepararImagen(file,{conDimensiones:true}); }

function busyState(value){busy=value;['file','analyze','interpret','projectFile','restore','mode','reorganizeText','askCorrection'].forEach(id=>$(id).disabled=value);render();}
function modRender() {
  $('modifiers').innerHTML=editMods.map((m,i)=>'<section class="mod"><div class="form-grid"><label>Nombre del grupo<input data-mod="'+i+'" data-field="nombre" value="'+esc(m.nombre)+'"></label>'+
    '<label>Elección<select data-mod="'+i+'" data-field="obligatorio"><option value="" '+(m.obligatorio===null?'selected':'')+'>Por confirmar</option><option value="si" '+(m.obligatorio===true?'selected':'')+'>Obligatoria</option><option value="no" '+(m.obligatorio===false?'selected':'')+'>Opcional</option></select></label>'+
    '<label>Mínimo<input type="number" min="0" step="1" data-mod="'+i+'" data-field="minimo" value="'+esc(m.minimo??'')+'"></label><label>Máximo<input type="number" min="1" step="1" data-mod="'+i+'" data-field="maximo" value="'+esc(m.maximo??'')+'"></label></div>'+
    m.opciones.map((o,j)=>'<div class="option"><label>Opción<input data-mod="'+i+'" data-option="'+j+'" data-field="nombre" value="'+esc(o.nombre)+'"></label><label>Precio ($)<input type="number" min="0" step="0.01" data-mod="'+i+'" data-option="'+j+'" data-field="precio" value="'+esc(o.precio??'')+'"></label><button type="button" class="light" data-remove-option="'+i+':'+j+'" aria-label="Eliminar opción">×</button></div>').join('')+
    '<div class="actions"><button type="button" class="light" data-add-option="'+i+'">+ Opción</button><button type="button" class="light" data-remove-mod="'+i+'">Quitar grupo</button></div></section>').join('')||'<p class="muted">Este producto no tiene opciones preparadas.</p>';
}
function openEditor(id) {
  const p=newProduct?.id===id?newProduct:project.productos.find(x=>x.id===id);if(!p)return;
  editing=id;editMods=structuredClone(p.modificadores);
  $('editorTitle').textContent=p.nombre||'Nuevo producto';$('editName').value=p.nombre;$('editPrice').value=p.precio??'';
  $('editKey').value=p.clave;$('editKey').dataset.automatic=p.claveAutomatica?'true':'false';$('editGroup').innerHTML=groupOptions(p.idgrupo);$('editType').value=p.tipo;$('editIngredients').value=p.ingredientes.join('\n');
  $('editReviewed').checked=p.revisado;$('editError').textContent='';
  const photo=project.fotografias.find(f=>f.id===p.foto), url=photo?fotoUrl(photo):'';
  $('sourcePhoto').innerHTML=url?'<img src="'+esc(url)+'" alt="Fotografía original del menú">':'<p class="muted">La imagen original permanece en tus archivos. El proyecto conserva su texto OCR.</p>';
  $('sourceText').textContent=photo?.resultado?.bloques.filter(b=>p.evidencia.includes(b.id)).map(b=>'['+(b.id+1)+'] '+b.texto).join('\n')||'Captura manual.';
  $('editWarnings').textContent=[...p.revision,p.duplicado].filter(Boolean).join(' · ');
  modRender();$('editor').showModal();
}
function validPrice(v){return v!==null&&v!==''&&/^\d+(?:\.\d{1,2})?$/.test(String(v))&&Number(v)<=9999999;}
function validate(p, reviewed) {
  const issues=[];
  if(!p.nombre.trim())issues.push('Indica el nombre.');
  if(reviewed){
    if(p.nombre.length>60)issues.push('Ajusta el nombre a 60 caracteres sin perder su significado.');
    if(!validPrice(p.precio))issues.push('Confirma el precio base con hasta dos decimales.');
    if(!p.idgrupo)issues.push('Asigna un grupo.');
    if(p.tipo==='con_opciones'&&!p.modificadores.length)issues.push('Agrega las opciones del producto.');
    if(p.modificadores.length&&p.tipo!=='con_opciones')issues.push('Selecciona «Producto con opciones».');
    for(const m of p.modificadores){
      if(!m.nombre||m.obligatorio===null||!Number.isInteger(m.minimo)||!Number.isInteger(m.maximo)||m.minimo<0||m.maximo<1||m.maximo<m.minimo||m.maximo>m.opciones.length||(m.obligatorio?m.minimo<1:m.minimo!==0))issues.push('Revisa nombre, obligatoriedad y límites de '+(m.nombre||'cada grupo')+'.');
      if(!m.opciones.length||m.opciones.some(o=>!o.nombre.trim()||!validPrice(o.precio)))issues.push('Cada opción necesita nombre y precio confirmados, incluyendo $0.');
      if(new Set(m.opciones.map(o=>norm(o.nombre))).size!==m.opciones.length)issues.push('Hay opciones repetidas dentro de '+m.nombre+'.');
    }
  }
  return [...new Set(issues)];
}
function summary() { window.MenuSQL.revisarImportacion(); }

function validateProject(d) {
  const restored=MenuProyecto.validarProyecto(d);
  for(const photo of restored.fotografias){
    if(photo.estado==='lista'&&photo.resultado&&!photo.resultado.bloques?.some(b=>b.texto?.trim())&&!photo.resultado.ocr_lineas?.some(t=>t?.trim())){
      photo.estado='error';photo.error='La versión anterior guardó esta foto con 0 líneas. Vuelve a adjuntarla para analizarla; se conserva el registro anterior.';
    }
  }
  for(const p of restored.productos){normalizePresentation(p);if(p.claveAutomatica!==true)p.claveAutomatica=false;}
  return restored;
}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
$('backup').onclick=backup;$('exportSummary').onclick=backup;
// Importador universal de paquetes de menú: no se escribe SQL hasta confirmar el lote.
$('importMenuZip').onclick=()=>$('zipMenuFile').click();
function base64FromFile(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(Error('No se pudo leer el ZIP en este dispositivo.'));
    reader.onload=()=>resolve(String(reader.result).split(',')[1]);
    reader.readAsDataURL(file);
  });
}
$('zipMenuFile').onchange=async()=>{
  const file=$('zipMenuFile').files?.[0];if(!file||busy)return;
  const button=$('importMenuZip');button.disabled=true;
  try{
    if(!/\.zip$/i.test(file.name)||file.size>8*1024*1024||file.size<22)throw Error('Elige un ZIP de menú Restaurante de máximo 8 MB. No se admite aquí el ZIP XML de Soft Restaurant.');
    const loaded=await api('/api/menu-paquetes/importar',{archivo:await base64FromFile(file)},55000);
    const next=validateProject(loaded.proyecto);
    if(project.productos.length||project.fotografias.length||project.gruposPreparados.length){
      if(!confirm('¿Cargar el menú «'+loaded.nombre+'»? Se descargará un respaldo JSON del borrador actual antes de reemplazarlo. No se cambiará nada en Soft Restaurant.'))return;
      backup();
    }
    files.forEach(f=>URL.revokeObjectURL(f.url));files.clear();transcriptDrafts.clear();
    project=next;selected.clear();cloudRevision=null;
    $('memoryPatterns').checked=project.memoriaActiva!==false;
    catalogo=[];grupos=[];connected=false;
    suggestKeys();render();persist();switchTab('revision');
    await catalog();
    const duplicatesCount=project.productos.filter(p=>p.duplicado||p.claveOcupada).length;
    status('Menú «'+loaded.nombre+'» cargado: '+loaded.productos+' productos; '+loaded.compuestos+' compuestos. '+(duplicatesCount?duplicatesCount+' coincidencias existentes en SQL. No se sustituyen automáticamente.':'Verifica el menú y guarda cuando estés listo.'),duplicatesCount>0);
  }catch(e){status('No se pudo importar el menú ZIP: '+e.message,true);}
  finally{button.disabled=false;$('zipMenuFile').value='';}
};
$('exportMenuZip').onclick=async()=>{
  if(!project.productos.length)return status('Primero prepara o abre un menú para exportarlo.',true);
  const button=$('exportMenuZip');button.disabled=true;
  try{
    const title=String(project.titulo||'Menú Restaurante').slice(0,120);
    const response=await fetch('/api/menu-paquetes/exportar',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-CSRF-Token':nonce},body:JSON.stringify({nombre:title,proyecto:project})});
    if(!response.ok){const error=await response.json().catch(()=>({error:'Error HTTP '+response.status}));throw Error(error.error||'No se pudo exportar.');}
    const url=URL.createObjectURL(await response.blob()),anchor=document.createElement('a');
    anchor.href=url;anchor.download='Restaurante_Menu_Portable.zip';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
    status('Menú guardado en ZIP portable. Contiene productos, grupos y modificadores, no fotos originales ni contraseñas.');
  }catch(e){status(e.message,true);}
  finally{button.disabled=false;}
};
$('restore').onclick=()=>$('projectFile').click();
$('projectFile').onchange=async()=>{
  const file=$('projectFile').files[0];if(!file)return;
  try{
    if(file.size>15000000)throw Error('El proyecto supera 15 MB.');
    const next=validateProject(JSON.parse(await file.text()));
    if(project.productos.length&&!confirm('¿Abrir este proyecto? Descarga primero el actual si quieres conservar ambos.'))return;
    files.forEach(f=>URL.revokeObjectURL(f.url));files.clear();project=next;$('memoryPatterns').checked=project.memoriaActiva!==false;selected.clear();suggestKeys();render();persist();switchTab('revision');status('Proyecto recuperado. Vuelve a consultar SQL para verificar claves y grupos.');
  }catch(e){status(e.message,true);}finally{$('projectFile').value='';}
};
function anexarFotos(input){
  const errors=[];
  for(const file of input.files){
    if(project.fotografias.length>=20){errors.push('Se admiten hasta 20 fotografías.');break;}
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>25000000){errors.push('Formato o tamaño no válido: '+file.name);continue;}
    const id=uid();files.set(id,{file,url:URL.createObjectURL(file)});project.fotografias.push({id,nombre:file.name,estado:'pendiente'});
  }
  input.value='';render();persist();status(errors.join(' ')||'Fotografías listas para analizar.',errors.length>0);
}
$('goGroupsFirst').onclick=()=>{switchTab('grupos');status('Puedes crear y guardar grupos en SQL antes de importar cualquier producto.');};
$('consolidateVariants').onclick=()=>{
  // Sólo transforma propuestas no importadas, agrupadas por menú/fotografía.
  const result=MenuConsolidar.consolidar(project.productos);
  if(!result.cambios&&!result.ambiguos)return status('No hay presentaciones de papas con nombres y precios suficientes para unir automáticamente.');
  try{localStorage.setItem(STORAGE+'-antes-unificar-'+Date.now(),JSON.stringify(project));}catch{backup();}
  project.productos=result.productos;selected.clear();prepareNewGroups(project.productos);suggestKeys();render();persist();
  status(result.cambios+' productos compuestos unificados en el borrador. '+(result.ambiguos?'Hay '+result.ambiguos+' conjuntos ambiguos bloqueados: comprueba las opciones.':'No se modificó SQL.'),!!result.ambiguos);
};
$('newMenu').onclick=()=>{
  if(!confirm('¿Comenzar un menú nuevo? Se conservará una copia JSON del borrador actual y NO se borrará ningún grupo ni producto de Soft Restaurant.'))return;
  if(project.productos.length||project.fotografias.length||project.gruposPreparados.length)backup();
  files.forEach(f=>URL.revokeObjectURL(f.url));files.clear();transcriptDrafts.clear();
  project={version:1,clasificacionEsquema:'sql11',productos:[],fotografias:[],gruposPreparados:[]};selected.clear();
  cloudRevision=null;project.memoriaActiva=false;persist();render();switchTab('fotos');
  status('Menú nuevo y limpio. Los grupos visibles en SQL se consultan en directo; los grupos anteriores se conservan sólo en el respaldo.');
};
$('cleanDraftGroups').onclick=()=>{
  const used=new Set(project.productos.filter(p=>!p.importado).map(p=>p.idgrupo));
  const fresh=project.gruposPreparados.filter(g=>used.has('borrador:'+g.id));
  const count=project.gruposPreparados.length-fresh.length;
  if(!count)return status('No hay grupos preparados sin productos activos. Usa «Nuevo menú» si vas a trabajar con otro restaurante.');
  try{localStorage.setItem(STORAGE+'-antes-limpiar-grupos-'+Date.now(),JSON.stringify(project));}catch{backup();}
  project.gruposPreparados=fresh;render();persist();status(count+' grupos sin productos asociados retirados del borrador. No se alteró SQL.');
};
$('file').onchange=()=>anexarFotos($('file'));
$('camera').onchange=()=>anexarFotos($('camera'));

// Proyectos compartidos por selección expresa. Jamás sustituyen sin permiso el borrador local.
let cloudRevision=null;
$('loadCloud').onclick=async()=>{
  try{const r=await api('/api/menu-nube');if(!r.existe)return status('Todavía no hay proyecto compartido. Guárdalo desde esta computadora o el teléfono.');
    const next=validateProject(r.proyecto);
    if((project.productos.length||project.fotografias.length)&&!confirm('Se sustituirá el borrador de ESTE dispositivo por el proyecto del servidor. Descárgalo antes si deseas guardar los cambios locales. ¿Continuar?'))return;
    for(const f of files.values())URL.revokeObjectURL(f.url);files.clear();project=next;$('memoryPatterns').checked=project.memoriaActiva!==false;cloudRevision=r.revision;selected.clear();suggestKeys();render();persist();switchTab('revision');
    status('Proyecto compartido recuperado. Las fotografías de esta versión también estarán disponibles para corregir si se guardaron en el servidor. Comprueba claves antes de importar.');
  }catch(e){status(e.message,true);}
};
$('saveCloud').onclick=async()=>{
  if(!confirm('¿Guardar este proyecto en el servidor para abrirlo desde otros dispositivos? No se escribirá ningún producto en SQL.'))return;
  try{const r=await api('/api/menu-nube',{proyecto:validateProject(project),revision:cloudRevision});cloudRevision=r.revision;status('Proyecto compartido guardado. Puedes abrirlo en la computadora o en el teléfono.');}
  catch(e){status(e.message+' Si alguien lo guardó desde otro dispositivo, descarga tu proyecto JSON antes de cargar el compartido.',true);}
};

$('gallery').onchange=async e=>{
  const input=e.target.closest('[data-reattach]');if(!input)return;
  const photo=project.fotografias.find(f=>f.id===input.dataset.reattach),file=input.files?.[0];if(!photo||!file)return;
  if(file.name!==photo.nombre&&!confirm('El archivo seleccionado tiene un nombre distinto al original. ¿Confirmas que corresponde EXACTAMENTE a esta fotografía?')){input.value='';return;}
  try{
    const prepared=await compress(file);
    await api('/api/menu-visual/fotos/'+photo.id,{mime:prepared.mime,imagen:prepared.imagen},35000);
    if(files.has(photo.id))URL.revokeObjectURL(files.get(photo.id).url);
    files.set(photo.id,{file,url:URL.createObjectURL(file)});
    photo.imagenGuardada=true;photo.ancho=prepared.ancho;photo.alto=prepared.alto;photo.avisoImagen='';
    render();persist();status('Fotografía original vinculada; ya puedes corregir sobre la imagen.');
  }catch(err){status('No se pudo conservar la imagen: '+err.message,true);}finally{input.value='';}
};
$('gallery').onclick=e=>{
  const v=e.target.closest('[data-open-visual]');if(v){window.MenuVisual.open(v.dataset.openVisual);return;}
  const b=e.target.closest('[data-remove-photo]');if(!b||busy)return;
  const id=b.dataset.removePhoto;
  if(project.productos.some(p=>p.foto===id)&&!confirm('¿Quitar esta foto y sus propuestas del proyecto?'))return;
  if(files.has(id))URL.revokeObjectURL(files.get(id).url);files.delete(id);
  project.fotografias=project.fotografias.filter(f=>f.id!==id);project.productos=project.productos.filter(p=>p.foto!==id);
  selected=new Set([...selected].filter(id=>project.productos.some(p=>p.id===id)));render();persist();
};
async function analizarFotos(queue){
  if(busy)return;
  if(!queue.length)return status('Agrega fotografías o recupera un trabajo pendiente. Las fotos ya analizadas se conservan.');
  busyState(true);$('progress').hidden=false;$('progress').max=queue.length;$('progress').value=0;
  let failures=0,completed=0;
  try{
    for(let i=0;i<queue.length;i++){
      const f=queue[i];f.estado='analizando';render();persist();status('Leyendo '+(i+1)+' de '+queue.length+' · '+f.nombre);
      try{
        const result=await analizarFotoRemota(f);
        if(f.estado!=='lista')consume(result,f);
        f.trabajo=null;f.servidorTrabajo=null;completed++;
      }catch(e){f.estado='error';f.error=e.message;failures++;persist();render();}
      // Progreso de análisis EXITOSOS, no de intentos terminados con error.
      $('progress').value=completed;
    }
  } finally{busyState(false);}
  switchTab(failures===queue.length?'fotos':'revision');
  if(completed)$('filter').value=project.productos.some(p=>!p.excluido&&!p.importado&&productIssues(p).length)?'pendientes':'todos';render();
  status('Resultado: '+completed+' fotografías analizadas; '+failures+' con error. '+(failures?'Pulsa Reintentar en cada foto o consulta su error completo.':'Revisa las propuestas antes de guardar.'),!!failures);
  $('progress').hidden=true;
}
$('analyze').onclick=()=>analizarFotos(project.fotografias.filter(f=>f.estado!=='lista'&&(files.has(f.id)||f.imagenGuardada||f.servidorTrabajo)));
$('gallery').addEventListener('click',e=>{
  const b=e.target.closest('[data-retry-photo]');if(!b||busy)return;
  const f=project.fotografias.find(x=>x.id===b.dataset.retryPhoto);
  if(f&&f.estado==='error')analizarFotos([f]);
});

$('interpret').onclick=async()=>{
  if(!$('ocrText').value.trim())return status('Pega primero el texto del menú.');
  busyState(true);
  try{const result=await api('/api/menu-ia/interpretar',{lineas:$('ocrText').value.split(/\r?\n/),grupos});
    const f={id:uid(),nombre:'Texto OCR '+(project.fotografias.length+1),estado:'lista'};project.fotografias.push(f);consume(result,f);switchTab('revision');status('Texto interpretado. Revisa nombres, precios y opciones.');}
  catch(e){status(e.message,true);}finally{busyState(false);}
};
$('checkOcr').onclick=async()=>{
  const b=$('checkOcr');b.disabled=true;$('ocrState').textContent='Comprobando Python y las bibliotecas…';
  try{const d=await api('/api/menu-ia/ocr-estado');$('ocrState').textContent='Python '+d.python+' · PaddleOCR '+d.paddleocr+' · PaddlePaddle '+d.paddlepaddle+'. La lectura de una foto debe probarse por separado.';}
  catch(e){$('ocrState').textContent=e.message;}finally{b.disabled=false;}
};
$('refreshCatalog').onclick=catalog;
$('diagnostic').onclick=async()=>{
  const b=$('diagnostic');b.disabled=true;status('Consultando metadatos SQL…');
  try{const d=await api('/api/menu-admin/estructura');download('Restaurante_Estructura_Menu.json',d);status(d.completo?'Diagnóstico descargado. No se escribió en SQL.':'Diagnóstico descargado, pero faltan permisos para asegurar que esté completo.',!d.completo);}
  catch(e){status(e.message,true);}finally{b.disabled=false;}
};
$('prepareGroups').onclick=()=>{try{for(const c of categories())if(c.estado==='faltante')prepareGroup(c.nombre);render();persist();status('Grupos preparados en el proyecto; no se crearon en SQL.');}catch(e){status(e.message,true);}};
$('categoryList').onclick=e=>{
  const remove=e.target.closest('[data-remove-category]'),rename=e.target.closest('[data-rename-category]');
  if(remove)removeCategory(remove.dataset.removeCategory);
  if(rename)try{renameCategory(rename.dataset.renameCategory,rename.closest('.group').querySelector('input').value);}catch(err){status(err.message,true);}
};
$('draftGroups').onchange=e=>{const el=e.target.closest('[data-group-class]');if(!el)return;const g=project.gruposPreparados.find(g=>g.id===el.dataset.groupClass);if(g){g.clasificacion=Number(el.value);persist();}};
$('draftGroups').onclick=e=>{const b=e.target.closest('[data-remove-draft]');if(b){const g=project.gruposPreparados.find(g=>g.id===b.dataset.removeDraft);if(g)removeCategory(g.nombre);}};
$('newGroup').oninput=()=>{$('newGroupClass').value=String(suggestedClass($('newGroup').value));};
$('groupForm').onsubmit=e=>{e.preventDefault();try{prepareGroup($('newGroup').value,Number($('newGroupClass').value));$('newGroup').value='';$('newGroupClass').value='1';render();persist();status('Grupo preparado, sin duplicar nombres conocidos.');}catch(e){status(e.message,true);}};
$('search').oninput=render;$('filter').onchange=render;
$('selectVisible').onclick=()=>{filtered().forEach(p=>selected.add(p.id));render();};
$('productList').onchange=e=>{if(e.target.dataset.select){if(e.target.checked)selected.add(e.target.dataset.select);else selected.delete(e.target.dataset.select);$('selectionCount').textContent=selected.size+' seleccionados';}};
$('productList').onclick=e=>{
  const visual=e.target.closest('[data-visual-product]');if(visual){window.MenuVisual.open(visual.dataset.visualProduct);return;}
  const toggle=e.target.closest('[data-toggle]');
  if(toggle){const p=project.productos.find(p=>p.id===toggle.dataset.toggle);if(p&&!p.importado){p.excluido=!p.excluido;render();persist();}return;}
  const b=e.target.closest('[data-edit]');if(b)openEditor(b.dataset.edit);
};
$('generateKeys').onclick=()=>{suggestKeys({regenerate:true});render();persist();status('Claves automáticas actualizadas. Se conservaron las claves escritas manualmente.');};
$('includeAll').onclick=()=>{project.productos.forEach(p=>{if(!p.importado)p.excluido=false;});render();persist();};
$('discardAll').onclick=()=>{project.productos.forEach(p=>{if(!p.importado)p.excluido=true;});render();persist();};
$('editKey').oninput=()=>{$('editKey').dataset.automatic='false';};
$('editGenerateKey').onclick=()=>{
  const p=newProduct?.id===editing?newProduct:project.productos.find(p=>p.id===editing);
  if(!p)return;
  const used=new Set([...catalogo.map(x=>String(x.idproducto).trim().toUpperCase()),...project.productos.filter(x=>x.id!==p.id).map(x=>String(x.clave||'').toUpperCase())]);
  for(let n=1;n<=999999;n++){const key=String(n).padStart(6,'0');if(!used.has(key)){$('editKey').value=key;$('editKey').dataset.automatic='true';break;}}
};
$('applyGroup').onclick=()=>{const group=$('bulkGroup').value;if(!group||!selected.size)return status('Selecciona productos y elige un grupo.');project.productos.forEach(p=>{if(selected.has(p.id)){p.idgrupo=group;p.revisado=false;}});suggestKeys();render();persist();status('Grupo asignado a la selección. Se conservaron las claves ya editadas.');};
$('exclude').onclick=()=>{project.productos.forEach(p=>{if(selected.has(p.id))p.excluido=!p.excluido;});selected.clear();render();persist();};
$('reviewImport').onclick=summary;
$('manualProduct').onclick=()=>{
  const p={id:uid(),nombre:'',precio:null,idgrupo:'',grupo_detectado:'',categoria_padre:'',tipo:'independiente',modificadores:[],ingredientes:[],evidencia:[],revision:[],clave:'',claveAutomatica:true,revisado:false,excluido:false};
  newProduct=p;openEditor(p.id);
};
$('evidence').onclick=e=>{
  const b=e.target.closest('[data-from-evidence]');if(!b)return;
  const f=project.fotografias.find(f=>f.id===b.dataset.fromEvidence),block=f?.resultado?.bloques.find(x=>x.id===Number(b.dataset.block));if(!block)return;
  $('manualProduct').onclick();newProduct.foto=f.id;newProduct.fotoNombre=f.nombre;newProduct.evidencia=[block.id];newProduct.revision=['Producto recuperado desde texto pendiente: confirma nombre y precio con la foto.'];
  $('editName').value=block.texto;$('sourceText').textContent=block.texto;$('editWarnings').textContent=newProduct.revision[0];
};
$('editor').addEventListener('close',()=>{newProduct=null;editing=null;});
$('editForm').addEventListener('input',e=>{if(e.target.id!=='editReviewed')$('editReviewed').checked=false;});
$('editForm').addEventListener('change',e=>{if(e.target.id!=='editReviewed')$('editReviewed').checked=false;});
$('addModifier').onclick=()=>{editMods.push({nombre:'',obligatorio:null,minimo:null,maximo:null,opciones:[],origen:'Captura manual'});$('editReviewed').checked=false;modRender();};
$('modifiers').onchange=e=>{
  const el=e.target;if(el.dataset.mod===undefined)return;
  let target=editMods[Number(el.dataset.mod)];if(el.dataset.option!==undefined)target=target.opciones[Number(el.dataset.option)];
  const field=el.dataset.field;target[field]=field==='obligatorio'?(el.value===''?null:el.value==='si'):['precio','minimo','maximo'].includes(field)?(el.value===''?null:Number(el.value)):el.value;
  $('editReviewed').checked=false;
};
$('modifiers').onclick=e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.addOption!==undefined)editMods[Number(b.dataset.addOption)].opciones.push({nombre:'',precio:null,evidencia:[]});
  if(b.dataset.removeMod!==undefined)editMods.splice(Number(b.dataset.removeMod),1);
  if(b.dataset.removeOption!==undefined){const [i,j]=b.dataset.removeOption.split(':').map(Number);editMods[i].opciones.splice(j,1);}
  $('editReviewed').checked=false;modRender();
};
$('editForm').onsubmit=e=>{
  e.preventDefault();const current=newProduct?.id===editing?newProduct:project.productos.find(p=>p.id===editing);if(!current)return;
  const p={...current,nombre:$('editName').value.trim(),precio:$('editPrice').value===''?null:Number($('editPrice').value),clave:$('editKey').value.trim(),claveAutomatica:$('editKey').dataset.automatic==='true',
    idgrupo:$('editGroup').value,tipo:$('editType').value,ingredientes:$('editIngredients').value.split('\n').filter(Boolean),modificadores:structuredClone(editMods),revisado:$('editReviewed').checked};
  const errors=validate(p,p.revisado);if(errors.length){$('editError').textContent=errors.join(' ');return;}
  if($('editKey').value.trim()!==current.clave && $('editKey').dataset.automatic!=='true')p.claveAutomatica=false;
  if(p.nombre!==current.nombre)p.nombreOriginalAutomatico=false;
  if(p.precio!==current.precio)p.precioManualConfirmado=true;
  if(p.revisado)p.necesitaConfirmacion=false;
  Object.assign(current,p);
  if(newProduct?.id===editing){
    project.productos.push(current);
    const result=project.fotografias.find(f=>f.id===p.foto)?.resultado;
    if(result){for(const b of result.bloques)if(p.evidencia.includes(b.id))b.uso=[...new Set([...b.uso,'producto_manual'])];result.pendientes=result.pendientes.filter(b=>!p.evidencia.includes(b.id));}
  }
  suggestKeys();$('editor').close();render();persist();status('Producto actualizado. No se modificó SQL.');
};
async function mostrarGemini() {
  const el=$('geminiAvailability');
  if(!['captura','gemini','guiado'].includes($('mode').value)){el.textContent='OCR local seleccionado: el análisis de fotos no utiliza la API de Google.';return;}
  el.textContent='Comprobando modelos gratuitos disponibles para tu clave…';
  try{
    const d=await api('/api/menu-ia/gemini-estado',undefined,22000);
    el.textContent=d.disponible?
      'Modelos anunciados por Google con nivel gratuito: '+d.modelos.join(', ')+'. El sistema probará el primero compatible. Mantén la facturación desactivada en Google AI Studio.':
      'Gemini no disponible: '+(d.error||'No hay un modelo gratuito identificado')+' Se utilizará PaddleOCR cuando falte disponibilidad.';
  }catch(e){el.textContent='No se pudo consultar Gemini: '+e.message+'. Puedes utilizar OCR local.';}
}
$('mode').addEventListener('change',mostrarGemini);
function photoTranscription(f){return f?.resultado?.transcripcion||f?.resultado?.lineasTranscritas?.join('\n')||f?.resultado?.ocr_lineas?.map(x=>typeof x==='string'?x:x.texto).join('\n')||f?.resultado?.bloques?.map(b=>b.texto).join('\n')||'';}
function renderCaptureUi(){
  const photos=project.fotografias.filter(f=>f.resultado);
  for(const id of ['transcriptPhoto','correctionPhoto']){
    const el=$(id),previous=el.value;
    el.innerHTML=photos.length?photos.map(f=>'<option value="'+esc(f.id)+'">'+esc(f.nombre)+'</option>').join(''):'<option value="">Sin fotografías analizadas</option>';
    if(photos.some(f=>f.id===previous))el.value=previous;
    else if(!photos.length)el.value='';
  }
  const f=photos.find(f=>f.id===$('transcriptPhoto').value);
  if($('transcriptText').dataset.photo!==f?.id){
    $('transcriptText').dataset.photo=f?.id||'';
    $('transcriptText').value=f?(transcriptDrafts.get(f.id)??photoTranscription(f)):'';
  }
  $('transcriptSource').textContent=f?'Lectura: '+(f.resultado.fuente||'OCR')+' · '+(f.resultado.productos?.length||0)+' productos propuestos.':'Primero utiliza «Analizar menú completo».';
}
function setCorrectionPreview(message){$('correctionPreview').textContent=message;}
$('transcriptPhoto').onchange=()=>{ $('transcriptText').dataset.photo='';renderCaptureUi(); };
$('transcriptText').oninput=()=>{const id=$('transcriptPhoto').value;if(id)transcriptDrafts.set(id,$('transcriptText').value);};
$('seeProducts').onclick=()=>switchTab('revision');
$('reorganizeText').onclick=async()=>{
  const f=project.fotografias.find(f=>f.id===$('transcriptPhoto').value),texto=$('transcriptText').value;
  if(!f||!texto.trim())return status('Primero elige una fotografía con transcripción.',true);
  if(project.productos.some(p=>p.foto===f.id&&p.importado))return status('Este menú ya tiene productos importados. No se sustituyen automáticamente.',true);
  if(!confirm('Se volverán a crear las propuestas de ESTA fotografía desde el texto. Se conservará un respaldo del proyecto anterior. ¿Continuar?'))return;
  busyState(true);
  try{
    const r=await api('/api/menu-captura/organizar',{texto,grupos},45000);
    const old=JSON.stringify(project);
    try{localStorage.setItem(STORAGE+'-antes-reorganizar-'+Date.now(),old);}catch{download('Respaldo_Restaurante_antes_de_reorganizar.json',project);}
    project.productos=project.productos.filter(p=>p.foto!==f.id);
    f.resultado=null;consume({...r,fuente:'organizado_desde_texto'},f);
    transcriptDrafts.delete(f.id);$('transcriptText').dataset.photo='';
    $('filter').value=project.productos.some(p=>p.foto===f.id&&productIssues(p).length)?'pendientes':'todos';render();switchTab('revision');status('Texto reorganizado. Revisa los productos dudosos; no se modificó SQL.');
  }catch(e){status(e.message,true);}finally{busyState(false);}
};
$('correctionPhoto').onchange=()=>{proposedChanges=[];proposedPhotoId='';setCorrectionPreview('');};
$('askCorrection').onclick=async()=>{
  const f=project.fotografias.find(f=>f.id===$('correctionPhoto').value),ins=$('correctionInstruction').value.trim();
  proposedChanges=[];proposedPhotoId='';
  if(!f||!ins)return setCorrectionPreview('Elige una fotografía y describe qué debe corregirse.');
  const products=project.productos.filter(p=>p.foto===f.id&&!p.importado&&!p.revisado).map(p=>({id:p.id,nombre:p.nombre,precio:p.precio,grupo_detectado:p.grupo_detectado,ingredientes:p.ingredientes}));
  if(!products.length)return setCorrectionPreview('No hay productos pendientes de esta fotografía que puedan modificarse.');
  $('askCorrection').disabled=true;setCorrectionPreview('Solicitando propuesta a Gemini (no se aplicará sin tu autorización)…');
  try{
    const d=await api('/api/menu-captura/sugerir',{instruccion:ins,transcripcion:photoTranscription(f).slice(0,25000),productos:products},105000);
    proposedChanges=d.cambios;proposedPhotoId=f.id;
    const labels={nombre:'Nombre',precio:'Precio',categoria:'Categoría',descripcion:'Descripción',modificador:'Modificador',quitar:'Descartar'};
    $('correctionPreview').innerHTML='<h4>Propuesta de Gemini · aún sin aplicar</h4>'+
      (d.cambios.length?'<ul>'+d.cambios.map(c=>'<li><b>'+esc(products.find(p=>p.id===c.id)?.nombre||c.id)+'</b>: '+esc(labels[c.campo]||c.campo)+' → '+esc(String(c.valor))+'</li>').join('')+'</ul><button id="applyCorrections" type="button">Confirmar estos cambios</button>':'<p>Gemini no encontró modificaciones justificadas.</p>');
  }catch(e){setCorrectionPreview(e.message);}finally{$('askCorrection').disabled=false;}
};
$('correctionPreview').onclick=e=>{
  if(e.target.id!=='applyCorrections'||!proposedChanges.length)return;
  const f=project.fotografias.find(f=>f.id===proposedPhotoId);
  if(!f||!confirm('¿Aplicar estas '+proposedChanges.length+' correcciones AL BORRADOR? No se cambiará SQL.'))return;
  const allowed=new Set(['nombre','precio','categoria','descripcion','modificador','quitar']);
  try{
    for(const c of proposedChanges){
      if(!allowed.has(c.campo))throw Error('Tipo de corrección desconocido.');
      const p=project.productos.find(p=>p.id===c.id&&p.foto===f.id);
      if(!p||p.importado||p.revisado)throw Error('Producto ya confirmado o modificado desde que se pidió la propuesta.');
    }
    try{localStorage.setItem(STORAGE+'-antes-correccion-'+Date.now(),JSON.stringify(project));}catch{}
    for(const c of proposedChanges){const p=project.productos.find(p=>p.id===c.id);
      if(c.campo==='nombre')p.nombre=String(c.valor);
      if(c.campo==='precio')p.precio=Number(c.valor);
      if(c.campo==='categoria'){p.grupo_detectado=String(c.valor);p.idgrupo='';}
      if(c.campo==='descripcion')p.ingredientes=[String(c.valor)];
      if(c.campo==='modificador'){p.opcionesVisualesPendientes=p.opcionesVisualesPendientes||[];p.opcionesVisualesPendientes.push({marcaId:'corr-'+uid(),tipo:'modificador',texto:String(c.valor)});}
      if(c.campo==='quitar')p.excluido=true;
      p.revisado=false;p.necesitaConfirmacion=true;p.revision=[...new Set([...(p.revision||[]),'Corrección por IA: comprobar antes de importar.'])];
    }
    prepareNewGroups(project.productos.filter(p=>p.foto===f.id));suggestKeys();render();persist();
    setCorrectionPreview('Correcciones aplicadas al borrador. Revisa los datos afectados antes de importar.');
    proposedChanges=[];proposedPhotoId='';
  }catch(e){setCorrectionPreview(e.message);}
};
async function init() {
  let saved='',recovered=0;
  try{
    saved=localStorage.getItem(STORAGE)||'';
    if(saved){
      project=validateProject(JSON.parse(saved));
      // Migración no destructiva: corregir variantes del borrador previo y
      // guardar una copia original ANTES de reemplazarlo.
      const fixed=MenuConsolidar.consolidar(project.productos);
      if(fixed.cambios){
        try{localStorage.setItem(STORAGE+'-antes-unificar-'+Date.now(),saved);}catch{download('Respaldo_Menu_Anterior.json',project);}
        project.productos=fixed.productos;recovered=fixed.cambios;persist();
      }
    }
  }catch{protectedDraft=saved;status('El borrador anterior tiene datos incompletos. Se conserva sin sobrescribir para recuperarlo.',true);$('savedState').textContent='Borrador anterior protegido.';}
  loadGuideColors();modeGuide();
  $('memoryPatterns').checked=project.memoriaActiva!==false;
  $('memoryPatterns').onchange=()=>{project.memoriaActiva=$('memoryPatterns').checked;persist();};
  window.MenuVisual.init({getProject:()=>project,setProject:v=>{project=v;},getGroups:()=>grupos,getImage:fotoUrl,changed:()=>{suggestKeys();render();persist();},message:status,api});
  suggestKeys();render();
  try{const s=await api('/api/v9/session');nonce=s.nonce||'';if(!s.user)throw Error('Inicia sesión desde el inicio del negocio y vuelve a esta pantalla.');if(s.user.role!=='dueno')throw Error('Entra con una cuenta de dueño para administrar menús.');status(recovered?('Se recuperaron '+recovered+' productos compuestos del borrador anterior. Confirma precios antes de guardar en SQL.'):'Listo para preparar tu menú. El proyecto se conserva en este navegador.');mostrarGemini();await catalog();if(connected)await window.MenuSQL?.comprobar();await window.MenuSQL?.recuperarOperacion();}
  catch(e){status(e.message,true);}
}
// Colores del proyecto: editables, independientes de categorías en SQL.
const GUIA_DEFECTO=Object.freeze({categoria:'#e53935',producto:'#facc15',descripcion:'#2563eb',precio:'#16a34a',ignorar:'#6b7280'});
function readGuideColors(){return Object.fromEntries([...document.querySelectorAll('[data-guide-color]')].map(x=>[x.dataset.guideColor,x.value]));}
function loadGuideColors(){const values={...GUIA_DEFECTO,...(project.coloresGuia||{})};
  document.querySelectorAll('[data-guide-color]').forEach(x=>{x.value=/^#[0-9a-f]{6}$/i.test(values[x.dataset.guideColor])?values[x.dataset.guideColor]:GUIA_DEFECTO[x.dataset.guideColor];});
}
function modeGuide(){const enabled=$('mode').value==='guiado';$('colorGuideConfig').hidden=!enabled;if(enabled)$('colorGuideConfig').open=true;if(nonce)mostrarGemini();}
$('mode').addEventListener('change',modeGuide);
document.querySelectorAll('[data-guide-color]').forEach(input=>input.addEventListener('change',()=>{
  const values=readGuideColors();if(new Set(Object.values(values)).size!==5){status('Los 5 tipos deben tener colores distintos. Ajusta los colores antes de analizar.',true);return;}
  project.coloresGuia=values;persist();
}));
$('restoreGuideColors').onclick=()=>{project.coloresGuia={...GUIA_DEFECTO};loadGuideColors();persist();status('Se restauraron los colores guía.');};
init();
