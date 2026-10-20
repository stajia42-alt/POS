import { beforeAll, describe, expect, it } from 'vitest';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { Database } from '../src/db/database';
import { WasmDriver, type Persistence } from '../src/db/wasm-driver';
import { migrate } from '../src/db/migrations';
import { Pos } from '../src/domain/pos';
import { DEFAULT_PERMISSIONS, type Permission } from '../src/domain/access-types';

let sqlite: SqlJsStatic;
beforeAll(async () => {
  sqlite = await initSqlJs();
});
function memory(): Persistence & { data?: Uint8Array; fail?: boolean } {
  return {
    async load() {
      return this.data;
    },
    async save(bytes) {
      if (this.fail) throw new Error('disk full');
      this.data = bytes.slice();
    },
  };
}
async function setup(store = memory(), open = false) {
  const db = new Database(new WasmDriver(sqlite, store, await store.load()));
  await migrate(db);
  const pos = new Pos(db);
  await pos.initialize();
  if (await pos.access.hasEmployees()) await pos.access.login('owner', '832641');
  else
    await pos.access.bootstrap({
      name: 'Propietaria de prueba',
      identifier: 'owner',
      pin: '832641',
    });
  if (open && !(await pos.snapshot()).shift) await pos.cash.open(0);
  return { db, pos, store };
}
async function addProduct(pos: Pos, stock = 10, tracking = 1) {
  return pos.saveProduct({
    name: 'Producto de prueba',
    price: 1000,
    cost: 200,
    stock,
    low_stock: 3,
    track_stock: tracking,
    sku: '',
    barcode: '',
    photo: '',
    description: '',
    category_id: null,
    active: 1,
    favorite: 0,
    unit: 'pieza',
  });
}
async function cashier(pos: Pos, permissions: Permission[] = [...DEFAULT_PERMISSIONS.cashier]) {
  return pos.access.save({
    name: 'Cajera',
    identifier: 'cashier',
    pin: '739154',
    role: 'cashier',
    active: 1,
    permissions,
  });
}
async function enableCash(pos: Pos) {
  await pos.saveBusiness({ ...(await pos.snapshot()).business, cashManagement: true });
}
async function sale(pos: Pos, productId: string) {
  const id = (await pos.snapshot()).active.id;
  await pos.addProduct(id, productId);
  return id;
}

