import { test, expect } from '@playwright/test';
// Playwright normally hides scrollbars, which masks the Windows layout feedback loop.
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

test('50% zoom settles when the page height is near the scrollbar threshold', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('/');
  await page.addStyleTag({ content: '.zengroq-pdf-scroll::-webkit-scrollbar { width: 17px; height: 17px; }' });
  await expect(page.locator('.zengroq-pdf')).toHaveAttribute('data-rendered-page', '2');
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await expect(page.getByText('50%', { exact: true })).toBeVisible();
  const results = await page.evaluate(async () => {
    const host = document.querySelector<HTMLElement>('#viewer')!;
    const scroller = host.querySelector<HTMLElement>('.zengroq-pdf-scroll')!;
    const pageElement = host.querySelector<HTMLElement>('.zengroq-pdf-page')!;
    host.style.width = '800px';
    const changes: { height: number; renders: number; widths: number[]; pageHeight: number; clientHeight: number; clientWidth: number }[] = [];
    let renders = 0;
    const widths = new Set<number>();
    const observer = new MutationObserver(() => { renders++; widths.add(scroller.clientWidth); });
    observer.observe(pageElement, { childList: true });
    // On Windows the classic vertical scrollbar takes 15-17 pixels. These
    // heights straddle the point where a half-size page starts overflowing.
    for (let height = 540; height <= 650; height += 5) {
      host.style.height = `${height}px`;
      renders = 0; widths.clear();
      await new Promise(resolve => setTimeout(resolve, 200));
      changes.push({ height, renders, widths: [...widths], pageHeight: pageElement.clientHeight, clientHeight: scroller.clientHeight, clientWidth: scroller.clientWidth });
    }
    observer.disconnect();
    return changes;
  });
  expect(results.filter(result => result.renders > 5), JSON.stringify(results)).toEqual([]);
  expect(results.filter(result => result.widths.length > 1), JSON.stringify(results)).toEqual([]);
  await expect(page.getByText('50%', { exact: true })).toBeVisible();
});
