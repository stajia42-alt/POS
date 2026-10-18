'use strict';
window.MenuSQL=(()=>{
  let compatibility=null,pending=null,working=false,importRows=[],checkedAt=0;
  const failure=e=>'<div class="notice bad">'+esc(e.message)+'</div>';
  function actualizarGrupos(){
    const value=$('groupModel').value;
    const configuracion=compatibility?.modeloGrupos;
    const opciones=(configuracion?.disponibles||[]);
    $('groupModelLabel').hidden=!compatibility?.grupos?.requiereModelo||!!configuracion?.automatico||opciones.length===0;
    $('groupModel').innerHTML='<option value="">Resolver automáticamente</option>'+grupos.filter(g=>opciones.includes(trimId(g.idgrupo))).map(g=>'<option value="'+esc(trimId(g.idgrupo))+'" '+(trimId(g.idgrupo)===value?'selected':'')+'>'+esc(g.descripcion)+'</option>').join('');
  }
  const trimId=v=>String(v??'').trim();
  function renderCompatibility(){
    if(!compatibility)return;
    $('compatibilityState').innerHTML='<p class="muted">Base conectada: <strong>'+esc(compatibility.baseDatos)+'</strong></p>'+['grupos','productos','modificadores'].map(k=>{
      const c=compatibility[k];
      return '<article class="compat-row"><strong>'+{grupos:'Creación de grupos',productos:'Productos independientes',modificadores:'Productos con opciones'}[k]+'</strong><span class="tag '+(c.lista?'ok':'')+'">'+(c.lista?'Estructura compatible':'Revisión necesaria')+'</span><p>'+esc(c.lista?(k==='grupos'?(c.requiereModelo?'Sólo se copiarán ajustes obligatorios comprobados de SQL.':'Las categorías nuevas se crearán con los valores permitidos por SQL.'):'Empresa comprobada automáticamente en Soft Restaurant; los impuestos se confirman antes de guardar.') : c.motivos.join(' '))+'</p></article>';
    }).join('');
    actualizarGrupos();
  }
  async function comprobar(){
    if(compatibility&&Date.now()-checkedAt<120000)return compatibility;
    $('checkCompatibility').disabled=true;
    $('compatibilityState').innerHTML='<p class="muted">Comprobando campos, claves y relaciones…</p>';
    try{compatibility=await api('/api/menu-admin/compatibilidad',undefined,85000);checkedAt=Date.now();renderCompatibility();return compatibility;}
    catch(e){compatibility=null;$('compatibilityState').innerHTML=failure(e);throw e;}
    finally{$('checkCompatibility').disabled=false;}
  }
  function showPlan(data){
    pending=data;$('sqlError').textContent='';$('sqlAccept').checked=true;$('sqlAcceptLabel').hidden=true;$('confirmSql').disabled=false;$('confirmSql').hidden=false;
    const p=data.plan;
    $('sqlTitle').textContent=p.tipo==='grupos'?'Crear grupos en Soft Restaurant':p.tipo==='grupo_ajustes'?'Corregir grupo existente':'Importar productos';
    if(p.tipo==='grupo_ajustes'){
      const g=p.grupo;
      $('sqlPlan').innerHTML='<div class="notice"><strong>Grupo: '+esc(g.nombre)+'</strong><p>Clasificación: '+esc(({1:'Bebidas',2:'Alimentos',3:'Otros'})[g.clasificacion])+'</p><p>Botón naranja y letras negras.</p><p>Sólo se actualizarán clasificación, color y color de letra del grupo existente. No se modificarán productos ni precios.</p></div>';
      $('sqlConfirmation').showModal();return;
    }
    const rows=p.tipo==='grupos'?p.grupos.map(g=>'<tr><td>'+esc(g.idgrupo)+'</td><td>'+esc(g.nombre)+'</td><td>'+esc(g.accion==='crear'?'Crear · '+({1:'Bebidas',2:'Alimentos',3:'Otros'}[g.clasificacion]||'Sin clasificar')+' · naranja/negro':'Usar existente')+'</td></tr>'):p.productos.map(x=>'<tr><td>'+esc(x.clave)+'</td><td>'+esc(x.nombre)+'</td><td>'+money(x.precio)+'</td></tr>');
    $('sqlPlan').innerHTML='<div class="notice"><strong>Base de datos: '+esc(p.baseDatos)+'</strong><br>'+(p.tipo==='grupos'?'Grupos nuevos: '+p.grupos.filter(g=>g.accion==='crear').length:'Productos: '+p.productos.length+' · Empresa: '+esc(p.plantilla.idempresa)+' · Unidad: '+esc(p.plantilla.idunidad))+'</div>'+
      '<div class="plan-table"><table><thead><tr><th>Clave</th><th>Nombre que se guardará</th><th>'+(p.tipo==='grupos'?'Acción':'Precio')+'</th></tr></thead><tbody>'+rows.join('')+'</tbody></table></div>'+ 
      (p.compuestos?.length?'<div class="notice ok"><strong>'+p.compuestos.length+' productos compuestos</strong><p>Cada grupo exige exactamente una opción; se registra el recargo por producto en Soft Restaurant.</p>'+p.compuestos.map(c=>'<p><strong>'+esc(c.clave)+'</strong> · '+c.grupos.map(g=>esc(g.nombre)+' ['+g.opciones.map(o=>esc(o.nombre)+' '+money(o.precio)).join(' / ')+']').join(' · ')+'</p>').join('')+'</div>':'')+
      (p.tipo==='grupos'&&p.modelo?'<p>Se usarán los ajustes obligatorios del grupo '+esc(p.modelo)+'.</p><details><summary>Ver ajustes de referencia</summary><pre>'+esc(JSON.stringify(p.grupos.find(g=>g.ajustes)?.ajustes||{},null,2))+'</pre></details>':'')+
      (p.tipo==='menu'?'<h3>Categorías del lote</h3><p>'+p.grupos.map(g=>esc(g.nombre)+' ('+(g.accion==='crear'?('nueva · '+({1:'Bebidas',2:'Alimentos',3:'Otros'}[g.clasificacion]||'Sin clasificar')+' · naranja/negro'):'existente')+')').join(', ')+'</p>':'')+
      (p.tipo!=='grupos'?'<p>'+(p.plantilla.idproducto==='CONFIGURACION_VERIFICADA'?'Configuración fiscal confirmada':'Configuración tomada del producto '+esc(p.plantilla.idproducto))+': '+(Number(p.plantilla.excentoimpuestos)===1?'exento':'impuesto '+Number(p.plantilla.impuesto1)+'%')+'. Servicios: '+Object.entries(p.servicios).filter(([,v])=>v).map(([k])=>({comedor:'Comedor',domicilio:'A domicilio',rapido:'Rápido'}[k])).join(', ')+'.</p>':'')+
      '<p class="muted">El lote se guardará completo en una transacción. La aplicación conservará un registro local de la operación. Los productos existentes no se modificarán.</p>';
    if($('summary').open)$('summary').close();$('sqlConfirmation').showModal();
  }
  async function prepararSQL(route,body){
    const accepted=await api('/api/menu-admin/preparar/'+route,body,22000);
    for(let tick=0;tick<160;tick++){
      const state=await api('/api/menu-admin/preparaciones/'+accepted.id,undefined,22000);
      if(state.estado==='lista')return state.resultado;
      if(state.estado==='error')throw Error(state.error||'SQL rechazó la revisión de este lote.');
      if(state.estado!=='procesando')throw Error('Estado de revisión desconocido.');
      if($('summary')?.open){
        const current=$('summaryBody').querySelector('.preview-info');
        if(current)current.textContent='Comprobando datos en SQL… '+(tick*2)+' s. No cierres la computadora.';
      }
      await new Promise(resolve=>setTimeout(resolve,2000));
    }
    throw Error('La revisión SQL tardó demasiado; no se ha insertado ningún producto. Intenta de nuevo.');
  }
  async function revisarGrupos(){
    if(working||busy)return;
    if(!project.gruposPreparados.length)return status('Prepara un grupo o usa Preparar todos los faltantes.');
    working=true;$('createGroups').disabled=true;
    try{
      // Nada se escribe al preparar la vista previa. La validación se repite en el servidor al confirmar.
      const d=await prepararSQL('grupos',{grupos:project.gruposPreparados.map(g=>({id:g.id,nombre:g.nombre,clasificacion:g.clasificacion??suggestedClass(g.nombre)})),modelo:$('groupModel').value||null});showPlan(d);
    }catch(e){status(e.message,true);}finally{working=false;$('createGroups').disabled=false;}
  }
  async function revisarImportacion(){
    importRows=project.productos.filter(p=>!p.excluido&&!p.importado);
    // Preparar categorías no escribe en SQL. Se resolverán junto con el lote.
    for(const p of importRows)if(!p.idgrupo&&p.grupo_detectado)prepareGroup(p.grupo_detectado);
    assignDetected();suggestKeys();render();persist();
    $('previewImport').disabled=true;$('summaryBody').innerHTML='<p>Comprobando el lote seleccionado y la conexión…</p>';$('summary').showModal();
    const issues=[];
    if(!importRows.length)issues.push('Selecciona o incluye al menos un producto.');
    if(importRows.length>200)issues.push('Selecciona hasta 200 productos por lote.');
    if(importRows.some(p=>p.tipo==='con_opciones'&&(!Array.isArray(p.modificadores)||!p.modificadores.length||p.modificadores.some(m=>m.obligatorio!==true||Number(m.minimo)!==1||Number(m.maximo)!==1||!Array.isArray(m.opciones)||!m.opciones.length||m.opciones.some(o=>!o.nombre||typeof o.precio!=='number'||!Number.isFinite(o.precio))))))issues.push('Hay modificadores incompletos: indica opciones, precios y elección obligatoria de una opción.');
    if(importRows.some(p=>!['independiente','con_opciones'].includes(p.tipo)||p.opcionesVisualesPendientes?.some(o=>o.tipo==='componente')))issues.push('Hay componentes o variantes de combo que necesitan revisión.');
    if(importRows.some(p=>!p.idgrupo))issues.push('Hay productos sin categoría. Asígnales una desde la lista; puedes crear una nueva en Ajustar categorías.');
    if(importRows.some(p=>p.claveOcupada||p.duplicado||!p.clave))issues.push('Hay claves pendientes, ocupadas o productos posiblemente duplicados. Genera claves nuevas y revisa duplicados.');
    if(importRows.some(p=>typeof p.precio!=='number'||!Number.isFinite(p.precio)||p.precio<0||!p.nombre?.trim()))issues.push('Hay nombres o precios que necesitan revisión.');
    try{await comprobar();if(!compatibility.productos.lista)issues.push(...compatibility.productos.motivos);}
    catch{issues.push('Conexión SQL sin verificar. Configúrala desde el inicio para continuar.');}
    if(importRows.some(p=>p.tipo==='con_opciones')&&!compatibility?.modificadores?.lista)issues.push(compatibility?.modificadores?.motivos?.join(' ')||'SQL todavía no verificó los modificadores.');
    const refs=compatibility?.referencias||[];
    const empresa=compatibility?.empresa;
    if(compatibility&&!empresa?.idempresa)issues.push(compatibility.diagnosticoEmpresa||'SQL no permite identificar una única empresa.');
    const unidades=compatibility?.unidades||[],modosPrecio=compatibility?.modosPrecio||[];
    const alternativa=!refs.length;
    if(empresa?.idempresa&&alternativa&&!unidades.length)issues.push('SQL no devolvió ninguna unidad registrada. Registra una unidad en Soft Restaurant antes de importar.');
    if(empresa?.idempresa&&alternativa&&!modosPrecio.length)issues.push('No se pudo resolver un modo de precio válido.');
    const auto=compatibility?.referenciaAutomatica;
    const autoIndex=Math.max(0,refs.findIndex(r=>trimId(r.idproducto)===trimId(auto?.idproducto)&&trimId(r.idempresa)===trimId(auto?.idempresa)));
    const modeloDatos=compatibility?.modeloGrupos||{automatico:null,disponibles:[]};
    const nuevoGrupo=!!(compatibility?.grupos?.requiereModelo&&project.gruposPreparados.some(g=>importRows.some(p=>p.idgrupo==='borrador:'+g.id)));
    const modelos=(modeloDatos.disponibles||[]).map(id=>grupos.find(g=>trimId(g.idgrupo)===id)||{idgrupo:id,descripcion:'Grupo '+id});
    if(nuevoGrupo&&!modeloDatos.automatico&&!modelos.length)issues.push('SQL exige un ajuste de categoría obligatorio pero no hay un grupo de referencia válido. Crea el primer grupo en Soft Restaurant.');
    const modeloDefault=trimId($('groupModel')?.value||'');
    $('summaryBody').innerHTML='<div class="preview-info muted">Preparando revisión de Soft Restaurant…</div><div class="summary-line"><span>Productos incluidos</span><strong>'+importRows.length+'</strong></div>'+
      '<div class="summary-line"><span>Productos con opciones</span><strong>'+importRows.filter(p=>p.modificadores.length).length+'</strong></div>'+
      (issues.length?'<div class="notice bad">'+[...new Set(issues)].map(esc).join('<br><br>')+'</div>':'')+
      '<div class="notice"><strong>Empresa detectada directamente de Soft Restaurant: '+esc(empresa?.idempresa||'No comprobada')+'</strong><p>No necesitas registrar ni elegir una empresa. Se validará otra vez al guardar.</p></div>'+
      (alternativa?
       '<div class="notice"><strong>'+(compatibility?.inicioCatalogo?.limpio?'Primer catálogo: no necesitas productos de prueba.':'No se encontró una referencia fiscal compatible.')+'</strong><p>La empresa fue consultada en SQL. Selecciona la unidad y la tasa fiscal aplicables a ESTE negocio'+(compatibility?.inicioCatalogo?.limpio?'. Se guardarán productos reales, sin insertar modelos ficticios.':'. Existen productos anteriores: verifica el tratamiento fiscal antes de continuar.')+'</p></div>':
       '<div class="notice ok"><strong>Configuración detectada automáticamente</strong><p>Se usará el producto '+esc(refs[autoIndex]?.descripcion||'')+' · Unidad '+esc(refs[autoIndex]?.idunidad||'')+' · '+esc(Number(refs[autoIndex]?.excentoimpuestos)===1?'Exento (0%)':('Impuesto '+Number(refs[autoIndex]?.impuesto1)+'%'))+'.</p></div>')+
      (alternativa?
       '<details id="fiscalAdvanced"><summary>Opciones avanzadas: cambiar unidad o impuesto</summary><div class="form-row"><label>Unidad registrada en SQL<select id="importUnit"><option value="">Selecciona la unidad…</option>'+unidades.map(u=>'<option value="'+esc(u.idunidad)+'">'+esc(u.idunidad)+'</option>').join('')+'</select></label><label>Impuesto para los precios del menú<select id="importTax"><option value="">Selecciona la tasa real…</option><option value="0">Exento (0%)</option><option value="8">IVA 8% incluido</option><option value="16">IVA 16% incluido</option></select></label></div></details>'+
       (modosPrecio.length>1?'<details><summary>Configuración avanzada: modo de precio SQL</summary><label>Modo registrado<select id="importPriceMode"><option value="">Selecciona un modo…</option>'+modosPrecio.map(m=>'<option value="'+m+'">Modo '+m+'</option>').join('')+'</select></label></details>':'')+
       (compatibility?.modoPrecioRespaldo?'<p class="muted">Modo inicial de respaldo: 2 (se validará contra el esquema compatible de Soft Restaurant).</p>':'')+
       '<p class="muted">Predeterminado: ACTIVIDAD · Exento (0%). SQL comprobará que la unidad exista antes de guardar.</p>':
       (refs.length>1?'<details><summary>Corregir configuración fiscal si este lote requiere otra</summary><label>Producto real del cual copiar impuestos y unidad<select id="importReference">'+refs.map((r,i)=>'<option value="'+i+'" '+(i===autoIndex?'selected':'')+'>'+esc(r.descripcion+' · '+r.idunidad+' · '+(Number(r.excentoimpuestos)===1?'exento':Number(r.impuesto1)+'%'))+'</option>').join('')+'</select></label></details>':'') )+
      (nuevoGrupo&&!modeloDatos.automatico&&modelos.length?'<details open><summary>La categoría requiere ajustes obligatorios de un grupo existente</summary><label>Grupo de referencia<select id="importGroupModel"><option value="">Selecciona un grupo…</option>'+modelos.map(g=>'<option value="'+esc(trimId(g.idgrupo))+'" '+(trimId(g.idgrupo)===modeloDefault?'selected':'')+'>'+esc(g.descripcion)+'</option>').join('')+'</select></label></details>':'')+
      '<p class="muted">La empresa y los ajustes fiscales se comprobarán otra vez antes de guardar. Ningún producto existente será reemplazado.</p>'+
      '<div class="plan-table"><table><thead><tr><th>Producto</th><th>Precio</th><th>Categoría</th></tr></thead><tbody>'+importRows.map(p=>'<tr><td>'+esc(p.nombre)+'</td><td>'+money(p.precio)+'</td><td>'+esc(groupName(p.idgrupo))+'</td></tr>').join('')+'</tbody></table></div>'+
      '<p class="muted">Al continuar se mostrarán los productos exactos que se crearán. Podrás confirmar el lote completo una sola vez.</p>'+ 
      '<div class="actions">'+['comedor','domicilio','rapido'].map(k=>'<label class="check"><input type="checkbox" data-service="'+k+'" checked> '+{comedor:'Comedor',domicilio:'A domicilio',rapido:'Rápido'}[k]+'</label>').join('')+'</div>'+
      '<p class="muted">Si lo prefieres, puedes crear los grupos primero desde «Ajustar categorías» sin registrar todavía ningún producto.</p>';
    const enable=()=>{$('previewImport').disabled=working||issues.length>0||(alternativa&&(!$('importUnit')?.value||$('importTax')?.value===''||(modosPrecio.length>1&&!$('importPriceMode')?.value)))||(nuevoGrupo&&!modeloDatos.automatico&&!$('importGroupModel')?.value);};
    $('summaryBody').onchange=enable;
    if(alternativa){const actividad=unidades.find(u=>trimId(u.idunidad).toUpperCase()==='ACTIVIDAD');if(actividad)$('importUnit').value=trimId(actividad.idunidad);$('importTax').value='0';if($('importPriceMode')&&modosPrecio.includes(2))$('importPriceMode').value='2';}
    enable();
    // Sin advertencias ni configuración manual, mostrar directamente el plan final.
    if(!issues.length&&!alternativa&&(!nuevoGrupo||modeloDatos.automatico||modeloDefault))setTimeout(()=>{$('previewImport').click();},0);
  }
  $('previewImport').onclick=async()=>{
    if(working)return;working=true;$('previewImport').disabled=true;
    try{
      const refs=compatibility.referencias||[],auto=compatibility.referenciaAutomatica;
      const ref=refs[Number($('importReference')?.value??Math.max(0,refs.findIndex(r=>trimId(r.idproducto)===trimId(auto?.idproducto))))];
      const alternativa=!refs.length;
      const valorModo=$('importPriceMode')?.value??(compatibility.modosPrecio.length===1?String(compatibility.modosPrecio[0]):'');
      const configuracionAlternativa=alternativa?{idunidad:$('importUnit')?.value,impuesto1:Number($('importTax')?.value),precioabierto:Number(valorModo)}:undefined;
      if(alternativa&&($('importTax')?.value===''||!$('importUnit')?.value||valorModo===''))throw Error('No se pudo resolver una unidad ACTIVIDAD o un modo de precio compatible en SQL. Abre Opciones avanzadas para revisar la configuración.');
      const modelo=trimId($('importGroupModel')?.value||$('groupModel')?.value||compatibility.modeloGrupos?.automatico||'')||null;
      const d=await prepararSQL('menu',{productos:importRows.map(p=>({...p,revisado:true})),grupos:project.gruposPreparados,modelo,grupoReferencia:trimId(importRows.find(p=>!String(p.idgrupo).startsWith('borrador:'))?.idgrupo||''),configuracionConfirmada:true,...(alternativa?{configuracionAlternativa,confirmacionFiscalInicial:true,confirmacionModoPrecio:true}:{plantilla:{idproducto:trimId(ref.idproducto),idempresa:trimId(ref.idempresa)}}),servicios:Object.fromEntries([...document.querySelectorAll('[data-service]')].map(el=>[el.dataset.service,el.checked]))});
      $('summary').close();showPlan(d);
    }catch(e){let target=$('summaryBody').querySelector('.preview-error');if(!target){target=document.createElement('div');target.className='notice bad preview-error';$('summaryBody').prepend(target);}target.textContent=e.message;status(e.message,true);}finally{working=false;$('previewImport').disabled=false;}
  };
  $('sqlAccept').onchange=()=>{$('confirmSql').disabled=working;};
  // La ventana puede cerrarse durante el guardado; la escritura continúa en el servidor.
  async function aplicarConfirmado(d,tipo,plan){
    if(!d?.guardado && d?.correcto===false)throw Error(d.error||'SQL rechazó el lote.');
    if(d.grupos){
      for(const g of d.grupos)for(const p of project.productos)if(p.idgrupo==='borrador:'+g.id){p.idgrupo=g.idgrupo;p.revisado=false;}
      project.gruposPreparados=project.gruposPreparados.filter(g=>!d.grupos.some(x=>x.id===g.id));
    }
    for(const row of d.productos||[]){const p=project.productos.find(p=>p.id===row.id);if(p){p.clave=row.clave;p.idgrupo=row.idgrupo;p.revisado=true;p.importado=true;p.excluido=true;}}
    project.ultimaOperacion={id:d.operacion||project.ultimaOperacion?.id,tipo,fecha:new Date().toISOString(),estado:'confirmada',creados:d.creados};
    persist();
    $('sqlTitle').textContent='Guardado confirmado en Soft Restaurant';
    $('sqlPlan').innerHTML='<div class="notice ok"><strong>'+esc(tipo==='grupo_ajustes'?'Grupo actualizado':(d.creados||0)+' productos o grupos guardados')+'</strong><p>SQL confirmó el lote.</p></div>';
    $('sqlError').textContent='';$('sqlAcceptLabel').hidden=true;$('confirmSql').hidden=true;pending=null;
    try{await catalog();}catch(e){status('SQL guardó el lote; no se pudo actualizar la lista local: '+e.message,true);return;}
    status('Guardado confirmado en Soft Restaurant. '+(d.creados||0)+' registros nuevos.');
  }
  async function esperarOperacion(token,tipo,plan){
    let fallos=0;
    for(let tick=0;tick<180;tick++){
      let r;
      try{r=await api('/api/menu-admin/operaciones/'+token,undefined,18000);fallos=0;}
      catch(e){if(++fallos>=4)throw Error('No hay conexión. La importación sigue identificada con '+token+'. Al volver puedes consultar el resultado sin duplicar productos.');await new Promise(resolve=>setTimeout(resolve,2500));continue;}
      if(r.estado==='confirmada'){
        const result=r.resultado?.guardado===true?r.resultado:{...r.resultado,correcto:true,guardado:true,operacion:token};
        await aplicarConfirmado(result,tipo,plan);return;
      }
      if(['revertida','error','sin_confirmar','resultado_incierto','por_confirmar','preparada'].includes(r.estado)&&r.estado!=='preparada'){
        // por_confirmar sólo debería aparecer tras reinicio: no se debe repetir el INSERT.
        throw Error((r.resultado?.error||r.error||'La operación no terminó de confirmarse.')+' Estado: '+r.estado+'. Código: '+token+'. No repitas la importación hasta consultar Soft Restaurant.');
      }
      if(r.estado==='preparada'&&tick>5)throw Error('Se interrumpió el servidor mientras guardaba. Consulta SQL antes de repetir. Operación: '+token);
      $('sqlError').textContent='Guardando en SQL… '+(r.etapa||'esperando confirmación')+' · '+Math.round(tick*2)+' s aprox.';
      if(tick%5===0)status('Guardando en Soft Restaurant… Puedes cerrar el resumen; el trabajo continúa.');
      await new Promise(resolve=>setTimeout(resolve,2200));
    }
    throw Error('La importación aún no ha respondido. El código '+token+' queda guardado; consulta su estado antes de intentar otra vez.');
  }
  async function recuperarOperacion(){
    const data=project.ultimaOperacion;
    if(!data?.id||!['procesando','revisar'].includes(data.estado))return;
    status('Recuperando resultado de la importación anterior. No vuelvas a guardar todavía.');
    try{await esperarOperacion(data.id,data.tipo,null);}catch(e){status(e.message,true);}
  }
  $('confirmSql').onclick=async()=>{
    if(working||!pending)return;
    const current=pending;working=true;$('confirmSql').disabled=true;
    // Cerrar la ventana no cancela el trabajo de SQL; el resultado se recupera luego.
    const token=current.token,tipo=current.plan.tipo;
    project.ultimaOperacion={id:token,tipo,fecha:new Date().toISOString(),estado:'procesando'};persist();
    $('sqlError').textContent='Enviando lote a Soft Restaurant. Puedes volver a esta pantalla si se pierde la conexión.';
    try{
      const route=tipo==='grupos'?'grupos/crear':tipo==='grupo_ajustes'?'grupos/ajustes/confirmar':tipo==='menu'?'menu/confirmar':'importacion/confirmar';
      await api('/api/menu-admin/segundo-plano/'+route,{token,confirmacion:current.confirmacion},20000);
      await esperarOperacion(token,tipo,current.plan);
    }catch(e){
      $('sqlError').textContent=e.message;
      status(e.message,true);
      // Conservar token y estado hasta confirmar resultado; no intentar de nuevo automáticamente.
      if(project.ultimaOperacion?.id===token&&project.ultimaOperacion.estado!=='confirmada'){
        project.ultimaOperacion.estado='revisar';persist();
      }
    }finally{working=false;$('sqlConfirmation').querySelectorAll('[data-close]').forEach(b=>b.disabled=false);}
  };
  $('createGroups').onclick=revisarGrupos;
  $('fixGroup').onchange=()=>{const g=grupos.find(g=>trimId(g.idgrupo)===$('fixGroup').value);if(g)$('fixGroupClass').value=String([1,2,3].includes(Number(g.clasificacion))?Number(g.clasificacion):suggestedClass(g.descripcion));};
  $('repairGroup').onclick=async()=>{
    if(working)return;const idgrupo=trimId($('fixGroup').value);if(!idgrupo)return status('Selecciona un grupo existente para corregir.');
    working=true;$('repairGroup').disabled=true;
    try{showPlan(await prepararSQL('grupos/ajustes',{idgrupo,clasificacion:Number($('fixGroupClass').value)}));}
    catch(e){status(e.message,true);}finally{working=false;$('repairGroup').disabled=false;}
  };
  $('checkCompatibility').onclick=()=>comprobar().catch(e=>status(e.message,true));
  return {comprobar,actualizarGrupos,revisarImportacion,recuperarOperacion};
})();
