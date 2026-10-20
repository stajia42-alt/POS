import { beforeAll, describe, expect, it } from 'vitest';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { Database } from '../src/db/database';
import { migrate } from '../src/db/migrations';
import { WasmDriver, type Persistence } from '../src/db/wasm-driver';
import { Pos } from '../src/domain/pos';
import { money, parseMoney, parsePercent, totals } from '../src/domain/money';
import type { Product } from '../src/domain/types';

let sqlite: SqlJsStatic;
beforeAll(async () => {
  sqlite = await initSqlJs();
});

function memory(): Persistence & { data?: Uint8Array; fail?: boolean } {
  return {
    async load() {
      return this.data;
    },
    async save(data) {
      if (this.fail) throw new Error('disk full');
      this.data = data.slice();
    },
  };
}
async function setup(persistence = memory()) {
  const db = new Database(new WasmDriver(sqlite, persistence, await persistence.load()));
  await migrate(db);
  const pos = new Pos(db);
  await pos.initialize();
  if (await pos.access.hasEmployees()) await pos.access.login('owner', '832641');
  else await pos.access.bootstrap({ name: 'Test owner', identifier: 'owner', pin: '832641' });
  if (!(await pos.snapshot()).shift) await pos.cash.open(0);
  return { pos, db, persistence };
}
async function product(pos: Pos, input: Partial<Product> = {}) {
  return pos.saveProduct({
    name: 'Café',
    sku: '',
    barcode: '',
    description: '',
    category_id: null,
    price: 2550,
    cost: 1000,
    photo: '',
    active: 1,
    favorite: 0,
    track_stock: 0,
    stock: 0,
    unit: 'pieza',
    ...input,
  });
}
async function cart(pos: Pos, input: Partial<Product> = {}) {
  const productId = await product(pos, input);
  const { active } = await pos.snapshot();
  await pos.addProduct(active.id, productId);
  return { saleId: active.id, productId };
}

describe('dinero en centavos', () => {
  it('convierte decimales sin multiplicar números flotantes', () => {
    expect(parseMoney('0.29')).toBe(29);
    expect(parseMoney('1,01')).toBe(101);
    expect(parseMoney('999999.99')).toBe(99999999);
    expect(money(125000)).toBe('$1,250.00 MXN');
    expect(parsePercent('16.25')).toBe(1625);
  });
  it.each(['-1', 'NaN', '1e2', '1.001', '1,000.00', '', 'Infinity', '1000000'])(
    'rechaza importe %s',
    (value) => expect(() => parseMoney(value)).toThrow(),
  );
  it('redondea impuesto y descuento una vez, a centavos', () => {
    expect(totals([{ unit_price: 101, quantity: 3 }], 1000, 1600)).toEqual({
      subtotal: 303,
      discount: 30,
      tax: 44,
      total: 317,
    });
    expect(() => totals([{ unit_price: 99999999, quantity: 2 }], 0, 0)).toThrow();
    expect(() => totals([{ unit_price: 1, quantity: 0.5 }], 0, 0)).toThrow();
    expect(() => parsePercent('100.01')).toThrow();
  });
});

