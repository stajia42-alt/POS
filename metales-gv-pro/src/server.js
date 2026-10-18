'use strict';
const express = require('express');
const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs');
const { Store } = require('./database');
const { POS } = require('./pos');
const { assert, text, id, safeUser, AppError } = require('./values');
const { ticketText, cutText } = require('./tickets');
const VERSION = require('../package.json').version;
const cookieName = 'mgv_session';
const roles = ['admin','cashier','viewer'];
const localData = () => process.env.METALES_DATA_DIR || path.join(__dirname, '../data');
// Sesión HttpOnly, scrypt, nonce CSRF y bloqueo de intentos: patrón adaptado de gestion.js 9.2.33.
function passwordData(password) {
 assert(typeof password === 'string' && password.length >= 10 && password.length <= 200, 'La contraseña debe tener entre 10 y 200 caracteres.');
 const salt = crypto.randomBytes(16).toString('hex'); return { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') };
}
function checkPassword(password, user) {
 const p = typeof password === 'string' && password.length <= 200 ? password : '';
 const hash = crypto.scryptSync(p, user?.salt || 'usuario-inexistente', 64);
 return !!user && crypto.timingSafeEqual(hash, Buffer.from(user.hash, 'hex'));
}
async function createApplication({ dataDir = localData() } = {}) {
 const store = await Store.open(dataDir), pos = new POS(store), app = express();
 const sessions = new Map(), attempts = new Map(), bootstrapNonce = crypto.randomBytes(24).toString('hex');
 app.disable('x-powered-by');
 app.use((req, res, next) => {
  if (!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress) || req.headers['x-forwarded-for'] || req.headers['cf-connecting-ip'] || req.headers.forwarded) return res.status(403).json({ error: 'Acceso local únicamente.' });
  if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(req.headers.host || '')) return res.status(403).json({ error: 'Host no permitido.' });
  res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
   'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" });
  if (req.headers.origin) { try { assert(new URL(req.headers.origin).origin === 'http://' + req.headers.host, 'Origen no permitido.', 403); } catch { return res.status(403).json({ error: 'Origen no permitido.' }); } }
  next();
 });
 app.use(express.json({ limit: '36mb' }));
 function auth(req) {
  const token = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
  const session = sessions.get(token); if (!session) return null;
  if (session.until < Date.now()) { sessions.delete(token); return null; }
  const user = store.get('SELECT * FROM users WHERE id=? AND active=1', [session.id]);
  return user ? { user, nonce: session.nonce, token } : null;
 }
 function session(res, user) {
  const token = crypto.randomBytes(32).toString('hex'), nonce = crypto.randomBytes(24).toString('hex');
  if (sessions.size > 500) for (const [t, s] of sessions) if (s.until < Date.now()) sessions.delete(t);
  sessions.set(token, { id: user.id, nonce, until: Date.now() + 8 * 3600000 });
  res.set('Set-Cookie', `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`); return nonce;
 }
 const csrf = (req, nonce) => assert(req.headers['x-csrf-token'] === nonce, 'Sesión caducada. Recarga la aplicación.', 403);
 const wrap = fn => (req, res, next) => { try { Promise.resolve(fn(req, res)).catch(next); } catch (e) { next(e); } };
 const admin = (req, res, next) => { if (req.auth.user.role !== 'admin') return res.status(403).json({ error: 'Función exclusiva del administrador.' }); next(); };
 const operator = (req, res, next) => { if (req.auth.user.role === 'viewer') return res.status(403).json({ error: 'Tu usuario tiene permiso de consulta.' }); next(); };
 app.get('/api/health', (req, res) => res.json({ ok: true, version: VERSION, sqlite: store.get('SELECT sqlite_version() version').version }));
 app.get('/api/session', (req, res) => { const a = auth(req); res.json({ user: a ? safeUser(a.user) : null, nonce: a?.nonce || bootstrapNonce, needsSetup: !store.get('SELECT id FROM users LIMIT 1'), version: VERSION }); });
 app.post('/api/setup', wrap((req, res) => {
  csrf(req, bootstrapNonce); assert(!store.get('SELECT id FROM users LIMIT 1'), 'La configuración inicial ya se completó.', 409);
  const name = text(req.body.name, 'Usuario', 60), business = text(req.body.business, 'Negocio', 120), data = passwordData(req.body.password);
  const user = store.transaction(() => {
   const uid = store.run("INSERT INTO users(name,role,salt,hash) VALUES(?,'admin',?,?)", [name, data.salt, data.hash]);
   store.run("UPDATE settings SET value=? WHERE key='business'", [JSON.stringify({ ...store.business(), name: business })]);
   store.audit({ name }, 'setup', 'Administrador inicial creado'); return store.get('SELECT * FROM users WHERE id=?', [uid]);
  });
  res.status(201).json({ user: safeUser(user), nonce: session(res, user) });
 }));
 app.post('/api/login', wrap((req, res) => {
  csrf(req, bootstrapNonce); const name = text(req.body.name, 'Usuario', 60).toLowerCase(), now = Date.now();
  if (attempts.size > 1000) for (const [k,v] of attempts) if (v.until < now) attempts.delete(k);
  const attempt = attempts.get(name) || { count: 0, until: now + 15 * 60000 };
  if (attempt.until < now) { attempt.count = 0; attempt.until = now + 15 * 60000; }
  assert(attempt.count < 5, 'Demasiados intentos. Espera 15 minutos.', 429);
  attempt.count++; attempts.set(name, attempt);
  const user = store.get('SELECT * FROM users WHERE name=? COLLATE NOCASE AND active=1', [name]);
  assert(checkPassword(req.body.password, user), 'Usuario o contraseña incorrectos.', 401); attempts.delete(name);
  res.json({ user: safeUser(user), nonce: session(res, user) });
 }));
 app.use('/api', (req, res, next) => { const a = auth(req); if (!a) return res.status(401).json({ error: 'Inicia sesión para continuar.' }); req.auth = a; if (['GET','HEAD'].includes(req.method)) return next(); try { csrf(req, a.nonce); next(); } catch (e) { next(e); } });
 app.post('/api/logout', (req, res) => { sessions.delete(req.auth.token); res.set('Set-Cookie', `${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`); res.json({ ok: true }); });
 app.put('/api/password', wrap((req, res) => {
  assert(checkPassword(req.body.current, req.auth.user), 'La contraseña actual no coincide.', 403); const data = passwordData(req.body.password);
  store.transaction(() => { store.run('UPDATE users SET salt=?,hash=? WHERE id=?', [data.salt, data.hash, req.auth.user.id]); store.audit(req.auth.user, 'user.password', 'Cambio de contraseña propia'); });
  for (const [t, s] of sessions) if (s.id === req.auth.user.id) sessions.delete(t);
  res.json({ nonce: session(res, req.auth.user) });
 }));
 app.get('/api/state', (req, res) => res.json(pos.state()));
 app.get('/api/report', wrap((req, res) => res.json(pos.report(req.query))));
 app.get('/api/report.csv', wrap((req, res) => {
  const r = pos.report(req.query), cell = value => '"' + String(value ?? '').replace(/^[=+\-@\t\r]/, "'$&").replace(/"/g, '""') + '"';
  const rows = [['Folio','Tipo','Estado','Fecha UTC','Usuario','Cliente/proveedor','Pago','Total MXN','Costo MXN'], ...r.rows.map(t => [t.id,t.kind,t.status,t.date,t.user_name,t.counterpart,t.payment,(t.total_cents/100).toFixed(2),(t.cost_cents/100).toFixed(2)])];
  res.type('text/csv').attachment('operaciones-metales-gv.csv').send('\ufeff' + rows.map(row => row.map(cell).join(',')).join('\r\n'));
 }));
 app.post('/api/materials', admin, wrap((req, res) => res.status(201).json(pos.material(req.body, req.auth.user))));
 app.put('/api/materials/:id', admin, wrap((req, res) => res.json(pos.material(req.body, req.auth.user, id(req.params.id)))));
 app.post('/api/stock/adjust', admin, wrap((req, res) => res.json(pos.adjust(req.body, req.auth.user))));
 app.get('/api/stock/moves', wrap((req, res) => {
  const params = req.query.materialId ? [id(req.query.materialId)] : [];
  res.json(store.all('SELECT stock_moves.*, materials.name FROM stock_moves JOIN materials ON materials.id=material_id ' + (params.length ? 'WHERE material_id=? ' : '') + 'ORDER BY stock_moves.id DESC LIMIT 1000', params));
 }));
 app.post('/api/shifts/open', operator, wrap((req, res) => res.status(201).json(pos.openShift(req.body, req.auth.user))));
 app.post('/api/shifts/close', operator, wrap((req, res) => res.json(pos.closeShift(req.body, req.auth.user))));
 app.post('/api/cash', operator, wrap((req, res) => res.status(201).json(pos.manualCash(req.body, req.auth.user))));
 app.post('/api/transactions', operator, wrap((req, res) => res.status(201).json(pos.post(req.body, req.auth.user))));
 app.post('/api/transactions/:id/void', admin, wrap((req, res) => res.json(pos.void(id(req.params.id), req.body, req.auth.user))));
 app.get('/api/tickets/:id', wrap((req, res) => { const tx = pos.ticket(id(req.params.id)); res.json({ ...tx, text: ticketText(tx) }); }));
 app.get('/api/cuts/:id', wrap((req, res) => {
  const shift = store.get('SELECT shifts.*, users.name user_name FROM shifts JOIN users ON users.id=shifts.user_id WHERE shifts.id=? AND closed_at IS NOT NULL', [id(req.params.id)]); assert(shift, 'Corte cerrado no encontrado.', 404);
  shift.summary = store.all('SELECT type,payment,SUM(amount_cents) amount FROM cash_moves WHERE shift_id=? GROUP BY type,payment', [shift.id]);
  res.json({ shift, text: cutText(shift, store.business()), business: store.business() });
 }));
 app.get('/api/users', admin, (req, res) => res.json(store.all('SELECT id,name,role,active FROM users ORDER BY id')));
 app.post('/api/users', admin, wrap((req, res) => {
  const name = text(req.body.name, 'Nombre de usuario', 60), role = req.body.role, data = passwordData(req.body.password); assert(roles.includes(role), 'Rol no válido.');
  const uid = store.transaction(() => { const uid = store.run('INSERT INTO users(name,role,salt,hash) VALUES(?,?,?,?)', [name, role, data.salt, data.hash]); store.audit(req.auth.user, 'user.create', `${uid}; ${name}; ${role}`); return uid; }); res.status(201).json({ id: uid });
 }));
 app.patch('/api/users/:id', admin, wrap((req, res) => {
  const uid = id(req.params.id), u = store.get('SELECT * FROM users WHERE id=?', [uid]); assert(u, 'Usuario no encontrado.', 404);
  assert(uid !== req.auth.user.id, 'Usa Cambiar contraseña para tu cuenta. No puedes modificar tus propios permisos.');
  const role = req.body.role ?? u.role, active = req.body.active === undefined ? u.active : Number(req.body.active === true); assert(roles.includes(role), 'Rol no válido.');
  if (u.role === 'admin' && (!active || role !== 'admin')) assert(store.get("SELECT COUNT(*) n FROM users WHERE role='admin' AND active=1").n > 1, 'Debe permanecer un administrador activo.');
  const password = req.body.password ? passwordData(req.body.password) : null;
  store.transaction(() => { store.run('UPDATE users SET role=?,active=?,salt=?,hash=? WHERE id=?', [role, active, password?.salt || u.salt, password?.hash || u.hash, uid]); store.audit(req.auth.user, 'user.update', uid); });
  for (const [token, s] of sessions) if (s.id === uid) sessions.delete(token); res.json({ ok: true });
 }));
 app.put('/api/business', admin, wrap((req, res) => {
  const b = { ...store.business() }, input = req.body;
  for (const [key, max] of [['name',120],['address',300],['phone',60],['taxId',40],['message',300],['printerName',200]]) b[key] = text(input[key], key, max, key === 'name');
  assert(['58mm','80mm'].includes(input.paper) && ['driver','raw'].includes(input.printMode), 'Configuración de impresión no válida.');
  try { new Intl.DateTimeFormat('es-MX', { timeZone: input.timezone }); } catch { throw new AppError('Zona horaria no válida.'); }
  assert(typeof input.timezone === 'string' && input.timezone.length <= 80, 'Zona horaria no válida.');
  Object.assign(b, { paper: input.paper, printMode: input.printMode, timezone: input.timezone, autoPrint: input.autoPrint === true, autoCut: input.autoCut === true });
  store.transaction(() => { store.run("UPDATE settings SET value=? WHERE key='business'", [JSON.stringify(b)]); store.audit(req.auth.user, 'business.update', 'Configuración del negocio e impresión'); }); res.json(b);
 }));
 app.post('/api/contacts', admin, wrap((req, res) => {
  const name = text(req.body.name, 'Nombre', 120), kind = req.body.kind; assert(['supplier','customer','both'].includes(kind), 'Tipo no válido.');
  const phone = text(req.body.phone, 'Teléfono', 60, false), tax = text(req.body.taxId, 'RFC', 40, false);
  const cid = store.transaction(() => { const cid = store.run('INSERT INTO contacts(name,kind,phone,tax_id) VALUES(?,?,?,?)', [name, kind, phone, tax]); store.audit(req.auth.user, 'contact.create', name); return cid; }); res.status(201).json({ id: cid });
 }));
 app.get('/api/audit', admin, (req, res) => res.json(store.all('SELECT * FROM audit ORDER BY id DESC LIMIT 500')));
 app.get('/api/backup', admin, (req, res) => res.type('application/vnd.sqlite3').attachment(`METales-GV-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`).send(store.snapshot()));
 app.get('/api/backups', admin, (req, res) => { const dir = path.join(dataDir, 'backups'); res.json(fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /^[\w.-]+\.sqlite$/.test(f)).sort().reverse() : []); });
 app.get('/api/backups/:name', admin, wrap((req, res) => { assert(/^[\w.-]+\.sqlite$/.test(req.params.name), 'Archivo no válido.'); const file = path.join(dataDir, 'backups', req.params.name); assert(fs.existsSync(file), 'Respaldo no encontrado.', 404); res.download(file); }));
 app.post('/api/restore', admin, wrap((req, res) => {
  assert(!pos.shift(), 'Cierra el turno antes de restaurar.', 409); assert(req.body.confirm === 'RESTAURAR', 'Escribe RESTAURAR para confirmar.');
  assert(typeof req.body.base64 === 'string' && req.body.base64.length <= 32 * 1024 * 1024 && /^[A-Za-z0-9+/]+=*$/.test(req.body.base64), 'Archivo no válido o demasiado grande.');
  const previous = store.restore(Buffer.from(req.body.base64, 'base64')); sessions.clear(); res.json({ ok: true, previous, message: 'Respaldo restaurado. Inicia sesión con los usuarios del respaldo.' });
 }));
 app.post('/api/legacy/preview', admin, wrap((req, res) => res.json(pos.legacyPreview(req.body.data))));
 app.post('/api/legacy/import', admin, wrap((req, res) => res.status(201).json(pos.importLegacy(req.body, req.auth.user))));
 app.get('/api/legacy', admin, (req, res) => res.json(store.all('SELECT id,date,filename FROM legacy_imports ORDER BY id DESC')));
 app.get('/api/legacy/:id', admin, wrap((req, res) => { const row = store.get('SELECT json FROM legacy_imports WHERE id=?', [id(req.params.id)]); assert(row, 'Respaldo original no encontrado.', 404); res.type('json').attachment('respaldo-v15-original.json').send(row.json); }));
 app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));
 app.use(express.static(path.join(__dirname, '../public'), { etag: false }));
 app.use((error, req, res, next) => {
  let status = error.status || 500, message = error.message;
  if (/UNIQUE constraint/.test(message)) { status = 409; message = 'Ya existe un registro con ese nombre o identificador.'; }
  if (/CHECK constraint|FOREIGN KEY/.test(message)) { status = 400; message = 'Los datos no cumplen las reglas de integridad.'; }
  if (error.type === 'entity.parse.failed') { status = 400; message = 'JSON no válido.'; }
  if (status >= 500) { console.error('Error interno:', error.message); message = 'No se pudo completar la operación. Revisa el registro y el espacio disponible.'; }
  res.status(status).json({ error: message });
 });
 return { app, store, pos, close: () => store.close() };
}
async function start({ port = Number(process.env.PORT || 3180), ...options } = {}) {
 const service = await createApplication(options);
 try {
  const server = await new Promise((resolve, reject) => { const server = service.app.listen(port, '127.0.0.1', () => resolve(server)); server.once('error', reject); });
  return { ...service, server, url: `http://127.0.0.1:${server.address().port}`, stop: () => new Promise(resolve => {
   const timer = setTimeout(() => server.closeAllConnections(), 2000); timer.unref();
   server.close(() => { clearTimeout(timer); service.close(); resolve(); }); server.closeIdleConnections();
  }) };
 } catch (e) { service.close(); throw e; }
}
if (require.main === module) start().then(service => {
 console.log(`METales-GV Pro ${VERSION} en ${service.url}`);
 for (const sig of ['SIGINT','SIGTERM']) process.once(sig, () => service.stop().then(() => process.exit(0)));
}).catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { createApplication, start, passwordData, checkPassword };
