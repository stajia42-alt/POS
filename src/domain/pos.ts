import type { Database, SqlDriver } from '../db/database';
import { integer, totals } from './money';
import { preparePayments } from './payments';
import { AccessControl } from './access';
import { Inventory, recordStock } from './inventory';
import { Cash, checkoutShift } from './cash';
import { audit } from './shared';
import type {
  Business,
  Category,
  Customer,
  Payment,
  PaymentRequest,
  Product,
  Receipt,
  Sale,
  SaleLine,
  Snapshot,
} from './types';

const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const clean = (value: string, max = 120) => value.trim().slice(0, max);
const required = (value: string, label: string) => {
  const result = clean(value);
  if (!result) throw new Error(`Escribe ${label}.`);
  return result;
};

async function business(sql: SqlDriver): Promise<Business> {
  const [row] = await sql.query<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'business'",
  );
  return JSON.parse(row.value) as Business;
}

async function setting(sql: SqlDriver, key: string, value: string) {
  await sql.run(
    'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
    [key, value],
  );
}

async function saleById(sql: SqlDriver, saleId: string): Promise<Sale> {
  const [sale] = await sql.query<Sale>('SELECT * FROM sales WHERE id = ?', [saleId]);
  if (!sale) throw new Error('El ticket ya no está disponible.');
  return sale;
}

async function editable(sql: SqlDriver, saleId: string) {
  const sale = await saleById(sql, saleId);
  if (sale.status !== 'draft') throw new Error('Este ticket no está abierto para edición.');
  return sale;
}

async function linesFor(sql: SqlDriver, saleId: string) {
  return sql.query<SaleLine>('SELECT * FROM sale_lines WHERE sale_id = ? ORDER BY rowid', [saleId]);
}

async function recalculate(sql: SqlDriver, saleId: string) {
  const sale = await saleById(sql, saleId);
  const t = totals(await linesFor(sql, saleId), sale.discount_bps, sale.tax_bps);
  await sql.run(
    'UPDATE sales SET subtotal=?, discount=?, tax=?, total=?, updated_at=? WHERE id=?',
    [t.subtotal, t.discount, t.tax, t.total, now(), saleId],
  );
}

async function newDraft(sql: SqlDriver) {
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
  return saleId;
}

async function receipt(sql: SqlDriver, saleId: string): Promise<Receipt> {
  const sale = await saleById(sql, saleId);
  const payments = await sql.query<Payment>(
    'SELECT * FROM payments WHERE sale_id=? ORDER BY position',
    [saleId],
  );
  if (sale.status !== 'paid' || !payments.length)
    throw new Error('No existe un pago para este ticket.');
  return { sale, payment: payments[0], payments, lines: await linesFor(sql, saleId) };
}

export class Pos {
  readonly access: AccessControl;
  readonly inventory: Inventory;
  readonly cash: Cash;
  constructor(readonly db: Database) {
    this.access = new AccessControl(db);
    this.inventory = new Inventory(db, this.access);
    this.cash = new Cash(db, this.access);
  }

  async initialize() {
    await this.db.transaction(async (sql) => {
      const [active] = await sql.query<{ value: string }>(
        "SELECT value FROM settings WHERE key='activeSale'",
      );
      if (!active || (await saleById(sql, active.value)).status !== 'draft') await newDraft(sql);
    });
  }

  snapshot(): Promise<Snapshot> {
    return this.db.read(async (sql) => {
      const actor = await this.access.require(sql);
      const [active] = await sql.query<{ value: string }>(
        "SELECT value FROM settings WHERE key='activeSale'",
      );
      const [view] = await sql.query<{ value: 'grid' | 'list' }>(
        "SELECT value FROM settings WHERE key='view'",
      );
      return {
        categories: await sql.query<Category>(
          'SELECT * FROM categories ORDER BY name COLLATE NOCASE',
        ),
        products: await sql.query<Product>('SELECT * FROM products ORDER BY name COLLATE NOCASE'),
        customers: await sql.query<Customer>(
          'SELECT * FROM customers ORDER BY name COLLATE NOCASE',
        ),
        active: await saleById(sql, active.value),
        lines: await linesFor(sql, active.value),
        parked: await sql.query<Sale>(
          "SELECT * FROM sales WHERE status='parked' ORDER BY updated_at DESC",
        ),
        history: actor.permissions.includes('reports')
          ? await sql.query<Sale & { payment_methods: string }>(
              `SELECT sales.*, (SELECT GROUP_CONCAT(method) FROM (SELECT method FROM payments WHERE sale_id=sales.id ORDER BY position)) AS payment_methods
           FROM sales WHERE status='paid' ORDER BY paid_at DESC`,
            )
          : [],
        business: await business(sql),
        view: view.value,
        actor,
        shift:
          (
            await sql.query<import('./cash').Shift>("SELECT * FROM shifts WHERE status='open'")
          )[0] || null,
      };
    });
  }

