import type { Database, SqlDriver } from '../db/database';
import type { AccessControl } from './access';
import { audit, newId, textRequired, timestamp } from './shared';
import { integer } from './money';
import { activateSale, business, linesFor, newDraft, recalculate, saleById } from './sales';
import type { SaleLine } from './types';

export interface DiningArea {
  id: string;
  name: string;
  active: number;
}
export interface DiningTable {
  id: string;
  area_id: string;
  name: string;
  shape: 'round' | 'square' | 'rectangle';
  x: number;
  y: number;
  width: number;
  height: number;
  capacity: number;
  active: number;
}
export interface TableContext {
  id: string;
  table_id: string;
  sale_id: string;
  name: string;
  area_name: string;
  opened_at: string;
  payment_requested: number;
}
export interface TableBill extends TableContext {
  total: number;
  waiter_id: string | null;
  waiter_name: string;
  number: number;
}
export interface MapTable extends DiningTable {
  bill: TableBill | null;
}
export interface TableInput {
  id?: string;
  area_id: string;
  name: string;
  shape: DiningTable['shape'];
  x: number;
  y: number;
  width: number;
  height: number;
  capacity: number;
}
async function context(sql: SqlDriver, saleId: string) {
  const [row] = await sql.query<TableContext>(
    `SELECT ts.*,t.name,a.name AS area_name FROM table_sessions ts JOIN dining_tables t ON t.id=ts.table_id JOIN dining_areas a ON a.id=t.area_id WHERE ts.sale_id=? AND ts.closed_at IS NULL`,
    [saleId],
  );
  if (!row) throw new Error('La cuenta de mesa ya está cerrada.');
  return row;
}
async function table(sql: SqlDriver, id: string) {
  const [row] = await sql.query<DiningTable>(
    'SELECT t.* FROM dining_tables t JOIN dining_areas a ON a.id=t.area_id WHERE t.id=? AND t.active=1 AND a.active=1',
    [id],
  );
  if (!row) throw new Error('La mesa o su área ya no están disponibles.');
  return row;
}
export class Tables {
  constructor(
    private readonly db: Database,
    private readonly access: AccessControl,
  ) {}
  snapshot() {
    return this.db.read(async (sql) => {
      const actor = await this.access.require(sql, 'tables');
      const areas = await sql.query<DiningArea>(
        'SELECT * FROM dining_areas WHERE active=1 ORDER BY name COLLATE NOCASE',
      );
      const tables = await sql.query<DiningTable>(
        'SELECT * FROM dining_tables WHERE active=1 ORDER BY name COLLATE NOCASE',
      );
      const bills = await sql.query<TableBill>(
        `SELECT ts.id,ts.table_id,ts.sale_id,ts.opened_at,ts.payment_requested,t.name,a.name AS area_name,s.total,s.waiter_id,s.waiter_name,s.number FROM table_sessions ts JOIN dining_tables t ON t.id=ts.table_id JOIN dining_areas a ON a.id=t.area_id JOIN sales s ON s.id=ts.sale_id WHERE ts.closed_at IS NULL`,
      );
      const staff = actor.permissions.includes('table_transfer')
        ? await sql.query<{ id: string; name: string }>(
            "SELECT e.id,e.name FROM employees e WHERE active=1 AND EXISTS(SELECT 1 FROM employee_permissions p WHERE p.employee_id=e.id AND p.permission='tables' AND p.allowed=1) ORDER BY e.name COLLATE NOCASE",
          )
        : [];
      return {
        areas,
        tables: tables.map((t) => ({ ...t, bill: bills.find((b) => b.table_id === t.id) || null })),
        staff,
      };
    });
  }
  saveArea(name: string, id?: string) {
    name = textRequired(name, 'el nombre del área', 80);
    return this.db.transaction(async (sql) => {
      const actor = await this.access.require(sql, 'table_layout');
      if (
        id &&
        !(await sql.query('SELECT id FROM dining_areas WHERE id=? AND active=1', [id])).length
      )
        throw new Error('Área no disponible.');
      const [old] = await sql.query<DiningArea>(
        'SELECT * FROM dining_areas WHERE name=? COLLATE NOCASE',
        [name],
      );
      const key = id || (old?.active === 0 ? old.id : newId());
      await sql.run(
        'INSERT INTO dining_areas(id,name,active) VALUES(?,?,1) ON CONFLICT(id) DO UPDATE SET name=excluded.name,active=1',
        [key, name],
      );
      await audit(sql, actor, 'table.area_save', key, { name });
      return key;
    });
  }
  deleteArea(id: string) {
    return this.db.transaction(async (sql) => {
      const actor = await this.access.require(sql, 'table_layout');
      if (
        (await sql.query('SELECT id FROM dining_tables WHERE area_id=? AND active=1', [id])).length
      )
        throw new Error('Mueve o elimina las mesas del área antes de eliminarla.');
      await sql.run('UPDATE dining_areas SET active=0 WHERE id=?', [id]);
      await audit(sql, actor, 'table.area_delete', id);
    });
  }
  save(input: TableInput) {
    const name = textRequired(input.name, 'el nombre de la mesa', 80);
    if (!['round', 'square', 'rectangle'].includes(input.shape))
      throw new Error('Forma de mesa no válida.');
    integer(input.capacity, 1, 100);
    integer(input.width, 64, 280);
    integer(input.height, 64, 240);
    if (input.shape !== 'rectangle' && input.width !== input.height)
      throw new Error('Las mesas redondas y cuadradas necesitan el mismo ancho y alto.');
    integer(input.x, 0, 1000 - input.width);
    integer(input.y, 0, 600 - input.height);
    return this.db.transaction(async (sql) => {
      const actor = await this.access.require(sql, 'table_layout');
      if (
        !(await sql.query('SELECT id FROM dining_areas WHERE id=? AND active=1', [input.area_id]))
          .length
      )
        throw new Error('Selecciona un área disponible.');
      if (input.id) await table(sql, input.id);
      const id = input.id || newId();
      await sql.run(
        `INSERT INTO dining_tables(id,area_id,name,shape,x,y,width,height,capacity) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET area_id=excluded.area_id,name=excluded.name,shape=excluded.shape,x=excluded.x,y=excluded.y,width=excluded.width,height=excluded.height,capacity=excluded.capacity`,
        [
          id,
          input.area_id,
          name,
          input.shape,
          input.x,
          input.y,
          input.width,
          input.height,
          input.capacity,
        ],
      );
      await sql.run(
        'UPDATE sales SET table_name=?,label=? WHERE id IN (SELECT sale_id FROM table_sessions WHERE table_id=? AND closed_at IS NULL)',
        [name, `Mesa ${name}`, id],
      );
      await audit(sql, actor, 'table.layout_save', id, { ...input, name });
      return id;
    });
  }
  position(id: string, x: number, y: number) {
    return this.db.transaction(async (sql) => {
      const actor = await this.access.require(sql, 'table_layout');
      const current = await table(sql, id);
      integer(x, 0, 1000 - current.width);
      integer(y, 0, 600 - current.height);
      await sql.run('UPDATE dining_tables SET x=?,y=? WHERE id=?', [x, y, id]);
      await audit(sql, actor, 'table.move', id, {
        before: { x: current.x, y: current.y },
        after: { x, y },
      });
    });
  }
  delete(id: string) {
    return this.db.transaction(async (sql) => {
      const actor = await this.access.require(sql, 'table_layout');
      await table(sql, id);
      if (
        (
          await sql.query('SELECT id FROM table_sessions WHERE table_id=? AND closed_at IS NULL', [
            id,
          ])
        ).length
      )
        throw new Error('No puedes eliminar una mesa con cuenta abierta.');
      await sql.run('UPDATE dining_tables SET active=0 WHERE id=?', [id]);
      await audit(sql, actor, 'table.delete', id);
    });
  }
  open(id: string) {
    return this.db.transaction(async (sql) => {
      const actor = await this.access.require(sql, 'sell', 'tables');
      if ((await business(sql)).operationMode === 'quick')
        throw new Error('El modo restaurante está desactivado.');
      const selected = await table(sql, id);
      const [old] = await sql.query<{ sale_id: string }>(
        'SELECT sale_id FROM table_sessions WHERE table_id=? AND closed_at IS NULL',
        [id],
      );
      let saleId = old?.sale_id;
      if (!saleId) {
        saleId = await newDraft(sql, actor.id, false);
        await sql.run(
          'UPDATE sales SET table_name=?,label=?,waiter_id=?,waiter_name=? WHERE id=?',
          [selected.name, `Mesa ${selected.name}`, actor.id, actor.name, saleId],
        );
        await sql.run('INSERT INTO table_sessions(id,table_id,sale_id,opened_at) VALUES(?,?,?,?)', [
          newId(),
          id,
          saleId,
          timestamp(),
        ]);
        await audit(sql, actor, 'table.open', saleId, { tableId: id, name: selected.name });
      }
      await activateSale(sql, actor.id, saleId);
      await sql.run(
        "UPDATE employee_workspace SET mode='tables',table_view='bill' WHERE employee_id=?",
        [actor.id],
      );
      return saleId;
    });
  }
  requestPayment(saleId: string, requested: boolean) {
    return this.db.transaction(async (sql) => {
      const actor = await this.access.require(sql, 'sell', 'tables');
      await context(sql, saleId);
      await sql.run(
        'UPDATE table_sessions SET payment_requested=? WHERE sale_id=? AND closed_at IS NULL',
        [requested ? 1 : 0, saleId],
      );
      await audit(sql, actor, 'table.request_payment', saleId, { requested });
    });
  }
  transfer(saleId: string, targetTableId: string) {
    return this.db.transaction(async (sql) => {
      const actor = await this.access.require(sql, 'tables', 'table_transfer');
      const current = await context(sql, saleId);
      const target = await table(sql, targetTableId);
      if (current.table_id === targetTableId) return;
      if (
        (
          await sql.query('SELECT id FROM table_sessions WHERE table_id=? AND closed_at IS NULL', [
            targetTableId,
          ])
        ).length
      )
        throw new Error(
          'La mesa de destino está ocupada. Usa Unir cuentas para reunir sus productos.',
        );
      await sql.run('UPDATE table_sessions SET table_id=? WHERE id=?', [targetTableId, current.id]);
      await sql.run('UPDATE sales SET table_name=?,label=?,updated_at=? WHERE id=?', [
        target.name,
        `Mesa ${target.name}`,
        timestamp(),
        saleId,
      ]);
      await audit(sql, actor, 'table.transfer', saleId, {
        from: current.table_id,
        to: targetTableId,
        fromName: current.name,
        toName: target.name,
      });
    });
  }
  assignWaiter(saleId: string, employeeId: string) {
    return this.db.transaction(async (sql) => {
      const actor = await this.access.require(sql, 'tables', 'table_transfer');
      await context(sql, saleId);
      const [staff] = await sql.query<{ name: string }>(
        "SELECT name FROM employees e WHERE id=? AND active=1 AND EXISTS(SELECT 1 FROM employee_permissions p WHERE p.employee_id=e.id AND p.permission='tables' AND p.allowed=1)",
        [employeeId],
      );
      if (!staff) throw new Error('Selecciona un empleado activo con permiso para atender mesas.');
      await sql.run('UPDATE sales SET waiter_id=?,waiter_name=?,updated_at=? WHERE id=?', [
        employeeId,
        staff.name,
        timestamp(),
        saleId,
      ]);
      await audit(sql, actor, 'table.waiter', saleId, { employeeId, name: staff.name });
    });
  }
  merge(sourceSaleId: string, targetTableId: string) {
    return this.db.transaction(async (sql) => {
      const actor = await this.access.require(sql, 'sell', 'tables', 'table_transfer');
      const sourceContext = await context(sql, sourceSaleId);
      if (sourceContext.table_id === targetTableId) throw new Error('Elige otra mesa.');
      const [targetContext] = await sql.query<{ sale_id: string }>(
        'SELECT sale_id FROM table_sessions WHERE table_id=? AND closed_at IS NULL',
        [targetTableId],
      );
      if (!targetContext)
        throw new Error(
          'La mesa de destino no tiene cuenta. Para una mesa disponible usa Transferir mesa.',
        );
      const source = await saleById(sql, sourceSaleId);
      const target = await saleById(sql, targetContext.sale_id);
      if (
        source.tax_bps !== target.tax_bps ||
        source.discount_bps !== target.discount_bps ||
        source.customer_id !== target.customer_id
      )
        throw new Error(
          'Las cuentas deben tener el mismo cliente, descuento e impuesto antes de unirlas.',
        );
      const lines = await linesFor(sql, sourceSaleId);
      if (!lines.length)
        throw new Error('La cuenta de origen no tiene productos. Puedes liberar la mesa vacía.');
      await sql.run('UPDATE sale_lines SET sale_id=? WHERE sale_id=?', [target.id, sourceSaleId]);
      await recalculate(sql, target.id);
      await sql.run("UPDATE sales SET status='cancelled',merged_into=?,updated_at=? WHERE id=?", [
        target.id,
        timestamp(),
        sourceSaleId,
      ]);
      await sql.run('UPDATE table_sessions SET closed_at=? WHERE id=?', [
        timestamp(),
        sourceContext.id,
      ]);
      await activateSale(sql, actor.id, target.id);
      await sql.run(
        "UPDATE employee_workspace SET mode='tables',table_view='bill' WHERE employee_id=?",
        [actor.id],
      );
      await audit(sql, actor, 'table.merge', sourceSaleId, {
        targetSaleId: target.id,
        sourceTotal: source.total,
        targetTotal: target.total,
        lines: lines.map((line: SaleLine) => ({ ...line })),
      });
    });
  }
  releaseEmpty(saleId: string) {
    return this.db.transaction(async (sql) => {
      const actor = await this.access.require(sql, 'sell', 'tables');
      const current = await context(sql, saleId);
      if ((await linesFor(sql, saleId)).length)
        throw new Error(
          'La mesa tiene productos pendientes. Cobra o solicita una liberación administrativa con motivo.',
        );
      await sql.run("UPDATE sales SET status='cancelled',updated_at=? WHERE id=?", [
        timestamp(),
        saleId,
      ]);
      await sql.run('UPDATE table_sessions SET closed_at=? WHERE id=?', [timestamp(), current.id]);
      const [active] = await sql.query<{ value: string }>(
        "SELECT value FROM settings WHERE key='activeSale'",
      );
      if (active.value === saleId) await newDraft(sql, actor.id);
      await sql.run("UPDATE employee_workspace SET table_view='map' WHERE employee_id=?", [
        actor.id,
      ]);
      await audit(sql, actor, 'table.release_empty', saleId);
    });
  }
}
