export const MAX_CENTS = 99_999_999;

export function money(cents: number): string {
  return `${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(cents / 100)} MXN`;
}

export function parseMoney(value: string): number {
  const text = value.trim().replace(',', '.');
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(text))
    throw new Error('Escribe un importe válido con máximo dos decimales.');
  const [whole, fraction = ''] = text.split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (result > MAX_CENTS) throw new Error('El importe excede el máximo permitido.');
  return result;
}

export function parsePercent(value: string): number {
  const result = parseMoney(value);
  if (result > 10_000) throw new Error('El porcentaje debe estar entre 0 y 100.');
  return result;
}

export function integer(value: number, min = 0, max = MAX_CENTS): number {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new Error('Cantidad o importe fuera del rango permitido.');
  return value;
}

export function totals(
  lines: { unit_price: number; quantity: number }[],
  discountBps: number,
  taxBps: number,
) {
  integer(discountBps, 0, 10_000);
  integer(taxBps, 0, 10_000);
  const subtotal = lines.reduce(
    (sum, line) => sum + integer(line.unit_price) * integer(line.quantity, 1, 9999),
    0,
  );
  integer(subtotal);
  const discount = Math.floor((subtotal * discountBps + 5000) / 10_000);
  const tax = Math.floor(((subtotal - discount) * taxBps + 5000) / 10_000);
  const total = integer(subtotal - discount + tax);
  return { subtotal, discount, tax, total };
}

export function parseRate(value: string): number {
  const text = value.trim().replace(',', '.');
  if (!/^\d{1,4}(\.\d{1,4})?$/.test(text))
    throw new Error('Indica un tipo de cambio válido, con hasta cuatro decimales.');
  const [whole, part = ''] = text.split('.');
  return integer(Number(whole) * 10000 + Number(part.padEnd(4, '0')), 1, 99999999);
}
export function currencyMoney(cents: number, currency: 'MXN' | 'USD') {
  return `${new Intl.NumberFormat('es-MX', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).format(cents / 100)} ${currency}`;
}
