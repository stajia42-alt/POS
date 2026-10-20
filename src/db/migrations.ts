import type { Database } from './database';

export const SCHEMA_VERSION = 3;
const migration1 = [
  `CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE, color TEXT NOT NULL)`,
  `CREATE TABLE products (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, sku TEXT NOT NULL DEFAULT '', barcode TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '', category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    price INTEGER NOT NULL CHECK(price >= 0), cost INTEGER NOT NULL DEFAULT 0 CHECK(cost >= 0), photo TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), favorite INTEGER NOT NULL DEFAULT 0 CHECK(favorite IN (0,1)),
    track_stock INTEGER NOT NULL DEFAULT 0 CHECK(track_stock IN (0,1)), stock INTEGER NOT NULL DEFAULT 0,
    unit TEXT NOT NULL DEFAULT 'pieza')`,
  `CREATE UNIQUE INDEX products_sku ON products(sku) WHERE sku <> ''`,
  `CREATE UNIQUE INDEX products_barcode ON products(barcode) WHERE barcode <> ''`,
  `CREATE INDEX products_category ON products(category_id, active)`,
  `CREATE TABLE customers (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '')`,
  `CREATE TABLE sales (
    id TEXT PRIMARY KEY, number INTEGER NOT NULL UNIQUE, status TEXT NOT NULL CHECK(status IN ('draft','parked','paid','cancelled')),
    label TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', customer_id TEXT REFERENCES customers(id), customer_name TEXT NOT NULL DEFAULT '',
    discount_bps INTEGER NOT NULL DEFAULT 0 CHECK(discount_bps BETWEEN 0 AND 10000), tax_bps INTEGER NOT NULL DEFAULT 0 CHECK(tax_bps BETWEEN 0 AND 10000),
    subtotal INTEGER NOT NULL DEFAULT 0, discount INTEGER NOT NULL DEFAULT 0, tax INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0,
    business_name TEXT NOT NULL, business_address TEXT NOT NULL DEFAULT '', business_phone TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, paid_at TEXT)`,
  `CREATE INDEX sales_status_date ON sales(status, updated_at)`,
  `CREATE TABLE sale_lines (
    id TEXT PRIMARY KEY, sale_id TEXT NOT NULL REFERENCES sales(id), product_id TEXT NOT NULL REFERENCES products(id),
    name TEXT NOT NULL, unit_price INTEGER NOT NULL CHECK(unit_price >= 0), quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 9999), note TEXT NOT NULL DEFAULT '')`,
  `CREATE INDEX lines_sale ON sale_lines(sale_id)`,
  `CREATE TABLE payments (
    id TEXT PRIMARY KEY, sale_id TEXT NOT NULL UNIQUE REFERENCES sales(id), method TEXT NOT NULL CHECK(method = 'cash'),
    amount INTEGER NOT NULL CHECK(amount >= 0), tendered INTEGER NOT NULL, change_amount INTEGER NOT NULL CHECK(change_amount >= 0), created_at TEXT NOT NULL)`,
  `CREATE TABLE inventory_movements (
    id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id), sale_id TEXT REFERENCES sales(id),
    quantity INTEGER NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(sale_id, product_id))`,
  `CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `INSERT INTO settings (key,value) VALUES ('business', '{"name":"Mi negocio","address":"","phone":"","taxBps":0,"receiptFooter":"Gracias por tu compra"}'), ('view','grid')`,
];

// Preserve every original cash payment while changing the one-payment restriction.
// SQLite schema and data changes share the migration transaction; no database is reset.
const migration2 = [
  `ALTER TABLE payments RENAME TO payments_v1`,
  `CREATE TABLE payments (
    id TEXT PRIMARY KEY, sale_id TEXT NOT NULL REFERENCES sales(id),
    position INTEGER NOT NULL CHECK(position BETWEEN 0 AND 9),
    method TEXT NOT NULL CHECK(method IN ('cash','card','transfer','other')),
    amount INTEGER NOT NULL CHECK(amount >= 0), tendered INTEGER NOT NULL CHECK(tendered >= amount),
    change_amount INTEGER NOT NULL CHECK(change_amount = tendered - amount),
    reference TEXT NOT NULL DEFAULT '' CHECK(length(reference) <= 120), created_at TEXT NOT NULL,
    UNIQUE(sale_id, position), CHECK(method = 'cash' OR change_amount = 0))`,
  `INSERT INTO payments(id,sale_id,position,method,amount,tendered,change_amount,reference,created_at)
    SELECT id,sale_id,0,method,amount,tendered,change_amount,'',created_at FROM payments_v1`,
  `DROP TABLE payments_v1`,
];
const migration3 = [
  `CREATE TABLE employees (id TEXT PRIMARY KEY, name TEXT NOT NULL, identifier TEXT NOT NULL UNIQUE COLLATE NOCASE,
    role TEXT NOT NULL CHECK(role IN ('admin','supervisor','cashier')), active INTEGER NOT NULL CHECK(active IN (0,1)),
    pin_hash TEXT NOT NULL, salt TEXT NOT NULL, iterations INTEGER NOT NULL, failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT, created_at TEXT NOT NULL)`,
  `CREATE TABLE employee_permissions (employee_id TEXT NOT NULL REFERENCES employees(id), permission TEXT NOT NULL,
    allowed INTEGER NOT NULL CHECK(allowed IN (0,1)), PRIMARY KEY(employee_id,permission))`,
  `CREATE TABLE administrative_actions (id TEXT PRIMARY KEY, actor_id TEXT REFERENCES employees(id), actor_name TEXT NOT NULL,
    action TEXT NOT NULL, target TEXT NOT NULL, details TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL)`,
  `CREATE TABLE shifts (id TEXT PRIMARY KEY, status TEXT NOT NULL CHECK(status IN ('open','closed')), opening INTEGER NOT NULL CHECK(opening>=0),
    opened_by TEXT NOT NULL REFERENCES employees(id), opened_name TEXT NOT NULL, opened_at TEXT NOT NULL,
    closed_by TEXT REFERENCES employees(id), closed_name TEXT, closed_at TEXT, expected INTEGER, counted INTEGER, difference INTEGER)`,
  `CREATE UNIQUE INDEX one_open_shift ON shifts(status) WHERE status='open'`,
  `CREATE TABLE cash_movements (id TEXT PRIMARY KEY, shift_id TEXT NOT NULL REFERENCES shifts(id), employee_id TEXT NOT NULL REFERENCES employees(id),
    employee_name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('in','out','withdrawal')), amount INTEGER NOT NULL CHECK(amount>0),
    reason TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE INDEX cash_movements_shift ON cash_movements(shift_id,created_at)`,
  `ALTER TABLE sales ADD COLUMN employee_id TEXT REFERENCES employees(id)`,
  `ALTER TABLE sales ADD COLUMN employee_name TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE sales ADD COLUMN shift_id TEXT REFERENCES shifts(id)`,
  `CREATE INDEX sales_shift ON sales(shift_id,status)`,
  `ALTER TABLE products ADD COLUMN low_stock INTEGER NOT NULL DEFAULT 0 CHECK(low_stock>=0)`,
  `ALTER TABLE inventory_movements ADD COLUMN before_stock INTEGER`,
  `ALTER TABLE inventory_movements ADD COLUMN after_stock INTEGER`,
  `ALTER TABLE inventory_movements ADD COLUMN actor_id TEXT REFERENCES employees(id)`,
  `ALTER TABLE inventory_movements ADD COLUMN actor_name TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE inventory_movements ADD COLUMN kind TEXT NOT NULL DEFAULT 'legacy'`,
  `ALTER TABLE inventory_movements ADD COLUMN unit_cost INTEGER`,
  `CREATE INDEX inventory_product_date ON inventory_movements(product_id,created_at)`,
  `CREATE TABLE inventory_counts (id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id), expected INTEGER NOT NULL,
    counted INTEGER NOT NULL CHECK(counted>=0), actor_id TEXT NOT NULL REFERENCES employees(id), actor_name TEXT NOT NULL,
    reason TEXT NOT NULL, movement_id TEXT NOT NULL REFERENCES inventory_movements(id), created_at TEXT NOT NULL)`,
];
const migrations = [migration1, migration2, migration3];

export async function migrate(db: Database, targetVersion = SCHEMA_VERSION): Promise<void> {
  if (!Number.isInteger(targetVersion) || targetVersion < 1 || targetVersion > SCHEMA_VERSION)
    throw new Error('Versión de migración no válida.');
  await db.transaction(async (sql) => {
    const [{ user_version: version }] = await sql.query<{ user_version: number }>(
      'PRAGMA user_version',
    );
    if (version > targetVersion)
      throw new Error(
        'Esta base de datos pertenece a una versión más reciente. Actualiza AVILES POS.',
      );
    for (let next = version + 1; next <= targetVersion; next++) {
      for (const statement of migrations[next - 1]) await sql.run(statement);
      await sql.run(`PRAGMA user_version = ${next}`);
    }
  });
}
