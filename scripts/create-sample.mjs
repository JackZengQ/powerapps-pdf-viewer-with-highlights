import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { mkdir, writeFile } from 'node:fs/promises';
const pdf = await PDFDocument.create();
pdf.setTitle('Fictional invoice - preview test');
pdf.setAuthor('Zengroq fictional samples');
const regular = await pdf.embedFont(StandardFonts.Helvetica);
const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
for (let number = 1; number <= 2; number++) {
  const page = pdf.addPage([1000, 1200]);
  const text = (value, x, top, size = 18, font = regular) => page.drawText(value, { x, y: 1200 - top - size, size, font, color: rgb(.08,.16,.22) });
  text('NORTHSTAR PAPERWORK', 60, 60, 30, bold);
  text('FICTIONAL SAMPLE - NOT A REAL INVOICE', 60, 110, 16);
  text(`Invoice NS-FICTION-2048 | Page ${number} of 2`, 60, 160);
  page.drawLine({ start: {x:60,y:990}, end:{x:940,y:990}, thickness:2,color:rgb(.2,.5,.6) });
  if (number === 1) {
    text('Bill to: Imaginary Orchard Studio', 60, 260, 24);
    text('100 Example Avenue, Fable City', 60, 310);
    text('Description                                  Quantity          Amount', 60, 420, 20, bold);
    text('Fictional design materials                  40              $4,000.00', 60, 490);
    text('Fictional review services                    32              $4,240.00', 60, 550);
    text('Payment summary appears on page 2.', 60, 760);
  } else {
    text('Payment summary', 60, 260, 26, bold);
    text('Account reference: DEMO-ONLY-123', 60, 340);
    text('Terms: No payment required. Test document only.', 60, 400);
    text('Total due', 630, 779.28, 18, bold);
    // Matches the user-supplied normalized coordinates exactly.
    text('$8,240.00', 809.7, 779.28, 22, bold);
    text('All organizations, addresses, and amounts are fictional.', 60, 1000, 16);
  }
  text('Zengroq PDF viewer testing fixture', 60, 1120, 14);
}
await mkdir('samples', {recursive:true});
await writeFile('samples/fictional-invoice.pdf', await pdf.save());
const fields = [
  {name:'Invoice total',metadata:{valueText:'$8,240.00',confidence:.943,location:{page:2,boundingBox:{left:.8097,top:.6494,width:.117,height:.0215}}}},
  {name:'Customer',metadata:{valueText:'Imaginary Orchard Studio',confidence:.87,location:{page:1,boundingBox:{left:.06,top:.2167,width:.56,height:.025}}}},
  {name:'Unlocated field',metadata:{valueText:'No location',confidence:.92}},
  {name:'Threshold confidence',metadata:{valueText:'$8,240.00',confidence:.9,location:{page:2,boundingBox:{left:.8097,top:.6494,width:.117,height:.0215}}}}
];
await writeFile('samples/fields.json', JSON.stringify(fields,null,2)+'\n');