describe('SQLite y ventas reales', () => {
  it('crea la base vacía y migra repetidamente sin borrar datos', async () => {
    const { pos, db } = await setup();
    expect((await pos.snapshot()).products).toEqual([]);
    await product(pos);
    await migrate(db);
    await migrate(db);
    expect((await pos.snapshot()).products).toHaveLength(1);
    expect(await db.read((sql) => sql.query('PRAGMA foreign_key_check'))).toEqual([]);
    expect(await db.read((sql) => sql.query('PRAGMA integrity_check'))).toEqual([
      { integrity_check: 'ok' },
    ]);
  });
  it('rechaza una versión futura sin reconstruir la base', async () => {
    const { db } = await setup();
    await db.transaction((sql) => sql.run('PRAGMA user_version = 99'));
    await expect(migrate(db)).rejects.toThrow('más reciente');
  });
  it('mantiene categorías dinámicas, fotografías y códigos únicos', async () => {
    const { pos } = await setup();
    const categoryId = await pos.saveCategory('Bebidas');
    const photo = 'data:image/png;base64,iVBORw0KGgo=';
    await product(pos, { category_id: categoryId, barcode: '123', photo });
    await expect(product(pos, { barcode: '123' })).rejects.toThrow('UNIQUE');
    await expect(product(pos, { category_id: 'missing' })).rejects.toThrow('FOREIGN KEY');
    const snapshot = await pos.snapshot();
    expect(snapshot.products[0].photo).toBe(photo);
    expect(snapshot.categories[0].name).toBe('Bebidas');
  });
  it('agrupa productos iguales, mantiene notas distintas y edita cantidades', async () => {
    const { pos } = await setup();
    const { saleId, productId } = await cart(pos);
    await pos.addProduct(saleId, productId);
    let snapshot = await pos.snapshot();
    expect(snapshot.lines[0].quantity).toBe(2);
    await pos.updateLine(saleId, snapshot.lines[0].id, 2, 'Sin azúcar');
    await pos.addProduct(saleId, productId);
    snapshot = await pos.snapshot();
    expect(snapshot.lines).toHaveLength(2);
    expect(snapshot.active.total).toBe(7650);
    await pos.updateLine(saleId, snapshot.lines[0].id, 0, '');
    expect((await pos.snapshot()).active.total).toBe(2550);
  });
  it('persiste el carrito, fotos, categorías, configuración y vista después de reabrir', async () => {
    const { pos, persistence } = await setup();
    await cart(pos);
    await pos.saveView('list');
    await pos.saveBusiness({
      name: 'Aviles Café',
      phone: '123',
      address: 'Centro',
      taxBps: 1600,
      receiptFooter: 'Gracias',
    });
    const { pos: reopened } = await setup(persistence);
    const snapshot = await reopened.snapshot();
    expect(snapshot.lines).toHaveLength(1);
    expect(snapshot.active.total).toBe(2958);
    expect(snapshot.business.name).toBe('Aviles Café');
    expect(snapshot.view).toBe('list');
  });
  it('guarda y recupera pendientes sin descontar existencias', async () => {
    const { pos, persistence } = await setup();
    const { saleId } = await cart(pos, { track_stock: 1, stock: 5 });
    await pos.park(saleId, 'Mesa 3');
    expect((await pos.snapshot()).products[0].stock).toBe(5);
    const { pos: reopened } = await setup(persistence);
    expect((await reopened.snapshot()).parked[0].label).toBe('Mesa 3');
    await reopened.resume(saleId);
    expect((await reopened.snapshot()).lines).toHaveLength(1);
    const result = await reopened.checkout(saleId, 5000);
    expect(result.payment.change_amount).toBe(2450);
    expect((await reopened.snapshot()).products[0].stock).toBe(4);
  });
  it('protege el ticket actual al recuperar otro pendiente', async () => {
    const { pos } = await setup();
    const first = await cart(pos);
    await pos.park(first.saleId, 'Primero');
    const second = await cart(pos, { name: 'Pan' });
    await pos.resume(first.saleId);
    expect((await pos.snapshot()).parked[0].id).toBe(second.saleId);
  });
  it('rechaza efectivo insuficiente y revierte toda la transacción', async () => {
    const { pos } = await setup();
    const { saleId } = await cart(pos, { stock: 1, track_stock: 1 });
    await expect(pos.checkout(saleId, 100)).rejects.toThrow('menor');
    const s = await pos.snapshot();
    expect(s.active.status).toBe('draft');
    expect(s.history).toHaveLength(0);
    expect(s.products[0].stock).toBe(1);
  });
  it('cobra una sola vez incluso con solicitudes concurrentes o repetidas después de reiniciar', async () => {
    const { pos, db, persistence } = await setup();
    const { saleId } = await cart(pos, { stock: 5, track_stock: 1 });
    const results = await Promise.all([
      pos.checkout(saleId, 5000),
      pos.checkout(saleId, 5000),
      pos.checkout(saleId, 5000),
    ]);
    expect(new Set(results.map((r) => r.payment.id)).size).toBe(1);
    expect((await pos.snapshot()).history).toHaveLength(1);
    expect((await pos.snapshot()).products[0].stock).toBe(4);
    expect(await db.read((sql) => sql.query('SELECT COUNT(*) AS n FROM payments'))).toEqual([
      { n: 1 },
    ]);
    const { pos: reopened } = await setup(persistence);
    await reopened.checkout(saleId, 5000);
    expect((await reopened.snapshot()).history).toHaveLength(1);
  });
  it('agrega existencias de líneas con diferentes notas antes de validar el cobro', async () => {
    const { pos } = await setup();
    const { saleId, productId } = await cart(pos, { stock: 1, track_stock: 1 });
    const [line] = (await pos.snapshot()).lines;
    await pos.updateLine(saleId, line.id, 1, 'Frío');
    await pos.addProduct(saleId, productId);
    await expect(pos.checkout(saleId, 10000)).rejects.toThrow('Existencias insuficientes');
    expect((await pos.snapshot()).history).toHaveLength(0);
    expect((await pos.snapshot()).products[0].stock).toBe(1);
  });
  it('conserva precio, cliente e impuesto de ventas anteriores', async () => {
    const { pos } = await setup();
    const { saleId } = await cart(pos);
    const customerId = await pos.saveCustomer({ name: 'Ana', phone: '', email: '', note: '' });
    await pos.updateTicket(saleId, {
      note: 'Para llevar',
      discountBps: 1000,
      label: '',
      customerId,
    });
    await pos.checkout(saleId, 5000);
    await pos.saveCustomer({ id: customerId, name: 'Otro nombre', phone: '', email: '', note: '' });
    await pos.saveBusiness({
      name: 'Nuevo negocio',
      address: '',
      phone: '',
      taxBps: 1600,
      receiptFooter: '',
    });
    const receipt = await pos.getReceipt(saleId);
    expect(receipt.sale.customer_name).toBe('Ana');
    expect(receipt.sale.business_name).toBe('Mi negocio');
    expect(receipt.sale.tax_bps).toBe(0);
    expect(receipt.sale.discount).toBe(255);
  });
  it('cancela pendientes sin borrar ventas ni mover inventario', async () => {
    const { pos } = await setup();
    const { saleId } = await cart(pos, { stock: 5, track_stock: 1 });
    await pos.park(saleId, 'Cancelar');
    await pos.cancel(saleId);
    expect((await pos.snapshot()).parked).toHaveLength(0);
    expect((await pos.snapshot()).products[0].stock).toBe(5);
    await expect(pos.resume(saleId)).rejects.toThrow('pendiente');
  });
  it('no confirma una operación cuando falla la persistencia', async () => {
    const { pos, persistence } = await setup();
    const { saleId } = await cart(pos);
    persistence.fail = true;
    await expect(pos.checkout(saleId, 5000)).rejects.toThrow('disk full');
    expect((await pos.snapshot()).history).toHaveLength(0);
    expect((await pos.snapshot()).active.id).toBe(saleId);
    persistence.fail = false;
    await pos.checkout(saleId, 5000);
    expect((await pos.snapshot()).history).toHaveLength(1);
  });
});

