'use strict';
// No cambia los cobros historicos ni activa cargos automaticamente en pensiones antiguas.
// Cada pension existente se convierte explicitamente desde Clientes y pensiones.
module.exports=db=>{
 db.exec(`CREATE TABLE IF NOT EXISTS pension_contracts (
   client_id INTEGER PRIMARY KEY REFERENCES clients(id),
   anchor_at TEXT NOT NULL,
   period TEXT NOT NULL CHECK(period IN ('weekly','monthly')),
   price_cents INTEGER NOT NULL CHECK(price_cents > 0),
   next_index INTEGER NOT NULL DEFAULT 0,
   pending_period TEXT CHECK(pending_period IN ('weekly','monthly') OR pending_period IS NULL),
   pending_price_cents INTEGER CHECK(pending_price_cents > 0 OR pending_price_cents IS NULL),
   stopped_at TEXT,
   created_at TEXT NOT NULL,
   updated_at TEXT NOT NULL
 );
 CREATE TABLE IF NOT EXISTS pension_charges (
   id INTEGER PRIMARY KEY,
   client_id INTEGER NOT NULL REFERENCES clients(id),
   period_start TEXT NOT NULL,
   period_end TEXT NOT NULL,
   period TEXT NOT NULL,
   amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
   created_at TEXT NOT NULL,
   UNIQUE(client_id,period_start)
 );
 CREATE INDEX IF NOT EXISTS idx_pension_charges_client ON pension_charges(client_id,period_start);
 CREATE TABLE IF NOT EXISTS pension_allocations (
   id INTEGER PRIMARY KEY,
   charge_id INTEGER NOT NULL REFERENCES pension_charges(id),
   adjustment_id INTEGER NOT NULL REFERENCES payment_adjustments(id),
   amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
   UNIQUE(charge_id,adjustment_id)
 );
 CREATE INDEX IF NOT EXISTS idx_pension_allocations_charge ON pension_allocations(charge_id);
 INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(6,strftime('%Y-%m-%dT%H:%M:%fZ','now'));`);
};
