 'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {legacyDataDir,listenLocal,formatStartupError}=require('../desktop/runtime');
const root=path.join(__dirname,'..');
test('Windows conserva los datos previos de SQLite en LOCALAPPDATA\\ParkingPOS',()=>{
 assert.equal(legacyDataDir({LOCALAPPDATA:'C:\\Users\\Cliente\\AppData\\Local'},'/else'),path.join('C:\\Users\\Cliente\\AppData\\Local','ParkingPOS'));
 assert.equal(legacyDataDir({},'/temp'),path.join('/temp','ParkingPOS'));
});
test('El servidor de escritorio usa solo loopback y un puerto disponible',async()=>{
 assert.throws(()=>listenLocal({listen(){}},'0.0.0.0'),/127\.0\.0\.1/);
 const http=require('node:http');
 const server=await listenLocal({listen:(port,host)=>http.createServer((req,res)=>res.end('OK')).listen(port,host)},'127.0.0.1',0);
 assert.equal(server.address().address,'127.0.0.1');
 assert.ok(server.address().port>0);
 await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
});
test('La ruta RAW se selecciona fuera del ASAR en el instalador',()=>{
 const files=['desktop/main.js','lib/print-spooler.js'];
 assert.match(fs.readFileSync(path.join(root,files[0]),'utf8'),/PARKING_PRINT_SCRIPT/);
 assert.match(fs.readFileSync(path.join(root,files[1]),'utf8'),/PARKING_PRINT_SCRIPT/);
 const p=require('../package.json');
 assert.equal(p.main,'desktop/main.js');
 assert.equal(p.build.nsis.deleteAppDataOnUninstall,false);
 assert.ok(p.build.extraResources.some(x=>x.from==='print-raw.ps1'));
 assert.ok(p.build.extraResources.some(x=>x.from==='print-worker.ps1'));
 assert.match(fs.readFileSync(path.join(root,'desktop/main.js'),'utf8'),/127\.0\.0\.1/);
});
test('Impresión automática y escaneo apuntan al mismo folio y conservan idempotencia',()=>{
 const operations=fs.readFileSync(path.join(root,'lib/operations.js'),'utf8');
 const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
 assert.match(operations,/await printEntry\(cfg,result\.code,result\.entry_at\)/);
 assert.match(operations,/app\.get\('\/api\/ticket\/:code'/);
 assert.match(operations,/app\.post\('\/api\/ticket\/:code\/pay'/);
 assert.match(operations,/idempotency-key/);
 assert.match(html,/onkeydown="if\(event\.key==='Enter'\)lookup\(\)"/);
});
test('La aplicación aísla Node del navegador y limita navegación',()=>{
 const source=fs.readFileSync(path.join(root,'desktop/main.js'),'utf8');
 for(const fragment of ['nodeIntegration:false','contextIsolation:true','sandbox:true','webSecurity:true','setWindowOpenHandler','will-navigate','requestSingleInstanceLock'])assert.ok(source.includes(fragment),fragment);
});
test('La página contiene selector de impresoras y conserva los controles existentes',()=>{
 const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
 for(const fragment of ['id="entryBtn"','id="printerName"','id="installedPrinters"','id="code"','desktop-ui.js'])assert.ok(html.includes(fragment),fragment);
 const ui=fs.readFileSync(path.join(root,'public/desktop-ui.js'),'utf8');
 assert.match(ui,/parkingDesktop\.listPrinters/);
});
test('Error de arranque es claro y no promete recuperación inexistente',()=>{
 assert.match(formatStartupError(Error('Archivo bloqueado')),/Archivo bloqueado/);
});

test('El escáner en pantalla principal reconoce CODE128 hexadecimal y llama a lookup',()=>{
 const vm=require('node:vm'),events={};let ms=1000,found=0,nav=0;
 const code={value:''},other={style:{display:'none'}};
 const context={
  window:{parkingDesktop:{isDesktop:true}},
  performance:{now:()=>ms},
  document:{activeElement:null,
   addEventListener:(name,fn)=>{events[name]=fn;},
   getElementById:id=>id==='code'?code:other,
   querySelector:()=>({})},
  page:()=>{nav++;},lookup:()=>{found++;},
  Option:class {}
 };
 vm.runInNewContext(fs.readFileSync(path.join(root,'public/desktop-ui.js'),'utf8'),context);
 assert.equal(typeof events.keydown,'function');
 for(const ch of 'AABBCCDDEEFF11'){ms+=18;events.keydown({key:ch,preventDefault(){}});}
 ms+=18;events.keydown({key:'Enter',preventDefault(){}});
 assert.equal(code.value,'AABBCCDDEEFF11');assert.equal(found,1);assert.equal(nav,1);
});
