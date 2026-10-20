import type { Database, SqlDriver } from '../db/database';
import type { AccessControl } from './access';
import type { Actor } from './access-types';
import type { Business, PaymentMethod, Sale } from './types';
import { integer, MAX_CENTS } from './money';
import { audit, newId, textRequired, timestamp } from './shared';

export interface Shift {
  id: string;
  status: 'open' | 'closed';
  opening: number;
  opening_usd: number;
  exchange_rate: number | null;
  expected_usd: number | null;
  counted_usd: number | null;
  difference_usd: number | null;
  opened_by: string;
  opened_name: string;
  opened_at: string;
  closed_by: string | null;
  closed_name: string | null;
  closed_at: string | null;
  expected: number | null;
  counted: number | null;
  difference: number | null;
}
export interface CashMovement {
  id: string;
  shift_id: string;
  employee_id: string;
  employee_name: string;
  kind: 'in' | 'out' | 'withdrawal';
  amount: number;
  currency: 'MXN' | 'USD';
  reason: string;
  created_at: string;
}
export interface ShiftReport {
  shift: Shift;
  payments: { method: PaymentMethod; amount: number }[];
  sales: Sale[];
  movements: CashMovement[];
  expected: number;
  cashSales: number;
  incoming: number;
  outgoing: number;
  expectedUsd: number;
  incomingUsd: number;
  outgoingUsd: number;
}

export async function shiftReport(sql: SqlDriver, id: string): Promise<ShiftReport> {
  const [shift] = await sql.query<Shift>('SELECT * FROM shifts WHERE id=?', [id]);
  if (!shift) throw new Error('Turno no disponible.');
  const payments = await sql.query<{ method: PaymentMethod; amount: number }>(
    "SELECT p.method,SUM(p.amount) AS amount FROM payments p JOIN sales s ON s.id=p.sale_id WHERE s.shift_id=? AND s.status='paid' GROUP BY p.method",
    [id],
  );
  const movements = await sql.query<CashMovement>(
    'SELECT * FROM cash_movements WHERE shift_id=? ORDER BY rowid',
    [id],
  );
  const sales = await sql.query<Sale>(
    "SELECT * FROM sales WHERE shift_id=? AND status='paid' ORDER BY paid_at",
    [id],
  );
  const cashSales = payments.find((payment) => payment.method === 'cash')?.amount || 0;
  const incoming = movements
    .filter((move) => move.kind === 'in' && move.currency === 'MXN')
    .reduce((sum, move) => sum + move.amount, 0);
  const outgoing = movements
    .filter((move) => move.kind !== 'in' && move.currency === 'MXN')
    .reduce((sum, move) => sum + move.amount, 0);
  const expected = shift.opening + cashSales + incoming - outgoing;
  integer(expected);
  const incomingUsd = movements
    .filter((move) => move.currency === 'USD' && move.kind === 'in')
    .reduce((n, m) => n + m.amount, 0);
  const outgoingUsd = movements
    .filter((move) => move.currency === 'USD' && move.kind !== 'in')
    .reduce((n, m) => n + m.amount, 0);
  const expectedUsd = integer(shift.opening_usd + incomingUsd - outgoingUsd);
  return {
    shift,
    payments,
    movements,
    sales,
    expected,
    cashSales,
    incoming,
    outgoing,
    expectedUsd,
    incomingUsd,
    outgoingUsd,
  };
}
export async function checkoutShift(sql: SqlDriver, cashAmount: number) {
  const [shift] = await sql.query<Shift>("SELECT * FROM shifts WHERE status='open'");
  if (!shift) throw new Error('El turno está cerrado. Abre la caja antes de cobrar.');
  const report = await shiftReport(sql, shift.id);
  if (report.expected + cashAmount > MAX_CENTS)
    throw new Error('Registra un retiro: el efectivo del turno excedería el límite permitido.');
  return shift.id;
}

