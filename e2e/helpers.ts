import { expect, type Page } from '@playwright/test';

export async function navigate(page: Page, title: string) {
  await page.getByRole('button', { name: 'Abrir menú', exact: true }).click();
  await page.getByRole('button', { name: title, exact: true }).click();
}
export async function ready(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('app-ready')).toBeVisible();
}
export async function createProduct(
  page: Page,
  name = 'Café americano',
  price = '40.00',
  photo = false,
  categoryName?: string,
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
  await page.getByLabel('Favorito', { exact: true }).check();
  await page.getByRole('button', { name: 'Guardar producto', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
