import { beforeAll, describe, expect, it } from 'vitest';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { Database } from '../src/db/database';
import { WasmDriver, type Persistence } from '../src/db/wasm-driver';
import { migrate } from '../src/db/migrations';
import { Pos } from '../src/domain/pos';
import { DEFAULT_PERMISSIONS } from '../src/domain/access-types';
import { parseRate } from '../src/domain/money';

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
async function setup(store = memory(), open = true) {
  const db = new Database(new WasmDriver(sqlite, store, await store.load()));
  await migrate(db);
  const pos = new Pos(db);
  await pos.initialize();
  if (await pos.access.hasEmployees()) await pos.access.login('832641');
  else await pos.access.bootstrap({ name: 'Propietaria', identifier: 'owner', pin: '832641' });
  await pos.restoreWorkspace();
  if (open && !(await pos.snapshot()).shift) await pos.cash.open(0);
  return { db, pos, store };
}
async function product(pos: Pos) {
  return pos.saveProduct({
    name: 'Artículo',
    price: 101,
    cost: 40,
    stock: 20,
    track_stock: 1,
    low_stock: 2,
    unit: 'pieza',
    sku: '',
    barcode: '',
    description: '',
    photo: '',
    active: 1,
    favorite: 0,
    category_id: null,
  });
}
async function layout(pos: Pos) {
  const area = await pos.tables.saveArea('Salón');
  const a = await pos.tables.save({
    area_id: area,
    name: '1',
    shape: 'square',
    x: 20,
    y: 20,
    width: 140,
    height: 140,
    capacity: 4,
  });
  const b = await pos.tables.save({
    area_id: area,
    name: '2',
    shape: 'round',
    x: 200,
    y: 20,
    width: 140,
    height: 140,
    capacity: 4,
  });
  return { area, a, b };
}
async function cashier(pos: Pos, pin = '739154', active = 1, identifier = 'cashier') {
  return pos.access.save({
    name: identifier,
    identifier,
    pin,
    role: 'cashier',
    active,
    permissions: [...DEFAULT_PERMISSIONS.cashier],
  });
}
async function checks(db: Database) {
  expect(await db.read((sql) => sql.query('PRAGMA foreign_key_check'))).toEqual([]);
  expect(await db.read((sql) => sql.query('PRAGMA integrity_check'))).toEqual([
    { integrity_check: 'ok' },
  ]);
}