export class Cash {
  constructor(
    private readonly db: Database,
    private readonly access: AccessControl,
  ) {}
  snapshot() {
    return this.db.read(async (sql) => {
      const actor = await this.access.require(sql);
      if (
        !actor.permissions.some((permission) =>
          ['reports', 'open_cash', 'close_cash', 'cash_moves'].includes(permission),
        )
      )
        throw new Error('Sin permiso para consultar la caja.');
      const [current] = await sql.query<Shift>("SELECT * FROM shifts WHERE status='open'");
      const history = actor.permissions.includes('reports')
        ? await sql.query<Shift>(
            "SELECT * FROM shifts WHERE status='closed' ORDER BY closed_at DESC",
          )
        : [];
      const canReport = actor.permissions.includes('reports');
      const canCount =
        canReport ||
        actor.permissions.includes('close_cash') ||
        actor.permissions.includes('cash_moves');
      const report = current && canCount ? await shiftReport(sql, current.id) : null;
      return {
        current: current
          ? {
              shift: current,
              expected: report?.expected ?? null,
              expectedUsd: report?.expectedUsd ?? null,
            }
          : null,
        report: canReport ? report : null,
        history,
      };
    });
  }
  getReport(id: string) {
    return this.db.read(async (sql) => {
      await this.access.require(sql, 'reports');
      const report = await shiftReport(sql, id);
      return report;
    });
  }
  open(opening: number, openingUsd = 0, exchangeRate?: number) {
    integer(opening);
    integer(openingUsd);
    if (exchangeRate !== undefined) integer(exchangeRate, 1, 99999999);
    return this.db.transaction(async (sql) => {
      const actor = await this.access.require(sql, 'open_cash');
      const [saved] = await sql.query<{ value: string }>(
        "SELECT value FROM settings WHERE key='business'",
      );
      const b = JSON.parse(saved.value) as Business;
      const rate = exchangeRate ?? b.exchangeRate ?? null;
      if (openingUsd > 0 && !rate)
        throw new Error('Configura el tipo de cambio antes de registrar un fondo en dólares.');
      if (exchangeRate !== undefined && exchangeRate !== b.exchangeRate) {
        await this.access.require(sql, 'settings');
        await sql.run("UPDATE settings SET value=? WHERE key='business'", [
          JSON.stringify({ ...b, exchangeRate: rate, cashManagement: true }),
        ]);
        await audit(sql, actor, 'business.exchange_rate', 'business', { exchangeRate: rate });
      }
      if ((await sql.query<Shift>("SELECT * FROM shifts WHERE status='open'")).length)
        throw new Error('Ya existe un turno abierto.');
      const id = newId();
      await sql.run(
        "INSERT INTO shifts(id,status,opening,opening_usd,exchange_rate,opened_by,opened_name,opened_at) VALUES(?,'open',?,?,?,?,?,?)",
        [id, opening, openingUsd, rate, actor.id, actor.name, timestamp()],
      );
      await audit(sql, actor, 'cash.open', id, { opening, openingUsd, exchangeRate: rate });
      return id;
    });
  }
  move(input: {
    shiftId: string;
    kind: 'in' | 'out' | 'withdrawal';
    amount: number;
    currency?: 'MXN' | 'USD';
    reason: string;
  }) {
    integer(input.amount, 1);
    const currency = input.currency || 'MXN';
    if (!['MXN', 'USD'].includes(currency)) throw new Error('Moneda no válida.');
    const reason = textRequired(input.reason, 'el motivo', 500);
    if (!['in', 'out', 'withdrawal'].includes(input.kind))
      throw new Error('Movimiento de caja no válido.');
    return this.db.transaction(async (sql) => {
      const actor = await this.access.require(sql, 'cash_moves');
      const report = await shiftReport(sql, input.shiftId);
      if (report.shift.status !== 'open') throw new Error('El turno está cerrado.');
      const next =
        (currency === 'USD' ? report.expectedUsd : report.expected) +
        (input.kind === 'in' ? input.amount : -input.amount);
      if (next < 0) throw new Error('El movimiento supera el efectivo esperado en caja.');
      integer(next);
      const id = newId();
      await sql.run(
        'INSERT INTO cash_movements(id,shift_id,employee_id,employee_name,kind,amount,reason,created_at,currency) VALUES(?,?,?,?,?,?,?,?,?)',
        [
          id,
          input.shiftId,
          actor.id,
          actor.name,
          input.kind,
          input.amount,
          reason,
          timestamp(),
          currency,
        ],
      );
      await audit(sql, actor, `cash.${input.kind}`, id, {
        shiftId: input.shiftId,
        amount: input.amount,
        currency,
      });
      return id;
    });
  }
  close(id: string, counted: number, countedUsd?: number) {
    integer(counted);
    if (countedUsd !== undefined) integer(countedUsd);
    return this.db.transaction(async (sql) => {
      const actor: Actor = await this.access.require(sql, 'close_cash');
      const report = await shiftReport(sql, id);
      if (report.shift.status === 'closed')
        return { shift: report.shift, expected: report.expected };
      if (report.expectedUsd > 0 && countedUsd === undefined)
        throw new Error('Cuenta también el efectivo en dólares antes de cerrar.');
      await sql.run(
        "UPDATE shifts SET status='closed',closed_by=?,closed_name=?,closed_at=?,expected=?,counted=?,difference=?,expected_usd=?,counted_usd=?,difference_usd=? WHERE id=?",
        [
          actor.id,
          actor.name,
          timestamp(),
          report.expected,
          counted,
          counted - report.expected,
          report.expectedUsd,
          countedUsd ?? 0,
          (countedUsd ?? 0) - report.expectedUsd,
          id,
        ],
      );
      await audit(sql, actor, 'cash.close', id, {
        expected: report.expected,
        counted,
        difference: counted - report.expected,
        expectedUsd: report.expectedUsd,
        countedUsd: countedUsd ?? 0,
        differenceUsd: (countedUsd ?? 0) - report.expectedUsd,
      });
      const [shift] = await sql.query<Shift>('SELECT * FROM shifts WHERE id=?', [id]);
      return { shift, expected: report.expected };
    });
  }
}
