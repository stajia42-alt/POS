(function(root,factory){
  'use strict';const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.MenuVisualLogica=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const types=['categoria','producto','precio','descripcion','ignorar','modificador','componente'];
  function ensure(c,message){if(!c)throw Error(message);}
  function rectangle(r){
    ensure(Array.isArray(r)&&r.length===4&&r.every(v=>Number.isFinite(v)&&v>=0&&v<=1),'El recuadro debe estar dentro de la fotografía.');
    const [x,y,w,h]=r;ensure(w>.003&&h>.003&&x+w<=1.00001&&y+h<=1.00001,'El recuadro está vacío o sale de la imagen.');
    return r.map(v=>Math.round(v*100000)/100000);
  }
  const defaults=Object.freeze({categoria:[.17,.12,.56,.085],producto:[.16,.34,.59,.085],descripcion:[.16,.46,.60,.105],precio:[.68,.54,.22,.085],ignorar:[.21,.68,.48,.085],modificador:[.17,.62,.58,.09],componente:[.17,.75,.58,.09]});
  function recuadroListo(tipo,numero=0){
    ensure(types.includes(tipo),'Tipo de recuadro no reconocido.');
    ensure(Number.isInteger(numero)&&numero>=0,'Número de recuadro inválido.');
    const base=defaults[tipo],offset=(numero%9)*.027;
    return rectangle([Math.min(1-base[2],base[0]+offset),Math.min(1-base[3],base[1]+offset),base[2],base[3]]);
  }
  // Los cuadros sin texto se guardan como MARCAS pendientes, nunca como productos ficticios.
  // Así es posible preparar muchos cuadros antes de leer o escribir los nombres.
  function marcas(project,photoId){
    const photo=project.fotografias.find(f=>f.id===photoId);
    ensure(photo&&photo.resultado,'No se encontró la fotografía analizada.');
    if(!Array.isArray(photo.marcasVisuales))photo.marcasVisuales=[];
    return photo.marcasVisuales;
  }
  function guardarMarca(project,photoId,rect,tipo,{id=null}={}){
    ensure(types.includes(tipo),'Tipo de cuadro no reconocido.');
    const lista=marcas(project,photoId),box=rectangle(rect);
    if(id!==null){
      const found=lista.find(m=>m.id===id);
      ensure(found,'El cuadro guardado ya no existe.');
      if(found.tipo!==tipo||found.rect.some((n,i)=>n!==box[i])){delete found.textoLeido;delete found.bloqueId;found.estadoLectura='pendiente';}
      found.tipo=tipo;found.rect=box;
      return found.id;
    }
    ensure(lista.length<500,'Se alcanzó el máximo de cuadros para esta fotografía.');
    const item={id:newId(),tipo,rect:box,fecha:new Date().toISOString()};
    lista.push(item);
    return item.id;
  }
  function borrarMarca(project,photoId,id){
    const lista=marcas(project,photoId),pos=lista.findIndex(m=>m.id===id);
    ensure(pos!==-1,'No se encontró el cuadro para eliminar.');
    lista.splice(pos,1);return true;
  }
  function moverRecuadro(rect,dx,dy,resize=false){
    const [x,y,w,h]=rectangle(rect);
    if(!Number.isFinite(dx)||!Number.isFinite(dy))throw Error('Movimiento inválido.');
    if(resize)return rectangle([x,y,Math.max(.02,Math.min(1-x,w+dx)),Math.max(.02,Math.min(1-y,h+dy))]);
    return rectangle([Math.max(0,Math.min(1-w,x+dx)),Math.max(0,Math.min(1-h,y+dy)),w,h]);
  }
  function sugerirBloqueEnRecuadro(project,photoId,rect){
    rectangle(rect);
    const photo=project.fotografias.find(f=>f.id===photoId);if(!photo?.resultado)return null;
    const bounds=b=>{
      if(Array.isArray(b.rectVisual)){try{return rectangle(b.rectVisual);}catch{return null;}}
      if(!Array.isArray(b.caja)||!photo.ancho||!photo.alto)return null;
      const [x1,y1,x2,y2]=b.caja;
      try{return rectangle([x1/photo.ancho,y1/photo.alto,(x2-x1)/photo.ancho,(y2-y1)/photo.alto]);}catch{return null;}
    };
    const hits=(photo.resultado.bloques||[]).filter(b=>{
      const r=bounds(b);if(!r||!b.texto?.trim())return false;
      const xx=Math.max(0,Math.min(rect[0]+rect[2],r[0]+r[2])-Math.max(rect[0],r[0]));
      const yy=Math.max(0,Math.min(rect[1]+rect[3],r[1]+r[3])-Math.max(rect[1],r[1]));
      return xx*yy/(r[2]*r[3])>=.65;
    });
    return hits.length===1?{id:hits[0].id,texto:hits[0].texto}:null;
  }
  function guardarRecuadro(project,photoId,rect,tipo,texto,{idBloque=null,grupo='',idProducto=null,gruposExistentes=[]}={}){
    rectangle(rect);ensure(types.includes(tipo),'Tipo de recuadro no reconocido.');
    ensure(typeof texto==='string'&&texto.trim()&&texto.trim().length<=200,'Escribe el texto que aparece dentro del recuadro.');
    const candidate=idBloque!==null?proposal(project,photoId,idBloque):null;
    if(candidate&&candidate.block.texto.trim()===texto.trim()){
      clasificar(project,photoId,idBloque,tipo,{grupo,idProducto,gruposExistentes});
      candidate.block.rectVisual=rectangle(rect);
      return idBloque;
    }
    const id=crearBloque(project,photoId,texto,rect,tipo);
    if(tipo==='producto'&&grupo)clasificar(project,photoId,id,tipo,{grupo,gruposExistentes});
    if(tipo==='descripcion'&&idProducto)clasificar(project,photoId,id,tipo,{idProducto});
    return id;
  }
  function proposal(project,photoId,blockId){
    const photo=project.fotografias.find(f=>f.id===photoId);ensure(photo&&photo.resultado,'No se encontró la fotografía analizada.');
    const block=(photo.resultado.bloques||[]).find(b=>b.id===blockId);ensure(block,'No se encontró el bloque OCR.');
    return {photo,block};
  }
  function blankProduct(id,photo,block){return {id,nombre:block.texto.trim().slice(0,200),precio:null,idgrupo:'',grupo_detectado:'',categoria_padre:'',tipo:'independiente',modificadores:[],ingredientes:[],evidencia:[block.id],revision:['Corrige el precio y confirma el grupo en la revisión visual.'],revisado:false,excluido:false,clave:'',claveAutomatica:true,foto:photo.id,fotoNombre:photo.nombre};}
  function findDraft(project,name){return project.gruposPreparados.find(g=>norm(g.nombre)===norm(name));}
  function newId(){return 'visual-'+Math.random().toString(36).slice(2)+'-'+Date.now().toString(36);}
  function claseSugerida(nombre){const n=norm(nombre);return /\b(bebida|bebidas|refresco|refrescos|jugo|jugos|cafe|cafes|agua|aguas|cocteles|vinos)\b/.test(n)?2:/\b(otros|extras|servicios|varios)\b/.test(n)?3:1;}
  function categorizar(project,photo,block,gruposExistentes=[]){
    const r=photo.resultado,nombre=block.texto.trim();
    ensure(nombre.length<=120,'La categoría es demasiado larga.');
    if(!(r.categorias||[]).some(c=>norm(c.nombre)===norm(nombre)))r.categorias.push({nombre,padre:'',evidencia:[block.id],estado:'faltante'});
    if(!findDraft(project,nombre)&&!gruposExistentes.some(g=>norm(g.descripcion)===norm(nombre)))project.gruposPreparados.push({id:newId(),nombre,clasificacion:claseSugerida(nombre)});
  }
  function descategorizar(project,photo,block){
    const name=block.texto.trim();const r=photo.resultado;
    r.categorias=r.categorias.filter(c=>!(norm(c.nombre)===norm(name)&&c.evidencia.includes(block.id)));
    // Si otros bloques aún justifican el grupo, no lo borres.
    const stillCategory=project.fotografias.some(f=>f.resultado?.categorias?.some(c=>norm(c.nombre)===norm(name)));
    if(!stillCategory){
      const drafts=project.gruposPreparados.filter(g=>norm(g.nombre)===norm(name));
      project.gruposPreparados=project.gruposPreparados.filter(g=>!drafts.includes(g));
      for(const p of project.productos){
        if(norm(p.grupo_detectado)===norm(name)||drafts.some(g=>p.idgrupo==='borrador:'+g.id)){
          p.idgrupo='';p.grupo_detectado='';p.revisado=false;
          p.revision=Array.isArray(p.revision)?p.revision:[];
          if(!p.revision.includes('El grupo anterior se corrigió; asigna uno válido.'))p.revision.push('El grupo anterior se corrigió; asigna uno válido.');
        }
      }
    }
  }
  function clasificar(project,photoId,blockId,tipo,{grupo='',idProducto=null,gruposExistentes=[]}={}){
    ensure(types.includes(tipo),'Tipo visual no reconocido.');
    const {photo,block}=proposal(project,photoId,blockId); const r=photo.resultado;
    ensure(!project.productos.some(p=>p.importado&&p.foto===photoId&&norm(p.nombre)===norm(block.texto)),'No puedes modificar un producto ya importado.');
    const previous=block.tipoVisual||(r.categorias.some(c=>c.evidencia?.includes(blockId))?'categoria':project.productos.some(p=>p.foto===photoId&&norm(p.nombre)===norm(block.texto))?'producto':null);
    if(previous==='categoria'&&tipo!=='categoria')descategorizar(project,photo,block,gruposExistentes);
    if(tipo==='categoria'){
      for(const p of project.productos.filter(p=>p.foto===photoId&&norm(p.nombre)===norm(block.texto)))if(!p.importado){
        // Conservar los productos y correcciones manuales, pero no importarlos por error.
        p.excluido=true;p.revisado=false;
        p.revision=Array.isArray(p.revision)?p.revision:[];
        if(!p.revision.includes('Este elemento se convirtió en categoría; la propuesta original se conservó descartada.'))p.revision.push('Este elemento se convirtió en categoría; la propuesta original se conservó descartada.');
      }
      categorizar(project,photo,block,gruposExistentes);
    } else if(tipo==='producto'){
      let p=idProducto&&project.productos.find(x=>x.id===idProducto&&x.foto===photoId);
      if(!p)p=project.productos.find(x=>x.foto===photoId&&norm(x.nombre)===norm(block.texto)&&!x.importado);
      if(!p){p=blankProduct(newId(),photo,block);project.productos.push(p);}
      if(!p.evidencia.includes(blockId))p.evidencia.push(blockId);
      if(grupo){p.grupo_detectado=grupo;const draft=findDraft(project,grupo),existing=gruposExistentes.find(g=>norm(g.descripcion)===norm(grupo));p.idgrupo=existing?String(existing.idgrupo).trim():draft?'borrador:'+draft.id:'';}
      p.revisado=false;p.excluido=false;
    } else if(tipo==='descripcion'&&idProducto){
      const p=project.productos.find(x=>x.id===idProducto&&x.foto===photoId&&!x.importado);
      ensure(p,'Selecciona un producto pendiente para asociar la descripción.');
      if(!p.ingredientes.includes(block.texto.trim()))p.ingredientes.push(block.texto.trim());
      if(!p.evidencia.includes(blockId))p.evidencia.push(blockId);
      p.revisado=false;
    } else if(tipo==='ignorar'){
      // No borrar propuestas existentes de manera silenciosa: marcar excluidas.
      for(const p of project.productos.filter(p=>p.foto===photoId&&norm(p.nombre)===norm(block.texto)))if(!p.importado)p.excluido=true;
    }
    block.tipoVisual=tipo;
    block.uso=[tipo+'_manual'];
    r.pendientes=r.pendientes.filter(b=>b.id!==blockId);
    photo.correcciones=Array.isArray(photo.correcciones)?photo.correcciones:[];
    photo.correcciones.push({id:newId(),bloqueId: blockId,tipo,fecha:new Date().toISOString()});
    return {tipo,bloqueId:blockId};
  }
  function vincularPrecio(project,photoId,productId,blockId){
    const {block}=proposal(project,photoId,blockId);
    const p=project.productos.find(p=>p.id===productId&&p.foto===photoId);
    ensure(p&&!p.importado,'Elige un producto de esta fotografía que aún no esté importado.');
    const match=String(block.texto).match(/^\s*\$?\s*(\d{1,6}(?:[.,]\d{1,2})?)(?:\s*\/\s*\d+\s*(?:pz|piezas))?\s*$/i);
    ensure(match,'No se encontró una cifra en ese recuadro.');
    const amount=Number(match[1].replace(',','.'));
    ensure(Number.isFinite(amount)&&amount>=0&&amount<=9999999,'Precio inválido.');
    p.precio=amount;p.revisado=false;p.precioManualConfirmado=true;
    if(!p.evidencia.includes(blockId))p.evidencia.push(blockId);
    block.tipoVisual='precio';block.uso=['precio_manual'];
    const photo=project.fotografias.find(f=>f.id===photoId);
    photo.correcciones=Array.isArray(photo.correcciones)?photo.correcciones:[];
    photo.correcciones.push({id:newId(),bloqueId:blockId,tipo:'precio',productoId:productId,precio:amount,fecha:new Date().toISOString()});
    return amount;
  }
  function crearBloque(project,photoId,texto,rect,tipo){
    const photo=project.fotografias.find(f=>f.id===photoId);ensure(photo&&photo.resultado,'Fotografía sin análisis.');
    ensure(typeof texto==='string'&&texto.trim()&&texto.length<=200,'Escribe el texto que aparece en la zona seleccionada.');
    ensure(types.includes(tipo),'Selecciona qué representa el texto.');
    const r=rectangle(rect);
    const id=Math.max(-1,...photo.resultado.bloques.map(x=>x.id))+1;
    photo.resultado.bloques.push({id,texto:texto.trim(),caja:null,rectVisual:r,confianza:null,pagina:0,uso:[]});
    clasificar(project,photoId,id,tipo);
    return id;
  }

  // Actualiza ÚNICAMENTE el borrador; no consulta, genera claves ni modifica SQL.
  // El id del cuadro y el id del bloque leído se mantienen estables para reintentos idempotentes.
  function aplicarLecturas(project,photoId,lecturas,gruposExistentes=[]){
    ensure(Array.isArray(lecturas)&&lecturas.length<=120,'Lecturas incorrectas.');
    const photo=project.fotografias.find(f=>f.id===photoId);ensure(photo?.resultado,'La foto no está analizada.');
    const marks=marcas(project,photoId),groups=project.gruposPreparados,blocks=photo.resultado.bloques;
    const valid=['categoria','producto','precio','descripcion','ignorar','modificador','componente'];
    const results=[];
    for(const reading of lecturas){
      const mark=marks.find(m=>m.id===reading?.id);
      ensure(mark&&valid.includes(mark.tipo)&&reading.tipo===mark.tipo&&typeof reading.texto==='string'&&reading.texto.length<=280,'La lectura no corresponde a un cuadro guardado.');
      const texto=reading.texto.trim().slice(0,200);
      // Las correcciones confirmadas manualmente nunca se reescriben.
      if(mark.estadoLectura==='confirmado'){results.push({...mark});continue;}
      mark.textoLeido=texto;mark.estadoLectura=texto?'leido':'dudoso';mark.ultimaLectura=new Date().toISOString();
      if(texto&&mark.tipo!=='ignorar'){
        let b=blocks.find(b=>b.marcaId===mark.id);
        if(!b){b={id:Math.max(-1,...blocks.map(x=>x.id))+1,texto,rectVisual:mark.rect,caja:null,confianza:null,pagina:0,uso:['lectura_cuadro'],tipoVisual:mark.tipo,marcaId:mark.id};blocks.push(b);}
        else if(!b.confirmadoManual){b.texto=texto;b.rectVisual=mark.rect;b.tipoVisual=mark.tipo;}
        mark.bloqueId=b.id;
      }
      results.push({...mark});
    }
    const present=marks.filter(m=>m.estadoLectura==='leido'&&m.textoLeido&&m.tipo!=='ignorar');
    const center=r=>[r.rect[0]+r.rect[2]/2,r.rect[1]+r.rect[3]/2];
    const byType=t=>present.filter(r=>r.tipo===t);
    const categorias=byType('categoria');
    for(const r of categorias){
      const name=r.textoLeido.slice(0,120);
      if(!(photo.resultado.categorias||[]).some(c=>norm(c.nombre)===norm(name)))photo.resultado.categorias.push({nombre:name,padre:'',evidencia:[r.bloqueId],estado:'faltante'});
      if(!findDraft(project,name)&&!gruposExistentes.some(g=>norm(g.descripcion)===norm(name)))groups.push({id:newId(),nombre:name,clasificacion:claseSugerida(name)});
    }
    function categoryFor(p){
      const [px,py]=center(p);
      return categorias.filter(c=>{const [cx,cy]=center(c);return c.rect[1]<=p.rect[1]+.01&&(Math.abs(cx-px)<.29||c.rect[2]>=.52);})
        .sort((a,b)=>b.rect[1]-a.rect[1])[0]||null;
    }
    const products=byType('producto').map(mark=>{
      let x=project.productos.find(p=>p.foto===photoId&&p.marcaProductoId===mark.id);
      if(!x)x=project.productos.find(p=>p.foto===photoId&&!p.importado&&norm(p.nombre)===norm(mark.textoLeido));
      if(x?.importado){mark.estadoLectura='confirmado';return null;}
      if(!x){x=blankProduct(newId(),photo,{id:mark.bloqueId,texto:mark.textoLeido});x.marcaProductoId=mark.id;x.revision=['Confirma el precio y el grupo antes de guardar.'];project.productos.push(x);}
      // Respetar cambios que el usuario haya confirmado o escrito manualmente.
      if(!x.revisado&&x.nombreOriginalAutomatico!==false)x.nombre=mark.textoLeido.slice(0,200);
      x.marcaProductoId=mark.id;x.evidencia=Array.isArray(x.evidencia)?x.evidencia:[];
      if(!x.evidencia.includes(mark.bloqueId))x.evidencia.push(mark.bloqueId);
      const cat=categoryFor(mark);
      if(cat&&!x.revisado&&!x.idgrupo){const actual=gruposExistentes.find(g=>norm(g.descripcion)===norm(cat.textoLeido)),draft=findDraft(project,cat.textoLeido);
        x.grupo_detectado=cat.textoLeido;x.idgrupo=actual?String(actual.idgrupo).trim():draft?'borrador:'+draft.id:'';}
      return {mark,product:x};
    }).filter(Boolean);
    function parentFor(mark){
      if(mark.productoId){const direct=products.find(p=>p.product.id===mark.productoId);if(direct)return direct;}
      const [mx,my]=center(mark);
      const opts=products.map(o=>{const [px,py]=center(o.mark);const dy=my-py,dx=Math.abs(mx-px);
        if(dy<-.035||dy>.22||dx>.32)return null;
        return {value:o,score:Math.abs(dy)*1.9+dx*.7};
      }).filter(Boolean).sort((a,b)=>a.score-b.score);
      return opts[0]&&(!opts[1]||opts[1].score-opts[0].score>.038)?opts[0].value:null;
    }
    // Asociar cada precio una sola vez. Si dos candidatos son casi iguales, mantener pendiente.
    const assigned=new Set();
    for(const mark of byType('precio')){
      const amount=(mark.textoLeido.match(/^\s*(?:MXN\s*)?\$?\s*(\d{1,6}(?:[.,]\d{1,2})?)(?:\s*\/\s*\d+\s*(?:pz|piezas))?\s*$/i)||[])[1];
      if(!amount){mark.estadoLectura='dudoso';continue;}
      const price=Number(amount.replace(',','.'));if(!Number.isFinite(price)||price>9999999)continue;
      const [mx,my]=center(mark);
      const options=products.filter(o=>!assigned.has(o.product.id)&&!o.product.revisado&&!o.product.precioManualConfirmado&&(o.product.precio===null||o.product.precio===undefined||o.product.marcaPrecioId===mark.id)&&(!o.product.marcaPrecioId||o.product.marcaPrecioId===mark.id))
        .map(o=>{const [px,py]=center(o.mark);const dy=Math.abs(my-py),dx=mx-px;
          const same=dy<Math.max(.04,o.mark.rect[3]*.95)&&dx>-.025&&dx<.55;
          const below=my>=py&&my-py<.085&&Math.abs(dx)<.15;
          return same||below?{o,score:(same?dy*3+Math.abs(dx)*.18:dy*2+.23+Math.abs(dx))}:null;})
        .filter(Boolean).sort((a,b)=>a.score-b.score);
      if(!options[0]||options[1]&&options[1].score-options[0].score<.017){mark.estadoLectura='dudoso';continue;}
      const prod=options[0].o.product;prod.precio=price;prod.marcaPrecioId=mark.id;assigned.add(prod.id);
      if(!prod.evidencia.includes(mark.bloqueId))prod.evidencia.push(mark.bloqueId);
      mark.productoId=prod.id;
    }
    for(const kind of ['descripcion','modificador','componente'])for(const mark of byType(kind)){
      const parent=parentFor(mark);
      if(!parent){mark.estadoLectura='dudoso';continue;}
      const prod=parent.product;mark.productoId=prod.id;
      if(kind==='descripcion'){
        if(!prod.ingredientes.includes(mark.textoLeido))prod.ingredientes.push(mark.textoLeido);
      }else{
        prod.opcionesVisualesPendientes=Array.isArray(prod.opcionesVisualesPendientes)?prod.opcionesVisualesPendientes:[];
        const found=prod.opcionesVisualesPendientes.find(o=>o.marcaId===mark.id);
        if(found)found.texto=mark.textoLeido;
        else prod.opcionesVisualesPendientes.push({marcaId:mark.id,tipo:kind,texto:mark.textoLeido,estado:'pendiente_configuracion_sql'});
        prod.revisado=false;
        prod.excluido=true; // Nunca importar como producto simple opciones/combos incompletos.
        if(!prod.revision.includes('Modificadores o componentes pendientes: su estructura SQL no está verificada.'))prod.revision.push('Modificadores o componentes pendientes: su estructura SQL no está verificada.');
      }
      if(!prod.evidencia.includes(mark.bloqueId))prod.evidencia.push(mark.bloqueId);
    }
    for(const {product} of products){if(!product.precio&&!product.revision.includes('Precio detectado pendiente.'))product.revision.push('Precio detectado pendiente.');}
    return {cuadros:results.length,leidos:results.filter(x=>x.estadoLectura==='leido').length,productos:products.length,pendientes:marks.filter(x=>x.estadoLectura==='dudoso').length};
  }

  function instrucciones(text,project,photoId){
    ensure(typeof text==='string'&&text.trim().length>=5&&text.length<=600,'Escribe una instrucción de 5 a 600 caracteres.');
    const photo=project.fotografias.find(f=>f.id===photoId);ensure(photo&&photo.resultado,'Elige una fotografía analizada.');
    return {instruccion:text.trim(),lineas:photo.resultado.bloques.slice(0,150).map(b=>({id:b.id,texto:b.texto,tipo:b.tipoVisual||null})),productos:project.productos.filter(p=>p.foto===photoId).map(p=>({id:p.id,nombre:p.nombre,precio:p.precio,grupo:p.grupo_detectado,importado:!!p.importado}))};
  }
  return Object.freeze({types,rectangle,recuadroListo,moverRecuadro,marcas,guardarMarca,borrarMarca,sugerirBloqueEnRecuadro,guardarRecuadro,clasificar,vincularPrecio,crearBloque,aplicarLecturas,instrucciones,newId});
});
