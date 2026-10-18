'use strict';
// SQL Server 2014. All database operations are SELECT; configuration is local.
const path=require('path');
const {createRequire}=require('module');
const runtimeRequire=createRequire(path.join(process.pkg?path.dirname(process.execPath):__dirname,'runtime','loader.js'));
const EXCEL_LIMIT=20000;
const {sources,turnMatch}=require('./fuentes');
const cols={
 cuentas:[['fecha','Apertura de cuenta','date'],['numcheque','Cuenta'],['mesa','Mesa'],['mesero','Mesero responsable'],['servicio','Servicio'],['turno','Turno'],['total','Total registrado','money'],['propina','Propina','money'],['descuentos','Descuentos','money'],['cortesias','Cortesías','money'],['estado','Estado']],
 ventas:[['fecha','Apertura de cuenta','date'],['numcheque','Cuenta'],['mesero','Mesero del producto'],['grupo','Catálogo'],['descripcion','Producto'],['cantidad','Cantidad','number'],['precio','Precio de detalle','money'],['importe','Cantidad × precio','money'],['servicio','Servicio'],['turno','Turno']],
 meseros:[['id','Clave'],['nombre','Mesero del producto'],['cuentas','Cuentas','number'],['cantidad','Unidades','number'],['total','Importe de productos','money'],['promedio','Importe / cuenta','money']],
 catalogos:[['id','Clave'],['nombre','Catálogo'],['cuentas','Cuentas','number'],['cantidad','Unidades','number'],['total','Importe de productos','money']],
 productos:[['id','Clave'],['nombre','Producto'],['grupo','Catálogo'],['cuentas','Cuentas','number'],['cantidad','Unidades','number'],['total','Importe de productos','money']],
 servicios:[['codigo','Código'],['servicio','Tipo de servicio'],['cuentas','Cuentas pagadas','number'],['total','Total registrado','money'],['promedio','Ticket promedio','money'],['propina','Propinas','money']],
 pagos:[['id','Clave'],['nombre','Forma de pago'],['cuentas','Cuentas','number'],['operaciones','Registros de pago','number'],['total','Importe registrado','money'],['propina','Propina de pagos','money']],
 cancelaciones:[['fecha','Fecha','date'],['numcheque','Cuenta'],['mesero','Mesero responsable'],['servicio','Servicio'],['total','Total cancelado','money'],['motivo','Motivo'],['usuario','Usuario']],
 descuentos:[['fecha','Fecha','date'],['numcheque','Cuenta'],['mesero','Mesero responsable'],['total','Total registrado','money'],['descuentos','Descuentos','money'],['cortesias','Cortesías','money'],['motivo','Comentario'],['usuario','Usuario']],
 abiertas:[['fecha','Apertura de cuenta','date'],['numcheque','Cuenta'],['mesa','Mesa'],['mesero','Mesero responsable'],['servicio','Servicio'],['turno','Turno de origen'],['total','En curso','money'],['antigua','Anterior al período']],
 cortes:[['turno','Turno'],['cajero','Cajero'],['apertura','Apertura registrada','date'],['cierre','Cierre registrado','date'],['estado','Estado'],['venta','Venta pagada','money'],['cuentas','Cuentas pagadas','number'],['fondo','Fondo registrado','money'],['efectivo','Efectivo registrado','money'],['tarjeta','Tarjeta registrada','money'],['vales','Vales registrados','money'],['credito','Crédito registrado','money']]
};
cols.cancelados=[['fecha','Fecha','date'],['folioreferencia','Folio de cuenta'],['producto','Producto / clave'],['cantidad','Cantidad','number'],['precio','Precio registrado','money'],['total','Cantidad × precio','money'],['motivo','Motivo'],['usuario','Usuario'],['turno','Turno de cierre']];
cols.propinas=[['id','Clave'],['nombre','Mesero responsable'],['total','Propina de cuentas','money'],['efectivo','Propina en efectivo','money'],['tarjeta','Propina en tarjeta','money'],['otros','Otros / sin clasificar','money'],['entregadas','Marcadas entregadas','money'],['pendientes','Marcadas pendientes','money'],['sinestado','Sin estado registrado','money']];
cols.diario=[['dia','Jornada'],['cuentas','Cuentas pagadas','number'],['total','Venta pagada','money'],['propina','Propinas','money'],['descuentos','Descuentos','money'],['cortesias','Cortesías','money'],['canceladas','Cuentas canceladas','number']];
const additive=new Set(['total','importe','cantidad','propina','descuentos','cortesias','fondo','efectivo','tarjeta','vales','credito','operaciones','venta']);
function totals(columns,rows){return Object.fromEntries(columns.filter(([k])=>additive.has(k)).map(([k])=>[k,rows.reduce((sum,r)=>sum+(Number(r[k])||0),0)]));}
const titles={cancelados:'Cancelaciones por producto',propinas:'Propinas por mesero',diario:'Resumen del día',cuentas:'Cuentas',ventas:'Ventas por producto',meseros:'Ventas por mesero',catalogos:'Ventas por catálogo',productos:'Productos vendidos',servicios:'Ventas por servicio',pagos:'Formas de pago',cancelaciones:'Cuentas canceladas',descuentos:'Descuentos y cortesías',abiertas:'Cuentas abiertas',cortes:'Cortes y turnos'};
function localDay(d=new Date()){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function normalize(q={}){
 const f={desde:String(q.desde||localDay()),hasta:String(q.hasta||localDay())};
 for(const k of ['desde','hasta'])if(!/^\d{4}-\d{2}-\d{2}$/.test(f[k])||!Number.isFinite(Date.parse(f[k]))||new Date(f[k]).toISOString().slice(0,10)!==f[k])throw Object.assign(Error('Fecha no válida.'),{status:400});
 if(f.desde>f.hasta||Date.parse(f.hasta)-Date.parse(f.desde)>365*86400000)throw Object.assign(Error('Selecciona un período ordenado de hasta 366 días.'),{status:400});
 for(const k of ['turno','servicio','mesero','grupo','producto','pago','empresa','buscar']) {f[k]=String(q[k]||'').trim();if(f[k].length>120)throw Object.assign(Error('Filtro demasiado largo: '+k),{status:400});}
 f.fechaCampo=q.fechaCampo==='fecha'?'fecha':'cierre';
 f.jornada=q.jornada==='1'||q.jornada===true;f.horaInicio=String(q.horaInicio||'00:00');if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(f.horaInicio))throw Object.assign(Error('Hora de inicio no válida.'),{status:400});f.minuto=f.jornada?Number(f.horaInicio.slice(0,2))*60+Number(f.horaInicio.slice(3)):0;
 f.importe=String(q.importe||'').trim();if(f.importe&&!/^\d{1,9}(?:\.\d{1,2})?$/.test(f.importe))throw Object.assign(Error('Importe de búsqueda no válido.'),{status:400});
 f.periodo=q.periodo==='todo'?'todo':'fechas';
 f.estado=['pagadas','canceladas','pendientes'].includes(q.estado)?q.estado:'todas';
 f.page=Math.max(1,Math.min(100000,parseInt(q.page,10)||1));f.pageSize=Math.max(10,Math.min(100,parseInt(q.pageSize,10)||50));
 return f;
}
const dateExpr=(f,a='c')=>f.fechaCampo==='cierre'?`COALESCE(${a}.cierre,${a}.fecha)`:`${a}.fecha`;
const codeExpr=a=>`COALESCE(CONVERT(varchar(30),TRY_CONVERT(int,${a}.tipodeservicio)),CONVERT(varchar(30),${a}.tipodeservicio),'__null__')`;
function buildScope(f,{live=false,ignoreDate=false}={}){
 const table='TodasCuentas',view='Enlaces',detail='Detalles',pay='Pagos';
 const where=[];if(!ignoreDate&&!f.turno)where.push(`${live?'c.fecha':dateExpr(f)}>=DATEADD(minute,@minuto,CONVERT(datetime2,@desde)) AND ${live?'c.fecha':dateExpr(f)}<DATEADD(minute,@minuto,DATEADD(day,1,CONVERT(datetime2,@hasta)))`);
 if(f.turno)where.push(f.turno.startsWith('i:')?'c._turnointerno=TRY_CONVERT(bigint,SUBSTRING(@turno,3,30))':'c.idturno=TRY_CONVERT(numeric(18,0),@turno)');if(f.empresa)where.push('c.idempresa=@empresa');if(f.servicio)where.push(`${codeExpr('c')}=@servicio`);
 if(f.pago)where.push(`EXISTS(SELECT 1 FROM ${pay} pp WHERE pp.folio=c.folio AND pp._origen=c._origen AND pp.idformadepago=@pago)`);
 if(f.buscar)where.push("(CONVERT(varchar(50),c.numcheque) LIKE @buscar OR c.mesa LIKE @buscar)");
 if(f.importe)where.push('ABS(c.total-@importe)<0.005');
 const detailFilters=[];if(f.mesero)detailFilters.push('d.idmeseroproducto=@mesero');if(f.grupo)detailFilters.push('p.idgrupo=@grupo');if(f.producto)detailFilters.push('d.idproducto=@producto');
 // One mapping per foliodet, never ROW_NUMBER pairing of repeated products.
 // Repeated references to the same folio do not multiply detail rows.
 const cte=`WITH ${sources({live,mode:f.turnoReferencia})}, Base AS (SELECT c.* FROM ${table} c WHERE ${where.join(' AND ')||'1=1'}),
 Relevantes AS (SELECT DISTINCT v.foliodet,v._origen FROM ${view} v INNER JOIN Base c ON c.folio=v.folio AND c._origen=v._origen),
 Mapa AS (SELECT v.foliodet,v._origen,MIN(v.folio) folio,COUNT(DISTINCT v.folio) enlaces FROM ${view} v INNER JOIN Relevantes r ON r.foliodet=v.foliodet AND r._origen=v._origen GROUP BY v.foliodet,v._origen),
 Lineas AS (SELECT d.*,m.folio,p.descripcion,p.idgrupo FROM ${detail} d INNER JOIN Mapa m ON m.foliodet=d.foliodet AND m._origen=d._origen AND m.enlaces=1 LEFT JOIN productos p ON p.idproducto=d.idproducto WHERE ${detailFilters.join(' AND ')||'1=1'}),
 Cuentas AS (SELECT c.* FROM Base c ${detailFilters.length?'WHERE EXISTS(SELECT 1 FROM Lineas ld WHERE ld.folio=c.folio AND ld._origen=c._origen)':''})`;
 return {cte,linePredicate:detailFilters.join(' AND ')||'1=1'};
}
const paid='c.cancelado=0 AND c.pagado=1';
const accountSelect=`c._origen origen,CONVERT(varchar(30),c._turnointerno) turnointerno,CONVERT(varchar(30),c.folio) folio,CONVERT(varchar(30),c.numcheque) numcheque,c.fecha,c.cierre,c.mesa,COALESCE(CONVERT(varchar(30),c._turnonumero),CONCAT('Sin vincular (',CONVERT(varchar(30),c.idturno),')')) turno,c.idempresa,c.idmesero,ISNULL(m.nombre,'SIN MESERO') mesero,${codeExpr('c')} codigo,ISNULL(c.total,0) total,ISNULL(c.propina,0) propina,ISNULL(c.totaldescuentos,0) descuentos,ISNULL(c.totalcortesias,0) cortesias,ISNULL(c.totalarticulos,0) articulos,CASE WHEN c.cancelado=1 THEN 'Cancelada' WHEN c.pagado=1 THEN 'Pagada' ELSE 'Sin pagar' END estado`;
function reportQuery(type,f,{exporting=false}={}){
 const {cte}=buildScope(f,{live:type==='abiertas',ignoreDate:type==='abiertas'});
 const offset=exporting?0:(f.page-1)*f.pageSize,limit=exporting?EXCEL_LIMIT+1:f.pageSize;
 const page=order=>`ORDER BY ${order} OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`;
 let q;
 if(type==='cuentas')q=`SELECT ${accountSelect},COUNT(*) OVER() _count FROM Cuentas c LEFT JOIN meseros m ON m.idmesero=c.idmesero ${f.estado==='pagadas'?'WHERE '+paid:f.estado==='canceladas'?'WHERE c.cancelado=1':f.estado==='pendientes'?'WHERE c.cancelado=0 AND c.pagado=0':''} ${page('c.fecha DESC,c.folio DESC')}`;
 if(type==='abiertas')q=`SELECT ${accountSelect},CASE WHEN c.fecha<DATEADD(minute,@minuto,CONVERT(datetime2,@desde)) THEN 'Sí' ELSE 'No' END antigua,COUNT(*) OVER() _count FROM Cuentas c LEFT JOIN meseros m ON m.idmesero=c.idmesero WHERE c.cancelado=0 AND c.pagado=0 ${page('c.fecha,c.folio')}`;
 if(type==='ventas')q=`SELECT c._origen origen,CONVERT(varchar(30),c.folio) folio,CONVERT(varchar(30),c.numcheque) numcheque,c.fecha,COALESCE(CONVERT(varchar(30),c._turnonumero),CONCAT('Sin vincular (',CONVERT(varchar(30),c.idturno),')')) turno,${codeExpr('c')} codigo,d.idproducto,d.idmeseroproducto idmesero,ISNULL(m.nombre,'SIN MESERO') mesero,d.idgrupo,ISNULL(g.descripcion,'SIN CATÁLOGO') grupo,ISNULL(d.descripcion,d.idproducto) descripcion,d.cantidad,COALESCE(d.precio,d.preciocatalogo,0) precio,d.cantidad*COALESCE(d.precio,d.preciocatalogo,0) importe,d.descuento,COUNT(*) OVER() _count FROM Lineas d INNER JOIN Cuentas c ON c.folio=d.folio AND c._origen=d._origen LEFT JOIN meseros m ON m.idmesero=d.idmeseroproducto LEFT JOIN grupos g ON g.idgrupo=d.idgrupo WHERE ${paid} ${page('c.fecha DESC,c.folio DESC,d.foliodet,d.movimiento')}`;
 if(['meseros','catalogos','productos'].includes(type)){
 const id=type==='meseros'?"ISNULL(d.idmeseroproducto,'')":type==='catalogos'?"ISNULL(d.idgrupo,'')":'d.idproducto';
 const name=type==='meseros'?"ISNULL(m.nombre,'SIN MESERO')":type==='catalogos'?"ISNULL(g.descripcion,'SIN CATÁLOGO')":"ISNULL(d.descripcion,d.idproducto)";
 q=`SELECT ${id} id,${name} nombre,${type==='productos'?"ISNULL(g.descripcion,'SIN CATÁLOGO') grupo,":''}COUNT(DISTINCT CONCAT(c._origen,':',CONVERT(varchar(30),c.folio))) cuentas,SUM(d.cantidad) cantidad,SUM(d.cantidad*COALESCE(d.precio,d.preciocatalogo,0)) total,SUM(d.cantidad*COALESCE(d.precio,d.preciocatalogo,0))/NULLIF(COUNT(DISTINCT CONCAT(c._origen,':',CONVERT(varchar(30),c.folio))),0) promedio,COUNT(*) OVER() _count FROM Lineas d INNER JOIN Cuentas c ON c.folio=d.folio AND c._origen=d._origen LEFT JOIN meseros m ON m.idmesero=d.idmeseroproducto LEFT JOIN grupos g ON g.idgrupo=d.idgrupo WHERE ${paid} GROUP BY ${id},${name}${type==='productos'?",g.descripcion":''} ${page('total DESC,id')}`;
 }
 if(type==='servicios')q=`SELECT ${codeExpr('c')} codigo,COUNT(*) cuentas,SUM(ISNULL(c.total,0)) total,AVG(ISNULL(c.total,0)) promedio,SUM(ISNULL(c.propina,0)) propina,COUNT(*) OVER() _count FROM Cuentas c WHERE ${paid} GROUP BY c.tipodeservicio ${page('total DESC,codigo')}`;
 if(type==='pagos')q=`SELECT cp.idformadepago id,ISNULL(fp.descripcion,cp.idformadepago) nombre,COUNT(DISTINCT CONCAT(c._origen,':',CONVERT(varchar(30),c.folio))) cuentas,COUNT(*) operaciones,SUM(ISNULL(cp.importe,0)) total,SUM(ISNULL(cp.propina,0)) propina,COUNT(*) OVER() _count FROM Cuentas c INNER JOIN Pagos cp ON cp.folio=c.folio AND cp._origen=c._origen LEFT JOIN formasdepago fp ON fp.idformadepago=cp.idformadepago WHERE ${paid} ${f.pago?'AND cp.idformadepago=@pago':''} GROUP BY cp.idformadepago,fp.descripcion ${page('total DESC,cp.idformadepago')}`;
 if(type==='cancelaciones')q=`SELECT ${accountSelect},c.razoncancelado motivo,c.usuariocancelo usuario,COUNT(*) OVER() _count FROM Cuentas c LEFT JOIN meseros m ON m.idmesero=c.idmesero WHERE c.cancelado=1 ${page('c.fecha DESC,c.folio DESC')}`;
 if(type==='descuentos')q=`SELECT ${accountSelect},c.comentariodescuento motivo,c.usuariodescuento usuario,COUNT(*) OVER() _count FROM Cuentas c LEFT JOIN meseros m ON m.idmesero=c.idmesero WHERE ${paid} AND (ISNULL(c.totaldescuentos,0)<>0 OR ISNULL(c.totalcortesias,0)<>0) ${page('c.fecha DESC,c.folio DESC')}`;
 if(type==='cortes'){
 const filters=f.periodo==='todo'||f.turno?['1=1']:['t.apertura<DATEADD(minute,@minuto,DATEADD(day,1,CONVERT(datetime2,@hasta)))','(t.cierre>=DATEADD(minute,@minuto,CONVERT(datetime2,@desde)) OR t.cierre IS NULL)'];if(f.turno)filters.push(f.turno.startsWith('i:')?'t.idturnointerno=TRY_CONVERT(bigint,SUBSTRING(@turno,3,30))':'t.idturno=TRY_CONVERT(bigint,@turno)');if(f.empresa)filters.push('t.idempresa=@empresa');
 if(f.servicio||f.mesero||f.grupo||f.producto||f.pago||f.buscar||f.importe)filters.push('EXISTS(SELECT 1 FROM Cuentas c WHERE c._turnointerno=t.idturnointerno)');
 q=`SELECT CONVERT(varchar(30),t.idturnointerno) interno,CONVERT(varchar(30),t.idturno) turno,t.idempresa,t.cajero,t.idestacion,t.apertura,t.cierre,CASE WHEN t.cierre IS NULL THEN 'Abierto' ELSE 'Cerrado' END estado,t.fondo,t.efectivo,t.tarjeta,t.vales,t.credito,cv.venta,cv.cuentas,(SELECT COUNT(*) FROM TodasCuentas u WHERE u.pagado=1 AND u.cancelado=0 AND u._turnocoincidencias<>1) _sinTurno,COUNT(*) OVER() _count FROM turnos t OUTER APPLY (SELECT COALESCE(SUM(ch.total),0) venta,COUNT(*) cuentas FROM TodasCuentas ch WHERE ch._turnointerno=t.idturnointerno AND ch.pagado=1 AND ch.cancelado=0) cv WHERE ${filters.join(' AND ')} ${page('t.apertura DESC,t.idturnointerno DESC')}`;
 }
 if(type==='diario')q=`SELECT CONVERT(varchar(10),DATEADD(minute,-@minuto,${dateExpr(f)}),23) dia,COUNT(CASE WHEN ${paid} THEN 1 END) cuentas,COALESCE(SUM(CASE WHEN ${paid} THEN c.total ELSE 0 END),0) total,COALESCE(SUM(CASE WHEN ${paid} THEN c.propina ELSE 0 END),0) propina,COALESCE(SUM(CASE WHEN ${paid} THEN c.totaldescuentos ELSE 0 END),0) descuentos,COALESCE(SUM(CASE WHEN ${paid} THEN c.totalcortesias ELSE 0 END),0) cortesias,COUNT(CASE WHEN c.cancelado=1 THEN 1 END) canceladas,COUNT(*) OVER() _count FROM Cuentas c GROUP BY CONVERT(varchar(10),DATEADD(minute,-@minuto,${dateExpr(f)}),23) ${page('dia DESC')}`;
 if(type==='propinas'){
 const cash=(f.cashIDs||[]).map((_,i)=>'cp.idformadepago=@cash'+i).join(' OR ')||'1=0',card=(f.cardIDs||[]).map((_,i)=>'cp.idformadepago=@card'+i).join(' OR ')||'1=0';
 q=`SELECT ISNULL(c.idmesero,'') id,ISNULL(m.nombre,'SIN MESERO') nombre,SUM(ISNULL(c.propina,0)) total,SUM(ISNULL(pp.efectivo,0)) efectivo,SUM(ISNULL(pp.tarjeta,0)) tarjeta,SUM(ISNULL(pp.otros,0)) otros,SUM(CASE WHEN c.propinapagada=1 THEN ISNULL(c.propina,0) ELSE 0 END) entregadas,SUM(CASE WHEN c.propinapagada=0 THEN ISNULL(c.propina,0) ELSE 0 END) pendientes,SUM(CASE WHEN c.propinapagada IS NULL THEN ISNULL(c.propina,0) ELSE 0 END) sinestado,COUNT(*) OVER() _count FROM Cuentas c LEFT JOIN meseros m ON m.idmesero=c.idmesero OUTER APPLY (SELECT SUM(CASE WHEN ${cash} THEN ISNULL(cp.propina,0) ELSE 0 END) efectivo,SUM(CASE WHEN ${card} THEN ISNULL(cp.propina,0) ELSE 0 END) tarjeta,SUM(CASE WHEN (${cash}) OR (${card}) THEN 0 ELSE ISNULL(cp.propina,0) END) otros FROM Pagos cp WHERE cp.folio=c.folio AND cp._origen=c._origen) pp WHERE ${paid} GROUP BY c.idmesero,m.nombre ${page('total DESC,id')}`;
 }
 if(type==='cancelados'){
 const conditions=['cc.fecha>=DATEADD(minute,@minuto,CONVERT(datetime2,@desde))','cc.fecha<DATEADD(minute,@minuto,DATEADD(day,1,CONVERT(datetime2,@hasta)))'];if(f.turno){conditions.splice(0,2);conditions.push(f.turno.startsWith('i:')?'cc.idturno_cierre=TRY_CONVERT(bigint,SUBSTRING(@turno,3,30))':'cc.idturno_cierre=TRY_CONVERT(bigint,@turno)');}if(f.producto)conditions.push('cc.clave=@producto');if(f.grupo)conditions.push('p.idgrupo=@grupo');if(f.empresa)conditions.push('c.idempresa=@empresa');if(f.mesero)conditions.push('c.idmesero=@mesero');if(f.servicio)conditions.push(`${codeExpr('c')}=@servicio`);if(f.buscar)conditions.push('(CONVERT(varchar(30),cc.foliocheque) LIKE @buscar OR c.mesa LIKE @buscar)');if(f.pago)conditions.push('EXISTS(SELECT 1 FROM Pagos cp WHERE cp.folio=c.folio AND cp._origen=c._origen AND cp.idformadepago=@pago)');if(f.importe)conditions.push('ABS(cc.cantidad*cc.precio-@importe)<0.005');
 return `WITH ${sources({mode:f.turnoReferencia})} SELECT cc.fecha,CONVERT(varchar(30),cc.foliocheque) folioreferencia,ISNULL(p.descripcion,cc.clave) producto,cc.cantidad,cc.precio,cc.cantidad*cc.precio total,cc.razon motivo,cc.usuario,CONVERT(varchar(30),cc.idturno_cierre) turno,COUNT(*) OVER() _count FROM cancela cc LEFT JOIN productos p ON p.idproducto=cc.clave OUTER APPLY (SELECT CASE WHEN COUNT(*)=1 THEN MIN(a._origen) END origen FROM TodasCuentas a WHERE a.folio=cc.foliocheque AND a.fecha<=cc.fecha AND (a.cierre IS NULL OR a.cierre>=cc.fecha)) enlace LEFT JOIN TodasCuentas c ON c.folio=cc.foliocheque AND c._origen=enlace.origen WHERE ${conditions.join(' AND ')} ${page('cc.fecha DESC,cc.foliocheque,cc.comanda,cc.clave')}`;
 }
 if(!q)throw Object.assign(Error('Reporte no válido.'),{status:400});
 return cte+' '+q;
}
function metadataFilters(f,meta){return [
 ['Jornada',f.jornada?'Desde '+f.horaInicio+' hasta la misma hora del día siguiente':'Día calendario'],['Importe buscado',f.importe||'Todos'],['Período',f.turno?'Todo el turno seleccionado':f.periodo==='todo'?'Todos los cortes':'Fechas seleccionadas'],['Desde (si aplica)',f.desde],['Hasta (si aplica)',f.hasta],['Estado (reporte Cuentas)',f.estado],['Fecha utilizada',f.fechaCampo==='cierre'?'Cobro/cierre de cuenta (apertura si no hay cierre)':'Apertura de cuenta'],
 ['Turno',f.turno||'Todos'],['Servicio',f.servicio?serviceName(f.servicio,meta):'Todos'],
 ['Mesero del producto',f.mesero||'Todos'],['Catálogo',f.grupo||'Todos'],['Producto',f.producto||'Todos'],['Forma de pago',f.pago||'Todas'],['Empresa',f.empresa||'Todas'],['Buscar cuenta / mesa',f.buscar||'Sin búsqueda']];}
