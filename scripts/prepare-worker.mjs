import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const target = 'component/PdfViewerWithHighlights';
await mkdir(target, { recursive: true });
const worker = await readFile('node_modules/pdfjs-dist/build/pdf.worker.mjs', 'utf8');
await writeFile(`${target}/workerSource.ts`, `// Generated from the pinned pdfjs-dist dependency. Do not edit.\nexport const workerSource: string = ${JSON.stringify(worker)};\n`);
const license = await readFile('node_modules/pdfjs-dist/LICENSE', 'utf8');
await mkdir(`${target}/strings`, { recursive: true });
const escapeXml = value => value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
await writeFile(`${target}/strings/PdfViewer.1033.resx`, `<?xml version="1.0" encoding="utf-8"?>\n<root>\n<resheader name="resmimetype"><value>text/microsoft-resx</value></resheader>\n<resheader name="version"><value>2.0</value></resheader>\n<resheader name="reader"><value>System.Resources.ResXResourceReader, System.Windows.Forms</value></resheader>\n<resheader name="writer"><value>System.Resources.ResXResourceWriter, System.Windows.Forms</value></resheader>\n<data name="ThirdPartyNotices" xml:space="preserve"><value>${escapeXml('PDF.js 5.4.624 - Copyright 2024 Mozilla Foundation. Bundled without modifications.\n\n'+license)}</value></data>\n</root>\n`);
await mkdir('licenses/pdfjs-dist', { recursive: true });
for (const file of ['LICENSE', 'NOTICE']) {
  try { await copyFile(`node_modules/pdfjs-dist/${file}`, `licenses/pdfjs-dist/${file}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
