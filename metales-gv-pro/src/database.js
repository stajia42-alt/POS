'use strict';
const fs = require('node:fs');
const path = require('node:path');
const initSqlJs = require('sql.js');
const { assert, AppError } = require('./values');

const SCHEMA = `
PRAGMA foreign_keys = ON;
PRAGMA application_id = 1296516944;
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT OR IGNORE INTO meta VALUES ('schema', '1');
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE, role TEXT NOT NULL CHECK(role IN ('admin','cashier','viewer')),
 salt TEXT NOT NULL, hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)));
CREATE TABLE IF NOT EXISTS materials (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE, category TEXT NOT NULL,
 buy_cents INTEGER NOT NULL CHECK(buy_cents>=0), sale_cents INTEGER NOT NULL CHECK(sale_cents>=0),
 stock_g INTEGER NOT NULL DEFAULT 0 CHECK(stock_g>=0), value_cents INTEGER NOT NULL DEFAULT 0 CHECK(value_cents>=0),
 min_g INTEGER NOT NULL DEFAULT 0 CHECK(min_g>=0), active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)));
CREATE TABLE IF NOT EXISTS contacts (id INTEGER PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('customer','supplier','both')), phone TEXT NOT NULL, tax_id TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS shifts (
 id INTEGER PRIMARY KEY, opened_at TEXT NOT NULL, closed_at TEXT, user_id INTEGER NOT NULL REFERENCES users(id),
 opening_mxn INTEGER NOT NULL CHECK(opening_mxn>=0), opening_usd INTEGER NOT NULL CHECK(opening_usd>=0), rate INTEGER NOT NULL CHECK(rate>0),
 counted_mxn INTEGER, counted_usd INTEGER, expected_mxn INTEGER, expected_usd INTEGER, note TEXT NOT NULL DEFAULT '');
CREATE UNIQUE INDEX IF NOT EXISTS one_open_shift ON shifts((1)) WHERE closed_at IS NULL;
CREATE TABLE IF NOT EXISTS transactions (
 id INTEGER PRIMARY KEY AUTOINCREMENT, request_id TEXT NOT NULL UNIQUE, request_hash TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('purchase','sale')), status TEXT NOT NULL DEFAULT 'posted' CHECK(status IN ('posted','void')),
 date TEXT NOT NULL, shift_id INTEGER NOT NULL REFERENCES shifts(id), user_id INTEGER NOT NULL REFERENCES users(id),
 user_name TEXT NOT NULL, counterpart TEXT NOT NULL, payment TEXT NOT NULL CHECK(payment IN ('cash','transfer','card','usd')),
 total_cents INTEGER NOT NULL CHECK(total_cents>0), cost_cents INTEGER NOT NULL, tender_cents INTEGER NOT NULL, change_cents INTEGER NOT NULL,
 rate INTEGER NOT NULL, note TEXT NOT NULL, void_reason TEXT, void_at TEXT, void_user TEXT);
CREATE TABLE IF NOT EXISTS transaction_items (
 id INTEGER PRIMARY KEY, transaction_id INTEGER NOT NULL REFERENCES transactions(id), material_id INTEGER NOT NULL REFERENCES materials(id),
 material_name TEXT NOT NULL, gross_g INTEGER NOT NULL, tare_g INTEGER NOT NULL CHECK(tare_g>=0), net_g INTEGER NOT NULL CHECK(net_g>0),
 price_cents INTEGER NOT NULL CHECK(price_cents>0), total_cents INTEGER NOT NULL CHECK(total_cents>0), cost_cents INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS stock_moves (
 id INTEGER PRIMARY KEY, material_id INTEGER NOT NULL REFERENCES materials(id), date TEXT NOT NULL, type TEXT NOT NULL,
 delta_g INTEGER NOT NULL, delta_value INTEGER NOT NULL, after_g INTEGER NOT NULL CHECK(after_g>=0),
 reason TEXT NOT NULL, user_name TEXT NOT NULL, transaction_id INTEGER REFERENCES transactions(id));
CREATE TABLE IF NOT EXISTS cash_moves (
 id INTEGER PRIMARY KEY, shift_id INTEGER NOT NULL REFERENCES shifts(id), date TEXT NOT NULL, type TEXT NOT NULL,
 mxn INTEGER NOT NULL, usd INTEGER NOT NULL DEFAULT 0, amount_cents INTEGER NOT NULL, payment TEXT NOT NULL,
 reason TEXT NOT NULL, user_name TEXT NOT NULL, transaction_id INTEGER REFERENCES transactions(id));
CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, date TEXT NOT NULL, user_name TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS legacy_imports (id INTEGER PRIMARY KEY, date TEXT NOT NULL, filename TEXT NOT NULL, json TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS tx_date ON transactions(date);
CREATE INDEX IF NOT EXISTS stock_material ON stock_moves(material_id, id);
CREATE INDEX IF NOT EXISTS cash_shift ON cash_moves(shift_id, id);
`;
const defaultBusiness = {
 name: 'METales-GV', address: '', phone: '', taxId: '', message: 'Gracias por reciclar con nosotros.',
 paper: '80mm', printerName: '', printMode: 'driver', autoPrint: false, autoCut: true, timezone: 'America/Tijuana'
};
function atomicWrite(file, bytes) {
 const tmp = file + '.tmp';
 let fd;
 try {
  fd = fs.openSync(tmp, 'w', 0o600); fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
  fs.renameSync(tmp, file);
 } catch (e) { if (fd !== undefined) fs.closeSync(fd); try { fs.unlinkSync(tmp); } catch {} throw e; }
}
class Store {
 static async open(directory) {
  fs.mkdirSync(directory, { recursive: true });
  const lock = path.join(directory, '.lock');
  try { fs.mkdirSync(lock); } catch (e) {
   if (e.code !== 'EEXIST') throw e;
   let pid;
   try { pid = Number(fs.readFileSync(path.join(lock, 'pid'), 'utf8')); } catch {}
   assert(Number.isInteger(pid) && pid > 0, 'Existe un bloqueo sin PID. Revisa que la aplicación esté cerrada antes de eliminar data/.lock.', 503);
   let alive = true; try { process.kill(pid, 0); } catch (err) { if (err.code === 'ESRCH') alive = false; }
   assert(!alive, 'La base de datos ya está abierta por otro proceso.', 503);
   fs.rmSync(lock, { recursive: true }); fs.mkdirSync(lock);
  }
  fs.writeFileSync(path.join(lock, 'pid'), String(process.pid));
  try {
   const SQL = await initSqlJs({ locateFile: file => require.resolve('sql.js/dist/' + file) });
   const file = path.join(directory, 'metales-gv.sqlite');
   const bytes = fs.existsSync(file) ? fs.readFileSync(file) : null;
   const db = bytes ? new SQL.Database(bytes) : new SQL.Database();
   const store = new Store(SQL, db, directory, lock);
   if (bytes) store.validate(db);
   db.run(SCHEMA);
   store.transaction(() => store.run('INSERT OR IGNORE INTO settings VALUES (?,?)', ['business', JSON.stringify(defaultBusiness)]));
   return store;
  } catch (e) { fs.rmSync(lock, { recursive: true, force: true }); throw e; }
 }
 constructor(SQL, db, directory, lock) { Object.assign(this, { SQL, db, directory, lock }); this.file = path.join(directory, 'metales-gv.sqlite'); }
 all(sql, params = []) {
  const s = this.db.prepare(sql); try { s.bind(params); const rows = []; while (s.step()) rows.push(s.getAsObject()); return rows; } finally { s.free(); }
 }
 get(sql, params = []) { return this.all(sql, params)[0]; }
 run(sql, params = []) { this.db.run(sql, params); return this.db.exec('SELECT last_insert_rowid()')[0].values[0][0]; }
 validate(db) {
  const scalar = sql => db.exec(sql)[0]?.values?.[0]?.[0];
  assert(scalar('PRAGMA integrity_check') === 'ok', 'El archivo SQLite está dañado.');
  assert(scalar('PRAGMA application_id') === 1296516944, 'El archivo no es un respaldo de METales-GV Pro.');
  assert(scalar("SELECT value FROM meta WHERE key='schema'") === '1', 'Versión de base de datos no compatible.');
  assert(!db.exec('PRAGMA foreign_key_check').length, 'El respaldo contiene referencias incompletas.');
  for (const table of ['settings','users','materials','contacts','shifts','transactions','transaction_items','stock_moves','cash_moves','audit','legacy_imports']) db.exec(`SELECT * FROM ${table} LIMIT 0`);
  assert(!db.exec("SELECT name FROM sqlite_master WHERE type IN ('trigger','view')").length, 'El respaldo contiene objetos no permitidos.');
 }
 transaction(fn) {
  const before = this.db.export(); this.db.run('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');
  let committed = false;
  try {
   const result = fn(); assert(!result?.then, 'La transacción debe ser síncrona.');
   this.db.run('COMMIT'); committed = true;
   atomicWrite(this.file, this.db.export()); this.db.run('PRAGMA foreign_keys=ON'); return result;
  } catch (e) {
   if (!committed) { try { this.db.run('ROLLBACK'); } catch {} }
   else { this.db.close(); this.db = new this.SQL.Database(before); }
   this.db.run('PRAGMA foreign_keys=ON'); throw e;
  }
 }
 business() { return { ...defaultBusiness, ...JSON.parse(this.get("SELECT value FROM settings WHERE key='business'").value) }; }
 audit(user, action, detail) { this.run('INSERT INTO audit(date,user_name,action,detail) VALUES(?,?,?,?)', [new Date().toISOString(), user?.name || 'Sistema', action, String(detail)]); }
 snapshot() { return Buffer.from(this.db.export()); }
 backup(label = 'manual') {
  const dir = path.join(this.directory, 'backups'); fs.mkdirSync(dir, { recursive: true });
  const name = `${new Date().toISOString().replace(/[:.]/g, '-')}-${label}.sqlite`;
  atomicWrite(path.join(dir, name), this.snapshot()); return name;
 }
 restore(bytes) {
  let candidate;
  try { candidate = new this.SQL.Database(bytes); this.validate(candidate); assert(candidate.exec('SELECT COUNT(*) FROM users WHERE active=1 AND role=\'admin\'')[0].values[0][0] > 0, 'El respaldo debe contener un administrador activo.'); }
  catch (e) { candidate?.close(); throw e instanceof AppError ? e : new AppError('El archivo no es un respaldo SQLite válido de METales-GV Pro.'); }
  const previous = this.backup('antes-restaurar');
  try { atomicWrite(this.file, Buffer.from(candidate.export())); } catch (e) { candidate.close(); throw e; }
  this.db.close(); this.db = candidate; this.db.run('PRAGMA foreign_keys=ON'); return previous;
 }
 close() { if (!this.db) return; this.db.close(); this.db = null; fs.rmSync(this.lock, { recursive: true, force: true }); }
}
module.exports = { Store, atomicWrite, defaultBusiness };