function serviceKey(v){const s=String(v??'__null__').trim();return /^-?\d+(?:\.0+)?$/.test(s)?String(Number(s)):s;}
const defaultServices={'1':'Comedor','2':'A domicilio','3':'Rápido'};
function serviceName(code,meta){return meta?.servicios?.find(s=>serviceKey(s.id)===serviceKey(code))?.nombre?.trim() || defaultServices[serviceKey(code)] || (code==='__null__'?'Servicio sin código':'Servicio '+code+' · sin descripción');}
function annotate(rows,meta){return rows.map(r=>{const x={...r};delete x._count;delete x._sinTurno;if('codigo'in x){x.codigo=serviceKey(x.codigo);x.servicio=serviceName(x.codigo,meta);}return x;});}
function note(type,f){const n=['Incluye histórico y cuentas temporales. Se excluyen temporales ya trasladadas usando foliotempcheques, empresa y fecha de apertura.'];if(type==='propinas')n.push('Entregadas/pendientes según el campo propinapagada de cada cuenta, no una confirmación de entrega física. El desglose efectivo/tarjeta usa la clasificación configurada y propina de pagos; puede diferir de la cabecera.');if(type==='cancelados')n.push('Eventos de cancela por fecha del evento. Importe = cantidad × precio registrado. Si se filtra por mesero se usa el responsable de una cuenta enlazada de forma única por folio y rango de apertura/cierre; no el usuario que canceló. Los eventos sin enlace único permanecen visibles sin filtros de cuenta.');if(f.jornada)n.push('Jornada de operación: de '+f.horaInicio+' a '+f.horaInicio+' del día siguiente, según la hora almacenada en Soft Restaurant.');if(f.turno)n.push('Se consulta todo el turno seleccionado, independientemente de las fechas del calendario.');
 if(['ventas','meseros','catalogos','productos'].includes(type))n.push('Importe de productos = cantidad × precio de detalle. Cuentas cobradas de turnos abiertos e histórico, sin canceladas. Se actualiza sin cerrar el turno. No es un reparto del total neto de la cuenta; descuentos generales, cargos y propinas pueden producir diferencias.');
 else if(type==='abiertas')n.push('Cuentas abiertas de cualquier fecha. No hereda turno, servicio ni filtros históricos. Conserva únicamente la empresa; el período sirve para identificar cuentas antiguas, no para ocultarlas.');
 else if(type==='cortes'){if(f.periodo==='todo')n.push('Se muestran todos los turnos registrados, incluidos los cerrados de fechas anteriores.');n.push('Los importes registrados del turno se muestran completos. El rango selecciona turnos que se superponen con el período; los demás filtros seleccionan turnos con cuentas coincidentes. Al abrir el detalle se consulta todo el turno, sin recortarlo por la fecha de la pantalla. No equivale a un arqueo ni a efectivo contado.');}
 else n.push('Importes de cuentas completas, incluidas las cobradas del turno abierto. Fecha utilizada: '+(f.fechaCampo==='cierre'?'cierre':'apertura')+' de cuenta.');
 if(f.mesero||f.grupo||f.producto)n.push('Mesero / catálogo / producto seleccionan cuentas que contienen productos coincidentes. En resúmenes de cuentas y pagos se conserva el importe completo de esas cuentas; en reportes de productos se suman solo las líneas coincidentes.');
 if(f.pago)n.push('El filtro de pago selecciona cuentas que usaron esa forma de pago. En el reporte Formas de pago se suma solo ese método; el total de cuenta conserva todos sus pagos.');
 return n;
}
module.exports=function({app,sql,conectar,getSettings=()=>({pagos:{}})}){
 const baseNormalize=normalize;
 function settingsNormalize(q){return {...baseNormalize(q),turnoReferencia:getSettings().turnoReferencia||'auto'};}

 let generation=0;const cache=new Map();
 function clearCache(){generation++;cache.clear();}
 async function cached(key,work,ttl=0){const previous=cache.get(key);if(previous&&previous.until>Date.now())return previous.promise;const current=generation;const entry={until:Date.now()+ttl,promise:null};entry.promise=Promise.resolve().then(work).catch(e=>{if(cache.get(key)===entry)cache.delete(key);throw e;});if(current===generation){if(cache.size>100)cache.delete(cache.keys().next().value);cache.set(key,entry);}return entry.promise;}
 async function query(text,f){const db=await conectar();const rq=db.request();if(f){rq.input('desde',sql.Date,f.desde).input('hasta',sql.Date,f.hasta).input('minuto',sql.Int,f.minuto||0).input('importe',sql.Decimal(18,2),f.importe?Number(f.importe):0);for(const [i,id] of (f.cashIDs||[]).entries())rq.input('cash'+i,sql.NVarChar(160),id);for(const [i,id] of (f.cardIDs||[]).entries())rq.input('card'+i,sql.NVarChar(160),id);for(const k of ['turno','servicio','mesero','grupo','producto','pago','empresa','buscar'])rq.input(k,sql.NVarChar(160),k==='buscar'?'%'+f[k].replace(/[\[\]%_]/g,c=>'['+c+']')+'%':f[k]);}return rq.query(text);}
 async function metadata(){return cached('metadata:'+JSON.stringify(getSettings().servicios||{}),async()=>{
 const r=await query(`SELECT RTRIM(idmesero) id,nombre FROM meseros ORDER BY nombre;
 SELECT RTRIM(idgrupo) id,descripcion nombre FROM grupos ORDER BY descripcion;
 SELECT RTRIM(idformadepago) id,descripcion nombre,tipo FROM formasdepago ORDER BY descripcion;
 SELECT DISTINCT COALESCE(CONVERT(varchar(30),TRY_CONVERT(int,Idtiposervicio)),LTRIM(RTRIM(Idtiposervicio))) id,Desc_tiposervicio nombre FROM tiposervicio;
 SELECT idempresa id,nombre FROM empresas ORDER BY nombre;
 SELECT TOP 300 CONVERT(varchar(30),idturno) id,CONVERT(varchar(30),idturnointerno) interno,apertura,cierre,cajero,idempresa FROM turnos ORDER BY apertura DESC;
 SELECT DISTINCT COALESCE(CONVERT(varchar(30),tipodeservicio),'__null__') id FROM cheques UNION SELECT DISTINCT COALESCE(CONVERT(varchar(30),tipodeservicio),'__null__') FROM tempcheques;`);
 const [meseros,grupos,pagos,servicios,empresas,turnos,codes]=r.recordsets;
 const configured=getSettings().servicios||{},list=[];
 const keys=[...new Set([...Object.keys(defaultServices),...servicios.map(s=>serviceKey(s.id)),...codes.map(c=>serviceKey(c.id))])];
 for(const id of keys){const catalog=servicios.find(s=>serviceKey(s.id)===id)?.nombre?.trim();list.push({id,nombre:configured[id]||catalog||defaultServices[id]||serviceName(id,{servicios:[]}),catalogo:catalog||'',configurado:!!configured[id]});}

 return {meseros,grupos,pagos,servicios:list,empresas,turnos,version:'9.2.0'};
 },10000);}
 async function report(type,f,exporting=false){const methods=getSettings().pagos||{};f={...f,turnoReferencia:getSettings().turnoReferencia||'auto',cashIDs:Object.keys(methods).filter(k=>methods[k]==='efectivo'),cardIDs:Object.keys(methods).filter(k=>methods[k]==='tarjeta')};if(type==='abiertas')f=settingsNormalize({desde:f.desde,hasta:f.hasta,empresa:f.empresa,page:f.page,pageSize:f.pageSize,jornada:f.jornada,horaInicio:f.horaInicio});return cached('report:'+type+':'+JSON.stringify(f)+':'+exporting,async()=>{const [r,meta]=await Promise.all([query(reportQuery(type,f,{exporting}),f),metadata()]);const total=r.recordset[0]?Number(r.recordset[0]._count):0;if(exporting&&total>EXCEL_LIMIT)throw Object.assign(Error('Este reporte supera '+EXCEL_LIMIT+' filas. Reduce el período o agrega filtros para exportarlo completo.'),{status:400});return {correcto:true,titulo:titles[type],tipo:type,columnas:cols[type],filas:annotate(r.recordset,meta),totales:exporting?totals(cols[type],r.recordset):null,total,page:f.page,pageSize:f.pageSize,advertencias:type==='cortes'&&Number(r.recordset[0]?._sinTurno)>0?[r.recordset[0]._sinTurno+' cuentas cobradas no tienen un turno único. Sus importes siguen incluidos en ventas, pero no se asignan a un corte. Revisa Ajustes → Vincular cuentas con turnos y el diagnóstico.']:[],notas:note(type,f),filtros:metadataFilters(f,meta),negocio:meta.empresas.filter(e=>!f.empresa||e.id===f.empresa).map(e=>e.nombre).join(' / ')||'Mi negocio',actualizado:new Date().toISOString()};});}
 function route(fn){return async(req,res,next)=>{try{await fn(req,res);}catch(e){next(e);}};}
 app.get('/api/v8/catalogos',route(async(req,res)=>res.json({correcto:true,...await metadata()})));
 app.get('/api/v8/historial',route(async(req,res)=>{const r=await query(`WITH ${sources()} SELECT MIN(fecha) primera,MAX(fecha) ultima FROM TodasCuentas WHERE cancelado=0 AND pagado=1; SELECT MIN(apertura) primera,MAX(apertura) ultima,COUNT(*) cantidad FROM turnos;`);res.json({correcto:true,ventas:r.recordsets[0][0],cortes:r.recordsets[1][0]});}));
 app.get('/api/v8/diagnostico-datos',route(async(req,res)=>{
 const f=settingsNormalize(req.query),base=`WITH ${sources({mode:f.turnoReferencia})}`;
 const result=await query(`${base} SELECT _origen origen,pagado,cancelado,COUNT(*) cuentas,COALESCE(SUM(total),0) total,MIN(fecha) primera,MAX(fecha) ultima FROM TodasCuentas GROUP BY _origen,pagado,cancelado;
 ${base} SELECT _origen origen,_turnocoincidencias coincidencias,COUNT(*) cuentas,COALESCE(SUM(total),0) total FROM TodasCuentas GROUP BY _origen,_turnocoincidencias;
 ${base} SELECT c._origen origen,CONVERT(varchar(30),c.idturno) referencia_cuenta,CONVERT(varchar(30),c._turnointerno) interno_resuelto,CONVERT(varchar(30),c._turnonumero) turno_visible,COUNT(*) cuentas,SUM(c.total) total FROM TodasCuentas c GROUP BY c._origen,c.idturno,c._turnointerno,c._turnonumero;
 SELECT COUNT(*) temporales_trasladadas FROM tempcheques t WHERE EXISTS(SELECT 1 FROM cheques h WHERE h.foliotempcheques=t.folio AND ISNULL(h.idempresa,'')=ISNULL(t.idempresa,'') AND h.fecha=t.fecha);
 SELECT OBJECT_NAME(f.parent_object_id) tabla,COL_NAME(f.parent_object_id,f.parent_column_id) columna,OBJECT_NAME(f.referenced_object_id) tabla_referenciada,COL_NAME(f.referenced_object_id,f.referenced_column_id) columna_referenciada FROM sys.foreign_key_columns f WHERE OBJECT_NAME(f.parent_object_id) IN ('cheques','tempcheques','movtoscaja');
 ${base} SELECT ${codeExpr('c')} codigo,c._origen origen,c.pagado,c.cancelado,COUNT(*) cuentas,SUM(c.total) total FROM TodasCuentas c GROUP BY c.tipodeservicio,c._origen,c.pagado,c.cancelado;
 ${buildScope(f).cte} SELECT (SELECT COUNT(*) FROM Mapa WHERE enlaces>1) enlaces_ambiguos,(SELECT COUNT(*) FROM Cuentas c WHERE c.pagado=1 AND c.cancelado=0 AND NOT EXISTS(SELECT 1 FROM Lineas d WHERE d.folio=c.folio AND d._origen=c._origen)) cuentas_pagadas_sin_productos;`,f);
 res.set('Content-Disposition','attachment; filename="Diagnostico_Datos_Restaurante.json"');res.json({correcto:true,version:'9.2.0',generado:new Date().toISOString(),relacionTurnos:f.turnoReferencia,servicios:(await metadata()).servicios,fuentes:result.recordsets[0],vinculosTurnos:result.recordsets[1],referencias:result.recordsets[2],trasladadas:result.recordsets[3],clavesForaneas:result.recordsets[4],ventaPorServicio:result.recordsets[5],detalleProductos:result.recordsets[6],nota:'Totales agregados; no incluye credenciales ni datos personales. Comparar contra un corte conocido de Soft Restaurant.'});
 }));
 app.get('/api/v8/productos',route(async(req,res)=>{const f=settingsNormalize(req.query);const r=await query("SELECT TOP 50 RTRIM(idproducto) id,descripcion nombre FROM productos WHERE descripcion LIKE @buscar OR idproducto LIKE @buscar ORDER BY descripcion",f);res.json({correcto:true,productos:r.recordset});}));
 app.get('/api/v8/reporte/:tipo',route(async(req,res)=>res.json(await report(req.params.tipo,settingsNormalize(req.query)))));
 app.get('/api/v8/resumen',route(async(req,res)=>{
 const f=settingsNormalize(req.query);res.json(await cached('summary:'+JSON.stringify(f),async()=>{
 const {cte}=buildScope(f),liveFilters=settingsNormalize({desde:f.desde,hasta:f.hasta,empresa:f.empresa,jornada:f.jornada,horaInicio:f.horaInicio}),live=buildScope(liveFilters,{live:true,ignoreDate:true}).cte;
 const summary=`SELECT COUNT(CASE WHEN ${paid} THEN 1 END) cuentas,COALESCE(SUM(CASE WHEN ${paid} THEN c.total ELSE 0 END),0) venta,COALESCE(SUM(CASE WHEN ${paid} THEN c.propina ELSE 0 END),0) propina,COALESCE(SUM(CASE WHEN ${paid} THEN c.totaldescuentos ELSE 0 END),0) descuentos,COALESCE(SUM(CASE WHEN ${paid} THEN c.totalcortesias ELSE 0 END),0) cortesias,COALESCE(SUM(CASE WHEN ${paid} THEN c.totalarticulos ELSE 0 END),0) productos,COUNT(CASE WHEN c.cancelado=1 THEN 1 END) canceladas FROM Cuentas c`;
 const length=Math.round((Date.parse(f.hasta)-Date.parse(f.desde))/86400000)+1;const prior={...f,desde:new Date(Date.parse(f.desde)-length*86400000).toISOString().slice(0,10),hasta:new Date(Date.parse(f.desde)-86400000).toISOString().slice(0,10)};
 const [r,open,previous,meta]=await Promise.all([
 query(cte+' '+summary,f),
 query(live+` SELECT COUNT(*) cuentas,COALESCE(SUM(c.total),0) total,COUNT(CASE WHEN c.fecha<DATEADD(minute,@minuto,CONVERT(datetime2,@desde)) THEN 1 END) antiguas FROM Cuentas c WHERE c.cancelado=0 AND c.pagado=0`,liveFilters),
 query(buildScope(prior).cte+' '+summary,prior),metadata()]);
 const s=r.recordset[0],p=previous.recordset[0];s.ticket=Number(s.cuentas)?Number(s.venta)/Number(s.cuentas):0;
 const actual=Number(s.venta),anterior=Number(p.venta);return {correcto:true,resumen:s,abiertas:open.recordset[0],comparativa:{actual,anterior,diferencia:actual-anterior,porcentaje:anterior?(actual-anterior)/anterior*100:null,desde:prior.desde,hasta:prior.hasta},notas:note('cuentas',f),filtros:metadataFilters(f,meta),actualizado:new Date().toISOString()};
 }));
 }));
 app.get('/api/v8/graficas',route(async(req,res)=>{
 const f=settingsNormalize(req.query);res.json(await cached('charts:'+JSON.stringify(f),async()=>{
 const {cte}=buildScope(f);const r=await query(cte+` SELECT CONVERT(varchar(10),DATEADD(minute,-@minuto,${dateExpr(f)}),23) etiqueta,SUM(c.total) total FROM Cuentas c WHERE ${paid} GROUP BY CONVERT(varchar(10),DATEADD(minute,-@minuto,${dateExpr(f)}),23) ORDER BY etiqueta;\n`+cte+` SELECT DATEPART(hour,${dateExpr(f)}) etiqueta,SUM(c.total) total FROM Cuentas c WHERE ${paid} GROUP BY DATEPART(hour,${dateExpr(f)}) ORDER BY etiqueta;`,f);
 return {correcto:true,dias:r.recordsets[0],horas:r.recordsets[1]};
 }));
 }));
 app.get('/api/v8/calidad',route(async(req,res)=>{
 const f=settingsNormalize(req.query);const {cte}=buildScope(f);const r=await query(cte+` SELECT (SELECT COUNT(*) FROM Mapa WHERE enlaces>1) enlaces_ambiguos,(SELECT COUNT(*) FROM Base WHERE _turnocoincidencias<>1) cuentas_turno_sin_vinculo,(SELECT COUNT(*) FROM Base c WHERE c.cancelado=0 AND c.pagado=1 AND NOT EXISTS(SELECT 1 FROM Mapa m WHERE m.folio=c.folio AND m._origen=c._origen AND m.enlaces=1)) cuentas_sin_enlace;`,f);res.json({correcto:true,...r.recordset[0],nota:'Los foliodet relacionados con varias cuentas se excluyen del detalle de productos para evitar duplicar o atribuir ventas incorrectamente.'});
 }));
 app.get('/api/v8/cuenta/:folio',route(async(req,res)=>{
 if(!/^\d{1,19}$/.test(req.params.folio))throw Object.assign(Error('Folio no válido.'),{status:400});
 const origin=['abiertas','temporal'].includes(req.query.origen)?'temporal':'historico';
 const select=origin==='temporal'?"(c._origen='temporal' AND c.folio=@folio) OR (c._origen='historico' AND c.folio IN (SELECT h.folio FROM cheques h WHERE h.foliotempcheques=@folio) AND NOT EXISTS(SELECT 1 FROM TodasCuentas t WHERE t._origen='temporal' AND t.folio=@folio))":"c._origen='historico' AND c.folio=@folio";
 const base=`WITH ${sources({mode:getSettings().turnoReferencia})}, Elegida AS (SELECT c.* FROM TodasCuentas c WHERE ${select})`;
 const db=await conectar();const rq=db.request().input('folio',sql.BigInt,req.params.folio);const result=await rq.query(`${base} SELECT ${accountSelect},c.totalsindescuento,c.totalconpropinacargo,c.cargo,c.totalimpuesto1 FROM Elegida c LEFT JOIN meseros m ON m.idmesero=c.idmesero;
 ${base}, R AS (SELECT DISTINCT v.foliodet,v._origen FROM Enlaces v INNER JOIN Elegida c ON c.folio=v.folio AND c._origen=v._origen), EnlaceCuenta AS (SELECT v.foliodet,v._origen,COUNT(DISTINCT v.folio) enlaces FROM Enlaces v INNER JOIN R ON R.foliodet=v.foliodet AND R._origen=v._origen GROUP BY v.foliodet,v._origen)
 SELECT d.idproducto,ISNULL(p.descripcion,d.idproducto) descripcion,d.cantidad,COALESCE(d.precio,d.preciocatalogo,0) precio,d.cantidad*COALESCE(d.precio,d.preciocatalogo,0) importe,d.descuento,d.idcortesia,d.idmeseroproducto,ISNULL(m.nombre,'SIN MESERO') mesero,d.movimiento FROM Detalles d INNER JOIN EnlaceCuenta ec ON ec.foliodet=d.foliodet AND ec._origen=d._origen AND ec.enlaces=1 LEFT JOIN productos p ON p.idproducto=d.idproducto LEFT JOIN meseros m ON m.idmesero=d.idmeseroproducto ORDER BY d.foliodet,d.movimiento;
 ${base} SELECT cp.idformadepago,ISNULL(fp.descripcion,cp.idformadepago) nombre,cp.importe,cp.propina,cp.referencia FROM Pagos cp INNER JOIN Elegida c ON c.folio=cp.folio AND c._origen=cp._origen LEFT JOIN formasdepago fp ON fp.idformadepago=cp.idformadepago;
 ${base} SELECT COUNT(*) ambiguos FROM (SELECT v.foliodet,v._origen FROM Enlaces v WHERE EXISTS(SELECT 1 FROM Enlaces e INNER JOIN Elegida c ON c.folio=e.folio AND c._origen=e._origen WHERE e.foliodet=v.foliodet AND e._origen=v._origen) GROUP BY v.foliodet,v._origen HAVING COUNT(DISTINCT v.folio)>1) a;`);
 if(!result.recordsets[0].length)throw Object.assign(Error('Cuenta no encontrada. Actualiza la consulta para comprobar si cambió de estado.'),{status:404});
 if(result.recordsets[0].length!==1)throw Object.assign(Error('El folio identifica varias cuentas. No se mezclaron sus datos; descarga el diagnóstico de datos.'),{status:409});
 const meta=await metadata();res.json({correcto:true,cuenta:annotate(result.recordsets[0],meta)[0],productos:result.recordsets[1],pagos:result.recordsets[2],ambiguos:result.recordsets[3][0]?.ambiguos||0});
 }));
 app.get('/api/v8/turno/:interno',route(async(req,res)=>{
 if(!/^\d{1,19}$/.test(req.params.interno))throw Object.assign(Error('Turno no válido.'),{status:400});
 const db=await conectar();const turn=await db.request().input('interno',sql.BigInt,req.params.interno).query('SELECT CONVERT(varchar(30),idturnointerno) interno,CONVERT(varchar(30),idturno) turno,idempresa,cajero,idestacion,apertura,cierre,fondo,efectivo,tarjeta,vales,credito FROM turnos WHERE idturnointerno=@interno');
 if(turn.recordset.length!==1)throw Object.assign(Error('No se encontró un turno único con ese identificador.'),{status:409});
 const t=turn.recordset[0],f=settingsNormalize({turno:'i:'+t.interno,empresa:t.idempresa||'',estado:'pagadas'});const {cte}=buildScope(f);
 const r=await query(cte+` SELECT COUNT(*) cuentas,COALESCE(SUM(c.total),0) venta,COALESCE(SUM(c.propina),0) propina,COALESCE(SUM(c.totaldescuentos),0) descuentos,COALESCE(SUM(c.totalcortesias),0) cortesias,COALESCE(SUM(c.cambio),0) cambio FROM Cuentas c WHERE ${paid};\n`+cte+` SELECT COALESCE(SUM(cp.importe),0) pagos,COALESCE(SUM(cp.propina),0) propinas_pagos FROM Cuentas c INNER JOIN Pagos cp ON cp.folio=c.folio AND cp._origen=c._origen WHERE ${paid};\n`+`SELECT CONVERT(varchar(30),folio) folio,fecha,tipo,concepto,importe,cancelado,pagodepropina FROM movtoscaja mc WHERE EXISTS(SELECT 1 FROM turnos mt WHERE mt.idturnointerno=TRY_CONVERT(bigint,SUBSTRING(@turno,3,30)) AND ${turnMatch('mc','mt',f.turnoReferencia)}) AND (SELECT COUNT(*) FROM turnos mt WHERE ${turnMatch('mc','mt',f.turnoReferencia)})=1 ORDER BY fecha;
 SELECT COUNT(*) coincidencias FROM turnos WHERE idturnointerno=TRY_CONVERT(bigint,SUBSTRING(@turno,3,30));`,f);
 const [cuentas,pagos,servicios]=await Promise.all([report('cuentas',f),report('pagos',f,true),report('servicios',f,true)]);
 const resumen=r.recordsets[0][0],payment=r.recordsets[1][0];res.json({correcto:true,turno:t,resumen,pagosResumen:payment,diferenciaPagosVsVenta:Number(payment.pagos)-Number(resumen.venta),movimientos:r.recordsets[2],coincidencias:r.recordsets[3][0]?.coincidencias||0,cuentas,pagos,servicios,notas:['Los datos de cabecera y movimientos corresponden al turno completo. Las cuentas y pagos corresponden a todo el turno elegido, sin filtros heredados de otras pantallas.','Diferencia = importe de pagos registrado − total de cuentas pagadas. No es faltante/sobrante de caja: puede incluir cambio, moneda, cargos o distinta base de registro.','Los tipos de movimientos se muestran con su código original; no se suponen entradas ni salidas.']});
 }));
 app.get('/api/v8/exportar/:tipo',route(async(req,res)=>{
 const f=settingsNormalize(req.query),r=await report(req.params.tipo,f,true);
 if(req.query.formato==='json')return res.json(r);
 const ExcelJS=runtimeRequire('exceljs'),book=new ExcelJS.Workbook();book.creator='Restaurante 8';book.created=new Date();
 const info=book.addWorksheet('Filtros y alcance');info.columns=[{width:28},{width:100}];info.addRows([['Negocio',r.negocio],['Reporte',r.titulo],...r.filtros,['Filas',r.total],['Generado',r.actualizado],...r.notas.map(n=>['Alcance',n])]);info.getColumn(2).alignment={wrapText:true};
 const sheet=book.addWorksheet('Reporte');sheet.columns=r.columnas.map(([key,header,type])=>({key,header,width:type==='money'?22:28,style:type==='money'?{numFmt:'"$"#,##0.00'}:{}}));
 for(const row of r.filas){const clean={};for(const [key,,type] of r.columnas){const v=row[key];clean[key]=type==='money'||type==='number'?(v==null?null:Number(v)):type==='date'?(v?(v instanceof Date?v.toISOString():String(v)).replace('T',' ').slice(0,19):''):(v==null?'':String(v));}sheet.addRow(clean);}
 const totalRow=sheet.addRow({...r.totales,[r.columnas[0][0]]:'SUMA DE COLUMNAS'});totalRow.font={bold:true};
 sheet.views=[{state:'frozen',ySplit:1}];sheet.autoFilter={from:'A1',to:{row:1,column:r.columnas.length}};sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF18344A'}};
 res.set('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.set('Content-Disposition',`attachment; filename="Restaurante_${req.params.tipo}_${f.desde}_${f.hasta}.xlsx"`);await book.xlsx.write(res);res.end();
 }));
 return {clearCache,query,metadata,report,normalize:settingsNormalize,buildScope,dateExpr};
};
module.exports.internals={normalize,buildScope,reportQuery,cols,serviceName,annotate,note,dateExpr};