  saveView(view: 'grid' | 'list') {
    if (!['grid', 'list'].includes(view)) throw new Error('Vista no válida.');
    return this.db.transaction(async (sql) => {
      await this.access.require(sql);
      await setting(sql, 'view', view);
    });
  }

  saveCategory(name: string, color = '#4caf50', categoryId: string = id()) {
    const value = required(name, 'el nombre de la categoría');
    if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Color no válido.');
    return this.db.transaction(async (sql) => {
      const actor = await this.access.require(sql, 'products');
      await sql.run(
        'INSERT INTO categories(id,name,color) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,color=excluded.color',
        [categoryId, value, color],
      );
      await audit(sql, actor, 'category.save', categoryId);
      return categoryId;
    });
  }

  deleteCategory(categoryId: string) {
    return this.db.transaction(async (sql) => {
      const actor = await this.access.require(sql, 'products');
      await sql.run('DELETE FROM categories WHERE id=?', [categoryId]);
      await audit(sql, actor, 'category.delete', categoryId);
    });
  }

  saveProduct(
    input: Omit<Product, 'id' | 'low_stock'> & { id?: string; low_stock?: number },
    stockReason = '',
  ) {
    const name = required(input.name, 'el nombre del producto');
    integer(input.price);
    integer(input.cost);
    integer(input.stock, 0, 999999);
    for (const flag of [input.active, input.favorite, input.track_stock]) integer(flag, 0, 1);
    if (
      input.photo &&
      (!/^data:image\/(jpeg|png|webp);base64,/.test(input.photo) || input.photo.length > 1_500_000)
    ) {
      throw new Error('Utiliza una fotografía JPG, PNG o WebP de tamaño reducido.');
    }
    const productId = input.id || id();
    return this.db.transaction(async (sql) => {
      const actor = await this.access.require(sql, 'products');
      const [previous] = await sql.query<Product>('SELECT * FROM products WHERE id=?', [productId]);
      if (previous && previous.price !== input.price) await this.access.require(sql, 'edit_prices');
      const lowStock = integer(input.low_stock ?? previous?.low_stock ?? 0, 0, 999999);
      const delta = input.stock - (previous?.stock || 0);
      if (
        delta ||
        (previous ? previous.track_stock !== input.track_stock : !!input.track_stock) ||
        lowStock !== (previous?.low_stock || 0)
      )
        await this.access.require(sql, 'inventory');
      if (previous && delta && !stockReason.trim())
        throw new Error('Escribe el motivo del ajuste de existencias.');
      await sql.run(
        `INSERT INTO products(id,name,sku,barcode,description,category_id,price,cost,photo,active,favorite,track_stock,stock,unit)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,sku=excluded.sku,barcode=excluded.barcode,
        description=excluded.description,category_id=excluded.category_id,price=excluded.price,cost=excluded.cost,photo=excluded.photo,
        active=excluded.active,favorite=excluded.favorite,track_stock=excluded.track_stock,stock=excluded.stock,unit=excluded.unit`,
        [
          productId,
          name,
          clean(input.sku),
          clean(input.barcode),
          clean(input.description, 1000),
          input.category_id || null,
          input.price,
          input.cost,
          input.photo,
          input.active,
          input.favorite,
          input.track_stock,
          previous?.stock || 0,
          required(input.unit, 'la unidad de medida'),
        ],
      );
      await sql.run('UPDATE products SET low_stock=? WHERE id=?', [lowStock, productId]);
      if (delta)
        await recordStock(
          sql,
          actor,
          { id: productId, stock: previous?.stock || 0, cost: input.cost },
          delta,
          previous ? 'adjustment' : 'initial',
          previous ? stockReason.trim().slice(0, 500) : 'Existencia inicial al crear el producto',
        );
      await audit(sql, actor, previous ? 'product.update' : 'product.create', productId);
      return productId;
    });
  }

