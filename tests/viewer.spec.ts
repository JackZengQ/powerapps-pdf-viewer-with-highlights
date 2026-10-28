import { test, expect, type Page } from '@playwright/test';
import { PDFDocument, degrees } from 'pdf-lib';
import { readFileSync, writeFileSync } from 'node:fs';

async function rendered(page: Page, number: number) {
  await expect(page.locator('.zengroq-pdf')).toHaveAttribute('data-rendered-page', String(number));
  await expect(page.locator(`.zengroq-pdf-page[data-page-number="${number}"] canvas`)).toBeVisible();
}
async function alignment(page: Page) {
  const result = await page.locator('.zengroq-pdf-page:has(rect)').evaluate(element => {
    const canvas = element.querySelector('canvas')!.getBoundingClientRect();
    const svg = element.querySelector('svg')!.getBoundingClientRect();
    const rect = element.querySelector('rect')!.getBoundingClientRect();
    return { width:canvas.width, height:canvas.height, svgWidth:svg.width, svgHeight:svg.height,
      x:(rect.x-canvas.x)/canvas.width,y:(rect.y-canvas.y)/canvas.height,w:rect.width/canvas.width,h:rect.height/canvas.height };
  });
  expect(result.svgWidth).toBeCloseTo(result.width,1);
  expect(result.svgHeight).toBeCloseTo(result.height,1);
  expect(result.x).toBeCloseTo(.8097,3); expect(result.y).toBeCloseTo(.6494,3);
  expect(result.w).toBeCloseTo(.117,3); expect(result.h).toBeCloseTo(.0215,3);
}
test('real PDF rendering, page selection, confidence, zoom, scroll and resize alignment', async ({page}) => {
  const errors: string[] = []; page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/'); await rendered(page,2);
  const canvas = page.locator('.zengroq-pdf-page[data-page-number="2"] canvas');
  writeFileSync('test-results/sample-page-2.png',Buffer.from(await canvas.evaluate((canvas:HTMLCanvasElement)=>canvas.toDataURL().split(',')[1]),'base64'));
  await expect(page.locator('rect')).toHaveClass('confidence-high');
  const region = await page.locator('.zengroq-pdf-scroll').boundingBox();
  const highlight = await page.locator('rect').boundingBox();
  expect(highlight!.y).toBeGreaterThanOrEqual(region!.y);
  expect(highlight!.y + highlight!.height).toBeLessThanOrEqual(region!.y + region!.height);
  expect(highlight!.x).toBeGreaterThanOrEqual(region!.x);
  expect(highlight!.x + highlight!.width).toBeLessThanOrEqual(region!.x + region!.width);
  // Non-white pixels prove PDF.js rendered document content rather than only a blank canvas.
  expect(await canvas.evaluate((canvas: HTMLCanvasElement) => {
    const pixels = canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data;
    let dark = 0; for(let i=0;i<pixels.length;i+=4) if(pixels[i]<100 && pixels[i+1]<150) dark++;
    return dark;
  })).toBeGreaterThan(1000);
  await alignment(page);
  const initialWidth = await canvas.evaluate(el=>el.getBoundingClientRect().width);
  await page.getByRole('button',{name:'Zoom in',exact:true}).click();
  await expect(page.getByText('125%',{exact:true})).toBeVisible();
  await expect.poll(()=>canvas.evaluate(el=>el.getBoundingClientRect().width)).toBeGreaterThan(initialWidth * 1.24);
  await alignment(page);
  await page.locator('.zengroq-pdf-scroll').evaluate(el=>{el.scrollTop=240;el.scrollLeft=90;}); await alignment(page);
  await page.locator('#viewer').evaluate(el=>{el.style.width='620px';el.style.height='500px';});
  await expect.poll(()=>canvas.evaluate(el=>el.getBoundingClientRect().width)).toBeLessThan(800);
  await alignment(page);
  await page.locator('#field').selectOption('1'); await rendered(page,1);
  writeFileSync('test-results/sample-page-1.png',Buffer.from(await page.locator('.zengroq-pdf-page[data-page-number="1"] canvas').evaluate((canvas:HTMLCanvasElement)=>canvas.toDataURL().split(',')[1]),'base64'));
  await expect(page.locator('rect')).toHaveClass('confidence-low');
  await page.getByRole('button',{name:'Next page',exact:true}).click(); await rendered(page,2);
  await expect(page.locator('.zengroq-pdf-page[data-page-number="2"] rect')).toHaveCount(0);
  await expect(page.locator('.zengroq-pdf-page[data-page-number="1"] rect')).toHaveCount(1);
  await page.locator('#field').selectOption('3'); await expect(page.locator('rect')).toHaveClass('confidence-low');
  await page.screenshot({path:'test-results/preview.png',fullPage:true}); expect(errors).toEqual([]);
});
test('metadata validation, missing location, invalid PDF and recovery',async({page})=>{
  await page.goto('/'); await rendered(page,2);
  await page.locator('#field').selectOption('2'); await expect(page.getByRole('status')).toBeEmpty(); await expect(page.locator('rect')).toHaveCount(0);
  for (const [metadata, message] of [
    ['{oops','not valid JSON'],['null','must be an object'],
    ['{"location":{"page":0}}','one-based'],
    ['{"location":{"page":1,"boundingBox":{"left":0.9,"top":0,"width":0.4,"height":0.2}}}','normalized'],
    ['{"location":{"page":99,"boundingBox":{"left":0,"top":0,"width":0.1,"height":0.1}}}','outside this document'],
  ]) { await page.locator('#metadata').fill(metadata); await page.getByRole('button',{name:'Apply metadata',exact:true}).click(); await expect(page.getByRole('status')).toContainText(message); await expect(page.locator('rect')).toHaveCount(0); }
  await page.getByRole('button',{name:'Test invalid PDF',exact:true}).click(); await expect(page.getByRole('status')).toContainText('Unable to open PDF');
  await page.getByRole('button',{name:'Restore sample',exact:true}).click(); await rendered(page,2); await expect(page.locator('rect')).toHaveCount(1);
});
test('document identity caching, data URL, races and destroy', async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/'); await rendered(page,2);
  const result = await page.evaluate(async()=>{
    const {PdfViewer} = await import('/component/PdfViewerWithHighlights/viewer.ts');
    const fields = await (await fetch('/samples/fields.json')).json();
    const bytes = new Uint8Array(await (await fetch('/samples/fictional-invoice.pdf')).arrayBuffer());
    const content = btoa(String.fromCharCode(...bytes));
    const host=document.createElement('div');host.style.cssText='width:600px;height:500px';document.body.append(host);
    const viewer = new PdfViewer(host);
    let created = 0; const original = URL.createObjectURL; URL.createObjectURL=(blob)=>{created++;return original(blob);};
    viewer.update(content,JSON.stringify(fields[0].metadata),'Total');
    await new Promise<void>((resolve,reject)=>{const start=Date.now();const check=()=>{if(host.querySelector('[data-rendered-page="2"]'))resolve();else if(Date.now()-start>10000)reject(new Error('render timeout'));else setTimeout(check,20);};check();});
    viewer.update('data:application/pdf;base64,'+content,JSON.stringify(fields[1].metadata),'Customer');
    await new Promise(resolve=>setTimeout(resolve,200));
    const loads=created;
    viewer.update(btoa('%PDF-invalid'),'{','Bad'); const clearedBeforeNextUpdate=!host.querySelector('[data-rendered-page]'); viewer.update(content,JSON.stringify(fields[0].metadata),'Total');
    viewer.destroy(); await new Promise(resolve=>setTimeout(resolve,200));
    URL.createObjectURL=original; const remaining=host.childElementCount;host.remove();return {loads,remaining,clearedBeforeNextUpdate};
  });
  expect(result).toEqual({loads:1,remaining:0,clearedBeforeNextUpdate:true});
  expect(errors).toEqual([]);
});
test('rotated pages fail usefully and unrotated pages remain available', async({page})=>{
  const pdf=await PDFDocument.load(readFileSync('samples/fictional-invoice.pdf'));
  pdf.getPage(1).setRotation(degrees(90));
  await page.goto('/'); await rendered(page,2);
  await page.locator('#file').setInputFiles({name:'rotated.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});
  await expect(page.getByRole('status')).toContainText('Rotated PDF pages are not supported');
  await expect(page.locator('.zengroq-pdf-page[data-page-number="2"] canvas')).toHaveCount(0);
  await page.getByRole('button',{name:'Previous page',exact:true}).click();await rendered(page,1);
  await expect(page.getByRole('status')).not.toContainText('Rotated PDF');
});
test('production PCF bundle renders via adapter with no external requests',async({page})=>{
  const errors:string[]=[]; const external:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:5173/'))external.push(request.url());});
  await page.goto('/'); await rendered(page,2);
  // Inject the shipped bytes directly so Vite cannot rewrite the compiled bundle.
  await page.addScriptTag({content:readFileSync('component/out/controls/PdfViewerWithHighlights/bundle.js','utf8')});
  await page.evaluate(async()=>{
    const host=document.createElement('div');host.id='production-host';document.body.append(host);
    const globals=window as unknown as {Zengroq:{PdfViewerWithHighlights:new()=>{init:(...args:unknown[])=>void;updateView:(context:unknown)=>void;destroy:()=>void}}};
    const control=new globals.Zengroq.PdfViewerWithHighlights();
    const fields=await(await fetch('/samples/fields.json')).json();
    const bytes=new Uint8Array(await(await fetch('/samples/fictional-invoice.pdf')).arrayBuffer());
    const context={mode:{allocatedWidth:650,allocatedHeight:500,trackContainerResize:()=>undefined},parameters:{DocumentBase64:{raw:btoa(String.fromCharCode(...bytes))},SelectedFieldJson:{raw:JSON.stringify(fields[0].metadata)},SelectedFieldName:{raw:'Invoice total'}}};
    control.init(context,()=>undefined,{},host);control.updateView(context);
    (window as unknown as {productionControl:typeof control}).productionControl=control;
  });
  await expect(page.locator('#production-host .zengroq-pdf')).toHaveAttribute('data-rendered-page','2');
  await expect(page.locator('#production-host rect')).toHaveClass('confidence-high');
  await page.evaluate(()=>{(window as unknown as {productionControl:{destroy:()=>void}}).productionControl.destroy();});
  await expect(page.locator('#production-host .zengroq-pdf')).toHaveCount(0);
  expect(errors).toEqual([]);expect(external).toEqual([]);
});
