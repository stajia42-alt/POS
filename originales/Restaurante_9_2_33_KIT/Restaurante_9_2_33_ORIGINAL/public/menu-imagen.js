'use strict';
// Preparación de fotografías compartida por Safari y navegadores de escritorio.
// Primero intenta HTMLImageElement: createImageBitmap falla en algunos iPhone.
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RestauranteImagen = api;
})(typeof window !== 'undefined' ? window : globalThis, function() {
  function loadImg(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), img = new Image();
      let finished = false;
      const cleanup = () => { img.onload = img.onerror = null; URL.revokeObjectURL(url); };
      img.onload = () => { if(finished)return;finished=true;cleanup();resolve(img); };
      img.onerror = () => { if(finished)return;finished=true;cleanup();reject(Error('Safari no pudo abrir la imagen seleccionada.')); };
      img.src = url;
    });
  }
  async function decoded(file) {
    try {
      const img = await loadImg(file);
      return {image:img,width:img.naturalWidth,height:img.naturalHeight,close(){}};
    } catch (first) {
      if(typeof createImageBitmap !== 'function')throw first;
      try {
        const bitmap=await createImageBitmap(file);
        return {image:bitmap,width:bitmap.width,height:bitmap.height,close(){bitmap.close?.();}};
      } catch { throw Error('No se pudo abrir la fotografía en Safari. Prueba exportarla como JPG o toma otra fotografía.'); }
    }
  }
  function toBlob(canvas,quality) {
    return new Promise((resolve,reject)=>{
      try {canvas.toBlob(blob=>blob?.size?resolve(blob):reject(Error('No fue posible comprimir la imagen en el teléfono.')),'image/jpeg',quality);}
      catch {reject(Error('Safari no pudo convertir la fotografía a JPG.'));}
    });
  }
  function base64(blob) {
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onerror=()=>reject(Error('Safari no pudo leer la fotografía comprimida.'));
      reader.onload=()=>{const data=String(reader.result||'');const comma=data.indexOf(',');
        if(comma<0||!/^data:image\/jpeg;base64,/i.test(data.slice(0,comma+1)))return reject(Error('El archivo comprimido no tiene un formato válido.'));
        resolve(data.slice(comma+1));
      };
      reader.readAsDataURL(blob);
    });
  }
  async function prepararImagen(file,{conDimensiones=false}={}) {
    if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Selecciona una fotografía JPG, PNG o WebP.');
    if(file.size>25*1024*1024)throw Error('La fotografía supera 25 MB.');
    const source=await decoded(file);
    try {
      if(!source.width||!source.height||source.width*source.height>40000000)throw Error('Las dimensiones de la fotografía no son compatibles.');
      let scale=Math.min(1,2200/Math.max(source.width,source.height));
      for(let attempt=0;attempt<5;attempt++) {
        const c=document.createElement('canvas');
        c.width=Math.max(1,Math.round(source.width*scale));c.height=Math.max(1,Math.round(source.height*scale));
        const ctx=c.getContext('2d');
        if(!ctx)throw Error('El teléfono no pudo preparar el área de imagen.');
        ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(source.image,0,0,c.width,c.height);
        const blob=await toBlob(c,[.84,.77,.72,.67,.62][attempt]);
        // Deja margen frente al límite de la API y evita cargas JSON enormes por Cloudflare.
        if(blob.size<=3*1024*1024)return conDimensiones?{mime:'image/jpeg',imagen:await base64(blob),ancho:c.width,alto:c.height}:{mime:'image/jpeg',imagen:await base64(blob)};
        scale*=.8;
      }
      throw Error('La fotografía es muy pesada. Acércate al menú y fotografía una sección por separado.');
    } catch(e) {
      if(e instanceof Error&&/(Safari|fotografía|teléfono|imagen|archivo)/i.test(e.message))throw e;
      throw Error('Error al preparar la imagen en Safari. Prueba una captura nueva o JPG.');
    } finally {source.close();}
  }
  return {prepararImagen};
});
