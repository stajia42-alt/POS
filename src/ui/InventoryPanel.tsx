import { useState, type FormEvent } from 'react';
import { Plus, Package } from 'lucide-react';
import { money, parseMoney } from '../domain/money';
import { STOCK_KIND_LABELS, type StockKind } from '../domain/inventory';
import { Modal } from './Modal';
import { useModule } from './useModule';
import type { ModuleProps } from './moduleTypes';

export function InventoryPanel({ pos, actor, onChanged, onLock }: ModuleProps) {
  const [filter, setFilter] = useState({ productId: '', from: '', to: '', page: 0 });
  const [editing, setEditing] = useState(false);
  const [kind, setKind] = useState<StockKind>('receipt');
  const module = useModule(() => pos.inventory.snapshot(filter), onChanged, onLock, [filter]);
  const { data, busy, error, notice, run } = module;
  const change = (key: 'productId' | 'from' | 'to', value: string) =>
    setFilter((old) => ({ ...old, [key]: value, page: 0 }));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const ok = await run(
        () =>
          pos.inventory.move({
            productId: String(form.get('product')),
            kind,
            quantity: Number(form.get('quantity')),
            reason: String(form.get('reason')),
            unitCost:
              kind === 'receipt' && form.get('cost')
                ? parseMoney(String(form.get('cost')))
                : undefined,
          }),
        'Movimiento de inventario guardado',
      );
      if (ok) setEditing(false);
    } catch (error) {
      module.setError((error as Error).message);
    }
  }
  return (
    <section className="admin-content">
      <div className="section-heading">
        <div>
          <h1>Inventario</h1>
          <p>Existencias, conteos y movimientos por empleado</p>
        </div>
        {actor.permissions.includes('inventory') && (
          <button className="primary" onClick={() => setEditing(true)}>
            <Plus size={19} /> Registrar movimiento
          </button>
        )}
      </div>
      {!editing && error && (
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
        <>
          <div className="metric-grid">
            <div>
              <small>Valor a costo · productos activos</small>
              <strong>{money(data.valuation)}</strong>
            </div>
            <div>
              <small>Productos con stock bajo</small>
              <strong>{data.lowStock.length}</strong>
            </div>
          </div>
          {data.lowStock.length > 0 && (
            <div className="stock-alert">
              <Package size={21} />
              <div>
                <strong>Revisar existencias</strong>
                <p>
                  {data.lowStock
                    .map(
                      (product) =>
                        `${product.name}: ${product.stock} / mínimo ${product.low_stock}`,
                    )
                    .join(' · ')}
                </p>
              </div>
            </div>
          )}
          <h2>Existencias actuales</h2>
          <div className="table-scroll">
            <table className="module-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Existencias</th>
                  <th>Mínimo</th>
                  <th>Costo unitario</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {data.products
                  .filter((p) => p.track_stock && (!filter.productId || filter.productId === p.id))
                  .map((p) => (
                    <tr key={p.id}>
                      <td>
                        <strong>{p.name}</strong>
                        <small>
                          {p.sku || 'Sin código'}
                          {!p.active ? ' · Inactivo' : ''}
                        </small>
                      </td>
                      <td>
                        {p.stock} {p.unit}
                      </td>
                      <td>{p.low_stock}</td>
                      <td>{money(p.cost)}</td>
                      <td>{money(p.stock * p.cost)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {!data.products.some((p) => p.track_stock) && (
            <p className="field-hint">
              Activa «Controlar existencias» al crear o editar un producto para registrar
              movimientos.
            </p>
          )}
          <h2>Historial de movimientos</h2>
          <div className="form-row module-filters">
            <label>
              Producto
              <select
                value={filter.productId}
                onChange={(e) => change('productId', e.target.value)}
              >
                <option value="">Todos los productos</option>
                {data.products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Desde
              <input
                type="date"
                value={filter.from}
                onChange={(e) => change('from', e.target.value)}
              />
            </label>
            <label>
              Hasta
              <input type="date" value={filter.to} onChange={(e) => change('to', e.target.value)} />
            </label>
          </div>
          <div className="table-scroll">
            <table className="module-table">
              <thead>
                <tr>
                  <th>Fecha y producto</th>
                  <th>Movimiento</th>
                  <th>Antes → después</th>
                  <th>Empleado / motivo</th>
                </tr>
              </thead>
              <tbody>
                {data.movements.map((m) => (
                  <tr key={m.id}>
                    <td>
                      {new Date(m.created_at).toLocaleString('es-MX')}
                      <small>{m.product_name}</small>
                    </td>
                    <td>
                      {STOCK_KIND_LABELS[m.kind] || m.kind}
                      <small>
                        {m.quantity > 0 ? '+' : ''}
                        {m.quantity}
                        {m.unit_cost !== null ? ` · ${money(m.unit_cost)} / unidad` : ''}
                      </small>
                    </td>
                    <td>
                      {m.before_stock ?? 'Sin registro'} → {m.after_stock ?? 'Sin registro'}
                    </td>
                    <td>
                      {m.actor_name || 'Sin empleado registrado'}
                      <small>{m.reason}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.movements.length && (
            <p className="field-hint">No hay movimientos para estos filtros.</p>
          )}
          <div className="pagination">
            <button
              className="secondary"
              disabled={filter.page === 0}
              onClick={() => setFilter((old) => ({ ...old, page: old.page - 1 }))}
            >
              Anterior
            </button>
            <span>
              Página {data.page + 1} · {data.totalMovements} movimientos
            </span>
            <button
              className="secondary"
              disabled={(filter.page + 1) * 50 >= data.totalMovements}
              onClick={() => setFilter((old) => ({ ...old, page: old.page + 1 }))}
            >
              Siguiente
            </button>
          </div>
        </>
      ) : (
        <p>Cargando inventario…</p>
      )}
      {editing && (
        <Modal
          title="Movimiento de inventario"
          onClose={() => {
            if (!busy) setEditing(false);
          }}
        >
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          <form className="form-body" onSubmit={(event) => void submit(event)}>
            <label>
              Producto
              <select aria-label="Producto" name="product" required defaultValue={filter.productId}>
                <option value="" disabled>
                  Selecciona un producto
                </option>
                {data?.products
                  .filter((p) => p.track_stock)
                  .map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.name} · {p.stock} {p.unit}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Tipo de movimiento
              <select
                aria-label="Tipo de movimiento"
                value={kind}
                onChange={(e) => setKind(e.target.value as StockKind)}
              >
                {(['receipt', 'issue', 'adjustment', 'count'] as StockKind[]).map((k) => (
                  <option key={k} value={k}>
                    {STOCK_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {kind === 'count'
                ? 'Cantidad contada'
                : kind === 'adjustment'
                  ? 'Cambio de existencias (+ o −)'
                  : 'Cantidad de unidades'}
              <input
                name="quantity"
                type="number"
                step="1"
                min={kind === 'adjustment' ? -999999 : kind === 'count' ? 0 : 1}
                max="999999"
                required
              />
            </label>
            {kind === 'receipt' && (
              <label>
                Costo unitario de la entrada (MXN, opcional)
                <input
                  aria-label="Costo unitario de la entrada (MXN, opcional)"
                  name="cost"
                  inputMode="decimal"
                  placeholder="Dejar vacío para conservar el costo"
                />
                <small>Si indicas un costo se actualizará el costo promedio ponderado.</small>
              </label>
            )}
            <label>
              Motivo
              <input
                name="reason"
                required
                maxLength={500}
                placeholder="Ej. Recepción de mercancía o conteo de cierre"
              />
            </label>
            {kind === 'count' && (
              <p className="field-hint">
                Se guardarán la existencia esperada, la cantidad contada y la diferencia, incluso si
                coincide.
              </p>
            )}
            <footer className="form-footer">
              <button className="primary" disabled={busy}>
                {busy ? 'Guardando…' : 'Guardar movimiento'}
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </section>
  );
}
