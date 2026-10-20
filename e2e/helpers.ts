import { expect, type Page } from '@playwright/test';

export async function navigate(page: Page, title: string) {
  await page.getByRole('button', { name: 'Abrir menú', exact: true }).click();
  await page.getByRole('button', { name: title, exact: true }).click();
}
export async function ready(page: Page, opening = '0.00') {
  await page.goto('/');
  await unlock(page, 'owner', '832641', opening);
}
export async function createProduct(
  page: Page,
  name = 'Café americano',
  price = '40.00',
  photo = false,
  categoryName?: string,
  stock?: number,
) {
  await navigate(page, 'Productos');
  await page.getByRole('button', { name: 'Crear producto', exact: true }).first().click();
  await page.getByLabel('Nombre del producto', { exact: true }).fill(name);
  await page.getByLabel('Precio de venta (MXN)', { exact: true }).fill(price);
  const code =
    name === 'Café americano'
      ? '7501234567890'
      : '750' +
        String([...name].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 0)).padStart(10, '0');
  await page.getByLabel('Código de barras', { exact: true }).fill(code);
  if (categoryName)
    await page
      .getByRole('combobox', { name: 'Categoría', exact: true })
      .selectOption({ label: categoryName });
  if (photo) {
    // Original, single-color PNG fixture; no sample products are shipped in the app.
    const png = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 300;
      canvas.height = 240;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#dfd7c9';
      ctx.fillRect(0, 0, 300, 240);
      ctx.fillStyle = '#fffaf0';
      ctx.beginPath();
      ctx.ellipse(150, 135, 65, 60, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#65412c';
      ctx.beginPath();
      ctx.ellipse(150, 115, 48, 35, 0, 0, Math.PI * 2);
      ctx.fill();
      return canvas.toDataURL('image/png').split(',')[1];
    });
    await page.getByLabel('Fotografía del producto', { exact: true }).setInputFiles({
      name: 'cafe-original.png',
      mimeType: 'image/png',
      buffer: Buffer.from(png, 'base64'),
    });
    await expect(page.getByRole('button', { name: 'Guardar producto', exact: true })).toBeEnabled();
  }
  if (stock !== undefined) {
    await page.getByLabel('Controlar existencias', { exact: true }).check();
    await page.getByLabel('Existencias actuales', { exact: true }).fill(String(stock));
    await page.getByLabel('Umbral de stock bajo', { exact: true }).fill('3');
  }
  await page.getByLabel('Favorito', { exact: true }).check();
  await page.getByRole('button', { name: 'Guardar producto', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

export async function signIn(page: Page, pin = '832641') {
  await expect(
    page.getByRole('heading', { name: /Configura al propietario|Bienvenido a AVILES POS/ }),
  ).toBeVisible();
  const setup = await page.getByRole('heading', { name: 'Configura al propietario' }).isVisible();
  if (setup) await page.getByLabel('Nombre del propietario', { exact: true }).fill('Test owner');
  await page.getByLabel(setup ? 'Crear PIN (4 a 8 dígitos)' : 'PIN', { exact: true }).fill(pin);
  if (setup) await page.getByLabel('Confirmar PIN', { exact: true }).fill(pin);
  await page
    .getByRole('button', { name: setup ? 'Crear acceso local' : 'Entrar', exact: true })
    .click();
  await expect(
    page.locator('[data-testid="app-ready"], [data-testid="opening-required"]'),
  ).toBeVisible();
}
export async function unlock(page: Page, _identifier = 'owner', pin = '832641', opening = '0.00') {
  await signIn(page, pin);
  if (await page.getByTestId('opening-required').isVisible()) {
    await page.getByLabel('Fondo inicial de caja (MXN)', { exact: true }).fill(opening);
    await page.getByLabel('Fondo inicial en dólares (USD)', { exact: true }).fill('0.00');
    const rate = page.getByLabel('Tipo de cambio · MXN por 1 USD', { exact: true });
    if (await rate.isEditable()) await rate.fill('18.0000');
    await page.getByRole('button', { name: 'ABRIR TURNO', exact: true }).click();
  }
  await expect(page.getByTestId('app-ready')).toBeVisible();
}
export async function reload(page: Page) {
  await page.reload();
  await unlock(page);
}
