'use strict';
const { _electron } = require('playwright');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
(async () => {
 const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mgv-desktop-'));
 const packaged = process.argv.includes('--packaged');
 const target = path.resolve(packaged ? 'dist/win-unpacked/resources/app.asar' : '.');
 let application;
 try {
  application = await _electron.launch({
   executablePath: require('electron'),
   args: [...(process.platform === 'linux' ? ['--no-sandbox','--ozone-platform=headless'] : []), '--user-data-dir='+path.join(dir,'profile'), target],
   env: { ...process.env, METALES_DATA_DIR:path.join(dir,'data'), XDG_CONFIG_HOME:path.join(dir,'config') }, timeout:30000
  });
  const page = await application.firstWindow();
  await page.getByLabel('Nombre del negocio').fill('Prueba temporal escritorio');
  await page.getByLabel('Usuario',{exact:true}).fill('Prueba');
  await page.getByLabel('Contraseña',{exact:true}).fill('Clave-Prueba-Temporal-123');
  await page.getByRole('button',{name:'Crear mi negocio'}).click();
  await page.getByRole('heading',{name:'Resumen',exact:true}).waitFor();
  const bridge = await page.evaluate(() => ({ isElectron:window.pc.isElectron, node:typeof window.require }));
  assert.deepEqual(bridge,{isElectron:true,node:'undefined'});
  assert.ok(Array.isArray(await page.evaluate(() => window.pc.listPrinters())));
  const security = await application.evaluate(({BrowserWindow}) => { const p=BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(); return {sandbox:p.sandbox,nodeIntegration:p.nodeIntegration,contextIsolation:p.contextIsolation}; });
  assert.deepEqual(security,{sandbox:true,nodeIntegration:false,contextIsolation:true});
  const result = await page.evaluate(async()=>{
   const {nonce}=await(await fetch('/api/session')).json();
   const r=await fetch('/api/materials',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':nonce},body:JSON.stringify({name:'Fierro',category:'Metal',buyPrice:'3',salePrice:'5',initialKg:'1.125',minKg:'0'})});
   if(!r.ok)throw Error('Fallo de escritura SQLite en Electron');return r.json();
  });
  assert.equal(result.stock_g,1125);
  await page.locator('#headingActions [data-action="refresh"]').click();
  await page.getByText('1.125 kg',{exact:true}).waitFor();
  await page.locator('#navigation [data-go="compras"]').click();
  await page.locator('.material').first().click();
  await page.getByLabel('Peso bruto (kg)').fill('1');
  await page.getByRole('button',{name:'+ Agregar al ticket'}).click();
  await application.evaluate(({app,dialog})=>{global.mgvTestPrompt=0;dialog.showMessageBoxSync=()=>{global.mgvTestPrompt++;return 0;};app.quit();});
  let prompted=false;
  for(let i=0;i<40;i++) { if(await application.evaluate(()=>global.mgvTestPrompt>0)){prompted=true;break;}await new Promise(resolve=>setTimeout(resolve,50)); }
  assert.ok(prompted,'Falta confirmación al salir con un ticket pendiente');
  assert.equal(await page.evaluate(async()=>(await fetch('/api/health')).ok),true,'Cancelar la salida debe conservar el servicio');
  await page.evaluate(()=>{window.confirm=()=>true;});
  await page.getByRole('button',{name:'Vaciar ticket'}).click();
  const closed = new Promise(resolve=>application.process().once('exit',(code,signal)=>resolve({code,signal})));
  application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close()).catch(()=>{});
  let exitTimer;
  const exit = await Promise.race([closed,new Promise((resolve,reject)=>{exitTimer=setTimeout(()=>reject(Error('La ventana no cerró limpiamente.')),5000);})]).finally(()=>clearTimeout(exitTimer));
  assert.equal(exit.signal,null);assert.equal(exit.code,0);application=null;
  const bytes=fs.readFileSync(path.join(dir,'data','metales-gv.sqlite'));assert.equal(bytes.subarray(0,15).toString(),'SQLite format 3');
  assert.ok(!fs.existsSync(path.join(dir,'data','.lock')));
  console.log(`Electron ${packaged?'empaquetado':'fuente'}: interfaz, sesión, SQLite, IPC, aislamiento y cierre con ticket pendiente verificados.`);
 } finally {
  if(application) {
   try { await application.evaluate(({dialog})=>{dialog.showMessageBoxSync=()=>1;});
    let timeout;
    await Promise.race([application.close(),new Promise((resolve,reject)=>{timeout=setTimeout(()=>{application.process().kill('SIGKILL');reject(Error('Se terminó la sesión temporal de prueba.'));},5000);})]).finally(()=>clearTimeout(timeout));
   } catch { application.process()?.kill('SIGKILL'); }
  }
  fs.rmSync(dir,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
