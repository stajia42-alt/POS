'use strict';
// Los adeudos anteriores no se reescriben: cada cargo nuevo tiene su propio ID
// y fecha. Los abonos se distribuyen una sola vez mediante la tabla de asignaciones.
module.exports=db=>{
 const cols=db.prepare('PRAGMA table_info(clients)').all().map(x=>x.name);
 if(!cols.includes('pension_weekly_unlimited'))db.exec('ALTER TABLE clients ADD COLUMN pension_weekly_unlimited INTEGER NOT NULL DEFAULT 0 CHECK(pension_weekly_unlimited IN (0,1))');
 db.exec(`CREATE TABLE IF NOT EXISTS pension_manual_debts(
  id INTEGER PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  effective_at TEXT NOT NULL,
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 3 AND 250),
  created_at TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id)
 );
 CREATE INDEX IF NOT EXISTS idx_manual_debt_client_date ON pension_manual_debts(client_id,effective_at,id);
 CREATE TABLE IF NOT EXISTS pension_manual_allocations(
  id INTEGER PRIMARY KEY,
  manual_debt_id INTEGER NOT NULL REFERENCES pension_manual_debts(id),
  adjustment_id INTEGER NOT NULL REFERENCES payment_adjustments(id),
  amount_cents INTEGER NOT NULL CHECK(amount_cents>0),
  UNIQUE(manual_debt_id,adjustment_id)
 );
 CREATE INDEX IF NOT EXISTS idx_manual_allocation_debt ON pension_manual_allocations(manual_debt_id);
 INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(9,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
 `);
};
