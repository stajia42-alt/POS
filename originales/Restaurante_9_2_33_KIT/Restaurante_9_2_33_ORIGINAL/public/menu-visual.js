'use strict';
// Editor visual de correcciones: nunca llama a SQL ni cambia productos importados.
(function(root){
  const Core=root.MenuVisualLogica;
  let cfg=null,current=null,selected=null,zoom=1,drawStart=null,linking=false,preset=null,presetPointer=null,presetEdited=false,reading=false;
  const undo=[],redo=[];const el=id=>document.getElementById(id);
  const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const TYPES={categoria:'Categoría',producto:'Producto',precio:'Precio',descripcion:'Descripción',ignorar:'Ignorar',modificador:'Modificador',componente:'Componente'};
  const CSS={categoria:'#e53935',producto:'#eab308',precio:'#16a34a',descripcion:'#2563eb',ignorar:'#6b7280',modificador:'#9333ea',componente:'#0891b2'};
  function foto(){return cfg.getProject().fotografias.find(f=>f.id===current);}
  function block(){return foto()?.resultado?.bloques?.find(b=>b.id===selected);}
  function imagesrc(f){return cfg.getImage(f);}
  function report(msg,err=false){el('visualMsg').textContent=msg;el('visualMsg').classList.toggle('error',err);}
  function snapshot(){undo.push(structuredClone(cfg.getProject()));if(undo.length>16)undo.shift();redo.length=0;}
  function undoRedo(isRedo=false){const from=isRedo?redo:undo,to=isRedo?undo:redo;if(!from.length)return;to.push(structuredClone(cfg.getProject()));cfg.setProject(from.pop());selected=null;paint();cfg.changed();}
  function save(run){
    try{snapshot();const v=run();cfg.changed();paint();return v;}
    catch(e){cfg.setProject(undo.pop());paint();report(e.message,true);return null;}
  }
  function coords(b,f){
    if(Array.isArray(b.rectVisual)&&b.rectVisual.length===4)return b.rectVisual;
    if(!Array.isArray(b.caja)||!Number.isFinite(f.ancho)||!Number.isFinite(f.alto)||f.ancho<=0||f.alto<=0)return null;
    const [x1,y1,x2,y2]=b.caja;
    const r=[x1/f.ancho,y1/f.alto,(x2-x1)/f.ancho,(y2-y1)/f.alto];
    try{return Core.rectangle(r);}catch{return null;}
  }
  function renderPreset(){
    const active=!!preset;
    el('visualPresetLayer').hidden=!active;
    el('visualPresetPanel').hidden=!active;
    if(!active)return;
    const [x,y,w,h]=preset.rect,box=el('visualPresetBox');
    box.style.left=(x*100)+'%';box.style.top=(y*100)+'%';
    box.style.width=(w*100)+'%';box.style.height=(h*100)+'%';
    box.style.setProperty('--preset-color',CSS[preset.tipo]);
    el('visualPresetBadge').textContent=TYPES[preset.tipo];
    el('visualPresetHeading').textContent=(preset.markerId?'Editar cuadro guardado · ':'Nuevo cuadro · ')+TYPES[preset.tipo];
    el('visualPresetDelete').hidden=!preset.markerId;
  }
  function detectPresetText(){
    if(!preset||presetEdited)return;
    const hit=Core.sugerirBloqueEnRecuadro(cfg.getProject(),current,preset.rect);
    preset.hitId=hit?hit.id:null;
    el('visualPresetText').value='';
    el('visualPresetHint').textContent=hit?'Texto recuperado del OCR. Puedes corregirlo antes de guardar.':'Puedes guardar este cuadro sin texto. Quedará visible como pendiente para completarlo más tarde.';
  }
  function cancelPreset(){preset=null;presetPointer=null;presetEdited=false;el('visualPresetText').value='';renderPreset();}
  function addPreset(tipo){
    if(!imagesrc(foto()))return report('La fotografía no está disponible. En un proyecto antiguo utiliza «Vincular foto original».',true);
    // Al agregar otro cuadro, conservar automáticamente el anterior, incluso sin texto.
    if(preset&&storePreset({silencioso:true})===null)return;
    if(el('visualDraw').checked)el('visualDraw').checked=false;
    const count=Core.marcas(cfg.getProject(),current).filter(m=>m.tipo===tipo).length+
      (foto().resultado?.bloques||[]).filter(b=>b.tipoVisual===tipo&&b.rectVisual).length;
    preset={tipo,rect:Core.recuadroListo(tipo,count),hitId:null,markerId:null};presetEdited=false;
    paint();detectPresetText();el('visualPresetBox').focus({preventScroll:true});
    report('Cuadro '+TYPES[tipo].toLowerCase()+' listo. Muévelo y pulsa «Guardar cuadro» arriba de la fotografía.');
  }
  function editMark(id){
    if(preset&&storePreset({silencioso:true})===null)return;
    const mark=Core.marcas(cfg.getProject(),current).find(m=>m.id===id);
    if(!mark)return report('No se encontró el cuadro guardado.',true);
    preset={tipo:mark.tipo,rect:[...mark.rect],hitId:null,markerId:id};presetEdited=false;selected=null;
    paint();detectPresetText();
    if(mark.textoLeido){el('visualPresetHint').textContent='Texto leído por IA: '+mark.textoLeido+'. Puedes usar «Releer cuadro seleccionado».';}
    report('Editando cuadro guardado. Puedes moverlo, cambiar su tamaño o completar su texto.');
  }
  function presetDown(e){
    if(!preset||e.button!==0)return;
    const stage=el('visualStage').getBoundingClientRect();
    if(!stage.width||!stage.height)return;
    presetPointer={id:e.pointerId,x:e.clientX,y:e.clientY,rect:[...preset.rect],width:stage.width,height:stage.height,resize:!!e.target.closest('#visualPresetResize')};
    el('visualPresetBox').setPointerCapture(e.pointerId);e.preventDefault();
  }
  function presetMove(e){
    if(!presetPointer||e.pointerId!==presetPointer.id||!preset)return;
    const dx=(e.clientX-presetPointer.x)/presetPointer.width,dy=(e.clientY-presetPointer.y)/presetPointer.height;
    preset.rect=Core.moverRecuadro(presetPointer.rect,dx,dy,presetPointer.resize);
    renderPreset();e.preventDefault();
  }
  function presetEnd(e){
    if(!presetPointer||e.pointerId!==presetPointer.id)return;
    presetPointer=null;detectPresetText();
  }
  function presetKeyboard(e){
    if(!preset||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;
    const dist=e.altKey?.002:.012;
    const dx=e.key==='ArrowLeft'?-dist:e.key==='ArrowRight'?dist:0;
    const dy=e.key==='ArrowUp'?-dist:e.key==='ArrowDown'?dist:0;
    preset.rect=Core.moverRecuadro(preset.rect,dx,dy,e.shiftKey);
    renderPreset();detectPresetText();e.preventDefault();
  }
  function storePreset({silencioso=false}={}){
    if(!preset)return null;
    // El OCR sugerido no es captura manual; sólo usar texto si el usuario lo escribió expresamente.
    const text=presetEdited?el('visualPresetText').value.trim():'';
    const {tipo,rect,hitId,markerId}=preset;
    const group=el('visualGroup').value,product=el('visualProduct').value||null;
    const id=save(()=>{
      if(!text)return Core.guardarMarca(cfg.getProject(),current,rect,tipo,{id:markerId||null});
      const value=Core.guardarRecuadro(cfg.getProject(),current,rect,tipo,text,{idBloque:hitId,grupo:group,idProducto:product,gruposExistentes:cfg.getGroups()});
      if(tipo==='precio'&&product)Core.vincularPrecio(cfg.getProject(),current,product,value);
      if(markerId)Core.borrarMarca(cfg.getProject(),current,markerId);
      return value;
    });
    if(id===null)return null;
    cancelPreset();selected=text?id:null;paint();
    if(!silencioso)report(text?'Cuadro corregido manualmente. Puedes agregar más.':'Cuadro guardado. Usa «Leer todos los cuadros con IA» para que Restaurante lea el texto automáticamente.');
    return id;
  }
  function deletePreset(){
    if(!preset?.markerId)return cancelPreset();
    const id=preset.markerId;
    const ok=save(()=>Core.borrarMarca(cfg.getProject(),current,id));
    if(ok!==null){cancelPreset();paint();report('Cuadro pendiente eliminado. Los otros cuadros permanecen intactos.');}
  }
  function paint(){
    const f=foto();if(!f)return;
    el('visualHeading').textContent='Corregir · '+f.nombre;
    const src=imagesrc(f),img=el('visualImage');
    if(src){img.hidden=false;img.src=src;el('visualUnavailable').hidden=true;}
    else{img.hidden=true;el('visualUnavailable').hidden=false;}
    el('visualDraw').disabled=!src;if(!src)el('visualDraw').checked=false;
    el('visualDialog').querySelectorAll('[data-preset]').forEach(b=>b.disabled=!src||reading);
    for(const id of ['visualReadAll','visualReadPending','visualReadSelected'])el(id).disabled=!src||reading||(!Core.marcas(cfg.getProject(),current).length&&!preset);
    el('visualStage').style.width=(zoom*100)+'%';
    el('visualZoomValue').textContent=Math.round(zoom*100)+'%';
    const blocks=f.resultado?.bloques||[];
    const marks=Core.marcas(cfg.getProject(),current);
    el('visualRegions').innerHTML=marks.filter(m=>m.id!==preset?.markerId).map(m=>{
      const [x,y,w,h]=m.rect;
      return `<button type="button" class="visual-mark" data-vis-mark="${E(m.id)}" style="left:${x*100}%;top:${y*100}%;width:${w*100}%;height:${h*100}%;--region-color:${CSS[m.tipo]}" title="Editar cuadro ${E(TYPES[m.tipo])}" aria-label="Editar cuadro ${E(TYPES[m.tipo])}"><span>${E(TYPES[m.tipo])}</span></button>`;
    }).join('')+blocks.map(b=>{const r=coords(b,f);if(!r)return '';
      const [x,y,w,h]=r;const kind=b.tipoVisual||(f.resultado.categorias.some(c=>c.evidencia?.includes(b.id))?'categoria':'sin_clasificar');
      return `<button type="button" class="visual-region ${b.id===selected?'picked':''}" data-vis-block="${b.id}" style="left:${x*100}%;top:${y*100}%;width:${w*100}%;height:${h*100}%;--region-color:${CSS[kind]||'#7c8892'}" title="${E(b.texto)}" aria-label="Seleccionar ${E(b.texto)}"></button>`;
    }).join('');
    el('visualSavedArea').hidden=!marks.length;
    el('visualSavedCount').textContent=marks.length+' cuadro'+(marks.length===1?'':'s')+' · '+marks.filter(m=>m.estadoLectura==='leido').length+' leído(s) · '+marks.filter(m=>m.estadoLectura==='dudoso').length+' dudoso(s)';
    el('visualSavedList').innerHTML=marks.map((m,i)=>`<button type="button" data-edit-mark="${E(m.id)}" class="visual-saved-button" style="--preset-color:${CSS[m.tipo]}">${i+1}. ${E(TYPES[m.tipo])}<small>${m.estadoLectura==='leido'?'✓ '+E(m.textoLeido||'Leído'):m.estadoLectura==='dudoso'?'⚠ Revisar lectura':'Pendiente de IA'}</small></button>`).join('');
    el('visualBlocks').innerHTML=blocks.map(b=>`<button type="button" class="visual-line ${b.id===selected?'picked':''}" data-block="${b.id}"><span>${E(b.texto)}</span><small>${E(TYPES[b.tipoVisual]||'Sin confirmar')}${coords(b,f)?' · en imagen':''}</small></button>`).join('')||'<p>No hay líneas. Marca una zona en la foto.</p>';
    const b=block();el('visualSelected').textContent=b?`Seleccionado: ${b.texto}`:'Toca un recuadro o una línea del análisis para corregir.';
    el('visualType').value=b?.tipoVisual||'producto';
    const products=cfg.getProject().productos.filter(p=>p.foto===f.id&&!p.importado);
    const last=el('visualProduct').value;
    el('visualProduct').innerHTML='<option value="">Elegir producto para asociar precio…</option>'+products.map(p=>`<option value="${E(p.id)}">${E(p.nombre)} · ${p.precio===null?'Sin precio':'$'+p.precio}${p.opcionesVisualesPendientes?.length?' · Opciones pendientes: '+p.opcionesVisualesPendientes.length:''}</option>`).join('');
    if(products.some(p=>p.id===last))el('visualProduct').value=last;
    el('visualApply').disabled=!b;
    el('visualLink').disabled=!b||!el('visualProduct').value;
    el('visualUndo').disabled=!undo.length;el('visualRedo').disabled=!redo.length;
    el('visualRegions').classList.toggle('drawing',el('visualDraw').checked);
    el('visualDrawLayer').hidden=!el('visualDraw').checked;
    el('visualGroup').innerHTML='<option value="">Dejar grupo por asignar</option>'+cfg.getGroups().map(g=>`<option value="${E(g.descripcion)}">${E(g.descripcion)}</option>`).join('')+cfg.getProject().gruposPreparados.map(g=>`<option value="${E(g.nombre)}">${E(g.nombre)} · preparado</option>`).join('');
    renderPreset();
  }
  function open(id){
    const f=cfg.getProject().fotografias.find(x=>x.id===id);
    if(!f?.resultado){cfg.message('Analiza primero la fotografía.');return;}
    current=id;selected=null;zoom=1;linking=false;preset=null;presetPointer=null;presetEdited=false;undo.length=0;redo.length=0;
    el('visualDraw').checked=false;el('visualInstruction').value='';paint();el('visualDialog').showModal();
    report('Agrega varios cuadros sobre los textos y después pulsa «Leer todos los cuadros con IA». No tienes que escribir los datos manualmente.');
  }
  function close(){
    // Cerrar el editor tampoco debe descartar silenciosamente un cuadro nuevo.
    if(preset&&storePreset({silencioso:true})===null)return;
    cancelPreset();el('visualDialog').close();current=null;selected=null;linking=false;
  }
  function point(e){const r=el('visualDrawLayer').getBoundingClientRect();return [Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))];}
  function drag(e){
    if(!el('visualDraw').checked||e.button!==0)return;drawStart=point(e);
    el('visualDrawLayer').setPointerCapture(e.pointerId);el('visualRubber').hidden=false;updateRubber(drawStart);
    e.preventDefault();
  }
  function updateRubber(end){if(!drawStart)return;const [x,y]=drawStart;const box=[Math.min(x,end[0]),Math.min(y,end[1]),Math.abs(x-end[0]),Math.abs(y-end[1])];
    const r=el('visualRubber');r.style.left=box[0]*100+'%';r.style.top=box[1]*100+'%';r.style.width=box[2]*100+'%';r.style.height=box[3]*100+'%';return box;
  }
  function finished(e){if(!drawStart)return;const box=updateRubber(point(e));drawStart=null;el('visualRubber').hidden=true;
    try{Core.rectangle(box);}catch{report('Arrastra un recuadro más grande sobre el texto.',true);return;}
    const type=el('visualDrawType').value;
    const id=save(()=>Core.guardarMarca(cfg.getProject(),current,box,type));if(id!==null){paint();report('Cuadro creado. Coloca los demás y pulsa «Leer cuadros con IA».');}
  }

  async function imageBase64(){
    const src=imagesrc(foto());if(!src)throw Error('No se encuentra la imagen original. Vuelve a vincularla.');
    const res=await fetch(src,{cache:'no-store'});if(!res.ok)throw Error('No se pudo recuperar la foto original.');
    const blob=await res.blob();if(blob.size>18000000)throw Error('Imagen original demasiado grande.');
    const url=URL.createObjectURL(blob);
    try{
      const image=new Image();image.decoding='async';
      await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('No se pudo abrir la imagen original.'));image.src=url;});
      const maxSide=2200,scale=Math.min(1,maxSide/Math.max(image.naturalWidth,image.naturalHeight));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
      canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
      let quality=.87,data=canvas.toDataURL('image/jpeg',quality);
      for(let i=0;i<4&&data.length>4200000;i++){quality-=.13;data=canvas.toDataURL('image/jpeg',quality);}
      if(data.length>4300000)throw Error('La fotografía excede el tamaño admitido. Selecciona una imagen más pequeña.');
      return {mime:'image/jpeg',imagen:data.split(',')[1]};
    }finally{URL.revokeObjectURL(url);}
  }
  async function readBoxes(mode='all'){
    if(reading)return;
    let one=null;
    if(mode==='selected'&&preset)one=preset.markerId;
    if(preset){const stored=storePreset({silencioso:true});if(stored===null)return;if(mode==='selected'&&!one)one=stored;}
    const marks=Core.marcas(cfg.getProject(),current);
    const chosen=marks.filter(m=>mode==='all'||(mode==='selected'?m.id===one:m.estadoLectura!=='leido'));
    if(!chosen.length)return report(mode==='selected'?'Selecciona primero un cuadro guardado.':'No hay cuadros pendientes que leer.',true);
    reading=true;paint();let processed=0,success=0,errors=[];
    const status=el('visualReadStatus');
    try{
      const image=await imageBase64();
      // Procesa grupos pequeños: si se interrumpe Internet, las lecturas previas siguen guardadas.
      for(let i=0;i<chosen.length;i+=8){
        const group=chosen.slice(i,i+8).map(m=>({id:m.id,tipo:m.tipo,rect:m.rect,estado:m.estadoLectura}));
        status.textContent='Leyendo cuadros '+(i+1)+'–'+Math.min(chosen.length,i+8)+' de '+chosen.length+'…';
        try{
          const result=await cfg.api('/api/menu-visual/leer-cuadros',{...image,regiones:group,soloPendientes:false},88000);
          const applied=save(()=>Core.aplicarLecturas(cfg.getProject(),current,result.lecturas,cfg.getGroups()));
          if(applied===null)throw Error('No se pudo aplicar la lectura al proyecto.');
          processed+=result.lecturas.length;success+=applied.leidos;
          status.textContent='Guardados '+processed+' de '+chosen.length+' cuadros · '+result.fuente+'.';
        }catch(e){errors.push('Cuadros '+(i+1)+'–'+Math.min(chosen.length,i+8)+': '+e.message);}
      }
      paint();
      status.textContent=`${success} cuadros leídos de ${chosen.length}. ${errors.length?'Algunos lotes fallaron; puedes reintentarlos sin perder los demás.':'Revisa los productos y precios detectados.'}`;
      report(errors.length?errors.join(' | '):'Lectura automática terminada. Abre «Revisar productos» para confirmar los datos.',!!errors.length);
    }catch(e){status.textContent='No fue posible iniciar la lectura.';report(e.message,true);}
    finally{reading=false;paint();}
  }

  function init(options){cfg=options;
    el('visualReadAll').onclick=()=>readBoxes('all');
    el('visualReadPending').onclick=()=>readBoxes('pending');
    el('visualReadSelected').onclick=()=>readBoxes('selected');
    el('visualClose').onclick=close;
    el('visualDialog').addEventListener('cancel',e=>{e.preventDefault();close();});
    el('visualSavedList').onclick=e=>{const b=e.target.closest('[data-edit-mark]');if(b)editMark(b.dataset.editMark);};
    el('visualBlocks').onclick=e=>{const b=e.target.closest('[data-block]');if(b){selected=Number(b.dataset.block);paint();}};
    el('visualRegions').onclick=e=>{
      const m=e.target.closest('[data-vis-mark]');if(m)return editMark(m.dataset.visMark);
      const b=e.target.closest('[data-vis-block]');if(b){selected=Number(b.dataset.visBlock);paint();}
    };
    el('visualApply').onclick=()=>{if(selected===null)return;const type=el('visualType').value,group=el('visualGroup').value;
      const ok=save(()=>Core.clasificar(cfg.getProject(),current,selected,type,{grupo:group,gruposExistentes:cfg.getGroups(),idProducto:el('visualProduct').value||null}));if(ok)report('Clasificación actualizada. Comprueba el grupo de los productos afectados.');};
    el('visualLink').onclick=()=>{const id=el('visualProduct').value;if(!id||selected===null)return report('Selecciona un precio y un producto.',true);
      const amount=save(()=>Core.vincularPrecio(cfg.getProject(),current,id,selected));if(amount!==null)report('Precio vinculado: $'+amount.toFixed(2)+'.');};
    el('visualProduct').onchange=()=>el('visualLink').disabled=selected===null||!el('visualProduct').value;
    el('visualZoomIn').onclick=()=>{zoom=Math.min(4,zoom+.25);paint();};el('visualZoomOut').onclick=()=>{zoom=Math.max(1,zoom-.25);paint();};
    el('visualUndo').onclick=()=>undoRedo();el('visualRedo').onclick=()=>undoRedo(true);
    el('visualDialog').querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>addPreset(b.dataset.preset)));
    el('visualPresetSave').onclick=storePreset;
    el('visualPresetCancel').onclick=()=>{cancelPreset();report('Cuadro cancelado; no cambió ningún producto.');};
    el('visualPresetDelete').onclick=deletePreset;
    el('visualPresetText').addEventListener('input',()=>{presetEdited=true;});
    el('visualPresetBox').addEventListener('pointerdown',presetDown);
    el('visualPresetBox').addEventListener('pointermove',presetMove);
    el('visualPresetBox').addEventListener('pointerup',presetEnd);
    el('visualPresetBox').addEventListener('pointercancel',presetEnd);
    el('visualPresetBox').addEventListener('keydown',presetKeyboard);
    el('visualDraw').onchange=()=>{
      if(el('visualDraw').checked&&preset){
        if(storePreset({silencioso:true})===null){el('visualDraw').checked=false;return;}
      }
      paint();
    };el('visualDrawLayer').addEventListener('pointerdown',drag);
    el('visualDrawLayer').addEventListener('pointermove',e=>{if(drawStart)updateRubber(point(e));});
    el('visualDrawLayer').addEventListener('pointerup',finished);el('visualDrawLayer').addEventListener('pointercancel',()=>{drawStart=null;el('visualRubber').hidden=true;});
    el('visualSuggest').onclick=async()=>{
      const instruction=el('visualInstruction').value.trim();const b=el('visualSuggest');b.disabled=true;
      try{const payload=Core.instrucciones(instruction,cfg.getProject(),current);
        const r=await cfg.api('/api/menu-visual/sugerir',payload,45000);
        // La IA sólo ofrece propuestas; jamás se aplican automáticamente.
        const changes=r.cambios||[];
        el('visualSuggestions').innerHTML=changes.length?changes.map((x,i)=>`<div class="visual-suggestion"><p>${E(x.explicacion||'Propuesta de corrección')} · ${E(TYPES[x.tipo]||x.tipo)}</p><button type="button" data-suggest="${i}">Aplicar esta propuesta</button></div>`).join(''):'<p>Gemini no encontró cambios seguros para proponer.</p>';
        el('visualSuggestions').onclick=e=>{const btn=e.target.closest('[data-suggest]');if(!btn)return;const change=changes[Number(btn.dataset.suggest)];if(!change)return;
          const done=save(()=>change.tipo==='precio'&&change.productoId?Core.vincularPrecio(cfg.getProject(),current,change.productoId,change.bloqueId):Core.clasificar(cfg.getProject(),current,change.bloqueId,change.tipo,{gruposExistentes:cfg.getGroups()}));
          if(done!==null){el('visualSuggestions').textContent='Propuesta aplicada. Puedes deshacerla.';report('Propuesta aplicada. Revisa los datos antes de importarlos.');}
        };
      }catch(e){report(e.message,true);}finally{b.disabled=false;}
    };
  }
  root.MenuVisual={init,open,paint};
})(window);
