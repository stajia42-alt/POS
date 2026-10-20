import type { SqlDriver } from '../db/database';
import type { Business, Sale, SaleLine } from './types';
import { totals } from './money';
import { newId as id, timestamp as now } from './shared';

export async function business(sql: SqlDriver): Promise<Business> {
  const [row] = await sql.query<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'business'",
  );
  return {
    ...JSON.parse(row.value),
    cashManagement: true,
    operationMode: JSON.parse(row.value).operationMode || 'both',
  } as Business;
}

export async function setting(sql: SqlDriver, key: string, value: string) {
  await sql.run(
    'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
    [key, value],
  );
}

export async function saleById(sql: SqlDriver, saleId: string): Promise<Sale> {
  const [sale] = await sql.query<Sale>('SELECT * FROM sales WHERE id = ?', [saleId]);
  if (!sale) throw new Error('El ticket ya no está disponible.');
  return sale;
}

export async function editable(sql: SqlDriver, saleId: string) {
  const sale = await saleById(sql, saleId);
  if (sale.status !== 'draft') throw new Error('Este ticket no está abierto para edición.');
  return sale;
}

export async function linesFor(sql: SqlDriver, saleId: string) {
  return sql.query<SaleLine>('SELECT * FROM sale_lines WHERE sale_id = ? ORDER BY rowid', [saleId]);
}

export async function recalculate(sql: SqlDriver, saleId: string) {
  const sale = await saleById(sql, saleId);
  const t = totals(await linesFor(sql, saleId), sale.discount_bps, sale.tax_bps);
  await sql.run(
    'UPDATE sales SET subtotal=?, discount=?, tax=?, total=?, updated_at=? WHERE id=?',
    [t.subtotal, t.discount, t.tax, t.total, now(), saleId],
  );
}

export async function newDraft(sql: SqlDriver, employeeId?: string, quick = true) {
  await pauseCurrent(sql);
  const b = await business(sql);
  const saleId = id();
  const [{ next }] = await sql.query<{ next: number }>(
    'SELECT COALESCE(MAX(number), 0) + 1 AS next FROM sales',
  );
  const date = now();
  await sql.run(
    `INSERT INTO sales(id,number,status,tax_bps,business_name,business_address,business_phone,created_at,updated_at)
    VALUES(?,?,'draft',?,?,?,?,?,?)`,
    [saleId, next, b.taxBps, b.name, b.address, b.phone, date, date],
  );
  await setting(sql, 'activeSale', saleId);
  if (employeeId) await rememberActive(sql, employeeId, saleId, quick);
  return saleId;
}

export async function pauseCurrent(sql: SqlDriver) {
  const [active] = await sql.query<{ value: string }>(
    "SELECT value FROM settings WHERE key='activeSale'",
  );
  if (!active) return;
  const old = await saleById(sql, active.value);
  if (old.status !== 'draft') return;
  const table =
    (
      await sql.query('SELECT id FROM table_sessions WHERE sale_id=? AND closed_at IS NULL', [
        old.id,
      ])
    ).length > 0;
  const hasLines = (await linesFor(sql, old.id)).length > 0;
  await sql.run('UPDATE sales SET status=?,updated_at=? WHERE id=?', [
    table || hasLines ? 'parked' : 'cancelled',
    now(),
    old.id,
  ]);
}
export async function rememberActive(
  sql: SqlDriver,
  employeeId: string,
  saleId: string,
  quick?: boolean,
) {
  const isQuick =
    quick ??
    !(
      await sql.query('SELECT id FROM table_sessions WHERE sale_id=? AND closed_at IS NULL', [
        saleId,
      ])
    ).length;
  await sql.run(
    `INSERT INTO employee_workspace(employee_id,active_sale_id,quick_sale_id) VALUES(?,?,?)
    ON CONFLICT(employee_id) DO UPDATE SET active_sale_id=excluded.active_sale_id,quick_sale_id=CASE WHEN ? THEN excluded.active_sale_id ELSE employee_workspace.quick_sale_id END`,
    [employeeId, saleId, isQuick ? saleId : null, isQuick ? 1 : 0],
  );
}
export async function activateSale(sql: SqlDriver, employeeId: string, saleId: string) {
  const selected = await saleById(sql, saleId);
  if (!['draft', 'parked'].includes(selected.status)) throw new Error('La cuenta ya está cerrada.');
  const [active] = await sql.query<{ value: string }>(
    "SELECT value FROM settings WHERE key='activeSale'",
  );
  if (active?.value !== saleId) await pauseCurrent(sql);
  await sql.run("UPDATE sales SET status='draft',updated_at=? WHERE id=?", [now(), saleId]);
  await setting(sql, 'activeSale', saleId);
  await rememberActive(sql, employeeId, saleId);
}
