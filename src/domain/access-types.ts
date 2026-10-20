export const PERMISSION_LABELS = {
  sell: 'Realizar ventas',
  discounts: 'Aplicar descuentos',
  cancel_sales: 'Cancelar tickets',
  edit_prices: 'Modificar precios',
  refunds: 'Realizar devoluciones',
  reports: 'Consultar reportes',
  products: 'Administrar productos y categorías',
  inventory: 'Administrar inventario',
  open_cash: 'Abrir caja',
  close_cash: 'Cerrar caja',
  cash_moves: 'Registrar movimientos de caja',
  settings: 'Modificar configuración',
  reprint: 'Reimprimir tickets',
  employees: 'Administrar empleados y permisos',
} as const;
export type Permission = keyof typeof PERMISSION_LABELS;
export type Role = 'admin' | 'supervisor' | 'cashier';
export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrador',
  supervisor: 'Supervisor',
  cashier: 'Cajero',
};
export const DEFAULT_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: Object.keys(PERMISSION_LABELS) as Permission[],
  supervisor: [
    'sell',
    'discounts',
    'cancel_sales',
    'refunds',
    'reports',
    'inventory',
    'open_cash',
    'close_cash',
    'cash_moves',
    'reprint',
  ],
  cashier: ['sell', 'open_cash'],
};
export interface Actor {
  id: string;
  name: string;
  identifier: string;
  role: Role;
  permissions: Permission[];
}
export interface Employee extends Actor {
  active: number;
}
export interface EmployeeInput {
  id?: string;
  name: string;
  identifier: string;
  role: Role;
  active: number;
  pin?: string;
  permissions: Permission[];
}
export interface AuditRow {
  id: string;
  actor_id: string | null;
  actor_name: string;
  action: string;
  target: string;
  details: string;
  created_at: string;
}
