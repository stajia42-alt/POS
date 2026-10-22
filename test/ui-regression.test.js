'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

// Exercise the actual browser functions with a small DOM adapter. No server,
// printer, Chromium installation or business database is required here.
function screen({cashier=false}={}){
 const nodes=new Map();
 const element=()=>({value:'',innerHTML:'',textContent:'',style:{},disabled:false,dataset:{},classList:{add(){},remove(){},toggle(){}},focus(){},select(){},append(){},appendChild(){},replaceChildren(){},querySelector(){return null},querySelectorAll(){return []},addEventListener(){}});
 const get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id)};
 const document={getElementById:get,querySelector:()=>element(),querySelectorAll:()=>[],createElement:element,body:element(),addEventListener(){}};
 const context=vm.createContext({document,setInterval(){},console,TextEncoder,URL,confirm:()=>true,sessionStorage:{getItem(){return null},setItem(){},removeItem(){},clear(){}},crypto:require('node:crypto').webcrypto});
 const root=path.join(__dirname,'..');
 const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
 for(const [,source] of html.matchAll(/<script>([\s\S]*?)<\/script>/g))vm.runInContext(source,context);
 // Startup mounting and login are covered by test:ui. This harness loads all
 // declarations before that startup call and invokes the real event handlers.
 const professional=fs.readFileSync(path.join(root,'public/professional.js'),'utf8');
 vm.runInContext(professional.slice(0,professional.indexOf('\nmountProfessional();')),context);
 if(cashier){
  vm.runInContext('let denominationDraft=null;',context);
  vm.runInContext(fs.readFileSync(path.join(root,'public/cashier-ui.js'),'utf8'),context);
 }
 return {context,get,run:source=>vm.runInContext(source,context)};
}