describe('acceso y permisos en operaciones reales', () => {
  it('protege datos y operaciones antes de iniciar sesión y después de bloquear', async () => {
    const { pos } = await setup();
    pos.access.lock();
    await expect(pos.snapshot()).rejects.toThrow('PIN');
    await expect(pos.saveCategory('Privada')).rejects.toThrow('PIN');
    await expect(pos.inventory.snapshot()).rejects.toThrow('PIN');
    await expect(pos.cash.snapshot()).rejects.toThrow('PIN');
    await pos.access.login('OWNER', '832641');
    expect((await pos.snapshot()).actor.name).toBe('Propietaria de prueba');
  });
  it('guarda hashes con sal distinta y nunca incluye credenciales en DTO ni auditoría', async () => {
    const { pos, db } = await setup();
    const id = await cashier(pos);
    await pos.access.save({
      name: 'Otra cajera',
      identifier: 'cashier2',
      pin: '739154',
      role: 'cashier',
      active: 0,
      permissions: ['sell'],
    });
    const rows = await db.read((sql) =>
      sql.query<{ pin_hash: string; salt: string; iterations: number }>(
        "SELECT pin_hash,salt,iterations FROM employees WHERE role='cashier'",
      ),
    );
    expect(rows[0].pin_hash).not.toBe('739154');
    expect(rows[0].pin_hash).not.toBe(rows[1].pin_hash);
    expect(rows[0].salt).not.toBe(rows[1].salt);
    expect(rows[0].iterations).toBe(600000);
    const dto = (await pos.access.list()).find((row) => row.id === id)!;
    expect(Object.keys(dto)).not.toContain('pin_hash');
    expect(JSON.stringify(await pos.access.auditHistory())).not.toContain('739154');
  });
  it('no permite escalar permisos desde los servicios y atribuye ventas al cajero', async () => {
    const { pos } = await setup(memory(), true);
    const productId = await addProduct(pos);
    const id = await cashier(pos);
    const ownerSale = await sale(pos, productId);
    await pos.checkout(ownerSale, 1000);
    await pos.access.login('cashier', '739154');
    await expect(pos.access.list()).rejects.toThrow('Sin permiso');
    await expect(
      pos.access.save({
        name: 'Escalada',
        identifier: 'new',
        pin: '4821',
        role: 'admin',
        active: 1,
        permissions: [...DEFAULT_PERMISSIONS.admin],
      }),
    ).rejects.toThrow('Sin permiso');
    await expect(pos.saveCategory('Prohibida')).rejects.toThrow('Sin permiso');
    await expect(
      pos.inventory.move({ productId, kind: 'count', quantity: 50, reason: 'No permitido' }),
    ).rejects.toThrow('Sin permiso');
    const saleId = await sale(pos, productId);
    await expect(
      pos.updateTicket(saleId, { note: '', label: '', customerId: null, discountBps: 1000 }),
    ).rejects.toThrow('Sin permiso');
    await expect(pos.cancel(saleId)).rejects.toThrow('Sin permiso');
    await expect(pos.getReceipt(ownerSale)).rejects.toThrow('Sin permiso');
    const receipt = await pos.checkout(saleId, 1000);
    expect(receipt.sale.employee_id).toBe(id);
    expect(receipt.sale.employee_name).toBe('Cajera');
    expect((await pos.snapshot()).history).toEqual([]);
    expect((await pos.getReceipt(saleId)).sale.id).toBe(saleId);
  });
  it('aplica revocaciones durante una sesión existente y rechaza empleados inactivos', async () => {
    const { pos, db } = await setup();
    const id = await cashier(pos, ['sell', 'discounts']);
    const other = new Pos(db);
    await other.access.login('cashier', '739154');
    const employee = (await pos.access.list()).find((item) => item.id === id)!;
    await pos.access.save({ ...employee, permissions: ['sell'] });
    await expect(
      other.updateTicket((await other.snapshot()).active.id, {
        note: '',
        label: '',
        customerId: null,
        discountBps: 1000,
      }),
    ).rejects.toThrow('Sin permiso');
    await pos.access.save({ ...employee, active: 0 });
    await expect(other.snapshot()).rejects.toThrow('inactivo');
    await expect(other.access.login('cashier', '739154')).rejects.toThrow('no válido');
  });
  it('protege al último administrador y permite restablecer PIN sin revelar el anterior', async () => {
    const { pos } = await setup();
    const owner = (await pos.access.list())[0];
    await expect(pos.access.save({ ...owner, active: 0 })).rejects.toThrow(
      'al menos un administrador',
    );
    await expect(pos.access.save({ ...owner, permissions: ['sell'] })).rejects.toThrow(
      'al menos un administrador',
    );
    const id = await cashier(pos);
    const employee = (await pos.access.list()).find((item) => item.id === id)!;
    await pos.access.save({ ...employee, pin: '184739' });
    await expect(pos.access.login('cashier', '739154')).rejects.toThrow('no válido');
    await pos.access.login('cashier', '184739');
    expect((await pos.access.current()).id).toBe(id);
  });
  it('persiste intentos fallidos y bloqueo temporal aunque se reinicie la aplicación', async () => {
    const { pos, store } = await setup();
    await cashier(pos);
    for (let index = 0; index < 5; index++)
      await expect(pos.access.login('cashier', '000000')).rejects.toThrow(
        index === 4 ? 'bloqueado' : 'no válido',
      );
    const db = new Database(new WasmDriver(sqlite, store, await store.load()));
    await migrate(db);
    const reopened = new Pos(db);
    await expect(reopened.access.login('739154')).rejects.toThrow('bloqueado');
    const [saved] = await db.read((sql) =>
      sql.query<{ value: string }>("SELECT value FROM settings WHERE key='pinAccess'"),
    );
    const state = JSON.parse(saved.value);
    expect(state.failed).toBe(5);
    expect(new Date(state.until).getTime()).toBeGreaterThan(Date.now());
    await db.transaction((sql) =>
      sql.run("UPDATE settings SET value=? WHERE key='pinAccess'", [
        JSON.stringify({ ...state, until: '2000-01-01' }),
      ]),
    );
    await reopened.access.login('739154');
    expect((await reopened.access.current()).identifier).toBe('cashier');
  });
  it('un bloqueo explícito cancela un inicio de sesión todavía en curso', async () => {
    const { pos } = await setup();
    const promise = pos.access.login('owner', '832641');
    pos.access.lock();
    await expect(promise).rejects.toThrow('canceló');
    await expect(pos.snapshot()).rejects.toThrow('PIN');
  });
});

