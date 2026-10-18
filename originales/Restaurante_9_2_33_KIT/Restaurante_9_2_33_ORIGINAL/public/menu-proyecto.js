(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MenuProyecto = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const text = v => typeof v === 'string' && v.length <= 10000;
  const strings = v => Array.isArray(v) && v.every(text);
  const ids = v => Array.isArray(v) && v.every(n => Number.isInteger(n) && n >= 0);
  const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const price = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 9999999 && /^\d+(?:\.\d{1,2})?$/.test(String(v));
  const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  function ensure(condition, message) {if (!condition) throw Error(message);}
  function safe(value, depth = 0) {
    ensure(depth <= 24, 'El proyecto contiene una estructura demasiado profunda.');
    if (!value || typeof value !== 'object') return;
    for (const key of Object.keys(value)) {
      ensure(!['__proto__', 'constructor', 'prototype'].includes(key), 'El proyecto contiene propiedades no permitidas.');
      safe(value[key], depth + 1);
    }
  }
  function validarProducto(p, reviewed) {
    const errors = [];
    if (!p.nombre.trim()) errors.push('Indica el nombre.');
    if (reviewed) {
      if (p.nombre.length > 60) errors.push('Ajusta el nombre a 60 caracteres sin perder su significado.');
      if (!price(p.precio)) errors.push('Confirma el precio base con hasta dos decimales.');
      if (!p.idgrupo) errors.push('Asigna un grupo.');
      if (p.tipo === 'con_opciones' && !p.modificadores.length) errors.push('Agrega las opciones del producto.');
      if (p.modificadores.length && p.tipo !== 'con_opciones') errors.push('Selecciona «Producto con opciones».');
      for (const m of p.modificadores) {
        if (!m.nombre.trim() || typeof m.obligatorio !== 'boolean' || !Number.isInteger(m.minimo) || !Number.isInteger(m.maximo)
          || m.minimo < 0 || m.maximo < 1 || m.maximo < m.minimo || m.maximo > m.opciones.length || (m.obligatorio ? m.minimo < 1 : m.minimo !== 0))
          errors.push('Revisa nombre, obligatoriedad y límites de ' + (m.nombre || 'cada grupo') + '.');
        if (!m.opciones.length || m.opciones.some(o => !o.nombre.trim() || !price(o.precio))) errors.push('Cada opción necesita nombre y precio confirmados, incluyendo $0.');
        if (new Set(m.opciones.map(o => norm(o.nombre))).size !== m.opciones.length) errors.push('Hay opciones repetidas dentro de ' + m.nombre + '.');
      }
    }
    return [...new Set(errors)];
  }
  function validarProyecto(input) {
    safe(input);
    ensure(object(input) && input.version === 1 && Array.isArray(input.productos) && Array.isArray(input.fotografias) && Array.isArray(input.gruposPreparados), 'El archivo no es un proyecto de menú compatible.');
    ensure(input.productos.length <= 5000 && input.fotografias.length <= 100 && input.gruposPreparados.length <= 2000, 'El proyecto excede los límites de revisión; no se recortó.');
    if(input.memoriaActiva!==undefined)ensure(typeof input.memoriaActiva==='boolean','Configuración de memoria inválida.');
    const d = structuredClone(input), photos = new Map(), groups = new Set(), products = new Set();
    // Los borradores 9.2.24 y anteriores etiquetaban erróneamente 1=Alimentos,
    // 2=Bebidas. La migración SOLO afecta clasificaciones de grupos todavía no
    // registrados en SQL; no cambia productos ni grupos existentes.
    if(d.clasificacionEsquema!==undefined)ensure(d.clasificacionEsquema==='sql11','Versión de clasificación desconocida.');
    if(d.clasificacionEsquema!=='sql11'){
      for(const g of d.gruposPreparados)if(g&&g.clasificacion===1)g.clasificacion=2;
      else if(g&&g.clasificacion===2)g.clasificacion=1;
      d.clasificacionEsquema='sql11';
    }
    for (const g of d.gruposPreparados) {
      ensure(object(g) && text(g.id) && g.id && !groups.has(g.id) && text(g.nombre) && g.nombre.trim(), 'Hay grupos incompletos o identificadores repetidos.');
      ensure(g.clasificacion===undefined||[1,2,3].includes(g.clasificacion), 'La clasificación de un grupo debe ser Alimentos, Bebidas u Otros.');
      groups.add(g.id);
    }
    for (const f of d.fotografias) {
      ensure(object(f) && text(f.id) && f.id && !photos.has(f.id) && text(f.nombre) && ['pendiente','analizando','lista','error'].includes(f.estado), 'La fotografía está incompleta o repetida.');
      const blockIds = new Set(); photos.set(f.id, blockIds);
      if(f.imagenGuardada!==undefined)ensure(typeof f.imagenGuardada==='boolean','Indicador de imagen incorrecto.');
      if(f.correcciones!==undefined)ensure(Array.isArray(f.correcciones)&&f.correcciones.length<=3000,'Historial de correcciones inválido.');
      if(f.marcasVisuales!==undefined){
        ensure(Array.isArray(f.marcasVisuales)&&f.marcasVisuales.length<=500,'Demasiados cuadros guardados en una fotografía.');
        const idsMarcas=new Set();
        for(const m of f.marcasVisuales){
          ensure(object(m)&&text(m.id)&&m.id&&!idsMarcas.has(m.id)&&['categoria','producto','precio','descripcion','ignorar','modificador','componente'].includes(m.tipo), 'Hay un cuadro pendiente inválido.');
          ensure(Array.isArray(m.rect)&&m.rect.length===4&&m.rect.every(v=>Number.isFinite(v)&&v>=0&&v<=1)&&m.rect[2]>.003&&m.rect[3]>.003&&m.rect[0]+m.rect[2]<=1.00001&&m.rect[1]+m.rect[3]<=1.00001,'Un cuadro pendiente sale de la fotografía.');
          idsMarcas.add(m.id);
        }
      }
      for(const dim of ['ancho','alto'])if(f[dim]!==undefined)ensure(Number.isInteger(f[dim])&&f[dim]>0&&f[dim]<=10000,'Dimensiones de imagen inválidas.');
      if (f.estado === 'analizando') {f.estado = 'pendiente'; f.error = f.servidorTrabajo ? 'El análisis puede continuar en el servidor. Pulsa Analizar fotografías para recuperarlo.' : 'Si no tienes el archivo original, vuelve a adjuntar la foto.';}
      if (!f.resultado) continue;
      const r = f.resultado;
      ensure(object(r) && Array.isArray(r.bloques) && r.bloques.length <= 5000 && Array.isArray(r.pendientes) && Array.isArray(r.categorias), 'La evidencia OCR está incompleta.');
      for (const b of r.bloques) {
        if (b.tipoVisual !== undefined) ensure(['categoria','producto','precio','descripcion','ignorar','modificador','componente'].includes(b.tipoVisual), 'Tipo visual inválido.');
        if (b.rectVisual !== undefined) ensure(Array.isArray(b.rectVisual) && b.rectVisual.length===4 && b.rectVisual.every(n=>Number.isFinite(n)&&n>=0&&n<=1)&&b.rectVisual[0]+b.rectVisual[2]<=1.00001&&b.rectVisual[1]+b.rectVisual[3]<=1.00001, 'Recuadro de corrección incorrecto.');
        ensure(object(b) && Number.isInteger(b.id) && b.id >= 0 && !blockIds.has(b.id) && text(b.texto) && strings(b.uso), 'Un bloque de evidencia OCR es inválido.');
        blockIds.add(b.id);
      }
      for (const c of r.categorias) ensure(object(c) && text(c.nombre) && (c.padre === undefined || text(c.padre)) && ids(c.evidencia) && c.evidencia.every(id => blockIds.has(id)), 'Una categoría del archivo está incompleta.');
      for (const b of r.pendientes) ensure(object(b) && blockIds.has(b.id) && text(b.texto) && strings(b.uso), 'Una línea pendiente no corresponde a la evidencia.');
    }
    for (const p of d.productos) {
      ensure(object(p) && text(p.id) && p.id && !products.has(p.id) && text(p.nombre) && text(p.clave) && text(p.idgrupo)
        && Array.isArray(p.modificadores) && p.modificadores.length <= 100 && strings(p.ingredientes) && strings(p.revision) && ids(p.evidencia)
        && ['independiente','variante','con_opciones'].includes(p.tipo), 'El proyecto contiene un producto incompleto.');
      if(p.opcionesVisualesPendientes!==undefined)ensure(Array.isArray(p.opcionesVisualesPendientes)&&p.opcionesVisualesPendientes.length<=120&&p.opcionesVisualesPendientes.every(m=>object(m)&&text(m.marcaId)&&text(m.texto)&&['modificador','componente'].includes(m.tipo)), 'Opciones visuales pendientes incorrectas.');
      products.add(p.id);
      ensure(p.precio === null || price(p.precio), 'Un producto contiene un precio inválido.');
      if (p.presentacion !== undefined) ensure(text(p.presentacion), 'La presentación debe ser texto.');
      if (p.grupo_detectado !== undefined) ensure(text(p.grupo_detectado), 'La categoría del producto es inválida.');
      if (p.categoria_padre !== undefined) ensure(text(p.categoria_padre), 'La categoría principal es inválida.');
      if (p.idgrupo.startsWith('borrador:')) ensure(groups.has(p.idgrupo.slice(9)), 'El producto apunta a un grupo preparado que falta en el archivo.');
      if (p.foto !== undefined) ensure(photos.has(p.foto) && p.evidencia.every(id => photos.get(p.foto).has(id)), 'El producto apunta a una foto o evidencia que falta en el archivo.');
      for (const key of ['revisado','excluido']) {ensure(p[key] === undefined || typeof p[key] === 'boolean', 'El estado del producto es inválido.'); p[key] = p[key] === true;}
      for (const m of p.modificadores) {
        ensure(object(m) && text(m.nombre) && Array.isArray(m.opciones) && m.opciones.length <= 500
          && (m.obligatorio === null || typeof m.obligatorio === 'boolean')
          && [m.minimo,m.maximo].every(n => n === null || Number.isInteger(n) && n >= 0), 'Hay grupos de opciones incompletos.');
        for (const o of m.opciones) ensure(object(o) && text(o.nombre) && (o.precio === null || price(o.precio)) && (o.evidencia === undefined || ids(o.evidencia)), 'Hay opciones con nombre, precio o evidencia inválidos.');
      }
      if (p.revisado && validarProducto(p, true).length) {p.revisado = false; p.revision.push('La revisión guardada tiene datos pendientes: confirmar de nuevo.');}
    }
    return d;
  }
  return Object.freeze({validarProyecto, validarProducto});
});
