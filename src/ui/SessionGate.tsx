import { useEffect, useRef, useState, type FormEvent } from 'react';
import { LockKeyhole } from 'lucide-react';
import type { Pos } from '../domain/pos';
import type { Snapshot } from '../domain/types';
import { App } from './App';

export function SessionGate({ pos }: { pos: Pos }) {
  const [setup, setSetup] = useState<boolean>();
  const [data, setData] = useState<Snapshot>();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  useEffect(() => {
    pos.access
      .hasEmployees()
      .then((value) => setSetup(!value))
      .catch((error) => setError((error as Error).message));
  }, [pos]);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (lock.current) return;
    const values = new FormData(event.currentTarget);
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      if (setup) {
        if (values.get('pin') !== values.get('confirmPin'))
          throw new Error('Los PIN no coinciden.');
        await pos.access.bootstrap({
          name: String(values.get('name')),
          identifier: String(values.get('identifier')),
          pin: String(values.get('pin')),
        });
      } else await pos.access.login(String(values.get('identifier')), String(values.get('pin')));
      setData(await pos.snapshot());
      setSetup(false);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  if (data)
    return (
      <App
        key={data.actor.id}
        pos={pos}
        initial={data}
        onLock={() => {
          pos.access.lock();
          setData(undefined);
          setError('');
        }}
      />
    );
  return (
    <div className="session-screen">
      <div className="session-brand">
        <span className="brand-mark">A</span>
        <h1>
          AVILES <b>POS</b>
        </h1>
        <p>Tu negocio, en tus manos</p>
      </div>
      <form className="session-card form-stack" onSubmit={(event) => void submit(event)}>
        <LockKeyhole className="session-icon" size={30} />
        <h2>
          {setup === undefined
            ? 'Abriendo acceso local…'
            : setup
              ? 'Configura al propietario'
              : 'Acceso del empleado'}
        </h2>
        {setup === undefined ? null : (
          <>
            {setup && (
              <>
                <p className="field-hint">
                  Crea tu acceso local de administrador. Se conservarán los productos, tickets y
                  ventas que ya existen. No se requiere cuenta de Internet.
                </p>
                <label>
                  Nombre del propietario
                  <input name="name" required maxLength={120} autoComplete="name" />
                </label>
              </>
            )}
            <label>
              Identificador
              <input
                name="identifier"
                required
                maxLength={40}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="Ej. propietario"
              />
            </label>
            <label>
              {setup ? 'Crear PIN (4 a 8 dígitos)' : 'PIN'}
              <input
                name="pin"
                required
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4,8}"
                minLength={4}
                maxLength={8}
                autoComplete={setup ? 'new-password' : 'current-password'}
              />
            </label>
            {setup && (
              <label>
                Confirmar PIN
                <input
                  name="confirmPin"
                  required
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]{4,8}"
                  minLength={4}
                  maxLength={8}
                  autoComplete="new-password"
                />
              </label>
            )}
            <button className="primary large" disabled={busy}>
              {busy ? 'Verificando…' : setup ? 'Crear acceso local' : 'Entrar'}
            </button>
            <p className="field-hint">
              {setup
                ? 'Conserva tu PIN. Otro administrador podrá restablecerlo; todavía no hay recuperación externa.'
                : 'El administrador del negocio puede restablecer el PIN de otros empleados.'}
            </p>
          </>
        )}
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
