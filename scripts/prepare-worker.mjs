import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const target = 'component/PdfViewerWithHighlights';
await mkdir(target, { recursive: true });
const packageRoot = 'node_modules/pdfjs-dist';
const { version } = JSON.parse(await readFile(`${packageRoot}/package.json`, 'utf8'));
const { dependencies } = JSON.parse(await readFile('package.json', 'utf8'));
if (dependencies['pdfjs-dist'] !== version) throw new Error('Installed PDF.js must match the exact pinned package version. Run npm ci.');
const api = await readFile(`${packageRoot}/legacy/build/pdf.mjs`, 'utf8');
const worker = await readFile(`${packageRoot}/legacy/build/pdf.worker.mjs`, 'utf8');
// Both artifacts must come from the same installed release, and retain the
// compatibility preambles before any PDF.js code can use newer Promise APIs.
for (const [name, source] of [['API', api], ['worker', worker]]) {
  if (!source.includes(`pdfjsVersion = ${version}`)) throw new Error(`PDF.js ${name} version does not match ${version}.`);
  for (const polyfill of ['es.promise.with-resolvers.js', 'es.promise.try.js']) {
    if (!source.includes(polyfill)) throw new Error(`Legacy PDF.js ${name} is missing ${polyfill}. Review runtime compatibility before upgrading.`);
  }
  if (!source.includes('core-js/blob/v3.47.0/LICENSE')) throw new Error(`Review the bundled core-js license version for the ${name}.`);
}
await writeFile(`${target}/workerSource.ts`, `// Generated from pdfjs-dist ${version}/legacy/build/pdf.worker.mjs. Do not edit.\nexport const workerSource: string = ${JSON.stringify(worker)};\n`);
const license = await readFile('node_modules/pdfjs-dist/LICENSE', 'utf8');
const coreJsLicense = await readFile('licenses/core-js/LICENSE', 'utf8');
await mkdir(`${target}/strings`, { recursive: true });
const escapeXml = value => value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
await writeFile(`${target}/strings/PdfViewer.1033.resx`, `<?xml version="1.0" encoding="utf-8"?>\n<root>\n<resheader name="resmimetype"><value>text/microsoft-resx</value></resheader>\n<resheader name="version"><value>2.0</value></resheader>\n<resheader name="reader"><value>System.Resources.ResXResourceReader, System.Windows.Forms</value></resheader>\n<resheader name="writer"><value>System.Resources.ResXResourceWriter, System.Windows.Forms</value></resheader>\n<data name="ThirdPartyNotices" xml:space="preserve"><value>${escapeXml(`PDF.js ${version} legacy API and worker - Copyright 2024 Mozilla Foundation. Bundled without modifications.\n\n${license}\n\nBundled core-js 3.47.0 polyfills (MIT):\n\n${coreJsLicense}`)}</value></data>\n</root>\n`);
await mkdir('licenses/pdfjs-dist', { recursive: true });
for (const file of ['LICENSE', 'NOTICE']) {
  try { await copyFile(`node_modules/pdfjs-dist/${file}`, `licenses/pdfjs-dist/${file}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
