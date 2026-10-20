import { useState, type FormEvent } from 'react';
import { Plus, Pencil } from 'lucide-react';
import {
  DEFAULT_PERMISSIONS,
  PERMISSION_LABELS,
  ROLE_LABELS,
  type Employee,
  type Permission,
  type Role,
} from '../domain/access-types';
import { STOCK_KIND_LABELS } from '../domain/inventory';
import { Modal } from './Modal';
import { useModule } from './useModule';
import type { ModuleProps } from './moduleTypes';
const ACTIONS: Record<string, string> = {
  'employee.bootstrap': 'Creación del propietario',
  'employee.create': 'Creación de empleado',
  'employee.update': 'Cambio de empleado o permisos',
  'employee.login': 'Inicio de sesión',
  'employee.login_failed': 'Acceso fallido',
  'cash.open': 'Apertura de caja',
  'cash.close': 'Cierre de caja',
  'cash.in': 'Ingreso de efectivo',
  'cash.out': 'Egreso de efectivo',
  'cash.withdrawal': 'Retiro de efectivo',
  'product.create': 'Creación de producto',
  'product.update': 'Cambio de producto',
  'category.save': 'Cambio de categoría',
  'category.delete': 'Eliminación de categoría',
  'sale.complete': 'Cobro de venta',
  'ticket.cancel': 'Cancelación de ticket',
  'ticket.update': 'Cambio de opciones del ticket',
  'business.update': 'Cambio de configuración',
};
const actionLabel = (action: string) =>
  ACTIONS[action] ||
  (action.startsWith('inventory.')
    ? `Inventario: ${STOCK_KIND_LABELS[action.slice(10)] || action.slice(10)}`
    : action);
