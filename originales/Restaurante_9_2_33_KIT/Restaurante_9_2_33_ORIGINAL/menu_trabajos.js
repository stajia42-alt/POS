'use strict';
// Cola pequeña en memoria para que la lectura continúe cuando se corta la petición HTTP.
// No guarda imágenes ni secretos en SQL ni en el proyecto compartido.
const crypto=require('crypto');
function crearCola({procesar,maxPendientes=8,retencionMs=45*60*1000}={}) {
  if(typeof procesar!=='function')throw Error('Procesador requerido');
  const jobs=new Map(), index=new Map(), queue=[];
  let active=false;
  function sweep(){
    const now=Date.now();
    for(const [id,j] of jobs)if(['lista','error'].includes(j.estado)&&now-j.actualizado>retencionMs){jobs.delete(id);index.delete(j.owner+'|'+j.cliente);}
  }
  function enqueue(owner,cliente,data){
    sweep();
    if(!owner||!/^[-a-zA-Z0-9]{8,100}$/.test(cliente||''))throw Object.assign(Error('Identificador de fotografía no válido.'),{status:400});
    const existing=index.get(owner+'|'+cliente);
    if(existing&&jobs.has(existing))return {id:existing,estado:jobs.get(existing).estado,repetido:true};
    if(queue.length+(active?1:0)>=maxPendientes)throw Object.assign(Error('Hay demasiadas fotografías pendientes. Espera a que se procesen las anteriores.'),{status:429});
    const id=crypto.randomUUID(),j={id,owner,cliente,estado:'pendiente',actualizado:Date.now(),data,resultado:null,error:null};
    jobs.set(id,j);index.set(owner+'|'+cliente,id);queue.push(id);
    setImmediate(run);
    return {id,estado:'pendiente',repetido:false};
  }
  async function run(){
    if(active)return;
    const id=queue.shift();if(!id)return;
    const j=jobs.get(id);if(!j)return setImmediate(run);
    active=true;j.estado='procesando';j.actualizado=Date.now();
    try {j.resultado=await procesar(j.data);j.estado='lista';}
    catch(e){j.error=String(e?.message||'No se pudo analizar la fotografía.').slice(0,400);j.estado='error';}
    finally{j.data=null;j.actualizado=Date.now();active=false;setImmediate(run);}
  }
  function get(owner,id){sweep();const j=jobs.get(id);if(!j||j.owner!==owner)return null;
    return {id:j.id,estado:j.estado,...(j.estado==='lista'?{resultado:j.resultado}:{}),...(j.estado==='error'?{error:j.error}:{})};
  }
  return {enqueue,get};
}
module.exports={crearCola};
