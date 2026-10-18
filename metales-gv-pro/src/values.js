'use strict';

class AppError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const assert = (ok, message, status = 400) => { if (!ok) throw new AppError(message, status); };
function text(value, label, max = 120, required = true) {
  assert(typeof value === 'string' || (!required && value == null), `${label}: texto no válido.`);
  const s = String(value ?? '').trim();
  assert((!required || s.length > 0) && s.length <= max && !/[\x00-\x08\x0b-\x1f\x7f]/.test(s), `${label}: revisa el contenido (máximo ${max} caracteres).`);
  return s;
}
// Cantidades decimales -> enteros. Nunca se acumulan kilos o dinero en punto flotante.
function decimal(value, digits, label, { signed = false, max = 1e11 } = {}) {
  assert(typeof value === 'number' || typeof value === 'string', `${label}: captura un número.`);
  const s = String(value).trim();
  const pattern = new RegExp(`^${signed ? '-?' : ''}\\d+(?:\\.\\d{1,${digits}})?$`);
  assert(pattern.test(s), `${label}: usa hasta ${digits} decimales y ${signed ? 'un número válido' : 'un importe positivo'}.`);
  const [whole, fraction = ''] = s.replace('-', '').split('.');
  const n = Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, '0'));
  assert(Number.isSafeInteger(n) && n <= max, `${label}: fuera de rango.`);
  return s.startsWith('-') ? -n : n;
}
const cents = (v, label = 'Importe') => decimal(v, 2, label);
const grams = (v, label = 'Kilogramos', signed = false) => decimal(v, 3, label, { signed, max: 1e10 });
function roundedProduct(a, b, divisor) {
  const value = (BigInt(a) * BigInt(b) + BigInt(divisor) / 2n) / BigInt(divisor);
  assert(value <= BigInt(Number.MAX_SAFE_INTEGER), 'El resultado excede el límite permitido.');
  return Number(value);
}
const lineTotal = (g, price) => roundedProduct(g, price, 1000);
const id = (v) => { const n = Number(v); assert(Number.isSafeInteger(n) && n > 0, 'Identificador no válido.'); return n; };
function dateRange(from, to) {
  for (const v of [from, to]) if (v) assert(/^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, 'Fecha no válida.');
  assert(!(from && to && from > to), 'La fecha inicial debe ser anterior a la final.');
  return { from, to };
}
const safeUser = u => u && ({ id: u.id, name: u.name, role: u.role, active: !!u.active });
module.exports = { AppError, assert, text, decimal, cents, grams, roundedProduct, lineTotal, id, dateRange, safeUser };
