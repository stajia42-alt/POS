import { useState, type FormEvent } from 'react';
import { ArrowLeft, Armchair, MoreVertical } from 'lucide-react';
import type { Snapshot } from '../domain/types';
import { money } from '../domain/money';
import { Modal } from './Modal';
import { useModule } from './useModule';
import type { ModuleProps } from './moduleTypes';
export function TableBillActions({
  pos,
  actor,
  onChanged,
  onLock,
  snapshot,
}: ModuleProps & { snapshot: Snapshot }) {
  const [dialog, setDialog] = useState<
    'manage' | 'transfer' | 'merge' | 'waiter' | 'release' | null
  >(null);
  const { data, busy, error, run, setError } = useModule(
    () => pos.tables.snapshot(),
    onChanged,
    onLock,
    [snapshot.active.id, snapshot.active.updated_at],
  );
  const table = snapshot.table!;
  const sale = snapshot.active;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const target = String(form.get('target'));
    const action =
      dialog === 'transfer'
        ? () => pos.tables.transfer(sale.id, target)
        : dialog === 'merge'
          ? () => pos.tables.merge(sale.id, target)
          : dialog === 'waiter'
            ? () => pos.tables.assignWaiter(sale.id, target)
            : () => pos.cancel(sale.id, String(form.get('reason')));
    if (await run(action, 'Cuenta de mesa actualizada')) setDialog(null);
  }
  const open = (value: typeof dialog) => {
    setError('');
    setDialog(value);
  };
  return (
    <>
      <div className="table-account-bar">
        <button
          className="text-button"
          disabled={busy}
          onClick={() => void run(() => pos.setMode('tables'), 'Cuenta guardada')}
        >
          <ArrowLeft size={17} />
          Mapa
        </button>
        <div>
          <strong>
            <Armchair size={16} />
            {table.name}
          </strong>
          <small>{sale.waiter_name || actor.name}</small>
        </div>
        <button className="icon-button" aria-label="Gestionar mesa" onClick={() => open('manage')}>
          <MoreVertical size={20} />
        </button>
      </div>
      {dialog && (
        <Modal
          title={
            dialog === 'manage'
              ? `Cuenta · ${table.name}`
              : dialog === 'transfer'
                ? 'Transferir mesa'
                : dialog === 'merge'
                  ? 'Unir cuentas'
                  : dialog === 'waiter'
                    ? 'Cambiar mesero'
                    : 'Liberación administrativa'
          }
          onClose={() => {
            if (!busy) setDialog(null);
          }}
        >
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          {dialog === 'manage' ? (
            <div className="form-body">
              <p>
                {table.area_name} · Ticket #{sale.number} · <strong>{money(sale.total)}</strong>
              </p>
              <div className="table-action-list">
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => pos.tables.requestPayment(sale.id, !table.payment_requested),
                      'Estado de mesa guardado',
                    ).then((ok) => {
                      if (ok) setDialog(null);
                    })
                  }
                >
                  {table.payment_requested ? 'Continuar atendiendo' : 'Marcar pendiente de cobro'}
                </button>
                {actor.permissions.includes('table_transfer') && (
                  <>
                    <button className="secondary" onClick={() => open('transfer')}>
                      Transferir mesa
                    </button>
                    <button className="secondary" onClick={() => open('merge')}>
                      Unir cuentas
                    </button>
                    <button className="secondary" onClick={() => open('waiter')}>
                      Cambiar mesero
                    </button>
                  </>
                )}
                {!snapshot.lines.length ? (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(() => pos.tables.releaseEmpty(sale.id), 'Mesa vacía liberada').then(
                        (ok) => {
                          if (ok) setDialog(null);
                        },
                      )
                    }
                  >
                    Liberar mesa vacía
                  </button>
                ) : (
                  actor.permissions.includes('table_release') &&
                  actor.permissions.includes('cancel_sales') && (
                    <button className="danger-button" onClick={() => open('release')}>
                      Liberar y cancelar cuenta
                    </button>
                  )
                )}
              </div>
              <p className="field-hint">
                La mesa se libera al completar el cobro. Volver al mapa conserva automáticamente la
                cuenta.
              </p>
            </div>
          ) : (
            <form className="form-body" onSubmit={(event) => void submit(event)}>
              {dialog === 'release' ? (
                <>
                  <p>
                    Esta cuenta tiene productos pendientes. La cancelación y su motivo quedarán
                    registrados; no se registrará un pago.
                  </p>
                  <label>
                    Motivo de la liberación
                    <input name="reason" required maxLength={500} />
                  </label>
                </>
              ) : (
                <label>
                  {dialog === 'waiter' ? 'Mesero asignado' : 'Mesa de destino'}
                  <select
                    name="target"
                    required
                    aria-label={dialog === 'waiter' ? 'Mesero asignado' : 'Mesa de destino'}
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Selecciona una opción
                    </option>
                    {dialog === 'waiter'
                      ? data?.staff.map((staff) => (
                          <option key={staff.id} value={staff.id}>
                            {staff.name}
                          </option>
                        ))
                      : data?.tables
                          .filter(
                            (t) =>
                              t.id !== table.table_id && (dialog === 'merge' ? !!t.bill : !t.bill),
                          )
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {data.areas.find((a) => a.id === t.area_id)?.name} · {t.name}
                              {t.bill ? ` · ${money(t.bill.total)}` : ''}
                            </option>
                          ))}
                  </select>
                </label>
              )}
              {dialog === 'merge' && (
                <p className="field-hint">
                  Todos los productos pasarán a la cuenta de destino y la mesa de origen quedará
                  disponible. Se conservará una referencia de la unión. Cliente, impuesto y
                  descuento deben coincidir; los totales se recalculan por cuenta con redondeo al
                  centavo.
                </p>
              )}
              <footer className="form-footer">
                <button
                  className={dialog === 'release' ? 'danger-button' : 'primary'}
                  disabled={busy}
                >
                  {busy
                    ? 'Guardando…'
                    : dialog === 'release'
                      ? 'Confirmar liberación'
                      : 'Confirmar operación'}
                </button>
              </footer>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
