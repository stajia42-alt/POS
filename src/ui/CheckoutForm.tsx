import { useState, type FormEvent } from 'react';
import { ArrowRightLeft, Banknote, CreditCard, Plus, Trash2, Wallet } from 'lucide-react';
import { money, parseMoney } from '../domain/money';
import { MAX_PAYMENTS, PAYMENT_LABELS, preparePayments } from '../domain/payments';
import type { PaymentMethod, PaymentRequest } from '../domain/types';

interface Entry {
  key: string;
  method: PaymentMethod;
  amount: string;
  tendered: string;
  reference: string;
}
const icons = { cash: Banknote, card: CreditCard, transfer: ArrowRightLeft, other: Wallet };
const decimal = (cents: number) => (cents / 100).toFixed(2);
function cents(value: string) {
  try {
    return parseMoney(value);
  } catch {
    return 0;
  }
}

export function CheckoutForm({
  total,
  busy,
  onSubmit,
  onError,
}: {
  total: number;
  busy: boolean;
  onSubmit: (payments: PaymentRequest[]) => void;
  onError: (message: string) => void;
}) {
  const [entries, setEntries] = useState<Entry[]>([
    {
      key: crypto.randomUUID(),
      method: 'cash',
      amount: decimal(total),
      tendered: '',
      reference: '',
    },
  ]);
  const multiple = entries.length > 1;
  const update = (key: string, values: Partial<Entry>) =>
    setEntries((previous) =>
      previous.map((entry) => (entry.key === key ? { ...entry, ...values } : entry)),
    );
  const requests = () =>
    entries.map((entry) => ({
      method: entry.method,
      amount: parseMoney(multiple ? entry.amount : decimal(total)),
      tendered: entry.method === 'cash' ? parseMoney(entry.tendered || '0') : undefined,
      reference: entry.reference,
    }));
  let valid = false;
  try {
    preparePayments(total, requests());
    valid = true;
  } catch {
    /* Input validation also runs in the transaction. */
  }
  const allocated = entries.reduce((sum, entry) => sum + cents(entry.amount), 0);
  const cashChange = entries.reduce(
    (sum, entry) =>
      sum +
      (entry.method === 'cash' ? Math.max(0, cents(entry.tendered) - cents(entry.amount)) : 0),
    0,
  );
  const submit = (event: FormEvent) => {
    event.preventDefault();
    try {
      const payments = requests();
      preparePayments(total, payments);
      onSubmit(payments);
    } catch (error) {
      onError((error as Error).message);
    }
  };

  return (
    <form className="form-body checkout-form" onSubmit={submit}>
      <div className="checkout-total">
        <span>Total a cobrar</span>
        <strong>{money(total)}</strong>
      </div>
      {entries.map((entry, index) => {
        const amount = multiple ? cents(entry.amount) : total;
        const received = cents(entry.tendered);
        const suffix = multiple ? ` · pago ${index + 1}` : '';
        return (
          <fieldset
            className={`payment-entry ${multiple ? 'split-entry' : ''}`}
            key={entry.key}
            disabled={busy}
          >
            {multiple && <legend>Pago {index + 1}</legend>}
            {multiple ? (
              <div className="payment-entry-heading">
                <label className="grow">
                  Método de pago {index + 1}
                  <select
                    value={entry.method}
                    onChange={(event) =>
                      update(entry.key, {
                        method: event.target.value as PaymentMethod,
                        reference: '',
                      })
                    }
                  >
                    {Object.entries(PAYMENT_LABELS).map(([method, label]) => (
                      <option key={method} value={method}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="icon-button danger-text"
                  aria-label={`Eliminar pago ${index + 1}`}
                  onClick={() =>
                    setEntries((previous) => {
                      const remaining = previous.filter((item) => item.key !== entry.key);
                      return remaining.length === 1
                        ? [{ ...remaining[0], amount: decimal(total) }]
                        : remaining;
                    })
                  }
                >
                  <Trash2 size={19} />
                </button>
              </div>
            ) : (
              <div className="payment-tabs" role="group" aria-label="Forma de pago">
                {Object.entries(PAYMENT_LABELS).map(([method, label]) => {
                  const Icon = icons[method as PaymentMethod];
                  return (
                    <button
                      type="button"
                      key={method}
                      aria-pressed={entry.method === method}
                      onClick={() =>
                        update(entry.key, { method: method as PaymentMethod, reference: '' })
                      }
                    >
                      <Icon size={21} />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {multiple && (
              <label>
                Importe del pago {index + 1} (MXN)
                <input
                  required
                  inputMode="decimal"
                  value={entry.amount}
                  onChange={(event) => update(entry.key, { amount: event.target.value })}
                  placeholder="0.00"
                />
              </label>
            )}
            {entry.method === 'cash' ? (
              <>
                <label>
                  Efectivo recibido{suffix} (MXN)
                  <input
                    data-autofocus={!multiple ? '' : undefined}
                    className={!multiple ? 'cash-input' : ''}
                    required
                    inputMode="decimal"
                    value={entry.tendered}
                    onChange={(event) => update(entry.key, { tendered: event.target.value })}
                    placeholder="0.00"
                  />
                </label>
                <div className="cash-shortcuts">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => update(entry.key, { tendered: decimal(amount) })}
                  >
                    Exacto{multiple ? ` · pago ${index + 1}` : ''}
                  </button>
                  {!multiple &&
                    [Math.ceil(amount / 10000) * 100, Math.ceil(amount / 50000) * 500]
                      .filter(
                        (n, i, values) => n > amount / 100 && n < 999999 && values.indexOf(n) === i,
                      )
                      .map((value) => (
                        <button
                          key={value}
                          type="button"
                          className="secondary"
                          onClick={() => update(entry.key, { tendered: value.toFixed(2) })}
                        >
                          ${value.toLocaleString('es-MX')}
                        </button>
                      ))}
                </div>
                <div className={`change-box ${received < amount ? 'insufficient' : ''}`}>
                  <span>
                    {received < amount ? 'Faltan' : 'Cambio'}
                    {suffix}
                  </span>
                  <strong>{money(Math.abs(received - amount))}</strong>
                </div>
              </>
            ) : (
              <>
                <p className="manual-payment-notice">
                  Registro manual de {PAYMENT_LABELS[entry.method].toLowerCase()}. Verifica el pago
                  antes de confirmar; AVILES POS no cobra en tu terminal ni consulta tu banco.
                </p>
                <label>
                  {multiple
                    ? `Referencia del pago ${index + 1} (opcional)`
                    : 'Referencia (opcional)'}
                  <input
                    maxLength={120}
                    value={entry.reference}
                    onChange={(event) => update(entry.key, { reference: event.target.value })}
                    placeholder="Folio, autorización o referencia"
                  />
                </label>
              </>
            )}
          </fieldset>
        );
      })}
      {entries.length < MAX_PAYMENTS && total >= 2 && (
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() =>
            setEntries((previous) => {
              if (previous.length === 1) {
                const first = Math.ceil(total / 2);
                return [
                  { ...previous[0], amount: decimal(first) },
                  {
                    key: crypto.randomUUID(),
                    method: 'card',
                    amount: decimal(total - first),
                    tendered: '',
                    reference: '',
                  },
                ];
              }
              return [
                ...previous,
                {
                  key: crypto.randomUUID(),
                  method: 'card',
                  amount: '',
                  tendered: '',
                  reference: '',
                },
              ];
            })
          }
        >
          <Plus size={18} />
          {multiple ? 'Agregar forma de pago' : 'Dividir pago'}
        </button>
      )}
      {multiple && (
        <div className="payment-allocation" aria-live="polite">
          <div>
            <span>Total distribuido</span>
            <strong>{money(allocated)}</strong>
          </div>
          <div className={allocated === total ? 'status-text' : 'danger-text'}>
            <span>{allocated > total ? 'Exceso distribuido' : 'Falta distribuir'}</span>
            <strong data-testid="payment-remaining">{money(Math.abs(total - allocated))}</strong>
          </div>
          <div>
            <span>Cambio total en efectivo</span>
            <strong>{money(cashChange)}</strong>
          </div>
        </div>
      )}
      <p className="field-hint">
        Los importes preparados se registran juntos al confirmar el cobro. Hasta entonces el ticket
        permanece abierto. Al cerrar esta ventana, se descarta la distribución preparada.
      </p>
      <button className="primary large" disabled={busy || !valid}>
        {busy ? 'Registrando venta…' : 'Confirmar cobro'}
      </button>
    </form>
  );
}
