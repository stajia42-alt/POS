'use strict';
module.exports = db => {
 db.exec(`CREATE TABLE IF NOT EXISTS shift_handoffs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_shift_id INTEGER NOT NULL REFERENCES shifts(id),
  ticket_id INTEGER NOT NULL REFERENCES tickets(id),
  code TEXT NOT NULL,
  entry_at TEXT NOT NULL,
  entry_shift_id INTEGER REFERENCES shifts(id),
  handed_at TEXT NOT NULL,
  UNIQUE(from_shift_id, ticket_id)
 );
 CREATE INDEX IF NOT EXISTS idx_handoffs_from ON shift_handoffs(from_shift_id);
 CREATE INDEX IF NOT EXISTS idx_handoffs_ticket ON shift_handoffs(ticket_id);`);
 db.prepare('INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(5,?)').run(new Date().toISOString());
};
