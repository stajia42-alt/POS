import type { Database, SqlDriver } from '../db/database';
import type { AccessControl } from './access';
import type { Actor } from './access-types';
import { integer } from './money';
import { audit, newId, textRequired, timestamp } from './shared';

export interface StockProduct {
  id: string;
  name: string;
  sku: string;
  category_id: string | null;
  stock: number;
  cost: number;
  low_stock: number;
  track_stock: number;
  active: number;
  unit: string;
}
export type StockKind = 'receipt' | 'issue' | 'adjustment' | 'count';
export const STOCK_KIND_LABELS: Record<string, string> = {
  initial: 'Existencia inicial',
  receipt: 'Entrada',
  issue: 'Salida',
  adjustment: 'Ajuste',
  count: 'Conteo físico',
  sale: 'Venta',
  return: 'Devolución',
  legacy: 'Registro anterior',
};
export interface StockMovement {
  id: string;
  product_id: string;
  product_name: string;
  sale_id: string | null;
  quantity: number;
  reason: string;
  created_at: string;
  before_stock: number | null;
  after_stock: number | null;
  actor_id: string | null;
  actor_name: string;
  kind: string;
  unit_cost: number | null;
}

export async function recordStock(
  sql: SqlDriver,
  actor: Actor,
  product: Pick<StockProduct, 'id' | 'stock' | 'cost'>,
  change: number,
  kind: string,
  reason: string,
  options: { saleId?: string; cost?: number; updateCost?: number } = {},
) {
  integer(product.stock, 0, 999999);
  integer(change, -999999, 999999);
  const after = integer(product.stock + change, 0, 999999);
  const movementId = newId();
  if (options.updateCost !== undefined) integer(options.updateCost);
  await sql.run('UPDATE products SET stock=?,cost=? WHERE id=?', [
    after,
    options.updateCost ?? product.cost,
    product.id,
  ]);
  await sql.run(
    `INSERT INTO inventory_movements(id,product_id,sale_id,quantity,reason,created_at,before_stock,after_stock,actor_id,actor_name,kind,unit_cost)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      movementId,
      product.id,
      options.saleId || null,
      change,
      reason,
      timestamp(),
      product.stock,
      after,
      actor.id,
      actor.name,
      kind,
      options.cost ?? null,
    ],
  );
  return { id: movementId, before: product.stock, after };
}

export class Inventory {
  constructor(
    private readonly db: Database,
    private readonly access: AccessControl,
  ) {}
  snapshot(filter: { productId?: string; from?: string; to?: string; page?: number } = {}) {
    const page = integer(filter.page || 0, 0, 1_000_000);
    for (const date of [filter.from, filter.to])
      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Fecha no válida.');
    if (filter.from && filter.to && filter.from > filter.to)
      throw new Error('La fecha inicial no puede ser posterior a la final.');
    return this.db.read(async (sql) => {
      const actor = await this.access.require(sql);
      if (!actor.permissions.includes('inventory') && !actor.permissions.includes('reports'))
        throw new Error('Sin permiso para consultar inventario.');
      const products = await sql.query<StockProduct>(
        'SELECT id,name,sku,category_id,stock,cost,low_stock,track_stock,active,unit FROM products ORDER BY name COLLATE NOCASE',
      );
      const values: (string | number)[] = [];
      const where: string[] = [];
      if (filter.productId) {
        where.push('m.product_id=?');
        values.push(filter.productId);
      }
      if (filter.from) {
        where.push('m.created_at>=?');
        values.push(new Date(`${filter.from}T00:00:00`).toISOString());
      }
      if (filter.to) {
        const end = new Date(`${filter.to}T00:00:00`);
        end.setDate(end.getDate() + 1);
        where.push('m.created_at<?');
        values.push(end.toISOString());
      }
      const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const [{ count }] = await sql.query<{ count: number }>(
        `SELECT COUNT(*) AS count FROM inventory_movements m ${clause}`,
        values,
      );
      const movements = await sql.query<StockMovement>(
        `SELECT m.*,p.name AS product_name FROM inventory_movements m JOIN products p ON p.id=m.product_id ${clause} ORDER BY m.rowid DESC LIMIT 50 OFFSET ?`,
        [...values, page * 50],
      );
      const tracked = products.filter((product) => product.track_stock && product.active);
      const valuation = tracked.reduce((sum, product) => sum + product.stock * product.cost, 0);
      if (!Number.isSafeInteger(valuation))
        throw new Error('La valoración excede el rango de cálculo preciso.');
      return {
        products,
        movements,
        totalMovements: count,
        page,
        valuation,
        lowStock: tracked.filter((product) => product.stock <= product.low_stock),
      };
    });
  }
  move(input: {
    productId: string;
    kind: StockKind;
    quantity: number;
    reason: string;
    unitCost?: number;
  }) {
    const reason = textRequired(input.reason, 'el motivo del movimiento', 500);
    if (!['receipt', 'issue', 'adjustment', 'count'].includes(input.kind))
      throw new Error('Tipo de movimiento no válido.');
    integer(
      input.quantity,
      input.kind === 'adjustment' ? -999999 : input.kind === 'count' ? 0 : 1,
      999999,
    );
    if (input.kind === 'adjustment' && input.quantity === 0)
      throw new Error('El ajuste debe cambiar la existencia; para verificarla usa Conteo físico.');
    if (input.unitCost !== undefined) integer(input.unitCost);
    return this.db.transaction(async (sql) => {
      const actor = await this.access.require(sql, 'inventory');
      const [product] = await sql.query<StockProduct>(
        'SELECT id,stock,cost,track_stock FROM products WHERE id=?',
        [input.productId],
      );
      if (!product || !product.track_stock)
        throw new Error('El producto debe tener control de inventario activo.');
      const delta =
        input.kind === 'issue'
          ? -input.quantity
          : input.kind === 'count'
            ? input.quantity - product.stock
            : input.quantity;
      if (product.stock + delta < 0)
        throw new Error('La salida supera las existencias disponibles.');
      let weightedCost: number | undefined;
      if (input.kind === 'receipt' && input.unitCost !== undefined) {
        const units = product.stock + delta;
        weightedCost = Math.floor(
          (2 * (product.stock * product.cost + delta * input.unitCost) + units) / (2 * units),
        );
      }
      const movement = await recordStock(sql, actor, product, delta, input.kind, reason, {
        cost: input.kind === 'receipt' ? input.unitCost : undefined,
        updateCost: weightedCost,
      });
      if (input.kind === 'count')
        await sql.run(
          'INSERT INTO inventory_counts(id,product_id,expected,counted,actor_id,actor_name,reason,movement_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
          [
            newId(),
            input.productId,
            product.stock,
            input.quantity,
            actor.id,
            actor.name,
            reason,
            movement.id,
            timestamp(),
          ],
        );
      await audit(sql, actor, `inventory.${input.kind}`, movement.id, {
        productId: input.productId,
        quantity: delta,
        before: product.stock,
        after: movement.after,
      });
      return movement;
    });
  }
}
