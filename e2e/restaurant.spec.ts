import { expect, test, type Page } from '@playwright/test';
import { ready, unlock, reload, createProduct, navigate, signIn } from './helpers';
async function area(page: Page, name = 'Salón') {
  await page.getByRole('button', { name: 'Mesas', exact: true }).click();
  await page.getByRole('button', { name: 'Crear primera área', exact: true }).click();
  await page.getByLabel('Nombre del área', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Guardar área', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function table(page: Page, name: string, shape = 'square') {
  await page.getByRole('button', { name: 'Agregar mesa', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre de la mesa', { exact: true }).fill(name);
  await dialog.getByLabel('Forma de la mesa', { exact: true }).selectOption(shape);
  await dialog.getByRole('button', { name: 'Guardar mesa', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}
async function backMap(page: Page) {
  await page.getByRole('button', { name: 'Mapa', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mapa de mesas', exact: true })).toBeVisible();
}
async function billAction(page: Page, name: string) {
  await page.getByRole('button', { name: 'Gestionar mesa', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name, exact: true }).click();
}

test('PIN con teclado numérico y apertura obligatoria con fondos MXN/USD', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await signIn(page);
  await expect(page.getByTestId('app-ready')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Apertura de caja', exact: true })).toBeVisible();
  await page.getByLabel('Fondo inicial de caja (MXN)', { exact: true }).fill('100.00');
  await page.getByLabel('Fondo inicial en dólares (USD)', { exact: true }).fill('20.00');
  await page.getByLabel('Tipo de cambio · MXN por 1 USD', { exact: true }).fill('18.1234');
  await page.getByRole('button', { name: 'ABRIR TURNO', exact: true }).click();
  await expect(page.getByTestId('app-ready')).toBeVisible();
  await navigate(page, 'Caja y turnos');
  await expect(page.getByText('Fondo inicial USD', { exact: true }).locator('..')).toContainText(
    '$20.00',
  );
  await expect(page.getByText(/18.1234 MXN \/ USD/)).toBeVisible();
  await page.getByRole('button', { name: 'Abrir menú', exact: true }).click();
  await page.getByRole('button', { name: 'Bloquear y cambiar empleado', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Bienvenido a AVILES POS', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Identificador', { exact: true })).toHaveCount(0);
  for (const digit of '832641')
    await page.getByRole('button', { name: digit, exact: true }).click();
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByTestId('app-ready')).toBeVisible();
  await expect(page.getByTestId('opening-required')).toHaveCount(0);
  await context.setOffline(true);
  await reload(page);
  await navigate(page, 'Caja y turnos');
  await page.getByRole('button', { name: 'Corte de consulta', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Corte de consulta');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Cerrar ventana', exact: true })
    .click();
  await expect(page.getByText('Turno abierto', { exact: true })).toBeVisible();
});

test('mapa: crear y mover mesas, guardar cuentas y recuperar sin conexión', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1024, height: 600 });
  await ready(page);
  await createProduct(page, 'Producto de mesa', '10.00', false, undefined, 20);
  await navigate(page, 'Punto de venta');
  await page.getByRole('button', { name: 'Agregar Producto de mesa', exact: true }).click();
  await area(page);
  await table(page, '1');
  await table(page, '2', 'round');
  await table(page, '3', 'rectangle');
  const tile = page.getByRole('button', { name: 'Editar mesa 1', exact: true });
  const before = (await tile.boundingBox())!;
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 70, before.y + before.height / 2 + 120, {
    steps: 8,
  });
  await page.mouse.up();
  await expect(page.getByText('Posición guardada', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Terminar edición', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir mesa 1', exact: true }).click();
  await page.getByRole('button', { name: 'Agregar Producto de mesa', exact: true }).click();
  await page.getByRole('button', { name: 'Cantidad de Producto de mesa', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Cantidad', { exact: true }).fill('2');
  await dialog.getByLabel('Observaciones', { exact: true }).fill('Sin cebolla');
  await dialog.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await backMap(page);
  await expect(page.getByRole('button', { name: 'Abrir mesa 1', exact: true })).toContainText(
    '$20.00',
  );
  await page.getByRole('button', { name: 'Abrir mesa 2', exact: true }).click();
  await page.getByRole('button', { name: 'Agregar Producto de mesa', exact: true }).click();
  await billAction(page, 'Marcar pendiente de cobro');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await backMap(page);
  await expect(page.getByRole('button', { name: 'Abrir mesa 2', exact: true })).toContainText(
    'Pendiente de cobro',
  );
  await page.screenshot({ path: 'artifacts/capturas/2.1-mapa-tableta.png' });
  await context.setOffline(true);
  await reload(page);
  await expect(page.getByRole('heading', { name: 'Mapa de mesas', exact: true })).toBeVisible();
  const after = (await page
    .getByRole('button', { name: 'Abrir mesa 1', exact: true })
    .boundingBox())!;
  expect(after.x).toBeGreaterThan(before.x + 50);
  await page.getByRole('button', { name: 'Abrir mesa 1', exact: true }).click();
  await expect(page.getByTestId('ticket-total')).toContainText('$20.00');
  await expect(page.getByText('Sin cebolla', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Venta rápida', exact: true }).click();
  await expect(page.getByTestId('ticket-total')).toContainText('$10.00');
});

test('cuentas: transferir, unir y cobrar sin liberar una mesa pendiente', async ({ page }) => {
  await ready(page);
  await createProduct(page, 'Consumo', '10.00');
  await navigate(page, 'Punto de venta');
  await area(page);
  await table(page, '1');
  await table(page, '2');
  await table(page, '3');
  await page.getByRole('button', { name: 'Terminar edición', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir mesa 1', exact: true }).click();
  await page.getByRole('button', { name: 'Agregar Consumo', exact: true }).click();
  await billAction(page, 'Transferir mesa');
  await page
    .getByRole('dialog')
    .getByLabel('Mesa de destino', { exact: true })
    .selectOption({ label: 'Salón · 3' });
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirmar operación', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await backMap(page);
  await expect(page.getByRole('button', { name: 'Abrir mesa 1', exact: true })).toContainText(
    'Disponible',
  );
  await expect(page.getByRole('button', { name: 'Abrir mesa 3', exact: true })).toContainText(
    '$10.00',
  );
  await page.getByRole('button', { name: 'Abrir mesa 2', exact: true }).click();
  await page.getByRole('button', { name: 'Agregar Consumo', exact: true }).click();
  await billAction(page, 'Unir cuentas');
  await page
    .getByRole('dialog')
    .getByLabel('Mesa de destino', { exact: true })
    .selectOption({ label: 'Salón · 3 · $10.00 MXN' });
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirmar operación', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('ticket-total')).toContainText('$20.00');
  await page.getByRole('button', { name: 'COBRAR', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByLabel('Efectivo recibido (MXN)', { exact: true })
    .fill('20.00');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirmar cobro', exact: true })
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Nueva venta', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mapa de mesas', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Abrir mesa 3', exact: true })).toContainText(
    'Disponible',
  );
  await navigate(page, 'Historial de ventas');
  await expect(page.locator('.catalog-row')).toHaveCount(1);
});

test('modo configurado y cajero sin edición del plano, con cuenta recuperada tras reabrir turno', async ({
  page,
}) => {
  await ready(page);
  await createProduct(page, 'Pendiente', '10.00');
  await navigate(page, 'Punto de venta');
  await area(page);
  await table(page, '1');
  await page.getByRole('button', { name: 'Terminar edición', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir mesa 1', exact: true }).click();
  await page.getByRole('button', { name: 'Agregar Pendiente', exact: true }).click();
  await navigate(page, 'Configuración');
  await page
    .getByRole('combobox', { name: 'Modo de operación', exact: true })
    .selectOption('restaurant');
  await page.getByRole('button', { name: 'Guardar configuración', exact: true }).click();
  await navigate(page, 'Punto de venta');
  await expect(page.getByRole('heading', { name: 'Mapa de mesas', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Venta rápida', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Abrir mesa 1', exact: true }).click();
  await navigate(page, 'Caja y turnos');
  await page.getByRole('button', { name: 'Cerrar turno', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Efectivo contado (MXN)', { exact: true }).fill('0.00');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirmar cierre', exact: true })
    .click();
  await expect(page.getByTestId('opening-required')).toBeVisible();
  await page.getByRole('button', { name: 'ABRIR TURNO', exact: true }).click();
  await expect(page.getByTestId('ticket-total')).toContainText('$10.00');
  await expect(page.getByText('1', { exact: true }).first()).toBeVisible();
  await navigate(page, 'Empleados');
  await page.getByRole('button', { name: 'Crear empleado', exact: true }).click();
  const form = page.getByRole('dialog');
  await form.getByLabel('Nombre del empleado', { exact: true }).fill('Mesero');
  await form.getByLabel('Identificador de acceso', { exact: true }).fill('mesero');
  await form.getByLabel('PIN del empleado', { exact: true }).fill('739154');
  await form.getByRole('button', { name: 'Guardar empleado', exact: true }).click();
  await expect(form).toHaveCount(0);
  await page.getByRole('button', { name: 'Abrir menú', exact: true }).click();
  await page.getByRole('button', { name: 'Bloquear y cambiar empleado', exact: true }).click();
  await unlock(page, 'mesero', '739154');
  await expect(page.getByRole('heading', { name: 'Mapa de mesas', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar plano', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Abrir mesa 1', exact: true }).click();
  await billAction(page, 'Marcar pendiente de cobro');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