describe('PIN exclusivo y transición de credenciales', () => {
  it('identifica por PIN sin nombre de usuario y no expone el índice derivado', async () => {
    const { pos } = await setup();
    const id = await cashier(pos);
    pos.access.lock();
    expect((await pos.access.login('739154')).id).toBe(id);
    await pos.access.login('832641');
    const rows = await pos.access.list();
    expect(rows.find((e) => e.id === id)).not.toHaveProperty('pin_lookup');
    expect(JSON.stringify(await pos.access.auditHistory())).not.toContain('739154');
  });
  it('rechaza PIN activo duplicado pero conserva empleados inactivos y exige PIN al reactivar', async () => {
    const { pos } = await setup();
    await cashier(pos);
    await expect(cashier(pos, '739154', 1, 'duplicate')).rejects.toThrow('ya está asignado');
    const inactive = await cashier(pos, '739154', 0, 'inactive');
    const item = (await pos.access.list()).find((e) => e.id === inactive)!;
    await expect(pos.access.save({ ...item, active: 1 })).rejects.toThrow('reactivar');
    await expect(pos.access.save({ ...item, active: 1, pin: '739154' })).rejects.toThrow(
      'ya está asignado',
    );
    await pos.access.save({ ...item, active: 1, pin: '184739' });
    expect((await pos.access.login('184739')).id).toBe(inactive);
  });
  it('serializa altas concurrentes del mismo PIN sin permitir un duplicado', async () => {
    const { pos, db } = await setup();
    const results = await Promise.allSettled([
      cashier(pos, '739154', 1, 'one'),
      cashier(pos, '739154', 1, 'two'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect((await pos.access.list()).length).toBe(2);
    await checks(db);
  });
  it('identifica credenciales anteriores con sal propia y bloquea un PIN heredado ambiguo', async () => {
    const store = memory(),
      db = new Database(new WasmDriver(sqlite, store));
    await migrate(db, 3);
    async function old(id: string, pin: string, role = 'cashier') {
      const salt = crypto.randomUUID();
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(pin),
        'PBKDF2',
        false,
        ['deriveBits'],
      );
      const bytes = await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          hash: 'SHA-256',
          salt: new TextEncoder().encode(salt),
          iterations: 600000,
        },
        key,
        256,
      );
      const hash = [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
      await db.transaction(async (sql) => {
        await sql.run(
          'INSERT INTO employees(id,name,identifier,role,active,pin_hash,salt,iterations,created_at) VALUES(?,?,?,?,1,?,?,600000,?)',
          [id, id, id, role, hash, salt, new Date().toISOString()],
        );
        for (const p of role === 'admin'
          ? DEFAULT_PERMISSIONS.admin.filter((p) => !p.startsWith('table'))
          : DEFAULT_PERMISSIONS.cashier.filter((p) => p !== 'tables'))
          await sql.run(
            'INSERT INTO employee_permissions(employee_id,permission,allowed) VALUES(?,?,1)',
            [id, p],
          );
      });
    }
    await old('owner', '832641', 'admin');
    await old('one', '739154');
    await old('two', '739154');
    await db.transaction(async (sql) => {
      await sql.run(
        "INSERT INTO shifts(id,status,opening,opened_by,opened_name,opened_at) VALUES('legacy-shift','open',1000,'owner','Propietario anterior','2026-10-20T10:00:00Z')",
      );
      await sql.run(
        "INSERT INTO sales(id,number,status,business_name,total,subtotal,employee_id,employee_name,shift_id,created_at,updated_at,paid_at) VALUES('legacy-paid',1,'paid','Anterior',100,100,'owner','Propietario anterior','legacy-shift','2026-10-20T10:00:00Z','2026-10-20T10:00:00Z','2026-10-20T10:00:00Z')",
      );
      await sql.run(
        "INSERT INTO payments(id,sale_id,position,method,amount,tendered,change_amount,created_at) VALUES('legacy-payment','legacy-paid',0,'cash',100,100,0,'2026-10-20T10:00:00Z')",
      );
    });
    await migrate(db);
    const pos = new Pos(db);
    await pos.initialize();
    await expect(pos.access.login('739154')).rejects.toThrow('se repite');
    await expect(pos.snapshot()).rejects.toThrow('PIN');
    expect((await pos.access.login('832641')).id).toBe('owner');
    expect((await pos.cash.getReport('legacy-shift')).expected).toBe(1100);
    expect((await pos.cash.getReport('legacy-shift')).expectedUsd).toBe(0);
    const item = (await pos.access.list()).find((e) => e.id === 'one')!;
    await pos.access.save({ ...item, pin: '184739' });
    expect((await pos.access.login('739154')).id).toBe('two');
    expect((await pos.access.login('184739')).id).toBe('one');
    await checks(db);
  });
  it('un fallo al guardar el PIN conserva la credencial anterior', async () => {
    const { pos, store } = await setup();
    const id = await cashier(pos);
    const employee = (await pos.access.list()).find((e) => e.id === id)!;
    store.fail = true;
    await expect(pos.access.save({ ...employee, pin: '184739' })).rejects.toThrow('disk full');
    store.fail = false;
    expect((await pos.access.login('739154')).id).toBe(id);
    await expect(pos.access.login('184739')).rejects.toThrow('PIN no válido');
  });
});

describe('caja obligatoria y fondos en dos monedas', () => {
  it('bloquea todos los métodos sin turno y permite conservar la cuenta pendiente', async () => {
    const { pos } = await setup(undefined, false);
    const p = await product(pos);
    const id = (await pos.snapshot()).active.id;
    await pos.addProduct(id, p);
    for (const method of ['cash', 'card', 'transfer', 'other'] as const)
      await expect(
        pos.checkoutPayments(id, [{ method, amount: 101, tendered: 101 }]),
      ).rejects.toThrow('turno está cerrado');
    await pos.park(id, 'Pendiente sin caja');
    expect((await pos.snapshot()).parked[0].id).toBe(id);
    await pos.cash.open(0);
    await pos.resume(id);
    await pos.checkout(id, 101);
    expect((await pos.snapshot()).products[0].stock).toBe(19);
  });
  it('cuenta USD y MXN por separado, con retiro y diferencias persistentes', async () => {
    const { pos, store } = await setup(undefined, false);
    const rate = parseRate('18.1234');
    const shift = await pos.cash.open(10000, 5000, rate);
    await pos.cash.move({
      shiftId: shift,
      kind: 'in',
      amount: 500,
      currency: 'USD',
      reason: 'Cambio adicional',
    });
    await pos.cash.move({
      shiftId: shift,
      kind: 'withdrawal',
      amount: 1000,
      currency: 'USD',
      reason: 'Retiro USD',
    });
    await pos.cash.move({
      shiftId: shift,
      kind: 'out',
      amount: 500,
      currency: 'MXN',
      reason: 'Gasto MXN',
    });
    const report = await pos.cash.getReport(shift);
    expect(report.expected).toBe(9500);
    expect(report.expectedUsd).toBe(4500);
    await expect(pos.cash.close(shift, 9500)).rejects.toThrow('dólares');
    await pos.cash.close(shift, 9400, 4525);
    const closed = (await pos.cash.getReport(shift)).shift;
    expect(closed).toMatchObject({
      exchange_rate: 181234,
      counted: 9400,
      difference: -100,
      counted_usd: 4525,
      expected_usd: 4500,
      difference_usd: 25,
    });
    const { pos: reopened } = await setup(store, false);
    expect((await reopened.cash.getReport(shift)).shift).toEqual(closed);
  });
  it('exige tasa para fondo USD, rechaza saldo negativo por moneda y conserva la tasa histórica', async () => {
    const { pos } = await setup(undefined, false);
    await expect(pos.cash.open(1000, 1000)).rejects.toThrow('tipo de cambio');
    const id = await pos.cash.open(1000, 1000, 180000);
    await expect(
      pos.cash.move({
        shiftId: id,
        kind: 'out',
        amount: 1001,
        currency: 'USD',
        reason: 'Excesivo',
      }),
    ).rejects.toThrow('supera');
    await pos.saveBusiness({ ...(await pos.snapshot()).business, exchangeRate: 190000 });
    expect((await pos.cash.getReport(id)).shift.exchange_rate).toBe(180000);
    await pos.cash.close(id, 1000, 1000);
    const next = await pos.cash.open(0, 1000);
    expect((await pos.cash.getReport(next)).shift.exchange_rate).toBe(190000);
  });
  it('revertir una apertura fallida no cambia tasa, turno ni auditoría', async () => {
    const { pos, store } = await setup(undefined, false);
    const b = (await pos.snapshot()).business;
    const history = await pos.access.auditHistory();
    store.fail = true;
    await expect(pos.cash.open(1000, 1000, 180000)).rejects.toThrow('disk full');
    expect((await pos.snapshot()).business).toEqual(b);
    expect((await pos.snapshot()).shift).toBeNull();
    expect(await pos.access.auditHistory()).toEqual(history);
  });
  it('los turnos MXN empiezan con fondo USD cero y las tasas validan precisión', async () => {
    const { pos, db } = await setup();
    const id = (await pos.snapshot()).shift!.id;
    await checks(db);
    expect((await pos.cash.getReport(id)).shift.opening_usd).toBe(0);
    expect(parseRate('0.0001')).toBe(1);
    expect(() => parseRate('18.12345')).toThrow();
    expect(() => parseRate('0')).toThrow();
  });
});

describe('mesas, cuentas y recuperación transaccional', () => {
  it('guarda áreas, formas, posición y capacidad; evita eliminar mesas ocupadas', async () => {
    const { pos, store } = await setup();
    const { a, area } = await layout(pos);
    await pos.tables.position(a, 700, 400);
    const bill = await pos.tables.open(a);
    await expect(pos.tables.delete(a)).rejects.toThrow('cuenta abierta');
    await expect(pos.tables.deleteArea(area)).rejects.toThrow('mesas');
    const { pos: reopened } = await setup(store);
    expect((await reopened.tables.snapshot()).tables.find((t) => t.id === a)).toMatchObject({
      x: 700,
      y: 400,
      capacity: 4,
      shape: 'square',
    });
    expect((await reopened.snapshot()).active.id).toBe(bill);
  });
  it('abrir repetidamente una mesa crea solo una cuenta, incluso estando vacía', async () => {
    const { pos, db } = await setup();
    const { a, b } = await layout(pos);
    const ids = await Promise.all([pos.tables.open(a), pos.tables.open(a)]);
    expect(ids[0]).toBe(ids[1]);
    await pos.tables.open(b);
    await pos.tables.open(a);
    expect((await pos.snapshot()).active.id).toBe(ids[0]);
    expect(
      await db.read((sql) =>
        sql.query('SELECT COUNT(*) AS n FROM table_sessions WHERE table_id=?', [a]),
      ),
    ).toEqual([{ n: 1 }]);
    await checks(db);
  });
  it('conserva cuenta rápida y cuenta de mesa al alternar modos y reiniciar', async () => {
    const { pos, store } = await setup();
    const p = await product(pos),
      quick = (await pos.snapshot()).active.id;
    await pos.addProduct(quick, p);
    const { a } = await layout(pos);
    await pos.setMode('tables');
    const bill = await pos.tables.open(a);
    await pos.addProduct(bill, p);
    await pos.updateLine(bill, (await pos.snapshot()).lines[0].id, 2, 'Sin sal');
    await pos.setMode('quick');
    expect((await pos.snapshot()).active.id).toBe(quick);
    expect((await pos.snapshot()).lines[0].quantity).toBe(1);
    await pos.tables.open(a);
    const { pos: reopened } = await setup(store);
    const data = await reopened.snapshot();
    expect(data.workspace).toMatchObject({ mode: 'tables', table_view: 'bill' });
    expect(data.active.id).toBe(bill);
    expect(data.lines[0]).toMatchObject({ quantity: 2, note: 'Sin sal' });
    expect(data.products[0].stock).toBe(20);
  });
  it('el mapa puede restaurarse como última vista sin cerrar ni duplicar la cuenta', async () => {
    const { pos, store } = await setup();
    const { a } = await layout(pos);
    const bill = await pos.tables.open(a);
    await pos.setMode('tables');
    const { pos: reopened } = await setup(store);
    expect((await reopened.snapshot()).workspace).toMatchObject({
      mode: 'tables',
      table_view: 'map',
    });
    expect((await reopened.tables.snapshot()).tables.find((t) => t.id === a)!.bill!.sale_id).toBe(
      bill,
    );
  });
  it('guarda y restaura operaciones distintas por empleado sin mezclar productos', async () => {
    const { pos } = await setup();
    const p = await product(pos),
      owner = (await pos.snapshot()).active.id;
    await pos.addProduct(owner, p);
    await cashier(pos);
    await pos.access.login('739154');
    await pos.restoreWorkspace();
    const other = (await pos.snapshot()).active.id;
    expect(other).not.toBe(owner);
    expect((await pos.snapshot()).lines).toHaveLength(0);
    await pos.addProduct(other, p);
    await pos.updateLine(other, (await pos.snapshot()).lines[0].id, 3, 'Cuenta del cajero');
    await pos.access.login('832641');
    await pos.restoreWorkspace();
    expect((await pos.snapshot()).active.id).toBe(owner);
    expect((await pos.snapshot()).lines[0].quantity).toBe(1);
    await pos.access.login('739154');
    await pos.restoreWorkspace();
    expect((await pos.snapshot()).lines[0].quantity).toBe(3);
  });
  it('transfiere mesa conservando productos, total, tiempo de apertura y mesero', async () => {
    const { pos } = await setup();
    const { a, b } = await layout(pos);
    const p = await product(pos),
      sale = await pos.tables.open(a);
    await pos.addProduct(sale, p);
    const waiter = await cashier(pos);
    await pos.tables.assignWaiter(sale, waiter);
    const before = (await pos.snapshot()).table!;
    await pos.tables.transfer(sale, b);
    const data = await pos.snapshot();
    expect(data.active.total).toBe(101);
    expect(data.table).toMatchObject({ table_id: b, opened_at: before.opened_at, sale_id: sale });
    expect(data.active.table_name).toBe('2');
    expect(data.active.waiter_id).toBe(waiter);
    expect(data.active.waiter_name).toBe('cashier');
    expect((await pos.tables.snapshot()).tables.find((t) => t.id === a)!.bill).toBeNull();
  });
  it('une sin duplicar líneas y registra origen; cobrar libera solo la cuenta liquidada', async () => {
    const { pos, db } = await setup();
    const { a, b } = await layout(pos);
    const p = await product(pos),
      source = await pos.tables.open(a);
    await pos.addProduct(source, p);
    const target = await pos.tables.open(b);
    await pos.addProduct(target, p);
    await pos.tables.merge(source, b);
    expect((await pos.snapshot()).active.id).toBe(target);
    expect((await pos.snapshot()).active.total).toBe(202);
    expect((await pos.snapshot()).lines.reduce((sum, l) => sum + l.quantity, 0)).toBe(2);
    await expect(pos.tables.merge(source, b)).rejects.toThrow('cerrada');
    expect((await pos.tables.snapshot()).tables.find((t) => t.id === a)!.bill).toBeNull();
    expect(
      (await pos.access.auditHistory()).find((e) => e.action === 'table.merge')!.details,
    ).toContain(source);
    await pos.checkout(target, 300);
    expect((await pos.tables.snapshot()).tables.every((t) => !t.bill)).toBe(true);
    expect((await pos.snapshot()).products[0].stock).toBe(18);
    await checks(db);
  });
  it('rechaza unir cuentas con cliente, descuento o impuesto distinto y no pierde líneas', async () => {
    const { pos } = await setup();
    const { a, b } = await layout(pos);
    const p = await product(pos),
      source = await pos.tables.open(a);
    await pos.addProduct(source, p);
    const target = await pos.tables.open(b);
    await pos.addProduct(target, p);
    await pos.updateTicket(target, { label: '', note: '', customerId: null, discountBps: 1000 });
    await expect(pos.tables.merge(source, b)).rejects.toThrow('mismo cliente');
    expect((await pos.tables.snapshot()).tables.filter((t) => t.bill)).toHaveLength(2);
    expect((await pos.snapshot()).lines).toHaveLength(1);
  });
  it('conserva todas las cuentas si una unión falla al persistir', async () => {
    const { pos, store, db } = await setup();
    const { a, b } = await layout(pos);
    const p = await product(pos),
      source = await pos.tables.open(a);
    await pos.addProduct(source, p);
    const target = await pos.tables.open(b);
    await pos.addProduct(target, p);
    const before = await pos.tables.snapshot(),
      audit = await pos.access.auditHistory();
    store.fail = true;
    await expect(pos.tables.merge(source, b)).rejects.toThrow('disk full');
    expect(await pos.tables.snapshot()).toEqual(before);
    expect(await pos.access.auditHistory()).toEqual(audit);
    expect(
      await db.read((sql) =>
        sql.query('SELECT COUNT(*) AS n FROM sale_lines WHERE sale_id=?', [source]),
      ),
    ).toEqual([{ n: 1 }]);
  });
  it('marcar cobro no paga ni mueve stock; editar líneas vuelve a atención normal', async () => {
    const { pos } = await setup();
    const { a } = await layout(pos);
    const p = await product(pos),
      id = await pos.tables.open(a);
    await pos.addProduct(id, p);
    await pos.tables.requestPayment(id, true);
    expect((await pos.snapshot()).table!.payment_requested).toBe(1);
    expect((await pos.snapshot()).products[0].stock).toBe(20);
    await pos.addProduct(id, p);
    expect((await pos.snapshot()).table!.payment_requested).toBe(0);
  });
  it('libera mesa vacía, exige autorización y motivo para cancelar una cuenta con productos', async () => {
    const { pos } = await setup();
    const { a } = await layout(pos);
    let id = await pos.tables.open(a);
    await pos.tables.releaseEmpty(id);
    expect((await pos.tables.snapshot()).tables.find((t) => t.id === a)!.bill).toBeNull();
    id = await pos.tables.open(a);
    await pos.addProduct(id, await product(pos));
    await expect(pos.tables.releaseEmpty(id)).rejects.toThrow('productos pendientes');
    await expect(pos.cancel(id)).rejects.toThrow('motivo');
    await pos.cancel(id, 'Cuenta cancelada por propietario');
    expect((await pos.tables.snapshot()).tables.find((t) => t.id === a)!.bill).toBeNull();
    expect((await pos.snapshot()).history).toHaveLength(0);
    expect((await pos.snapshot()).products[0].stock).toBe(20);
  });
  it('permisos del mapa se verifican en el dominio y el cajero no cambia el plano', async () => {
    const { pos } = await setup();
    const { a, b } = await layout(pos);
    const p = await product(pos);
    await cashier(pos);
    await pos.access.login('739154');
    await pos.restoreWorkspace();
    const bill = await pos.tables.open(a);
    await pos.addProduct(bill, p);
    await expect(pos.tables.position(a, 100, 100)).rejects.toThrow('Sin permiso');
    await expect(pos.tables.saveArea('No')).rejects.toThrow('Sin permiso');
    await expect(pos.tables.transfer(bill, b)).rejects.toThrow('Sin permiso');
    await expect(pos.cancel(bill, 'Intento no autorizado')).rejects.toThrow('Sin permiso');
  });
  it('cierra y reabre caja sin perder mesas; un fallo al cobrar no libera la mesa', async () => {
    const { pos, store } = await setup();
    const { a } = await layout(pos);
    const id = await pos.tables.open(a);
    await pos.addProduct(id, await product(pos));
    const shift = (await pos.snapshot()).shift!.id;
    await pos.cash.close(shift, 0, 0);
    await expect(pos.checkout(id, 101)).rejects.toThrow('turno está cerrado');
    expect((await pos.snapshot()).table!.sale_id).toBe(id);
    await pos.cash.open(0);
    store.fail = true;
    await expect(pos.checkout(id, 101)).rejects.toThrow('disk full');
    expect((await pos.snapshot()).table!.sale_id).toBe(id);
    store.fail = false;
    await pos.checkout(id, 101);
    expect((await pos.tables.snapshot()).tables[0].bill).toBeNull();
  });
  it('cambiar configuración guarda el modo, protege mesas abiertas y respeta límites del plano', async () => {
    const { pos } = await setup();
    const { a } = await layout(pos);
    await pos.tables.open(a);
    await expect(
      pos.saveBusiness({ ...(await pos.snapshot()).business, operationMode: 'quick' }),
    ).rejects.toThrow('Liquida');
    await pos.tables.releaseEmpty((await pos.snapshot()).active.id);
    await pos.saveBusiness({ ...(await pos.snapshot()).business, operationMode: 'quick' });
    await expect(pos.setMode('tables')).rejects.toThrow('desactivado');
    await expect(pos.tables.position(a, 999, 0)).rejects.toThrow('rango');
  });
  it('migración 3→4 es repetible y revierte todo si falla el guardado', async () => {
    const store = memory(),
      db = new Database(new WasmDriver(sqlite, store));
    await migrate(db, 3);
    await db.transaction((sql) =>
      sql.run(
        "INSERT INTO products(id,name,price,photo,stock) VALUES('old','Anterior',100,'foto anterior',5)",
      ),
    );
    store.fail = true;
    await expect(migrate(db)).rejects.toThrow('disk full');
    expect(await db.read((sql) => sql.query('PRAGMA user_version'))).toEqual([{ user_version: 3 }]);
    store.fail = false;
    await migrate(db);
    await migrate(db);
    expect(await db.read((sql) => sql.query('SELECT name,photo,stock FROM products'))).toEqual([
      { name: 'Anterior', photo: 'foto anterior', stock: 5 },
    ]);
    await checks(db);
  });
});
