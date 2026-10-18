'use strict';
// ZIP de menús portables: sin dependencias externas ni ejecución de contenido adjunto.
// Nunca inserta datos SQL. Sólo devuelve proyectos para revisión en la interfaz.
const zlib = require('node:zlib');
const { validarProyecto } = require('./public/menu-proyecto');
const MAGIC = 'restaurante.menu.portable';
const MAXZIP = 8 * 1024 * 1024;
const MAXJSON = 4 * 1024 * 1024;
const MAXFILES = 8;
const err = m => { throw Error(m); };
function crc32(buffer) {
  let crc = 0xFFFFFFFF;
  for (const b of buffer) {
    crc ^= b;
    for (let i=0;i<8;i++) crc = crc&1 ? (crc>>>1)^0xEDB88320 : crc>>>1;
  }
  return (crc^0xFFFFFFFF)>>>0;
}
function ensure(v, message) { if (!v) err(message); }
function decodeZip(input) {
  ensure(Buffer.isBuffer(input)&&input.length>=22&&input.length<=MAXZIP,'El archivo ZIP está vacío o supera 8 MB.');
  let eocd=-1;
  const start=Math.max(0,input.length-22-65535);
  for (let p=input.length-22;p>=start;p--){
    if(input.readUInt32LE(p)===0x06054b50 && p+22+input.readUInt16LE(p+20)===input.length){eocd=p;break;}
  }
  ensure(eocd!==-1,'No se encontró el directorio de un ZIP válido.');
  ensure(input.readUInt16LE(eocd+4)===0&&input.readUInt16LE(eocd+6)===0,'No se aceptan archivos ZIP divididos en volúmenes.');
  const count=input.readUInt16LE(eocd+10),dirsize=input.readUInt32LE(eocd+12),dirpos=input.readUInt32LE(eocd+16);
  ensure(count>0&&count<=MAXFILES&&count===input.readUInt16LE(eocd+8),'El ZIP tiene una cantidad de archivos no admitida.');
  ensure(dirpos+dirsize<=eocd && dirpos>=0,'El directorio del ZIP está dañado.');
  const files=new Map();let cursor=dirpos,total=0;
  for(let i=0;i<count;i++){
    ensure(cursor+46<=eocd&&input.readUInt32LE(cursor)===0x02014b50,'Entrada del ZIP dañada.');
    const flags=input.readUInt16LE(cursor+8),method=input.readUInt16LE(cursor+10),checksum=input.readUInt32LE(cursor+16);
    const csize=input.readUInt32LE(cursor+20),usize=input.readUInt32LE(cursor+24);
    const nlen=input.readUInt16LE(cursor+28),xlen=input.readUInt16LE(cursor+30),clen=input.readUInt16LE(cursor+32);
    const local=input.readUInt32LE(cursor+42),end=cursor+46+nlen+xlen+clen;
    ensure(end<=eocd,'El nombre del archivo ZIP está dañado.');
    const name=input.subarray(cursor+46,cursor+46+nlen).toString('utf8');
    ensure(!flags || !(flags&1),'No se admiten archivos ZIP cifrados.');
    ensure(flags & ~0x808 ? false : true,'El ZIP utiliza opciones incompatibles.');
    ensure(name==='manifest.json'||name==='menu.json','Este ZIP no es un paquete de menú Restaurante. Usa un ZIP generado para Importar menú ZIP, no un respaldo XML de Soft Restaurant.');
    ensure(!files.has(name),'El ZIP repite un archivo interno: '+name);
    ensure((method===0||method===8)&&usize<=MAXJSON&&csize<=MAXZIP,'Archivo interno demasiado grande o método ZIP no admitido.');
    ensure(local+30<=dirpos&&input.readUInt32LE(local)===0x04034b50,'Cabecera ZIP dañada.');
    ensure(input.readUInt16LE(local+8)===method,'El método ZIP no coincide.');
    const dataOffset=local+30+input.readUInt16LE(local+26)+input.readUInt16LE(local+28);
    ensure(dataOffset+csize<=dirpos,'El archivo ZIP contiene datos fuera de rango.');
    const raw=input.subarray(dataOffset,dataOffset+csize);
    let data;
    try {data=method===0?raw:zlib.inflateRawSync(raw,{maxOutputLength:MAXJSON});}
    catch{err('El ZIP contiene datos dañados o excede los límites.');}
    ensure(data.length===usize && crc32(data)===checksum,'El ZIP está dañado: tamaño o integridad incorrectos.');
    total+=data.length;ensure(total<=MAXJSON,'El menú ZIP es demasiado grande.');
    files.set(name,data);cursor=end;
  }
  ensure(cursor===dirpos+dirsize&&files.size===2&&files.has('manifest.json')&&files.has('menu.json'),'El paquete debe contener exactamente manifest.json y menu.json.');
  return files;
}
function parseJson(data,label){
  try{return JSON.parse(data.toString('utf8'));}catch{err('No se pudo leer el JSON de '+label+'.');}
}
function importarMenuZip(buffer) {
  const files=decodeZip(buffer),manifest=parseJson(files.get('manifest.json'),'manifest'),project=parseJson(files.get('menu.json'),'menú');
  ensure(manifest&&typeof manifest==='object'&&manifest.formato===MAGIC&&manifest.version===1&&manifest.archivo==='menu.json'&&typeof manifest.nombre==='string'&&manifest.nombre.trim()&&manifest.nombre.length<=120,'El paquete no tiene un manifiesto Restaurante válido.');
  const valid=validarProyecto(project);
  ensure(valid.fotografias.length===0,'El ZIP de menú debe contener productos y grupos sin fotografías. Exporta el catálogo preparado, no una captura pendiente de OCR.');
  return {nombre:manifest.nombre.trim(),proyecto:valid,productos:valid.productos.length,compuestos:valid.productos.filter(p=>p.tipo==='con_opciones').length};
}
function portabilizar(proyecto){
  const valid=validarProyecto(proyecto);
  // Exportación con lista blanca: nunca copiar configuraciones SQL,
  // sesiones, identificadores de empresa ni archivos fotográficos.
  const p={
    version:1,clasificacionEsquema:'sql11',memoriaActiva:false,
    titulo:String(valid.titulo||'Menú de Restaurante').slice(0,120),
    fotografias:[],
    gruposPreparados:valid.gruposPreparados.map(g=>({id:g.id,nombre:g.nombre,
      ...(g.clasificacion!==undefined?{clasificacion:g.clasificacion}:{})})),
    productos:valid.productos.map(prod=>({
      id:prod.id,nombre:prod.nombre,precio:prod.precio,clave:'',claveAutomatica:true,
      idgrupo:prod.idgrupo,grupo_detectado:prod.grupo_detectado||'',categoria_padre:prod.categoria_padre||'',
      tipo:prod.tipo,ingredientes:prod.ingredientes,evidencia:[],revision:prod.revision,
      revisado:prod.revisado===true,excluido:prod.excluido===true,
      modificadores:prod.modificadores.map(m=>({nombre:m.nombre,obligatorio:m.obligatorio,
        minimo:m.minimo,maximo:m.maximo,
        opciones:m.opciones.map(o=>({nombre:o.nombre,precio:o.precio,evidencia:[]}))})),
      ...(prod.opcionesVisualesPendientes?.length?{opcionesVisualesPendientes:prod.opcionesVisualesPendientes.map(o=>({marcaId:o.marcaId,texto:o.texto,tipo:o.tipo}))}:{})
    }))
  };
  for(const prod of p.productos){
    delete prod.foto;delete prod.importado;delete prod.claveOrigenSoft;
    delete prod.duplicado;delete prod.claveProblema;delete prod.claveOcupada;
    prod.clave='';prod.claveAutomatica=true;prod.evidencia=[];
    if(Array.isArray(prod.opcionesVisualesPendientes)&&prod.opcionesVisualesPendientes.length){prod.revisado=false;prod.revision.push('Las correcciones visuales pendientes no incluyen fotografías en el paquete.');}
    for(const m of prod.modificadores)for(const option of m.opciones){if(option.evidencia)option.evidencia=[];}
    // Un idgrupo numérico pertenece a la base original, NO al nuevo cliente.
    if(!String(prod.idgrupo).startsWith('borrador:')){
      const groupName=String(prod.grupo_detectado||'').trim();
      let draft=p.gruposPreparados.find(g=>g.nombre.trim().toLocaleLowerCase('es-MX')===groupName.toLocaleLowerCase('es-MX'));
      if(groupName){
        if(!draft){
          const id='menu-portable-'+p.gruposPreparados.length;
          draft={id,nombre:groupName};p.gruposPreparados.push(draft);
        }
        prod.idgrupo='borrador:'+draft.id;
      } else {prod.idgrupo='';prod.revisado=false;prod.revision.push('Asigna el grupo de este producto en el nuevo negocio.');}
    }
  }
  delete p.origenCatalogoSQL;delete p.conexion;delete p.empresa;delete p.claveSQL;
  return validarProyecto(p);
}
function zipStored(entries){
  const parts=[],central=[];let offset=0;
  for(const [name,data] of entries){
    const filename=Buffer.from(name,'utf8');const raw=Buffer.from(data);
    ensure(raw.length<=MAXJSON,'Archivo interno demasiado grande.');
    const head=Buffer.alloc(30);head.writeUInt32LE(0x04034b50,0);head.writeUInt16LE(20,4);head.writeUInt16LE(0x800,6);
    head.writeUInt32LE(crc32(raw),14);head.writeUInt32LE(raw.length,18);head.writeUInt32LE(raw.length,22);head.writeUInt16LE(filename.length,26);
    parts.push(head,filename,raw);
    const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);
    c.writeUInt32LE(crc32(raw),16);c.writeUInt32LE(raw.length,20);c.writeUInt32LE(raw.length,24);c.writeUInt16LE(filename.length,28);c.writeUInt32LE(offset,42);
    central.push(c,filename);offset+=head.length+filename.length+raw.length;
  }
  const directory=Buffer.concat(central);
  const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);
  end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  const result=Buffer.concat([...parts,directory,end]);ensure(result.length<=MAXZIP,'El ZIP excede los 8 MB.');return result;
}
function crearMenuZip(project,name='Menú de Restaurante') {
  ensure(typeof name==='string'&&name.trim()&&name.length<=120,'Indica un nombre de menú válido.');
  const portable=portabilizar(project);
  const manifest={formato:MAGIC,version:1,nombre:name.trim(),archivo:'menu.json'};
  return zipStored([['manifest.json',JSON.stringify(manifest,null,2)],['menu.json',JSON.stringify(portable,null,2)]]);
}
module.exports={importarMenuZip,crearMenuZip,portabilizar,decodeZip,crc32};
