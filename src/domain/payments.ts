import { integer } from './money';
import type { PaymentMethod, PaymentRequest } from './types';

export const MAX_PAYMENTS = 10;
export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  other: 'Otro',
};

export function paymentSummary(methods: string[]): string {
  const unique = [...new Set(methods)].filter((method) => Object.hasOwn(PAYMENT_LABELS, method));
  const names = unique.map((method) => PAYMENT_LABELS[method as PaymentMethod]);
  return names.length > 1 ? `Combinado: ${names.join(' + ')}` : names[0] || 'Pago registrado';
}

export function preparePayments(total: number, requests: readonly PaymentRequest[]) {
  integer(total);
  if (!Array.isArray(requests) || requests.length < 1 || requests.length > MAX_PAYMENTS)
    throw new Error(`Registra entre 1 y ${MAX_PAYMENTS} pagos para completar la venta.`);

  const prepared = requests.map((request, position) => {
    if (!request || !Object.hasOwn(PAYMENT_LABELS, request.method))
      throw new Error('Método de pago no válido.');
    const amount = request.amount ?? (requests.length === 1 ? total : NaN);
    integer(amount, requests.length === 1 && total === 0 ? 0 : 1);
    if (request.reference !== undefined && typeof request.reference !== 'string')
      throw new Error('Referencia de pago no válida.');
    const reference = (request.reference || '').trim();
    if (reference.length > 120) throw new Error('La referencia admite hasta 120 caracteres.');
    const tendered = request.method === 'cash' ? request.tendered : (request.tendered ?? amount);
    if (tendered === undefined) throw new Error('Escribe el efectivo recibido.');
    integer(tendered);
    if (tendered < amount) throw new Error('El efectivo recibido es menor al importe del pago.');
    if (request.method !== 'cash' && tendered !== amount)
      throw new Error('Solo los pagos en efectivo pueden generar cambio.');
    return {
      method: request.method,
      amount,
      tendered,
      change_amount: tendered - amount,
      reference,
      position,
    };
  });
  const allocated = prepared.reduce((sum, payment) => sum + payment.amount, 0);
  if (allocated !== total)
    throw new Error('La suma de los pagos debe coincidir exactamente con el total de la venta.');
  return prepared;
}
