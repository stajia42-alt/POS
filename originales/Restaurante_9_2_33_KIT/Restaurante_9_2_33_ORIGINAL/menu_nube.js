'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {validarProyecto}=require('./public/menu-proyecto');
const MAX_BYTES=3*1024*1024;
module.exports=function({app,configDir}){
  const file=path.join(configDir,'menu-proyecto-servidor.json');
  function actual(){
    try{return JSON.parse(fs.readFileSync(file,'utf8'));}
    catch(e){if(e.code==='ENOENT')return null;throw e;}
  }
  function due(req,res,next){if(req.auth?.user?.role!=='dueno')return res.status(403).json({correcto:false,error:'Solo el dueño puede compartir el proyecto.'});next();}
  app.get('/api/menu-nube',due,(req,res,next)=>{try{const item=actual();res.json({correcto:true,existe:!!item,revision:item?.revision||null,proyecto:item?.proyecto||null,actualizado:item?.fecha||null});}catch(e){next(e);}});
  app.post('/api/menu-nube',due,(req,res,next)=>{
    try{
      if(req.headers['x-csrf-token']!==req.auth.nonce)return res.status(403).json({correcto:false,error:'Sesión vencida. Recarga la página.'});
      const json=JSON.stringify(req.body?.proyecto??null);
      if(Buffer.byteLength(json,'utf8')>MAX_BYTES)return res.status(413).json({correcto:false,error:'El proyecto supera 3 MB. Descarga el JSON para conservarlo; no se modificó el proyecto compartido.'});
      const proyecto=validarProyecto(req.body.proyecto);
      const prev=actual(),revision=req.body.revision??null;
      if(revision!== (prev?.revision??null))return res.status(409).json({correcto:false,error:'Existe una versión distinta en el servidor. Guarda primero el archivo JSON de este dispositivo y recupera la versión compartida.'});
      const item={schema:1,revision:crypto.randomBytes(16).toString('hex'),fecha:new Date().toISOString(),proyecto};
      fs.mkdirSync(configDir,{recursive:true});
      const temp=file+'.tmp-'+crypto.randomBytes(6).toString('hex');
      try{fs.writeFileSync(temp,JSON.stringify(item),{mode:0o600});if(prev)fs.copyFileSync(file,file+'.bak');fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
      res.json({correcto:true,revision:item.revision,actualizado:item.fecha});
    }catch(e){next(e);}
  });
};
