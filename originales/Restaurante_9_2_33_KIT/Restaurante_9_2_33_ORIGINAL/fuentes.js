'use strict';
// Explicit shared columns: historical and working tables have different schemas.
const accountColumns='folio,numcheque,fecha,cierre,mesa,idmesero,pagado,cancelado,cambio,razoncancelado,idempresa,tipodeservicio,idturno,usuariocancelo,comentariodescuento,estacion,usuariodescuento,propinapagada,totalarticulos,total,propina,totaldescuentos,totalcortesias,totalsindescuento,totalconpropinacargo,cargo,totalimpuesto1'.split(',');
const detailColumns='foliodet,movimiento,cantidad,idproducto,descuento,precio,preciocatalogo,idmeseroproducto,idcortesia'.split(',');
const paymentColumns='folio,idformadepago,importe,propina,referencia'.split(',');
const project=(alias,cols)=>cols.map(c=>alias+'.'+c).join(',');
function turnMatch(c,t,mode='auto'){
 const key=mode==='interno'?`${c}.idturno=${t}.idturnointerno`:mode==='numero'?`${c}.idturno=${t}.idturno`:`(${c}.idturno=${t}.idturnointerno OR ${c}.idturno=${t}.idturno)`;
 return `${key} AND ISNULL(${c}.idempresa,'')=ISNULL(${t}.idempresa,'')`;
}
function sources({live=false,mode='auto'}={}){
 const historical=`SELECT ${project('h',accountColumns)},'historico' _origen FROM cheques h`;
 // folio and foliotempcheques are different namespaces. Never dedupe by folio alone.
 const current=`SELECT ${project('t',accountColumns)},'temporal' _origen FROM tempcheques t WHERE NOT EXISTS(SELECT 1 FROM cheques h WHERE h.foliotempcheques=t.folio AND ISNULL(h.idempresa,'')=ISNULL(t.idempresa,'') AND h.fecha=t.fecha)`;
 return `OrigenCuentas AS (${live?current:historical+' UNION ALL '+current}),
 TodasCuentas AS (SELECT c.*,tr.interno _turnointerno,tr.numero _turnonumero,tr.coincidencias _turnocoincidencias FROM OrigenCuentas c OUTER APPLY (SELECT CASE WHEN COUNT(*)=1 THEN MIN(t.idturnointerno) END interno,CASE WHEN COUNT(*)=1 THEN MIN(t.idturno) END numero,COUNT(*) coincidencias FROM turnos t WHERE ${turnMatch('c','t',mode)}) tr),
 Enlaces AS (${live?'':"SELECT v.folio,v.foliodet,'historico' _origen FROM vwrepproductosvendidoscheques v UNION ALL "}SELECT v.folio,v.foliodet,'temporal' _origen FROM vwrepproductosvendidostempcheques v),
 Detalles AS (${live?'':`SELECT ${project('d',detailColumns)},'historico' _origen FROM cheqdet d UNION ALL `}SELECT ${project('d',detailColumns)},'temporal' _origen FROM tempcheqdet d),
 Pagos AS (${live?'':`SELECT ${project('p',paymentColumns)},'historico' _origen FROM chequespagos p UNION ALL `}SELECT ${project('p',paymentColumns)},'temporal' _origen FROM tempchequespagos p)`;
}
module.exports={sources,turnMatch,accountColumns,detailColumns,paymentColumns};
