import { test, expect, type Worker } from '@playwright/test';
import { readFileSync } from 'node:fs';

for (const build of ['preview', 'production'] as const) {
  test(`${build} renders with Promise.withResolvers and Promise.try missing in both realms`, async ({ page }) => {
    const errors: string[] = [];
    const external: string[] = [];
    const workers: Worker[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('worker', worker => workers.push(worker));
    page.on('request', request => {
      if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:5173/')) external.push(request.url());
    });
    await page.addInitScript(() => {
      for (const key of ['withResolvers', 'try']) Object.defineProperty(Promise, key, { value: undefined, configurable: true, writable: true });
      // Removing the API from Window alone does not simulate an older worker.
      // Prefix the actual embedded worker bytes so its realm starts without it too.
      const createObjectURL = URL.createObjectURL.bind(URL);
      URL.createObjectURL = blob => {
        if (blob instanceof Blob && blob.type === 'text/javascript') {
          const prelude = `
            for (const key of ['withResolvers', 'try']) Object.defineProperty(Promise, key, { value: undefined, configurable: true, writable: true });
            globalThis.__pdfCompatibilityBefore = { withResolvers: typeof Promise.withResolvers, promiseTry: typeof Promise.try };
          `;
          return createObjectURL(new Blob([prelude, blob], { type: blob.type }));
        }
        return createObjectURL(blob);
      };
    });

    if (build === 'preview') {
      await page.goto('/');
    } else {
      // A blank document avoids loading the preview's PDF.js first, which could
      // otherwise mask an initialization-order failure in the shipped PCF bundle.
      await page.route('**/compatibility-host', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><div id="viewer"></div></body></html>' }));
      await page.goto('/compatibility-host');
      expect(await page.evaluate(() => typeof Reflect.get(Promise, 'withResolvers'))).toBe('undefined');
      await page.addStyleTag({ content: readFileSync('component/out/controls/PdfViewerWithHighlights/css/PdfViewer.css', 'utf8') });
      await page.addScriptTag({ content: readFileSync('component/out/controls/PdfViewerWithHighlights/bundle.js', 'utf8') });
      await page.evaluate(async () => {
        const globals = window as unknown as { Zengroq: { PdfViewerWithHighlights: new () => { init: (...args: unknown[]) => void; updateView: (context: unknown) => void } } };
        const control = new globals.Zengroq.PdfViewerWithHighlights();
        const fields = await (await fetch('/samples/fields.json')).json();
        const bytes = new Uint8Array(await (await fetch('/samples/fictional-invoice.pdf')).arrayBuffer());
        const context = { mode: { allocatedWidth: 650, allocatedHeight: 500, trackContainerResize: () => undefined }, parameters: {
          DocumentBase64: { raw: btoa(String.fromCharCode(...bytes)) }, SelectedFieldJson: { raw: JSON.stringify(fields[0].metadata) }, SelectedFieldName: { raw: 'Invoice total' },
        } };
        control.init(context, () => undefined, {}, document.querySelector('#viewer'));
        control.updateView(context);
      });
    }
    await expect(page.locator('.zengroq-pdf')).toHaveAttribute('data-rendered-page', '2');
    await expect(page.locator('rect')).toHaveClass('confidence-high');
    expect(await page.locator('.zengroq-pdf-page[data-page-number="2"] canvas').evaluate((canvas: HTMLCanvasElement) => {
      const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      let dark = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 100 && pixels[i + 1] < 150) dark++;
      return dark;
    })).toBeGreaterThan(1000);
    expect(await page.evaluate(() => ({ withResolvers: typeof Reflect.get(Promise, 'withResolvers'), promiseTry: typeof Reflect.get(Promise, 'try') })))
      .toEqual({ withResolvers: 'function', promiseTry: 'function' });
    expect(workers).toHaveLength(1);
    expect(await workers[0].evaluate(() => ({
      before: Reflect.get(globalThis, '__pdfCompatibilityBefore'),
      after: { withResolvers: typeof Reflect.get(Promise, 'withResolvers'), promiseTry: typeof Reflect.get(Promise, 'try') },
    }))).toEqual({
      before: { withResolvers: 'undefined', promiseTry: 'undefined' },
      after: { withResolvers: 'function', promiseTry: 'function' },
    });
    expect(errors).toEqual([]);
    expect(external).toEqual([]);
  });
}
