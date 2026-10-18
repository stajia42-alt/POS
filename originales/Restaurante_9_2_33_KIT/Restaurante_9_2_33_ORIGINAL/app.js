const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync, execFile } = require("child_process");
const { createRequire } = require("module");

// V7.9: Express y SQL se cargan desde dist\runtime\node_modules.
// Esto evita que pkg intente incrustar las dependencias de mssql y omita
// archivos internos de @typespec/ts-http-runtime.
const appBaseDir = process.pkg ? path.dirname(process.execPath) : __dirname;
const runtimeRequire = createRequire(path.join(appBaseDir, "runtime", "loader.js"));
const express = runtimeRequire("express");
const sql = runtimeRequire("mssql");

const app = express();
const interfaz = require('./interfaz');
const release = require('./version');
const PORT = Number(process.env.PORT || 3000);
app.use(express.json({limit:'12mb'}));

// =====================================================
// V7 ETAPA 2 - DETECCIÓN AUTOMÁTICA DE SOFT RESTAURANT
// =====================================================
const SQL_DEFAULTS = {
    server: "127.0.0.1",
    database: "softrestaurant11",
    user: "sa",
    password: process.env.SQL_PASSWORD || ""
};

const configDir = process.env.RESTAURANTE_CONFIG_DIR || path.join(process.env.PROGRAMDATA || os.homedir(), "Restaurante");
const configFile = path.join(configDir, "conexion.json");
let config = null;
let pool = null;

