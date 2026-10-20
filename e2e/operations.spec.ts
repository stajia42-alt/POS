import { expect, test } from '@playwright/test';
import { ready, reload, unlock, navigate, createProduct } from './helpers';

test('inventario: entradas, costos, conteos, alertas y reinicio offline', async ({
  page,
  context,
}) => {
  await ready(page);
  await createProduct(page, 'Café inventariado', '10.00', false, undefined, 5);
  await navigate(page, 'Inventario');
  await page.getByRole('button', { name: 'Registrar movimiento', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('Producto', { exact: true })
    .selectOption({ label: 'Café inventariado · 5 pieza' });
  await dialog.getByLabel('Cantidad de unidades', { exact: true }).fill('5');
  await dialog
    .getByLabel('Costo unitario de la entrada (MXN, opcional)', { exact: true })
    .fill('4.00');
  await dialog.getByLabel('Motivo', { exact: true }).fill('Compra recibida');
  await dialog.getByRole('button', { name: 'Guardar movimiento', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('row').filter({ hasText: 'Compra recibida' })).toContainText(
    '5 → 10',
  );
  await page.getByRole('button', { name: 'Registrar movimiento', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('Producto', { exact: true })
    .selectOption({ label: 'Café inventariado · 10 pieza' });
  await dialog.getByLabel('Tipo de movimiento', { exact: true }).selectOption('count');
  await dialog.getByLabel('Cantidad contada', { exact: true }).fill('2');
  await dialog.getByLabel('Motivo', { exact: true }).fill('Conteo físico de cierre');
  await dialog.getByRole('button', { name: 'Guardar movimiento', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Revisar existencias', { exact: true })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Conteo físico de cierre' })).toContainText(
    '10 → 2',
  );
  await context.setOffline(true);
  await reload(page);
  await navigate(page, 'Inventario');
  await expect(page.getByRole('row').filter({ hasText: 'Conteo físico de cierre' })).toContainText(
    'Test owner',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole('heading', { name: 'Inventario', exact: true }).first(),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('empleados: acceso con PIN, permisos individuales, restablecimiento y desactivación', async ({
  page,
}) => {
  await ready(page);
  await createProduct(page, 'Artículo de venta', '10.00');
  await navigate(page, 'Empleados');
  await page.getByRole('button', { name: 'Crear empleado', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre del empleado', { exact: true }).fill('Caja principal');
  await dialog.getByLabel('Identificador de acceso', { exact: true }).fill('caja');
  await dialog.getByLabel('PIN del empleado', { exact: true }).fill('739154');
  await dialog.getByRole('button', { name: 'Guardar empleado', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await navigate(page, 'Punto de venta');
  await page.getByRole('button', { name: 'Abrir menú', exact: true }).click();
  await page.getByRole('button', { name: 'Bloquear y cambiar empleado', exact: true }).click();
  await unlock(page, 'caja', '739154');
  await page.getByRole('button', { name: 'Abrir menú', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Empleados', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Configuración', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Inventario', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Historial de ventas', exact: true })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Bloquear y cambiar empleado', exact: true }).click();
  await unlock(page);
  await navigate(page, 'Empleados');
  await page.getByRole('button').filter({ hasText: 'Caja principal' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nuevo PIN (opcional)', { exact: true }).fill('184739');
  await dialog.getByLabel('Consultar reportes', { exact: true }).check();
  await dialog.getByRole('button', { name: 'Guardar empleado', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Abrir menú', exact: true }).click();
  await page.getByRole('button', { name: 'Bloquear y cambiar empleado', exact: true }).click();
  await unlock(page, 'caja', '184739');
  await page.getByRole('button', { name: 'Abrir menú', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Historial de ventas', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Bloquear y cambiar empleado', exact: true }).click();
  await unlock(page);
  await navigate(page, 'Empleados');
  await page.getByRole('button').filter({ hasText: 'Caja principal' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Empleado activo', { exact: true }).uncheck();
  await dialog.getByRole('button', { name: 'Guardar empleado', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button').filter({ hasText: 'Caja principal' })).toContainText(
    'Inactivo',
  );
});

test('caja: apertura, venta con cambio, retiro, arqueo, cierre persistente y nueva apertura', async ({
  page,
  context,
}) => {
  await ready(page);
  await createProduct(page, 'Producto de caja', '10.00', false, undefined, 10);
  await navigate(page, 'Configuración');
  await page.getByLabel('Control de caja por turnos', { exact: true }).check();
  await page.getByRole('button', { name: 'Guardar configuración', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Configuración guardada');
  await navigate(page, 'Punto de venta');
  await page.getByRole('button', { name: 'Agregar Producto de caja', exact: true }).click();
  await page.getByRole('button', { name: 'COBRAR', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Caja y turnos', exact: true }).first(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Abrir turno', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Fondo inicial de caja (MXN)', { exact: true }).fill('100.00');
  await dialog.getByRole('button', { name: 'Abrir el turno', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await navigate(page, 'Punto de venta');
  await page.getByRole('button', { name: 'COBRAR', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Efectivo recibido (MXN)', { exact: true }).fill('20.00');
  await dialog.getByRole('button', { name: 'Confirmar cobro', exact: true }).click();
  await expect(dialog).toContainText('Cambio');
  await dialog.getByRole('button', { name: 'Nueva venta', exact: true }).click();
  await navigate(page, 'Caja y turnos');
  await expect(page.getByText('Efectivo esperado', { exact: true }).locator('..')).toContainText(
    '$110.00',
  );
  await page.getByRole('button', { name: 'Movimiento de caja', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Tipo de movimiento', { exact: true }).selectOption('withdrawal');
  await dialog.getByLabel('Importe del movimiento (MXN)', { exact: true }).fill('20.00');
  await dialog.getByLabel('Motivo', { exact: true }).fill('Retiro a caja fuerte');
  await dialog.getByRole('button', { name: 'Guardar movimiento', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Cerrar turno', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Efectivo contado (MXN)', { exact: true }).fill('89.00');
  await expect(dialog).toContainText('Faltante: $1.00');
  await dialog.getByRole('button', { name: 'Confirmar cierre', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'El turno está cerrado', exact: true }),
  ).toBeVisible();
  await context.setOffline(true);
  await reload(page);
  await navigate(page, 'Caja y turnos');
  await page.getByRole('button').filter({ hasText: 'Contado $89.00' }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Retiro a caja fuerte');
  await expect(dialog.getByText('Faltante', { exact: true }).locator('..')).toContainText('$1.00');
  await expect(dialog.getByText('Ventas del turno · 1', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cerrar ventana', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir turno', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Abrir el turno', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Turno abierto', { exact: true })).toBeVisible();
});
