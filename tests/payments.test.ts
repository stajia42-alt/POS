import { describe, expect, it } from 'vitest';
import { MAX_PAYMENTS, paymentSummary, preparePayments } from '../src/domain/payments';
import type { PaymentRequest } from '../src/domain/types';

describe('distribución de pagos', () => {
  it.each(['cash', 'card', 'transfer', 'other'] as const)(
    'registra %s por el total exacto',
    (method) => {
      const [payment] = preparePayments(100, [
        { method, tendered: method === 'cash' ? 200 : undefined, reference: ' Folio 1 ' },
      ]);
      expect(payment).toMatchObject({
        method,
        amount: 100,
        tendered: method === 'cash' ? 200 : 100,
        change_amount: method === 'cash' ? 100 : 0,
        reference: 'Folio 1',
        position: 0,
      });
    },
  );
  it('divide en centavos y aplica cambio únicamente al efectivo', () => {
    const payments = preparePayments(101, [
      { method: 'card', amount: 50 },
      { method: 'cash', amount: 51, tendered: 100 },
    ]);
    expect(payments.map((p) => p.amount)).toEqual([50, 51]);
    expect(payments.map((p) => p.change_amount)).toEqual([0, 49]);
  });
  it.each([99, 101])('rechaza distribución distinta al total: %s', (amount) => {
    expect(() => preparePayments(100, [{ method: 'card', amount }])).toThrow(
      'coincidir exactamente',
    );
  });
  it('rechaza errores de importe, método, referencia y efectivo', () => {
    const invalid: PaymentRequest[][] = [
      [],
      [{ method: 'card', amount: -1 }],
      [{ method: 'card', amount: 0.5 }],
      [{ method: 'cash', amount: 100, tendered: 99 }],
      [{ method: 'cash' }],
      [{ method: 'card', amount: 100, tendered: 200 }],
      [{ method: 'transfer', reference: 'a'.repeat(121) }],
      [{ method: 'invalid' as 'card' }],
      [{ method: 'card' }, { method: 'cash', amount: 50, tendered: 50 }],
      [
        { method: 'card', amount: 100 },
        { method: 'cash', amount: 0, tendered: 50 },
      ],
      Array.from({ length: MAX_PAYMENTS + 1 }, () => ({ method: 'card' as const, amount: 1 })),
    ];
    for (const requests of invalid) expect(() => preparePayments(100, requests)).toThrow();
  });
  it('permite un ticket gratuito y divide entre varios pagos del mismo método', () => {
    expect(preparePayments(0, [{ method: 'cash', tendered: 0 }])[0].amount).toBe(0);
    expect(
      preparePayments(100, [
        { method: 'card', amount: 30 },
        { method: 'card', amount: 70 },
      ]),
    ).toHaveLength(2);
    expect(paymentSummary(['card', 'card'])).toBe('Tarjeta');
    expect(paymentSummary(['cash', 'card'])).toBe('Combinado: Efectivo + Tarjeta');
  });
});