let connecting = null;
let lastFailure = null;
let retryAfter = 0;
const attempts = [];
const crypto = require('crypto');
const adminNonce = crypto.randomBytes(24).toString('hex');
let hayCuentasDeDueno = () => false;
function normalizarConfig(c) {
    const port = Number(c.port);
    if (!c.server || !c.database || !c.user || !Number.isInteger(port) || port < 1 || port > 65535)
        throw new Error('Indica servidor, puerto (1–65535), base de datos y usuario SQL.');
    return {server:String(c.server).trim(),port,database:String(c.database).trim(),user:String(c.user).trim(),
        password:String(c.password || ''),connectionTimeout:3000,requestTimeout:20000,
        pool:{max:5,min:0,idleTimeoutMillis:30000},
        options:{encrypt:false,trustServerCertificate:true,useUTC:true}};
}
function leerConfiguracionGuardada() {
    try { return normalizarConfig(JSON.parse(fs.readFileSync(configFile,'utf8'))); }
    catch(e) { if(e.code !== 'ENOENT') console.error('Configuración no válida:',e.message); return null; }
}
function guardarConfiguracion(c) {
    fs.mkdirSync(configDir,{recursive:true});
    const target = configFile + '.tmp';
    fs.writeFileSync(target,JSON.stringify({server:c.server,port:c.port,database:c.database,user:c.user,password:c.password},null,2),{mode:0o600});
    fs.renameSync(target,configFile);
}
function puertosDesdeRegistro() {
    if(process.platform !== 'win32') return [];
    const ports=[];
    for(const base of ['HKLM\\SOFTWARE\\Microsoft\\Microsoft SQL Server','HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Microsoft SQL Server']) {
        for(const value of ['TcpDynamicPorts','TcpPort']) {
            try {
                const output=execFileSync('reg.exe',['query',base,'/s','/v',value],{encoding:'utf8',windowsHide:true,timeout:5000,stdio:['ignore','pipe','ignore']});
                for(const line of output.split(/\r?\n/)) {
                    const m=line.match(/REG_SZ\s+([\d, ]+)$/i);
                    if(m) for(const v of m[1].split(',')) { const n=Number(v.trim());if(n>0 && n<=65535)ports.push(n); }
                }
            } catch(_) {}
        }
    }
    return [...new Set(ports)];
}
function crearConfig(port) { return normalizarConfig({...SQL_DEFAULTS,port}); }
async function probarConfig(c) {
    const p=new sql.ConnectionPool(c);
    p.on('error',e=>console.error('Conexión SQL:',e.code || 'ERROR'));
    try {
        await p.connect();
        const r=await p.request().query("SELECT OBJECT_ID('cheques') AS cheques, OBJECT_ID('productos') AS productos");
        if(!r.recordset[0]?.cheques || !r.recordset[0]?.productos) throw new Error('La base no contiene cheques y productos de Soft Restaurant.');
        return p;
    } catch(e) { await p.close().catch(()=>{});throw e; }
}
async function detectarSQL() {
    attempts.length=0;
    const saved=leerConfiguracionGuardada();
    const candidates=[];
    if(saved) candidates.push(saved);
    // Con configuración remota explícita no se cambia silenciosamente a otro servidor.
    if(!saved || ['127.0.0.1','localhost','.'].includes(saved.server)) {
        const base=saved || SQL_DEFAULTS;
        if(!base.password) throw new Error('Configura el usuario y la contraseña SQL en Configuración y diagnóstico.');
        for(const port of [...new Set([...puertosDesdeRegistro(),49773,1433])])
            if(!saved || port!==saved.port)candidates.push(normalizarConfig({...base,port}));
    }
    for(const c of candidates) {
        try {
            const p=await probarConfig(c);
            try { guardarConfiguracion(c); } catch(e) { await p.close();throw e; }
            config=c;pool=p;return p;
        } catch(e) { attempts.push({server:c.server,port:c.port,code:e.code || 'ERROR',error:e.message}); }
    }
    throw new Error('No se pudo conectar a SQL. Abre Configuración y diagnóstico para revisar servidor, puerto y credenciales.');
}
async function conectar() {
    if(pool?.connected)return pool;
    if(connecting)return connecting;
    if(lastFailure && Date.now()<retryAfter)throw lastFailure;
    connecting=(async()=>{
        if(pool)await pool.close().catch(()=>{});
        try { const p=await detectarSQL();lastFailure=null;return p; }
        catch(e) {lastFailure=e;retryAfter=Date.now()+15000;throw e;}
    })();
    try{return await connecting;}finally{connecting=null;}
}
function esLocal(req) {
    return ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)
        && !req.headers['cf-connecting-ip'] && !req.headers['x-forwarded-for'] && !req.headers['forwarded'];
}
app.disable('x-powered-by');
app.use((req,res,next)=>{
    res.set('Cache-Control','no-store');
    res.set('X-Content-Type-Options','nosniff');
    res.set('X-Frame-Options','DENY');
    let key=process.env.RESTAURANTE_ACCESS_KEY;
    if(!key)try{key=fs.readFileSync(path.join(configDir,'acceso-remoto.txt'),'utf8').trim();}catch(_){}
    // Tras activar usuarios, la pantalla de sesión v9 protege todo el acceso
    // remoto: evitar la segunda contraseña HTTP Basic del navegador.
    if(!esLocal(req) && !hayCuentasDeDueno()) {
        if(!key)return res.status(403).send('Acceso remoto deshabilitado. Ejecuta CONFIGURAR_ACCESO_REMOTO.cmd en el servidor.');
        let supplied='';try { const m=(req.headers.authorization||'').match(/^Basic ([A-Za-z0-9+/]+={0,2})$/); if(m){const pair=Buffer.from(m[1],'base64').toString('utf8'); if(pair.startsWith('restaurante:')) supplied=pair.slice('restaurante:'.length);} } catch(_) {}
        const a=Buffer.from(supplied),b=Buffer.from(key);
        if(a.length!==b.length || !crypto.timingSafeEqual(a,b)) {res.set('WWW-Authenticate','Basic realm="Restaurante"');return res.status(401).send('Se requiere la clave de acceso.');}
    }
    next();
});
app.use('/api',(req,res,next)=>{
    if(!['GET','HEAD','OPTIONS'].includes(req.method) && req.headers.origin) {
        try { if(new URL(req.headers.origin).host!==req.headers.host) return res.status(403).json({correcto:false,error:'Origen de solicitud no permitido.'}); }
        catch {return res.status(403).json({correcto:false,error:'Origen de solicitud no válido.'});}
    }
    next();
});
app.use('/api',(req,res,next)=>{
    for(const key of ['desde','hasta']) {
        const value=req.query[key];
        if(value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10)!==value))
            return res.status(400).json({correcto:false,error:'Fecha no válida: '+key});
    }
    if(req.query.desde && req.query.hasta && req.query.desde>req.query.hasta)
        return res.status(400).json({correcto:false,error:'La fecha inicial debe ser anterior o igual a la final.'});
    next();
});
function soloLocal(req,res,next) {
    if(!esLocal(req) || !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(req.headers.host||''))
        return res.status(403).json({correcto:false,error:'Abre esta pantalla en http://127.0.0.1:'+PORT+' desde el servidor.'});
    next();
}
const gestion=require('./gestion')({app,configDir,esLocal});
hayCuentasDeDueno = gestion.hasUsers;
const soloDueno = gestion.onlyOwner;
app.get('/activar-celular',soloLocal,(req,res)=>res.type('html').set('Cache-Control','no-store').send(interfaz.activar));
app.get('/configuracion',soloDueno,(req,res)=>res.type('html').set('Cache-Control','no-store').send(interfaz.configuracion));
app.get('/api/configuracion',soloDueno,(req,res)=>{
    const c=leerConfiguracionGuardada() || {...SQL_DEFAULTS,port:49773};
    res.json({correcto:true,server:c.server,port:c.port,database:c.database,user:c.user,tienePassword:!!c.password,nonce:adminNonce,csrf:req.auth.nonce});
});
app.post('/api/configuracion',soloDueno,async(req,res)=>{
    if(req.headers['x-csrf-token'] !== req.auth.nonce) return res.status(403).json({correcto:false,error:'Sesión caducada. Recarga la configuración.'});
    if(req.headers['x-admin-nonce']!==adminNonce)return res.status(403).json({correcto:false,error:'Recarga la configuración.'});
    if(connecting)return res.status(409).json({correcto:false,error:'Hay una conexión en curso. Reintenta en unos segundos.'});
    let candidate;
    const task=(async()=>{
        const saved=leerConfiguracionGuardada();
        const c=normalizarConfig({...req.body,password:req.body.password || saved?.password || ''});
        candidate=await probarConfig(c);
        guardarConfiguracion(c);
        app.locals.reports?.clearCache();
        const old=pool;pool=candidate;candidate=null;config=c;lastFailure=null;retryAfter=0;
        if(old)await old.close().catch(()=>{});
    })();
    connecting=task.then(()=>pool);
    try {await connecting;res.json({correcto:true,mensaje:'Conexión probada y guardada.'});}
    catch(e) {if(candidate)await candidate.close().catch(()=>{});res.status(400).json({correcto:false,error:e.message});}
    finally{connecting=null;}
});
app.get('/api/estado',(req,res)=>res.json({correcto:true,...release,sql:!!pool?.connected}));
app.get('/api/diagnostico',soloDueno,async(req,res)=>{
    try {
        const db=await conectar();
        const result=await db.request().query("SELECT TABLE_SCHEMA esquema,TABLE_NAME tabla,COLUMN_NAME columna,DATA_TYPE tipo FROM INFORMATION_SCHEMA.COLUMNS ORDER BY TABLE_SCHEMA,TABLE_NAME,ORDINAL_POSITION");
        const required={"Cancelaciones de productos": {"cancela":["foliocheque","comanda","cantidad","clave","razon","fecha","usuario","precio","idturno_cierre"]}, "Cuentas y servicios": {"cheques": ["folio", "numcheque", "fecha", "cierre", "mesa", "idmesero", "idempresa", "idturno", "tipodeservicio", "total", "propina", "cancelado", "pagado", "totaldescuentos", "totalcortesias", "totalarticulos", "propinapagada", "totalsindescuento", "totalconpropinacargo", "cargo", "totalimpuesto1", "razoncancelado", "usuariocancelo", "comentariodescuento", "usuariodescuento", "cambio"], "tiposervicio": ["Idtiposervicio", "Desc_tiposervicio"], "empresas": ["idempresa", "nombre"]}, "Productos y meseros": {"cheqdet": ["foliodet", "movimiento", "cantidad", "idproducto", "precio", "preciocatalogo", "idmeseroproducto", "descuento", "idcortesia"], "vwrepproductosvendidoscheques": ["folio", "foliodet"], "meseros": ["idmesero", "nombre"], "productos": ["idproducto", "descripcion", "idgrupo"], "grupos": ["idgrupo", "descripcion"]}, "Cortes y pagos": {"turnos": ["idturnointerno", "idturno", "idempresa", "cajero", "idestacion", "apertura", "cierre", "fondo", "efectivo", "tarjeta", "vales", "credito"], "chequespagos": ["folio", "idformadepago", "importe", "propina", "referencia"], "formasdepago": ["idformadepago", "descripcion", "tipo"], "movtoscaja": ["folio", "fecha", "tipo", "concepto", "importe", "cancelado", "pagodepropina", "idempresa", "idturno"]}, "Cuentas abiertas": {"tempcheques": ["folio", "numcheque", "fecha", "cierre", "mesa", "idmesero", "idempresa", "idturno", "tipodeservicio", "total", "propina", "cancelado", "pagado", "totaldescuentos", "totalcortesias", "totalarticulos", "propinapagada", "totalsindescuento", "totalconpropinacargo", "cargo", "totalimpuesto1"], "tempcheqdet": ["foliodet", "movimiento", "cantidad", "idproducto", "precio", "preciocatalogo", "idmeseroproducto", "descuento", "idcortesia"], "vwrepproductosvendidostempcheques": ["folio", "foliodet"], "tempchequespagos": ["folio", "idformadepago", "importe", "propina", "referencia"]}};
        const found=new Set(result.recordset.map(x=>(x.tabla+'.'+x.columna).toLowerCase()));
        const compatibilidad=Object.entries(required).map(([modulo,tables])=>({modulo,faltantes:Object.entries(tables).flatMap(([t,cols])=>cols.filter(c=>!found.has((t+'.'+c).toLowerCase())).map(c=>t+'.'+c))}));
        res.json({correcto:true,...release,conexion:{server:config.server,port:config.port,database:config.database},compatibilidad,nota:'Verificación de nombres; no valida cálculos, claves ni permisos de SELECT en cada tabla.',columnas:result.recordset});
    } catch(e) {res.status(503).json({correcto:false,error:e.message,intentos:attempts});}
});


