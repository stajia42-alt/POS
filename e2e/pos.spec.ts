import { test, expect } from '@playwright/test';
import { navigate, ready, createProduct, reload } from './helpers';

test('venta completa: categorías, foto, edición, persistencia, pendiente, efectivo e historial', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await ready(page);
  await navigate(page, 'Categorías');
  await page.getByRole('button', { name: 'Crear categoría', exact: true }).click();
  await page.getByLabel('Nombre de la categoría', { exact: true }).fill('Bebidas');
  await page.getByRole('button', { name: 'Guardar categoría' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await createProduct(page, 'Café americano', '40.00', true);
  await page.getByRole('button', { name: /Café americano.*Activo/ }).click();
  await page
    .getByRole('combobox', { name: 'Categoría', exact: true })
    .selectOption({ label: 'Bebidas' });
  await page.getByRole('button', { name: 'Guardar producto', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await navigate(page, 'Configuración');
  await page.getByLabel('Nombre del negocio', { exact: true }).fill('Aviles Café');
  await page.getByLabel('Impuesto añadido (%)', { exact: true }).fill('16');
  await page.getByRole('button', { name: 'Guardar configuración' }).click();
  await expect(page.getByRole('status')).toContainText('Configuración guardada');
  await navigate(page, 'Punto de venta');
  await page.getByRole('button', { name: 'Bebidas', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Agregar Café americano', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Agregar Café americano', exact: true }).click();
  await expect(page.getByTestId('ticket-total')).toHaveText('$46.40 MXN');
  await page.getByRole('button', { name: 'Aumentar Café americano', exact: true }).click();
  await expect(page.getByTestId('ticket-total')).toHaveText('$92.80 MXN');
  await page.getByRole('button', { name: 'Cantidad de Café americano', exact: true }).click();
  await page.getByLabel('Observaciones', { exact: true }).fill('Sin azúcar');
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Opciones del ticket', exact: true }).click();
  await page.getByLabel('Descuento sobre el subtotal (%)', { exact: true }).fill('10');
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(page.getByTestId('ticket-total')).toHaveText('$83.52 MXN');
  await page.getByRole('button', { name: 'Ver como lista', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Ver como cuadrícula', exact: true }),
  ).toBeVisible();
  await reload(page);
  await expect(page.getByTestId('app-ready')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Ver como cuadrícula', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Sin azúcar', { exact: true })).toBeVisible();
  await expect(page.getByTestId('ticket-total')).toHaveText('$83.52 MXN');
  await page.getByRole('button', { name: 'GUARDAR', exact: true }).click();
  await page.getByLabel('Nombre o referencia', { exact: true }).fill('Mesa 3');
  await page.getByRole('button', { name: 'Guardar ticket pendiente', exact: true }).click();
  await expect(page.getByText('Tu ticket está vacío', { exact: true })).toBeVisible();
  await reload(page);
  await expect(page.getByTestId('app-ready')).toBeVisible();
  await navigate(page, 'Tickets pendientes');
  await expect(page.getByText('Mesa 3', { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Recuperar', exact: true }).click();
  await expect(page.getByTestId('ticket-total')).toHaveText('$83.52 MXN');
  await page.getByRole('button', { name: 'COBRAR', exact: true }).click();
  await page.getByLabel('Efectivo recibido (MXN)', { exact: true }).fill('40');
  await expect(page.getByRole('button', { name: 'Confirmar cobro', exact: true })).toBeDisabled();
  await page.getByLabel('Efectivo recibido (MXN)', { exact: true }).fill('100');
  await expect(page.getByText('$16.48 MXN', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar cobro', exact: true }).click();
  await expect(page.getByTestId('receipt')).toContainText('Venta completada');
  await expect(page.getByTestId('receipt')).toContainText('$16.48 MXN');
  await page.getByRole('button', { name: 'Nueva venta', exact: true }).click();
  await navigate(page, 'Historial de ventas');
  await expect(page.getByText('1 ventas completadas', { exact: false })).toBeVisible();
  await reload(page);
  await expect(page.getByTestId('app-ready')).toBeVisible();
  await navigate(page, 'Historial de ventas');
  await page.getByRole('button', { name: /Venta #0001/ }).click();
  await expect(page.getByTestId('receipt')).toContainText('Sin azúcar');
  await expect(page.getByTestId('receipt')).toContainText('Aviles Café');
  expect(errors).toEqual([]);
});

test('operación y reinicio sin conexión, lector de teclado y cancelación', async ({
  page,
  context,
}) => {
  await ready(page);
  await createProduct(page);
  await navigate(page, 'Punto de venta');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Escanear código de barras', exact: true }).click();
  await page.getByLabel('Código de barras', { exact: true }).fill('7501234567890');
  await page.getByRole('button', { name: 'Agregar al ticket', exact: true }).click();
  await expect(page.getByTestId('ticket-total')).toHaveText('$40.00 MXN');
  await reload(page);
  await expect(page.getByTestId('app-ready')).toBeVisible();
  await expect(page.getByTestId('ticket-total')).toHaveText('$40.00 MXN');
  await expect(page.getByText('Sin conexión · Operación local', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'COBRAR', exact: true }).click();
  await page.getByRole('button', { name: 'Exacto', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar cobro', exact: true }).click();
  await expect(page.getByTestId('receipt')).toContainText('$0.00 MXN');
  await page.getByRole('button', { name: 'Nueva venta', exact: true }).click();
  await page.getByRole('button', { name: 'Agregar Café americano', exact: true }).click();
  await page.getByRole('button', { name: 'Opciones del ticket', exact: true }).click();
  await page.getByRole('button', { name: 'Cancelar ticket', exact: true }).click();
  await page.getByRole('button', { name: 'Sí, cancelar ticket', exact: true }).click();
  await expect(page.getByText('Tu ticket está vacío', { exact: true })).toBeVisible();
  await navigate(page, 'Historial de ventas');
  await expect(page.getByText('1 ventas completadas', { exact: false })).toBeVisible();
});

test('diseño adaptable en tableta pequeña y móvil, controles accesibles por teclado', async ({
  page,
}) => {
  await ready(page);
  await createProduct(page);
  await navigate(page, 'Punto de venta');
  for (const size of [
    { width: 1340, height: 800 },
    { width: 1024, height: 600 },
    { width: 800, height: 600 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await expect(
      page.getByRole('button', { name: 'Agregar Café americano', exact: true }),
    ).toBeVisible();
    if (size.width > 760) {
      const box = await page.getByRole('button', { name: 'COBRAR', exact: true }).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y + box!.height).toBeLessThanOrEqual(size.height);
    }
  }
  await page.getByRole('button', { name: 'Agregar Café americano', exact: true }).click();
  await page.getByRole('button', { name: /Ver ticket/ }).click();
  await expect(page.getByTestId('ticket-total')).toHaveText('$40.00 MXN');
  await page.getByRole('button', { name: 'Cantidad de Café americano' }).click();
  await expect(page.getByLabel('Cantidad', { exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Eliminar Café americano', exact: true }).click();
  await expect(page.getByText('Tu ticket está vacío', { exact: true })).toBeVisible();
});

test('bloquea una segunda pestaña para impedir escrituras SQLite incompatibles', async ({
  page,
  context,
}) => {
  await ready(page);
  const second = await context.newPage();
  await second.goto('/');
  await expect(second.getByRole('alert')).toContainText('ya está abierto en otra pestaña');
  await second.close();
  await expect(page.getByTestId('app-ready')).toBeVisible();
});

test('catálogo con varias filas, búsqueda, clientes y capturas de la interfaz de tableta', async ({
  page,
}) => {
  await ready(page);
  await page.screenshot({ path: 'artifacts/capturas/catalogo-inicial.png' });
  for (const category of ['Café', 'Té', 'Especialidades']) {
    await navigate(page, 'Categorías');
    await page.getByRole('button', { name: 'Crear categoría', exact: true }).click();
    await page.getByLabel('Nombre de la categoría', { exact: true }).fill(category);
    await page.getByRole('button', { name: 'Guardar categoría', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  for (const [index, name] of [
    'Café americano',
    'Capuchino',
    'Té de hierbabuena',
    'Chocolate caliente',
    'Café con leche',
    'Espresso doble',
    'Latte de vainilla',
    'Té chai',
    'Café descafeinado',
    'Infusión de manzanilla',
    'Chocolate sin azúcar',
    'Capuchino con leche deslactosada',
  ].entries()) {
    await createProduct(
      page,
      name,
      String(35 + index * 5),
      index % 3 !== 2,
      index % 3 === 2 ? 'Té' : index % 3 === 1 ? 'Especialidades' : 'Café',
    );
  }
  await navigate(page, 'Clientes');
  await page.getByRole('button', { name: 'Crear cliente', exact: true }).click();
  await page.getByLabel('Nombre del cliente', { exact: true }).fill('Cliente de prueba');
  await page.getByLabel('Teléfono', { exact: true }).fill('5551234567');
  await page.getByRole('button', { name: 'Guardar cliente', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await navigate(page, 'Punto de venta');
  await page.getByRole('button', { name: 'Agregar Café americano', exact: true }).click();
  await page.getByRole('button', { name: 'Agregar Capuchino', exact: true }).click();
  await page.getByRole('button', { name: 'Aumentar Capuchino', exact: true }).click();
  await page.getByRole('button', { name: 'Asignar cliente', exact: true }).click();
  await page.getByRole('button', { name: 'Cliente de prueba 5551234567', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveCount(0, { timeout: 7000 });
  await page.screenshot({ path: 'artifacts/capturas/venta-tableta.png' });
  await page.setViewportSize({ width: 1024, height: 600 });
  await page.screenshot({ path: 'artifacts/capturas/venta-tableta-pequena.png' });
  expect(
    await page.evaluate(
      () =>
        document.querySelector('.product-scroll')!.scrollHeight >
        document.querySelector('.product-scroll')!.clientHeight,
    ),
  ).toBe(true);
  await page.getByRole('textbox', { name: 'Buscar productos', exact: true }).fill('hierbabuena');
  await expect(page.getByRole('button', { name: /^Agregar / })).toHaveCount(1);
  await page.getByRole('button', { name: 'Limpiar búsqueda', exact: true }).click();
  await page.getByRole('button', { name: 'Té', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Agregar / })).toHaveCount(4);
  await page.getByRole('button', { name: 'COBRAR', exact: true }).click();
  await page.getByRole('button', { name: 'Exacto', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar cobro', exact: true }).click();
  await expect(page.getByTestId('receipt')).toContainText('Cliente de prueba');
  await page.getByRole('button', { name: 'Nueva venta', exact: true }).click();
  await navigate(page, 'Clientes');
  await page.getByRole('button', { name: /Cliente de prueba.*1 compras/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Historial de compras');
  await expect(page.getByRole('dialog')).toContainText('$115.00 MXN');
});