  addProduct(saleId: string, productId: string) {
    return this.db.transaction(async (sql) => {
      await this.access.require(sql, 'sell');
      await editable(sql, saleId);
      const [product] = await sql.query<Product>('SELECT * FROM products WHERE id=? AND active=1', [
        productId,
      ]);
      if (!product) throw new Error('Este producto no está activo.');
      const [line] = await sql.query<SaleLine>(
        "SELECT * FROM sale_lines WHERE sale_id=? AND product_id=? AND unit_price=? AND note=''",
        [saleId, productId, product.price],
      );
      if (line) {
        integer(line.quantity + 1, 1, 9999);
        await sql.run('UPDATE sale_lines SET quantity=quantity+1 WHERE id=?', [line.id]);
      } else {
        await sql.run(
          'INSERT INTO sale_lines(id,sale_id,product_id,name,unit_price,quantity) VALUES(?,?,?,?,?,1)',
          [id(), saleId, productId, product.name, product.price],
        );
      }
      await recalculate(sql, saleId);
    });
  }

  updateLine(saleId: string, lineId: string, quantity: number, note: string) {
    integer(quantity, 0, 9999);
    return this.db.transaction(async (sql) => {
      await this.access.require(sql, 'sell');
      await editable(sql, saleId);
      if (quantity === 0)
        await sql.run('DELETE FROM sale_lines WHERE id=? AND sale_id=?', [lineId, saleId]);
      else
        await sql.run('UPDATE sale_lines SET quantity=?,note=? WHERE id=? AND sale_id=?', [
          quantity,
          clean(note, 500),
          lineId,
          saleId,
        ]);
      await recalculate(sql, saleId);
    });
  }

  updateTicket(
    saleId: string,
    input: { note: string; discountBps: number; label: string; customerId: string | null },
  ) {
    integer(input.discountBps, 0, 10_000);
    return this.db.transaction(async (sql) => {
      const actor = await this.access.require(sql, 'sell');
      const previous = await editable(sql, saleId);
      if (previous.discount_bps !== input.discountBps) await this.access.require(sql, 'discounts');
      let customerName = '';
      if (input.customerId) {
        const [customer] = await sql.query<Customer>('SELECT * FROM customers WHERE id=?', [
          input.customerId,
        ]);
        if (!customer) throw new Error('Cliente no disponible.');
        customerName = customer.name;
      }
      await sql.run(
        'UPDATE sales SET note=?,discount_bps=?,label=?,customer_id=?,customer_name=? WHERE id=?',
        [
          clean(input.note, 500),
          input.discountBps,
          clean(input.label),
          input.customerId,
          customerName,
          saleId,
        ],
      );
      await recalculate(sql, saleId);
      await audit(sql, actor, 'ticket.update', saleId, { discountBps: input.discountBps });
    });
  }

  park(saleId: string, label: string) {
    return this.db.transaction(async (sql) => {
      await this.access.require(sql, 'sell');
      await editable(sql, saleId);
      if (!(await linesFor(sql, saleId)).length)
        throw new Error('Agrega al menos un producto para guardar el ticket.');
      await sql.run("UPDATE sales SET status='parked',label=?,updated_at=? WHERE id=?", [
        clean(label) || 'Ticket pendiente',
        now(),
        saleId,
      ]);
      await newDraft(sql);
    });
  }

  resume(saleId: string) {
    return this.db.transaction(async (sql) => {
      await this.access.require(sql, 'sell');
      const selected = await saleById(sql, saleId);
      if (selected.status !== 'parked') throw new Error('El ticket ya no está pendiente.');
      const [active] = await sql.query<{ value: string }>(
        "SELECT value FROM settings WHERE key='activeSale'",
      );
      const currentLines = await linesFor(sql, active.value);
      await sql.run('UPDATE sales SET status=?,updated_at=? WHERE id=?', [
        currentLines.length ? 'parked' : 'cancelled',
        now(),
        active.value,
      ]);
      await sql.run("UPDATE sales SET status='draft',updated_at=? WHERE id=?", [now(), saleId]);
      await setting(sql, 'activeSale', saleId);
    });
  }

  cancel(saleId: string) {
    return this.db.transaction(async (sql) => {
      const actor = await this.access.require(sql, 'cancel_sales');
      const sale = await saleById(sql, saleId);
      if (!['draft', 'parked'].includes(sale.status))
        throw new Error('Solo puedes cancelar tickets abiertos o pendientes.');
      await sql.run("UPDATE sales SET status='cancelled',updated_at=? WHERE id=?", [now(), saleId]);
      if (sale.status === 'draft') await newDraft(sql);
      await audit(sql, actor, 'ticket.cancel', saleId);
    });
  }

  checkout(saleId: string, tendered: number): Promise<Receipt> {
    integer(tendered);
    return this.checkoutPayments(saleId, [{ method: 'cash', tendered }]);
  }

