'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {inspeccionar}=require('./menu_diagnostico');
const C=require('./menu_contrato');
const Perfil=require('./menu_perfil_sql');
const Compuestos=require('./menu_compuestos');
const PerfilCompuesto=require('./menu_perfil_compuesto');
const GrupoConfig=require('./menu_grupo_config');
const InicioLimpio=require('./menu_inicio_limpio');
const {q,trim,error,hash,columna}=C;
function tipo(sql,c) {
  const type=String(c.tipo).toLowerCase();
  const strings={varchar:sql.VarChar,nvarchar:sql.NVarChar,char:sql.Char,nchar:sql.NChar};
  if(strings[type])return strings[type](C.length(c)===Infinity?sql.MAX:C.length(c));
  if(type==='numeric'||type==='decimal')return sql.Decimal(c.precision,c.escala);
  const types={bit:sql.Bit,tinyint:sql.TinyInt,smallint:sql.SmallInt,int:sql.Int,bigint:sql.BigInt,money:sql.Money,smallmoney:sql.SmallMoney,float:sql.Float,real:sql.Real};
  if(!types[type])throw error('Tipo SQL no compatible para '+c.columna+'.');return types[type];
}
async function consultarEnSerie(consultas) {
  const resultados=[];
  for (const consulta of consultas) resultados.push(await consulta());
  return resultados;
}
function persistir(dir,id,data) {
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const target=path.join(dir,id+'.json'),tmp=target+'.tmp';
  const fd=fs.openSync(tmp,'w',0o600);
  try{fs.writeFileSync(fd,JSON.stringify(data,null,2));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  fs.renameSync(tmp,target);
}
function historial(dir,id) {if(!/^[a-f0-9]{48}$/.test(id))throw error('Identificador de operación inválido.');try{return JSON.parse(fs.readFileSync(path.join(dir,id+'.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
function redactError(e) {
  if(e.codigo)return e.message;
  if(e.code==='EREQINPROG')return 'Hay una solicitud SQL todavía en ejecución dentro de la misma transacción. No se debe reintentar sin comprobar el estado del lote.';
  // Los mensajes arbitrarios del controlador pueden contener servidor, usuario o parámetros.
  const number=Number(e.number||e.originalError?.info?.number)||null;
  if([2601,2627].includes(number))return 'SQL detectó una clave o valor único repetido. Actualiza el catálogo y revisa el lote.';
  if(number===547)return 'Una relación o restricción de SQL rechazó el lote. Revisa la compatibilidad y los datos.';
  if([8152,2628].includes(number))return 'Un dato supera la longitud admitida por SQL. El lote no fue confirmado.';
  return 'No se pudo completar la operación SQL. Revisa la conexión y el resultado de la operación antes de reintentar.';
}
// Estas consultas siempre usan metadatos del servidor y parámetros para los valores.
function crearServicio({conectar,sql,configDir,now=Date.now}) {
  const previews=new Map(),jobs=new Map(),preparaciones=new Map(),dir=path.join(configDir,'menu-operaciones');
  let sqlQueue=Promise.resolve();
  const request=ctx=>{const r=ctx.request?ctx.request():new sql.Request(ctx);
    if(ctx instanceof sql.Transaction)r.timeout=60000;
    return r;};
  async function meta(ctx) {return inspeccionar(request(ctx));}
  async function grupos(ctx,locked=false,m=null) {const extras=m&&['clasificacion','color','colorletra'].every(k=>columna(m,'grupos',k))?',clasificacion,color,colorletra':'';return (await request(ctx).query('SELECT idgrupo,descripcion'+extras+' FROM dbo.grupos'+(locked?' WITH (UPDLOCK,HOLDLOCK)':'')+' ORDER BY idgrupo')).recordset;}
  async function productos(ctx,locked=false) {return (await request(ctx).query('SELECT idproducto,descripcion,idgrupo FROM dbo.productos'+(locked?' WITH (UPDLOCK,HOLDLOCK)':'')+' ORDER BY idproducto')).recordset;}
  async function modelo(ctx,m,id,locked=false) {
    if(!id)return null;
    const columns=['idgrupo',...C.columnas(m,'grupos').map(c=>c.columna.toLowerCase()).filter(k=>C.ajustesGrupo.has(k))],r=request(ctx);
    r.input('id',tipo(sql,columna(m,'grupos','idgrupo')),C.stringValue(columna(m,'grupos','idgrupo'),id,'Grupo modelo'));
    const rows=(await r.query('SELECT '+columns.map(k=>q(columna(m,'grupos',k).columna)+' AS '+q(k)).join(',')+' FROM dbo.grupos'+(locked?' WITH (UPDLOCK,HOLDLOCK)':'')+' WHERE idgrupo=@id')).recordset;
    if(rows.length!==1)throw error('El grupo modelo ya no existe o no es único.');return rows[0];
  }
  // Sólo requiere modelo si hay columnas obligatorias sin DEFAULT. Un grupo
  // no se elige arbitrariamente cuando sus ajustes obligatorios son distintos.
  async function opcionesModelo(ctx,m,locked=false) {
    const campos=C.evaluar(m).grupos.ajustes;
    if(!campos.length)return {automatico:null,disponibles:[],requiereModelo:false};
    const cols=['idgrupo',...campos],query='SELECT '+cols.map(k=>q(columna(m,'grupos',k).columna)+' AS '+q(k)).join(',')+' FROM dbo.grupos'+(locked?' WITH (UPDLOCK,HOLDLOCK)':'')+' ORDER BY idgrupo';
    const rows=(await request(ctx).query(query)).recordset.filter(r=>campos.every(k=>r[k]!=null&&(typeof r[k]==='boolean'||typeof r[k]==='number'&&Number.isFinite(r[k]))));
    const signatures=new Set(rows.map(r=>JSON.stringify(campos.map(k=>Number(r[k])))));
    return {automatico:signatures.size===1?trim(rows[0].idgrupo):null,disponibles:rows.map(r=>trim(r.idgrupo)),requiereModelo:true};
  }
  async function resolverModelo(ctx,m,id,locked=false){
    if(id)return modelo(ctx,m,id,locked);
    const opts=await opcionesModelo(ctx,m,locked);
    if(!opts.requiereModelo)return null;
    if(!opts.automatico)throw error(opts.disponibles.length?'Los grupos tienen ajustes obligatorios diferentes. Selecciona un grupo existente como referencia.':'No hay grupos existentes con ajustes obligatorios completos. Crea el primer grupo desde Soft Restaurant.','MODELO_GRUPO_PENDIENTE');
    return modelo(ctx,m,opts.automatico,locked);
  }
  async function plantilla(ctx,m,ref,locked=false) {
    if(!ref||typeof ref.idproducto!=='string'||typeof ref.idempresa!=='string')throw error('Selecciona un producto existente como referencia de empresa y unidad.');
    const r=request(ctx);
    for(const k of ['idproducto','idempresa'])r.input(k,tipo(sql,columna(m,'productosdetalle',k)),C.stringValue(columna(m,'productosdetalle',k),ref[k],k));
    const fields=[...C.camposDetalle,...['impuestoimporte3','dev_impuestoimporte3'].filter(k=>columna(m,'productosdetalle',k))];
    const rows=(await r.query('SELECT '+fields.map(k=>q(columna(m,'productosdetalle',k).columna)+' AS '+q(k)).join(',')+' FROM dbo.productosdetalle'+(locked?' WITH (UPDLOCK,HOLDLOCK)':'')+' WHERE idproducto=@idproducto AND idempresa=@idempresa')).recordset;
    if(rows.length!==1)throw error('El producto de referencia no existe o tiene registros ambiguos.');return rows[0];
  }
  async function empresa(ctx,m){
    // La empresa se comprueba directamente en SQL: no depende de tener un producto modelo.
    const col=columna(m,'empresas','idempresa');
    if(!col)throw error('No está disponible el catálogo de empresas de Soft Restaurant.');
    const rows=(await request(ctx).query('SELECT TOP (2) idempresa FROM dbo.empresas ORDER BY idempresa')).recordset;
    const direct=Perfil.perfilEmpresa(rows);
    if(direct.estado!=='multiple')return direct;
    // En instalaciones con empresas históricas, sólo elegir automáticamente si
    // existe UNA empresa efectivamente usada en todos los detalles de productos.
    const used=(await request(ctx).query('SELECT DISTINCT TOP (2) d.idempresa FROM dbo.productosdetalle d INNER JOIN dbo.empresas e ON e.idempresa=d.idempresa WHERE d.idempresa IS NOT NULL ORDER BY d.idempresa')).recordset;
    const active=Perfil.perfilEmpresa(used);
    return active.estado==='unica'?{...active,origen:'empresa usada en productos existentes'}:direct;
  }
  async function unidades(ctx){
    return (await request(ctx).query('SELECT TOP (201) idunidad FROM dbo.udsmedida WHERE idunidad IS NOT NULL ORDER BY idunidad')).recordset;
  }
  async function modos(ctx,m,idempresa){
    const r=request(ctx).input('empresa',tipo(sql,columna(m,'productosdetalle','idempresa')),idempresa);
    const rows=(await r.query('SELECT DISTINCT TOP (10) precioabierto FROM dbo.productosdetalle WHERE idempresa=@empresa AND precioabierto IS NOT NULL ORDER BY precioabierto')).recordset;
    return [...new Set(rows.map(x=>Number(x.precioabierto)).filter(Number.isInteger))];
  }
  async function referencias(ctx,m,idempresa){
    if(!idempresa||!C.evaluar(m).productos.lista)return [];
    const extras=['impuestoimporte3','dev_impuestoimporte3'].filter(k=>columna(m,'productosdetalle',k)).map(k=>',d.'+q(k)).join('');
    // Filtrado por empresa y unidad registradas. El filtro aritmético fiscal se valida en JS
    // para no perder candidatos por redondeos o características de filas históricas.
    const r=request(ctx).input('empresa',tipo(sql,columna(m,'productosdetalle','idempresa')),idempresa);
    return (await r.query('SELECT TOP (2000) d.idproducto,p.descripcion,p.idgrupo,d.idempresa,d.idunidad,d.precio,d.preciosinimpuestos,d.excentoimpuestos,d.impuesto1,d.impuesto2,d.impuesto3,d.precioabierto,d.bloqueado'+extras+' FROM dbo.productosdetalle d JOIN dbo.productos p ON p.idproducto=d.idproducto JOIN dbo.udsmedida u ON u.idunidad=d.idunidad WHERE d.idempresa=@empresa AND d.bloqueado=0 AND d.idunidad IS NOT NULL AND d.precioabierto IS NOT NULL AND d.precio>=0 AND d.preciosinimpuestos>=0 AND d.impuesto1 BETWEEN 0 AND 100 ORDER BY d.idproducto')).recordset;
  }
  async function compatibilidad(){
    const db=await conectar(),m=await meta(db),cap=C.evaluar(m),company=await empresa(db,m);
    try{if(!cap.productos.lista)throw error('Antes debe ser compatible la creación de productos simples.');
      Compuestos.checkedMeta(m);await referenciaCompuestos(db,m);
      cap.modificadores={lista:true,motivos:[],referencia:'Una muestra real o el perfil verificado de Soft Restaurant 11, sujeto a compatibilidad de esquema; comprobación repetida al guardar.'};
    }catch(e){cap.modificadores={lista:false,motivos:[e.message]};}
    const modeloGrupos=cap.grupos.lista?await opcionesModelo(db,m):{automatico:null,disponibles:[],requiereModelo:cap.grupos.requiereModelo};
    if(company.estado!=='unica')return {correcto:true,soloLectura:true,...cap,empresa:company,modeloGrupos,referencias:[],referenciasLimitadas:false,unidades:[],modosPrecio:[],diagnosticoEmpresa:company.estado==='multiple'?'SQL contiene más de una empresa registrada. No se elegirá una sin comprobarla.':'No hay empresas registradas en dbo.empresas.'};
    const [all,uds,modes,stock]=await Promise.all([referencias(db,m,company.idempresa),unidades(db),modos(db,m,company.idempresa),request(db).query('SELECT COUNT_BIG(*) AS total FROM dbo.productos')]);
    const totalProductos=Number(stock.recordset?.[0]?.total??0);
    const refs=all.filter(C.plantillaValida);
    return {correcto:true,soloLectura:true,...cap,empresa:company,modeloGrupos,referencias:refs.slice(0,200),totalProductos,referenciasLimitadas:all.length>=2000,unidades:uds.slice(0,200),modosPrecio:Perfil.modosCompatibles(modes),modoPrecioRespaldo:modes.length===0,referenciaAutomatica:Perfil.seleccionarReferencia(refs.slice(0,200)),
      inicioCatalogo:InicioLimpio.estadoInicial({empresa:company,referencias:refs,totalProductos,unidades:uds,modosPrecio:modes,modoPrecioRespaldo:modes.length===0,modeloGrupos,productosCompatibles:cap.productos.lista,modificadoresCompatibles:cap.modificadores.lista})};
  }
  async function referenciaCompuestos(ctx,m){
    Compuestos.checkedMeta(m);
    // Nunca deducimos forzarcaptura sólo por la columna: buscamos una muestra
    // efectiva con una única selección obligatoria creada desde Soft Restaurant.
    const sample=(await request(ctx).query(`SELECT TOP (1) a.idproducto,a.idempresa,a.forzarcaptura,a.incluidos,a.maximomodificadores,a.captura_incluido,
      d.secuenciacompuesto,d.finalizarsecuenciacompuesto FROM dbo.gruposmodificadoresproductos a
      JOIN dbo.productosdetalle d ON d.idproducto=a.idproducto AND d.idempresa=a.idempresa
      WHERE a.forzarcaptura=1 AND a.maximomodificadores=1 AND a.incluidos=0
      AND a.captura_incluido IS NOT NULL AND d.secuenciacompuesto IS NOT NULL
      AND d.finalizarsecuenciacompuesto IS NOT NULL ORDER BY a.idproducto`)).recordset[0];
    // En una instalación limpia no exigimos productos de prueba. Reutilizamos
    // exclusivamente el perfil observado, tras verificar los tipos SQL reales.
    if(!sample)return PerfilCompuesto.referencia(m);
    return {idCol:columna(m,'gruposmodificadores','idgruposmodificadores'),defaults:{
      incluidos:Number(sample.incluidos),forzarcaptura:Number(sample.forzarcaptura),
      maximomodificadores:Number(sample.maximomodificadores),captura_incluido:Number(sample.captura_incluido),
      secuenciacompuesto:Boolean(sample.secuenciacompuesto),finalizarsecuenciacompuesto:Boolean(sample.finalizarsecuenciacompuesto)
    }};
  }
  async function verificarClasificaciones(ctx,m){
    // El código de dbo.grupos.clasificacion se comprueba contra el catálogo
    // instalado; no equivale al ordinal que mostraba la UI antigua.
    if(!columna(m,'gruposiclasificacion','clasificacionventa')||!columna(m,'gruposiclasificacion','descripcion'))
      throw error('No se encontró el catálogo de clasificaciones de Soft Restaurant. No se crearán grupos con códigos supuestos.','CLASIFICACIONES_NO_VERIFICADAS');
    const rows=(await request(ctx).query('SELECT descripcion,clasificacionventa FROM dbo.gruposiclasificacion')).recordset;
    if(!GrupoConfig.verificarCatalogoSQL(rows))
      throw error('Las claves de Alimentos, Bebidas u Otros no coinciden con los valores reales de Soft Restaurant. No se crearán grupos.','CLASIFICACIONES_NO_VERIFICADAS');
  }
  async function construir(ctx,m,tipo,input,locked=false) {
    const cap=C.evaluar(m);
    if(tipo==='grupo_ajustes'){
      if(!cap.grupos.lista)throw error(cap.grupos.motivos.join(' '),'ESTRUCTURA_PENDIENTE');
      const check=await request(ctx).query("SELECT HAS_PERMS_BY_NAME('dbo.grupos','OBJECT','UPDATE') AS puedeActualizar");
      if(Number(check.recordset?.[0]?.puedeActualizar)!==1)throw error('Esta conexión SQL no tiene permiso para corregir grupos.');
      return C.planAjusteGrupo(m,await grupos(ctx,locked,m),input);
    }
    if(tipo==='grupos'){
      if(!cap.grupos.lista)throw error(cap.grupos.motivos.join(' '),'ESTRUCTURA_PENDIENTE');
      await verificarClasificaciones(ctx,m);
      return C.planGrupos(m,await grupos(ctx,locked,m),input.grupos,await resolverModelo(ctx,m,input.modelo,locked));
    }
    if(!cap.productos.lista)throw error(cap.productos.motivos.join(' '),'ESTRUCTURA_PENDIENTE');
    const company=await empresa(ctx,m);
    if(company.estado!=='unica')throw error('SQL no tiene una sola empresa comprobada. No se adivinará el identificador de empresa.','EMPRESA_NO_UNICA');
    let ref;
    if(input.configuracionAlternativa){
      const modosExistentes=await modos(ctx,m,company.idempresa);
      // Un SQL sin productos no proporciona un perfil fiscal: sólo la confirmación
      // explícita del negocio permite escoger impuestos y modo de precio.
      InicioLimpio.validarConfirmacionFiscal(input,modosExistentes);
      ref=Perfil.perfilAlternativo(input.configuracionAlternativa,company.idempresa,await unidades(ctx),modosExistentes);
    }else if(input.plantilla?.idproducto&&input.plantilla?.idempresa){
      if(trim(input.plantilla.idempresa)!==company.idempresa)throw error('La empresa indicada no coincide con la única registrada en SQL.');
      ref=await plantilla(ctx,m,input.plantilla,locked);
    }else{
      const available=(await referencias(ctx,m,company.idempresa)).filter(C.plantillaValida);
      const chosen=Perfil.seleccionarReferencia(available,input.grupoReferencia);
      if(!chosen)throw error('Se encontró la empresa '+company.idempresa+', pero no una unidad y regla fiscal comprobadas. Revisa la configuración fiscal en el resumen.','CONFIGURACION_NO_VERIFICADA');
      ref=await plantilla(ctx,m,{idproducto:trim(chosen.idproducto),idempresa:company.idempresa},locked);
    }
    const ps=await productos(ctx,locked),gs=await grupos(ctx,locked,m);
    if(tipo==='menu'){
      const hasCompounds=Array.isArray(input.productos)&&input.productos.some(p=>p.tipo==='con_opciones');
      if(hasCompounds||Array.isArray(input.grupos)&&input.grupos.some(g=>
        input.productos.some(p=>p.idgrupo==='borrador:'+g.id))) await verificarClasificaciones(ctx,m);
      const prep=Compuestos.preparar(input,ps,gs,[],m);
      const work=prep.input;
      const needsGroupModel=Array.isArray(work.productos)&&work.productos.some(p=>typeof p.idgrupo==='string'&&p.idgrupo.startsWith('borrador:'));
      const plan=C.planMenu(m,ps,gs,work,ref,needsGroupModel?await resolverModelo(ctx,m,input.modelo,locked):null);
      if(!hasCompounds)return plan;
      // mssql sólo admite UNA solicitud activa por transacción. Promise.all aquí
      // provocaba EREQINPROG al confirmar lotes con productos compuestos.
      const [modifierGroups,reference]=await consultarEnSerie([
        ()=>request(ctx).query('SELECT idgruposmodificadores,descripcion FROM dbo.gruposmodificadores'+(locked?' WITH (UPDLOCK,HOLDLOCK)':'')+' ORDER BY idgruposmodificadores'),
        ()=>referenciaCompuestos(ctx,m)
      ]);
      const compuesto=Compuestos.completar(plan,prep,gs,ps,modifierGroups.recordset,reference);
      Compuestos.validarPlanDeCompuestos(compuesto,m);
      return compuesto;
    }
    return C.planProductos(m,ps,gs,input,ref);
  }
  async function previsualizar(type,input,owner) {
    for(const [id,p] of previews)if(p.expires<now())previews.delete(id);
    if(previews.size>=100)throw error('Hay demasiadas revisiones abiertas. Espera unos minutos.');
    const db=await conectar(),m=await meta(db),plan=await construir(db,m,type,input);
    const token=crypto.randomBytes(24).toString('hex'),expires=now()+10*60000;
    previews.set(token,{plan,input:structuredClone(input),owner,expires,state:'lista'});
    return {correcto:true,soloLectura:true,token,vence:new Date(expires).toISOString(),plan,confirmacion:type==='grupos'?'CREAR GRUPOS':type==='grupo_ajustes'?'ACTUALIZAR GRUPO':type==='menu'?'IMPORTAR MENU':'IMPORTAR PRODUCTOS'};
  }
  async function insert(ctx,m,table,values) {
    const r=request(ctx),pairs=Object.entries(values);
    for(let i=0;i<pairs.length;i++){const [name,value]=pairs[i],c=columna(m,table,name);if(!c)throw error('Campo no comprobado: '+table+'.'+name);r.input('v'+i,tipo(sql,c),value);}
    await r.query('INSERT INTO '+q('dbo')+'.'+q(table)+' ('+pairs.map(([k])=>q(columna(m,table,k).columna)).join(',')+') VALUES ('+pairs.map((_,i)=>'@v'+i).join(',')+')');
  }
  async function ejecutarPlan(tx,m,plan) {
    // Sin escrituras hasta comprobar que todas las columnas de modificadores
    // corresponden exactamente al esquema de esta instalación.
    Compuestos.validarPlanDeCompuestos(plan,m);
    let resultGrupos=null;
    if(plan.tipo==='menu'&&plan.grupos.length)resultGrupos=await ejecutarPlan(tx,m,{tipo:'grupos',grupos:plan.grupos});
    if(plan.tipo==='grupo_ajustes'){
      const g=plan.grupo,r=request(tx);
      r.input('id',tipo(sql,columna(m,'grupos','idgrupo')),g.idgrupo);
      for(const key of ['clasificacion','color','colorletra'])r.input(key,tipo(sql,columna(m,'grupos',key)),g[key]);
      const update=await r.query('UPDATE dbo.grupos SET clasificacion=@clasificacion,color=@color,colorletra=@colorletra WHERE idgrupo=@id');
      if(update.rowsAffected?.[0]!==1)throw error('SQL no actualizó exactamente un grupo. Se revierte el cambio.');
      const verify=await request(tx).input('id',tipo(sql,columna(m,'grupos','idgrupo')),g.idgrupo).query('SELECT idgrupo,descripcion,clasificacion,color,colorletra FROM dbo.grupos WHERE idgrupo=@id');
      const rows=verify.recordset;if(rows.length!==1||trim(rows[0].descripcion)!==g.nombre||['clasificacion','color','colorletra'].some(key=>Number(rows[0][key])!==g[key]))throw error('No se conservó el estilo y clasificación del grupo. Se revierte el cambio.');
      return {grupoActualizado:g,creados:0};
    }
    if(plan.tipo==='grupos'){
      for(const g of plan.grupos.filter(x=>x.accion==='crear')){
        await insert(tx,m,'grupos',{idgrupo:g.idgrupo,descripcion:g.nombre,...g.ajustes});
        const r=request(tx).input('clave',tipo(sql,columna(m,'grupos','idgrupo')),g.idgrupo);
        const names=Object.keys(g.ajustes||{});const rows=(await r.query('SELECT idgrupo,descripcion'+names.map(k=>','+q(k)).join('')+' FROM dbo.grupos WHERE idgrupo=@clave')).recordset;
        if(rows.length!==1||trim(rows[0].idgrupo)!==g.idgrupo||trim(rows[0].descripcion)!==g.nombre||names.some(k=>rows[0][k]==null||Number(rows[0][k])!==Number(g.ajustes[k])))throw error('SQL no conservó la clasificación, el color o los datos del grupo. Se revierte el lote.');
      }
      return {grupos:plan.grupos,creados:plan.grupos.filter(x=>x.accion==='crear').length,existentes:plan.grupos.filter(x=>x.accion==='existente').length};
    }
    const t=plan.plantilla,s=plan.servicios;
    // Validar también los catálogos elegidos cuando no hay FK declarada.
    for(const [table,key,val] of [['empresas','idempresa',t.idempresa],['udsmedida','idunidad',t.idunidad]]){
      if(!columna(m,table,key))throw error('Falta comprobar el catálogo '+table+'.');
      const r=request(tx).input('ref',tipo(sql,columna(m,table,key)),val);
      const rows=(await r.query('SELECT '+q(key)+' FROM dbo.'+q(table)+' WITH (HOLDLOCK) WHERE '+q(key)+'=@ref')).recordset;
      if(rows.length!==1)throw error('La empresa o unidad de referencia no es única o no existe.');
    }
    const clavesCompuestas=new Set((plan.compuestos||[]).map(c=>c.clave));
    for(const p of plan.productos){
      // El trigger INSTEAD OF INSERT observado borra detalles de la misma clave.
      // Impedirlo aun si hay huérfanos u otra empresa. TABLOCKX suple el índice
      // ausente durante esta transacción, también frente al POS original.
      const occupied=await request(tx).input('clave',tipo(sql,columna(m,'productosdetalle','idproducto')),p.clave).query('SELECT idproducto,idempresa FROM dbo.productosdetalle WITH (TABLOCKX,HOLDLOCK) WHERE idproducto=@clave');
      if(occupied.recordset.length)throw error('Ya existen precios para la clave '+p.clave+'. No se reemplazarán; se revierte el lote.');
      await insert(tx,m,'productos',{idproducto:p.clave,descripcion:p.nombre,idgrupo:p.idgrupo,usarcomedor:s.comedor,usardomicilio:s.domicilio,usarrapido:s.rapido,...(p.detalle?{descripcion_detalle:p.detalle}:{})});
      await insert(tx,m,'productosdetalle',{idproducto:p.clave,idempresa:t.idempresa,idunidad:t.idunidad,precio:p.precio,preciosinimpuestos:p.preciosinimpuestos,impuesto1:t.impuesto1,impuesto2:t.impuesto2,impuesto3:t.impuesto3,excentoimpuestos:t.excentoimpuestos,precioabierto:t.precioabierto,bloqueado:0,
        ...(clavesCompuestas.has(p.clave)?{secuenciacompuesto:plan.referenciaCompuesta.secuenciacompuesto,finalizarsecuenciacompuesto:plan.referenciaCompuesta.finalizarsecuenciacompuesto}:{})});
      const r=request(tx).input('clave',tipo(sql,columna(m,'productos','idproducto')),p.clave).input('empresa',tipo(sql,columna(m,'productosdetalle','idempresa')),t.idempresa);
      const rows=(await r.query('SELECT p.descripcion,p.idgrupo,p.usarcomedor,p.usardomicilio,p.usarrapido'+(p.detalle?',p.descripcion_detalle':'')+',d.idunidad,d.precio,d.preciosinimpuestos,d.excentoimpuestos,d.impuesto1,d.impuesto2,d.impuesto3,d.precioabierto,d.bloqueado FROM dbo.productos p JOIN dbo.productosdetalle d ON p.idproducto=d.idproducto WHERE p.idproducto=@clave AND d.idempresa=@empresa')).recordset;
      const v=rows[0];
      if(rows.length!==1||trim(v.descripcion)!==p.nombre||trim(v.idgrupo)!==p.idgrupo||Number(v.precio)!==p.precio||Number(v.preciosinimpuestos)!==p.preciosinimpuestos||trim(v.idunidad)!==trim(t.idunidad)||['impuesto1','impuesto2','impuesto3','excentoimpuestos','precioabierto'].some(k=>v[k]==null||Number(v[k])!==Number(t[k]))||v.bloqueado==null||Number(v.bloqueado)!==0||['comedor','domicilio','rapido'].some(k=>Boolean(v['usar'+k])!==s[k])||(p.detalle&&v.descripcion_detalle!==p.detalle))throw error('La verificación del producto '+p.clave+' no coincide. Se revierte todo el lote.');
      const allDetails=(await request(tx).input('clave',tipo(sql,columna(m,'productosdetalle','idproducto')),p.clave).query('SELECT idproducto,idempresa FROM dbo.productosdetalle WITH (TABLOCKX,HOLDLOCK) WHERE idproducto=@clave')).recordset;
      if(allDetails.length!==1||trim(allDetails[0].idempresa)!==trim(t.idempresa))throw error('La clave tiene detalles de precio inesperados. Se revierte el lote.');
    }
    if(plan.compuestos?.length){
      const ref=plan.referenciaCompuesta;
      for(const group of plan.gruposDeModificadores){
        await insert(tx,m,'gruposmodificadores',Compuestos.valoresGrupoModificador(group,m));
        const rows=(await request(tx).input('id',tipo(sql,columna(m,'gruposmodificadores','idgruposmodificadores')),group.idgrupo)
          .query('SELECT idgruposmodificadores,descripcion FROM dbo.gruposmodificadores WHERE idgruposmodificadores=@id')).recordset;
        if(rows.length!==1||trim(rows[0].descripcion)!==group.descripcion)throw error('No se pudo confirmar el nuevo grupo de modificadores.');
      }
      for(const main of plan.compuestos){
        const sequence=(await request(tx).input('clave',tipo(sql,columna(m,'productosdetalle','idproducto')),main.clave)
          .input('empresa',tipo(sql,columna(m,'productosdetalle','idempresa')),t.idempresa)
          .query('SELECT secuenciacompuesto,finalizarsecuenciacompuesto FROM dbo.productosdetalle WHERE idproducto=@clave AND idempresa=@empresa')).recordset;
        if(sequence.length!==1||Boolean(sequence[0].secuenciacompuesto)!==ref.secuenciacompuesto||Boolean(sequence[0].finalizarsecuenciacompuesto)!==ref.finalizarsecuenciacompuesto)throw error('No se conservaron las banderas del producto compuesto '+main.clave+'.');
        for(const group of main.grupos){
          // El padre y el grupo son nuevos, o un grupo de modificadores previamente
          // registrado. Nunca modificamos otra hamburguesa del catálogo.
          await insert(tx,m,'gruposmodificadoresproductos',{
            idproducto:main.clave,idgruposmodificadores:group.idgrupo,idempresa:t.idempresa,
            incluidos:ref.incluidos,prioridad:group.orden,forzarcaptura:ref.forzarcaptura,
            maximomodificadores:ref.maximomodificadores,captura_incluido:ref.captura_incluido
          });
          for(const o of group.opciones){
            const exists=(await request(tx).input('clave',tipo(sql,columna(m,'productos','idproducto')),o.clave)
              .query('SELECT idproducto FROM dbo.productos WITH (HOLDLOCK) WHERE idproducto=@clave')).recordset;
            if(exists.length!==1)throw error('No existe el producto modificador '+o.clave+'.');
            await insert(tx,m,'modificadores',{idproducto:main.clave,idmodificador:o.clave,
              precio:o.precio,idgruposmodificadores:group.idgrupo,idempresa:t.idempresa});
          }
          const a=(await request(tx).input('clave',tipo(sql,columna(m,'gruposmodificadoresproductos','idproducto')),main.clave)
            .input('empresa',tipo(sql,columna(m,'gruposmodificadoresproductos','idempresa')),t.idempresa)
            .input('group',tipo(sql,columna(m,'gruposmodificadoresproductos','idgruposmodificadores')),group.idgrupo)
            .query('SELECT incluidos,prioridad,forzarcaptura,maximomodificadores,captura_incluido FROM dbo.gruposmodificadoresproductos WHERE idproducto=@clave AND idempresa=@empresa AND idgruposmodificadores=@group')).recordset;
          if(a.length!==1||Number(a[0].forzarcaptura)!==1||Number(a[0].maximomodificadores)!==1||Number(a[0].incluidos)!==0||Number(a[0].captura_incluido)!==ref.captura_incluido||Number(a[0].prioridad)!==group.orden)throw error('Soft Restaurant no conservó la obligatoriedad del grupo '+group.nombre+'.');
          const opts=(await request(tx).input('clave',tipo(sql,columna(m,'modificadores','idproducto')),main.clave)
            .input('empresa',tipo(sql,columna(m,'modificadores','idempresa')),t.idempresa)
            .input('group',tipo(sql,columna(m,'modificadores','idgruposmodificadores')),group.idgrupo)
            .query('SELECT idmodificador,precio FROM dbo.modificadores WHERE idproducto=@clave AND idempresa=@empresa AND idgruposmodificadores=@group')).recordset;
          if(opts.length!==group.opciones.length||group.opciones.some(o=>opts.filter(v=>trim(v.idmodificador)===o.clave&&Math.abs(Number(v.precio)-o.precio)<0.00001).length!==1))throw error('No coinciden los precios de los modificadores '+group.nombre+'.');
        }
      }
    }
    return {productos:plan.productos,creados:plan.productos.length,empresa:t.idempresa,
      compuestosCreados:plan.compuestos?.length||0,gruposModificadoresCreados:plan.gruposDeModificadores?.length||0,
      ...(resultGrupos?{grupos:resultGrupos.grupos,gruposCreados:resultGrupos.creados}:{})};
  }
  async function confirmar(type,body,owner) {
    const {token,confirmacion}=body||{};
    if(typeof token!=='string'||!/^[a-f0-9]{48}$/.test(token))throw error('Primero revisa la vista previa de la operación.','PREVIA_REQUERIDA');
    let old;
    try{old=historial(dir,token);}catch{throw error('No se puede leer el registro de recuperación. Revisa los permisos de la carpeta de configuración; no se inició ninguna escritura SQL.','REGISTRO_NO_DISPONIBLE');}
    if(old){
      if(old.owner!==owner||old.plan.tipo!==type)throw error('Esta operación pertenece a otra sesión o tipo de operación.');
      if(old.estado==='confirmada')return {correcto:true,guardado:true,repetida:true,operacion:token,...old.resultado};
      throw error('La operación ya tiene un registro ('+old.estado+'). Consulta su resultado antes de generar otra importación.','OPERACION_REGISTRADA');
    }
    const p=previews.get(token);
    if(!p||p.owner!==owner||p.expires<now()||p.plan.tipo!==type)throw error('La revisión venció o pertenece a otra sesión. Vuelve a revisar.','PREVIA_REQUERIDA');
    if(confirmacion!==(type==='grupos'?'CREAR GRUPOS':type==='grupo_ajustes'?'ACTUALIZAR GRUPO':type==='menu'?'IMPORTAR MENU':'IMPORTAR PRODUCTOS'))throw error('Confirma la operación desde su resumen.');
    if(p.state!=='lista')throw error('La operación ya está en curso.','OPERACION_EN_CURSO');
    p.state='ejecutando';
    let tx,started=false,autoRevertido=false,commitAttempted=false,committed=false,etapa='preparacion',record={version:1,id:token,owner,fecha:new Date(now()).toISOString(),estado:'preparada',plan:p.plan};
    try{
      // La copia de recuperación es condición previa; nunca escribimos SQL si no pudo conservarse.
      persistir(dir,token,record);
      etapa='iniciando_transaccion';
      const db=await conectar();tx=new sql.Transaction(db);await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);started=true;
      tx.on?.('rollback',()=>{started=false;autoRevertido=true;});
      const lock=await request(tx).query("DECLARE @r int; EXEC @r=sys.sp_getapplock @Resource=N'Restaurante92Menu',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=10000; SELECT @r AS resultado;");
      if(Number(lock.recordset?.[0]?.resultado)<0||!Number.isInteger(lock.recordset?.[0]?.resultado))throw error('Hay otra operación de menú en curso. Espera y vuelve a revisar.');
      etapa='leyendo_metadatos';
      const m=await meta(tx);
      if(C.evaluar(m).huella!==p.plan.huella)throw error('La conexión o estructura cambió después de la revisión. Vuelve a consultar la compatibilidad.','ESTRUCTURA_CAMBIADA');
      etapa='revalidando_catalogo';
      const actual=await construir(tx,m,type,p.input,true);
      if(hash(actual)!==hash(p.plan))throw error('El catálogo cambió después de la revisión. Revisa de nuevo los grupos o productos.','CATALOGO_CAMBIADO');
      etapa='guardando_y_verificando';
      const result=await ejecutarPlan(tx,m,actual);
      record={...record,estado:'por_confirmar',resultado:result};persistir(dir,token,record);
      etapa='confirmando_transaccion';
      commitAttempted=true;await tx.commit();started=false;committed=true;
      record={...record,estado:'confirmada',confirmada:new Date(now()).toISOString()};
      try{persistir(dir,token,record);}catch{previews.delete(token);return {correcto:true,guardado:true,operacion:token,...result,aviso:'SQL confirmó el lote, pero no se pudo actualizar el registro local. No repitas la importación; consulta el catálogo.'};}
      previews.delete(token);return {correcto:true,guardado:true,operacion:token,...result};
    }catch(e){
      let reverted=autoRevertido;
      if(started)try{await tx.rollback();reverted=true;}catch{}
      record={...record,estado:committed?'confirmada':commitAttempted||!reverted?'resultado_incierto':'revertida',etapa,error:redactError(e),codigo:e.codigo||e.code||'SQL_ERROR',rollbackConfirmado:reverted};
      try{persistir(dir,token,record);}catch{}
      previews.delete(token);
      return {correcto:false,guardado:committed,resultadoIncierto:!committed&&!reverted,rollbackConfirmado:reverted,operacion:token,etapa,codigo:record.codigo,error:record.error+(!reverted?' La reversión no fue confirmada: revisa el catálogo antes de volver a importar.':'')};
    }
  }
  // Lanzar escritura en segundo plano: el teléfono no espera que termine la transacción.
  // Mismo token y mismo contrato SQL, sin reintentos automáticos de escrituras.
  function preparar(type,input,usuario){
    const id=crypto.randomBytes(24).toString('hex');
    const job={owner:usuario,estado:'procesando',fecha:now(),resultado:null};
    preparaciones.set(id,job);
    Promise.resolve().then(()=>previsualizar(type,input,usuario)).then(result=>{
      job.estado='lista';job.resultado=result;
    }).catch(e=>{job.estado='error';job.error=redactError(e);job.codigo=e.codigo||'ERROR_PREVIA';});
    for(const [key,item] of preparaciones)if(item.estado!=='procesando'&&now()-item.fecha>3600000)preparaciones.delete(key);
    return {correcto:true,id,estado:'procesando'};
  }
  function consultarPreparacion(id,usuario){
    const job=preparaciones.get(id);
    if(!job||job.owner!==usuario)return null;
    return {correcto:true,estado:job.estado,resultado:job.resultado,error:job.error,codigo:job.codigo};
  }
  function iniciar(type,body,usuario){
    const token=body?.token;
    if(typeof token!=='string'||!/^[a-f0-9]{48}$/.test(token))throw error('Primero prepara el lote.');
    const same=jobs.get(token);
    if(same){if(same.owner!==usuario||same.type!==type)throw error('Esta operación pertenece a otra sesión.');
      return {correcto:true,aceptado:true,operacion:token,estado:same.estado};}
    const previous=historial(dir,token);
    if(previous){if(previous.owner!==usuario||previous.plan.tipo!==type)throw error('La operación pertenece a otra sesión.');
      return {correcto:true,aceptado:false,operacion:token,estado:previous.estado};}
    const candidate=previews.get(token);
    if(!candidate||candidate.owner!==usuario||candidate.plan.tipo!==type||candidate.expires<now())throw error('La revisión caducó. Vuelve a preparar el lote.');
    const expected=type==='grupos'?'CREAR GRUPOS':type==='grupo_ajustes'?'ACTUALIZAR GRUPO':type==='menu'?'IMPORTAR MENU':'IMPORTAR PRODUCTOS';
    if(body.confirmacion!==expected)throw error('Confirma la operación desde el resumen.');
    if(candidate.state!=='lista')throw error('La importación ya está en curso.');
    const job={owner:usuario,type,estado:'procesando',fecha:now(),resultado:null};jobs.set(token,job);
    // confirmar() escribe el diario antes de cualquier INSERT y conserva el resultado
    // definitivo incluso si Safari/Cloudflare se desconectan.
    const execution=sqlQueue.then(()=>confirmar(type,body,usuario));
    sqlQueue=execution.then(()=>{},()=>{});
    execution.then(result=>{
      job.estado=result.guardado?'confirmada':result.resultadoIncierto?'resultado_incierto':'error';job.resultado=result;
    }).catch(e=>{job.estado='error';job.resultado={correcto:false,guardado:false,error:redactError(e)};});
    // Los tokens en curso no se eliminan; los terminados se conservan 1h en RAM
    // y el diario se sigue consultando después del reinicio.
    for(const [id,entry] of jobs)if(entry.estado!=='procesando'&&now()-entry.fecha>3600000)jobs.delete(id);
    return {correcto:true,aceptado:true,operacion:token,estado:'procesando'};
  }
  function operacion(id,usuario){
    const live=jobs.get(id);
    if(live){if(usuario&&live.owner!==usuario)return null;
      return {id,estado:live.estado,fecha:new Date(live.fecha).toISOString(),resultado:live.resultado, ...(live.estado==='procesando'?{etapa:'Escribiendo y comprobando datos en SQL'}:{})};}
    const disk=historial(dir,id);
    if(disk&&usuario&&disk.owner!==usuario)return null;
    return disk;
  }
  return {compatibilidad,previsualizar,preparar,consultarPreparacion,confirmar,iniciar,operacion};
}
module.exports=function({app,conectar,sql,soloLocal,configDir}) {
  const service=crearServicio({conectar,sql,configDir});
  // Identidad persistente del dueño: recuperable incluso tras un nuevo inicio de sesión.
  const owner=req=>hash(['menu-operacion',req.auth.user.id]);
  const wrap=fn=>async(req,res)=>{try{const data=await fn(req);res.status(data.correcto===false?409:200).json(data);}catch(e){res.status(e.codigo?409:503).json({correcto:false,guardado:false,codigo:e.codigo||'SQL_NO_DISPONIBLE',error:redactError(e)});}};
  app.get('/api/menu-admin/compatibilidad',soloLocal,wrap(()=>service.compatibilidad()));
  for(const [type,route] of [['grupos','grupos'],['productos','importacion'],['menu','menu']]){
    app.post('/api/menu-admin/'+route+'/revisar',soloLocal,wrap(req=>service.previsualizar(type,req.body,owner(req))));
    app.post('/api/menu-admin/'+route+'/'+(type==='grupos'?'crear':'confirmar'),soloLocal,wrap(req=>service.confirmar(type,req.body,owner(req))));
  }
  app.post('/api/menu-admin/grupos/ajustes/revisar',soloLocal,wrap(req=>service.previsualizar('grupo_ajustes',req.body,owner(req))));
  app.post('/api/menu-admin/grupos/ajustes/confirmar',soloLocal,wrap(req=>service.confirmar('grupo_ajustes',req.body,owner(req))));
  // Preparaciones de sólo lectura en segundo plano (metadatos SQL pueden tardar).
  for(const [type,route] of [['grupos','grupos'],['grupo_ajustes','grupos/ajustes'],['menu','menu'],['productos','importacion']]){
    app.post('/api/menu-admin/preparar/'+route,soloLocal,wrap(req=>service.preparar(type,req.body,owner(req))));
  }
  app.get('/api/menu-admin/preparaciones/:id',soloLocal,wrap(req=>{
    const r=service.consultarPreparacion(req.params.id,owner(req));
    if(!r)throw error('Esta revisión no existe o pertenece a otra cuenta.');
    return r;
  }));
  // Inicio asíncrono sin bloquear la conexión HTTP de Safari ni Cloudflare.
  for(const [type,route] of [['grupos','grupos/crear'],['grupo_ajustes','grupos/ajustes/confirmar'],['menu','menu/confirmar'],['productos','importacion/confirmar']]){
    app.post('/api/menu-admin/segundo-plano/'+route,soloLocal,wrap(req=>service.iniciar(type,req.body,owner(req))));
  }
  app.get('/api/menu-admin/operaciones/:id',soloLocal,wrap(req=>{const o=service.operacion(req.params.id,owner(req));if(!o)throw error('No existe un registro de esa operación para esta cuenta.');return {correcto:true,operacion:o.id,estado:o.estado,fecha:o.fecha,etapa:o.etapa,plan:o.plan,resultado:o.resultado,error:o.error};}));
  return service;
};
module.exports.crearServicio=crearServicio;
module.exports.persistir=persistir;
module.exports.historial=historial;
module.exports.consultarEnSerie=consultarEnSerie;
