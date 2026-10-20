import { test, expect } from '@playwright/test';
import initSqlJs from 'sql.js';
import { navigate, ready, createProduct } from './helpers';
import { Database } from '../src/db/database';
import { WasmDriver } from '../src/db/wasm-driver';
import { migrate } from '../src/db/migrations';

test('pagos combinados: reparto exacto, cambio, referencias y confirmación repetida', async ({
  page,
}) => {
  await ready(page);
  await createProduct(page, 'Café americano', '101.01');
  await navigate(page, 'Punto de venta');
  await page.getByRole('button', { name: 'Agregar Café americano', exact: true }).click();
  await page.getByRole('button', { name: 'COBRAR', exact: true }).click();
  await page.getByRole('button', { name: 'Dividir pago', exact: true }).click();
  await page.getByRole('combobox', { name: 'Método de pago 1', exact: true }).selectOption('card');
  await page.getByLabel('Importe del pago 1 (MXN)', { exact: true }).fill('40.01');
  await page.getByLabel('Referencia del pago 1 (opcional)', { exact: true }).fill('AUT-123');
  await page.getByRole('combobox', { name: 'Método de pago 2', exact: true }).selectOption('cash');
  await page.getByLabel('Importe del pago 2 (MXN)', { exact: true }).fill('60.99');
  await page.getByLabel('Efectivo recibido · pago 2 (MXN)', { exact: true }).fill('100');
  await expect(page.getByTestId('payment-remaining')).toHaveText('$0.01 MXN');
  await expect(page.getByRole('button', { name: 'Confirmar cobro', exact: true })).toBeDisabled();
  await page.getByLabel('Importe del pago 2 (MXN)', { exact: true }).fill('61.01');
  await expect(page.getByText('Exceso distribuido', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirmar cobro', exact: true })).toBeDisabled();
  await page.getByLabel('Importe del pago 2 (MXN)', { exact: true }).fill('61.00');
  await expect(page.getByRole('button', { name: 'Confirmar cobro', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Agregar forma de pago', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Método de pago 3', exact: true })
    .selectOption('transfer');
  await page.getByLabel('Importe del pago 3 (MXN)', { exact: true }).fill('30');
  await page.getByLabel('Referencia del pago 3 (opcional)', { exact: true }).fill('SPEI-456');
  await page.getByLabel('Importe del pago 2 (MXN)', { exact: true }).fill('31');
  await page.getByLabel('Efectivo recibido · pago 2 (MXN)', { exact: true }).fill('50');
  await expect(page.getByTestId('payment-remaining')).toHaveText('$0.00 MXN');
  await expect(page.getByRole('button', { name: 'Confirmar cobro', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Confirmar cobro', exact: true }).evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(page.getByTestId('receipt')).toContainText('Venta completada');
  await expect(page.getByTestId('receipt')).toContainText('Pago 1 · Tarjeta');
  await expect(page.getByTestId('receipt')).toContainText('Pago 2 · Efectivo');
  await expect(page.getByTestId('receipt')).toContainText('Pago 3 · Transferencia');
  await expect(page.getByTestId('receipt')).toContainText('AUT-123');
  await expect(page.getByTestId('receipt')).toContainText('SPEI-456');
  await expect(page.getByTestId('receipt')).toContainText('$19.00 MXN');
  await page.screenshot({ path: 'artifacts/capturas/recibo-combinado-1.1.png' });
  await page.reload();
  await expect(page.getByTestId('app-ready')).toBeVisible();
  await navigate(page, 'Historial de ventas');
  await expect(page.getByText(/1 ventas completadas/)).toBeVisible();
  await expect(page.getByText(/Combinado: Tarjeta \+ Efectivo \+ Transferencia/)).toBeVisible();
  await page.getByRole('button', { name: /Venta #0001/ }).click();
  await expect(page.getByTestId('receipt')).toContainText('SPEI-456');
  await expect(page.getByTestId('receipt')).toContainText('$19.00 MXN');
});

for (const [label, reference] of [
  ['Tarjeta', 'AUT-1'],
  ['Transferencia', 'SPEI-2'],
  ['Otro', 'VALE-3'],
]) {
  test(`registro manual de ${label} sin conexión`, async ({ page, context }) => {
    await ready(page);
    await createProduct(page);
    await navigate(page, 'Punto de venta');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Agregar Café americano', exact: true }).click();
    await page.getByRole('button', { name: 'COBRAR', exact: true }).click();
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page.getByText(/Registro manual de/)).toContainText('no cobra en tu terminal');
    await page.getByLabel('Referencia (opcional)', { exact: true }).fill(reference);
    await expect(page.getByLabel('Efectivo recibido (MXN)', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Confirmar cobro', exact: true }).click();
    await expect(page.getByTestId('receipt')).toContainText(label);
    await expect(page.getByTestId('receipt')).toContainText(reference);
    await expect(page.getByTestId('receipt').getByText('Cambio', { exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('app-ready')).toBeVisible();
    await navigate(page, 'Historial de ventas');
    await expect(page.getByText(`${label} · Completada`, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Venta #0001/ }).click();
    await expect(page.getByTestId('receipt')).toContainText(reference);
  });
}

test('eliminar una forma de pago restaura el cobro simple y se adapta al teléfono', async ({
  page,
}) => {
  await ready(page);
  await createProduct(page);
  await navigate(page, 'Punto de venta');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Agregar Café americano', exact: true }).click();
  await page.getByRole('button', { name: /Ver ticket/ }).click();
  await page.getByRole('button', { name: 'COBRAR', exact: true }).click();
  await page.getByRole('button', { name: 'Dividir pago', exact: true }).click();
  await page.getByRole('button', { name: 'Eliminar pago 2', exact: true }).click();
  await expect(page.getByLabel('Importe del pago 1 (MXN)', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Exacto', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirmar cobro', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Confirmar cobro', exact: true }).click();
  await expect(page.getByTestId('receipt')).toContainText('$40.00 MXN');
});

test('la aplicación abre y migra el archivo SQLite 1.0 guardado en IndexedDB', async ({ page }) => {
  const sqlite = await initSqlJs();
  let bytes = new Uint8Array();
  const db = new Database(
    new WasmDriver(sqlite, {
      async load() {
        return undefined;
      },
      async save(data) {
        bytes = new Uint8Array(data);
      },
    }),
  );
  await migrate(db, 1);
  await db.transaction(async (sql) => {
    await sql.run(
      "INSERT INTO sales(id,number,status,business_name,subtotal,total,created_at,updated_at,paid_at) VALUES('legacy',1,'paid','Negocio versión 1.0',4000,4000,'2026-10-20','2026-10-20','2026-10-20')",
    );
    await sql.run(
      "INSERT INTO products(id,name,price) VALUES('old-product','Café versión 1.0',4000)",
    );
    await sql.run(
      "INSERT INTO sale_lines(id,sale_id,product_id,name,unit_price,quantity) VALUES('old-line','legacy','old-product','Café versión 1.0',4000,1)",
    );
    await sql.run(
      "INSERT INTO payments(id,sale_id,method,amount,tendered,change_amount,created_at) VALUES('legacy-payment','legacy','cash',4000,5000,1000,'2026-10-20')",
    );
  });
  await page.goto('/aviles.svg');
  await page.evaluate(async (data) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('aviles-pos-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('sqlite');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const storage = request.result;
        const transaction = storage.transaction('sqlite', 'readwrite');
        transaction.objectStore('sqlite').put(new Uint8Array(data), 'database');
        transaction.oncomplete = () => {
          storage.close();
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  }, Array.from(bytes));
  await ready(page);
  await navigate(page, 'Historial de ventas');
  await page.getByRole('button', { name: /Venta #0001/ }).click();
  await expect(page.getByTestId('receipt')).toContainText('Negocio versión 1.0');
  await expect(page.getByTestId('receipt')).toContainText('$10.00 MXN');
  await page.getByRole('button', { name: 'Nueva venta', exact: true }).click();
  await createProduct(page);
  await navigate(page, 'Punto de venta');
  await page.getByRole('button', { name: 'Agregar Café americano', exact: true }).click();
  await page.getByRole('button', { name: 'COBRAR', exact: true }).click();
  await page.getByRole('button', { name: 'Tarjeta', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar cobro', exact: true }).click();
  await expect(page.getByTestId('receipt')).toContainText('Tarjeta');
});
