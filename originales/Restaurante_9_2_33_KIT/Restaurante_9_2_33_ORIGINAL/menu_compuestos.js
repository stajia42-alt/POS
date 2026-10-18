'use strict';
// Extension incremental de Soft Restaurant 11: convierte grupos de selección
// explícitos en registros relacionados, SIN modificar productos ya existentes.
const C=require('./menu_contrato');
const {normalizar}=require('./menu_contexto');
const {columna,trim,error,stringValue,validMoney,length}=C;
const groupName='MODIFICADORES ALIMENTOS'; // Referencia textual; clase validada por SQL
function checkedMeta(meta) {
  const specs={gruposmodificadores:['idgruposmodificadores','descripcion'],gruposmodificadoresproductos:['idproducto','idgruposmodificadores','idempresa','incluidos','prioridad','forzarcaptura','maximomodificadores','captura_incluido'],modificadores:['idproducto','idmodificador','precio','idgruposmodificadores','idempresa']};
  for(const [table,fields] of Object.entries(specs)){
    const t=meta.tablas.find(x=>x.esquema.toLowerCase()==='dbo'&&x.tabla.toLowerCase()===table);
    if(!t||Number(t.puedeLeer)!==1||Number(t.puedeInsertar)!==1)throw error('La tabla '+table+' no permite lectura e inserción comprobadas.','COMPUESTOS_ESTRUCTURA');
    if(fields.some(x=>!columna(meta,table,x)))throw error('Faltan columnas de productos compuestos en '+table+'.','COMPUESTOS_ESTRUCTURA');
    if(meta.disparadores.some(t=>t.esquema.toLowerCase()==='dbo'&&t.tabla.toLowerCase()===table&&!t.deshabilitado))throw error('Hay disparadores de modificadores no revisados.','COMPUESTOS_ESTRUCTURA');
    const allowed=Object.keys(specs).includes(table)?{gruposmodificadores:['idgruposmodificadores'],gruposmodificadoresproductos:['idproducto','idgruposmodificadores','idempresa'],modificadores:['idproducto','idmodificador','idgruposmodificadores','idempresa']}[table]:[];
    for(const c of meta.columnas.filter(x=>x.esquema.toLowerCase()==='dbo'&&x.tabla.toLowerCase()===table)){
      if(!c.admiteNulo&&!c.identidad&&!c.calculada&&c.valorDefecto==null&&!allowed.includes(c.columna.toLowerCase())&&!fields.includes(c.columna.toLowerCase()))throw error('Campo obligatorio sin regla revisada: '+table+'.'+c.columna,'COMPUESTOS_ESTRUCTURA');
    }
  }
  const requiredFK=[['gruposmodificadoresproductos','idproducto','productos'],['gruposmodificadoresproductos','idgruposmodificadores','gruposmodificadores'],['modificadores','idproducto','productos'],['modificadores','idgruposmodificadores','gruposmodificadores']];
  for(const [from,key,to] of requiredFK)if(!meta.relaciones.some(x=>x.tablaOrigen.toLowerCase()===from&&x.columnaOrigen.toLowerCase()===key&&x.tablaDestino.toLowerCase()===to&&!x.deshabilitada))throw error('No se verificó la relación '+from+'.'+key+' → '+to+'.','COMPUESTOS_ESTRUCTURA');
  if(!columna(meta,'productosdetalle','secuenciacompuesto')||!columna(meta,'productosdetalle','finalizarsecuenciacompuesto'))throw error('Faltan campos de secuencia de productos compuestos.','COMPUESTOS_ESTRUCTURA');
}
function asegurarOpciones(p){
  if(p.tipo!=='con_opciones'||!Array.isArray(p.modificadores)||!p.modificadores.length)throw error('El producto '+p.nombre+' no tiene grupos de modificadores válidos.','COMPUESTO_INCOMPLETO');
  if(p.modificadores.length>8)throw error('Hay demasiados grupos de opciones en '+p.nombre+'.');
  const usados=new Set();
  for(const m of p.modificadores){
    if(!m||!m.nombre||typeof m.nombre!=='string'||!Array.isArray(m.opciones)||!m.opciones.length||m.opciones.length>35)throw error('Faltan opciones del producto '+p.nombre+'.');
    if(m.obligatorio!==true||Number(m.minimo)!==1||Number(m.maximo)!==1)throw error('Confirma selección obligatoria de exactamente una opción en '+p.nombre+' / '+m.nombre+'.','COMPUESTO_INCOMPLETO');
    const n=normalizar(m.nombre);if(usados.has(n))throw error('Grupo de modificadores duplicado: '+m.nombre);usados.add(n);
    const names=new Set();
    for(const o of m.opciones){if(!o||typeof o.nombre!=='string'||!o.nombre.trim()||!validMoney(o.precio)||o.nombre.trim().length>60)throw error('Precio o nombre sin confirmar en '+m.nombre+'.','COMPUESTO_INCOMPLETO');
      const id=normalizar(o.nombre);if(names.has(id))throw error('Opción duplicada en '+m.nombre+'.');names.add(id);
    }
  }
}
function codigoDisponible(used,limit,width){for(let n=1;n<=limit;n++){const id=String(n).padStart(width,'0');if(!used.has(id)){used.add(id);return id;}}throw error('Se agotaron las claves para grupos de modificadores.');}
function productoModificadorExistente(catalogo,grupos,nombre,auxiliar,clasificacion){
  const candidatos=catalogo.filter(p=>normalizar(p.descripcion)===normalizar(nombre));
  const delAuxiliar=candidatos.filter(p=>trim(p.idgrupo)===auxiliar);
  if(delAuxiliar.length>1)throw error('Hay varios modificadores llamados '+nombre+' en el mismo catálogo. Selecciona la opción correcta antes de guardar.','MODIFICADOR_AMBIGUO');
  if(delAuxiliar.length===1)return delAuxiliar[0];
  // Reutilizar artículos auxiliares aunque estén en un catálogo anterior.
  // No confundir una opción de alimentos con otra de clasificación diferente.
  const compatibles=candidatos.filter(p=>{
    const grupo=grupos.find(g=>trim(g.idgrupo)===trim(p.idgrupo));
    return grupo&&(clasificacion==null||Number(grupo.clasificacion)===clasificacion);
  });
  if(compatibles.length>1)throw error('Hay varios productos existentes llamados '+nombre+'. No se elegirá una clave arbitrariamente.','MODIFICADOR_AMBIGUO');
  if(compatibles.length===1)return compatibles[0];
  // Caso histórico: el artículo auxiliar fue creado en un grupo con una
  // clasificación distinta. Si su nombre es inequívoco, puede asociarse sin
  // moverlo, cambiarle la clasificación ni modificar su precio propio.
  if(candidatos.length>1)throw error('Hay varios productos existentes llamados '+nombre+'. No se elegirá una clave arbitrariamente.','MODIFICADOR_AMBIGUO');
  return candidatos[0]||null;
}
// Es determinista respecto al catálogo leído; confirmación recalcula bajo locks.
function preparar(input,catalogo,grupos,modGroups,meta){
  const source=(input.productos||[]).filter(p=>p.tipo==='con_opciones');
  if(!source.length)return {input,compuestos:[],grupoAux:null,requiere:false};
  checkedMeta(meta);
  for(const p of source)asegurarOpciones(p);
  const list=structuredClone(input.productos);
  const options=[],composites=[],newNames=new Map(),groups=[...(input.grupos||[])];
  const auxByClass=new Map();
  for(const p of source){
    const principal=grupos.find(g=>trim(g.idgrupo)===trim(p.idgrupo))||
      groups.find(g=>'borrador:'+g.id===p.idgrupo);
    const clase=[1,2,3].includes(Number(principal?.clasificacion))?Number(principal.clasificacion):null;
    const classKey=clase??('grupo:'+trim(p.idgrupo));
    let auxiliary=auxByClass.get(classKey);
    if(!auxiliary){
      if(clase===null)throw error('No se comprobó la clasificación del grupo de '+p.nombre+'. Prepara su categoría primero en Soft Restaurant.','CLASIFICACION_SIN_REFERENCIA');
      // Reutilizar un catálogo existente SOLO si su nombre y su clasificación
      // corresponden. Un catálogo histórico llamado BEBIDAS no debe usarse
      // para hamburguesas aunque su clasificación haya quedado invertida.
      const etiquetas={1:'MODIFICADORES BEBIDAS',2:'MODIFICADORES ALIMENTOS',3:'MODIFICADORES OTROS'};
      const nombre=etiquetas[clase];
      const candidatos=grupos.filter(g=>Number(g.clasificacion)===clase);
      const exactos=candidatos.filter(g=>normalizar(g.descripcion)===normalizar(nombre));
      const genericos=candidatos.filter(g=>normalizar(g.descripcion)==='modificadores');
      if(exactos.length>1||(!exactos.length&&genericos.length>1))throw error('Hay catálogos de modificadores repetidos para esta clasificación. Revísalos en Soft Restaurant.');
      if(exactos.length||genericos.length)auxiliary=trim((exactos[0]||genericos[0]).idgrupo);
      else {
        const existeNombreMalClasificado=grupos.some(g=>normalizar(g.descripcion)===normalizar(nombre));
        if(existeNombreMalClasificado)throw error('Ya existe '+nombre+' con otra clasificación SQL. Corrige esa categoría antes de crear productos.','MODIFICADORES_CLASIFICACION');
        const alias='__restaurante_mod_'+String(classKey)+'__';
        // Un catálogo auxiliar por clasificación, no por el título OCR del menú.
        // dbo.grupos.descripcion es VARCHAR(30) en la instalación verificada.
        stringValue(columna(meta,'grupos','descripcion'),nombre,'Catálogo de modificadores');
        auxiliary='borrador:'+alias;
        groups.push({id:alias,nombre,clasificacion:clase});
      }
      auxByClass.set(classKey,auxiliary);
    }
    const components=[];
    for(const [index,m] of p.modificadores.entries()){
      stringValue(columna(meta,'gruposmodificadores','descripcion'),m.nombre,'Grupo de modificadores');
      const optionRows=[];
      for(const [i,o] of m.opciones.entries()){
        const existente=productoModificadorExistente(catalogo,grupos,o.nombre,auxiliary,clase);
        const ident=`__mod__${p.id||p.clave}_${index}_${i}`;
        let idCreado=null;
        if(!existente){
          // El catálogo de dbo.productos exige nombres únicos en TODO el lote,
          // incluso entre bebidas y alimentos. Una opción se crea una sola vez.
          const signature=normalizar(o.nombre);
          if(!newNames.has(signature)){
            newNames.set(signature,ident);
            options.push({id:ident,nombre:o.nombre,precio:0,idgrupo:auxiliary,tipo:'independiente',modificadores:[],ingredientes:[],revisado:true,excluido:false,clave:''});
          }
          idCreado=newNames.get(signature);
        }
        optionRows.push({nombre:o.nombre,grupoAux:existente?trim(existente.idgrupo):auxiliary,adicional:o.precio,idCreado,idExistente:existente?trim(existente.idproducto):null});
      }
      components.push({nombre:m.nombre,orden:index+1,opciones:optionRows});
    }
    composites.push({producto:p.id,clave:trim(p.clave),nombre:p.nombre,grupos:components});
  }
  const products=list.map(p=>p.tipo==='con_opciones'?{...p,tipo:'independiente',modificadores:[],opcionesVisualesPendientes:[]}:p).concat(options);
  return {input:{...input,productos:products,grupos:groups},compuestos:composites,requiere:true};
}
// El plan de menú usa "idgrupo" como identificador lógico compartido por
// los componentes. Al insertar en dbo.gruposmodificadores la columna REAL
// es idgruposmodificadores; nunca se debe pasar el objeto del plan directo
// a la función genérica de inserción SQL.
function valoresGrupoModificador(grupo,meta){
  if(!grupo||typeof grupo!=="object")throw error('Falta un grupo de modificadores.','COMPUESTOS_ESTRUCTURA');
  const id=stringValue(columna(meta,'gruposmodificadores','idgruposmodificadores'),grupo.idgrupo,'Clave del grupo modificador');
  const descripcion=stringValue(columna(meta,'gruposmodificadores','descripcion'),grupo.descripcion,'Nombre del grupo modificador');
  return {idgruposmodificadores:id,descripcion};
}
// Validación de inserciones completas ANTES de abrir una transacción.
// Las opciones ya existentes usan su clave y nunca son insertadas otra vez.
function validarPlanDeCompuestos(plan,meta){
  if(!Array.isArray(plan?.compuestos)||plan.compuestos.length===0)return;
  checkedMeta(meta);
  const created=plan.gruposDeModificadores||[];
  const ids=new Set(), names=new Set();
  for(const group of created){
    const dbValues=valoresGrupoModificador(group,meta);
    if(ids.has(dbValues.idgruposmodificadores)||names.has(normalizar(dbValues.descripcion)))throw error('Se repite un grupo de modificadores en el lote.','COMPUESTOS_DUPLICADOS');
    ids.add(dbValues.idgruposmodificadores);names.add(normalizar(dbValues.descripcion));
  }
  const products=new Set((plan.productos||[]).map(p=>trim(p.clave)));
  const mains=new Set();
  for(const main of plan.compuestos){
    if(!products.has(trim(main.clave))||mains.has(trim(main.clave)))throw error('Producto compuesto principal duplicado o ausente.','COMPUESTOS_ESTRUCTURA');
    mains.add(trim(main.clave));
    if(!Array.isArray(main.grupos)||!main.grupos.length)throw error('Un producto compuesto no tiene opciones.','COMPUESTOS_ESTRUCTURA');
    const groupIDs=new Set();
    for(const group of main.grupos){
      const id=stringValue(columna(meta,'gruposmodificadores','idgruposmodificadores'),group.idgrupo,'Clave del grupo modificador');
      if(groupIDs.has(id))throw error('Un grupo de modificadores se repite dentro del mismo producto.','COMPUESTOS_DUPLICADOS');
      groupIDs.add(id);
      if(!Number.isInteger(group.orden)||group.orden<1)throw error('Secuencia de modificadores inválida.','COMPUESTOS_ESTRUCTURA');
      if(!Array.isArray(group.opciones)||group.opciones.length<1)throw error('Faltan opciones en '+group.nombre+'.','COMPUESTOS_ESTRUCTURA');
      const options=new Set();
      for(const o of group.opciones){
        const key=stringValue(columna(meta,'productos','idproducto'),o.clave,'Clave de opción');
        if(options.has(key)||!validMoney(o.precio))throw error('Opción duplicada o importe inválido en '+group.nombre+'.','COMPUESTOS_DUPLICADOS');
        options.add(key);
      }
    }
  }
  if(!plan.referenciaCompuesta||Number(plan.referenciaCompuesta.forzarcaptura)!==1||Number(plan.referenciaCompuesta.maximomodificadores)!==1||Number(plan.referenciaCompuesta.incluidos)!==0)throw error('La referencia SQL no demuestra selección obligatoria única.','REFERENCIA_COMPUESTO');
}
function completar(plan,prepared,existingGroups,productCatalog,modifyGroups,reference){
  if(!prepared.requiere)return plan;
  const byId=new Map(plan.productos.map(p=>[p.id,p]));
  const groups=modifyGroups.map(g=>({id:trim(g.idgruposmodificadores),nombre:trim(g.descripcion)}));
  const ids=new Set(groups.map(g=>g.id));
  const maxLen=length(reference.idCol);const width=Math.min(2,maxLen),limit=10**Math.min(5,maxLen)-1;
  const all=[];
  for(const original of prepared.compuestos){
    const main=byId.get(original.producto);if(!main)throw error('Falta producto principal en el plan.');
    const selections=[];
    for(const mod of original.grupos){
      let group=groups.find(g=>normalizar(g.nombre)===normalizar(mod.nombre));
      if(!group){group={id:codigoDisponible(ids,limit,width),nombre:mod.nombre,nuevo:true};groups.push(group);}
      const opts=mod.opciones.map(o=>{
        // La opción se vincula por idproducto, no por el catálogo auxiliar.
        // planMenu puede reutilizar una opción compartida entre distintos
        // grupos y no exponer un grupoAux individual para cada aparición.
        // Validar únicamente que exista una clave real de opción en el plan.
        // Las opciones compartidas pueden haberse creado bajo otra clasificación.
        // Resolver primero por grupo y luego por nombre único dentro del lote.
        const add=o.idCreado?plan.productos.find(p=>p.id===o.idCreado):null;
        const key=o.idExistente||add?.clave;
        if(!key)throw error('Falta registrar el modificador '+o.nombre+'.');
        return {nombre:o.nombre,clave:trim(key),precio:o.adicional};
      });
      selections.push({idgrupo:group.id,nombre:group.nombre,nuevo:!!group.nuevo,orden:mod.orden,opciones:opts});
    }
    all.push({producto:original.producto,clave:main.clave,grupos:selections});
  }
  const newGroups=groups.filter(g=>g.nuevo).map(g=>({idgrupo:g.id,descripcion:g.nombre}));
  const planOut={...plan,compuestos:all,gruposDeModificadores:newGroups,referenciaCompuesta:reference.defaults,origenReferenciaCompuesta:reference.origen||'producto_existente'};
  return planOut;
}
module.exports={checkedMeta,asegurarOpciones,preparar,completar,groupName,valoresGrupoModificador,validarPlanDeCompuestos};