  checkoutPayments(saleId: string, requests: readonly PaymentRequest[]): Promise<Receipt> {
    return this.db.transaction(async (sql) => {
      const actor = await this.access.require(sql, 'sell');
      const existing = await saleById(sql, saleId);
      if (existing.status === 'paid') {
        if (!actor.permissions.includes('reports') && existing.employee_id !== actor.id)
          throw new Error('Sin permiso para consultar esta venta.');
        return receipt(sql, saleId);
      }
      await editable(sql, saleId);
      const lines = await linesFor(sql, saleId);
      if (!lines.length) throw new Error('El ticket está vacío.');
      await recalculate(sql, saleId);
      const sale = await saleById(sql, saleId);
      const payments = preparePayments(sale.total, requests);
      const shiftId = await checkoutShift(
        sql,
        payments
          .filter((payment) => payment.method === 'cash')
          .reduce((sum, payment) => sum + payment.amount, 0),
      );
      // Aggregate identical products before checking inventory; separate notes may create multiple lines.
      const quantities = new Map<string, number>();
      for (const line of lines)
        quantities.set(line.product_id, (quantities.get(line.product_id) || 0) + line.quantity);
      const date = now();
      for (const [productId, quantity] of quantities) {
        const [product] = await sql.query<Product>('SELECT * FROM products WHERE id=?', [
          productId,
        ]);
        if (product.track_stock) {
          if (product.stock < quantity)
            throw new Error(
              `Existencias insuficientes: ${product.name} (disponibles: ${product.stock}).`,
            );
          await recordStock(sql, actor, product, -quantity, 'sale', `Venta #${sale.number}`, {
            saleId,
          });
        }
      }
      for (const payment of payments) {
        await sql.run(
          'INSERT INTO payments(id,sale_id,position,method,amount,tendered,change_amount,reference,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
          [
            id(),
            saleId,
            payment.position,
            payment.method,
            payment.amount,
            payment.tendered,
            payment.change_amount,
            payment.reference,
            date,
          ],
        );
      }
      await sql.run(
        "UPDATE sales SET status='paid',paid_at=?,updated_at=?,employee_id=?,employee_name=?,shift_id=? WHERE id=?",
        [date, date, actor.id, actor.name, shiftId, saleId],
      );
      await audit(sql, actor, 'sale.complete', saleId, {
        total: sale.total,
        payments: payments.length,
        shiftId,
      });
      await newDraft(sql);
      return receipt(sql, saleId);
    });
  }

  getReceipt(saleId: string) {
    return this.db.read(async (sql) => {
      const actor = await this.access.require(sql);
      const sale = await saleById(sql, saleId);
      if (
        !actor.permissions.includes('reports') &&
        (!actor.permissions.includes('sell') || sale.employee_id !== actor.id)
      )
        throw new Error('Sin permiso para consultar esta venta.');
      return receipt(sql, saleId);
    });
  }

  saveBusiness(input: Business) {
    integer(input.taxBps, 0, 10_000);
    const value: Business = {
      name: required(input.name, 'el nombre del negocio'),
      address: clean(input.address, 300),
      phone: clean(input.phone, 40),
      taxBps: input.taxBps,
      receiptFooter: clean(input.receiptFooter, 200),
      cashManagement: !!input.cashManagement,
    };
    return this.db.transaction(async (sql) => {
      const actor = await this.access.require(sql, 'settings');
      if (
        !value.cashManagement &&
        (await sql.query("SELECT id FROM shifts WHERE status='open'")).length
      )
        throw new Error('Cierra el turno antes de desactivar el control de caja.');
      await setting(sql, 'business', JSON.stringify(value));
      await audit(sql, actor, 'business.update', 'business', {
        taxBps: value.taxBps,
        cashManagement: value.cashManagement,
      });
      const [active] = await sql.query<{ value: string }>(
        "SELECT value FROM settings WHERE key='activeSale'",
      );
      await sql.run(
        'UPDATE sales SET tax_bps=?,business_name=?,business_address=?,business_phone=? WHERE id=?',
        [value.taxBps, value.name, value.address, value.phone, active.value],
      );
      await recalculate(sql, active.value);
    });
  }

  saveCustomer(input: Omit<Customer, 'id'> & { id?: string }) {
    const customerId = input.id || id();
    const name = required(input.name, 'el nombre del cliente');
    return this.db.transaction(async (sql) => {
      await this.access.require(sql, 'sell');
      await sql.run(
        `INSERT INTO customers(id,name,phone,email,note) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,phone=excluded.phone,email=excluded.email,note=excluded.note`,
        [customerId, name, clean(input.phone, 40), clean(input.email, 150), clean(input.note, 500)],
      );
      return customerId;
    });
  }
}