describe('pagos múltiples persistentes', () => {
  it('migra una base 1.0 con ventas, pendientes, fotografías y efectivo sin perder información', async () => {
    const persistence = memory();
    const db = new Database(new WasmDriver(sqlite, persistence));
    await migrate(db, 1);
    await db.transaction(async (sql) => {
      await sql.run("INSERT INTO categories(id,name,color) VALUES('cat','Café','#4caf50')");
      await sql.run(
        "INSERT INTO products(id,name,price,photo,category_id,stock) VALUES('product','Café',2550,'foto conservada','cat',5)",
      );
      await sql.run("INSERT INTO customers(id,name) VALUES('client','Ana')");
      await sql.run(
        "INSERT INTO sales(id,number,status,business_name,customer_id,customer_name,subtotal,total,created_at,updated_at,paid_at) VALUES('paid',1,'paid','Aviles Café','client','Ana',2550,2550,'2026-10-20','2026-10-20','2026-10-20')",
      );
      await sql.run(
        "INSERT INTO sale_lines(id,sale_id,product_id,name,unit_price,quantity,note) VALUES('line','paid','product','Café',2550,1,'Sin azúcar')",
      );
      await sql.run(
        "INSERT INTO payments(id,sale_id,method,amount,tendered,change_amount,created_at) VALUES('old-payment','paid','cash',2550,5000,2450,'2026-10-20')",
      );
      await sql.run(
        "INSERT INTO sales(id,number,status,business_name,label,created_at,updated_at) VALUES('parked',2,'parked','Aviles Café','Mesa 3','2026-10-20','2026-10-20')",
      );
    });
    await migrate(db);
    await migrate(db);
    const pos = new Pos(db);
    await pos.initialize();
    if (await pos.access.hasEmployees()) await pos.access.login('owner', '832641');
    else await pos.access.bootstrap({ name: 'Test owner', identifier: 'owner', pin: '832641' });
    const migrated = await pos.getReceipt('paid');
    expect(migrated.payments).toEqual([
      {
        id: 'old-payment',
        sale_id: 'paid',
        position: 0,
        method: 'cash',
        amount: 2550,
        tendered: 5000,
        change_amount: 2450,
        reference: '',
        created_at: '2026-10-20',
      },
    ]);
    expect(migrated.lines[0].note).toBe('Sin azúcar');
    const snapshot = await pos.snapshot();
    expect(snapshot.parked[0].label).toBe('Mesa 3');
    expect(snapshot.products[0].photo).toBe('foto conservada');
    expect(snapshot.products[0].stock).toBe(5);
    expect(snapshot.customers[0].name).toBe('Ana');
    const { pos: reopened } = await setup(persistence);
    expect((await reopened.getReceipt('paid')).payments).toEqual(migrated.payments);
    expect(await db.read((sql) => sql.query('PRAGMA foreign_key_check'))).toEqual([]);
    expect(await db.read((sql) => sql.query('PRAGMA integrity_check'))).toEqual([
      { integrity_check: 'ok' },
    ]);
  });
  it('revierte la migración entera si no puede guardar la base', async () => {
    const persistence = memory();
    const db = new Database(new WasmDriver(sqlite, persistence));
    await migrate(db, 1);
    persistence.fail = true;
    await expect(migrate(db)).rejects.toThrow('disk full');
    expect(await db.read((sql) => sql.query('PRAGMA user_version'))).toEqual([{ user_version: 1 }]);
    const columns = await db.read((sql) =>
      sql.query<{ name: string }>('PRAGMA table_info(payments)'),
    );
    expect(columns.some((column) => column.name === 'position')).toBe(false);
    persistence.fail = false;
    await migrate(db);
    expect(await db.read((sql) => sql.query('PRAGMA user_version'))).toEqual([{ user_version: 4 }]);
  });
  it('completa una venta combinada y conserva referencias y cambio tras reabrir', async () => {
    const { pos, persistence } = await setup();
    const { saleId } = await cart(pos, { track_stock: 1, stock: 4 });
    const receipt = await pos.checkoutPayments(saleId, [
      { method: 'cash', amount: 550, tendered: 1000 },
      { method: 'card', amount: 1000, reference: 'AUT-123' },
      { method: 'transfer', amount: 500, reference: 'SPEI-123' },
      { method: 'other', amount: 500, reference: 'Vale' },
    ]);
    expect(receipt.payments.map((payment) => payment.method)).toEqual([
      'cash',
      'card',
      'transfer',
      'other',
    ]);
    expect(receipt.payments[0].change_amount).toBe(450);
    expect(receipt.payments.reduce((sum, payment) => sum + payment.amount, 0)).toBe(2550);
    expect((await pos.snapshot()).products[0].stock).toBe(3);
    const { pos: reopened } = await setup(persistence);
    expect((await reopened.getReceipt(saleId)).payments).toEqual(receipt.payments);
    expect((await reopened.snapshot()).history[0].payment_methods.split(',')).toEqual(
      expect.arrayContaining(['cash', 'card', 'transfer', 'other']),
    );
  });
  it('rechaza importes incompletos o excesivos sin pagos ni movimientos parciales', async () => {
    const { pos, db } = await setup();
    const { saleId } = await cart(pos, { track_stock: 1, stock: 1 });
    for (const amount of [2549, 2551])
      await expect(pos.checkoutPayments(saleId, [{ method: 'card', amount }])).rejects.toThrow(
        'coincidir exactamente',
      );
    expect((await pos.snapshot()).products[0].stock).toBe(1);
    expect((await pos.snapshot()).active.id).toBe(saleId);
    expect(await db.read((sql) => sql.query('SELECT COUNT(*) AS n FROM payments'))).toEqual([
      { n: 0 },
    ]);
    expect(
      await db.read((sql) =>
        sql.query('SELECT COUNT(*) AS n FROM inventory_movements WHERE sale_id IS NOT NULL'),
      ),
    ).toEqual([{ n: 0 }]);
  });
  it('no duplica pagos combinados ni stock aunque se repita con otros métodos', async () => {
    const { pos, db } = await setup();
    const { saleId } = await cart(pos, { track_stock: 1, stock: 3 });
    const requests = [
      { method: 'card' as const, amount: 1000 },
      { method: 'transfer' as const, amount: 1550 },
    ];
    const receipts = await Promise.all([
      pos.checkoutPayments(saleId, requests),
      pos.checkoutPayments(saleId, requests),
      pos.checkout(saleId, 3000),
    ]);
    expect(receipts.map((receipt) => receipt.payments.map((payment) => payment.id))).toEqual([
      receipts[0].payments.map((p) => p.id),
      receipts[0].payments.map((p) => p.id),
      receipts[0].payments.map((p) => p.id),
    ]);
    expect(await db.read((sql) => sql.query('SELECT COUNT(*) AS n FROM payments'))).toEqual([
      { n: 2 },
    ]);
    expect((await pos.snapshot()).products[0].stock).toBe(2);
    expect((await pos.snapshot()).history).toHaveLength(1);
  });
  it('revierte todos los pagos y existencias ante un fallo al confirmar', async () => {
    const { pos, persistence, db } = await setup();
    const { saleId } = await cart(pos, { track_stock: 1, stock: 2 });
    const requests = [
      { method: 'cash' as const, amount: 550, tendered: 1000 },
      { method: 'transfer' as const, amount: 2000, reference: 'REF' },
    ];
    persistence.fail = true;
    await expect(pos.checkoutPayments(saleId, requests)).rejects.toThrow('disk full');
    expect((await pos.snapshot()).history).toHaveLength(0);
    expect((await pos.snapshot()).products[0].stock).toBe(2);
    expect(await db.read((sql) => sql.query('SELECT COUNT(*) AS n FROM payments'))).toEqual([
      { n: 0 },
    ]);
    persistence.fail = false;
    await pos.checkoutPayments(saleId, requests);
    expect((await pos.snapshot()).products[0].stock).toBe(1);
  });
});
