import ReactDOM from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { openDatabase } from './db/open';
import { Pos } from './domain/pos';
import { SessionGate } from './ui/SessionGate';
import './styles.css';

const root = ReactDOM.createRoot(document.getElementById('root')!);
function failure(error: unknown) {
  root.render(
    <div className="startup">
      <h1>
        AVILES <b>POS</b>
      </h1>
      <h2>No se pudo abrir la base de datos</h2>
      <p role="alert">{(error as Error).message}</p>
      <p>No se ha eliminado ningún dato. Cierra otras pestañas y vuelve a intentarlo.</p>
      <button className="primary" onClick={() => location.reload()}>
        Reintentar
      </button>
    </div>,
  );
}
async function boot() {
  root.render(
    <div className="startup">
      <span className="brand-mark">A</span>
      <h1>
        AVILES <b>POS</b>
      </h1>
      <p>Abriendo tu punto de venta…</p>
      <span className="spinner" />
    </div>,
  );
  const db = await openDatabase();
  const pos = new Pos(db);
  await pos.initialize();
  root.render(<SessionGate pos={pos} />);
  if (!Capacitor.isNativePlatform() && import.meta.env.PROD && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(console.error);
  }
}

if (Capacitor.isNativePlatform()) boot().catch(failure);
else if (navigator.locks) {
  navigator.locks
    .request('aviles-pos-database', { ifAvailable: true }, async (lock) => {
      if (!lock)
        return failure(
          new Error(
            'AVILES POS ya está abierto en otra pestaña. Usa una sola pestaña para proteger tus ventas.',
          ),
        );
      try {
        await boot();
        await new Promise<void>((resolve) =>
          window.addEventListener('pagehide', () => resolve(), { once: true }),
        );
      } catch (error) {
        failure(error);
      }
    })
    .catch(failure);
} else
  failure(
    new Error(
      'Este navegador no admite el bloqueo seguro de la base de datos. Utiliza Chrome actualizado o la aplicación Android.',
    ),
  );
