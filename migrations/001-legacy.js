'use strict';
module.exports = db => {
db.exec(`CREATE TABLE IF NOT EXISTS config(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tickets(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT UNIQUE NOT NULL,plate TEXT,entry_at TEXT NOT NULL,exit_at TEXT,charged_cents INTEGER,paid_at TEXT,rate_snapshot TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY AUTOINCREMENT,ticket_id INTEGER UNIQUE NOT NULL,amount_cents INTEGER NOT NULL,method TEXT NOT NULL DEFAULT 'efectivo',paid_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,ticket_id INTEGER,action TEXT NOT NULL,at TEXT NOT NULL,detail TEXT);`);
// Migración no destructiva: pagos y cortes sobre la base existente.
for(const [col,definition] of [['received_cents','INTEGER'],['change_cents','INTEGER'],['shift_id','INTEGER']]){
 if(!db.prepare('PRAGMA table_info(payments)').all().some(x=>x.name===col))db.exec(`ALTER TABLE payments ADD COLUMN ${col} ${definition}`);
}
db.exec(`CREATE TABLE IF NOT EXISTS shifts(id INTEGER PRIMARY KEY AUTOINCREMENT,opened_at TEXT NOT NULL,opening_cents INTEGER NOT NULL DEFAULT 0,closed_at TEXT,declared_cents INTEGER,expected_cents INTEGER,notes TEXT);
CREATE INDEX IF NOT EXISTS idx_payments_shift ON payments(shift_id);`);
if(!db.prepare('PRAGMA table_info(shifts)').all().some(x=>x.name==='usd_rate'))db.exec('ALTER TABLE shifts ADD COLUMN usd_rate REAL');
for(const [col,def] of [['received_usd_cents','INTEGER NOT NULL DEFAULT 0'],['usd_rate_used','REAL'],['change_mxn_cents','INTEGER NOT NULL DEFAULT 0']]){if(!db.prepare('PRAGMA table_info(payments)').all().some(x=>x.name===col))db.exec(`ALTER TABLE payments ADD COLUMN ${col} ${def}`)}
db.exec('CREATE TABLE IF NOT EXISTS exchange_rate_changes(id INTEGER PRIMARY KEY AUTOINCREMENT,shift_id INTEGER NOT NULL,old_rate REAL,new_rate REAL NOT NULL,changed_at TEXT NOT NULL)');
db.exec(`CREATE TABLE IF NOT EXISTS cash_movements(id INTEGER PRIMARY KEY AUTOINCREMENT,shift_id INTEGER NOT NULL,kind TEXT NOT NULL,amount_cents INTEGER NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL); CREATE INDEX IF NOT EXISTS idx_cash_movements_shift ON cash_movements(shift_id);`);
db.exec(`CREATE TABLE IF NOT EXISTS reprints(id INTEGER PRIMARY KEY AUTOINCREMENT,ticket_id INTEGER NOT NULL,created_at TEXT NOT NULL,kind TEXT NOT NULL DEFAULT 'entry'); CREATE TABLE IF NOT EXISTS shift_prints(id INTEGER PRIMARY KEY AUTOINCREMENT,shift_id INTEGER NOT NULL,kind TEXT NOT NULL,printed_at TEXT NOT NULL);`);
for(const [col,def] of [['declared_usd_cents','INTEGER'],['expected_usd_cents','INTEGER']]){if(!db.prepare('PRAGMA table_info(shifts)').all().some(x=>x.name===col))db.exec(`ALTER TABLE shifts ADD COLUMN ${col} ${def}`)}

};
