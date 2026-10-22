'use strict';
module.exports=db=>{
 const add=(table,name,definition)=>{if(!db.prepare('PRAGMA table_info('+table+')').all().some(x=>x.name===name))db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);};
 add('shifts','shift_type',"TEXT NOT NULL DEFAULT 'LEGACY'");
 add('tickets','entry_shift_id','INTEGER');
 db.exec(`CREATE TABLE IF NOT EXISTS shift_settlements (
 id INTEGER PRIMARY KEY AUTOINCREMENT, origin_shift_id INTEGER NOT NULL REFERENCES shifts(id),
 collecting_shift_id INTEGER NOT NULL REFERENCES shifts(id), amount_cents INTEGER NOT NULL CHECK(amount_cents > 0), currency TEXT NOT NULL DEFAULT 'MXN' CHECK(currency IN ('MXN','USD')),
 cash_movement_id INTEGER NOT NULL UNIQUE REFERENCES cash_movements(id),
 created_at TEXT NOT NULL, user_id INTEGER NOT NULL REFERENCES users(id),
 CHECK(origin_shift_id <> collecting_shift_id));
 CREATE INDEX IF NOT EXISTS idx_ticket_entry_shift ON tickets(entry_shift_id);
 CREATE INDEX IF NOT EXISTS idx_settlements_source ON shift_settlements(origin_shift_id,collecting_shift_id);`);
 // Preserve historical records; only new entries receive ownership automatically.
 db.prepare('INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(4,?)').run(new Date().toISOString());
};