describe('inventario con trazabilidad', () => {
  it('registra antes/después, usuario, costo ponderado, salida y ajuste', async () => {
    const { pos } = await setup();
    const productId = await addProduct(pos);
    const owner = await pos.access.current();
    await pos.inventory.move({
      productId,
      kind: 'receipt',
      quantity: 10,
      unitCost: 400,
      reason: 'Compra recibida',
    });
    let state = await pos.inventory.snapshot();
    expect(state.products[0]).toMatchObject({ stock: 20, cost: 300 });
    expect(state.movements[0]).toMatchObject({
      before_stock: 10,
      after_stock: 20,
      quantity: 10,
      unit_cost: 400,
      actor_id: owner.id,
      actor_name: owner.name,
      reason: 'Compra recibida',
    });
    await pos.inventory.move({ productId, kind: 'issue', quantity: 2, reason: 'Merma' });
    await pos.inventory.move({
      productId,
      kind: 'adjustment',
      quantity: -1,
      reason: 'Corrección autorizada',
    });
    state = await pos.inventory.snapshot();
    expect(state.products[0].stock).toBe(17);
    expect(state.valuation).toBe(5100);
    expect(state.movements.map((m) => m.kind)).toEqual([
      'adjustment',
      'issue',
      'receipt',
      'initial',
    ]);
  });
  it('guarda conteos coincidentes y discrepantes, incluidos conteos cero, y alertas', async () => {
    const { pos, db, store } = await setup();
    const productId = await addProduct(pos, 5);
    await pos.inventory.move({ productId, kind: 'count', quantity: 5, reason: 'Verificación' });
    await pos.inventory.move({
      productId,
      kind: 'count',
      quantity: 0,
      reason: 'Sin existencias físicas',
    });
    expect(
      await db.read((sql) =>
        sql.query('SELECT expected,counted FROM inventory_counts ORDER BY rowid'),
      ),
    ).toEqual([
      { expected: 5, counted: 5 },
      { expected: 5, counted: 0 },
    ]);
    const state = await pos.inventory.snapshot();
    expect(state.movements[1].quantity).toBe(0);
    expect(state.lowStock.map((p) => p.id)).toEqual([productId]);
    const { pos: reopened } = await setup(store);
    expect((await reopened.inventory.snapshot()).products[0].stock).toBe(0);
  });
  it('rechaza faltantes, cantidades fraccionarias, motivos vacíos y productos sin control', async () => {
    const { pos } = await setup();
    const productId = await addProduct(pos, 1);
    await expect(
      pos.inventory.move({ productId, kind: 'issue', quantity: 2, reason: 'Merma' }),
    ).rejects.toThrow('supera');
    expect(() =>
      pos.inventory.move({ productId, kind: 'receipt', quantity: 1.5, reason: 'Compra' }),
    ).toThrow('rango');
    expect(() => pos.inventory.move({ productId, kind: 'count', quantity: 1, reason: '' })).toThrow(
      'motivo',
    );
    const untracked = await addProduct(pos, 0, 0);
    await expect(
      pos.inventory.move({
        productId: untracked,
        kind: 'receipt',
        quantity: 1,
        reason: 'No aplica',
      }),
    ).rejects.toThrow('control de inventario');
    expect((await pos.inventory.snapshot()).products.find((p) => p.id === productId)!.stock).toBe(
      1,
    );
  });
  it('registra correcciones desde el producto y exige motivo, sin reemplazar el libro de movimientos', async () => {
    const { pos } = await setup();
    await addProduct(pos);
    const product = (await pos.snapshot()).products[0];
    await expect(pos.saveProduct({ ...product, stock: 7 })).rejects.toThrow('motivo');
    await pos.saveProduct({ ...product, stock: 7 }, 'Corrección de captura');
    expect((await pos.inventory.snapshot()).movements[0]).toMatchObject({
      kind: 'adjustment',
      before_stock: 10,
      after_stock: 7,
      reason: 'Corrección de captura',
    });
  });
  it('página y filtros no omiten movimientos y rechazan rangos invertidos', async () => {
    const { pos } = await setup();
    const productId = await addProduct(pos);
    for (let i = 0; i < 51; i++)
      await pos.inventory.move({ productId, kind: 'count', quantity: 10, reason: `Conteo ${i}` });
    const page1 = await pos.inventory.snapshot({ productId });
    const page2 = await pos.inventory.snapshot({ productId, page: 1 });
    expect(page1.movements).toHaveLength(50);
    expect(page2.movements).toHaveLength(2);
    expect(new Set([...page1.movements, ...page2.movements].map((m) => m.id)).size).toBe(52);
    expect(
      (await pos.inventory.snapshot({ from: '2000-01-01', to: '2000-01-02' })).totalMovements,
    ).toBe(0);
    expect(() => pos.inventory.snapshot({ from: '2026-02-01', to: '2026-01-01' })).toThrow(
      'posterior',
    );
  });
  it('un fallo de disco revierte movimiento, costo, auditoría y conteo físico juntos', async () => {
    const { pos, store, db } = await setup();
    const productId = await addProduct(pos);
    const before = await pos.inventory.snapshot();
    const audit = await pos.access.auditHistory();
    store.fail = true;
    await expect(
      pos.inventory.move({ productId, kind: 'count', quantity: 3, reason: 'Conteo sin espacio' }),
    ).rejects.toThrow('disk full');
    expect(await pos.inventory.snapshot()).toEqual(before);
    expect(await pos.access.auditHistory()).toEqual(audit);
    expect(await db.read((sql) => sql.query('SELECT * FROM inventory_counts'))).toEqual([]);
  });
});

