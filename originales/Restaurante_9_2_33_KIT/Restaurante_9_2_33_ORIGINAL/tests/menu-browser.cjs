'use strict';
// Prueba de navegador contra Express real, sin una base SQL ni PaddleOCR.
// El último caso aísla el envío del formulario con respuestas HTTP de prueba.
// Ningún caso simula un guardado SQL. El texto se introduce por la pantalla real.
const fs=require('fs'),path=require('path'),os=require('os'),net=require('net'),assert=require('assert/strict'),{spawn}=require('child_process');
const {chromium}=require(process.env.RESTAURANTE_PLAYWRIGHT||'playwright');
const root=path.join(__dirname,'..'),out=process.env.RESTAURANTE_QA_DIR||path.join(os.tmpdir(),'restaurante-qa-output');
async function main(){
 fs.mkdirSync(out,{recursive:true});
 const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const config=fs.mkdtempSync(path.join(os.tmpdir(),'menu-browser-'));
 const server=spawn(process.execPath,['app.js'],{cwd:root,env:{...process.env,PORT:String(port),RESTAURANTE_CONFIG_DIR:config}});
 let logs='';server.stderr.on('data',b=>{logs+=b.toString();});
 await new Promise((resolve,reject)=>{server.stdout.on('data',b=>{if(b.toString().includes('http://'))resolve();});server.once('error',reject);server.once('exit',c=>reject(Error('El servidor terminó: '+c+' '+logs)));});
 let browser;
 try{
  const args=process.env.RESTAURANTE_CHROMIUM_HELPER?require(process.env.RESTAURANTE_CHROMIUM_HELPER).args:['--no-sandbox','--disable-dev-shm-usage'];
  browser=await chromium.launchPersistentContext(path.join(config,'browser'),{executablePath:process.env.RESTAURANTE_CHROMIUM,headless:true,viewport:{width:1366,height:900},acceptDownloads:true,args});
  const context=browser;const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+port+'/menu-ia');await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('SQL sigue sin verificar'));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'desbordamiento a 1366');
  await page.screenshot({path:path.join(out,'menu-captura-escritorio.png'),fullPage:true});
  await page.locator('summary').filter({hasText:'Continuar desde texto OCR'}).click();
  await page.locator('#ocrText').fill('DUMPLINGS\n6 piezas\n10 piezas\nCerdo con napa $128 / $198\nCerdo con cebollino $128 / $198\nCerdo hongo camarón huevo $128 / $198\nRes apio $148 / $218\nHervidos / Fritos en sartén\nARROZ FRITO\nChashu $239\nCamarón $239\nCarne $239\nPollo $219\nVegetales $219\nBEBIDAS\nAgua $30');
  await page.locator('#interpret').click();await page.waitForFunction(()=>document.getElementById('sProducts').textContent==='10');
  assert.equal(await page.locator('.product').count(),10);
  assert.match(await page.locator('.product').first().innerText(),/Dumplings cerdo con napa/);
  assert.match(await page.locator('.product').first().innerText(),/6 piezas:.*128/);
  await page.locator('[data-tab="grupos"]').click();await page.locator('#prepareGroups').click();assert.equal(await page.locator('#draftGroups .group').count(),3);
  await page.locator('#newGroup').fill('dumplings');await page.locator('#groupForm button').click();assert.equal(await page.locator('#draftGroups .group').count(),3);
  await page.locator('[data-tab="revision"]').click();await page.locator('[data-edit]').first().click();
  assert.equal(await page.locator('#editName').inputValue(),'Dumplings cerdo con napa');assert.equal(await page.locator('#editPrice').inputValue(),'0');
  assert.equal(await page.locator('#editPresentation').count(),0);await page.locator('#editKey').fill('PL001');await page.locator('.advanced-editor summary').click();
  assert.equal(await page.locator('[data-mod="0"][data-field="maximo"]').inputValue(),'1');
  assert.equal(await page.locator('[data-mod="0"][data-option="0"][data-field="precio"]').inputValue(),'128');
  await page.locator('[data-mod="1"][data-field="obligatorio"]').selectOption('si');
  await page.locator('[data-mod="1"][data-field="minimo"]').fill('1');await page.locator('[data-mod="1"][data-field="maximo"]').fill('1');
  await page.locator('[data-mod="1"][data-option="0"][data-field="precio"]').fill('0');await page.locator('[data-mod="1"][data-option="1"][data-field="precio"]').fill('0');
  await page.locator('#editForm button[type=submit]').click();
  assert.equal(await page.locator('#sProducts').innerText(),'10');
  await page.locator('[data-edit]').nth(1).click();await page.locator('#editKey').fill('PL001');await page.locator('#editForm button[type=submit]').click();
  assert.equal(await page.getByText('Clave repetida en este proyecto',{exact:true}).count(),2);
  await page.locator('[data-edit]').nth(1).click();await page.locator('#editKey').fill('PL002');await page.locator('#editForm button[type=submit]').click();
  assert.equal(await page.getByText('Clave repetida en este proyecto',{exact:true}).count(),0);
  await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:path.join(out,'menu-revision-escritorio.png'),fullPage:true});
  const downloading=page.waitForEvent('download');await page.locator('#backup').click();const dl=await downloading;const file=path.join(out,'qa-menu-project.json');await dl.saveAs(file);
  const saved=JSON.parse(fs.readFileSync(file));assert.equal(saved.productos.length,10);assert.equal(saved.productos[0].modificadores[1].opciones[0].precio,0);assert.equal(saved.productos[0].presentacion,undefined);assert.ok(saved.productos.every(p=>p.clave));
  await page.reload();await page.waitForFunction(()=>document.getElementById('sProducts').textContent==='10');assert.ok(Number(await page.locator('#sReviewed').innerText())>=1);
  await page.evaluate(()=>localStorage.clear());await page.reload();await page.waitForFunction(()=>document.getElementById('sProducts').textContent==='0');
  await page.locator('#projectFile').setInputFiles(file);await page.waitForFunction(()=>document.getElementById('sProducts').textContent==='10');
  await page.locator('#reviewImport').click();await page.waitForFunction(()=>document.getElementById('summaryBody').textContent.includes('Conexión SQL sin verificar'));assert.match(await page.locator('#summaryBody').innerText(),/no se guardarán sin las opciones/);assert.equal(await page.locator('#previewImport').isDisabled(),true);await page.locator('[data-close="summary"]').click();
  await page.locator('[data-tab="grupos"]').click();await page.locator('#createGroups').click();await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('operación SQL'));assert.equal(await page.locator('#draftGroups .group').count(),3);assert.equal(await page.locator('#sqlConfirmation').evaluate(el=>el.open),false);
  await page.locator('#checkCompatibility').click();await page.waitForFunction(()=>document.getElementById('compatibilityState').textContent.includes('operación SQL'));assert.equal(await page.locator('#draftGroups .group').count(),3);
  for(const width of [1024,768,390,320]){
   await page.setViewportSize({width,height:900});await page.locator('[data-tab="revision"]').click();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'desbordamiento a '+width);
   await page.locator('[data-edit]').first().click();assert.ok(await page.evaluate(()=>document.getElementById('editor').scrollWidth<=document.getElementById('editor').clientWidth+1),'editor a '+width);await page.locator('[data-close="editor"]').first().click();
   if(width===390){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(out,'menu-revision-movil.png'),fullPage:true});}
  }
  await page.locator('#search').fill('res apio');assert.equal(await page.locator('.product').count(),1);
  await page.locator('#search').fill('');await page.locator('.bulk-tools summary').click();await page.locator('#selectVisible').click();assert.equal(await page.locator('#selectionCount').innerText(),'10 seleccionados');
  await page.setViewportSize({width:1366,height:900});
  await page.locator('#manualProduct').click();await page.locator('[data-close="editor"]').first().click();assert.equal(await page.locator('#sProducts').innerText(),'10');
  await page.locator('[data-edit]').first().click();assert.equal(await page.locator('#editReviewed').count(),1);
  await page.locator('#editPrice').fill('1');assert.equal(await page.locator('#editReviewed').isChecked(),false);
  await page.locator('[data-close="editor"]').first().click();assert.ok(Number(await page.locator('#sReviewed').innerText())>=1);
  const bad=structuredClone(saved);bad.fotografias[0].resultado.categorias=[null];
  await page.locator('#projectFile').setInputFiles({name:'incompleto.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bad))});
  await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('categoría del archivo'));
  assert.equal(await page.locator('#sProducts').innerText(),'10');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('restaurante-menu-proyecto-v1')).productos.length),10);
  const damaged=JSON.stringify(bad);await page.evaluate(raw=>localStorage.setItem('restaurante-menu-proyecto-v1',raw),damaged);
  await page.reload();await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('SQL sigue sin verificar'));
  assert.equal(await page.locator('#sProducts').innerText(),'0');assert.equal(await page.evaluate(()=>localStorage.getItem('restaurante-menu-proyecto-v1')),damaged);
  await page.locator('summary').filter({hasText:'Continuar desde texto OCR'}).click();await page.locator('#ocrText').fill('BEBIDAS\nAgua $30');await page.locator('#interpret').click();
  await page.waitForFunction(()=>document.getElementById('sProducts').textContent==='1');
  assert.equal(await page.evaluate(raw=>Object.keys(localStorage).some(k=>k.startsWith('restaurante-menu-proyecto-v1-recuperacion-')&&localStorage.getItem(k)===raw),damaged),true);
  const emptyCheck=await page.evaluate(()=>{
    const photo={id:'empty-test',nombre:'vacía.jpg',estado:'pendiente'};
    let error='';try{consume({productos:[],bloques:[],ocr_lineas:[]},photo);}catch(e){error=e.message;}
    const restored=validateProject({version:1,productos:[],gruposPreparados:[],fotografias:[{...photo,estado:'lista',resultado:{productos:[],bloques:[],ocr_lineas:[],categorias:[],pendientes:[],incidencias:[]}}]});
    return {error,estado:photo.estado,restaurada:restored.fotografias[0].estado};
  });
  assert.match(emptyCheck.error,/No se recibió texto OCR/);assert.equal(emptyCheck.estado,'pendiente');assert.equal(emptyCheck.restaurada,'error');
  assert.equal(await page.locator('#sProducts').innerText(),'1');
  console.log('Regresión OCR vacío: consumo rechazado, estado conservado y proyecto antiguo marcado para revisión.');
  await page.locator('[data-tab="grupos"]').click();await page.locator('#newGroup').fill('Rótulo erróneo');await page.locator('#groupForm button').click();
  await page.locator('[data-remove-draft]').click();assert.equal(await page.locator('#sProducts').innerText(),'1');assert.equal(await page.locator('#draftGroups .group').count(),0);
  await page.locator('[data-category-name="Bebidas"]').fill('Refrescos');await page.locator('[data-rename-category="Bebidas"]').click();
  assert.equal(await page.locator('[data-category-name="Refrescos"]').count(),1);await page.locator('[data-remove-category="Refrescos"]').click();
  assert.equal(await page.locator('#categoryList .group').count(),0);assert.equal(await page.locator('#sProducts').innerText(),'1');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('restaurante-menu-proyecto-v1')).productos[0].idgrupo),'');
  await page.reload();await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('SQL sigue sin verificar'));
  await page.locator('[data-tab="grupos"]').click();assert.equal(await page.locator('#categoryList .group').count(),0);
  await page.locator('[data-tab="fotos"]').click();await page.locator('summary').filter({hasText:'Continuar desde texto OCR'}).click();
  await page.locator('#ocrText').fill('ENTRADAS\nCerdo con napa\nRes apio\n$128');await page.locator('#interpret').click();
  await page.waitForFunction(()=>!document.getElementById('reviewNotice').hidden);assert.match(await page.locator('#reviewNotice').innerText(),/1 precios/);
  await page.locator('#evidencePanel summary').first().click();await page.locator('#evidence details').last().locator('summary').click();
  await page.locator('[data-from-evidence]').nth(1).click();assert.equal(await page.locator('#editName').inputValue(),'Res apio');
  await page.locator('#editPrice').fill('128');await page.locator('#editForm button[type=submit]').click();
  assert.equal(await page.locator('#sProducts').innerText(),'2');assert.equal(await page.locator('[data-from-evidence]').count(),2);
  console.log('Categorías: quitar, renombrar y recargar conservan productos; recuperación manual desde evidencia sin SQL.');
  await page.locator('[data-tab="grupos"]').click();
  for(const width of [768,320]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'categorías a '+width);}
  await page.setViewportSize({width:1366,height:900});
  // Prueba de envío UI AISLADA. Las respuestas de prueba nunca se incluyen en la app.
  // El servidor rechaza explícitamente la vista previa; no se simula un INSERT.
  let previewBody=null;
  await page.route('**/api/menu-admin/compatibilidad',route=>route.fulfill({json:{correcto:true,baseDatos:'DOBLE_UI_SIN_SQL',grupos:{lista:true,requiereModelo:false},productos:{lista:true},modificadores:{lista:false,motivos:['Sin contrato']},empresa:{estado:'unica',idempresa:'E'},unidades:[{idunidad:'PIEZA'}],modosPrecio:[2],referenciaAutomatica:{idproducto:'REF',idgrupo:'01',idempresa:'E',idunidad:'PIEZA',descripcion:'Referencia unitaria',impuesto1:16,excentoimpuestos:0},referencias:[{idproducto:'REF',idgrupo:'01',idempresa:'E',idunidad:'PIEZA',descripcion:'Referencia unitaria',impuesto1:16,excentoimpuestos:0}]}}));
  await page.route('**/api/menu-admin/menu/revisar',route=>{previewBody=route.request().postDataJSON();return route.fulfill({status:409,json:{correcto:false,error:'Fin de prueba UI: no se ejecutó SQL.'}});});
  await page.locator('[data-tab="revision"]').click();await page.locator('#discardAll').click();await page.locator('#search').fill('Res apio');await page.locator('[data-toggle]').click();await page.locator('.bulk-tools summary').click();await page.locator('#selectVisible').click();
  await page.locator('#reviewImport').click();await page.waitForSelector('#confirmExempt');
  // Asignar categoría de esta propuesta manual antes de revisar el lote.
  await page.locator('[data-close="summary"]').click();await page.locator('[data-tab="grupos"]').click();await page.locator('#newGroup').fill('Entradas');await page.locator('#groupForm button').click();
  await page.locator('[data-tab="revision"]').click();
  const draftValue=await page.locator('#bulkGroup option').filter({hasText:'Entradas'}).getAttribute('value');await page.locator('#bulkGroup').selectOption(draftValue);await page.locator('#applyGroup').click();
  await page.locator('#reviewImport').click();await page.waitForSelector('#confirmExempt');assert.equal(await page.locator('#importReference').count(),0);
  assert.equal(await page.locator('#previewImport').isDisabled(),true);await page.locator('#confirmExempt').check();assert.equal(await page.locator('#previewImport').isDisabled(),false);
  await page.locator('#previewImport').click();await page.waitForFunction(()=>document.querySelector('.preview-error')?.textContent.includes('Fin de prueba UI'));
  assert.equal(previewBody.productos.length,1);assert.equal(previewBody.productos[0].revisado,true);assert.match(previewBody.productos[0].clave,/^[0-9]{6}$/);assert.equal(previewBody.configuracionConfirmada,true);assert.ok(previewBody.productos[0].idgrupo.startsWith('borrador:'));assert.equal(previewBody.modelo,'01');
  assert.equal(await page.locator('#sProducts').innerText(),'2');assert.equal(await page.locator('#sqlConfirmation').evaluate(el=>el.open),false);
  console.log('Envío UI de lote unificado: revisión explícita, grupo preparado y clave automática; rechazo visible sin escritura.');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({correcto:true,casos:['captura sin SQL','interpretación real por HTTP','grupos preparados sin duplicar','modificadores editables','cantidades integradas en nombre','claves repetidas en el proyecto','decisión incluir/descartar por producto','exportación JSON','recuperación local','restauración de archivo','importación de modificadores bloqueada','creación de grupos sin SQL informa fallo y conserva borrador','compatibilidad integrada sin descargas','5 tamaños de pantalla','búsqueda y selección','cancelar producto sin crear vacíos','edición exige nueva revisión','archivo incompleto conserva proyecto actual','borrador dañado conservado antes de guardar nuevo'],erroresNavegador:errors}));
 }finally{if(browser)await browser.close();server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));fs.rmSync(config,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
