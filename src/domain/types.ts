import type { Actor } from './access-types';
import type { Shift } from './cash';

export interface Category {
  id: string;
  name: string;
  color: string;
}
export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  description: string;
  category_id: string | null;
  price: number;
  cost: number;
  photo: string;
  active: number;
  favorite: number;
  track_stock: number;
  stock: number;
  low_stock: number;
  unit: string;
}
export interface Sale {
  id: string;
  number: number;
  status: 'draft' | 'parked' | 'paid' | 'cancelled';
  label: string;
  note: string;
  customer_id: string | null;
  customer_name: string;
  discount_bps: number;
  tax_bps: number;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  created_at: string;
  updated_at: string;
  paid_at: string | null;
  business_name: string;
  business_address: string;
  business_phone: string;
  employee_id: string | null;
  employee_name: string;
  shift_id: string | null;
  table_name: string;
  waiter_id: string | null;
  waiter_name: string;
}
export interface SaleLine {
  id: string;
  sale_id: string;
  product_id: string;
  name: string;
  unit_price: number;
  quantity: number;
  note: string;
}
export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'other';
export interface PaymentRequest {
  method: PaymentMethod;
  amount?: number;
  tendered?: number;
  reference?: string;
}
export interface Payment {
  id: string;
  sale_id: string;
  method: PaymentMethod;
  position: number;
  reference: string;
  amount: number;
  tendered: number;
  change_amount: number;
  created_at: string;
}
export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  note: string;
}
export interface Business {
  name: string;
  address: string;
  phone: string;
  taxBps: number;
  receiptFooter: string;
  cashManagement?: boolean;
  operationMode?: 'quick' | 'restaurant' | 'both';
  exchangeRate?: number | null;
}
export interface Snapshot {
  categories: Category[];
  products: Product[];
  customers: Customer[];
  active: Sale;
  lines: SaleLine[];
  parked: Sale[];
  history: (Sale & { payment_methods: string })[];
  business: Business;
  view: 'grid' | 'list';
  actor: Actor;
  shift: Shift | null;
  workspace: { mode: 'quick' | 'tables'; table_view: 'map' | 'bill' };
  table: import('./tables').TableContext | null;
}
export interface Receipt {
  sale: Sale;
  lines: SaleLine[];
  payments: Payment[];
  /** First payment, retained for compatibility with the original cash checkout API. */
  payment: Payment;
}
