import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  Menu,
  Search,
  ScanBarcode,
  UserRoundPlus,
  MoreVertical,
  LayoutGrid,
  List,
  Plus,
  Minus,
  Trash2,
  ReceiptText,
  ShoppingBasket,
  Package,
  FolderOpen,
  Clock3,
  Settings,
  UsersRound,
  ChevronRight,
  ArrowLeft,
  Check,
  X,
  Tag,
  Banknote,
  Star,
  CircleHelp,
  CheckCircle2,
  Pencil,
  Store,
  LockKeyhole,
} from 'lucide-react';
import type { Pos } from '../domain/pos';
import { money, parsePercent } from '../domain/money';
import type { Category, Customer, Product, Receipt, SaleLine, Snapshot } from '../domain/types';
import { Modal } from './Modal';
import { ProductForm } from './ProductForm';
import { CheckoutForm } from './CheckoutForm';
import { SessionError } from '../domain/access';
import { ROLE_LABELS, type Permission } from '../domain/access-types';
import { InventoryPanel } from './InventoryPanel';
import { EmployeesPanel } from './EmployeesPanel';
import { CashPanel } from './CashPanel';
import { paymentSummary, PAYMENT_LABELS } from '../domain/payments';

type Page =
  | 'sales'
  | 'products'
  | 'categories'
  | 'pending'
  | 'history'
  | 'customers'
  | 'settings'
  | 'inventory'
  | 'employees'
  | 'cash';
type Dialog =
  | 'product'
  | 'category'
  | 'line'
  | 'ticket'
  | 'park'
  | 'checkout'
  | 'receipt'
  | 'customer'
  | 'assign'
  | 'scanner'
  | 'cancel'
  | 'help'
  | null;
const nav: { key: Page; title: string; icon: typeof Menu }[] = [
  { key: 'sales', title: 'Punto de venta', icon: ShoppingBasket },
  { key: 'pending', title: 'Tickets pendientes', icon: Clock3 },
  { key: 'history', title: 'Historial de ventas', icon: ReceiptText },
  { key: 'products', title: 'Productos', icon: Package },
  { key: 'categories', title: 'Categorías', icon: FolderOpen },
  { key: 'customers', title: 'Clientes', icon: UsersRound },
  { key: 'inventory', title: 'Inventario', icon: Package },
  { key: 'cash', title: 'Caja y turnos', icon: Banknote },
  { key: 'employees', title: 'Empleados', icon: UsersRound },
  { key: 'settings', title: 'Configuración', icon: Settings },
];
const date = (iso: string) =>
  new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );
const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const pad = (number: number) => String(number).padStart(4, '0');
const errorMessage = (error: unknown) => {
  const value = error instanceof Error ? error.message : String(error);
  if (value.includes('UNIQUE constraint'))
    return 'Ese código o nombre ya existe. Usa uno diferente.';
  if (value.includes('quota') || value.includes('Quota'))
    return 'El almacenamiento está lleno. Libera espacio antes de continuar; la operación no se ha guardado.';
  return value;
};

function Empty({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h2>{title}</h2>
      {children}
    </div>
  );
}

function ProductImage({ product, color }: { product: Product; color?: string }) {
  return product.photo ? (
    <img src={product.photo} alt="" loading="lazy" />
  ) : (
    <div
      className="product-placeholder"
      style={{ background: color ? `${color}18` : undefined, color }}
    >
      <span>{product.name.slice(0, 2).toUpperCase()}</span>
      <Package size={23} strokeWidth={1.4} />
    </div>
  );
}