require('./menu_seguridad')({app});
require('./menu_diagnostico')({app,conectar,soloLocal:soloDueno});
require('./menu_operaciones')({app,conectar,soloLocal:soloDueno,sql,configDir});
require('./diagnostico_menu')({app,conectar,soloLocal:soloDueno,sql});
require('./diagnostico_producto')({app,conectar,soloLocal:soloDueno,sql});
require('./inventario_diagnostico')({app,conectar,soloLocal:soloDueno});
require('./menu_admin')({app,conectar,soloLocal:soloDueno,sql});
require('./menu_preflight')({app,conectar,soloLocal:soloDueno});
require('./menu_ensayo')({app,conectar,soloLocal:soloDueno,sql});
require('./menu_guardar')({app,conectar,soloLocal:soloDueno,sql});
require('./menu_ia')({app,conectar,soloLocal:soloDueno,sql});
require('./menu_nube')({app,configDir});
require('./menu_visual_fotos')({app,configDir,soloLocal:soloDueno});
require('./menu_visual_sugerencias')({app,soloLocal:soloDueno});

const reports = require('./reportes')({app,sql,conectar,getSettings:gestion.settings});
app.locals.reports=reports;
require('./mejoras')({app,reports,sql,getSettings:gestion.settings});
// Explicit in-memory routes also work when packaged: no static directory lookup.
for (const [route,key,type] of [['/','inicio','html'],['/index.html','inicio','html'],['/style.css','estilo','css'],['/app.js','cliente','application/javascript'],['/extra.js','extra','application/javascript']]) {
    app.get(route,(req,res)=>res.type(type).set('Cache-Control','no-store').send(interfaz[key]));
}
app.use('/api',(req,res)=>res.status(404).json({correcto:false,error:'Ruta no encontrada.'}));
app.use((error,req,res,next)=>{console.error(error.code || error.message);res.status(error.status || 500).json({correcto:false,error:error.message || 'Error del servidor.'});});
const server=app.listen(PORT,'0.0.0.0',()=>{console.log('RESTAURANTE 9 · http://127.0.0.1:'+PORT);if(process.platform==='win32'&&process.env.RESTAURANTE_ABRIR==='1')execFile('cmd.exe',['/c','start','','http://127.0.0.1:'+PORT],{windowsHide:true},()=>{});});
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'El puerto '+PORT+' está ocupado. Cierra la versión anterior de Restaurante.':e.message);process.exitCode=1;});
async function cerrar(){app.locals.ocr?.cerrar();server.close();if(pool)await pool.close().catch(()=>{});}
process.on('SIGINT',()=>cerrar());process.on('SIGTERM',()=>cerrar());
