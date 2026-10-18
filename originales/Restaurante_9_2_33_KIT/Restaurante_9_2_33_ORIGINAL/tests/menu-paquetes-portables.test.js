'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {crearMenuZip,importarMenuZip,portabilizar}=require('../menu_paquetes');
const {validarProyecto}=require('../public/menu-proyecto');
const make=()=>({
  version:1,clasificacionEsquema:'sql11',titulo:'Restaurante prueba',fotografias:[],
  gruposPreparados:[{id:'g01',nombre:'Hot dogs',clasificacion:2}],
  productos:[{id:'hot',nombre:'Hot dog sencillo',tipo:'con_opciones',precio:70,idgrupo:'borrador:g01',grupo_detectado:'Hot dogs',
    clave:'03001',claveAutomatica:false,importado:true,evidencia:[],ingredientes:['Salchicha'],revision:[],revisado:true,excluido:false,
    modificadores:[{nombre:'TIPO DE PAPAS',obligatorio:true,minimo:1,maximo:1,opciones:[
      {nombre:'SIN PAPAS',precio:0},{nombre:'PAPAS A LA FRANCESA',precio:30},{nombre:'PAPAS SAZONADAS',precio:35}]}]}]
});
test('ZIP portable recupera una sola ficha y sus tres opciones sin SQL',()=>{
 const zip=crearMenuZip(make(),'Menú del local');
 assert.equal(zip.subarray(0,4).toString('binary'),'PK\x03\x04');
 const r=importarMenuZip(zip);
 assert.equal(r.nombre,'Menú del local');assert.equal(r.productos,1);assert.equal(r.compuestos,1);
 const p=r.proyecto.productos[0];
 assert.equal(p.clave,'');assert.equal(p.claveAutomatica,true);assert.equal(p.importado,undefined);
 assert.equal(p.modificadores[0].nombre,'TIPO DE PAPAS');
 assert.deepEqual(p.modificadores[0].opciones.map(o=>o.precio),[0,30,35]);
 assert.equal(r.proyecto.gruposPreparados[0].clasificacion,2);
 assert.deepEqual(validarProyecto(r.proyecto),r.proyecto);
});
test('proyecto portatil no conserva claves de SQL ni relación importado',()=>{
 const p=make();p.gruposPreparados=[];p.productos[0].idgrupo='04';p.productos[0].grupo_detectado='Hamburguesas';
 const out=portabilizar(p);
 assert.equal(out.productos[0].idgrupo,'borrador:menu-portable-0');
 assert.equal(out.gruposPreparados[0].nombre,'Hamburguesas');
 assert.equal(out.gruposPreparados[0].clasificacion,undefined);
 assert.equal(out.productos[0].importado,undefined);
 assert.equal(p.productos[0].clave,'03001');
});
test('proyecto sin nombre de grupo debe pedir revisión, no usar grupo SQL numérico de otro cliente',()=>{
 const p=make();p.productos[0].idgrupo='05';p.productos[0].grupo_detectado='';
 const out=portabilizar(p);
 assert.equal(out.productos[0].idgrupo,'');assert.equal(out.productos[0].revisado,false);
});
test('archivo corrupto se rechaza por CRC sin perder el proyecto original',()=>{
 const original=make();const zip=crearMenuZip(original),copy=Buffer.from(zip);
 const i=copy.indexOf(Buffer.from('TIPO DE PAPAS'));assert.ok(i>0);copy[i]^=1;
 assert.throws(()=>importarMenuZip(copy),/dañado|integridad/);
 assert.equal(original.productos[0].nombre,'Hot dog sencillo');
});
test('rechaza un ZIP que no es de Restaurante y archivos potencialmente peligrosos',()=>{
 for(const z of [Buffer.from('no zip'),Buffer.alloc(22),Buffer.from('PK'+'\0'.repeat(50))])
  assert.throws(()=>importarMenuZip(z),/ZIP|directorio/);
});
test('precios de modificador dudosos permanecen pendientes, nunca se inventan',()=>{
 const p=make();p.productos[0].modificadores[0].opciones[2].precio=null;
 const result=importarMenuZip(crearMenuZip(p));
 assert.equal(result.proyecto.productos[0].revisado,false);
 assert.equal(result.proyecto.productos[0].modificadores[0].opciones[2].precio,null);
});
test('los paquetes exportados excluyen credenciales y referencias privadas',()=>{
 const p=make();p.password='CLAVE_PASSWORD_SECRETA';p.conexion={password:'CLAVE_SQL_SUPER_SECRETA'};
 p.productos[0].token='TOKEN_CLIENTE_PRIVADO';
 const zip=crearMenuZip(p);
 assert.ok(!zip.includes(Buffer.from('CLAVE_PASSWORD_SECRETA')));
 assert.ok(!zip.includes(Buffer.from('CLAVE_SQL_SUPER_SECRETA')));
 assert.ok(!zip.includes(Buffer.from('TOKEN_CLIENTE_PRIVADO')));
});
test('la interfaz no contiene menús de clientes precargados',()=>{
 const base=path.join(__dirname,'..');
 const html=fs.readFileSync(path.join(base,'public/menu.html'),'utf8');
 const code=fs.readFileSync(path.join(base,'public/menu.js'),'utf8');
 const server=fs.readFileSync(path.join(base,'menu_ia.js'),'utf8');
 for(const src of [html,code,server])assert.doesNotMatch(src,/Costa.?Amura|loadCostaAmura/i);
 assert.match(html,/id="importMenuZip"/);assert.match(html,/id="zipMenuFile"/);
 assert.match(code,/menu-paquetes\/importar/);assert.match(server,/menu-paquetes\/importar/);
 assert.match(code,/menu-paquetes\/exportar/);
 assert.match(server,/x-csrf-token/);
});