describe('caja, pagos e inventario en una transacción', () => {
  it('exige apertura incluso si la base anterior tenía desactivada la caja', async () => {
    const { pos, db } = await setup();
    const productId = await addProduct(pos);
    const saleId = await sale(pos, productId);
    await db.transaction((sql) =>
      sql.run(
        "UPDATE settings SET value=json_set(value,'$.cashManagement',0) WHERE key='business'",
      ),
    );
    await expect(pos.checkout(saleId, 1000)).rejects.toThrow('turno está cerrado');
    expect((await pos.snapshot()).products[0].stock).toBe(10);
    await pos.cash.open(5000);
    await expect(pos.cash.open(0)).rejects.toThrow('Ya existe');
    await expect(
      pos.saveBusiness({ ...(await pos.snapshot()).business, cashManagement: false }),
    ).rejects.toThrow('obligatorio');
    expect((await pos.checkout(saleId, 1000)).sale.shift_id).not.toBeNull();
  });
  it('calcula el efectivo con pagos aplicados, cambio, ingresos, egresos y retiros', async () => {
    const { pos, store } = await setup();
    const productId = await addProduct(pos);
    await enableCash(pos);
    const shiftId = await pos.cash.open(10000);
    const saleId = await sale(pos, productId);
    await pos.checkoutPayments(saleId, [
      { method: 'cash', amount: 400, tendered: 1000 },
      { method: 'card', amount: 600, reference: 'AUTH' },
    ]);
    await pos.cash.move({ shiftId, kind: 'in', amount: 2000, reason: 'Cambio extra' });
    await pos.cash.move({ shiftId, kind: 'out', amount: 500, reason: 'Gasto autorizado' });
    await pos.cash.move({
      shiftId,
      kind: 'withdrawal',
      amount: 1000,
      reason: 'Retiro a caja fuerte',
    });
    const report = await pos.cash.getReport(shiftId);
    expect(report).toMatchObject({
      expected: 10900,
      cashSales: 400,
      incoming: 2000,
      outgoing: 1500,
    });
    expect(report.payments).toEqual([
      { method: 'card', amount: 600 },
      { method: 'cash', amount: 400 },
    ]);
    const closed = await pos.cash.close(shiftId, 10800);
    expect(closed.shift).toMatchObject({
      expected: 10900,
      counted: 10800,
      difference: -100,
      status: 'closed',
    });
    expect((await pos.cash.getReport(shiftId)).sales[0].employee_name).toBe(
      'Propietaria de prueba',
    );
    expect((await pos.cash.close(shiftId, 0)).shift).toEqual(closed.shift);
    const { pos: reopened } = await setup(store);
    expect((await reopened.cash.getReport(shiftId)).shift).toEqual(closed.shift);
    expect((await reopened.cash.snapshot()).current).toBeNull();
  });
  it('rechaza cobros y movimientos sobre turnos cerrados, sin modificar pagos o stock', async () => {
    const { pos, db } = await setup();
    const productId = await addProduct(pos);
    await enableCash(pos);
    const shiftId = await pos.cash.open(1000);
    await pos.cash.close(shiftId, 1000);
    const saleId = await sale(pos, productId);
    await expect(pos.checkout(saleId, 1000)).rejects.toThrow('cerrado');
    await expect(
      pos.cash.move({ shiftId, kind: 'in', amount: 10, reason: 'Tarde' }),
    ).rejects.toThrow('cerrado');
    expect((await pos.snapshot()).products[0].stock).toBe(10);
    expect(await db.read((sql) => sql.query('SELECT * FROM payments'))).toEqual([]);
    const next = await pos.cash.open(2000);
    await pos.checkout(saleId, 1000);
    expect((await pos.cash.getReport(next)).expected).toBe(3000);
    expect((await pos.cash.getReport(shiftId)).expected).toBe(1000);
  });
  it('impide retirar más efectivo del esperado y respeta permisos de caja', async () => {
    const { pos } = await setup();
    await enableCash(pos);
    const shiftId = await pos.cash.open(1000);
    await expect(
      pos.cash.move({ shiftId, kind: 'out', amount: 1001, reason: 'Excesivo' }),
    ).rejects.toThrow('supera');
    await cashier(pos);
    await pos.access.login('cashier', '739154');
    expect((await pos.cash.snapshot()).report).toBeNull();
    expect((await pos.cash.snapshot()).current!.expected).toBeNull();
    await expect(pos.cash.getReport(shiftId)).rejects.toThrow('Sin permiso');
    await expect(pos.cash.close(shiftId, 1000)).rejects.toThrow('Sin permiso');
    await expect(
      pos.cash.move({ shiftId, kind: 'in', amount: 100, reason: 'No permitido' }),
    ).rejects.toThrow('Sin permiso');
  });
  it('no desborda el límite de efectivo por cobro ni movimiento', async () => {
    const { pos } = await setup();
    const productId = await addProduct(pos);
    await enableCash(pos);
    const shiftId = await pos.cash.open(99999999);
    const saleId = await sale(pos, productId);
    await expect(pos.checkout(saleId, 1000)).rejects.toThrow('límite');
    await expect(
      pos.cash.move({ shiftId, kind: 'in', amount: 1, reason: 'Exceso' }),
    ).rejects.toThrow('rango');
    expect((await pos.cash.getReport(shiftId)).expected).toBe(99999999);
  });
  it('revierte cobro, stock, auditoría y efectivo si falla el guardado; reintento no duplica', async () => {
    const { pos, store, db } = await setup();
    const productId = await addProduct(pos);
    await enableCash(pos);
    const shiftId = await pos.cash.open(1000);
    const saleId = await sale(pos, productId);
    const auditBefore = await pos.access.auditHistory();
    store.fail = true;
    await expect(pos.checkout(saleId, 1000)).rejects.toThrow('disk full');
    expect((await pos.cash.getReport(shiftId)).expected).toBe(1000);
    expect((await pos.snapshot()).products[0].stock).toBe(10);
    expect(await pos.access.auditHistory()).toEqual(auditBefore);
    store.fail = false;
    await Promise.all([pos.checkout(saleId, 1000), pos.checkout(saleId, 1000)]);
    expect((await pos.cash.getReport(shiftId)).expected).toBe(2000);
    expect((await pos.snapshot()).products[0].stock).toBe(9);
    expect(await db.read((sql) => sql.query('PRAGMA foreign_key_check'))).toEqual([]);
  });
  it('un fallo al cerrar conserva el turno abierto y no guarda un arqueo parcial', async () => {
    const { pos, store } = await setup();
    await enableCash(pos);
    const shiftId = await pos.cash.open(1000);
    store.fail = true;
    await expect(pos.cash.close(shiftId, 900)).rejects.toThrow('disk full');
    expect((await pos.cash.snapshot()).current!.shift).toMatchObject({
      status: 'open',
      counted: null,
      expected: null,
    });
    store.fail = false;
    expect((await pos.cash.close(shiftId, 900)).shift.difference).toBe(-100);
  });
});

