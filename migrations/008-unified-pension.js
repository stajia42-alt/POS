'use strict';
// RC10: individual pension coverage and excess amount. Old clients and tickets
// are left unchanged until the supervisor explicitly edits the client.
module.exports=db=>{
 const columns=db.prepare('PRAGMA table_info(clients)').all().map(c=>c.name);
 if(!columns.includes('pension_hours'))db.exec('ALTER TABLE clients ADD COLUMN pension_hours INTEGER NOT NULL DEFAULT 24 CHECK(pension_hours IN (12,24))');
 if(!columns.includes('pension_excess_cents'))db.exec('ALTER TABLE clients ADD COLUMN pension_excess_cents INTEGER NOT NULL DEFAULT 0 CHECK(pension_excess_cents >= 0)');
 db.prepare('INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(8,?)').run(new Date().toISOString());
};
