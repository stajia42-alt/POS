'use strict';
// Análisis puro. No abre conexiones, no escribe SQL y no elimina propuestas.
const normalizar = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const alias = {
  entradas: ['entradas', 'entrada', 'appetizers', 'aperitivos'],
  sopas: ['sopas', 'sopa', 'soups'], bebidas: ['bebidas', 'drinks'],
  postres: ['postres', 'desserts'], ensaladas: ['ensaladas', 'salads'],
  dumplings: ['dumplings'], 'arroz frito': ['arroz frito', 'fried rice'],
  ramen: ['ramen'], udon: ['udon'], 'ramen / udon': ['ramen udon'],
  refrescos: ['refrescos'], 'aguas frescas': ['aguas frescas'], cervezas: ['cervezas'],
  sushi: ['sushi'], tacos: ['tacos'], hamburguesas: ['hamburguesas'], pizzas: ['pizzas']
};
const canonic = new Map(Object.entries(alias).flatMap(([k, values]) => values.map(v => [normalizar(v), k])));
const canonical = v => canonic.get(normalizar(v)) || normalizar(v);
const title = s => s ? s[0].toLocaleUpperCase('es') + s.slice(1).toLocaleLowerCase('es') : '';
const FAMILY = new Set(['dumplings', 'arroz frito', 'ramen', 'udon', 'ramen / udon']);
const GENERAL = new Set(['entradas', 'sopas', 'bebidas', 'postres', 'ensaladas']);
const ingles = text => /\b(with|pork|chicken|shrimp|beef|fried|shredded|cucumber|potato|salad|roll|cheese|chesse|spring|rice|mixed|steamed|stuffed|red bean)\b/i.test(text)&&!/\b(con|cerdo|pollo|camar[oó]n|res|ensalada|tiras|queso|fritos?|primavera|arroz|relleno|mixta)\b/i.test(text);
const otroAlfabeto = text => /\p{L}/u.test(text)&&!/[a-záéíóúñü]/i.test(text);
const MONEY = /^(?:\$\s*)?(\d{1,7})(?:[.,](\d{1,2}))?$/;
function precio(v) {
  if (typeof v !== 'number' && typeof v !== 'string') return null;
  let s = String(v).trim();
  if (/^\$?\s*\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(s)) s = s.replace(/,/g, '');
  const m = s.match(MONEY);
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] || '').padEnd(2, '0'));
  return cents <= 999999900 ? cents / 100 : null;
}
function grupoCoincidente(nombre, grupos = []) {
  const matches = grupos.filter(g => canonical(g.descripcion) === canonical(nombre));
  return {idgrupo: matches.length === 1 ? String(matches[0].idgrupo).trim() : '',
    estado: matches.length === 1 ? 'existente' : matches.length > 1 ? 'ambiguo' : 'faltante',
    coincidencias: matches.map(g => String(g.idgrupo).trim())};
}
function encabezado(texto) {
  const n = normalizar(texto), known = canonic.get(n);
  if (known) return {nombre: title(known), conocido: true};
  if (/^[\p{L}\s/&-]{3,45}$/u.test(texto) && texto === texto.toLocaleUpperCase('es') && texto !== texto.toLocaleLowerCase('es'))
    return {nombre: title(texto), conocido: false};
  return null;
}
function presentaciones(texto) {
  const hits = [...texto.matchAll(/\b\d+(?:[.,]\d+)?\s*(?:piezas?|pzas?|pz|pcs|ml|kg|g|oz|litros?|l)\b/gi)];
  if (!hits.length) return [];
  const rest = texto.replace(/\b\d+(?:[.,]\d+)?\s*(?:piezas?|pzas?|pz|pcs|ml|kg|g|oz|litros?|l)\b/gi, '').replace(/[\s/|:,-]/g, '');
  return rest ? [] : hits.map(x => x[0].replace(/\s+/g, ' ').trim());
}
function importes(texto) {
  let s = texto.trim().replace(/\$\s+/g, '$').replace(/\b(?:MXN|pesos)\s*$/i, '').trim();
  if (!s) return null;
  const tokens = s.split(/\s*[/|]\s*|\s+(?=\$?\d)/).map(t => t.trim()).filter(Boolean);
  const prices = tokens.map(precio);
  return prices.length && prices.every(x => x !== null) ? prices : null;
}
function separarPrecio(texto) {
  if (presentaciones(texto).length) return null;
  const pieces = texto.match(/^(.*?)\s*(\$?\s*\d{1,7}(?:[.,]\d{1,2})?)\s*\/\s*(\d+\s*(?:piezas?|pzas?|pz|pcs))\s*$/i);
  if (pieces && precio(pieces[2]) !== null) return {nombre: pieces[1].trim(), precios: [precio(pieces[2])], presentacion: pieces[3]};
  const whole = importes(texto);
  if (whole) return {nombre: '', precios: whole};
  // Sólo un sufijo íntegro de importes; jamás el número más cercano.
  for (let i = 0; i < texto.length; i++) {
    if (i && /\s/.test(texto[i - 1]) && /[$\d]/.test(texto[i])) {
      const prices = importes(texto.slice(i));
      if (prices && /\p{L}/u.test(texto.slice(0, i))) return {nombre: texto.slice(0, i).trim().replace(/[:·.]+$/, '').trim(), precios: prices};
    }
  }
  return null;
}
function blocksOf(input) {
  const raw = Array.isArray(input) ? input : input?.bloques || input?.lineas;
  if (!Array.isArray(raw) || raw.length > 5000) throw Error('Se requieren hasta 5000 líneas o bloques por fotografía; no se recortó el resultado.');
  return raw.map((b, i) => {
    const text = typeof b === 'string' ? b : b?.texto ?? b?.text ?? '';
    if (String(text).length > 5000) throw Error('Una línea excede 5000 caracteres. Revisa el archivo OCR.');
    let box = b?.caja ?? b?.box ?? null;
    if (Array.isArray(box) && box.length === 4 && box.every(Number.isFinite) && box[2] > box[0] && box[3] > box[1]) box = [...box]; else box = null;
    const score = typeof b?.confianza === 'number' && Number.isFinite(b.confianza) ? b.confianza : null;
    return {id: i, texto: String(text).trim(), caja: box, confianza: score, pagina: Number.isInteger(b?.pagina) ? b.pagina : 0};
  });
}
function filasDe(bloques) {
  if (!bloques.filter(b => b.texto).every(b => b.caja)) return bloques.filter(b => b.texto).map(b => ({texto: b.texto, bloques: [b], pagina: b.pagina}));
  const rows = [];
  for (const b of [...bloques].filter(b => b.texto).sort((a, b) => a.pagina - b.pagina || a.caja[1] - b.caja[1] || a.caja[0] - b.caja[0])) {
    const h = b.caja[3] - b.caja[1], center = (b.caja[1] + b.caja[3]) / 2;
    let r = rows.find(r => r.pagina === b.pagina && Math.abs(r.center - center) <= Math.min(h, r.height) * .4);
    if (!r) { r = {pagina: b.pagina, center, height: h, bloques: []}; rows.push(r); }
    r.bloques.push(b);
  }
  return rows.map(r => {r.bloques.sort((a, b) => a.caja[0] - b.caja[0]); return {...r, texto: r.bloques.map(b => b.texto).join(' ')};});
}
function interpretarMenu(input, grupos = []) {
  const bloques = blocksOf(input), filas = filasDe(bloques), productos = [], categorias = [], incidencias = [];
  const roles = new Map(bloques.map(b => [b.id, new Set()]));
  const use = (r, rol) => r.bloques.forEach(b => roles.get(b.id).add(rol));
  let section = null, parent = null, headings = [], quantitySources = [], pending = [], preparations = [], sectionProducts = [], page = null, lastProductRow = -2;
  function flush() {
    for (const p of sectionProducts) if (preparations.length) {
      p.modificadores.push({nombre: 'Preparación', obligatorio: null, minimo: null, maximo: null,
        opciones: preparations.map(x => ({nombre: x.nombre, precio: x.precio, evidencia: x.ids})), origen: 'texto'});
      p.tipo = 'con_opciones';
      p.revision.push('Confirmar si la preparación es obligatoria, cuántas opciones admite y si tiene costo.');
      p.evidencia = [...new Set([...p.evidencia, ...preparations.flatMap(x => x.ids)])];
    }
    pending = []; preparations = []; sectionProducts = []; headings = []; quantitySources = [];
  }
  function add(nombre, prices, source, warnings = []) {
    let full = nombre.replace(/\s+/g, ' ').trim();
    if (!/\p{L}/u.test(full)) return;
    const key = canonical(section?.nombre);
    if (FAMILY.has(key) && !normalizar(full).startsWith(normalizar(section.nombre))) full = section.nombre + ' ' + full[0].toLocaleLowerCase('es') + full.slice(1);
    const match = grupoCoincidente(section?.nombre || '', grupos);
    const p = {id: 'p' + (productos.length + 1), nombre: full, precio: prices.length === 1 ? prices[0] : null,
      idgrupo: match.idgrupo, grupo_detectado: section?.nombre || '', categoria_padre: parent?.nombre || '',
      tipo: FAMILY.has(key) ? 'variante' : 'independiente', modificadores: [], ingredientes: [],
      evidencia: [...new Set([...source.flatMap(r => r.bloques.map(b => b.id)), ...(section?.ids || [])])],
      precios_detectados: prices, confianza: 'media', revisado: false, revision: [...warnings], requiere_revision: true};
    if (headings.length >= 2 && prices.length === headings.length) {
      p.precio = 0; p.tipo = 'con_opciones';
      p.modificadores.push({nombre: 'Cantidad', obligatorio: true, minimo: 1, maximo: 1, origen: 'Opción A solicitada',
        opciones: headings.map((nombre, i) => ({nombre, precio: prices[i], evidencia: [...quantitySources, ...source.flatMap(r => r.bloques.map(b => b.id))]}))});
      p.evidencia = [...new Set([...p.evidencia, ...quantitySources])];
      p.revision.push('Precio base 0; elegir una cantidad es obligatorio. Verificar cada columna.');
    } else if (prices.length !== 1 || headings.length >= 2) {
      p.precio = null; p.confianza = 'baja';
      p.revision.push('Los precios no corresponden inequívocamente a las presentaciones. Asignarlos manualmente.');
    } else if (headings.length === 1) {
      p.presentacion = headings[0]; p.evidencia = [...new Set([...p.evidencia, ...quantitySources])];
    }
    if (!match.idgrupo) p.revision.push(match.estado === 'ambiguo' ? 'Más de un grupo coincide; elegir uno.' : 'Asignar un grupo existente o preparar su creación.');
    if (full.length > 60) p.revision.push('El nombre supera los 60 caracteres admitidos por el guardado anterior; no se recortó.');
    if (section && !section.conocido) p.revision.push('Confirmar el encabezado detectado.');
    if (key === 'ramen / udon') p.revision.push('Revisar fideo, proteína y caldo: no se dedujeron opciones ni recargos.');
    if (p.evidencia.some(i => bloques[i].confianza !== null && bloques[i].confianza < .75)) {p.confianza = 'baja'; p.revision.push('Texto OCR con confianza baja.');}
    source.forEach(r => use(r, 'producto')); productos.push(p); sectionProducts.push(p);
  }
  for (let i = 0; i < filas.length; i++) {
    const row = filas[i], text = row.texto;
    if (page !== row.pagina) {flush(); section = null; parent = null; page = row.pagina;}
    const qty = presentaciones(text);
    if (qty.length) {headings.push(...qty); quantitySources.push(...row.bloques.map(b => b.id)); use(row, 'presentacion'); continue;}
    const prep = text.split(/\s*[/|]\s*|\s+o\s+/i);
    if (prep.length && prep.every(s => /^(hervidos?|fritos? en sart[eé]n|al vapor|fritos?)$/i.test(s.trim()))) {
      for (const nombre of prep) preparations.push({nombre: title(nombre.trim()), precio: null, ids: row.bloques.map(b => b.id)});
      use(row, 'preparacion'); continue;
    }
    const priced = separarPrecio(text);
    // Dos menús en columnas pueden compartir altura. No unir platos ni encabezados entre columnas.
    const independent = row.bloques.map(b => separarPrecio(b.texto));
    const headerParts = row.bloques.map(b => encabezado(b.texto)).filter(Boolean);
    if (headerParts.length > 1 || independent.filter(p => p?.nombre).length > 1) {
      incidencias.push({tipo: 'columnas_ambiguas', texto: text, evidencia: row.bloques.map(b => b.id), mensaje: 'Columnas independientes: revisar distribución en la foto.'});
      flush(); section = null; parent = null;
      if (independent.filter(p => p?.nombre).length > 1) independent.forEach((p, j) => {if (p?.nombre) add(p.nombre, p.precios, [{...row, bloques: [row.bloques[j]]}], ['Verificar la categoría de esta columna.']);});
      continue;
    }
    let head = !priced && encabezado(text);
    const next=filas[i+1];
    if(head&&!head.conocido&&next?.pagina===row.pagina&&separarPrecio(next.texto)?.nombre==='')head=null;
    if (head) {
      flush();
      if (GENERAL.has(canonical(head.nombre))) parent = null;
      else if (section && GENERAL.has(canonical(section.nombre))) parent = section;
      section = {...head, ids: row.bloques.map(b => b.id)};
      categorias.push({nombre: head.nombre, padre: parent?.nombre || '', conocido:head.conocido, evidencia: section.ids, ...grupoCoincidente(head.nombre, grupos)});
      use(row, head.conocido ? 'categoria' : 'categoria_por_revisar'); continue;
    }
    if (priced) {
      const before = productos.length;
      if (priced.nombre) {
        const names=pending.filter(r=>!ingles(r.texto)&&!otroAlfabeto(r.texto));
        if(ingles(priced.nombre)&&names.length===1){
          add(names[0].texto,priced.precios,[names[0],row],['Precio junto a la traducción: contrastar con el nombre en español.']);
          productos.at(-1).traduccion=priced.nombre;
        }else add(priced.nombre, priced.precios, [row]);
        pending = [];
      }
      else {
        const names=pending.filter(r=>!ingles(r.texto)&&!otroAlfabeto(r.texto));
        const candidates=names.length===1?names:pending.length===1?pending:[];
        if(candidates.length===1){
          const candidate=candidates[0];add(candidate.texto,priced.precios,[candidate,row],['Nombre y precios en renglones separados: verificar la foto.']);
          for(const translation of pending.filter(r=>r!==candidate)){
            use(translation,'posible_traduccion');productos.at(-1).evidencia.push(...translation.bloques.map(b=>b.id));
          }
          productos.at(-1).traduccion=pending.filter(r=>r!==candidate).map(r=>r.texto).join(' / ');
        }else incidencias.push({tipo:'precio_sin_producto',texto:text,evidencia:row.bloques.map(b=>b.id),mensaje:'Hay un precio sin producto claro. Revisa estas líneas; no se descartaron.'});
        pending=[];
      }
      if (productos.length > before) {
        lastProductRow = i;
        if (priced.presentacion) productos.at(-1).presentacion = priced.presentacion;
      }
      continue;
    }
    if (lastProductRow === i - 1 && (ingles(text)||otroAlfabeto(text))
        && !(filas[i+1] && separarPrecio(filas[i+1].texto)?.nombre === '')) {
      const p = productos.at(-1);p.traduccion = text;p.evidencia.push(...row.bloques.map(b=>b.id));
      p.revision.push('Confirmar la traducción posterior al precio.');use(row,'posible_traduccion');continue;
    }
    if (/^ingredientes\s*:/i.test(text) && sectionProducts.length) {
      const p = sectionProducts.at(-1); p.ingredientes.push(text.replace(/^ingredientes\s*:\s*/i, ''));
      p.evidencia.push(...row.bloques.map(b => b.id)); use(row, 'ingredientes'); continue;
    }
    pending.push(row);
  }
  flush();
  // Un rótulo sin productos antes de otra categoría puede ser el nombre del
  // restaurante. Se conserva como evidencia, pero no se propone crear un grupo.
  for(let i=categorias.length-1;i>=0;i--){
    const c=categorias[i];
    if(!c.conocido&&!productos.some(p=>canonical(p.grupo_detectado)===canonical(c.nombre)||canonical(p.categoria_padre)===canonical(c.nombre))){
      for(const id of c.evidencia){roles.get(id).delete('categoria_por_revisar');roles.get(id).add('encabezado_menu');}
      categorias.splice(i,1);
    }
  }
  const seen = new Map();
  for (const p of productos) {
    const n = normalizar(p.nombre);
    if (seen.has(n)) {p.duplicado_de = seen.get(n); p.revision.push('Nombre repetido: comparar presentaciones y precios. No se eliminó.');}
    else seen.set(n, p.id);
  }
  const trazabilidad = bloques.map(b => ({...b, uso: [...roles.get(b.id)]}));
  const pendientes = trazabilidad.filter(b => b.texto && !b.uso.length);
  return {version: 1, productos, categorias, bloques: trazabilidad, pendientes, incidencias,
    resumen: {lineas: bloques.filter(b => b.texto).length, propuestas: productos.length, sinAsignar: pendientes.length,preciosSinProducto:incidencias.filter(i=>i.tipo==='precio_sin_producto').length},
    advertencia: 'Propuestas para revisión. El análisis no crea ni modifica registros SQL.'};
}
module.exports = {interpretarMenu, normalizar, canonical, grupoCoincidente, precio, filasDe, equivalenciasGrupos: Object.fromEntries(canonic)};
