'use strict';
const {spawn} = require('child_process');
const path = require('path'), fs = require('fs');
const PREFIX = 'RESTAURANTE_OCR:';
const base = process.pkg ? path.dirname(process.execPath) : __dirname;
function comando(extra = []) {
  const local = path.join(base, 'ocr-env', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const exe = process.env.RESTAURANTE_PYTHON || (fs.existsSync(local) ? local : process.platform === 'win32' ? 'py' : 'python3.11');
  return {exe, args: [...(exe === 'py' ? ['-3.11'] : []), path.join(base, 'ocr_local.py'), ...extra]};
}
function crearOCR({spawnFn = spawn, command = comando, timeout = 240000} = {}) {
  let worker = null, current = null, buffer = '', errorTail = '', chain = Promise.resolve(), pending = 0, closed = false;
  function end(error) {
    const w = worker; worker = null; buffer = '';
    if (current) {clearTimeout(current.timer); current.reject(error); current = null;}
    w?.kill();
  }
  function start() {
    if (worker) return;
    const {exe, args} = command();
    const child = spawnFn(exe, args, {windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: {...process.env, PYTHONIOENCODING:'utf-8'}});
    worker = child; errorTail = '';
    child.on('error', e => {if (worker === child) end(Error('No se pudo iniciar el OCR local: ' + e.message));});
    child.on('close', () => {if (worker === child) end(Error('El OCR se cerró. Revisa Python 3.11 y el diagnóstico. ' + errorTail.slice(-350)));});
    child.stdin.on('error', e => {if (worker === child) end(e);});
    child.stderr.on('data', b => {errorTail = (errorTail + b.toString()).slice(-2000);});
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      if (worker !== child) return;
      buffer += chunk;
      if (buffer.length > 8000000) return end(Error('La respuesta OCR supera 8 MB. Divide la fotografía.'));
      let at;
      while ((at = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, at); buffer = buffer.slice(at + 1);
        if (!line.startsWith(PREFIX) || !current) continue;
        try {
          const data = JSON.parse(line.slice(PREFIX.length));
          if (!data || (!data.error && !Array.isArray(data.bloques) && !Array.isArray(data.lineas))) throw Error('Faltan los bloques OCR.');
          if (!data.error && ![...(data.bloques || []).map(b=>b?.texto), ...(data.lineas || [])].some(t=>typeof t==='string'&&t.trim()))
            data.error='No se reconoció texto en la fotografía (0 líneas). La foto necesita revisión; no se considera analizada.';
          const item = current; current = null; clearTimeout(item.timer);
          if (data.error) item.reject(Error(data.error)); else item.resolve(data);
        } catch (e) {end(Error('Respuesta OCR inválida: ' + e.message));}
      }
    });
  }
  function extraer(imagen) {
    if (closed) return Promise.reject(Error('OCR detenido.'));
    if (pending >= 20) return Promise.reject(Error('Hay 20 fotografías en espera. Espera a que termine el análisis.'));
    pending++;
    const job = chain.then(() => new Promise((resolve, reject) => {
      if (closed) return reject(Error('OCR detenido.'));
      start(); current = {resolve, reject, timer: setTimeout(() => end(Error('OCR excedió el tiempo de espera; la foto sigue pendiente de revisión.')), timeout)};
      worker.stdin.write(JSON.stringify({imagen}) + '\n');
    }));
    chain = job.catch(() => {}).finally(() => {pending--;});
    return job;
  }
  return {extraer, cerrar: () => {closed = true; end(Error('OCR detenido.'));}};
}
module.exports = {crearOCR, comando};
