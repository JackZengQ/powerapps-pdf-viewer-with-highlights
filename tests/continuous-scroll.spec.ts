import { test, expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { readFileSync } from 'node:fs';

test('scrolls between pages, tracks the page indicator, and jumps back to selected fields', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const root = page.locator('.zengroq-pdf');
  await expect(root).toHaveAttribute('data-rendered-page', '2');
  await expect(page.locator('.zengroq-pdf-page')).toHaveCount(2);
  await page.locator('#field').selectOption('1');
  await expect(root).toHaveAttribute('data-rendered-page', '1');
  const scrollArea = page.locator('.zengroq-pdf-scroll');
  const area = (await scrollArea.boundingBox())!;
  const pageHeight = await page.locator('.zengroq-pdf-page[data-page-number="1"]').evaluate(el => el.clientHeight);
  await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
  await page.mouse.wheel(0, pageHeight + 24);
  await expect(root).toHaveAttribute('data-rendered-page', '2');
  await expect(page.getByText('Page 2 of 2', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled();
  await expect(page.locator('.zengroq-pdf-page[data-page-number="1"] rect')).toHaveCount(1);
  await page.mouse.wheel(0, -(pageHeight + 24));
  await expect(root).toHaveAttribute('data-rendered-page', '1');
  await page.locator('#field').selectOption('0');
  await expect(root).toHaveAttribute('data-rendered-page', '2');
  const rect = (await page.locator('rect').boundingBox())!;
  expect(rect.y).toBeGreaterThanOrEqual(area.y);
  expect(rect.y + rect.height).toBeLessThanOrEqual(area.y + area.height);
  await page.getByRole('button', { name: 'Previous page', exact: true }).click();
  await expect(root).toHaveAttribute('data-rendered-page', '1');
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(root).toHaveAttribute('data-rendered-page', '2');
  expect(errors).toEqual([]);
});

test('releases distant page canvases and renders them again when scrolling back', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const source = await PDFDocument.load(readFileSync('samples/fictional-invoice.pdf'));
  const pdf = await PDFDocument.create();
  for (let index = 0; index < 8; index++) {
    const [copy] = await pdf.copyPages(source, [index % 2]);
    pdf.addPage(copy);
  }
  await page.goto('/');
  const root = page.locator('.zengroq-pdf');
  await expect(root).toHaveAttribute('data-rendered-page', '2');
  await page.locator('#field').selectOption('2');
  await page.locator('#file').setInputFiles({ name: 'fictional-eight-pages.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) });
  await expect(page.locator('.zengroq-pdf-page')).toHaveCount(8);
  await expect(root).toHaveAttribute('data-rendered-page', '1');
  expect(await page.locator('canvas').count()).toBeLessThan(8);
  await page.locator('.zengroq-pdf-scroll').evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect(root).toHaveAttribute('data-rendered-page', '8');
  await expect(page.locator('.zengroq-pdf-page[data-page-number="1"] canvas')).toHaveCount(0);
  expect(await page.locator('canvas').count()).toBeLessThan(8);
  await page.locator('.zengroq-pdf-scroll').evaluate(el => { el.scrollTop = 0; });
  await expect(root).toHaveAttribute('data-rendered-page', '1');
  await expect(page.locator('.zengroq-pdf-page[data-page-number="8"] canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});
