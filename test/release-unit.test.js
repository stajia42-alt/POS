'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {buildEntryTicket,textBytes}=require('../ticket-escpos');
const rates=require('../lib/rates');
const cwd=path.join(__dirname,'..');
test('ESC/POS preserva saltos de línea y no los transforma en ? (regresión importante)',()=>{
 assert.deepEqual([...textBytes('ABC\nDEF')],[65,66,67,10,68,69,70]);
 const raw=buildEntryTicket({name:'LIBRA 3',code:'AABBCCDDEEFF11',entryAt:'2026-10-11T20:15:00.000Z',address:'Calle 1ra\nTijuana',policies:'Primera cláusula\nSegunda cláusula'});
 assert.ok(raw.includes(Buffer.from('Calle 1ra\n')));
 assert.ok(raw.includes(Buffer.from('Tijuana\n')));
 assert.ok(raw.includes(Buffer.from([29,107,73,16,123,66])));
 assert.ok(raw.includes(Buffer.from('AABBCCDDEEFF11')));
 assert.equal(raw.filter(x=>x===63).length,0);
});
test('CODE128 genera vista previa con mismo folio del ticket real y zona blanca',()=>{
 const js=fs.readFileSync(path.join(cwd,'public/preview.js'),'utf8');
 const context=vm.createContext({});const svg=vm.runInContext(js+"\nbarcode128Svg('AABBCCDDEEFF11')",context);
 assert.match(svg,/<svg /);assert.match(svg,/AABBCCDDEEFF11/);
 assert.match(svg,/<rect x="12"/);assert.ok((svg.match(/<rect /g)||[]).length>45);
 assert.throws(()=>vm.runInContext(js+"\nbarcode128Svg('<script>')",vm.createContext({})),/inválido/);
});
test('Tarifa de Libra 3 respeta límite de 60, 120, 360, 720, 1440 minutos y adicionales',()=>{
 const c={...rates.defaults,...rates.libra3};
 for(const [minutes,amount] of [[1,5000],[60,5000],[61,7000],[120,7000],[121,10000],[360,10000],[361,13000],[720,13000],[721,20000],[1440,20000],[1441,40000],[2160,40000],[2161,60000]])assert.equal(rates.price(minutes,c),amount,minutes+' min');
 assert.equal(c.lostTicketCents,20000);
});
test('Las rutas de entrada e impresión y su vínculo escaneable permanecen presentes',()=>{
 const src=fs.readFileSync(path.join(cwd,'lib/operations.js'),'utf8'),server=fs.readFileSync(path.join(cwd,'server.js'),'utf8'),html=fs.readFileSync(path.join(cwd,'public/index.html'),'utf8');
 assert.match(src,/app\.post\('\/api\/entry'/);assert.match(src,/await printEntry\(cfg,result\.code,result\.entry_at\)/);
 assert.match(src,/app\.get\('\/api\/ticket\/:code'/);assert.match(src,/app\.post\('\/api\/ticket\/:code\/pay'/);assert.match(src,/app\.post\('\/api\/ticket\/:code\/exit'/);
 assert.match(html,/id="code"[^>]*onkeydown="if\(event\.key==='Enter'\)lookup\(\)"/);
 assert.match(src,/print_snapshot/);assert.match(server,/\/api\/print\/preview\/:code/);
});
test('Código del navegador mantiene sintaxis válida incluyendo nueva vista previa',()=>{
 const html=fs.readFileSync(path.join(cwd,'public/index.html'),'utf8');const src=html.match(/<script>([\s\S]*?)<\/script>/);assert.ok(src);
 for(const [filename,source] of [['inline',src[1]],['professional.js',fs.readFileSync(path.join(cwd,'public/professional.js'),'utf8')],['preview.js',fs.readFileSync(path.join(cwd,'public/preview.js'),'utf8')]])assert.doesNotThrow(()=>new vm.Script(source),filename);
});
test('La migración 003 agrega campos e índice sin modificar registros históricos (SQLite integrado)',()=>{
 const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync(':memory:');
 try{
  require('../migrations/001-legacy')(d);require('../migrations/002-professional')(d);
  d.prepare('INSERT INTO tickets(code,entry_at,rate_snapshot) VALUES(?,?,?)').run('FOLIOHISTORICO','2026-10-11T20:15:00.000Z','{}');
  d.prepare('INSERT INTO clients(name,plate,kind,discount_bps,valid_from,valid_to,window_start,window_end,notes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run('Cliente anterior','ABC123','frequent',500,'2026-01-01T00:00:00.000Z','2027-01-01T00:00:00.000Z','08:00','20:00','','2026-01-01T00:00:00.000Z');
  require('../migrations/003-clients-print')(d);
  assert.equal(d.prepare('SELECT code FROM tickets').get().code,'FOLIOHISTORICO');
  assert.equal(d.prepare('SELECT plate FROM clients').get().plate,'ABC123');
  assert.equal(d.prepare('SELECT print_snapshot FROM tickets').get().print_snapshot,null);
  d.prepare('UPDATE clients SET client_code=? WHERE id=1').run('CLIENTE01');
  assert.equal(d.prepare('SELECT client_code FROM clients WHERE id=1').get().client_code,'CLIENTE01');
  assert.ok(d.prepare("SELECT name FROM sqlite_master WHERE name='print_attempts'").get());
  assert.equal(d.prepare('SELECT MAX(version) version FROM schema_migrations').get().version,3);
 }finally{d.close()}
});
