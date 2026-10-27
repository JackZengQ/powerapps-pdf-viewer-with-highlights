import { PdfViewer } from '../component/PdfViewerWithHighlights/viewer';
import '../component/PdfViewerWithHighlights/css/PdfViewer.css';
import './preview.css';
import fields from '../samples/fields.json';
const viewer = new PdfViewer(document.querySelector('#viewer')!);
const metadata = document.querySelector<HTMLTextAreaElement>('#metadata')!;
const name = document.querySelector<HTMLInputElement>('#name')!;
const select = document.querySelector<HTMLSelectElement>('#field')!;
let content = '';
for (const [index, field] of fields.entries()) select.add(new Option(field.name, String(index)));
function apply() { viewer.update(content, metadata.value, name.value); }
function selectField() { const field = fields[Number(select.value)]; metadata.value = JSON.stringify(field.metadata,null,2); name.value = field.name; apply(); }
async function restore() {
  const response = await fetch('/samples/fictional-invoice.pdf');
  content = btoa(String.fromCharCode(...new Uint8Array(await response.arrayBuffer())));
  select.value = '0'; selectField();
}
select.onchange = selectField;
document.querySelector<HTMLButtonElement>('#apply')!.onclick = apply;
document.querySelector<HTMLButtonElement>('#restore')!.onclick = () => { void restore(); };
document.querySelector<HTMLButtonElement>('#invalid-pdf')!.onclick = () => { content = btoa('%PDF-broken'); apply(); };
document.querySelector<HTMLInputElement>('#file')!.onchange = event => {
  const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return;
  const reader = new FileReader(); reader.onload = () => { content = String(reader.result); apply(); }; reader.readAsDataURL(file);
};
window.addEventListener('pagehide', () => viewer.destroy(), {once:true});
void restore();