export function App({ pos, initial, onLock }: { pos: Pos; initial: Snapshot; onLock: () => void }) {
  const [data, setData] = useState(initial);
  const [page, setPage] = useState<Page>('sales');
  const [sidebar, setSidebar] = useState(false);
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [product, setProduct] = useState<Product>();
  const [editCategory, setEditCategory] = useState<Category>();
  const [editCustomer, setEditCustomer] = useState<Customer>();
  const [line, setLine] = useState<SaleLine>();
  const [receipt, setReceipt] = useState<Receipt>();
  const [cancelId, setCancelId] = useState('');
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [mobileTicket, setMobileTicket] = useState(false);
  const searchField = useRef<HTMLInputElement>(null);
  const [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  async function run(action: () => Promise<unknown>, message?: string, close = false) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
      setData(await pos.snapshot());
      if (message) setNotice(message);
      if (close) setDialog(null);
    } catch (error) {
      if (error instanceof SessionError) onLock();
      else setError(errorMessage(error));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  const close = () => {
    if (!running.current) {
      setDialog(null);
      setError('');
    }
  };
  const can = (...permissions: Permission[]) =>
    permissions.some((permission) => data.actor.permissions.includes(permission));
  const allowed: Record<Page, boolean> = {
    sales: true,
    pending: can('sell'),
    history: can('reports'),
    products: can('products'),
    categories: can('products'),
    customers: can('sell'),
    settings: can('settings'),
    inventory: can('inventory', 'reports'),
    cash: can('reports', 'open_cash', 'close_cash', 'cash_moves'),
    employees: can('employees'),
  };
  const go = (next: Page) => {
    if (!allowed[next]) return;
    setPage(next);
    setSearch('');
    setSidebar(false);
    setMobileTicket(false);
    setError('');
  };
  const openProduct = (value?: Product) => {
    setProduct(value);
    setDialog('product');
  };
  const ticket = data.active;
  const qty = data.lines.reduce((sum, value) => sum + value.quantity, 0);
  const currentCategory =
    category === 'all'
      ? 'Todos los artículos'
      : category === 'favorites'
        ? 'Favoritos'
        : data.categories.find((c) => c.id === category)?.name || 'Todos los artículos';
  const products = data.products.filter(
    (p) =>
      p.active &&
      (category === 'all' ||
        (category === 'favorites' ? p.favorite : p.category_id === category)) &&
      normalize(`${p.name} ${p.sku} ${p.barcode}`).includes(normalize(search)),
  );
  const catalog = data.products.filter((p) =>
    normalize(`${p.name} ${p.sku} ${p.barcode}`).includes(normalize(search)),
  );
  const ticketUpdate = (customerId: string | null) =>
    pos.updateTicket(ticket.id, {
      customerId,
      discountBps: ticket.discount_bps,
      label: ticket.label,
      note: ticket.note,
    });
  const submit = (
    event: FormEvent<HTMLFormElement>,
    action: (form: FormData) => Promise<unknown>,
    message?: string,
  ) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(() => action(form), message, true);
  };

  const productCatalog = (
    <section className="admin-content">
      <div className="section-heading">
        <div>
          <h1>Productos</h1>
          <p>{data.products.length} artículos en tu catálogo</p>
        </div>
        <button className="primary" onClick={() => openProduct()}>
          <Plus size={20} /> Crear producto
        </button>
      </div>
      <div className="admin-search">
        <Search size={19} />
        <input
          aria-label="Buscar en el catálogo"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar nombre, código o código de barras"
        />
      </div>
      {!catalog.length ? (
        <Empty
          icon={<Package />}
          title={data.products.length ? 'Sin resultados' : 'Crea tu primer producto'}
        >
          <p>Registra precios, categorías y fotografías para comenzar a vender.</p>
          <button className="primary" onClick={() => openProduct()}>
            <Plus size={19} /> Crear producto
          </button>
        </Empty>
      ) : (
        <div className="data-list">
          <div className="list-heading">
            <span>Producto</span>
            <span>Precio / estado</span>
          </div>
          {catalog.map((p) => (
            <button key={p.id} className="catalog-row" onClick={() => openProduct(p)}>
              <div className="thumb">
                <ProductImage product={p} />
              </div>
              <div className="grow">
                <strong>{p.name}</strong>
                <small>
                  {data.categories.find((c) => c.id === p.category_id)?.name || 'Sin categoría'}
                  {p.sku ? ` · ${p.sku}` : ''}
                  {p.track_stock ? ` · ${p.stock} ${p.unit}` : ''}
                </small>
              </div>
              <div className="align-right">
                <strong>{money(p.price)}</strong>
                <small className={p.active ? 'status-text' : ''}>
                  {p.active ? 'Activo' : 'Inactivo'}
                </small>
              </div>
              <Pencil size={17} />
            </button>
          ))}
        </div>
      )}
    </section>
  );

  let admin: ReactNode;
  if (page === 'products') admin = productCatalog;
  if (page === 'categories')
    admin = (
      <section className="admin-content">
        <div className="section-heading">
          <div>
            <h1>Categorías</h1>
            <p>Organiza la barra inferior de tu punto de venta</p>
          </div>
          <button
            className="primary"
            onClick={() => {
              setEditCategory(undefined);
              setDialog('category');
            }}
          >
            <Plus size={20} /> Crear categoría
          </button>
        </div>
        {!data.categories.length ? (
          <Empty icon={<FolderOpen />} title="Todo en su lugar">
            <p>Crea las categorías que necesite tu negocio.</p>
          </Empty>
        ) : (
          <div className="data-list">
            {data.categories.map((c) => (
              <div className="catalog-row" key={c.id}>
                <span className="category-dot" style={{ backgroundColor: c.color }} />
                <div className="grow">
                  <strong>{c.name}</strong>
                  <small>
                    {data.products.filter((p) => p.category_id === c.id).length} productos
                  </small>
                </div>
                <button
                  className="icon-button"
                  aria-label={`Editar ${c.name}`}
                  onClick={() => {
                    setEditCategory(c);
                    setDialog('category');
                  }}
                >
                  <Pencil size={19} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    );
  if (page === 'pending')
    admin = (
      <section className="admin-content">
        <div className="section-heading">
          <div>
            <h1>Tickets pendientes</h1>
            <p>El inventario se descuenta únicamente al cobrar</p>
          </div>
        </div>
        {!data.parked.length ? (
          <Empty icon={<Clock3 />} title="No hay tickets pendientes">
            <p>Usa GUARDAR en el punto de venta para continuar después.</p>
            <button className="secondary" onClick={() => go('sales')}>
              Ir a vender
            </button>
          </Empty>
        ) : (
          <div className="data-list">
            {data.parked.map((s) => (
              <div className="catalog-row" key={s.id}>
                <div className="row-symbol">
                  <ReceiptText />
                </div>
                <div className="grow">
                  <strong>
                    {s.label || 'Ticket pendiente'} <span className="muted">#{pad(s.number)}</span>
                  </strong>
                  <small>
                    {date(s.updated_at)}
                    {s.customer_name ? ` · ${s.customer_name}` : ''}
                  </small>
                </div>
                <strong>{money(s.total)}</strong>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await pos.resume(s.id);
                      go('sales');
                    }, 'Ticket recuperado. El ticket anterior se conservó si tenía artículos.')
                  }
                >
                  Recuperar
                </button>
                <button
                  className="icon-button danger-text"
                  aria-label={`Cancelar ticket ${s.number}`}
                  onClick={() => {
                    setCancelId(s.id);
                    setDialog('cancel');
                  }}
                >
                  <Trash2 size={19} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    );
  if (page === 'history')
    admin = (
      <section className="admin-content">
        <div className="section-heading">
          <div>
            <h1>Historial de ventas</h1>
            <p>{data.history.length} ventas completadas · Horario de este dispositivo</p>
          </div>
          <span className="summary-pill">
            {money(data.history.reduce((sum, s) => sum + s.total, 0))}
          </span>
        </div>
        {!data.history.length ? (
          <Empty icon={<ReceiptText />} title="Aquí verás tus ventas">
            <p>Los cobros completados se guardan con su detalle y cambio.</p>
          </Empty>
        ) : (
          <div className="data-list">
            {data.history.map((s) => (
              <button
                className="catalog-row"
                key={s.id}
                onClick={() =>
                  void run(async () => {
                    setReceipt(await pos.getReceipt(s.id));
                    setDialog('receipt');
                  })
                }
              >
                <div className="row-symbol">
                  <CheckCircle2 />
                </div>
                <div className="grow">
                  <strong>Venta #{pad(s.number)}</strong>
                  <small>
                    {date(s.paid_at!)}
                    {s.customer_name ? ` · ${s.customer_name}` : ''}
                  </small>
                </div>
                <div className="align-right">
                  <strong>{money(s.total)}</strong>
                  <small>{paymentSummary(s.payment_methods.split(','))} · Completada</small>
                </div>
                <ChevronRight size={20} />
              </button>
            ))}
          </div>
        )}
      </section>
    );
  if (page === 'customers')
    admin = (
      <section className="admin-content">
        <div className="section-heading">
          <div>
            <h1>Clientes</h1>
            <p>Datos locales e historial de compras</p>
          </div>
          <button
            className="primary"
            onClick={() => {
              setEditCustomer(undefined);
              setDialog('customer');
            }}
          >
            <Plus size={20} /> Crear cliente
          </button>
        </div>
        {!data.customers.length ? (
          <Empty icon={<UsersRound />} title="Conoce a tus clientes">
            <p>Registra sus datos para asociarlos a una venta.</p>
          </Empty>
        ) : (
          <div className="data-list">
            {data.customers.map((c) => (
              <button
                className="catalog-row"
                key={c.id}
                onClick={() => {
                  setEditCustomer(c);
                  setDialog('customer');
                }}
              >
                <span className="avatar">{c.name.slice(0, 1).toUpperCase()}</span>
                <div className="grow">
                  <strong>{c.name}</strong>
                  <small>{c.phone || c.email || 'Sin datos de contacto'}</small>
                </div>
                <span className="muted">
                  {can('reports')
                    ? `${data.history.filter((s) => s.customer_id === c.id).length} compras`
                    : ''}
                </span>
                <Pencil size={18} />
              </button>
            ))}
          </div>
        )}
      </section>
    );
  if (page === 'settings')
    admin = (
      <section className="admin-content">
        <div className="section-heading">
          <div>
            <h1>Configuración del negocio</h1>
            <p>Estos datos aparecerán en las nuevas ventas</p>
          </div>
          <Store className="section-icon" />
        </div>
        <form
          className="settings-form form-stack"
          key={JSON.stringify(data.business)}
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            void run(
              () =>
                pos.saveBusiness({
                  name: String(form.get('name')),
                  address: String(form.get('address')),
                  phone: String(form.get('phone')),
                  taxBps: parsePercent(String(form.get('tax'))),
                  receiptFooter: String(form.get('footer')),
                  cashManagement: form.has('cashManagement'),
                }),
              'Configuración guardada',
            );
          }}
        >
          <label>
            Nombre del negocio
            <input name="name" required maxLength={120} defaultValue={data.business.name} />
          </label>
          <label>
            Dirección
            <textarea
              name="address"
              rows={2}
              maxLength={300}
              defaultValue={data.business.address}
            />
          </label>
          <div className="form-row">
            <label>
              Teléfono
              <input name="phone" type="tel" maxLength={40} defaultValue={data.business.phone} />
            </label>
            <label>
              Impuesto añadido (%)
              <input
                name="tax"
                inputMode="decimal"
                defaultValue={(data.business.taxBps / 100).toFixed(2)}
                required
              />
            </label>
          </div>
          <p className="field-hint">
            El impuesto se añade después del descuento. Usa 0 si tus precios ya incluyen impuestos.
            Los tickets pendientes conservan la tasa con la que se guardaron.
          </p>
          <label>
            Mensaje del recibo
            <input name="footer" maxLength={200} defaultValue={data.business.receiptFooter} />
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              name="cashManagement"
              defaultChecked={!!data.business.cashManagement}
            />{' '}
            Control de caja por turnos
          </label>
          <p className="field-hint">
            Al activarlo, deberás abrir un turno antes de cobrar. No se atribuyen las ventas
            antiguas a turnos nuevos.
          </p>
          <div className="settings-note">
            <Banknote size={23} />
            <div>
              <strong>Peso mexicano · MXN</strong>
              <p>
                Importes calculados en centavos. Pagos registrados localmente. Tarjeta y
                transferencia se verifican manualmente.
              </p>
            </div>
          </div>
          <button className="primary" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar configuración'}
          </button>
          <p className="field-hint">
            Esta versión todavía no incluye respaldos exportables. Conserva los datos de la
            aplicación; desinstalarla o borrar su almacenamiento elimina la información local.
          </p>
        </form>
      </section>
    );

  const moduleProps = {
    pos,
    actor: data.actor,
    onLock,
    onChanged: async () => {
      const value = await pos.snapshot();
      setData(value);
      if (!value.actor.permissions.includes('employees') && page === 'employees') setPage('sales');
    },
  };
  if (page === 'inventory' && allowed.inventory) admin = <InventoryPanel {...moduleProps} />;
  if (page === 'employees' && allowed.employees) admin = <EmployeesPanel {...moduleProps} />;
  if (page === 'cash' && allowed.cash)
    admin = <CashPanel {...moduleProps} enabled={!!data.business.cashManagement} />;

  const titles: Record<Exclude<Dialog, null>, string> = {
    product: product ? 'Editar producto' : 'Nuevo producto',
    category: editCategory ? 'Editar categoría' : 'Nueva categoría',
    line: 'Editar artículo',
    ticket: 'Opciones del ticket',
    park: 'Guardar ticket',
    checkout: 'Cobrar venta',
    receipt: 'Recibo de venta',
    customer: editCustomer ? 'Editar cliente' : 'Nuevo cliente',
    assign: 'Asignar cliente',
    scanner: 'Lector de código de barras',
    cancel: 'Cancelar ticket',
    help: 'Acerca de AVILES POS',
  };
  let dialogContent: ReactNode;
  if (dialog === 'product')
    dialogContent = (
      <ProductForm
        product={product}
        categories={data.categories}
        busy={busy}
        onError={setError}
        onSave={(p, reason) =>
          void run(() => pos.saveProduct(p, reason), 'Producto guardado', true)
        }
      />
    );
  if (dialog === 'category')
    dialogContent = (
      <form
        className="form-body"
        onSubmit={(e) =>
          submit(
            e,
            (f) =>
              pos.saveCategory(String(f.get('name')), String(f.get('color')), editCategory?.id),
            'Categoría guardada',
          )
        }
      >
        <label>
          Nombre de la categoría
          <input
            data-autofocus
            name="name"
            required
            maxLength={120}
            defaultValue={editCategory?.name}
            placeholder="Ej. Bebidas"
          />
        </label>
        <label>
          Color
          <input name="color" type="color" defaultValue={editCategory?.color || '#4caf50'} />
        </label>
        {editCategory && (
          <p className="field-hint">
            Puedes cambiar su nombre y color sin alterar las ventas anteriores.
          </p>
        )}
        <footer className="form-footer">
          <button className="primary" disabled={busy}>
            Guardar categoría
          </button>
        </footer>
      </form>
    );
  if (dialog === 'line' && line)
    dialogContent = (
      <form
        className="form-body"
        onSubmit={(e) =>
          submit(
            e,
            (f) =>
              pos.updateLine(ticket.id, line.id, Number(f.get('quantity')), String(f.get('note'))),
            'Artículo actualizado',
          )
        }
      >
        <div className="line-dialog-title">
          <h3>{line.name}</h3>
          <span>{money(line.unit_price)} por unidad</span>
        </div>
        <label>
          Cantidad
          <input
            data-autofocus
            name="quantity"
            type="number"
            min="1"
            max="9999"
            step="1"
            required
            defaultValue={line.quantity}
          />
        </label>
        <label>
          Observaciones
          <textarea
            name="note"
            rows={3}
            maxLength={500}
            defaultValue={line.note}
            placeholder="Ej. Sin azúcar"
          />
        </label>
        <footer className="form-footer split">
          <button
            type="button"
            className="danger-button"
            disabled={busy}
            onClick={() =>
              void run(() => pos.updateLine(ticket.id, line.id, 0, ''), 'Artículo eliminado', true)
            }
          >
            <Trash2 size={18} /> Eliminar
          </button>
          <button className="primary" disabled={busy}>
            Guardar cambios
          </button>
        </footer>
      </form>
    );
  if (dialog === 'ticket')
    dialogContent = (
      <form
        className="form-body"
        onSubmit={(e) =>
          submit(
            e,
            (f) =>
              pos.updateTicket(ticket.id, {
                label: String(f.get('label')),
                note: String(f.get('note')),
                discountBps: parsePercent(String(f.get('discount'))),
                customerId: ticket.customer_id,
              }),
            'Ticket actualizado',
          )
        }
      >
        <label>
          Nombre del ticket
          <input
            name="label"
            maxLength={120}
            defaultValue={ticket.label}
            placeholder="Ej. Mesa 3"
          />
        </label>
        <label>
          Descuento sobre el subtotal (%)
          <input
            data-autofocus
            name="discount"
            readOnly={!can('discounts')}
            inputMode="decimal"
            required
            defaultValue={(ticket.discount_bps / 100).toFixed(2)}
          />
        </label>
        <label>
          Observaciones
          <textarea name="note" maxLength={500} rows={3} defaultValue={ticket.note} />
        </label>
        <footer className="form-footer split">
          <button
            type="button"
            className="danger-button"
            disabled={busy}
            onClick={() => {
              setCancelId(ticket.id);
              setDialog('cancel');
            }}
          >
            <Trash2 size={17} /> Cancelar ticket
          </button>
          <button className="primary" disabled={busy}>
            Guardar cambios
          </button>
        </footer>
      </form>
    );
  if (dialog === 'park')
    dialogContent = (
      <form
        className="form-body"
        onSubmit={(e) =>
          submit(
            e,
            (f) => pos.park(ticket.id, String(f.get('label'))),
            'Ticket guardado. Puedes recuperarlo desde Tickets pendientes.',
          )
        }
      >
        <p>
          Guarda esta venta para continuar después. Sus productos permanecerán en inventario hasta
          cobrar.
        </p>
        <label>
          Nombre o referencia
          <input
            data-autofocus
            name="label"
            maxLength={120}
            defaultValue={ticket.label}
            placeholder={`Ticket #${pad(ticket.number)}`}
          />
        </label>
        <div className="checkout-total">
          <span>Total del ticket</span>
          <strong>{money(ticket.total)}</strong>
        </div>
        <button className="primary" disabled={busy}>
          Guardar ticket pendiente
        </button>
      </form>
    );
  if (dialog === 'checkout')
    dialogContent = (
      <CheckoutForm
        total={ticket.total}
        busy={busy}
        onError={setError}
        onSubmit={(payments) => {
          void run(async () => {
            const result = await pos.checkoutPayments(ticket.id, payments);
            setReceipt(result);
            setDialog('receipt');
          }, 'Venta registrada');
        }}
      />
    );
  if (dialog === 'receipt' && receipt)
    dialogContent = (
      <div className="form-body">
        <div className="receipt-paper" data-testid="receipt">
          <div className="receipt-success">
            <CheckCircle2 size={25} /> Venta completada
          </div>
          <h3>{receipt.sale.business_name}</h3>
          {receipt.sale.business_address && <p>{receipt.sale.business_address}</p>}
          {receipt.sale.business_phone && <p>{receipt.sale.business_phone}</p>}
          <p>
            Venta #{pad(receipt.sale.number)} · {date(receipt.sale.paid_at!)}
          </p>
          {receipt.sale.customer_name && <p>Cliente: {receipt.sale.customer_name}</p>}
          <div className="receipt-lines">
            {receipt.lines.map((l) => (
              <div key={l.id}>
                <span>
                  {l.quantity} × {l.name}
                  {l.note && <small>{l.note}</small>}
                  <small>{money(l.unit_price)} c/u</small>
                </span>
                <strong>{money(l.unit_price * l.quantity)}</strong>
              </div>
            ))}
          </div>
          <div className="receipt-totals">
            <div>
              <span>Subtotal</span>
              <span>{money(receipt.sale.subtotal)}</span>
            </div>
            {receipt.sale.discount > 0 && (
              <div>
                <span>Descuento</span>
                <span>−{money(receipt.sale.discount)}</span>
              </div>
            )}
            <div>
              <span>Impuesto ({receipt.sale.tax_bps / 100}%)</span>
              <span>{money(receipt.sale.tax)}</span>
            </div>
            <div className="receipt-grand">
              <strong>Total</strong>
              <strong>{money(receipt.sale.total)}</strong>
            </div>
            {receipt.payments.map((payment, index) => (
              <div className="receipt-payment" key={payment.id}>
                <div>
                  <span>
                    {receipt.payments.length > 1 ? `Pago ${index + 1} · ` : ''}
                    {PAYMENT_LABELS[payment.method]}
                  </span>
                  <strong>{money(payment.amount)}</strong>
                </div>
                {payment.reference && <small>Referencia: {payment.reference}</small>}
                {payment.method === 'cash' && (
                  <>
                    <div>
                      <span>Efectivo recibido</span>
                      <span>{money(payment.tendered)}</span>
                    </div>
                    <div>
                      <span>Cambio</span>
                      <strong>{money(payment.change_amount)}</strong>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
          {receipt.sale.note && <p>Nota: {receipt.sale.note}</p>}
          <p className="receipt-thanks">{data.business.receiptFooter}</p>
          <span className="receipt-brand">AVILES POS</span>
        </div>
        <button
          className="primary"
          onClick={() => {
            close();
            go('sales');
            setMobileTicket(false);
          }}
        >
          Nueva venta
        </button>
      </div>
    );
  if (dialog === 'customer')
    dialogContent = (
      <form
        className="form-body"
        onSubmit={(e) =>
          submit(
            e,
            (f) =>
              pos.saveCustomer({
                id: editCustomer?.id,
                name: String(f.get('name')),
                phone: String(f.get('phone')),
                email: String(f.get('email')),
                note: String(f.get('note')),
              }),
            'Cliente guardado',
          )
        }
      >
        <label>
          Nombre del cliente
          <input
            data-autofocus
            name="name"
            required
            maxLength={120}
            defaultValue={editCustomer?.name}
          />
        </label>
        <div className="form-row">
          <label>
            Teléfono
            <input name="phone" type="tel" maxLength={40} defaultValue={editCustomer?.phone} />
          </label>
          <label>
            Correo
            <input name="email" type="email" maxLength={150} defaultValue={editCustomer?.email} />
          </label>
        </div>
        <label>
          Observaciones
          <textarea name="note" rows={2} maxLength={500} defaultValue={editCustomer?.note} />
        </label>
        {editCustomer && (
          <div className="customer-history">
            <h3>Historial de compras</h3>
            {data.history.filter((s) => s.customer_id === editCustomer.id).length ? (
              data.history
                .filter((s) => s.customer_id === editCustomer.id)
                .map((s) => (
                  <div className="detail-row" key={s.id}>
                    <span>
                      #{pad(s.number)} · {date(s.paid_at!)}
                    </span>
                    <strong>{money(s.total)}</strong>
                  </div>
                ))
            ) : (
              <p className="muted">Aún no hay ventas asociadas.</p>
            )}
          </div>
        )}
        <button className="primary" disabled={busy}>
          Guardar cliente
        </button>
      </form>
    );
  if (dialog === 'assign')
    dialogContent = (
      <div className="form-body">
        <button
          className="selection-row"
          disabled={busy}
          onClick={() => void run(() => ticketUpdate(null), 'Cliente retirado del ticket', true)}
        >
          Público en general{!ticket.customer_id && <Check size={19} />}
        </button>
        {data.customers.map((c) => (
          <button
            className="selection-row"
            disabled={busy}
            key={c.id}
            onClick={() => void run(() => ticketUpdate(c.id), 'Cliente asignado', true)}
          >
            <span>
              {c.name}
              <small>{c.phone}</small>
            </span>
            {ticket.customer_id === c.id && <Check size={19} />}
          </button>
        ))}
        <button
          className="secondary"
          onClick={() => {
            setEditCustomer(undefined);
            setDialog('customer');
          }}
        >
          <Plus size={19} /> Crear cliente
        </button>
      </div>
    );
  if (dialog === 'scanner')
    dialogContent = (
      <form
        className="form-body"
        onSubmit={(e) => {
          e.preventDefault();
          const code = String(new FormData(e.currentTarget).get('barcode')).trim();
          const match = data.products.find((p) => p.active && p.barcode === code);
          if (!match) {
            setError('No se encontró un producto activo con ese código de barras.');
            return;
          }
          void run(() => pos.addProduct(ticket.id, match.id), `${match.name} agregado`, true);
        }}
      >
        <p>
          Conecta un lector USB o Bluetooth que funcione como teclado, o introduce el código. La
          cámara no se utiliza en esta versión.
        </p>
        <label>
          Código de barras
          <input
            data-autofocus
            name="barcode"
            required
            autoComplete="off"
            maxLength={120}
            placeholder="Escanea o escribe el código"
          />
        </label>
        <button className="primary" disabled={busy}>
          Agregar al ticket
        </button>
      </form>
    );
  if (dialog === 'cancel')
    dialogContent = (
      <div className="form-body">
        <p>
          ¿Cancelar este ticket? Se conservará el registro de cancelación y no se descontarán
          existencias. No podrás recuperarlo.
        </p>
        <div className="form-footer split">
          <button className="secondary" disabled={busy} onClick={close}>
            Conservar ticket
          </button>
          <button
            className="danger-button"
            disabled={busy}
            onClick={() => void run(() => pos.cancel(cancelId), 'Ticket cancelado', true)}
          >
            Sí, cancelar ticket
          </button>
        </div>
      </div>
    );
  if (dialog === 'help')
    dialogContent = (
      <div className="form-body">
        <div className="about-brand">
          <span className="brand-mark">A</span>
          <h2>
            AVILES POS <span>1.2</span>
          </h2>
        </div>
        <p>
          Punto de venta independiente para Android. Los productos, clientes, tickets y ventas se
          guardan en SQLite en este dispositivo.
        </p>
        <p>
          Para comenzar, crea categorías y productos desde el menú. En el punto de venta, toca un
          artículo para agregarlo y toca una línea del ticket para editar sus notas.
        </p>
        <p>
          GUARDAR conserva una venta pendiente. COBRAR registra pagos en efectivo, tarjeta,
          transferencia u otros y permite consultar el recibo en el historial.
        </p>
        <p className="field-hint">
          Versión 1.2: acceso de empleados con PIN, permisos, inventario operativo y turnos de caja.
          Pendientes: devoluciones, impresoras, respaldos exportables, variantes y modificadores.
          Consulta la documentación del proyecto antes de usarlo comercialmente.
        </p>
        <button className="secondary" onClick={close}>
          Entendido
        </button>
      </div>
    );

  return (
    <div className="app-shell" data-testid="app-ready" aria-busy={busy}>
      <div
        className={`workspace ${page !== 'sales' ? 'admin-workspace' : ''} ${mobileTicket ? 'show-ticket' : ''}`}
      >
        <main className="main-panel">
          <header className="main-header">
            <button
              className="icon-button light"
              aria-label="Abrir menú"
              onClick={() => setSidebar(true)}
            >
              <Menu size={25} />
            </button>
            <div className="header-title">
              <h1>{page === 'sales' ? currentCategory : nav.find((n) => n.key === page)?.title}</h1>
              <span>
                AVILES <b>POS</b>
              </span>
            </div>
            <div className="header-actions">
              {page === 'sales' && (
                <>
                  <button
                    className="icon-button light"
                    aria-label="Escanear código de barras"
                    onClick={() => setDialog('scanner')}
                  >
                    <ScanBarcode size={24} />
                  </button>
                  <button
                    className="icon-button light"
                    aria-label="Buscar productos"
                    onClick={() => searchField.current?.focus()}
                  >
                    <Search size={24} />
                  </button>
                </>
              )}
            </div>
          </header>
          {page === 'sales' ? (
            <>
              <div className="sales-toolbar">
                <div className="search-box">
                  <Search size={18} />
                  <input
                    ref={searchField}
                    aria-label="Buscar productos"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar productos"
                  />
                  {search && (
                    <button
                      className="icon-button small"
                      aria-label="Limpiar búsqueda"
                      onClick={() => setSearch('')}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
                <span className="product-count">{products.length} artículos</span>
                <button
                  className="icon-button"
                  title={data.view === 'grid' ? 'Ver como lista' : 'Ver como cuadrícula'}
                  aria-label={data.view === 'grid' ? 'Ver como lista' : 'Ver como cuadrícula'}
                  disabled={busy}
                  onClick={() =>
                    void run(() => pos.saveView(data.view === 'grid' ? 'list' : 'grid'))
                  }
                >
                  {data.view === 'grid' ? <List size={22} /> : <LayoutGrid size={21} />}
                </button>
              </div>
              <div className="product-scroll">
                {products.length ? (
                  <div className={data.view === 'grid' ? 'product-grid' : 'product-list'}>
                    {products.map((p) => (
                      <button
                        key={p.id}
                        className={`product-card ${p.photo ? 'has-photo' : ''}`}
                        aria-label={`Agregar ${p.name}`}
                        disabled={busy}
                        onClick={() => void run(() => pos.addProduct(ticket.id, p.id))}
                      >
                        <div className="product-visual">
                          <ProductImage
                            product={p}
                            color={data.categories.find((c) => c.id === p.category_id)?.color}
                          />
                          {p.favorite ? (
                            <span className="favorite-badge">
                              <Star size={12} fill="currentColor" />
                            </span>
                          ) : null}
                        </div>
                        <div className="product-caption">
                          <span>{p.name}</span>
                          <strong>{money(p.price)}</strong>
                        </div>
                        {data.view === 'list' && <Plus size={20} />}
                      </button>
                    ))}
                  </div>
                ) : (
                  <Empty
                    icon={data.products.some((p) => p.active) ? <Search /> : <ShoppingBasket />}
                    title={
                      data.products.some((p) => p.active)
                        ? 'No hay artículos en esta vista'
                        : 'Tu catálogo empieza aquí'
                    }
                  >
                    <p>
                      {data.products.some((p) => p.active)
                        ? 'Prueba otra categoría o busca un producto diferente.'
                        : 'Agrega tus productos y comienza tu primera venta.'}
                    </p>
                    {!data.products.some((p) => p.active) ? (
                      <>
                        <button className="primary" onClick={() => openProduct()}>
                          <Plus size={20} /> Crear primer producto
                        </button>
                        <button className="text-button" onClick={() => go('categories')}>
                          Organizar categorías <ChevronRight size={16} />
                        </button>
                      </>
                    ) : (
                      <button
                        className="secondary"
                        onClick={() => {
                          setCategory('all');
                          setSearch('');
                        }}
                      >
                        Mostrar todos
                      </button>
                    )}
                  </Empty>
                )}
              </div>
              <nav className="category-bar" aria-label="Categorías de productos">
                <button
                  className={category === 'all' ? 'selected' : ''}
                  onClick={() => setCategory('all')}
                >
                  <LayoutGrid size={18} />
                  <span>Todos</span>
                </button>
                <button
                  className={category === 'favorites' ? 'selected' : ''}
                  onClick={() => setCategory('favorites')}
                >
                  <Star size={18} />
                  <span>Favoritos</span>
                </button>
                {data.categories.map((c) => (
                  <button
                    className={category === c.id ? 'selected' : ''}
                    key={c.id}
                    onClick={() => setCategory(c.id)}
                  >
                    <span className="tiny-dot" style={{ backgroundColor: c.color }} />
                    <span>{c.name}</span>
                  </button>
                ))}
              </nav>
              <div className="local-status">
                <span className="status-dot" />
                <span>{offline ? 'Sin conexión · Operación local' : 'Operación local'}</span>
                <span className="status-business">{data.business.name}</span>
              </div>
            </>
          ) : (
            admin
          )}
        </main>
        {page === 'sales' && (
          <aside className="ticket-panel">
            <header className="ticket-header">
              <button
                className="icon-button mobile-back"
                aria-label="Volver a productos"
                onClick={() => setMobileTicket(false)}
              >
                <ArrowLeft />
              </button>
              <h2>
                Ticket <span className="ticket-number">#{pad(ticket.number)}</span>
              </h2>
              <button
                className={`icon-button ${ticket.customer_id ? 'assigned' : ''}`}
                aria-label="Asignar cliente"
                onClick={() => setDialog('assign')}
              >
                <UserRoundPlus size={22} />
              </button>
              <button
                className="icon-button"
                aria-label="Opciones del ticket"
                onClick={() => setDialog('ticket')}
              >
                <MoreVertical size={22} />
              </button>
            </header>
            <div className="ticket-subheader">
              <span>
                {ticket.label || 'Venta actual'}
                {ticket.customer_name ? ` · ${ticket.customer_name}` : ''}
              </span>
              <button className="text-button" onClick={() => go('pending')}>
                <Clock3 size={14} />
                {data.parked.length ? `${data.parked.length} pendientes` : 'Pendientes'}
              </button>
            </div>
            <div className="ticket-lines">
              {data.lines.length ? (
                data.lines.map((l) => (
                  <div className="ticket-line" key={l.id}>
                    <button
                      className="line-title"
                      onClick={() => {
                        setLine(l);
                        setDialog('line');
                      }}
                    >
                      <span>
                        {l.name}
                        <small>{money(l.unit_price)} c/u</small>
                        {l.note && <small className="line-note">{l.note}</small>}
                      </span>
                      <strong>{money(l.unit_price * l.quantity)}</strong>
                    </button>
                    <div className="line-controls">
                      <div className="stepper">
                        <button
                          aria-label={`Disminuir ${l.name}`}
                          disabled={busy}
                          onClick={() =>
                            void run(() => pos.updateLine(ticket.id, l.id, l.quantity - 1, l.note))
                          }
                        >
                          <Minus size={15} />
                        </button>
                        <button
                          className="quantity"
                          aria-label={`Cantidad de ${l.name}`}
                          onClick={() => {
                            setLine(l);
                            setDialog('line');
                          }}
                        >
                          {l.quantity}
                        </button>
                        <button
                          aria-label={`Aumentar ${l.name}`}
                          disabled={busy}
                          onClick={() =>
                            void run(() => pos.updateLine(ticket.id, l.id, l.quantity + 1, l.note))
                          }
                        >
                          <Plus size={15} />
                        </button>
                      </div>
                      <button
                        className="icon-button small muted"
                        aria-label={`Eliminar ${l.name}`}
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () => pos.updateLine(ticket.id, l.id, 0, ''),
                            'Artículo eliminado',
                          )
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-ticket">
                  <ReceiptText size={56} strokeWidth={1} />
                  <h3>Tu ticket está vacío</h3>
                  <p>Toca un producto para agregarlo a la venta.</p>
                </div>
              )}
            </div>
            <div className="ticket-bottom">
              {ticket.note && <p className="ticket-note">{ticket.note}</p>}
              <div className="ticket-totals">
                <div>
                  <span>
                    Subtotal{' '}
                    <small>
                      ({qty} {qty === 1 ? 'artículo' : 'artículos'})
                    </small>
                  </span>
                  <span>{money(ticket.subtotal)}</span>
                </div>
                <div>
                  <button className="text-button" onClick={() => setDialog('ticket')}>
                    <Tag size={14} /> Descuento
                    {ticket.discount_bps ? ` (${ticket.discount_bps / 100}%)` : ''}
                  </button>
                  <span>{ticket.discount ? `−${money(ticket.discount)}` : money(0)}</span>
                </div>
                <div>
                  <span>Impuesto ({ticket.tax_bps / 100}%)</span>
                  <span>{money(ticket.tax)}</span>
                </div>
                <div className="ticket-total">
                  <strong>Total</strong>
                  <strong data-testid="ticket-total">{money(ticket.total)}</strong>
                </div>
              </div>
              <div className="ticket-buttons">
                <button
                  disabled={busy || !data.lines.length || !can('sell')}
                  onClick={() => setDialog('park')}
                >
                  GUARDAR
                </button>
                <button
                  disabled={busy || !data.lines.length || !can('sell')}
                  onClick={() => {
                    if (data.business.cashManagement && !data.shift) {
                      go('cash');
                      setNotice('Abre el turno antes de cobrar');
                    } else setDialog('checkout');
                  }}
                >
                  COBRAR
                </button>
              </div>
              <div className="ticket-footer">
                AVILES POS <span>•</span> MXN
              </div>
            </div>
          </aside>
        )}
      </div>
      {page === 'sales' && !mobileTicket && (
        <button className="mobile-cart primary" onClick={() => setMobileTicket(true)}>
          <ReceiptText size={20} /> Ver ticket · {qty}
          <strong>{money(ticket.total)}</strong>
        </button>
      )}
      {notice && (
        <div role="status" className="toast">
          <CheckCircle2 size={19} />
          {notice}
          <button
            className="icon-button small"
            aria-label="Cerrar aviso"
            onClick={() => setNotice('')}
          >
            <X size={17} />
          </button>
        </div>
      )}
      {error && !dialog && (
        <div role="alert" className="error-toast">
          {error}
          <button
            className="icon-button small"
            aria-label="Cerrar error"
            onClick={() => setError('')}
          >
            <X size={18} />
          </button>
        </div>
      )}
      {sidebar && (
        <Modal side title="AVILES POS" onClose={() => setSidebar(false)}>
          <div className="navigation-menu">
            <div className="menu-business">
              <Store size={26} />
              <div>
                <strong>{data.business.name}</strong>
                <span>
                  {data.actor.name} · {ROLE_LABELS[data.actor.role]}
                </span>
              </div>
            </div>
            {nav
              .filter((n) => allowed[n.key])
              .map((n) => (
                <button
                  key={n.key}
                  aria-label={n.title}
                  className={page === n.key ? 'active' : ''}
                  onClick={() => go(n.key)}
                >
                  <n.icon size={22} />
                  <span>{n.title}</span>
                  {n.key === 'pending' && data.parked.length > 0 && <b>{data.parked.length}</b>}
                </button>
              ))}
            <button onClick={onLock} disabled={busy}>
              <LockKeyhole size={21} /> Bloquear y cambiar empleado
            </button>
            <button
              className="menu-help"
              onClick={() => {
                setSidebar(false);
                setDialog('help');
              }}
            >
              <CircleHelp size={21} /> Acerca de y ayuda <small>1.2</small>
            </button>
          </div>
        </Modal>
      )}
      {dialog && (
        <Modal key={dialog} title={titles[dialog]} onClose={close} wide={dialog === 'product'}>
          {error && (
            <div className="inline-error" role="alert">
              {error}
              <button
                className="icon-button small"
                aria-label="Cerrar error"
                onClick={() => setError('')}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {dialogContent}
        </Modal>
      )}
    </div>
  );
}
