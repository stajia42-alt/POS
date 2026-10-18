'use strict';
// Almacena solo imágenes de trabajo, fuera de la carpeta pública. Requiere sesión de dueño.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function decodeFoto(id,mime,imagen){
  if(!UUID.test(id))throw Object.assign(Error('Identificador de foto incorrecto.'),{status:400});
  if(!['image/jpeg','image/png','image/webp'].includes(mime)||typeof imagen!=='string'||imagen.length>4300000||!imagen.length||!/^[A-Za-z0-9+/]*={0,2}$/.test(imagen))throw Object.assign(Error('Imagen inválida.'),{status:400});
  const bytes=Buffer.from(imagen,'base64');
  if(bytes.length>3200000||bytes.length<64)throw Object.assign(Error('Fotografía demasiado grande o vacía.'),{status:413});
  const valid=mime==='image/jpeg'&&bytes[0]===0xff&&bytes[1]===0xd8 || mime==='image/png'&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || mime==='image/webp'&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
  if(!valid)throw Object.assign(Error('El contenido no coincide con el formato de la fotografía.'),{status:400});
  return bytes;
}
module.exports=function({app,configDir,soloLocal}){
  const dir=path.join(configDir,'menu-fotos');
  function photoPath(id){if(!UUID.test(String(id)))throw Object.assign(Error('Foto no válida.'),{status:400});return path.join(dir,id+'.img');}
  app.post('/api/menu-visual/fotos/:id',soloLocal,(req,res)=>{
    try {
      if(req.headers['x-csrf-token']!==req.auth?.nonce)return res.status(403).json({correcto:false,error:'Sesión caducada.'});
      const id=req.params.id,mime=req.body?.mime,bytes=decodeFoto(id,mime,req.body?.imagen);
      fs.mkdirSync(dir,{recursive:true}); const file=photoPath(id),header=JSON.stringify({mime,hash:crypto.createHash('sha256').update(bytes).digest('hex')});
      // Crear sólo nuevas fotos; un ID no puede sobrescribir otro contenido.
      if(fs.existsSync(file)){
        const prev=fs.readFileSync(file);const split=prev.indexOf(10);
        if(split<0||crypto.createHash('sha256').update(prev.subarray(split+1)).digest('hex')!==crypto.createHash('sha256').update(bytes).digest('hex'))return res.status(409).json({correcto:false,error:'Ya existe una imagen diferente con ese identificador.'});
      } else fs.writeFileSync(file,Buffer.concat([Buffer.from(header+'\n'),bytes]),{flag:'wx',mode:0o600});
      return res.json({correcto:true,id});
    }catch(e){return res.status(e.status||500).json({correcto:false,error:e.status?e.message:'No se pudo guardar la imagen.'});}
  });
  app.get('/api/menu-visual/fotos/:id',soloLocal,(req,res)=>{
    try{const file=photoPath(req.params.id),data=fs.readFileSync(file),sep=data.indexOf(10);if(sep<0)throw Error('Formato');const meta=JSON.parse(data.subarray(0,sep).toString());if(!['image/jpeg','image/png','image/webp'].includes(meta.mime))throw Error('Tipo');
      res.set('Cache-Control','private, no-store').set('X-Content-Type-Options','nosniff').type(meta.mime).send(data.subarray(sep+1));
    }catch(e){res.status(e.code==='ENOENT'?404:500).json({correcto:false,error:'No se encontró la imagen guardada.'});}
  });
};
module.exports.decodeFoto=decodeFoto;