function EmployeeForm({
  employee,
  busy,
  onSave,
}: {
  employee?: Employee;
  busy: boolean;
  onSave: (event: FormEvent<HTMLFormElement>, role: Role, permissions: Permission[]) => void;
}) {
  const [role, setRole] = useState<Role>(employee?.role || 'cashier');
  const [selected, setSelected] = useState<Permission[]>(
    employee?.permissions || [...DEFAULT_PERMISSIONS.cashier],
  );
  return (
    <form className="form-body" onSubmit={(event) => onSave(event, role, selected)}>
      <label>
        Nombre del empleado
        <input name="name" required maxLength={120} defaultValue={employee?.name} />
      </label>
      <label>
        Identificador de acceso
        <input
          aria-label="Identificador de acceso"
          name="identifier"
          required
          maxLength={40}
          pattern="[a-zA-Z0-9._\-]+"
          autoCapitalize="none"
          autoComplete="off"
          defaultValue={employee?.identifier}
        />
        <small>Letras sin acentos, números, punto, guion o guion bajo.</small>
      </label>
      <label>
        {employee ? 'Nuevo PIN (opcional)' : 'PIN del empleado'}
        <input
          aria-label={employee ? 'Nuevo PIN (opcional)' : 'PIN del empleado'}
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          pattern="[0-9]{4,8}"
          minLength={4}
          maxLength={8}
          required={!employee}
        />
        <small>
          {employee ? 'Deja vacío para conservar su PIN actual.' : 'Entre 4 y 8 dígitos.'}
        </small>
      </label>
      <label>
        Rol
        <select
          value={role}
          onChange={(event) => {
            const next = event.target.value as Role;
            setRole(next);
            setSelected([...DEFAULT_PERMISSIONS[next]]);
          }}
        >
          {Object.entries(ROLE_LABELS).map(([id, name]) => (
            <option value={id} key={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label className="check-label">
        <input name="active" type="checkbox" defaultChecked={employee ? !!employee.active : true} />{' '}
        Empleado activo
      </label>
      <fieldset className="permissions">
        <legend>Permisos individuales</legend>
        {(Object.entries(PERMISSION_LABELS) as [Permission, string][])
          .filter(([key]) => !['refunds', 'reprint'].includes(key))
          .map(([key, label]) => (
            <label className="check-label" key={key}>
              <input
                type="checkbox"
                checked={selected.includes(key)}
                onChange={(event) =>
                  setSelected((old) =>
                    event.target.checked ? [...old, key] : old.filter((item) => item !== key),
                  )
                }
              />{' '}
              {label}
            </label>
          ))}
      </fieldset>
      <p className="field-hint">
        Cambiar el rol carga sus permisos sugeridos. Puedes ajustarlos antes de guardar.
        Devoluciones y reimpresión física están pendientes y no se habilitan aquí.
      </p>
      <footer className="form-footer">
        <button className="primary" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar empleado'}
        </button>
      </footer>
    </form>
  );
}
export function EmployeesPanel({ pos, onChanged, onLock }: ModuleProps) {
  const [editing, setEditing] = useState<Employee | 'new' | null>(null);
  const { data, error, notice, busy, run, setError } = useModule(
    async () => ({ employees: await pos.access.list(), audit: await pos.access.auditHistory() }),
    onChanged,
    onLock,
  );
  async function submit(event: FormEvent<HTMLFormElement>, role: Role, permissions: Permission[]) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const ok = await run(
      () =>
        pos.access.save({
          id: editing && editing !== 'new' ? editing.id : undefined,
          name: String(form.get('name')),
          identifier: String(form.get('identifier')),
          role,
          active: form.has('active') ? 1 : 0,
          pin: String(form.get('pin') || ''),
          permissions,
        }),
      'Empleado y permisos guardados',
    );
    if (ok) setEditing(null);
  }
  return (
    <section className="admin-content">
      <div className="section-heading">
        <div>
          <h1>Empleados</h1>
          <p>Acceso local con PIN y permisos por persona</p>
        </div>
        <button
          className="primary"
          onClick={() => {
            setError('');
            setEditing('new');
          }}
        >
          <Plus size={19} /> Crear empleado
        </button>
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
      <div className="data-list">
        {data?.employees.map((employee) => (
          <button
            className="catalog-row"
            key={employee.id}
            onClick={() => {
              setError('');
              setEditing(employee);
            }}
          >
            <span className="avatar">{employee.name.slice(0, 1)}</span>
            <div className="grow">
              <strong>{employee.name}</strong>
              <small>
                {employee.identifier} · {ROLE_LABELS[employee.role]}
              </small>
            </div>
            <span>{employee.active ? 'Activo' : 'Inactivo'}</span>
            <Pencil size={18} />
          </button>
        ))}
      </div>
      <h2>Actividad administrativa</h2>
      <p className="field-hint">
        Últimas 200 acciones. El historial conserva el nombre registrado en el momento de la acción.
      </p>
      <div className="table-scroll">
        <table className="module-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Empleado</th>
              <th>Acción</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {data?.audit.map((item) => (
              <tr key={item.id}>
                <td>{new Date(item.created_at).toLocaleString('es-MX')}</td>
                <td>{item.actor_name}</td>
                <td>{actionLabel(item.action)}</td>
                <td>
                  <details>
                    <summary>Ver detalle</summary>
                    <pre>{JSON.stringify(JSON.parse(item.details), null, 2)}</pre>
                    <small>Referencia: {item.target}</small>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <Modal
          title={editing === 'new' ? 'Nuevo empleado' : 'Editar empleado'}
          onClose={() => {
            if (!busy) setEditing(null);
          }}
        >
          {error && (
            <p role="alert" className="inline-error">
              {error}
            </p>
          )}
          <EmployeeForm
            key={editing === 'new' ? 'new' : editing.id}
            employee={editing === 'new' ? undefined : editing}
            busy={busy}
            onSave={(event, role, permissions) => void submit(event, role, permissions)}
          />
        </Modal>
      )}
    </section>
  );
}
