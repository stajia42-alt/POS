import { useState, type FormEvent } from 'react';
import { money, parseMoney, currencyMoney } from '../domain/money';
import { PAYMENT_LABELS } from '../domain/payments';
import type { ShiftReport } from '../domain/cash';
import { Modal } from './Modal';
import { useModule } from './useModule';
import type { ModuleProps } from './moduleTypes';
const MOVES = { in: 'Ingreso', out: 'Egreso', withdrawal: 'Retiro' } as const;
const date = (value: string) => new Date(value).toLocaleString('es-MX');
function Report({ report }: { report: ShiftReport }) {
  const { shift } = report;
  return (
    <div className="shift-report">
      <p>
        Apertura: {date(shift.opened_at)} · {shift.opened_name}
      </p>
      {shift.closed_at && (
        <p>
          Cierre: {date(shift.closed_at)} · {shift.closed_name}
        </p>
      )}
      <dl className="report-totals">
        <div>
          <dt>Fondo inicial</dt>
          <dd>{money(shift.opening)}</dd>
        </div>
        <div>
          <dt>Ventas en efectivo</dt>
          <dd>{money(report.cashSales)}</dd>
        </div>
        <div>
          <dt>Ingresos de efectivo</dt>
          <dd>{money(report.incoming)}</dd>
        </div>
        <div>
          <dt>Egresos y retiros</dt>
          <dd>{money(report.outgoing)}</dd>
        </div>
        <div className="report-total">
          <dt>Efectivo esperado</dt>
          <dd>{money(shift.expected ?? report.expected)}</dd>
        </div>
        {shift.counted !== null && (
          <>
            <div>
              <dt>Efectivo contado</dt>
              <dd>{money(shift.counted)}</dd>
            </div>
            <div>
              <dt>
                {(shift.difference || 0) < 0
                  ? 'Faltante'
                  : (shift.difference || 0) > 0
                    ? 'Sobrante'
                    : 'Diferencia'}
              </dt>
              <dd>{money(Math.abs(shift.difference || 0))}</dd>
            </div>
          </>
        )}
      </dl>
      <h3>Fondo y movimientos USD</h3>
      <dl className="report-totals">
        <div>
          <dt>Fondo inicial USD</dt>
          <dd>{currencyMoney(shift.opening_usd, 'USD')}</dd>
        </div>
        <div>
          <dt>Ingresos USD</dt>
          <dd>{currencyMoney(report.incomingUsd, 'USD')}</dd>
        </div>
        <div>
          <dt>Egresos y retiros USD</dt>
          <dd>{currencyMoney(report.outgoingUsd, 'USD')}</dd>
        </div>
        <div>
          <dt>Efectivo esperado USD</dt>
          <dd>{currencyMoney(shift.expected_usd ?? report.expectedUsd, 'USD')}</dd>
        </div>
        {shift.counted_usd !== null && (
          <>
            <div>
              <dt>Efectivo contado USD</dt>
              <dd>{currencyMoney(shift.counted_usd, 'USD')}</dd>
            </div>
            <div>
              <dt>Diferencia USD</dt>
              <dd>{currencyMoney(shift.difference_usd ?? 0, 'USD')}</dd>
            </div>
          </>
        )}
      </dl>
      <p className="field-hint">
        Tipo de cambio de apertura:{' '}
        {shift.exchange_rate
          ? (shift.exchange_rate / 10000).toFixed(4) + ' MXN / USD'
          : 'Sin configurar'}
        . Los cobros en USD están pendientes; aquí se registran fondos y movimientos físicos en USD.
      </p>
      <dl className="report-totals">
        <div>
          <dt>Descuentos de ventas</dt>
          <dd>{money(report.sales.reduce((sum, sale) => sum + sale.discount, 0))}</dd>
        </div>
      </dl>
      <h3>Ventas por método de pago</h3>
      {report.payments.length ? (
        <dl className="report-totals">
          {report.payments.map((payment) => (
            <div key={payment.method}>
              <dt>{PAYMENT_LABELS[payment.method]}</dt>
              <dd>{money(payment.amount)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="field-hint">Sin ventas cobradas en este turno.</p>
      )}
      <h3>Movimientos de efectivo</h3>
      <div className="table-scroll">
        <table className="module-table">
          <thead>
            <tr>
              <th>Fecha y empleado</th>
              <th>Concepto</th>
              <th>Importe</th>
            </tr>
          </thead>
          <tbody>
            {report.movements.map((move) => (
              <tr key={move.id}>
                <td>
                  {date(move.created_at)}
                  <small>{move.employee_name}</small>
                </td>
                <td>
                  {MOVES[move.kind]}
                  <small>{move.reason}</small>
                </td>
                <td>{currencyMoney(move.amount, move.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Ventas del turno · {report.sales.length}</h3>
      <div className="table-scroll">
        <table className="module-table">
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Empleado</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {report.sales.map((sale) => (
              <tr key={sale.id}>
                <td>
                  #{String(sale.number).padStart(4, '0')}
                  <small>{sale.paid_at ? date(sale.paid_at) : ''}</small>
                </td>
                <td>{sale.employee_name || 'Sin registro'}</td>
                <td>{money(sale.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
export function CashPanel({
  pos,
  actor,
  onChanged,
  onLock,
  enabled,
}: ModuleProps & { enabled: boolean }) {
  const [dialog, setDialog] = useState<'open' | 'move' | 'close' | null>(null);
  const [historical, setHistorical] = useState<ShiftReport>();
  const [counted, setCounted] = useState('');
  const [countedUsd, setCountedUsd] = useState('0.00');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const { data, error, notice, busy, run, setError } = useModule(
    () => pos.cash.snapshot(),
    onChanged,
    onLock,
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const action =
        dialog === 'open'
          ? () => pos.cash.open(parseMoney(String(form.get('amount'))))
          : dialog === 'close'
            ? () =>
                pos.cash.close(data!.current!.shift.id, parseMoney(counted), parseMoney(countedUsd))
            : () =>
                pos.cash.move({
                  shiftId: data!.current!.shift.id,
                  kind: form.get('kind') as 'in' | 'out' | 'withdrawal',
                  amount: parseMoney(String(form.get('amount'))),
                  reason: String(form.get('reason')),
                  currency: form.get('currency') as 'MXN' | 'USD',
                });
      if (
        await run(
          action,
          dialog === 'close' ? 'Turno cerrado y arqueo guardado' : 'Operación de caja guardada',
        )
      )
        setDialog(null);
    } catch (error) {
      setError((error as Error).message);
    }
  }
  const open = (value: 'open' | 'move' | 'close') => {
    setError('');
    setCounted('');
    setCountedUsd('0.00');
    setDialog(value);
  };
  const history = data?.history.filter(
    (shift) =>
      (!from || new Date(shift.closed_at!).toLocaleDateString('en-CA') >= from) &&
      (!to || new Date(shift.closed_at!).toLocaleDateString('en-CA') <= to),
  );
  let difference: number | undefined;
  try {
    if (counted && data?.current) difference = parseMoney(counted) - data.current.expected!;
  } catch {
    /* The form will show validation on submit. */
  }
  return (
    <section className="admin-content">
      <div className="section-heading">
        <div>
          <h1>Caja y turnos</h1>
          <p>Control de efectivo y arqueos por empleado</p>
        </div>
      </div>
      {!dialog && error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="module-notice">
          {notice}
        </p>
      )}
      {data ? (
        data.current ? (
          <>
            <div className="cash-status">
              <strong>Turno abierto</strong>
              <div className="module-actions">
                {actor.permissions.includes('reports') && (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        async () => setHistorical(await pos.cash.getReport(data.current!.shift.id)),
                        'Corte consultado; el turno sigue abierto',
                      )
                    }
                  >
                    Corte de consulta
                  </button>
                )}
                {actor.permissions.includes('cash_moves') && (
                  <button className="secondary" onClick={() => open('move')}>
                    Movimiento de caja
                  </button>
                )}
                {actor.permissions.includes('close_cash') && (
                  <button className="primary" onClick={() => open('close')}>
                    Cerrar turno
                  </button>
                )}
              </div>
            </div>
            {data.report ? (
              <Report report={data.report} />
            ) : (
              <>
                <p>
                  Apertura: {date(data.current.shift.opened_at)} · {data.current.shift.opened_name}
                </p>
                {data.current.expected !== null && (
                  <p>
                    Efectivo esperado: <strong>{money(data.current.expected)}</strong>
                  </p>
                )}
              </>
            )}
          </>
        ) : (
          <div className="settings-note">
            <div>
              <h2>El turno está cerrado</h2>
              <p>Abre el turno para continuar. Las cuentas pendientes y las mesas se conservan.</p>
              {enabled && actor.permissions.includes('open_cash') && (
                <button className="primary" onClick={() => open('open')}>
                  Abrir turno
                </button>
              )}
            </div>
          </div>
        )
      ) : (
        <p>Cargando caja…</p>
      )}
      {actor.permissions.includes('reports') && (
        <>
          <h2>Historial de cierres</h2>
          <div className="form-row module-filters">
            <label>
              Cierre desde
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label>
              Cierre hasta
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
          <div className="data-list">
            {history?.map((shift) => (
              <button
                className="catalog-row"
                key={shift.id}
                disabled={busy}
                onClick={() =>
                  void run(
                    async () => setHistorical(await pos.cash.getReport(shift.id)),
                    'Cierre consultado',
                  )
                }
              >
                <div className="grow">
                  <strong>{date(shift.closed_at!)}</strong>
                  <small>
                    {shift.closed_name} · Apertura {date(shift.opened_at)}
                  </small>
                </div>
                <span>
                  Contado {money(shift.counted!)}
                  <small>Diferencia {money(shift.difference!)}</small>
                </span>
              </button>
            ))}
          </div>
          {history?.length === 0 && <p className="field-hint">Sin cierres para estas fechas.</p>}
        </>
      )}
      {historical && (
        <Modal
          wide
          title={historical.shift.status === 'open' ? 'Corte de consulta' : 'Reporte de cierre'}
          onClose={() => setHistorical(undefined)}
        >
          <div className="form-body">
            <Report report={historical} />
          </div>
        </Modal>
      )}
      {dialog && (
        <Modal
          title={
            dialog === 'open'
              ? 'Apertura de turno'
              : dialog === 'close'
                ? 'Arqueo y cierre de turno'
                : 'Movimiento de caja'
          }
          onClose={() => {
            if (!busy) setDialog(null);
          }}
        >
          {error && (
            <p role="alert" className="inline-error">
              {error}
            </p>
          )}
          <form className="form-body" onSubmit={(event) => void submit(event)}>
            {dialog === 'move' && (
              <label>
                Tipo de movimiento
                <select aria-label="Tipo de movimiento" name="kind">
                  {Object.entries(MOVES).map(([key, label]) => (
                    <option value={key} key={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {dialog === 'close' ? (
              <>
                <p>
                  Efectivo esperado: <strong>{money(data!.current!.expected!)}</strong>
                </p>
                <label>
                  Efectivo contado (MXN)
                  <input
                    inputMode="decimal"
                    required
                    value={counted}
                    onChange={(e) => setCounted(e.target.value)}
                  />
                </label>
                <p>
                  Efectivo esperado USD:{' '}
                  <strong>{currencyMoney(data!.current!.expectedUsd!, 'USD')}</strong>
                </p>
                <label>
                  Efectivo contado (USD)
                  <input
                    inputMode="decimal"
                    required
                    value={countedUsd}
                    onChange={(e) => setCountedUsd(e.target.value)}
                  />
                </label>
                {difference !== undefined && (
                  <p role="status">
                    {difference < 0 ? 'Faltante' : difference > 0 ? 'Sobrante' : 'Diferencia'}:{' '}
                    {money(Math.abs(difference))}
                  </p>
                )}
                <p className="field-hint">
                  Confirma el efectivo contado. El cierre quedará guardado y será necesario abrir
                  otro turno para seguir cobrando.
                </p>
              </>
            ) : (
              <label>
                {dialog === 'open' ? 'Fondo inicial de caja (MXN)' : 'Importe del movimiento'}
                <input
                  name="amount"
                  required
                  inputMode="decimal"
                  defaultValue={dialog === 'open' ? '0.00' : ''}
                />
              </label>
            )}
            {dialog === 'move' && (
              <label>
                Moneda del movimiento
                <select name="currency" aria-label="Moneda del movimiento">
                  <option value="MXN">MXN · Pesos</option>
                  <option value="USD">USD · Dólares</option>
                </select>
              </label>
            )}
            {dialog === 'move' && (
              <label>
                Motivo
                <input name="reason" required maxLength={500} />
              </label>
            )}
            <footer className="form-footer">
              <button className="primary" disabled={busy}>
                {busy
                  ? 'Guardando…'
                  : dialog === 'close'
                    ? 'Confirmar cierre'
                    : dialog === 'open'
                      ? 'Abrir el turno'
                      : 'Guardar movimiento'}
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </section>
  );
}
