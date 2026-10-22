'use strict';
module.exports=db=>{
 if(db.prepare('SELECT COUNT(*) n FROM shifts WHERE closed_at IS NULL').get().n>1)throw Error('La base contiene varios turnos abiertos. Se conserva el respaldo previo; concilia esos turnos antes de migrar.');
 const add=(table,name,definition)=>{if(!db.prepare('PRAGMA table_info('+table+')').all().some(x=>x.name===name))db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);};
 for(const [n,d] of [['client_id','INTEGER'],['benefit_snapshot','TEXT'],['lost_cents','INTEGER NOT NULL DEFAULT 0'],['lost_at','TEXT'],['cancelled_at','TEXT'],['cancel_reason','TEXT'],['revision','INTEGER NOT NULL DEFAULT 0'],['last_payment_at','TEXT']])add('tickets',n,d);
 add('shifts','opening_usd_cents','INTEGER NOT NULL DEFAULT 0');add('shifts','user_id','INTEGER');add('shifts','closed_by','INTEGER');
 add('cash_movements','currency',"TEXT NOT NULL DEFAULT 'MXN'");add('cash_movements','user_id','INTEGER');add('payments','user_id','INTEGER');
 add('payments','rate_units','INTEGER');add('audit','user_id','INTEGER');
 db.exec(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,username TEXT NOT NULL UNIQUE COLLATE NOCASE,password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','supervisor','cashier')),active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),expires_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS requests(key TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,response TEXT NOT NULL,created_at TEXT NOT NULL,user_id INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS clients(id INTEGER PRIMARY KEY,name TEXT NOT NULL,plate TEXT NOT NULL UNIQUE,kind TEXT NOT NULL,discount_bps INTEGER NOT NULL DEFAULT 0,valid_from TEXT NOT NULL,valid_to TEXT NOT NULL,window_start TEXT NOT NULL,window_end TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,notes TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS payment_adjustments(id INTEGER PRIMARY KEY,ticket_id INTEGER,client_id INTEGER,amount_cents INTEGER NOT NULL,method TEXT NOT NULL,paid_at TEXT NOT NULL,received_cents INTEGER NOT NULL DEFAULT 0,change_cents INTEGER NOT NULL DEFAULT 0,shift_id INTEGER NOT NULL,received_usd_cents INTEGER NOT NULL DEFAULT 0,usd_rate_used REAL,rate_units INTEGER,change_mxn_cents INTEGER NOT NULL DEFAULT 0,user_id INTEGER NOT NULL,kind TEXT NOT NULL,detail TEXT);
 CREATE INDEX IF NOT EXISTS idx_adjustments_shift ON payment_adjustments(shift_id);
 CREATE UNIQUE INDEX IF NOT EXISTS idx_one_open_shift ON shifts((1)) WHERE closed_at IS NULL;
 CREATE INDEX IF NOT EXISTS idx_tickets_inside ON tickets(exit_at,cancelled_at);
 CREATE VIEW IF NOT EXISTS all_payments AS
 SELECT 'payment' source,id,ticket_id,NULL client_id,amount_cents,method,paid_at,COALESCE(received_cents,CASE WHEN method='efectivo' THEN amount_cents ELSE 0 END) received_cents,COALESCE(change_cents,0) change_cents,shift_id,received_usd_cents,usd_rate_used,rate_units,CASE WHEN method='usd' THEN COALESCE(change_mxn_cents,change_cents,0) ELSE COALESCE(change_cents,0) END change_mxn_cents,user_id,'stay' kind FROM payments
 UNION ALL SELECT 'adjustment',id,ticket_id,client_id,amount_cents,method,paid_at,received_cents,change_cents,shift_id,received_usd_cents,usd_rate_used,rate_units,change_mxn_cents,user_id,kind FROM payment_adjustments;
 CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL);`);
 db.prepare('INSERT OR IGNORE INTO schema_migrations VALUES(2,?)').run(new Date().toISOString());
};
