'use strict';
module.exports=db=>{
 const cols=db.prepare('PRAGMA table_info(clients)').all().map(c=>c.name);
 if(!cols.includes('client_code'))db.exec('ALTER TABLE clients ADD COLUMN client_code TEXT');
 if(!db.prepare("PRAGMA table_info(tickets)").all().some(x=>x.name==='print_snapshot'))db.exec('ALTER TABLE tickets ADD COLUMN print_snapshot TEXT');
 if(!db.prepare("PRAGMA table_info(shifts)").all().some(x=>x.name==='denomination_detail'))db.exec('ALTER TABLE shifts ADD COLUMN denomination_detail TEXT');
 db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_code ON clients(client_code COLLATE NOCASE) WHERE client_code IS NOT NULL;
 CREATE TABLE IF NOT EXISTS print_attempts(id INTEGER PRIMARY KEY,ticket_id INTEGER NOT NULL,printed INTEGER NOT NULL,created_at TEXT NOT NULL,error_message TEXT);
 CREATE INDEX IF NOT EXISTS idx_print_attempts_ticket ON print_attempts(ticket_id);`);
 db.prepare('INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(3,?)').run(new Date().toISOString());
};
