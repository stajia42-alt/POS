'use strict';
// Adds configurable day-pass price per client, without changing prior tickets,
// invoices or pension payments. The opening balance uses existing pension_charges.
module.exports=db=>{
 const cols=db.prepare('PRAGMA table_info(clients)').all().map(x=>x.name);
 if(!cols.includes('daily_price_cents'))db.exec('ALTER TABLE clients ADD COLUMN daily_price_cents INTEGER NOT NULL DEFAULT 10000 CHECK(daily_price_cents > 0)');
 db.prepare('INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(7,?)').run(new Date().toISOString());
};
