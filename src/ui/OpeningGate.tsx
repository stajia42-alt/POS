import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Banknote, LockKeyhole, Clock3 } from 'lucide-react';
import type { Pos } from '../domain/pos';
import type { Snapshot } from '../domain/types';
import { parseMoney, parseRate } from '../domain/money';
import { SessionError } from '../domain/access';

export function OpeningGate({
  pos,
  data,
  onOpened,
  onLock,
}: {
  pos: Pos;
  data: Snapshot;
  onOpened: (data: Snapshot) => void;
  onLock: () => void;
}) {
  const [now, setNow] = useState(new Date());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const running = useRef(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(timer);
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const rate = String(form.get('rate') || '').trim();
      await pos.cash.open(
        parseMoney(String(form.get('mxn'))),
        parseMoney(String(form.get('usd'))),
        rate ? parseRate(rate) : undefined,
      );
      onOpened(await pos.snapshot());
    } catch (error) {
      if (error instanceof SessionError) onLock();
      else setError((error as Error).message);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  const canOpen = data.actor.permissions.includes('open_cash');
  return (
    <div className="opening-screen" data-testid="opening-required">
      <header className="opening-header">
        <span className="brand-mark">A</span>
        <strong>AVILES POS</strong>
        <button className="secondary" onClick={onLock} disabled={busy}>
          <LockKeyhole size={18} />
          Cambiar empleado
        </button>
      </header>
      <main className="opening-card">
        <div className="opening-intro">
          <span className="opening-symbol">
            <Banknote size={32} />
          </span>
          <p className="eyebrow">COMIENZA TU TURNO</p>
          <h1>Apertura de caja</h1>
          <p>
            Registra el efectivo con el que empezarás. Tus tickets y mesas pendientes se
            conservarán.
          </p>
          <div className="opening-person">
            <strong>{data.actor.name}</strong>
            <span>
              <Clock3 size={16} />
              {now.toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' })}
            </span>
          </div>
        </div>
        {canOpen ? (
          <form className="form-stack opening-form" onSubmit={(event) => void submit(event)}>
            <label>
              Fondo inicial de caja (MXN)
              <input name="mxn" inputMode="decimal" required defaultValue="0.00" />
            </label>
            <label>
              Fondo inicial en dólares (USD)
              <input name="usd" inputMode="decimal" required defaultValue="0.00" />
            </label>
            <label>
              Tipo de cambio · MXN por 1 USD
              <input
                name="rate"
                inputMode="decimal"
                readOnly={!data.actor.permissions.includes('settings')}
                defaultValue={
                  data.business.exchangeRate ? (data.business.exchangeRate / 10000).toFixed(4) : ''
                }
                placeholder="Sin configurar"
              />
            </label>
            <p className="field-hint">
              El administrador captura la tasa manualmente. Se exige para un fondo en USD. Cada
              moneda se cuenta por separado; los cobros en USD siguen pendientes de implementación.
            </p>
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary large" disabled={busy}>
              {busy ? 'Abriendo…' : 'ABRIR TURNO'}
            </button>
          </form>
        ) : (
          <div className="opening-form">
            <p className="inline-error">
              Tu empleado no tiene permiso para abrir caja. Cambia a un empleado autorizado para
              abrir el turno y después vuelve a entrar con tu PIN.
            </p>
            <button className="primary" onClick={onLock}>
              Cambiar empleado
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