describe('migración 1.1 a 1.2 sin inventar datos históricos', () => {
  it('conserva pagos, productos y movimientos previos, y revierte la migración si falla disco', async () => {
    const store = memory();
    const db = new Database(new WasmDriver(sqlite, store));
    await migrate(db, 2);
    await db.transaction(async (sql) => {
      await sql.run(
        "INSERT INTO products(id,name,price,cost,stock,photo) VALUES('old','Anterior',1500,500,7,'foto')",
      );
      await sql.run(
        "INSERT INTO inventory_movements(id,product_id,quantity,reason,created_at) VALUES('legacy','old',-1,'Venta previa','2026-10-20T10:00:00Z')",
      );
    });
    store.fail = true;
    await expect(migrate(db)).rejects.toThrow('disk full');
    expect(await db.read((sql) => sql.query('PRAGMA user_version'))).toEqual([{ user_version: 2 }]);
    store.fail = false;
    await migrate(db);
    await migrate(db);
    const pos = new Pos(db);
    await pos.initialize();
    await pos.access.bootstrap({ name: 'Continuación', identifier: 'owner', pin: '832641' });
    const state = await pos.inventory.snapshot();
    expect(state.products[0]).toMatchObject({
      name: 'Anterior',
      stock: 7,
      cost: 500,
      low_stock: 0,
    });
    expect(state.movements[0]).toMatchObject({
      id: 'legacy',
      quantity: -1,
      before_stock: null,
      after_stock: null,
      actor_id: null,
      actor_name: '',
      kind: 'legacy',
    });
    expect((await pos.snapshot()).products[0].photo).toBe('foto');
    expect(await db.read((sql) => sql.query('PRAGMA integrity_check'))).toEqual([
      { integrity_check: 'ok' },
    ]);
  });
});