test('La caja muestra ventas del turno aunque cambie el día y queda en cero al cerrar',async()=>{
 const ui=screen();let summary={capacity:30,active:2,paidToday:{n:18,cents:90000},paidShift:{n:3,cents:12500},shift_id:7,shift_type:'NIGHT'};
 ui.context.fakeApi=async route=>route==='/api/summary'?summary:[];
 ui.run('api=fakeApi');await ui.run('refresh()');
 assert.match(ui.get('revenue').textContent,/125[.,]00/);assert.equal(ui.get('paid').textContent,3);assert.match(ui.get('revenueShiftDetail').textContent,/Noche #7/);
 summary={...summary,paidToday:{n:0,cents:0}};await ui.run('refresh()');assert.match(ui.get('revenue').textContent,/125[.,]00/);
 summary={...summary,paidShift:{n:0,cents:0},shift_id:null,shift_type:null};await ui.run('refresh()');assert.equal(ui.get('paid').textContent,0);assert.match(ui.get('revenueShiftDetail').textContent,/Caja cerrada/);
});

test('Doble clic en cobrar envía un pago y muestra el fallo de impresora sin cobrar otra vez',async()=>{
 const ui=screen(),requests=[];ui.get('received').value='50.00';
 ui.context.fakeApi=async(route,opt)=>{requests.push({route,body:JSON.parse(opt.body)});await Promise.resolve();return {code:'001',charged_cents:2500,method:'efectivo',received_cents:5000,change_cents:2500,shift_id:1,receipt_printed:false,receipt_warning:'Pago guardado; impresora sin papel.'}};
 ui.run("api=fakeApi;refresh=async()=>{};current={code:'001',estimated_cents:2500,revision:1};");
 await ui.run('Promise.all([pay(),pay()])');
 assert.equal(requests.length,1);assert.equal(requests[0].route,'/api/ticket/001/pay');assert.equal(requests[0].body.expected_cents,2500);
 assert.match(ui.get('charge').innerHTML,/COBRO Y SALIDA CONFIRMADOS/);assert.match(ui.get('charge').innerHTML,/Pago guardado; impresora sin papel/);assert.match(ui.get('charge').innerHTML,/Reintentar impresión del pago/);
});

test('Reimprimir requiere motivo y autorización del dueño sin cambiar la sesión del cajero',async()=>{
 const ui=screen(),requests=[];
 ui.context.fakeApi=async(route,opt)=>{requests.push({route,body:JSON.parse(opt.body)});await Promise.resolve();return {ok:true,printed:true}};
 ui.run("api=fakeApi;user={id:9,role:'cashier',username:'caja'};reprint('007');");
 ui.get('reprintReason').value='Papel atorado';await ui.run('confirmEntryReprint()');assert.equal(requests.length,0);assert.match(ui.get('modalError').textContent,/administrador/);
 ui.get('reprintAuthorizationUsername').value='dueño';ui.get('reprintAuthorizationPassword').value='4321';
 await ui.run('Promise.all([confirmEntryReprint(),confirmEntryReprint()])');assert.equal(requests.length,1);assert.equal(requests[0].route,'/api/ticket/007/reprint');assert.equal(requests[0].body.authorization_username,'dueño');assert.equal(requests[0].body.authorization_password,'4321');assert.equal(ui.run('user.role'),'cashier');assert.match(ui.get('notice').textContent,/No se creó otra entrada ni venta/);
});

test('Boleto perdido se marca una sola vez y el reintento imprime sin cobrar',async()=>{
 const ui=screen(),requests=[];
 ui.context.fakeApi=async(route,opt)=>{requests.push(route);await Promise.resolve();return route.endsWith('/lost')?{code:'003',lost_at:'2026-10-22T08:00:00Z',receipt_printed:false,receipt_warning:'Constancia pendiente; registro guardado.'}:{printed:true}};
 ui.run("api=fakeApi;renderCharge=()=>{};current={code:'003'};");ui.get('lostReason').value='Identidad y vehículo verificados';
 await ui.run('Promise.all([saveLost(),saveLost()])');assert.deepEqual(requests,['/api/ticket/003/lost']);assert.match(ui.get('notice').textContent,/registro guardado/);
 await ui.run("Promise.all([printLost('003'),printLost('003')])");assert.deepEqual(requests,['/api/ticket/003/lost','/api/ticket/003/lost/print']);assert.match(ui.get('notice').textContent,/No se registró otro cobro/);
});

test('Apertura registra fondos MXN y USD y tipo de cambio decimal sin duplicar turno',async()=>{
 const ui=screen({cashier:true}),requests=[];
 ui.context.fakeApi=async(route,opt)=>{requests.push({route,body:JSON.parse(opt.body)});await Promise.resolve();return {ok:true}};
 ui.run('api=fakeApi;loadShift=async()=>{};refresh=async()=>{};');ui.get('openingStart').value='1000.00';ui.get('openingUsdStart').value='20.50';ui.get('usdStart').value='18.5050';ui.get('openingShiftType').value='NIGHT';
 await ui.run('Promise.all([openShiftFromStart(),openShiftFromStart()])');assert.equal(requests.length,1);assert.deepEqual(requests[0],{route:'/api/shift/open',body:{opening_cents:100000,opening_usd_cents:2050,usd_rate:18.505,shift_type:'NIGHT'}});
});

test('El cierre admite una diferencia física y USD cero sin convertir monedas ni forzar entregas',async()=>{
 const ui=screen({cashier:true}),requests=[];
 ui.context.fakeApi=async(route,opt)=>{requests.push({route,body:JSON.parse(opt.body)});return {id:4,shift_type:'NIGHT',sales_cents:2500,declared_cents:102000,difference_cents:-500,difference_usd_cents:0,pending_day_settlement_cents:2500}};
 ui.run('api=fakeApi;loadShift=async()=>{};refresh=async()=>{};showHandoverForShift=async()=>{};printShift=async()=>{};currentShiftId=4;shiftZExpected={id:4,expected_cents:102500,expected_usd_cents:0};');ui.get('declared').value='1020.00';ui.get('declaredUsd').value='0.00';
 await ui.run('Promise.all([closeShift(),closeShift()])');assert.equal(requests.length,1);assert.deepEqual(requests[0],{route:'/api/shift/close',body:{shift_id:4,declared_cents:102000,declared_usd_cents:0}});assert.match(ui.get('shiftResult').innerHTML,/cerrado/);assert.match(ui.get('shiftResult').innerHTML,/pendiente \(informativa\)/);
});

test('Captura monetaria acepta punto o coma decimal y rechaza importes ambiguos',()=>{
 const ui=screen();assert.equal(ui.run("parseMoneyUI('123,45')"),12345);assert.equal(ui.run("parseMoneyUI('123.45')"),12345);assert.equal(ui.run("rateUnitsUI('18,5050')"),185050);assert.throws(()=>ui.run("parseMoneyUI('1,000.50')"));assert.throws(()=>ui.run("parseMoneyUI('-5')"));assert.throws(()=>ui.run("parseMoneyUI('1.234')"));
});
